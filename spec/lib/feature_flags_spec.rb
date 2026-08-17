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

  describe "boards_layout preference" do
    # The Boards-page arrangement is persisted per USER so the choice follows them to a
    # new login. Two things have to hold for that: the key must be in the preference
    # whitelist (User#process_params drops anything else SILENTLY — the pref would look
    # saved client-side and be gone on reload), and the value must be constrained.
    it "is an accepted user preference" do
      expect(User::PREFERENCE_PARAMS).to include('boards_layout')
    end

    it "persists a known value" do
      u = User.create
      u.process({'preferences' => {'boards_layout' => 'top-down'}})
      expect(u.settings['preferences']['boards_layout']).to eq('top-down')
      u.process({'preferences' => {'boards_layout' => 'side-by-side'}})
      expect(u.settings['preferences']['boards_layout']).to eq('side-by-side')
    end

    it "DROPS an unknown value rather than storing client JSON" do
      u = User.create
      u.process({'preferences' => {'boards_layout' => 'top-down'}})
      u.process({'preferences' => {'boards_layout' => 'diagonal'}})
      expect(u.settings['preferences']['boards_layout']).to eq(nil)
    end

    it "stores no server-side default — absent means the client default applies" do
      u = User.create
      expect(u.settings['preferences']['boards_layout']).to eq(nil)
    end
  end

  describe "flag list invariants" do
    # A flag forced on for everyone but never registered as available is a typo that
    # frontend_flags_for silently swallows: the intersection with the available pool
    # is what reaches the client, so the misspelled flag is simply never true and the
    # feature looks broken with nothing logged.
    it "every enabled frontend feature is also registered as available" do
      unregistered = FeatureFlags::ENABLED_FRONTEND_FEATURES - FeatureFlags::AVAILABLE_FRONTEND_FEATURES
      expect(unregistered).to eq([]), "enabled but not available (typo?): #{unregistered.inspect}"
    end

    it "registers no duplicates in either list" do
      %w[AVAILABLE_FRONTEND_FEATURES ENABLED_FRONTEND_FEATURES].each do |list_name|
        list = FeatureFlags.const_get(list_name)
        dups = list.select { |f| list.count(f) > 1 }.uniq
        expect(dups).to eq([]), "#{list_name} has duplicates: #{dups.inspect}"
      end
    end
  end

  describe "boards_side_by_side_layout" do
    # TRIPWIRE, not a preference. This flag is TEMPORARILY forced on for everyone
    # (2026-08-16) so the Boards-page layout selector is visible for design comparison
    # without a per-user opt-in. Turning it off before production go-live means REMOVING
    # it from ENABLED_FRONTEND_FEATURES — at which point the second expectation below
    # fails and this spec must be updated to the "available but OFF by default" shape
    # used by compliance_workflow_kernel above. The failure is the reminder.
    it "is registered as available" do
      expect(FeatureFlags::AVAILABLE_FRONTEND_FEATURES).to include('boards_side_by_side_layout')
    end

    it "is currently forced ON for everyone — remove from ENABLED before go-live" do
      expect(FeatureFlags::ENABLED_FRONTEND_FEATURES).to include('boards_side_by_side_layout')
    end
  end
end
