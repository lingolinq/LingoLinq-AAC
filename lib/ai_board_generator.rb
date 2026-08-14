# frozen_string_literal: true

require 'anthropic'
require 'set'
require_relative 'ai_client'
require_relative 'pii_scrubber'
require_relative 'art50_marker'
require_relative 'lingo_linq/article50_call_context'

module AiBoardGenerator
  # Default model for board generation — Haiku is fast and cheap for structured output
  # Bedrock model id (anthropic. prefix, bare alias) -- routes via AWS Bedrock (AiClient).
  DEFAULT_MODEL = 'anthropic.claude-haiku-4-5'

  class << self
    # Generates word labels, suggested name, and description for an AAC board using Claude.
    # Requires ANTHROPIC_API_KEY. The prior GEMINI_API_KEY fallback (Gemini Developer/AI-Studio
    # endpoint) was disabled 2026-07-09 -- its data-handling terms could not be confirmed adequate
    # for child data (see docs/legal/AI_DATA_SHARING_CONSENT.md section 2.2). A Vertex AI fallback
    # may replace this in a future change.
    # Returns { words: [...], name: "...", description: "...", error: nil } on success,
    # or { words: nil, name: nil, description: nil, error: "..." } on failure.
    # include_core_words: when true, mix 40-60% core vocabulary with topic-specific; when false, topic-specific only.
    # user: optional User object for audit logging and feature flag checks
    def generate_words(prompt:, rows:, columns:, locale: 'en', include_core_words: true, user: nil)
      # Consent gates run BEFORE resolve_api_config, and the order is load-bearing.
      # resolve_api_config calls AiClient.available?, which performs the
      # sts:GetCallerIdentity account assertion. A FAILED assertion re-probes every
      # 60s while holding a process-global mutex for up to 5s, so checking it first
      # made a COPPA-blocked or org-opted-out user wait on a network call before
      # being told no. These three gates are pure local reads; they decide whether
      # an AI call is permitted at all, which is logically upstream of whether the
      # credential is usable.

      # Check org-level AI opt-out (FERPA/HIPAA compliance)
      if !FeatureFlags.ai_feature_enabled_for?('ai_board_generation', user)
        err = { words: nil, name: nil, description: nil, error: 'AI features are disabled for this organization' }
        err.merge!(dev_diag(:org_ai_disabled,
          'FeatureFlags.ai_feature_enabled_for?("ai_board_generation", user) is false for this user/org.'))
        return err
      end

      # COPPA Final Rule hard-gate: block under-13 users awaiting parental consent.
      if FeatureFlags.coppa_blocks_ai_for?(user)
        err = { words: nil, name: nil, description: nil, error: 'AI features require parental consent for this account' }
        err.merge!(dev_diag(:coppa_consent_pending,
          'FeatureFlags.coppa_blocks_ai_for?(user) returned true. The user has settings["coppa"]["pending_parent_consent"] set without a parent_consent_granted_at timestamp.'))
        return err
      end

      # EU under-16 AI parental-consent hard-gate.
      if FeatureFlags.eu_under16_blocks_ai_for?(user)
        err = { words: nil, name: nil, description: nil, error: 'AI features require parental consent for this account' }
        err.merge!(dev_diag(:eu_ai_consent_pending,
          'FeatureFlags.eu_under16_blocks_ai_for?(user) returned true. The user is eu_under_16 without eu_ai_parental_consent_active.'))
        return err
      end

      api_config = resolve_api_config
      if api_config.blank?
        err = { words: nil, name: nil, description: nil, error: 'AI board generation is not configured' }
        err.merge!(dev_diag(:configuration,
          'Set BEDROCK_AWS_KEY and BEDROCK_AWS_SECRET (both -- a half pair is ignored), and ' \
          'BEDROCK_AWS_REGION or AWS_REGION, then restart Rails. If BEDROCK_EXPECTED_AWS_ACCOUNT ' \
          'is set, the credential must also resolve to that AWS account or AI stays closed; the ' \
          'preceding [AiClient] log line says which check failed. ANTHROPIC_API_KEY is NOT read ' \
          'at runtime -- AI egresses to Claude on AWS Bedrock, not api.anthropic.com. The ' \
          'GEMINI_API_KEY fallback is disabled -- see docs/legal/AI_DATA_SHARING_CONSENT.md section 2.2.'))
        return err
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
      region = api_config[:region]
      model = api_config[:model]
      start_time = Process.clock_gettime(Process::CLOCK_MONOTONIC)

      begin
        last_raw = nil
        last_response = nil
        last_payload = { words: [], name: nil, description: nil }

        2.times do |attempt|
          prompt_turn = attempt.zero? ? user_prompt : "#{user_prompt}#{board_retry_nudge(cell_count)}"
          last_response = call_anthropic(region: region, model: model, system_prompt: system_prompt,
                                         user_prompt: prompt_turn, cell_count: cell_count)

          raw = extract_content_anthropic(last_response)
          raw = raw.to_s.delete("\uFEFF").strip  # Strip BOM and normalize
          raw = strip_markdown_code_fence(raw)   # Claude may wrap in ``` blocks
          last_raw = raw
          last_payload = structured_parse_payload(raw, cell_count)
          words = last_payload[:words]

          if words.length >= cell_count
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
              success: true
            }
            log_params[:tokens_sent] = last_response.usage&.input_tokens
            log_params[:tokens_received] = last_response.usage&.output_tokens
            # EU AI Act Article 50(2): mark the board-generation output. The marking
            # is NOT feature-flag-gated (only the Article 50(1) disclosure is); within
            # this path every successful AI output is marked. SCOPE: this slice marks
            # board generation only. Other AI-output surfaces are NOT yet marked and are
            # tracked follow-up: generate_focus_words (below; persists via AiFocusWordSet
            # cache), AiWordPredictor.predict, eval narration, AiPredictionGenerator.
            # Durable persistence of this marker (board.settings + relinking copy_for)
            # is also follow-up; see boards_controller#generate_labels. Until those land,
            # do not record the Article 50(2) obligation as closed.
            # ai_generated_content_id is a best-effort link to this output's AiApiLog
            # row; under alert-but-continue an audit-write failure is alerted (loud) but
            # the marker is still returned, so a valid marker does not by itself prove a
            # persisted audit row.
            marker = Art50Marker.build(provider: provider.to_s, model: model)
            log_params[:ai_content_marked] = true
            log_params[:ai_generated_content_id] = marker['content_id']
            log_ai_call(**log_params)
            return {
              words: words.first(cell_count),
              name: last_payload[:name].presence,
              description: last_payload[:description].presence,
              ai_generated: marker,
              error: nil
            }
          end

          break if attempt == 1
        end

        duration_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - start_time) * 1000).round
        wc = last_payload[:words].length
        Rails.logger.warn "AiBoardGenerator parse/shortfall (wc=#{wc}, cells=#{cell_count}, raw_len=#{last_raw.to_s.length})"
        log_params = {
          provider: provider.to_s,
          model: model,
          user: user,
          request_summary: "Board generation: #{scrubbed_prompt.truncate(200)}",
          response_summary: last_raw.to_s.truncate(500),
          duration_ms: duration_ms,
          pii_detected: pii_detected,
          pii_findings: scrub_result[:findings],
          success: false
        }
        if last_response
          log_params[:tokens_sent] = last_response.usage&.input_tokens
          log_params[:tokens_received] = last_response.usage&.output_tokens
        end
        log_ai_call(**log_params)

        return parse_shortfall_response(last_raw, cell_count, wc)
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
        api_error_response('AI service unavailable. Please try again later.', e,
          kind: :anthropic_api, provider: provider, model: model)
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
        Rails.logger.error "AiBoardGenerator API HTTP error: #{e.message}"
        api_error_response('AI service unavailable. Please try again later.', e,
          kind: :api_http, provider: provider, model: model)
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
        api_error_response('Generation failed', e, kind: :unexpected, provider: provider, model: model)
      end
    end

    # Generates a reusable focus-word list for highlighting words on an existing AAC board.
    # Returns { words: [...], title: "...", error: nil } on success.
    def generate_focus_words(prompt:, word_count:, locale: 'en', include_core_words: true, user: nil, existing_words: [])
      requested_count = [[word_count.to_i, 5].max, 50].min
      existing_words = parse_words(Array(existing_words).join(', '), requested_count).uniq { |w| w.downcase }
      missing_count = [requested_count - existing_words.length, 0].max
      return { words: [], title: nil, error: nil } if missing_count.zero?

      # Consent gates before resolve_api_config -- see the note in generate_words.
      if !FeatureFlags.ai_feature_enabled_for?('ai_board_generation', user)
        err = { words: nil, title: nil, error: 'AI features are disabled for this organization' }
        err.merge!(dev_diag(:org_ai_disabled,
          'FeatureFlags.ai_feature_enabled_for?("ai_board_generation", user) is false for this user/org.'))
        return err
      end

      if FeatureFlags.coppa_blocks_ai_for?(user)
        err = { words: nil, title: nil, error: 'AI features require parental consent for this account' }
        err.merge!(dev_diag(:coppa_consent_pending,
          'FeatureFlags.coppa_blocks_ai_for?(user) returned true. The user has settings["coppa"]["pending_parent_consent"] set without a parent_consent_granted_at timestamp.'))
        return err
      end

      if FeatureFlags.eu_under16_blocks_ai_for?(user)
        err = { words: nil, title: nil, error: 'AI features require parental consent for this account' }
        err.merge!(dev_diag(:eu_ai_consent_pending,
          'FeatureFlags.eu_under16_blocks_ai_for?(user) returned true. The user is eu_under_16 without eu_ai_parental_consent_active.'))
        return err
      end

      api_config = resolve_api_config
      if api_config.blank?
        err = { words: nil, title: nil, error: 'AI board generation is not configured' }
        err.merge!(dev_diag(:configuration,
          'Set BEDROCK_AWS_KEY and BEDROCK_AWS_SECRET (both -- a half pair is ignored), and ' \
          'BEDROCK_AWS_REGION or AWS_REGION, then restart Rails. If BEDROCK_EXPECTED_AWS_ACCOUNT ' \
          'is set, the credential must also resolve to that AWS account or AI stays closed; the ' \
          'preceding [AiClient] log line says which check failed. ANTHROPIC_API_KEY is NOT read ' \
          'at runtime -- AI egresses to Claude on AWS Bedrock, not api.anthropic.com. The ' \
          'GEMINI_API_KEY fallback is disabled -- see docs/legal/AI_DATA_SHARING_CONSENT.md section 2.2.'))
        return err
      end

      if user
        names = [user.user_name]
        names << user.settings['full_name'] if user.settings && user.settings['full_name']
        PiiScrubber.configure_blocklist(names)
      end

      scrub_result = PiiScrubber.redact_for_ai(prompt)
      scrubbed_prompt = scrub_result[:payload]
      pii_detected = scrub_result[:pii_found]

      system_prompt = <<~PROMPT.strip
        You are an AAC (Augmentative and Alternative Communication) vocabulary expert.
        Generate focus words for highlighting vocabulary that already exists on a user's AAC board.
        CRITICAL: You MUST output exactly the requested number of new words—count them before responding.
        Output in this exact format:
        WORDS: word1, word2, word3, ... (comma-separated, all on one line)
        TITLE: Short 2-5 word title only (optional)
      PROMPT

      vocabulary_instruction = if include_core_words
        'Include 40-60% high-frequency core words useful in this context (e.g. I, want, go, more, stop, like, not, help, do, is, it, the, my, turn, fast, slow, yes, no, you) and the rest topic-specific vocabulary.'
      else
        'Focus on topic-specific vocabulary only: nouns, topic verbs, descriptors, and phrases unique to that context. Do NOT include generic core words like I, want, go, more, help, yes, no.'
      end
      existing_instruction = if existing_words.any?
        "Do NOT repeat these already available focus words: #{existing_words.join(', ')}."
      else
        ''
      end
      user_prompt = <<~PROMPT.strip
        Generate exactly #{missing_count} focus words for highlighting words on an existing AAC board. CRITICAL: Output exactly #{missing_count} comma-separated words after WORDS: —no more, no fewer. Count to verify.
        Context: #{scrubbed_prompt}
        Language: #{locale}
        #{vocabulary_instruction}
        #{existing_instruction}
        Format:
        WORDS: w1, w2, w3, ... w#{missing_count}
        TITLE: Short title (2-5 words, e.g. "Grinch Focus Words")
      PROMPT

      provider = api_config[:provider]
      region = api_config[:region]
      model = api_config[:model]
      start_time = Process.clock_gettime(Process::CLOCK_MONOTONIC)

      begin
        last_raw = nil
        last_response = nil
        last_payload = { words: [], title: nil }

        2.times do |attempt|
          prompt_turn = attempt.zero? ? user_prompt : "#{user_prompt}#{focus_retry_nudge(missing_count)}"
          last_response = call_anthropic(region: region, model: model, system_prompt: system_prompt,
                                         user_prompt: prompt_turn, cell_count: missing_count)

          raw = extract_content_anthropic(last_response)
          raw = raw.to_s.delete("\uFEFF").strip
          raw = strip_markdown_code_fence(raw)
          last_raw = raw
          last_payload = structured_parse_focus_payload(raw, missing_count, existing_words)
          words = last_payload[:words]

          if words.length >= missing_count
            duration_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - start_time) * 1000).round
            log_params = {
              provider: provider.to_s,
              model: model,
              user: user,
              request_summary: "Focus word generation: #{scrubbed_prompt.truncate(200)}",
              response_summary: raw.truncate(500),
              duration_ms: duration_ms,
              pii_detected: pii_detected,
              pii_findings: scrub_result[:findings],
              success: true,
              request_type: 'focus_word_generation'
            }
            log_params[:tokens_sent] = last_response.usage&.input_tokens
            log_params[:tokens_received] = last_response.usage&.output_tokens
            # EU AI Act Article 50(2): a focus-word list is AI-generated synthetic text
            # persisted in a durable artifact (AiFocusWordSet), so it IS in content-marking
            # scope (unlike word prediction; see EU_AI_ACT_ARTICLE_50_PLAN.md sec 9). Mint the
            # marker here (same provenance-bound Art50Marker as board generation), stamp the
            # audit row, and return it so the controller can persist it on the set.
            marker = Art50Marker.build(provider: provider.to_s, model: model)
            log_params[:ai_content_marked] = true
            log_params[:ai_generated_content_id] = marker['content_id']
            log_ai_call(**log_params)
            return {
              words: words.first(missing_count),
              title: last_payload[:title].presence,
              ai_generated: marker,
              error: nil
            }
          end

          break if attempt == 1
        end

        duration_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - start_time) * 1000).round
        wc = last_payload[:words].length
        Rails.logger.warn "AiBoardGenerator focus parse/shortfall (wc=#{wc}, requested=#{missing_count}, raw_len=#{last_raw.to_s.length})"
        log_params = {
          provider: provider.to_s,
          model: model,
          user: user,
          request_summary: "Focus word generation: #{scrubbed_prompt.truncate(200)}",
          response_summary: last_raw.to_s.truncate(500),
          duration_ms: duration_ms,
          pii_detected: pii_detected,
          pii_findings: scrub_result[:findings],
          success: false,
          request_type: 'focus_word_generation'
        }
        if last_response
          log_params[:tokens_sent] = last_response.usage&.input_tokens
          log_params[:tokens_received] = last_response.usage&.output_tokens
        end
        log_ai_call(**log_params)

        friendly = wc.positive? ? "The AI returned too few focus words (#{wc}/#{missing_count}). Try Generate again." : 'Could not parse AI response'
        result = { words: nil, title: nil, error: friendly }
        result.merge!(dev_diag(:parse_error, "After 2 attempts: word_count=#{wc}, requested=#{missing_count}. First 400 chars: #{last_raw.to_s.truncate(400).inspect}"))
        result
      rescue Anthropic::Errors::APIError => e
        duration_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - start_time) * 1000).round
        log_ai_call(
          provider: provider.to_s,
          model: model,
          user: user,
          request_summary: "Focus word generation: #{scrubbed_prompt.truncate(200)}",
          response_summary: nil, duration_ms: duration_ms,
          pii_detected: pii_detected, pii_findings: scrub_result[:findings],
          success: false, error_message: e.message, request_type: 'focus_word_generation'
        )
        Rails.logger.error "AiBoardGenerator Claude focus API error: #{e.message}"
        api_error_response('AI service unavailable. Please try again later.', e,
          kind: :anthropic_api, provider: provider, model: model).merge(title: nil)
      rescue Faraday::Error => e
        duration_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - start_time) * 1000).round
        log_ai_call(
          provider: provider.to_s,
          model: model,
          user: user,
          request_summary: "Focus word generation: #{scrubbed_prompt.truncate(200)}",
          response_summary: nil, duration_ms: duration_ms,
          pii_detected: pii_detected, pii_findings: scrub_result[:findings],
          success: false, error_message: e.message, request_type: 'focus_word_generation'
        )
        Rails.logger.error "AiBoardGenerator focus API HTTP error: #{e.message}"
        api_error_response('AI service unavailable. Please try again later.', e,
          kind: :api_http, provider: provider, model: model).merge(title: nil)
      rescue StandardError => e
        duration_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - start_time) * 1000).round
        log_ai_call(
          provider: provider.to_s,
          model: model,
          user: user,
          request_summary: "Focus word generation: #{scrubbed_prompt.truncate(200)}",
          response_summary: nil, duration_ms: duration_ms,
          pii_detected: pii_detected, pii_findings: scrub_result[:findings],
          success: false, error_message: "#{e.class}: #{e.message}", request_type: 'focus_word_generation'
        )
        Rails.logger.error "AiBoardGenerator focus error: #{e.class}: #{e.message}"
        api_error_response('Generation failed', e, kind: :unexpected, provider: provider, model: model).merge(title: nil)
      end
    end

    private

    # Parses WORDS:/NAME:/DESCRIPTION: without rejecting short lists (caller enforces cell_count).
    def structured_parse_payload(raw, expected_count)
      return { words: [], name: nil, description: nil } if raw.blank?

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
      { words: words, name: name.presence, description: description.presence }
    end

    def structured_parse_focus_payload(raw, expected_count, existing_words = [])
      return { words: [], title: nil } if raw.blank?

      title = nil
      words_str = nil
      accumulating = nil

      raw.split(/\n/).each do |line|
        line_stripped = line.strip
        next if line_stripped.blank?

        if line_stripped =~ /\Awords:\s*(.*)\z/i
          words_str = ::Regexp.last_match(1).strip
          accumulating = :words
        elsif line_stripped =~ /\Atitle:\s*(.*)\z/i
          title = ::Regexp.last_match(1).strip
          accumulating = :title
        elsif accumulating == :words
          words_str = [words_str, line_stripped].compact.join(', ')
        elsif accumulating == :title && title
          title = "#{title} #{line_stripped}".strip
        end
      end

      words_str = raw if words_str.blank? && !raw.match?(/\Atitle:/i)
      existing_lookup = Array(existing_words).map { |w| w.to_s.downcase.strip }.reject(&:blank?).to_set
      words = parse_words(words_str || raw, expected_count)
        .reject { |word| existing_lookup.include?(word.downcase.strip) }
        .uniq { |word| word.downcase.strip }
      { words: words, title: title.presence }
    end

    def board_retry_nudge(cell_count)
      <<~NUDGE


        CRITICAL: Your previous reply did not include exactly #{cell_count} comma-separated vocabulary items on the WORDS: line. Reply again with:
        - One WORDS: line containing exactly #{cell_count} entries (count before sending)
        - Then NAME: and DESCRIPTION: on separate lines
        Do not stop after a partial list.
      NUDGE
    end

    def focus_retry_nudge(word_count)
      <<~NUDGE


        CRITICAL: Your previous reply did not include exactly #{word_count} comma-separated focus words on the WORDS: line. Reply again with:
        - One WORDS: line containing exactly #{word_count} entries (count before sending)
        - Then TITLE: on a separate line
        Do not stop after a partial list.
      NUDGE
    end

    # GEMINI_API_KEY fallback disabled 2026-07-09 -- it pointed at the Gemini Developer/AI-Studio
    # endpoint (generativelanguage.googleapis.com), not Vertex AI, and that endpoint's data-handling
    # terms could not be confirmed adequate for child data. See
    # docs/legal/AI_DATA_SHARING_CONSENT.md section 2.2. Runtime AI now egresses to Claude on AWS
    # Bedrock (BAA/HIPAA path) via AiClient, not the direct api.anthropic.com endpoint -- there is
    # no direct-Anthropic fallback.
    def resolve_api_config
      return nil unless AiClient.available?

      {
        provider: :claude,
        region: AiClient.bedrock_region,
        # runtime_model, NOT bedrock_model. bedrock_model resolves an id to its wire
        # form and asks no questions: it passes an already-resolved inference-profile
        # id straight through by design. So reading ANTHROPIC_MODEL here and handing
        # it to bedrock_model let an operator point a Tier 1 seam at ANY Bedrock
        # model -- including a mandatory-retention Covered Model that student
        # utterances must never reach -- while ALLOWED_RUNTIME_MODELS sat unused.
        # runtime_model performs the same resolution BEHIND that allowlist, refusing
        # an unvetted override and falling back to the vetted default.
        model: AiClient.runtime_model(DEFAULT_MODEL)
      }
    end

    def call_anthropic(region:, model:, system_prompt:, user_prompt:, cell_count:)
      client = AiClient.build!
      client.messages.create(
        model: model,
        max_tokens: completion_max_tokens(cell_count),
        system: system_prompt,
        messages: [{ role: 'user', content: user_prompt }]
      )
    end

    def extract_content_anthropic(response)
      return '' unless response&.content&.is_a?(Array)
      text_blocks = response.content.select { |block| block.type.to_s == 'text' }
      text_blocks.map { |b| b.respond_to?(:text) ? b.text : b.to_s }.join("\n").strip
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

    def parse_shortfall_response(raw, cell_count, word_count)
      min_bar = cell_count / 2
      friendly = if word_count >= min_bar && word_count < cell_count
        "The AI returned an incomplete word list (#{word_count} of #{cell_count}). Try Generate again, or use fewer rows or columns."
      elsif word_count.positive?
        "The AI returned too few words for this board (#{word_count}/#{cell_count}). Try fewer rows or columns, or tap Generate again."
      else
        'Could not parse AI response'
      end
      result = { words: nil, name: nil, description: nil, error: friendly }
      if Rails.env.development?
        detail = "After 2 attempts: word_count=#{word_count}, cell_count=#{cell_count}, min_bar=#{min_bar}. First 400 chars: #{raw.to_s.truncate(400).inspect}"
        result.merge!(dev_diag(:parse_error, detail))
      end
      result
    end

    # Completion output budget: medium/large boards need headroom; 1024 was too low for many models.
    def completion_max_tokens(cell_count)
      [[cell_count * 8 + 320, 2048].max, 8192].min
    end

    def dev_diag(kind, detail)
      return {} unless Rails.env.development?
      { error_kind: kind.to_s, error_detail: detail }
    end

    def api_error_response(message, exception, kind:, provider: nil, model: nil)
      result = { words: nil, name: nil, description: nil, error: message }
      return result unless Rails.env.development?

      result[:error_kind] = kind.to_s
      parts = []
      parts << "provider=#{provider}" if provider
      parts << "model=#{model}" if model
      if exception
        parts << "#{exception.class}: #{exception.message}"
        parts.concat(faraday_response_excerpt(exception))
      end
      result[:error_detail] = parts.compact.join(' | ') if parts.any?
      result
    end

    def faraday_response_excerpt(exception)
      return [] unless exception.is_a?(Faraday::Error)
      return [] unless exception.respond_to?(:response)

      resp = exception.response
      return [] unless resp

      status = resp.respond_to?(:status) ? resp.status : resp[:status]
      body = resp.respond_to?(:body) ? resp.body : resp[:body]
      out = []
      out << "HTTP #{status}" if status
      out << body.to_s.truncate(400) if body.present?
      out
    end

    def log_ai_call(provider:, model:, user:, request_summary:, response_summary:,
                    tokens_sent: nil, tokens_received: nil, duration_ms: nil,
                    pii_detected: false, pii_findings: [], success: true, error_message: nil,
                    request_type: 'board_generation',
                    ai_content_marked: false, ai_generated_content_id: nil)
      return unless defined?(AiApiLog)
      # Scrub the model OUTPUT before it reaches AiApiLog. Generated board names/descriptions
      # can echo user-supplied sensitive context, so the raw response must never be persisted
      # unredacted (request_summary is already scrubbed upstream). nil passes through untouched
      # for the API-error paths that log no response body.
      safe_response_summary = response_summary.nil? ? nil : PiiScrubber.redact_for_ai(response_summary)[:payload]
      # EU AI Act Article 50: resolve the jurisdiction + disclosure-shown call context from
      # the in-scope data-subject `user` via the ONE shared helper (ENF-01). The helper owns
      # the guarded reads + scrubbed logged fallback, so it never raises into this wrapper.
      art50_ctx = LingoLinq::Article50CallContext.for(user)
      AiApiLog.log_ai_call(
        provider: provider,
        model: model,
        type: request_type,
        user: user,
        request_summary: request_summary,
        response_summary: safe_response_summary,
        tokens_sent: tokens_sent,
        tokens_received: tokens_received,
        duration_ms: duration_ms,
        pii_detected: pii_detected,
        pii_findings: pii_findings,
        success: success,
        error_message: error_message,
        feature_flag: 'ai_board_generation',
        # EU AI Act Article 50(2): record that the output was machine-readable marked
        # and link this audit row to the marked content via its content_id.
        ai_content_marked: ai_content_marked,
        ai_generated_content_id: ai_generated_content_id,
        jurisdiction: art50_ctx[:jurisdiction],
        article_50_disclosure_shown: art50_ctx[:article_50_disclosure_shown]
      )
    rescue StandardError => e
      Rails.logger.warn "AiBoardGenerator: failed to log AI API call: #{e.message}"
    end
  end
end
