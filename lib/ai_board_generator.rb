# frozen_string_literal: true

require 'anthropic'
require 'openai'
require_relative 'pii_scrubber'

module AiBoardGenerator
  # Default model for board generation — Haiku is fast and cheap for structured output
  DEFAULT_MODEL = 'claude-haiku-4-5-20251001'
  GEMINI_MODEL = 'gemini-2.5-flash'

  class << self
    # Generates word labels, suggested name, and description for an AAC board using Claude or Gemini.
    # Prefers ANTHROPIC_API_KEY; falls back to GEMINI_API_KEY if Anthropic is not configured.
    # Returns { words: [...], name: "...", description: "...", error: nil } on success,
    # or { words: nil, name: nil, description: nil, error: "..." } on failure.
    # include_core_words: when true, mix 40-60% core vocabulary with topic-specific; when false, topic-specific only.
    # user: optional User object for audit logging and feature flag checks
    def generate_words(prompt:, rows:, columns:, locale: 'en', include_core_words: true, user: nil)
      api_config = resolve_api_config
      if api_config.blank?
        return { words: nil, name: nil, description: nil, error: 'AI board generation is not configured' }
      end

      # Check org-level AI opt-out (FERPA/HIPAA compliance)
      if defined?(FeatureFlags) && !FeatureFlags.ai_feature_enabled_for?('ai_board_generation', user)
        return { words: nil, name: nil, description: nil, error: 'AI features are disabled for this organization' }
      end

      cell_count = rows * columns

      # Configure blocklist with user names before scrubbing
      if user
        names = [user.user_name]
        names << user.settings['full_name'] if user.settings && user.settings['full_name']
        PiiScrubber.configure_blocklist(names)
      end

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

      provider = api_config[:provider]
      api_key = api_config[:api_key]
      model = api_config[:model]
      start_time = Process.clock_gettime(Process::CLOCK_MONOTONIC)

      begin
        if provider == :anthropic
          response = call_anthropic(api_key: api_key, model: model, system_prompt: system_prompt,
                                    user_prompt: user_prompt, cell_count: cell_count)
          raw = extract_content_anthropic(response)
        else
          response = call_gemini(api_key: api_key, model: model, system_prompt: system_prompt,
                                 user_prompt: user_prompt, cell_count: cell_count)
          raw = extract_content_openai(response)
        end

        raw = raw.to_s.delete("\uFEFF").strip  # Strip BOM and normalize
        raw = strip_markdown_code_fence(raw)   # Claude may wrap in ``` blocks
        parsed = parse_structured_response(raw, cell_count)

        duration_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - start_time) * 1000).round
        log_params = {
          provider: provider.to_s,
          model: model,
          user: user,
          request_summary: "Board generation: #{scrubbed_prompt.truncate(200)}",
          response_summary: raw.truncate(500),
          duration_ms: duration_ms,
          pii_detected: pii_detected,
          pii_findings: scrub_result[:findings],
          success: parsed.present?
        }
        if provider == :anthropic
          log_params[:tokens_sent] = response.usage&.input_tokens
          log_params[:tokens_received] = response.usage&.output_tokens
        else
          log_params[:tokens_sent] = response.dig('usage', 'prompt_tokens')
          log_params[:tokens_received] = response.dig('usage', 'completion_tokens')
        end
        log_ai_call(**log_params)

        unless parsed
          Rails.logger.warn "AiBoardGenerator parse failed. Raw response (first 500 chars): #{raw.to_s.truncate(500).inspect}"
          return parse_error_response(raw)
        end

        words = parsed[:words]
        if words.length < (cell_count / 2)
          return parse_error_response(raw)
        end
        {
          words: words.first(cell_count),
          name: parsed[:name].presence,
          description: parsed[:description].presence,
          error: nil
        }
      rescue Anthropic::Errors::APIError => e
        duration_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - start_time) * 1000).round
        log_ai_call(
          provider: provider.to_s,
          model: model,
          user: user,
          request_summary: "Board generation: #{scrubbed_prompt.truncate(200)}",
          response_summary: nil, duration_ms: duration_ms,
          pii_detected: pii_detected, pii_findings: scrub_result[:findings],
          success: false, error_message: e.message
        )
        Rails.logger.error "AiBoardGenerator Claude API error: #{e.message}"
        api_error_response('AI service unavailable. Please try again later.', e)
      rescue Faraday::Error => e
        duration_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - start_time) * 1000).round
        log_ai_call(
          provider: provider.to_s,
          model: model,
          user: user,
          request_summary: "Board generation: #{scrubbed_prompt.truncate(200)}",
          response_summary: nil, duration_ms: duration_ms,
          pii_detected: pii_detected, pii_findings: scrub_result[:findings],
          success: false, error_message: e.message
        )
        Rails.logger.error "AiBoardGenerator Gemini API error: #{e.message}"
        api_error_response('AI service unavailable. Please try again later.', e)
      rescue StandardError => e
        duration_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - start_time) * 1000).round
        log_ai_call(
          provider: provider.to_s,
          model: model,
          user: user,
          request_summary: "Board generation: #{scrubbed_prompt.truncate(200)}",
          response_summary: nil, duration_ms: duration_ms,
          pii_detected: pii_detected, pii_findings: scrub_result[:findings],
          success: false, error_message: "#{e.class}: #{e.message}"
        )
        Rails.logger.error "AiBoardGenerator error: #{e.class}: #{e.message}"
        api_error_response('Generation failed', e)
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

    def resolve_api_config
      anthropic_key = ENV['ANTHROPIC_API_KEY'].to_s.strip
      if anthropic_key.present?
        return {
          provider: :anthropic,
          api_key: anthropic_key,
          model: ENV.fetch('ANTHROPIC_MODEL', DEFAULT_MODEL)
        }
      end
      gemini_key = ENV['GEMINI_API_KEY'].to_s.strip
      if gemini_key.present?
        return {
          provider: :gemini,
          api_key: gemini_key,
          model: ENV.fetch('GEMINI_MODEL', GEMINI_MODEL)
        }
      end
      nil
    end

    def call_anthropic(api_key:, model:, system_prompt:, user_prompt:, cell_count:)
      client = Anthropic::Client.new(api_key: api_key)
      client.messages.create(
        model: model,
        max_tokens: [1024, (cell_count * 4) + 150].max,
        system: system_prompt,
        messages: [{ role: 'user', content: user_prompt }]
      )
    end

    def call_gemini(api_key:, model:, system_prompt:, user_prompt:, cell_count:)
      client = OpenAI::Client.new(
        access_token: api_key,
        uri_base: 'https://generativelanguage.googleapis.com/v1beta/openai/'
      )
      client.chat(
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
    end

    def extract_content_anthropic(response)
      return '' unless response&.content&.is_a?(Array)
      text_blocks = response.content.select { |block| block.type.to_s == 'text' }
      text_blocks.map { |b| b.respond_to?(:text) ? b.text : b.to_s }.join("\n").strip
    end

    def extract_content_openai(response)
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

    def strip_markdown_code_fence(raw)
      return raw if raw.blank?
      # Claude may wrap structured output in ``` ... ```; strip leading/trailing fence
      s = raw.strip
      s = s.sub(/\A```\w*\n?/, '').sub(/\n?```\z/, '') if s.start_with?('```')
      s.strip
    end

    def parse_error_response(raw)
      result = { words: nil, name: nil, description: nil, error: 'Could not parse AI response' }
      if Rails.env.development? && raw.present?
        result[:error_detail] = "Raw response (first 300 chars): #{raw.to_s.truncate(300).inspect}"
      end
      result
    end

    def api_error_response(message, exception)
      result = { words: nil, name: nil, description: nil, error: message }
      if Rails.env.development? && exception
        result[:error_detail] = "#{exception.class}: #{exception.message}"
      end
      result
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
