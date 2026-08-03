# frozen_string_literal: true

require 'digest'
require 'json'

module LingoLinq
  # Canonical version source for the EU AI Act Article 50(1) TRANSPARENCY
  # disclosure (VPC Phase 4, PN-02 Option B).
  #
  # `User#article_50_disclosure_shown?(disclosures_version:)` needs an
  # authoritative "current version" to compare a recorded disclosure-shown
  # state against; a version bump re-prompts (the reader checks "shown at the
  # CURRENT version", not "ever shown").
  #
  # WHY a DEDICATED constant, deliberately NOT reusing
  # `LingoLinq::AiConsentDisclosures::CURRENT_VERSION`:
  # that constant is the AI DATA-SHARING consent version (COPPA Item 1b), a
  # semantically DISTINCT disclosure from the Article 50 transparency notice.
  # The two documents bump independently -- an Article 50 copy change must not
  # force an ai_consent re-consent, and an ai_consent change must not re-prompt
  # the Article 50 modal. Single-sourcing each to its own constant keeps the
  # two lifecycles decoupled (PN-02).
  #
  # Content pattern (Phase 3, D-05): mirrors `LingoLinq::AiConsentDisclosures`
  # exactly. `REGISTRY` holds structured, machine-checkable FACTS only (vendor
  # list, retention windows, data categories, marking statement). The
  # long-form legal prose a reader actually reads lives in the versioned Rails
  # view (`app/views/ai_consent/disclosures/art50_v#{version}.html.erb`), not
  # here, so there is exactly one place to edit copy and one place to edit the
  # structured facts the copy must not contradict.
  #
  # TRUTHFULNESS GATES (enforced by spec/lib/lingo_linq/article50_disclosures_spec.rb,
  # not just this comment):
  # 1. Vendor allowlist: the ONLY vendors are Amazon Web Services, Inc. (which
  #    OPERATES the inference, on Amazon Bedrock, inside a LingoLinq-controlled
  #    AWS account under the AWS BAA) and Anthropic, PBC (which BUILT the model
  #    but, on Bedrock, cannot access the prompts or responses). Naming AWS is
  #    not optional detail: it is the actual processor, and an Art. 50(1) notice
  #    that names only Anthropic identifies the wrong entity and the wrong legal
  #    basis. The ONLY model named is Claude Haiku 4.5 -- the verified runtime
  #    inventory (lib/ai_board_generator.rb and lib/ai_word_predictor.rb resolve
  #    anthropic.claude-haiku-4-5 via AiClient). Claude Opus 4.7 was REMOVED
  #    2026-08-02: it is absent from the classic Bedrock catalog entirely, so
  #    eval narration invokes no model at all and falls back to a local
  #    template. Naming a model that is never invoked overstates exposure.
  #    Any other AI vendor or model (dev-loop code-review tooling, disabled
  #    fallback providers, etc.) is never a runtime AI call here and must
  #    never appear in this REGISTRY -- see CLAUDE.md's approved-reviewers
  #    table for what those non-runtime tools are, deliberately not named in
  #    this file so a mechanical grep for those names on this file stays
  #    meaningful as a truthfulness gate.
  # 2. Retention is stated as a TIERED rule, never a flat number: 24 months
  #    general / 12 rolling months for children's accounts, both overridden
  #    UPWARD to up to 5 years for EU-jurisdiction records and up to 6 years
  #    under the HIPAA audit-record hard floor (45 CFR 164.316(b)(2)).
  # 3. Vendor-side retention (what Anthropic keeps) is a separate fact, under
  #    a separate key ('vendor_side'), from LingoLinq's own AiApiLog retention
  #    (the 'lingolinq_*' keys). The two are never merged into one sentence.
  # 4. The eval-narration entries must state the de-identification that the code
  #    actually performs. lib/eval_narrator.rb#payload_for_prompt drops the
  #    student name (any key casing) and the etiology/diagnosis field before
  #    egress, and PiiScrubber runs with the resolved student's name blocklisted.
  #    An earlier revision said only "clinical evaluation notes and assessment
  #    data ... for a specific student", which is accurate about slp_notes but
  #    silent on the two removals -- and silence here OVERSTATES exposure to
  #    exactly the audience (EU parents, district DPA reviewers) this notice
  #    exists to inform. A transparency notice that undersells its own
  #    safeguards is as wrong as one that oversells them. If payload_for_prompt
  #    ever stops dropping either field, these strings become false and must
  #    change in the same commit; the spec asserts the pairing.
  #
  # Content hash design: identical rationale to AiConsentDisclosures -- this
  # hashes the STRUCTURED REGISTRY entry, not the rendered HTML, so a purely
  # cosmetic view edit does not false-positive a "content changed" signal,
  # while any substantive fact change (vendor, retention window, marking
  # statement) does change the hash and should prompt human review before a
  # CURRENT_VERSION bump.
  module Article50Disclosures
    CURRENT_VERSION = 1

    REGISTRY = {
      1 => {
        'effective_date' => '2026-07-20',
        'article' => 'EU AI Act Article 50(1), Regulation (EU) 2024/1689',
        'vendors' => [
          {
            'name' => 'Amazon Web Services, Inc.',
            'tier' => 'Amazon Bedrock, running inside a LingoLinq-controlled AWS account under a ' \
              'signed AWS Business Associate Agreement. AWS operates the inference; it is not ' \
              "Anthropic's commercial API and not the free consumer Claude.ai product.",
            'models' => [
              'Claude Haiku 4.5 (claude-haiku-4-5-20251001), used for AI board generation and AI word prediction'
            ]
          },
          {
            'name' => 'Anthropic, PBC',
            'tier' => 'Model provider only. Anthropic built the Claude models, but on Amazon ' \
              'Bedrock the models run inside AWS-operated accounts that Anthropic cannot access, ' \
              'so Anthropic does not receive the prompts sent for these features or the responses ' \
              'returned. LingoLinq does not send these requests to Anthropic directly.',
            'models' => [
              'Claude Haiku 4.5 (claude-haiku-4-5-20251001), used for AI board generation and AI word prediction'
            ]
          }
        ],
        'ai_features' => [
          {
            'key' => 'ai_board_generator',
            'name' => 'AI board generation',
            'description' => 'When creating a new AAC board, the app can send a short topic description to ' \
              'Anthropic Claude Haiku 4.5, which suggests a set of vocabulary words, a board name, and a ' \
              'short description for that topic.'
          },
          {
            'key' => 'ai_word_predictor',
            'name' => 'AI word prediction',
            'description' => 'While a communicator is building a sentence, the app can send the words typed ' \
              'so far to Anthropic Claude Haiku 4.5, which suggests likely next words to speed up communication.'
          },
          {
            'key' => 'eval_narrator',
            'name' => 'AI evaluation narration',
            'description' => 'AI-drafted evaluation narration is currently NOT ACTIVE: no evaluation data is ' \
              'sent to any AI model for this feature today. When a speech-language pathologist asks for an ' \
              'AI-drafted summary, the app produces a fixed, locally generated template instead, which never ' \
              'leaves LingoLinq. If this feature is switched on in future, the model used will be named here ' \
              'first, and the same protections would apply as for the features above: the student\'s name and ' \
              'their diagnosis are removed before anything is sent, so the model drafts about "the student" ' \
              'and the clinician fills those details in afterwards.'
          }
        ],
        'data_categories' => [
          'A short topic description typed when creating a new AAC board, when AI board generation suggests ' \
            'vocabulary words',
          'The words and sentences a communicator is actively building, when AI word prediction suggests the ' \
            'next word',
          'Evaluation session results and the clinician\'s own written notes, only when a speech-language ' \
            'pathologist chooses to generate an AI-drafted evaluation summary. The student\'s name and their ' \
            'diagnosis are removed before sending'
        ],
        'ai_marking' => {
          'summary' => 'AI-generated output from these features is machine-readably marked as required by EU ' \
            'AI Act Article 50(2). This marking is unconditional: it applies to every successful AI-generated ' \
            'output regardless of a user\'s jurisdiction, and does not depend on this transparency disclosure ' \
            'having been shown or acknowledged, or on any feature flag.'
        },
        'retention' => {
          'vendor_side' => 'AI requests for these features run on Amazon Bedrock inside a LingoLinq-controlled ' \
            'AWS account. AWS states that inputs and outputs are not used to train any model, and are not ' \
            'shared with the model provider: on Bedrock the models run in AWS-operated accounts that Anthropic ' \
            'cannot access, so Anthropic receives neither the prompts nor the responses. AWS may retain request ' \
            'data for a limited period for safety and abuse-prevention purposes. LingoLinq has not yet ' \
            'configured the account for guaranteed zero retention, so we do not claim a zero-data-retention ' \
            'guarantee for this path.',
          'lingolinq_general' => {
            'window_months' => 24,
            'note' => "LingoLinq's own record of an AI request (kept in AiApiLog for auditing) is kept for " \
              '24 months for accounts outside the EU jurisdiction that are not flagged as belonging to a child ' \
              'under 13. The EU and HIPAA floors below override this window upward when they apply, so this is ' \
              'not a flat 24-month rule for every account.'
          },
          'lingolinq_children' => {
            'window_months' => 12,
            'rolling' => true,
            'note' => "LingoLinq's own record of an AI request is kept for a rolling 12 months, independent of " \
              'whether the account stays open or closed, for accounts flagged as belonging to a child under 13. ' \
              'The EU and HIPAA floors below override this window upward when they apply.'
          },
          'lingolinq_eu' => {
            'window_years' => 5,
            'note' => "LingoLinq's own record of an AI request is kept for up to 5 years for accounts in the " \
              'EU jurisdiction, as part of the record-keeping this Article 50 disclosure itself describes.'
          },
          'lingolinq_hipaa_floor' => {
            'window_years' => 6,
            'note' => "LingoLinq's own record of an AI request is kept for up to 6 years, as a hard floor, " \
              'for accounts subject to the HIPAA audit-record retention requirement (45 CFR 164.316(b)(2)). ' \
              'This hard floor overrides the general and children windows above upward whenever it applies; ' \
              'it is never shortened by them.'
          },
          'ip_address' => {
            'window_days' => 90,
            'note' => 'The IP address on any AI request record is removed after 90 days, for every account.'
          },
          'account_deletion' => "The AI request log tied to an account is deleted when the account itself is " \
            'deleted.'
        }
      }.freeze
    }.freeze

    # Returns JSON-serializable metadata for the given version, or nil when
    # the version is unknown. String keys throughout (matches Art50Marker /
    # AiConsentDisclosures conventions).
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
