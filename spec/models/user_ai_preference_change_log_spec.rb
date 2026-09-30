require 'spec_helper'

# Turning AI features on or off is recorded with who made the change and when, the
# same way usage-logging changes are (User::CONFIRMATION_PREFERENCE_PARAMS).
describe User, 'AI preference change log' do
  let(:updater) { User.create }

  def change(user, prefs)
    user.process_params({ 'preferences' => prefs }, { 'updater' => updater })
  end

  it 'records who turned AI on and when' do
    u = User.new(settings: { 'preferences' => {} })
    change(u, 'ai_features_enabled' => true, 'ai_word_prediction' => true)
    entries = (u.settings['confirmation_log'] || []).select { |e| e['setting'].to_s.start_with?('ai_') }
    expect(entries.map { |e| e['setting'] }).to match_array(%w[ai_features_enabled ai_word_prediction])
    entries.each do |entry|
      expect(entry['updater']).to eq(updater.global_id)
      expect(entry['timestamp']).to be_present
    end
  end

  it 'records turning AI off' do
    u = User.new(settings: { 'preferences' => { 'ai_features_enabled' => true } })
    change(u, 'ai_features_enabled' => false)
    entry = (u.settings['confirmation_log'] || []).detect { |e| e['setting'] == 'ai_features_enabled' }
    expect(entry).to be_present
    expect(entry['updater']).to eq(updater.global_id)
  end

  it 'records a change to every AI preference key' do
    User::EU_AI_PREF_KEYS.each do |key|
      u = User.new(settings: { 'preferences' => {} })
      change(u, key => true)
      expect((u.settings['confirmation_log'] || []).map { |e| e['setting'] }).to include(key), key
    end
  end
end
