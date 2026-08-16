# frozen_string_literal: true

require 'spec_helper'
require 'json'

# Cross-surface truthfulness guard for every place LingoLinq describes its runtime
# AI to users.
#
# WHY THIS EXISTS
#   On 2026-08-02 the structured registries (LingoLinq::AiConsentDisclosures and
#   LingoLinq::Article50Disclosures) were corrected to say runtime AI egresses to
#   AWS Bedrock, that Anthropic receives nothing on that path, that no
#   zero-data-retention guarantee is claimed, and that eval narration is inactive.
#
#   Every one of those claims ALSO lives in places no register, artifact check, or
#   module spec touches:
#     - app/frontend/app/templates/privacy.hbs  (Ember, never loaded by Rails specs)
#     - public/locales/*.json                   (13 files; 12 still claimed a Gemini
#                                                fallback disabled 2026-07-09)
#     - config/locales/en.yml                   (server-rendered consent copy)
#
#   Fixing the metadata left all of them asserting the old, false story. The gap was
#   caught in review, not by CI, which is exactly the hole this file closes.
#
# The banned-claim list and the negation handling live in
# spec/support/ai_disclosure_claims.rb, shared with the rendered-page specs in
# spec/controllers/ai_consent/disclosures_controller_spec.rb.
describe 'AI disclosure rendered surfaces' do
  repo_root = File.expand_path('../../..', __dir__)

  privacy_template_path = File.join(repo_root, 'app/frontend/app/templates/privacy.hbs')
  rails_locale_path = File.join(repo_root, 'config/locales/en.yml')
  frontend_locale_paths = Dir[File.join(repo_root, 'public/locales/*.json')].sort.freeze

  let(:privacy_template) { File.read(privacy_template_path) }
  let(:rails_locale) { File.read(rails_locale_path) }

  describe 'app/frontend/app/templates/privacy.hbs' do
    it 'asserts none of the banned AI claims' do
      offenders = AiDisclosureClaims.offending_claims(privacy_template)
      expect(offenders).to be_empty,
                           "privacy.hbs still #{offenders.join('; ')}"
    end

    # Structural, not phrase-matched: the phrase list missed this claim twice,
    # written a different way each time.
    it 'never ties evaluation summaries to data egress without marking them inactive' do
      violations = AiDisclosureClaims.eval_egress_violations(privacy_template)
      expect(violations).to be_empty,
                            "privacy.hbs asserts evaluation-data egress:\n  #{violations.join("\n  ")}"
    end

    it 'names AWS Bedrock as the runtime host' do
      expect(privacy_template).to match(/Amazon Bedrock/)
    end

    it 'states that AI-drafted evaluation summaries are inactive' do
      expect(privacy_template).to match(/evaluation summaries are currently inactive/i)
    end

    # The honest disclaimer must SURVIVE the guard above -- this pins the
    # distinction between denying a guarantee and making one.
    it 'declines rather than asserts a zero-retention guarantee' do
      expect(privacy_template).to match(/do not currently claim a zero-data-retention guarantee/i)
    end
  end

  describe 'public/locales/*.json' do
    it 'has locale files to check' do
      expect(frontend_locale_paths).not_to be_empty
    end

    # Every user-visible AI string, not just the vendor paragraph. Scoping the
    # previous version of this check to `privacy_sharing_ai_vendors` alone is
    # exactly why a stale claim in `privacy_special_ai_consent_intro` shipped.
    AI_STRING_KEYS = %w[
      privacy_sharing_ai_vendors
      privacy_sharing_ai
      privacy_special_ai_consent_intro
      privacy_special_ai_board_suggestions_note
      privacy_special_coppa_v2
    ].freeze

    it 'asserts no banned AI claim in any user-visible AI string' do
      failures = frontend_locale_paths.flat_map do |path|
        data = begin
          JSON.parse(File.read(path))
        rescue JSON::ParserError
          next []
        end

        AI_STRING_KEYS.flat_map do |key|
          value = data[key]
          next [] if value.nil?

          AiDisclosureClaims.offending_claims(value).map { |d| "#{File.basename(path)} [#{key}]: #{d}" }
        end
      end

      expect(failures).to be_empty, "stale AI claims still shipped to users:\n  #{failures.join("\n  ")}"
    end

    it 'never ties evaluation summaries to data egress without marking them inactive' do
      failures = frontend_locale_paths.flat_map do |path|
        data = begin
          JSON.parse(File.read(path))
        rescue JSON::ParserError
          next []
        end

        AI_STRING_KEYS.flat_map do |key|
          value = data[key]
          next [] if value.nil?

          AiDisclosureClaims.eval_egress_violations(value).map { |s| "#{File.basename(path)} [#{key}]: #{s}" }
        end
      end

      expect(failures).to be_empty, "eval-egress claims still shipped to users:\n  #{failures.join("\n  ")}"
    end
  end

  describe 'config/locales/en.yml (server-rendered consent copy)' do
    it 'asserts none of the banned AI claims' do
      offenders = AiDisclosureClaims.offending_claims(rails_locale)
      expect(offenders).to be_empty, "config/locales/en.yml still #{offenders.join('; ')}"
    end

    it 'does not present evaluation data as currently sent' do
      expect(rails_locale).to match(/what_we_send_item_eval:.*nothing is sent today/i)
    end
  end

  # Ties the surfaces back to the registry so they cannot diverge again: whatever
  # the registry says about eval narration, the rendered copy must agree. Turning
  # eval narration back on therefore fails here until the user-facing copy is
  # updated in the same change.
  describe 'consistency with the structured registry' do
    it 'keeps rendered eval-narration status aligned with the active vendor features' do
      active_features = LingoLinq::AiConsentDisclosures.metadata(1)['vendors']
                                                       .flat_map { |v| v['features'] || [] }.uniq

      if active_features.include?('eval_narrator')
        expect(rails_locale).not_to match(/what_we_send_item_eval:.*nothing is sent today/i)
      else
        expect(rails_locale).to match(/what_we_send_item_eval:.*nothing is sent today/i)
        expect(privacy_template).to match(/evaluation summaries are currently inactive/i)
      end
    end
  end
end
