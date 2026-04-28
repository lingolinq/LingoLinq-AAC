# frozen_string_literal: true

require_relative 'pii_scrubber'

module AiWordPredictor
  # Use fast/cheap models -- predictions need to feel instant
  DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'
  DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'

  # In-memory LRU cache: { "context_key" => { words: [...], ts: Time } }
  CACHE = {}
  CACHE_MAX = 500
  CACHE_TTL = 1800 # 30 minutes -- aggressive caching for free-tier rate limits

  class << self
    # Returns an array of predicted next-word strings (up to `count`).
    # sentence: the words the user has built so far, e.g. "I want to"
    # locale: language code, default "en"
    # count: how many predictions to return (default 4)
    # user: User object. Required for production calls so we can apply
    #   the org AI opt-out, the COPPA Final Rule consent gate, and audit
    #   logging. Pass nil only from offline scripts that supply no user
    #   data (e.g., the n-gram seed generator).
    def predict(sentence:, locale: 'en', count: 4, user: nil)
      return [] if sentence.blank?

      api_config = resolve_api_config
      return [] if api_config.blank?

      # Org-level AI opt-out and per-user feature flag.
      return [] if user && !FeatureFlags.ai_feature_enabled_for?('ai_word_prediction', user)

      # COPPA Final Rule hard-gate: block under-13 users awaiting parental consent.
      return [] if FeatureFlags.coppa_blocks_ai_for?(user)

      cache_key = "#{locale}:#{sentence.strip.downcase}"
      cached = CACHE[cache_key]
      if cached && (Time.now - cached[:ts]) < CACHE_TTL
        return cached[:words]
      end

      # Configure blocklist with the user's name so it cannot leak verbatim.
      if user
        names = []
        names << user.user_name if user.respond_to?(:user_name) && user.user_name.present?
        if user.respond_to?(:settings) && user.settings.is_a?(Hash) && user.settings['full_name'].present?
          names << user.settings['full_name']
        end
        PiiScrubber.configure_blocklist(names)
      end

      # Last-line-of-defense PII scrub on the user-typed sentence.
      scrub_result = PiiScrubber.redact_for_ai(sentence.strip)
      scrubbed_sentence = scrub_result[:payload]
      pii_detected = scrub_result[:pii_found]
      pii_findings = scrub_result[:findings]

      start_time = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      provider = api_config[:provider]
      model = api_config[:model]
      raw_response = nil
      success = false
      error_message = nil
      tokens_sent = nil
      tokens_received = nil

      words = begin
        case provider
        when :claude
          response = call_anthropic(api_config, scrubbed_sentence, locale, count)
          raw_response = extract_content_anthropic(response)
          tokens_sent = response.usage&.input_tokens if response.respond_to?(:usage)
          tokens_received = response.usage&.output_tokens if response.respond_to?(:usage)
          success = true
          parse_words(raw_response, count)
        when :gemini
          response = call_gemini(api_config, scrubbed_sentence, locale, count)
          raw_response = response.dig('choices', 0, 'message', 'content') || ''
          tokens_sent = response.dig('usage', 'prompt_tokens')
          tokens_received = response.dig('usage', 'completion_tokens')
          success = true
          parse_words(raw_response, count)
        else
          []
        end
      rescue => e
        error_message = "#{e.class}: #{e.message}"
        Rails.logger.error("[AiWordPredictor] #{error_message}")
        []
      end

      duration_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - start_time) * 1000).round
      log_ai_call(
        provider: provider,
        model: model,
        user: user,
        request_summary: "Word prediction: #{scrubbed_sentence.truncate(200)}",
        response_summary: raw_response.to_s.truncate(500),
        tokens_sent: tokens_sent,
        tokens_received: tokens_received,
        duration_ms: duration_ms,
        pii_detected: pii_detected,
        pii_findings: pii_findings,
        success: success,
        error_message: error_message
      )

      # Store in cache, evict oldest if full
      if CACHE.size >= CACHE_MAX
        oldest_key = CACHE.min_by { |_k, v| v[:ts] }&.first
        CACHE.delete(oldest_key) if oldest_key
      end
      CACHE[cache_key] = { words: words, ts: Time.now }

      words
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
      client.messages.create(
        model: config[:model],
        max_tokens: 60,
        system: system_prompt(locale, count),
        messages: [{ role: 'user', content: sentence }]
      )
    end

    def call_gemini(config, sentence, locale, count)
      require 'openai'
      client = OpenAI::Client.new(
        access_token: config[:api_key],
        uri_base: 'https://generativelanguage.googleapis.com/v1beta/openai/'
      )
      client.chat(
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
        - No punctuation, no explanations, no numbering, just the words
        - If the sentence ends mid-word, complete that word first, then predict next words
        - ALWAYS return #{count} words, even if the sentence seems complete. Suggest continuation words like conjunctions (and, but, because), time words (today, tomorrow, now), or new sentence starters (I, we, can)

        Example input: "I want to"
        Example output: play,go,eat,help

        Example input: "I want to play baseball with my friends"
        Example output: today,and,because,after
      PROMPT
    end

    def parse_words(raw, count)
      raw.to_s.strip
         .split(/[\s,]+/)
         .map { |w| w.gsub(/[^a-zA-Z'\-]/, '').strip }
         .reject(&:blank?)
         .uniq
         .first(count)
    end

    def extract_content_anthropic(response)
      return '' unless response&.respond_to?(:content) && response.content.is_a?(Array)
      text_blocks = response.content.select { |block| block.respond_to?(:type) && block.type.to_s == 'text' }
      text_blocks.map { |b| b.respond_to?(:text) ? b.text : b.to_s }.join("\n").strip
    end

    def log_ai_call(provider:, model:, user:, request_summary:, response_summary:,
                    tokens_sent: nil, tokens_received: nil, duration_ms: nil,
                    pii_detected: false, pii_findings: [], success: true, error_message: nil)
      return unless defined?(AiApiLog)
      AiApiLog.log_ai_call(
        provider: provider.to_s,
        model: model,
        type: 'word_prediction',
        user: user,
        request_summary: request_summary,
        response_summary: response_summary,
        tokens_sent: tokens_sent,
        tokens_received: tokens_received,
        duration_ms: duration_ms,
        pii_detected: pii_detected,
        pii_findings: pii_findings,
        success: success,
        error_message: error_message,
        feature_flag: 'ai_word_prediction'
      )
    rescue StandardError => e
      Rails.logger.warn "AiWordPredictor: failed to log AI API call: #{e.message}"
    end
  end
end
