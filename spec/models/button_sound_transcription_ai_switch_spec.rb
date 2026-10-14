require 'spec_helper'

# Voice transcription is Google speech recognition, a standard service like
# text-to-speech and translation, not a generative AI feature. It is not gated by
# the account's personal AI switch (product direction, 2026-09-30), so it keeps
# working while AI features are off by default.
describe ButtonSound, 'transcription and the personal AI switch' do
  def scheduled?(bs)
    Worker.scheduled?(ButtonSound, :perform_action, {:id => bs.id, :method => 'schedule_transcription', :arguments => [true]})
  end

  it 'schedules transcription for an account that never recorded an AI choice' do
    u = User.create(:settings => {'preferences' => {}})
    expect(FeatureFlags.user_pref_allows_ai?('ai_word_prediction', u)).to eq(false)
    bs = ButtonSound.create(:user => u, :settings => {})
    expect(bs).to receive(:secondary_url).and_return("http://www.example.com/sound.wav")
    bs.schedule_transcription
    expect(scheduled?(bs)).to eq(true)
  end

  it 'schedules transcription for an account that turned AI features off' do
    u = User.create(:settings => {'preferences' => {'ai_features_enabled' => false}})
    bs = ButtonSound.create(:user => u, :settings => {})
    expect(bs).to receive(:secondary_url).and_return("http://www.example.com/sound.wav")
    bs.schedule_transcription
    expect(scheduled?(bs)).to eq(true)
  end
end
