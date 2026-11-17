# frozen_string_literal: true

# AI data-sharing consent (#1136) in specs.
#
# FeatureFlags.ai_consent_blocks_ai_for? blocks every AI call site for an account with no
# current consent. The suites that existed before that check test other things at those
# sites (COPPA, Article 50, PII scrubbing, caching, response shapes) with accounts that
# carry no consent record, so they include 'ai data-sharing consent given', which answers
# the check "not blocked" for every account in the group.
#
# The check itself is tested WITHOUT this context: spec/lib/feature_flags_spec.rb (the
# predicate) and spec/lib/ai_consent_gate_spec.rb plus spec/controllers/ai_consent_gate_spec.rb
# (each call site). Never include it in a group that asserts on consent.
RSpec.shared_context 'ai data-sharing consent given' do
  before(:each) do
    allow(FeatureFlags).to receive(:ai_consent_blocks_ai_for?).and_return(false)
  end
end

# A real, current consent record on a persisted account, for the groups that test the check.
def grant_test_ai_consent!(user)
  user.settings ||= {}
  user.settings['ai_consent'] = {
    'granted_at' => Time.now.utc.iso8601,
    'disclosures_version' => LingoLinq::AiConsentDisclosures::CURRENT_VERSION,
    'source' => 'in_app'
  }
  user.save!
  user
end
