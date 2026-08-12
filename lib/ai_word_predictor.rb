# frozen_string_literal: true

require_relative 'pii_scrubber'
require_relative 'ai_client'
require_relative 'lingo_linq/article50_call_context'

module AiWordPredictor
  # Use fast/cheap models -- predictions need to feel instant. Bedrock model id
  # (anthropic. prefix, bare alias) -- routes via AWS Bedrock, see AiClient.
  DEFAULT_ANTHROPIC_MODEL = 'anthropic.claude-haiku-4-5'
  # GEMINI_API_KEY fallback disabled 2026-07-09 -- see docs/legal/AI_DATA_SHARING_CONSENT.md
  # section 2.2 (Gemini Developer/AI-Studio endpoint, data-handling terms not adequate for child
  # data). Runtime AI now egresses to Claude on AWS Bedrock (BAA/HIPAA path), not the direct
  # api.anthropic.com endpoint -- there is no direct-Anthropic fallback.

  # In-memory LRU cache: { "context_key" => { words: [...], ts: Time } }
  CACHE = {}
  CACHE_MAX = 500
  CACHE_TTL = 1800 # 30 minutes -- aggressive caching for free-tier rate limits

  class << self
    # Returns an array of predicted next-word strings (up to `count`).
    # sentence: the words the user has built so far, e.g. "I want to"
    # locale: language code, default "en"
    # count: how many predictions to return (default 4)
    # context: optional hash with :time_of_day, :topic keys
    # user: User object. Required for production calls so we can apply
    #   the org AI opt-out, the COPPA Final Rule consent gate, and audit
    #   logging. Pass nil only from offline scripts that supply no user
    #   data (e.g., the n-gram seed generator).
    def predict(sentence:, locale: 'en', count: 4, user: nil, context: nil)
      return [] if sentence.blank?

      api_config = resolve_api_config
      return [] if api_config.blank?

      # Org-level AI opt-out and per-user feature flag.
      return [] if user && !FeatureFlags.ai_feature_enabled_for?('ai_word_prediction', user)

      # COPPA Final Rule hard-gate: block under-13 users awaiting parental consent.
      return [] if FeatureFlags.coppa_blocks_ai_for?(user)

      # EU under-16 AI parental-consent hard-gate.
      return [] if FeatureFlags.eu_under16_blocks_ai_for?(user)

      ctx = normalize_context(context)
      cache_key = "#{locale}:#{sentence.strip.downcase}:#{ctx[:time_of_day]}:#{ctx[:topic]}"
      cached = CACHE[cache_key]
      if cached && (Time.now - cached[:ts]) < CACHE_TTL
        return cached[:words]
      end

      # Past the cache, so this request may actually egress. Verify the Bedrock
      # credential belongs to the BAA'd AWS account before doing anything else
      # (finding LL-1b0d78dbe6). Deliberately here rather than in
      # resolve_api_config above: see the note on that method. Serving a cache hit
      # without this check is safe because an entry can only have been written by a
      # call that already passed it.
      return [] unless AiClient.available?

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
          response = call_anthropic(api_config, scrubbed_sentence, locale, count, ctx)
          raw_response = extract_content_anthropic(response)
          tokens_sent = response.usage&.input_tokens if response.respond_to?(:usage)
          tokens_received = response.usage&.output_tokens if response.respond_to?(:usage)
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
      # EU AI Act Article 50(2) scope decision: word prediction is NOT content-marked.
      # Unlike board generation (which mints an Art50Marker onto board.settings), this site
      # produces a TRANSIENT menu of next-word suggestions (in-memory CACHE only, never
      # persisted as an artifact). The AAC user then SELECTS a word into their own utterance,
      # so the only durable output is the user's human-authored communication. Two independent
      # reasons keep it unmarked, either sufficient:
      #   1. Assistive-function carve-out: the Commission's Article 50 guidance exempts systems
      #      that "perform only an assistive function for standard editing" / do not
      #      substantially alter the input or its semantics. A hand-selected next-word
      #      suggestion fits.
      #   2. No markable artifact / false-marking risk: there is no persisted AI output to mark,
      #      and marking the user's selected words would falsely label human speech (frequently a
      #      COPPA-covered child's board) as AI-generated -- the OPPOSITE of what 50(2) polices
      #      (it polices under-marking of AI output, not over-marking of human output).
      # So ai_content_marked stays false here (accurate: no marker on the output). This
      # word_prediction AiApiLog row is the audit record that an AI call occurred; request_type
      # distinguishes it from the in-scope, content-marked sites. See
      # docs/legal/EU_AI_ACT_ARTICLE_50_PLAN.md sec 9.
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

    # Token-based entry point used by WordSuggestionsController.
    def predict_from_tokens(words:, locale: 'en', count: 5, user: nil, context: nil)
      token_words = Array.wrap(words).map(&:to_s).map(&:strip).reject(&:blank?).first(12)
      return [] if token_words.empty?

      predict(
        sentence: token_words.join(' '),
        locale: locale,
        count: count,
        user: user,
        context: context
      )
    end

    private

    def normalize_context(context)
      ctx = (context || {}).with_indifferent_access
      {
        time_of_day: ctx[:time_of_day].to_s.presence || 'unspecified',
        topic: ctx[:topic].to_s.strip
      }
    end

    # NOTE: this seam gates on `configured?` (a pure ENV read), NOT on `available?`
    # like the other three. That difference is deliberate and load-bearing.
    #
    # `available?` performs the sts:GetCallerIdentity account assertion, and while
    # the result is cached, a FAILED check re-probes every 60s and holds a
    # process-global mutex for up to 5s while it does. This method runs before the
    # response cache in `predict`, so gating it on `available?` would put that stall
    # in front of requests that were about to return instantly from CACHE -- once a
    # minute, for every thread in the worker. Word prediction is typing assistance
    # for AAC users; a 5-second wait to be told "no suggestions" is worse than an
    # instant empty list.
    #
    # The account assertion is NOT skipped, only moved: `predict` calls
    # `AiClient.available?` immediately after the cache lookup, before any scrub,
    # prompt build, or egress. Cache hits never probe; anything that could actually
    # call is still fully gated.
    def resolve_api_config
      return nil unless AiClient.configured?

      {
        provider: :claude,
        region: AiClient.bedrock_region,
        model: AiClient.bedrock_model(ENV.fetch('ANTHROPIC_MODEL', DEFAULT_ANTHROPIC_MODEL))
      }
    end

    def call_anthropic(config, sentence, locale, count, context)
      client = AiClient.build!
      client.messages.create(
        model: config[:model],
        max_tokens: 60,
        system: system_prompt(locale, count, context),
        messages: [{ role: 'user', content: sentence }]
      )
    end

    def system_prompt(locale, count, context)
      ctx = normalize_context(context)
      context_lines = []
      context_lines << "Time of day: #{ctx[:time_of_day]}" if ctx[:time_of_day] != 'unspecified'
      context_lines << "Topic context: #{ctx[:topic]}" if ctx[:topic].present?
      context_block = context_lines.any? ? "\nContext:\n#{context_lines.join("\n")}\n" : ''

      <<~PROMPT
        You are a word-prediction engine for an AAC (Augmentative and Alternative Communication) app. The user is building a sentence word by word.

        Given the sentence so far, predict the #{count} most likely next words.
        #{context_block}
        Rules:
        - Return ONLY #{count} words separated by commas, nothing else
        - Words should be simple, common, everyday vocabulary
        - Predictions should be contextually appropriate for the sentence
        - Prefer short, high-frequency words that AAC users commonly need
        - Language: #{locale}
        - Every returned word must be in that language
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
         .map { |w| w.gsub(/[^\p{L}'\- ]/u, '').strip }
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
      # EU AI Act Article 50: resolve the jurisdiction + disclosure-shown call context from
      # the in-scope data-subject `user` via the ONE shared helper (ENF-01). The helper owns
      # the guarded reads + scrubbed logged fallback, so it never raises into this wrapper.
      art50_ctx = LingoLinq::Article50CallContext.for(user)
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
        feature_flag: 'ai_word_prediction',
        jurisdiction: art50_ctx[:jurisdiction],
        article_50_disclosure_shown: art50_ctx[:article_50_disclosure_shown]
      )
    rescue StandardError => e
      Rails.logger.warn "AiWordPredictor: failed to log AI API call: #{e.message}"
    end
  end
end
