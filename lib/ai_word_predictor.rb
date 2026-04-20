# frozen_string_literal: true

module AiWordPredictor
  # Use fast/cheap models — predictions need to feel instant
  DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'
  DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'

  # In-memory LRU cache: { "context_key" => { words: [...], ts: Time } }
  CACHE = {}
  CACHE_MAX = 500
  CACHE_TTL = 1800 # 30 minutes — aggressive caching for free-tier rate limits

  class << self
    # Returns an array of predicted next-word strings (up to `count`).
    # sentence: the words the user has built so far, e.g. "I want to"
    # locale: language code, default "en"
    # count: how many predictions to return (default 4)
    def predict(sentence:, locale: 'en', count: 4)
      return [] if sentence.blank?

      api_config = resolve_api_config
      return [] if api_config.blank?

      cache_key = "#{locale}:#{sentence.strip.downcase}"
      cached = CACHE[cache_key]
      if cached && (Time.now - cached[:ts]) < CACHE_TTL
        return cached[:words]
      end

      words = case api_config[:provider]
              when :claude
                call_anthropic(api_config, sentence.strip, locale, count)
              when :gemini
                call_gemini(api_config, sentence.strip, locale, count)
              else
                []
              end

      # Store in cache, evict oldest if full
      if CACHE.size >= CACHE_MAX
        oldest_key = CACHE.min_by { |_k, v| v[:ts] }&.first
        CACHE.delete(oldest_key) if oldest_key
      end
      CACHE[cache_key] = { words: words, ts: Time.now }

      words
    rescue => e
      Rails.logger.error("[AiWordPredictor] #{e.class}: #{e.message}")
      []
    end

    private

    def resolve_api_config
      anthropic_key = ENV['ANTHROPIC_API_KEY'].to_s.strip
      if anthropic_key.present?
        return {
          provider: :claude,
          api_key: anthropic_key,
          model: ENV.fetch('ANTHROPIC_MODEL', DEFAULT_ANTHROPIC_MODEL)
        }
      end
      gemini_key = ENV['GEMINI_API_KEY'].to_s.strip
      if gemini_key.present?
        return {
          provider: :gemini,
          api_key: gemini_key,
          model: ENV.fetch('GEMINI_MODEL', DEFAULT_GEMINI_MODEL)
        }
      end
      nil
    end

    def call_anthropic(config, sentence, locale, count)
      require 'anthropic'
      client = Anthropic::Client.new(api_key: config[:api_key])
      response = client.messages.create(
        model: config[:model],
        max_tokens: 60,
        system: system_prompt(locale, count),
        messages: [{ role: 'user', content: sentence }]
      )
      raw = response.dig('content', 0, 'text') || ''
      parse_words(raw, count)
    end

    def call_gemini(config, sentence, locale, count)
      require 'openai'
      client = OpenAI::Client.new(
        access_token: config[:api_key],
        uri_base: 'https://generativelanguage.googleapis.com/v1beta/openai/'
      )
      response = client.chat(
        parameters: {
          model: config[:model],
          messages: [
            { role: 'system', content: system_prompt(locale, count) },
            { role: 'user', content: sentence }
          ],
          max_tokens: 60,
          temperature: 0.3
        }
      )
      raw = response.dig('choices', 0, 'message', 'content') || ''
      parse_words(raw, count)
    end

    def system_prompt(locale, count)
      <<~PROMPT
        You are a word-prediction engine for an AAC (Augmentative and Alternative Communication) app. The user is building a sentence word by word.

        Given the sentence so far, predict the #{count} most likely next words.

        Rules:
        - Return ONLY #{count} words separated by commas, nothing else
        - Words should be simple, common, everyday vocabulary
        - Predictions should be contextually appropriate for the sentence
        - Prefer short, high-frequency words that AAC users commonly need
        - Language: #{locale}
        - No punctuation, no explanations, no numbering — just the words
        - If the sentence ends mid-word, complete that word first, then predict next words
        - ALWAYS return #{count} words, even if the sentence seems complete — suggest continuation words like conjunctions (and, but, because), time words (today, tomorrow, now), or new sentence starters (I, we, can)

        Example input: "I want to"
        Example output: play,go,eat,help

        Example input: "I want to play baseball with my friends"
        Example output: today,and,because,after
      PROMPT
    end

    def parse_words(raw, count)
      raw.strip
         .split(/[\s,]+/)
         .map { |w| w.gsub(/[^a-zA-Z'\-]/, '').strip }
         .reject(&:blank?)
         .uniq
         .first(count)
    end
  end
end
