require 'spec_helper'

describe FeatureFlags, 'AI prefs and EU parental gate' do
  around(:each) do |example|
    old_coppa = ENV['COPPA_AI_HARD_GATE']
    old_eu = ENV['EU_AI_PARENTAL_HARD_GATE']
    ENV.delete('COPPA_AI_HARD_GATE')
    ENV.delete('EU_AI_PARENTAL_HARD_GATE')
    example.run
  ensure
    ENV['COPPA_AI_HARD_GATE'] = old_coppa
    ENV['EU_AI_PARENTAL_HARD_GATE'] = old_eu
  end

  describe 'USER_PREF_AI_FEATURES' do
    it 'lists the four per-feature AI prefs' do
      expect(FeatureFlags::USER_PREF_AI_FEATURES).to match_array(%w[
        ai_board_generation ai_word_prediction ai_board_suggestions ai_symbol_search
      ])
    end
  end

  describe '.eu_ai_parental_hard_gate_enabled?' do
    it 'defaults to true' do
      expect(FeatureFlags.eu_ai_parental_hard_gate_enabled?).to eq(true)
    end

    it "returns false only when explicitly set to 'false'" do
      ENV['EU_AI_PARENTAL_HARD_GATE'] = 'false'
      expect(FeatureFlags.eu_ai_parental_hard_gate_enabled?).to eq(false)
    end
  end

  describe '.eu_under16_blocks_ai_for?' do
    it 'returns false for nil user' do
      expect(FeatureFlags.eu_under16_blocks_ai_for?(nil)).to eq(false)
    end

    it 'returns true when eu_under_16 without active consent' do
      u = User.new(settings: {
        'registration' => { 'eu_under_16' => true },
        'eu_ai_parental_consent' => { 'pending_parent_consent' => true }
      })
      expect(FeatureFlags.eu_under16_blocks_ai_for?(u)).to eq(true)
    end

    it 'returns false when consent is active' do
      u = User.new(settings: {
        'registration' => { 'eu_under_16' => true },
        'eu_ai_parental_consent' => { 'parent_consent_granted_at' => Time.now.utc.iso8601 }
      })
      expect(FeatureFlags.eu_under16_blocks_ai_for?(u)).to eq(false)
    end

    it 'returns false when hard gate is disabled' do
      ENV['EU_AI_PARENTAL_HARD_GATE'] = 'false'
      u = User.new(settings: {
        'registration' => { 'eu_under_16' => true }
      })
      expect(FeatureFlags.eu_under16_blocks_ai_for?(u)).to eq(false)
    end
  end

  describe '.user_pref_allows_ai?' do
    it 'grandfathers when master is nil' do
      u = User.new(settings: { 'preferences' => {} })
      expect(FeatureFlags.user_pref_allows_ai?('ai_board_generation', u)).to eq(true)
    end

    it 'blocks all when master is false' do
      u = User.new(settings: { 'preferences' => { 'ai_features_enabled' => false } })
      expect(FeatureFlags.user_pref_allows_ai?('ai_board_generation', u)).to eq(false)
      expect(FeatureFlags.user_pref_allows_ai?('comprehensive_eval_ai', u)).to eq(false)
    end

    it 'requires per-feature true when master is true for USER_PREF_AI_FEATURES' do
      u = User.new(settings: {
        'preferences' => {
          'ai_features_enabled' => true,
          'ai_board_generation' => true,
          'ai_word_prediction' => false
        }
      })
      expect(FeatureFlags.user_pref_allows_ai?('ai_board_generation', u)).to eq(true)
      expect(FeatureFlags.user_pref_allows_ai?('ai_word_prediction', u)).to eq(false)
      expect(FeatureFlags.user_pref_allows_ai?('ai_symbol_search', u)).to eq(false)
    end

    it 'allows non-pref AI features when master is true' do
      u = User.new(settings: { 'preferences' => { 'ai_features_enabled' => true } })
      expect(FeatureFlags.user_pref_allows_ai?('comprehensive_eval_ai', u)).to eq(true)
      expect(FeatureFlags.user_pref_allows_ai?('ai_compliance_logging', u)).to eq(true)
    end

    it 'fails closed on an unrecognized master value for every AI feature' do
      ['', '   ', 'maybe', {}].each do |value|
        u = User.new(settings: { 'preferences' => { 'ai_features_enabled' => value } })
        expect(FeatureFlags.user_pref_allows_ai?('ai_board_generation', u)).to eq(false)
        expect(FeatureFlags.user_pref_allows_ai?('comprehensive_eval_ai', u)).to eq(false)
      end
    end

    it 'recognizes numeric boolean forms consistently' do
      [0, '0'].each do |off|
        u = User.new(settings: { 'preferences' => { 'ai_features_enabled' => off } })
        expect(FeatureFlags.user_pref_allows_ai?('ai_board_generation', u)).to eq(false)
      end
      [1, '1'].each do |on|
        u = User.new(settings: { 'preferences' => {
          'ai_features_enabled' => on, 'ai_board_generation' => on
        } })
        expect(FeatureFlags.user_pref_allows_ai?('ai_board_generation', u)).to eq(true)
      end
    end
  end

  describe '.ai_feature_enabled_for?' do
    let(:feature) { 'ai_board_generation' }

    it 'returns false when eu_under16 blocks' do
      u = User.new(settings: {
        'registration' => { 'eu_under_16' => true },
        'preferences' => {}
      })
      allow(FeatureFlags).to receive(:ai_enabled_for?).with(u).and_return(true)
      allow(FeatureFlags).to receive(:feature_enabled_for?).with(feature, u).and_return(true)
      expect(FeatureFlags.ai_feature_enabled_for?(feature, u)).to eq(false)
    end

    it 'returns false when master pref is false even if feature flag is on' do
      u = User.new(settings: {
        'preferences' => { 'ai_features_enabled' => false }
      })
      allow(FeatureFlags).to receive(:ai_enabled_for?).with(u).and_return(true)
      allow(FeatureFlags).to receive(:feature_enabled_for?).with(feature, u).and_return(true)
      expect(FeatureFlags.ai_feature_enabled_for?(feature, u)).to eq(false)
    end

    it 'returns true when grandfather prefs, feature flag on, and no consent blocks' do
      u = User.new(settings: { 'preferences' => {} })
      allow(FeatureFlags).to receive(:ai_enabled_for?).with(u).and_return(true)
      allow(FeatureFlags).to receive(:feature_enabled_for?).with(feature, u).and_return(true)
      expect(FeatureFlags.ai_feature_enabled_for?(feature, u)).to eq(true)
    end
  end
end
