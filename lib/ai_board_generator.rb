# frozen_string_literal: true

require 'openai'
require_relative 'pii_scrubber'

module AiBoardGenerator
  class << self
    # Generates word labels, suggested name, and description for an AAC board using an LLM.
    # Supports GEMINI_API_KEY (Gemini) or OPENAI_API_KEY (OpenAI).
    # Returns { words: [...], name: "...", description: "...", error: nil } on success,
    # or { words: nil, name: nil, description: nil, error: "..." } on failure.
    # include_core_words: when true, mix 40-60% core vocabulary with topic-specific; when false, topic-specific only.
    # user: optional User object for audit logging
    def generate_words(prompt:, rows:, columns:, locale: 'en', include_core_words: true, user: nil)
      gemini_key = ENV['GEMINI_API_KEY'].to_s.strip
      openai_key = ENV['OPENAI_API_KEY'].to_s.strip
      use_gemini = gemini_key.present?
      api_key = use_gemini ? gemini_key : openai_key
      if api_key.blank?
        return { words: nil, name: nil, description: nil, error: 'AI board generation is not configured' }
      end

      # Check org-level AI opt-out (FERPA/HIPAA compliance)
      if defined?(FeatureFlags) && !FeatureFlags.ai_feature_enabled_for?('ai_board_generation', user)
        return { words: nil, name: nil, description: nil, error: 'AI features are disabled for this organization' }
      end

      cell_count = rows * columns

      # PII scrub the user prompt before sending to AI
      scrub_result = PiiScrubber.redact_for_ai(prompt)
      scrubbed_prompt = scrub_result[:payload]
      pii_detected = scrub_result[:pii_found]

      system_prompt = <<~PROMPT.strip
        You are an AAC (Augmentative and Alternative Communication) vocabulary expert.
        CRITICAL: You MUST output exactly the requested number of words—count them before responding.
        Output in this exact format:
        WORDS: word1, word2, word3, ... (comma-separated, all on one line)
        NAME: Short 2-5 word title only (e.g. "Grinch Christmas Board", "Breakfast Core Words")—NOT a sentence
        DESCRIPTION: One clear sentence
      PROMPT

      vocabulary_instruction = if include_core_words
        'Include 40-60% high-frequency core words (e.g. I, want, go, more, stop, like, not, help, do, is, it, the, my, turn, fast, slow, yes, no, you) and the rest topic-specific vocabulary from the context.'
      else
        'Focus on topic-specific vocabulary only: nouns, topic verbs, descriptors, and phrases unique to that context. Do NOT include generic core words like I, want, go, more, help, yes, no.'
      end
      user_prompt = <<~PROMPT.strip
        Generate exactly #{cell_count} words for an AAC board. CRITICAL: Output exactly #{cell_count} comma-separated words after WORDS: —no more, no fewer. Count to verify.
        Context: #{scrubbed_prompt}
        Language: #{locale}
        #{vocabulary_instruction}
        Format:
        WORDS: w1, w2, w3, ... w#{cell_count}
        NAME: Short title (2-5 words, e.g. "Grinch Christmas Board")
        DESCRIPTION: One sentence about the board's purpose.
      PROMPT

      client_options = { access_token: api_key }
      if use_gemini
        client_options[:uri_base] = 'https://generativelanguage.googleapis.com/v1beta/openai/'
      end
      provider = use_gemini ? 'gemini' : 'openai'
      model = use_gemini ? 'gemini-2.5-flash' : 'gpt-4o-mini'
      start_time = Process.clock_gettime(Process::CLOCK_MONOTONIC)

      begin
        client = OpenAI::Client.new(client_options)
        response = client.chat(
          parameters: {
            model: model,
            messages: [
              { role: 'system', content: system_prompt },
              { role: 'user', content: user_prompt }
            ],
            max_tokens: [1024, (cell_count * 4) + 150].max,
            temperature: 0.5
          }
        )
        duration_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - start_time) * 1000).round

        raw = extract_content(response)
        parsed = parse_structured_response(raw, cell_count)

        # Log the AI API call
        log_ai_call(
          provider: provider, model: model, user: user,
          request_summary: "Board generation: #{scrubbed_prompt.truncate(200)}",
          response_summary: raw.truncate(500),
          tokens_sent: response.dig('usage', 'prompt_tokens'),
          tokens_received: response.dig('usage', 'completion_tokens'),
          duration_ms: duration_ms,
          pii_detected: pii_detected,
          pii_findings: scrub_result[:findings],
          success: parsed.present?
        )

        return { words: nil, name: nil, description: nil, error: 'Could not parse AI response' } unless parsed

        words = parsed[:words]
        if words.length < (cell_count / 2)
          return { words: nil, name: nil, description: nil, error: 'Could not parse AI response' }
        end
        {
          words: words.first(cell_count),
          name: parsed[:name].presence,
          description: parsed[:description].presence,
          error: nil
        }
      rescue Faraday::Error => e
        duration_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - start_time) * 1000).round
        log_ai_call(
          provider: provider, model: model, user: user,
          request_summary: "Board generation: #{scrubbed_prompt.truncate(200)}",
          response_summary: nil, duration_ms: duration_ms,
          pii_detected: pii_detected, pii_findings: scrub_result[:findings],
          success: false, error_message: e.message
        )
        Rails.logger.error "AiBoardGenerator LLM error: #{e.message}"
        { words: nil, name: nil, description: nil, error: 'AI service unavailable. Please try again later.' }
      rescue StandardError => e
        duration_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - start_time) * 1000).round
        log_ai_call(
          provider: provider, model: model, user: user,
          request_summary: "Board generation: #{scrubbed_prompt.truncate(200)}",
          response_summary: nil, duration_ms: duration_ms,
          pii_detected: pii_detected, pii_findings: scrub_result[:findings],
          success: false, error_message: "#{e.class}: #{e.message}"
        )
        Rails.logger.error "AiBoardGenerator error: #{e.class}: #{e.message}"
        { words: nil, name: nil, description: nil, error: 'Generation failed' }
      end
    end

    private

    def parse_structured_response(raw, expected_count)
      return nil if raw.blank?

      name = nil
      description = nil
      words_str = nil
      accumulating = nil # :words, :name, or :description

      raw.split(/\n/).each do |line|
        line_stripped = line.strip
        next if line_stripped.blank?

        if line_stripped =~ /\Awords:\s*(.*)\z/i
          words_str = ::Regexp.last_match(1).strip
          accumulating = :words
        elsif line_stripped =~ /\Aname:\s*(.*)\z/i
          name = ::Regexp.last_match(1).strip
          accumulating = :name
        elsif line_stripped =~ /\Adescription:\s*(.*)\z/i
          description = ::Regexp.last_match(1).strip
          accumulating = :description
        elsif accumulating == :words
          words_str = [words_str, line_stripped].compact.join(', ')
        elsif accumulating == :name && name
          name = "#{name} #{line_stripped}".strip
        elsif accumulating == :description && description
          description = "#{description} #{line_stripped}".strip
        end
      end

      # Fallback: treat whole response as words if no structured format found
      words_str = raw if words_str.blank? && !raw.include?('NAME:') && !raw.include?('DESCRIPTION:')
      words = parse_words(words_str || raw, expected_count)
      return nil if words.length < (expected_count / 2)

      { words: words, name: name.presence, description: description.presence }
    end

    def extract_content(response)
      return '' unless response.is_a?(Hash)
      msg = response.dig('choices', 0, 'message', 'content')
      msg.to_s.strip
    end

    def parse_words(raw, expected_count)
      return [] if raw.blank?
      # Split on comma, newline, or semicolon; trim and filter blanks
      words = raw.split(/[,\n;]+/).map(&:strip).reject(&:blank?)
      # If we got fewer words than expected, try concatenating word-list lines (exclude NAME:/DESCRIPTION:)
      if words.length < expected_count && raw.include?(',')
        lines = raw.split(/\n/).map(&:strip).reject(&:blank?)
        list_lines = lines.select { |l| l.include?(',') && l !~ /\A(name|description):/i }
        combined = list_lines.join(', ')
        combined_words = combined.split(/[,;]+/).map(&:strip).reject(&:blank?)
        words = combined_words if combined_words.length > words.length
      end
      words
    end

    def log_ai_call(provider:, model:, user:, request_summary:, response_summary:,
                    tokens_sent: nil, tokens_received: nil, duration_ms: nil,
                    pii_detected: false, pii_findings: [], success: true, error_message: nil)
      return unless defined?(AiApiLog)
      AiApiLog.log_ai_call(
        provider: provider,
        model: model,
        type: 'board_generation',
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
        feature_flag: 'ai_board_generation'
      )
    rescue StandardError => e
      Rails.logger.warn "AiBoardGenerator: failed to log AI API call: #{e.message}"
    end
  end
end
