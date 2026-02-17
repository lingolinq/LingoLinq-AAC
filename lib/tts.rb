# TTS (text-to-speech) generation for server-side use.
# Used by the search/audio API and by board creation when auto-adding sounds to buttons.
module Tts
  class << self
    # Generate audio for the given text.
    # @param text [String] text to speak
    # @param locale [String] language code (e.g. 'en', 'es')
    # @param mp3 [Boolean] if true, request MP3; otherwise WAV/LINEAR16
    # @return [Hash, nil] { body: bytes, content_type: 'audio/mp3' } or nil on failure
    def generate_audio(text, locale: 'en', mp3: true)
      return nil if text.blank?

      if locale.to_s.match(/^ga/)
        return generate_irish(text, locale)
      end

      if ENV['GOOGLE_TTS_TOKEN']
        return generate_google(text, locale: locale, mp3: mp3)
      end

      # Fallback: unscraped translate.google.com (fragile, not for batch use)
      nil
    end

    private

    def generate_irish(text, locale)
      req = Typhoeus.post(
        'https://abair.ie/aac_irish',
        body: { text: text, voice: 'Ulster' },
        timeout: 5
      )
      return nil unless req.success? && req.body.present?
      {
        body: req.body,
        content_type: req.headers['Content-Type'].to_s.split(';').first.presence || 'audio/wav'
      }
    end

    def generate_google(text, locale: 'en', mp3: true)
      json = voices_for_locale(locale)
      return nil unless json && json['voices'] && json['voices'][0]

      voices = json['voices'].sort_by do |v|
        name = (v['name'] || '')
        name.match(/neural2/i) ? 0 : (name.match(/wavenet/i) ? 1 : 2)
      end
      voice = voices.detect { |v| (v['languageCodes'] || []).include?(locale) }
      voice ||= voices.detect { |v| (v['languageCodes'] || []).include?(locale.to_s.split(/-|_/)[0]) }
      voice ||= voices[0]
      loc = (voice['languageCodes'] || []).include?(locale) ? locale : (voice['languageCodes']&.first || locale)

      content_type = mp3 ? 'audio/mp3' : 'audio/wav'
      encoding = mp3 ? 'MP3' : 'LINEAR16'
      res = Typhoeus.post(
        "https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=#{ENV['GOOGLE_TTS_TOKEN']}",
        body: {
          audioConfig: { audioEncoding: encoding, pitch: 0, speakingRate: 1 },
          input: { text: text },
          voice: { languageCode: loc, name: voice['name'] }
        }.to_json,
        headers: { 'Content-Type' => 'application/json' }
      )
      data = JSON.parse(res.body) rescue nil
      return nil unless data && data['audioContent']

      {
        body: Base64.decode64(data['audioContent']),
        content_type: content_type
      }
    end

    def voices_for_locale(locale)
      locale = (locale || 'en').to_s
      cache = RedisInit.permissions.get("google/voices/#{locale}") rescue nil
      if cache
        return JSON.parse(cache) rescue nil
      end
      req = Typhoeus.get(
        "https://texttospeech.googleapis.com/v1beta1/voices?languageCode=#{CGI.escape(locale)}&key=#{ENV['GOOGLE_TTS_TOKEN']}"
      )
      json = JSON.parse(req.body) rescue nil
      if json && (!json['voices'] || json['voices'].length == 0)
        req = Typhoeus.get(
          "https://texttospeech.googleapis.com/v1beta1/voices?languageCode=#{CGI.escape(locale.split(/-|_/)[0])}&key=#{ENV['GOOGLE_TTS_TOKEN']}"
        )
        json = JSON.parse(req.body) rescue nil
      end
      if json && json['voices'] && json['voices'][0]
        Permissions.setex(RedisInit.permissions, "google/voices/#{locale}", 72.hours.to_i, json.to_json)
      end
      json
    end
  end
end
