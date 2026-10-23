require 'spec_helper'

# Voice transcription is Google speech recognition. It runs while the account's personal
# "Allow AI features" preference was never set (AI features default to off, 2026-09-30), and
# it stops when the person explicitly turned AI features off (Scot, 2026-10-22, from the #1130
# release review). The org switch and the COPPA and EU under-16 checks are unchanged.
describe ButtonSound, 'transcription and the personal AI switch' do
  def scheduled?(bs)
    Worker.scheduled?(ButtonSound, :perform_action, {:id => bs.id, :method => 'schedule_transcription', :arguments => [true]})
  end

  def schedule_for(prefs)
    u = User.create(:settings => {'preferences' => prefs})
    bs = ButtonSound.create(:user => u, :settings => {})
    allow(bs).to receive(:secondary_url).and_return("http://www.example.com/sound.wav")
    bs.schedule_transcription
    bs
  end

  it 'schedules transcription for an account that never recorded an AI choice' do
    u = User.create(:settings => {'preferences' => {}})
    expect(FeatureFlags.user_pref_allows_ai?('ai_word_prediction', u)).to eq(false)
    bs = ButtonSound.create(:user => u, :settings => {})
    expect(bs).to receive(:secondary_url).and_return("http://www.example.com/sound.wav")
    bs.schedule_transcription
    expect(scheduled?(bs)).to eq(true)
  end

  it 'does not schedule transcription for an account that turned AI features off' do
    u = User.create(:settings => {'preferences' => {'ai_features_enabled' => false}})
    expect(User.ai_features_opted_out?(u)).to eq(true)
    bs = ButtonSound.create(:user => u, :settings => {})
    expect(bs).to receive(:secondary_url).and_return("http://www.example.com/sound.wav")
    bs.schedule_transcription
    expect(scheduled?(bs)).to eq(false)
  end

  it 'treats a stored "false", 0 or "0" as an opt-out too' do
    expect(scheduled?(schedule_for('ai_features_enabled' => 'false'))).to eq(false)
    expect(scheduled?(schedule_for('ai_features_enabled' => 0))).to eq(false)
    expect(scheduled?(schedule_for('ai_features_enabled' => '0'))).to eq(false)
  end

  it 'schedules transcription for an account whose AI choice is blank (not a decision)' do
    expect(scheduled?(schedule_for('ai_features_enabled' => ''))).to eq(true)
  end

  it 'schedules transcription for an account that turned AI features on' do
    expect(scheduled?(schedule_for('ai_features_enabled' => true))).to eq(true)
  end
end
