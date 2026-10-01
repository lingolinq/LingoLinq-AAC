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

  it 'records the old and new value when AI goes from off to on' do
    u = User.new(settings: { 'preferences' => { 'ai_features_enabled' => false } })
    change(u, 'ai_features_enabled' => true)
    entries = (u.settings['confirmation_log'] || []).select { |e| e['setting'] == 'ai_features_enabled' }
    expect(entries.length).to eq(1)
    expect(entries[0]['from']).to eq(false)
    expect(entries[0]['to']).to eq(true)
    expect(entries[0]['updater']).to eq(updater.global_id)
  end

  it 'records nothing for AI preferences when a save leaves them unchanged' do
    u = User.new(settings: { 'preferences' => {
      'ai_features_enabled' => true, 'ai_word_prediction' => true, 'ai_board_generation' => true
    } })
    change(u, 'beta_agreement_accepted' => true)
    change(u, 'ai_features_enabled' => 'true', 'ai_word_prediction' => true)
    change(u, 'ai_board_generation' => '')
    entries = (u.settings['confirmation_log'] || []).select { |e| e['setting'].to_s.start_with?('ai_') }
    expect(entries).to eq([])
  end

  it 'marks entries the EU under-16 rule forced, so they are not read as a person turning AI off' do
    # A saved account: a new record recomputes its registration flags.
    u = User.create(settings: { 'registration' => { 'eu_under_16' => true } })
    User::EU_AI_PREF_KEYS.each { |k| u.settings['preferences'].delete(k) }
    change(u, 'beta_agreement_accepted' => true)
    entries = (u.settings['confirmation_log'] || []).select { |e| e['setting'].to_s.start_with?('ai_') }
    expect(entries.map { |e| e['setting'] }).to match_array(User::EU_AI_PREF_KEYS)
    entries.each do |entry|
      expect(entry['source']).to eq('eu_forced')
      expect(entry['from']).to eq(nil)
      expect(entry['to']).to eq(false)
    end
  end

  it 'leaves a person\'s own change unmarked' do
    u = User.new(settings: { 'preferences' => { 'ai_features_enabled' => false } })
    change(u, 'ai_features_enabled' => true)
    entry = (u.settings['confirmation_log'] || []).detect { |e| e['setting'] == 'ai_features_enabled' }
    expect(entry).to be_present
    expect(entry.key?('source')).to eq(false)
  end

  it 'records a change to every AI preference key' do
    User::EU_AI_PREF_KEYS.each do |key|
      u = User.new(settings: { 'preferences' => {} })
      change(u, key => true)
      expect((u.settings['confirmation_log'] || []).map { |e| e['setting'] }).to include(key), key
    end
  end
end
