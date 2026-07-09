require 'digest'
require 'json'

module LingoLinq
  # Canonical version source for the AI data-sharing disclosure (VPC Phase 2).
  #
  # `User#ai_consent_granted?(disclosures_version:)` (Phase 1, D-03) needs a
  # version number to check consent against. Before this module existed there
  # was no canonical source for that number (see STATE.md Phase 1 pending
  # todo); this module supplies it.
  #
  # Design:
  # - `CURRENT_VERSION` is the version every NEW consent grant should be
  #   recorded against. Bumping it is a deliberate act that forces re-consent
  #   (a stale-version grant no longer satisfies `ai_consent_granted?`).
  # - `REGISTRY` holds per-version METADATA only (vendor list, data
  #   categories, retention windows, revocation summary). The long-form legal
  #   prose a parent actually reads lives in the versioned Rails view
  #   (`app/views/ai_consent/disclosures/v#{version}.html.erb`), not here, so
  #   there is exactly one place to edit copy and one place to edit the
  #   structured facts the copy must not contradict.
  # - `.metadata(version)` returns a JSON-serializable Hash (string keys
  #   throughout, matching the Art50Marker convention in this codebase) for
  #   the future consent gate (Phase 4) and the future Ember modal header
  #   (Phase 3).
  #
  # Content hash design decision: the plan asks for "a content hash of the
  # rendered disclosure." This module hashes the STRUCTURED METADATA in
  # REGISTRY (vendor list, tiers, data categories, retention windows), not
  # the literal compiled HTML of the ERB view. Rationale: the app has no
  # existing pattern for rendering a Rails view outside a request (no prior
  # `ApplicationController.renderer` usage in this codebase), and coupling a
  # compliance-critical hash to incidental HTML/whitespace changes in the
  # template would force a false "content changed" signal on a pure
  # formatting edit. Hashing the metadata instead means: any SUBSTANTIVE
  # change (a new vendor, a changed retention window, a changed data
  # category) changes the hash and should prompt a `CURRENT_VERSION` bump;
  # a purely cosmetic edit to the view's HTML does not. This is intentionally
  # a narrower, more mechanical check than "did the view file change at all,"
  # and should be paired with human review (Task 02-02.8) before any version
  # bump ships, not relied on as the sole gate.
  module AiConsentDisclosures
    CURRENT_VERSION = 1

    REGISTRY = {
      1 => {
        'effective_date' => '2026-07-09',
        'vendors' => [
          {
            'name' => 'Anthropic, PBC',
            'models' => [
              'Claude Haiku 4.5 (claude-haiku-4-5-20251001) for board suggestions and word prediction',
              'Claude Opus 4.7 (claude-opus-4-7) for AI evaluation narration'
            ],
            'tier' => "Anthropic's commercial API (not the free consumer Claude.ai product)",
            'features' => ['ai_board_generator', 'ai_word_predictor', 'eval_narrator'],
            'trains_on_data' => false,
            'training_note' => 'Zero-data-retention (ZDR) is confirmed for these two specific ' \
              "models on Anthropic's commercial API: Anthropic does not use this data to train " \
              'its models and does not retain it beyond what is needed to serve the immediate ' \
              'request. This confirmation is scoped to these two models only.',
            'status' => 'primary'
          },
          {
            'name' => 'Google LLC (Gemini Developer API)',
            'models' => ['Gemini 2.5 Flash'],
            'tier' => 'The Gemini Developer API (the aistudio.google.com endpoint), used only ' \
              'as a conditional automatic fallback',
            'features' => ['ai_board_generator', 'ai_word_predictor'],
            'trains_on_data' => nil,
            'training_note' => 'This fallback activates automatically only if Anthropic is ' \
              "unavailable. LingoLinq has not yet confirmed Google's data-handling terms for " \
              'this specific backup path (tracked as an open item in ' \
              'docs/legal/AI_GOVERNANCE_MEMO.md section 7). The same scrubbing filter described ' \
              'below is applied before anything is sent through this path. This vendor is never ' \
              'used for AI evaluation narration.',
            'status' => 'conditional_fallback_unconfirmed'
          }
        ],
        'data_categories' => [
          'Text describing the board you want (for example, a topic or theme), when using ' \
            'AI-assisted board creation',
          'The words and sentences a communicator is actively building, when AI word prediction ' \
            'suggests the next word',
          'Clinical evaluation notes and assessment data, only when a speech-language ' \
            'pathologist chooses to generate an AI-drafted evaluation summary for a specific ' \
            'student'
        ],
        'scrubbing_note' => 'Before any of the above is sent to an AI vendor, LingoLinq ' \
          'automatically removes common identifying details it can detect, such as names, ' \
          'email addresses, phone numbers, and account identifiers. This filter is not perfect: ' \
          'free-typed text may still contain identifying details the filter does not catch. We ' \
          'call this "scrubbed" or "pseudonymized" data, not the formal legal standard for fully ' \
          "removing all identifying information, because the underlying record can still be " \
          "linked back to your account inside LingoLinq's own systems.",
        'retention' => {
          'vendor_side' => 'For Anthropic (Claude Haiku 4.5 and Claude Opus 4.7), data sent for ' \
            'an AI request is not retained by Anthropic beyond what is needed to process that ' \
            'request, under a zero-data-retention agreement. Vendor-side retention for the ' \
            'Google Gemini fallback path is not yet confirmed.',
          'lingolinq_general' => {
            'window_months' => 24,
            'enforced' => false,
            'note' => 'Decided and being rolled out for accounts outside the EU that are not ' \
              'flagged as a child under 13.'
          },
          'lingolinq_children' => {
            'window_months' => 12,
            'enforced' => false,
            'note' => 'Decided and being rolled out: a rolling 12 month window, independent of ' \
              'account status, for accounts flagged as under 13.'
          },
          'lingolinq_eu' => {
            'window_years' => 5,
            'enforced' => true,
            'note' => 'Enforced today for accounts in the EU jurisdiction ' \
              '(AiApiLog.purge_old_eu_logs!, EU AI Act Article 50 record-keeping).'
          },
          'ip_address' => {
            'window_days' => 90,
            'enforced' => true,
            'note' => 'IP addresses on any AI request log are removed after 90 days, enforced ' \
              'today for every account.'
          },
          'account_deletion' => 'The AI request log tied to your account is deleted when your ' \
            'account is deleted, enforced today.'
        },
        'revocation_summary' => 'A parent, or the account holder once old enough, can withdraw ' \
          'AI data-sharing consent at any time. Once withdrawn, LingoLinq stops sending any ' \
          'further data from that account to Anthropic or any AI vendor for board suggestions, ' \
          'word prediction, or evaluation narration. Withdrawing consent cannot retract or ' \
          'delete anything already sent to a vendor before the withdrawal; it only stops future ' \
          'sending. The rest of LingoLinq (boards, sync, messaging) keeps working normally ' \
          'without AI features.'
      }.freeze
    }.freeze

    # Returns JSON-serializable metadata for the given version, or nil when
    # the version is unknown. String keys throughout (matches Art50Marker).
    def self.metadata(version)
      entry = REGISTRY[normalize_version(version)]
      return nil unless entry

      result = deep_dup(entry)
      result['version'] = normalize_version(version)
      result['content_hash'] = content_hash(version)
      result
    end

    # SHA256 hex digest of the canonicalized (key-sorted) registry entry.
    # Returns nil for an unknown version.
    def self.content_hash(version)
      entry = REGISTRY[normalize_version(version)]
      return nil unless entry

      Digest::SHA256.hexdigest(JSON.generate(canonicalize(entry)))
    end

    # True when `version` is a known, renderable disclosure version.
    def self.known_version?(version)
      REGISTRY.key?(normalize_version(version))
    end

    def self.normalize_version(version)
      Integer(version)
    rescue ArgumentError, TypeError
      -1
    end
    private_class_method :normalize_version

    def self.deep_dup(obj)
      case obj
      when Hash
        obj.each_with_object({}) { |(k, v), h| h[k] = deep_dup(v) }
      when Array
        obj.map { |v| deep_dup(v) }
      else
        obj
      end
    end
    private_class_method :deep_dup

    def self.canonicalize(obj)
      case obj
      when Hash
        obj.keys.sort_by(&:to_s).each_with_object({}) { |k, h| h[k] = canonicalize(obj[k]) }
      when Array
        obj.map { |v| canonicalize(v) }
      else
        obj
      end
    end
    private_class_method :canonicalize
  end
end
