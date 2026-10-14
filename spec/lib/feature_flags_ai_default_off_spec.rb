require 'spec_helper'

# AI features are off until they are turned on for the account (product direction,
# 2026-09-30): an account that never recorded an AI choice gets no AI, the same way
# usage logging defaults to off.
describe FeatureFlags, 'AI features default to off' do
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

  let(:features) { FeatureFlags::AI_FEATURES + ['voice_transcription'] }

  describe '.user_pref_allows_ai?' do
    it 'is off when the account never recorded an AI choice' do
      u = User.new(settings: { 'preferences' => {} })
      features.each do |feature|
        expect(FeatureFlags.user_pref_allows_ai?(feature, u)).to eq(false), feature
      end
    end

    it 'is off when the master choice is stored as null' do
      u = User.new(settings: { 'preferences' => { 'ai_features_enabled' => nil } })
      features.each do |feature|
        expect(FeatureFlags.user_pref_allows_ai?(feature, u)).to eq(false), feature
      end
    end

    it 'is off when the account has no preferences hash' do
      u = User.new(settings: {})
      expect(FeatureFlags.user_pref_allows_ai?('ai_word_prediction', u)).to eq(false)
      u = User.new(settings: { 'preferences' => 'unreadable' })
      expect(FeatureFlags.user_pref_allows_ai?('ai_word_prediction', u)).to eq(false)
    end

    it 'is off when there is no account' do
      expect(FeatureFlags.user_pref_allows_ai?('ai_word_prediction', nil)).to eq(false)
    end

    it 'is on for a feature the account turned on' do
      u = User.new(settings: { 'preferences' => {
        'ai_features_enabled' => true, 'ai_word_prediction' => true
      } })
      expect(FeatureFlags.user_pref_allows_ai?('ai_word_prediction', u)).to eq(true)
      expect(FeatureFlags.user_pref_allows_ai?('voice_transcription', u)).to eq(true)
    end
  end

  describe '.ai_feature_enabled_for?' do
    it 'is off for an account that never recorded an AI choice, even with the feature available' do
      u = User.new(settings: { 'preferences' => {} })
      allow(FeatureFlags).to receive(:feature_enabled_for?).and_return(true)
      FeatureFlags::AI_FEATURES.each do |feature|
        expect(FeatureFlags.ai_feature_enabled_for?(feature, u)).to eq(false), feature
      end
    end
  end
end
