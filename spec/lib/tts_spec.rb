require 'spec_helper'

describe Tts do
  describe 'generate_audio' do
    it 'returns nil for blank text' do
      expect(Tts.generate_audio('', locale: 'en')).to eq(nil)
      expect(Tts.generate_audio(nil, locale: 'en')).to eq(nil)
    end

    env_wrap('GOOGLE_TTS_TOKEN' => 'test_tts_key') do
      it 'calls the GA v1 Text-to-Speech endpoints, never the Pre-GA v1beta1 (Google BAA excludes Pre-GA from PHI)' do
        # Regression guard for the BAA covered-service fix: the Google Cloud BAA
        # excludes Pre-GA offerings from PHI, so TTS must ride the GA v1 endpoint.
        allow(RedisInit.permissions).to receive(:get).and_return(nil)
        allow(Permissions).to receive(:setex)
        expect(Typhoeus).to receive(:get).with(
          "https://texttospeech.googleapis.com/v1/voices?languageCode=fr&key=test_tts_key",
          timeout: 10, connecttimeout: 5
        ).and_return(OpenStruct.new(body: { voices: [{ 'name' => 'Bob', 'languageCodes' => ['fr'] }] }.to_json))
        expect(Typhoeus).to receive(:post).with(
          "https://texttospeech.googleapis.com/v1/text:synthesize?key=test_tts_key",
          hash_including(headers: { 'Content-Type' => 'application/json' })
        ).and_return(OpenStruct.new(body: { audioContent: Base64.strict_encode64('audio-bytes') }.to_json))

        res = Tts.generate_audio('hello', locale: 'fr', mp3: true)
        expect(res).to_not eq(nil)
        expect(res[:content_type]).to eq('audio/mp3')
        expect(res[:body]).to eq('audio-bytes')
      end
    end

    it 'returns nil for Irish (ga) locales without making any external call (Abair disabled, no DPA -- LL-a167848115)' do
      expect(Typhoeus).not_to receive(:post)
      expect(Tts.generate_audio('Dia dhuit', locale: 'ga')).to be_nil
    end
  end
end
