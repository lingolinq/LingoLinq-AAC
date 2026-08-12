# frozen_string_literal: true

require 'digest'
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

  # In-memory response cache: { opaque_digest => { words: [...], ts: monotonic } }
  #
  # The KEY IS A DIGEST OF SCRUBBED, TENANT-SCOPED INPUT and must stay that way
  # (finding LL-16ef84ad9a). It previously interpolated the raw user sentence:
  #
  #   cache_key = "#{locale}:#{sentence.strip.downcase}:..."
  #
  # built BEFORE PiiScrubber ran, so verbatim AAC utterances -- health, needs,
  # relationships, plausibly GDPR special-category and frequently a COPPA-covered
  # child's -- sat in a process-global hash outside the redaction boundary that
  # the compliance corpus says protects them, with no organization discriminator
  # and no expiry until capacity eviction at CACHE_MAX. On a low-traffic worker
  # that meant the process lifetime.
  #
  # Three properties now hold, and each has a spec:
  #   1. Nothing the user typed is recoverable from the key. It is a SHA-256 of
  #      the POST-scrub text, so anything PiiScrubber redacts never reaches it.
  #   2. Entries are scoped per organization, so one district's process-shared
  #      entries are unreachable from another's.
  #   3. Expired entries are swept on write rather than lingering until the cache
  #      fills, so a quiet worker does not retain them indefinitely.
  #
  # Timestamps are monotonic, not wall-clock: an NTP step must not silently
  # extend an entry's life past CACHE_TTL.
  CACHE = {}
  CACHE_MAX = 500
  CACHE_TTL = 1800 # 30 minutes -- aggressive caching for free-tier rate limits
  # CACHE is mutated from every Puma worker thread; a bare Hash is not safe under
  # concurrent write + rehash. Never hold this across an AI call.
  CACHE_MUTEX = Mutex.new

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

      # Configure blocklist with the user's name so it cannot leak verbatim.
      if user
        names = []
        names << user.user_name if user.respond_to?(:user_name) && user.user_name.present?
        if user.respond_to?(:settings) && user.settings.is_a?(Hash) && user.settings['full_name'].present?
          names << user.settings['full_name']
        end
        PiiScrubber.configure_blocklist(names)
      end

      # The scrub now runs BEFORE the cache lookup, not after. That ordering is
      # what keeps the raw utterance out of the cache key (LL-16ef84ad9a), and it
      # is affordable: PiiScrubber.redact_for_ai costs 6-15 microseconds on
      # representative AAC sentences (measured 2026-08-11; COMMON_FIRST_NAMES is a
      # frozen Set, so name detection is a hash lookup per word, not a scan), and
      # the digest another 5. That is imperceptible against the instant-feel budget
      # the cache exists to protect.
      scrub_result = PiiScrubber.redact_for_ai(sentence.strip)
      scrubbed_sentence = scrub_result[:payload]
      pii_detected = scrub_result[:pii_found]
      pii_findings = scrub_result[:findings]

      cache_key = cache_key_for(scrubbed_sentence, locale, ctx, user)
      cached_words = cache_fetch(cache_key)
      return cached_words if cached_words

      # Past the cache, so this request may actually egress. Verify the Bedrock
      # credential belongs to the BAA'd AWS account before doing anything else
      # (finding LL-1b0d78dbe6). Deliberately here rather than in
      # resolve_api_config above: see the note on that method. Serving a cache hit
      # without this check is safe because an entry can only have been written by a
      # call that already passed it.
      return [] unless AiClient.available?

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

      cache_store(cache_key, words)

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

    def monotonic_now
      Process.clock_gettime(Process::CLOCK_MONOTONIC)
    end

    # An opaque digest, never a readable sentence. `scrubbed` must be the
    # POST-PiiScrubber text; passing the raw sentence here would reintroduce
    # LL-16ef84ad9a, so the only caller derives it from redact_for_ai.
    #
    # Downcasing matches the previous behaviour: two casings of the same sentence
    # share an entry. The prompt still sends the original casing.
    def cache_key_for(scrubbed, locale, ctx, user)
      Digest::SHA256.hexdigest(
        [
          cache_scope(user),
          locale.to_s,
          scrubbed.to_s.strip.downcase,
          ctx[:time_of_day].to_s,
          ctx[:topic].to_s
        ].join("\x00")
      )
    end

    # Tenant discriminator. Organization first, because sharing predictions inside
    # one district is the intended cost saving; falling back to the user's own id
    # means a user with no sponsoring org shares with nobody, which is the safe
    # direction.
    #
    # This reads the `managing_organization_id` COLUMN and deliberately does not
    # call `User#managing_organization` (app/models/concerns/supervising.rb:74).
    # That method runs Organization.attached_orgs plus a find_by_global_id, i.e. at
    # least one database round trip -- and cache_scope runs on every predict call,
    # including hits. Putting a query in front of the response cache would be a far
    # worse latency regression than the scrub this reordering already accounts for.
    # TelemetryEvent.organization_id_for takes the same column-first approach.
    #
    # Consequence worth knowing: a user attached to an org but not sponsored by it
    # has a nil column and lands in a private per-user scope. That costs hit rate
    # and leaks nothing, which is the correct way for this to be wrong.
    #
    # A nil user shares one 'anon' bucket. That is reserved for offline callers
    # that supply no user data by contract (the n-gram seed generator). It is not
    # a hole: the key is built from scrubbed text either way, so even this bucket
    # holds no raw utterance. The broader nil-user concern -- that `predict` skips
    # the feature-flag gate when user is nil (see the guard at the top of that
    # method) -- is a separate, pre-existing issue and is not fixed here.
    def cache_scope(user)
      return 'anon' unless user

      org_id = user.respond_to?(:managing_organization_id) ? user.managing_organization_id : nil
      return "org:#{org_id}" if org_id.present?

      user_id = user.respond_to?(:global_id) ? user.global_id : nil
      return "user:#{user_id}" if user_id.present?

      # An unsaved or id-less user must not join the shared bucket.
      "user-object:#{user.object_id}"
    rescue StandardError => e
      # A scope we cannot resolve must not silently collapse into a shared bucket.
      # Fail to a per-object private scope instead: worst case is a cache miss.
      Rails.logger.warn("[AiWordPredictor] cache scope resolution failed: #{e.class}: #{e.message}")
      "unresolved:#{user.object_id}"
    end

    def cache_fetch(key)
      CACHE_MUTEX.synchronize do
        entry = CACHE[key]
        next nil unless entry
        if (monotonic_now - entry[:ts]) < CACHE_TTL
          entry[:words]
        else
          CACHE.delete(key)
          nil
        end
      end
    end

    # Sweeps expired entries before considering eviction, so a quiet worker drops
    # them on schedule instead of holding them until the cache fills. The sweep is
    # O(CACHE_MAX) and only runs on the miss path, which has just made a network
    # call, so its cost is not observable.
    def cache_store(key, words)
      CACHE_MUTEX.synchronize do
        now = monotonic_now
        CACHE.delete_if { |_k, v| (now - v[:ts]) >= CACHE_TTL }

        if CACHE.size >= CACHE_MAX
          oldest_key = CACHE.min_by { |_k, v| v[:ts] }&.first
          CACHE.delete(oldest_key) if oldest_key
        end

        CACHE[key] = { words: words, ts: now }
      end
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
    # `AiClient.available?` immediately after the cache lookup, before any prompt
    # build or egress. Cache hits never probe; anything that could actually call is
    # still fully gated.
    #
    # The PII scrub does now run before the cache lookup (it has to, so the key can
    # be built from scrubbed text -- LL-16ef84ad9a), but that is a few microseconds
    # of local regex work, not a network probe behind a mutex, so it does not
    # reintroduce the stall this ordering exists to avoid.
    def resolve_api_config
      return nil unless AiClient.configured?

      {
        provider: :claude,
        region: AiClient.bedrock_region,
        # runtime_model applies the Tier 1 ALLOWED_RUNTIME_MODELS gate to the
        # ANTHROPIC_MODEL override; see AiClient.
        model: AiClient.runtime_model(DEFAULT_ANTHROPIC_MODEL)
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
