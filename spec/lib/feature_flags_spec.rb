require 'spec_helper'

describe FeatureFlags do
  describe "frontend_flags_for" do
    it "should gracefully handle no user" do
      stub_const('FeatureFlags::AVAILABLE_FRONTEND_FEATURES', [])
      flags = FeatureFlags.frontend_flags_for(nil)
      expect(flags).to eq({})
    end
    
    it "should return the default set of flags" do
      stub_const('FeatureFlags::AVAILABLE_FRONTEND_FEATURES', ['a', 'b', 'c'])
      stub_const('FeatureFlags::ENABLED_FRONTEND_FEATURES', ['d', 'b', 'c'])
      allow(SystemFeatureSettings).to receive(:effective_enabled_for).and_return(['b', 'c'])
      flags = FeatureFlags.frontend_flags_for(nil)
      expect(flags).to eq({'b' => true, 'c' => true})
    end
    
    it "should consider user-specific flags in the beta opt-in pool" do
      stub_const('FeatureFlags::AVAILABLE_FRONTEND_FEATURES', ['a', 'b', 'c'])
      stub_const('FeatureFlags::ENABLED_FRONTEND_FEATURES', ['b'])
      allow(SystemFeatureSettings).to receive(:effective_enabled_for).and_return(['b'])
      allow(SystemFeatureSettings).to receive(:canary_enabled_features).and_return(['c'])
      allow(SystemFeatureSettings).to receive(:beta_opt_in_features).and_return(['c'])
      u = User.new(:settings => {})
      u.settings['feature_flags'] = {'c' => true, 'd' => true}
      flags = FeatureFlags.frontend_flags_for(u)
      expect(flags).to eq({'b' => true, 'c' => true})
    end
    
    it "should enable canary pool features for canary users" do
      stub_const('FeatureFlags::AVAILABLE_FRONTEND_FEATURES', ['a', 'b', 'c'])
      stub_const('FeatureFlags::ENABLED_FRONTEND_FEATURES', ['b'])
      stub_const('FeatureFlags::DISABLED_CANARY_FEATURES', ['a'])
      allow(SystemFeatureSettings).to receive(:effective_enabled_for).and_return(['b'])
      allow(SystemFeatureSettings).to receive(:canary_enabled_features).and_return(['b', 'c'])
      allow(SystemFeatureSettings).to receive(:beta_opt_in_features).and_return(['c'])
      u = User.new(:settings => {})
      u.enable_feature('canary')
      flags = FeatureFlags.frontend_flags_for(u)
      expect(flags).to eq({'b' => true, 'c' => true})
    end

    it "should ignore per-user flags outside the beta opt-in pool" do
      stub_const('FeatureFlags::AVAILABLE_FRONTEND_FEATURES', ['a', 'b', 'c'])
      allow(SystemFeatureSettings).to receive(:effective_enabled_for).and_return(['b'])
      allow(SystemFeatureSettings).to receive(:canary_enabled_features).and_return([])
      allow(SystemFeatureSettings).to receive(:beta_opt_in_features).and_return(['b'])
      u = User.new(:settings => {})
      u.settings['feature_flags'] = {'c' => true}
      flags = FeatureFlags.frontend_flags_for(u)
      expect(flags).to eq({'b' => true})
    end
  end
  
  describe "user_created_after?" do
    it "should return the correct response" do
      u = User.new
      expect(FeatureFlags.user_created_after?(u, 'word_suggestion_images')).to eq(true)
      u.created_at = Date.parse("Jan 1, 2000")
      expect(FeatureFlags.user_created_after?(u, 'word_suggestion_images')).to eq(false)
      u.created_at = Date.parse("Jan 1, 2020")
      expect(FeatureFlags.user_created_after?(u, 'word_suggestion_images')).to eq(true)
      u.created_at = Date.parse("Jan 1, 2020")
      expect(FeatureFlags.user_created_after?(u, 'bacon')).to eq(false)
      u.created_at = 2.days.ago
      expect(FeatureFlags.user_created_after?(u, 'bacon')).to eq(false)
      u.created_at = nil
      expect(FeatureFlags.user_created_after?(u, 'bacon')).to eq(false)
    end
  end

  describe "coppa_ai_hard_gate_enabled?" do
    around(:each) do |example|
      old = ENV['COPPA_AI_HARD_GATE']
      example.run
    ensure
      ENV['COPPA_AI_HARD_GATE'] = old
    end

    it "defaults to true when env var is unset" do
      ENV.delete('COPPA_AI_HARD_GATE')
      expect(FeatureFlags.coppa_ai_hard_gate_enabled?).to eq(true)
    end

    it "returns true for any value other than 'false'" do
      ENV['COPPA_AI_HARD_GATE'] = 'true'
      expect(FeatureFlags.coppa_ai_hard_gate_enabled?).to eq(true)
      ENV['COPPA_AI_HARD_GATE'] = '1'
      expect(FeatureFlags.coppa_ai_hard_gate_enabled?).to eq(true)
    end

    it "returns false only when explicitly set to 'false'" do
      ENV['COPPA_AI_HARD_GATE'] = 'false'
      expect(FeatureFlags.coppa_ai_hard_gate_enabled?).to eq(false)
      ENV['COPPA_AI_HARD_GATE'] = 'FALSE'
      expect(FeatureFlags.coppa_ai_hard_gate_enabled?).to eq(false)
    end
  end

  describe "coppa_blocks_ai_for?" do
    around(:each) do |example|
      old = ENV['COPPA_AI_HARD_GATE']
      ENV.delete('COPPA_AI_HARD_GATE')
      example.run
    ensure
      ENV['COPPA_AI_HARD_GATE'] = old
    end

    it "returns false when user is nil" do
      expect(FeatureFlags.coppa_blocks_ai_for?(nil)).to eq(false)
    end

    it "returns false when user has no coppa settings" do
      u = User.new(settings: {})
      expect(FeatureFlags.coppa_blocks_ai_for?(u)).to eq(false)
    end

    it "returns true when user has pending parental consent" do
      u = User.new(settings: { 'coppa' => { 'pending_parent_consent' => true } })
      expect(FeatureFlags.coppa_blocks_ai_for?(u)).to eq(true)
    end

    it "returns false when consent has been granted" do
      u = User.new(settings: { 'coppa' => {
        'pending_parent_consent' => true,
        'parent_consent_granted_at' => Time.now.utc.iso8601
      }})
      expect(FeatureFlags.coppa_blocks_ai_for?(u)).to eq(false)
    end

    it "returns false when the hard gate is disabled, even with pending consent" do
      ENV['COPPA_AI_HARD_GATE'] = 'false'
      u = User.new(settings: { 'coppa' => { 'pending_parent_consent' => true } })
      expect(FeatureFlags.coppa_blocks_ai_for?(u)).to eq(false)
    end
  end

  # Runtime verification for adult-beta-ai-focus-consent /
  # adult-beta-ai-master-consent (audit-reports/strategy/READINESS-MILESTONES.json):
  # exercises the real org-level disable_ai_features toggle directly. Every
  # existing caller of ai_enabled_for? across the spec suite stubs its return
  # value rather than driving this method itself, so the org-level AI opt-out
  # gate had no direct, unstubbed coverage before this. Lightweight doubles
  # (no database), same style as eu_jurisdiction_spec.rb: ai_enabled_for?
  # only reads .managing_organization / .organization and the org's .settings.
  describe "ai_enabled_for?" do
    def org(settings = {})
      Struct.new(:settings).new(settings)
    end

    def user(org_obj: nil)
      u = Object.new
      u.define_singleton_method(:managing_organization) { org_obj }
      u
    end

    it "returns true for a nil user (fail-open only in the no-user case)" do
      expect(FeatureFlags.ai_enabled_for?(nil)).to eq(true)
    end

    it "allows AI when the user has no org at all" do
      expect(FeatureFlags.ai_enabled_for?(user(org_obj: nil))).to eq(true)
    end

    it "allows AI when the user's managing organization has not disabled it" do
      u = user(org_obj: org({}))
      expect(FeatureFlags.ai_enabled_for?(u)).to eq(true)
    end

    it "blocks AI for a user whose org has disabled it, fail-closed on the org toggle alone" do
      # No COPPA/EU/user-pref state is set at all -- the org toggle alone must
      # be sufficient to block, independent of every other gate layer.
      u = user(org_obj: org({ 'disable_ai_features' => true }))
      expect(FeatureFlags.ai_enabled_for?(u)).to eq(false)
    end

    it "re-allows AI once the org's disable_ai_features setting is cleared" do
      settings = { 'disable_ai_features' => true }
      u = user(org_obj: org(settings))
      expect(FeatureFlags.ai_enabled_for?(u)).to eq(false)
      settings['disable_ai_features'] = false
      expect(FeatureFlags.ai_enabled_for?(u)).to eq(true)
    end
  end

  describe "eu_consent_age" do
    it "is registered as available but OFF by default" do
      expect(FeatureFlags::AVAILABLE_FRONTEND_FEATURES).to include('eu_consent_age')
      expect(FeatureFlags::ENABLED_FRONTEND_FEATURES).not_to include('eu_consent_age')
      expect(FeatureFlags.eu_consent_age_enabled?).to eq(false)
    end

    it "reports enabled once added to the enabled list" do
      stub_const('FeatureFlags::ENABLED_FRONTEND_FEATURES', FeatureFlags::ENABLED_FRONTEND_FEATURES + ['eu_consent_age'])
      expect(FeatureFlags.eu_consent_age_enabled?).to eq(true)
    end
  end

  describe "compliance_workflow_kernel" do
    it "is registered as available but OFF by default" do
      expect(FeatureFlags::AVAILABLE_FRONTEND_FEATURES).to include('compliance_workflow_kernel')
      expect(FeatureFlags::ENABLED_FRONTEND_FEATURES).not_to include('compliance_workflow_kernel')
      expect(FeatureFlags.compliance_workflow_kernel_enabled?).to eq(false)
    end

    it "reports enabled once added to the enabled list" do
      stub_const('FeatureFlags::ENABLED_FRONTEND_FEATURES', FeatureFlags::ENABLED_FRONTEND_FEATURES + ['compliance_workflow_kernel'])
      expect(FeatureFlags.compliance_workflow_kernel_enabled?).to eq(true)
    end
  end
end
