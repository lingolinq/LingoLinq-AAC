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
  # KNOWN GAP: the vendor names/tiers/models/training_note sentences below
  # are rendered directly in v1.html.erb and are English-only -- they do
  # NOT go through config/locales/*.yml or the `t()` helper, unlike the
  # surrounding prose in the view. A future config/locales/es.yml will
  # translate the surrounding prose but NOT these sentences. See
  # docs/legal/AI_DATA_SHARING_CONSENT.md section 4.1 for the plan to
  # resolve this before `es` enforcement.
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
            'name' => 'Amazon Web Services, Inc.',
            'models' => [
              'Claude Haiku 4.5 (claude-haiku-4-5-20251001) for word prediction'
            ],
            'tier' => 'Amazon Bedrock, running inside a LingoLinq-controlled AWS account under a ' \
              'signed AWS Business Associate Agreement. AWS operates the inference; this is not ' \
              "Anthropic's commercial API and not the free consumer Claude.ai product.",
            'features' => ['ai_word_predictor'],
            'trains_on_data' => false,
            'training_note' => 'AWS states that inputs to and outputs from Amazon Bedrock are not ' \
              'used to train any model, and are not shared with the model provider. AWS may retain ' \
              'request data for a limited period for safety and abuse-prevention purposes. ' \
              'LingoLinq has not yet configured the account for guaranteed zero retention, so no ' \
              'zero-data-retention guarantee is claimed for this path.',
            'status' => 'primary'
          },
          {
            'name' => 'Anthropic, PBC',
            'models' => [
              'Claude Haiku 4.5 (claude-haiku-4-5-20251001) for word prediction'
            ],
            'tier' => 'Model provider only. Anthropic built the Claude model, but on Amazon Bedrock ' \
              'it runs inside AWS-operated accounts that Anthropic cannot access, so Anthropic ' \
              'receives neither the prompts nor the responses. LingoLinq does not send these ' \
              'requests to Anthropic directly.',
            'features' => ['ai_word_predictor'],
            'trains_on_data' => false,
            'training_note' => 'Anthropic does not receive this data, so it cannot train on it. ' \
              'On Bedrock the model provider has no access to customer prompts or completions.',
            'status' => 'model_provider'
          }
        ],
        # AI board suggestion + focus refinement (lib/ai_board_generator.rb) is deliberately NOT
        # listed here. Reclassified Non-personal 2026-07-09 (Scot) after hardening
        # PiiScrubber::COMMON_FIRST_NAMES -- see docs/legal/AI_DATA_FLOW_CLASSIFICATION.md
        # section 4.2 for the full rationale and residual-risk acceptance. It still uses
        # Anthropic Claude Haiku 4.5 and is disclosed as such in the general privacy policy
        # (privacy.hbs), just not gated by THIS second-tier consent. The Google Gemini
        # Developer API fallback (formerly listed here for board generation and word
        # prediction) was disabled entirely 2026-07-09 (PR #570) -- see section 2.2 of
        # docs/legal/AI_DATA_SHARING_CONSENT.md.
        'data_categories' => [
          'The words and sentences a communicator is actively building, when AI word prediction ' \
            'suggests the next word',
          'Clinical evaluation notes and assessment data: NOT currently sent to any AI ' \
            'provider. AI-drafted evaluation narration is inactive, and asking for an ' \
            'AI-drafted summary produces a fixed, locally generated template that never ' \
            'leaves LingoLinq. If this feature is switched on in future, this category would ' \
            'apply only when a speech-language pathologist chooses to generate an AI-drafted ' \
            'evaluation summary for a specific student, and this notice would be updated to ' \
            'name the model before any evaluation data is sent.'
        ],
        'scrubbing_note' => 'Before any of the above is sent to an AI vendor, LingoLinq ' \
          'automatically removes common identifying details it can detect, such as names, ' \
          'email addresses, phone numbers, and account identifiers. This filter is not perfect: ' \
          'free-typed text may still contain identifying details the filter does not catch. We ' \
          'call this "scrubbed" or "pseudonymized" data, not the formal legal standard for fully ' \
          "removing all identifying information, because the underlying record can still be " \
          "linked back to your account inside LingoLinq's own systems.",
        'retention' => {
          'vendor_side' => 'AI requests run on Amazon Bedrock inside a LingoLinq-controlled AWS ' \
            'account. Anthropic does not receive the data at all: on Bedrock the model runs in ' \
            'AWS-operated accounts the model provider cannot access. AWS states the data is not ' \
            'used to train any model, and may retain it for a limited period for safety and ' \
            'abuse-prevention purposes. No zero-data-retention guarantee is claimed for this path.',
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
          'further data from that account to the AI provider for word prediction. AI-drafted ' \
          'evaluation narration is currently inactive and sends nothing at all; if it is ' \
          'switched on in future it would be covered by this same withdrawal. Withdrawing ' \
          'consent cannot retract or delete anything already sent before the withdrawal; it ' \
          'only stops future sending. AI-assisted board suggestions are not affected by this ' \
          'consent and keep working either way. The rest of LingoLinq (boards, sync, ' \
          'messaging) keeps working normally without AI features.'
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
