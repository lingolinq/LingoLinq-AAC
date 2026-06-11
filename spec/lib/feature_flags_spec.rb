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
end
