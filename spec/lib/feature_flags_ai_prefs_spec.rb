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

    # Legacy rows stored "" for the master pref. That value fell past the nil
    # check, past the false check, and then failed the strict per-feature check,
    # blocking board generation for 9 of 31 production users with no way to
    # clear it from the UI.
    it 'treats a blank master exactly like an absent master' do
      ['', '   '].each do |blank|
        u = User.new(settings: { 'preferences' => { 'ai_features_enabled' => blank } })
        expect(FeatureFlags.user_pref_allows_ai?('ai_board_generation', u)).to eq(true)
      end
    end

    it 'allows a blank master even when the child pref is also blank' do
      u = User.new(settings: {
        'preferences' => { 'ai_features_enabled' => '', 'ai_board_generation' => '' }
      })
      expect(FeatureFlags.user_pref_allows_ai?('ai_board_generation', u)).to eq(true)
    end

    # The three states must stay distinguishable. Guards against a future
    # `master.blank?` refactor: in Rails `false.blank?` is true, so `.blank?`
    # would reclassify an explicit opt-OUT as "never decided" and re-enable AI.
    it 'keeps an explicit false blocking, and does not confuse it with blank' do
      [false, 'false'].each do |off|
        u = User.new(settings: { 'preferences' => { 'ai_features_enabled' => off } })
        expect(FeatureFlags.user_pref_allows_ai?('ai_board_generation', u)).to eq(false)
        expect(FeatureFlags.user_pref_allows_ai?('comprehensive_eval_ai', u)).to eq(false)
      end
    end

    # The blank-master allowance is scoped to the MASTER key only. An explicit
    # master opt-in with a blank/missing child is an INCOMPLETE opt-in, and
    # allowing it would manufacture per-feature consent the user never gave.
    it 'still blocks when master is true but the child pref is blank or missing' do
      ['', '   ', nil].each do |child|
        prefs = { 'ai_features_enabled' => true }
        prefs['ai_board_generation'] = child unless child.nil?
        u = User.new(settings: { 'preferences' => prefs })
        expect(FeatureFlags.user_pref_allows_ai?('ai_board_generation', u)).to eq(false)
      end
    end
  end

  describe '.blank_ai_master_pref?' do
    it 'counts only nil and whitespace-only strings as absent' do
      [nil, '', ' ', "\t"].each do |v|
        expect(FeatureFlags.blank_ai_master_pref?(v)).to eq(true)
      end
    end

    it 'does not treat falsey non-string values as absent' do
      [false, 0, '0', 'false'].each do |v|
        expect(FeatureFlags.blank_ai_master_pref?(v)).to eq(false)
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
