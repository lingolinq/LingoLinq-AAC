# Maps app locales (board and user locales, any casing, '_' or '-') to the
# BCP-47 codes Google Speech-to-Text v1 accepts for ButtonSound#schedule_transcription.
module SpeechLanguage
  # Every code on Google's supported-languages page
  # (https://docs.cloud.google.com/speech-to-text/docs/speech-to-text-supported-languages),
  # each confirmed accepted by v1 speech:recognize on 2026-10-01.
  # Google has no v1 API that lists languages; update this list by hand.
  SUPPORTED = %w(
    af-ZA am-ET ar-AE ar-BH ar-DZ ar-EG ar-IL ar-IQ ar-JO ar-KW ar-LB ar-MA ar-MR ar-OM ar-PS ar-QA
    ar-SA ar-SY ar-TN ar-XA ar-YE as-IN ast-ES az-AZ be-BY bg-BG bn-BD bn-IN bs-BA ca-ES ceb-PH
    ckb-IQ cmn-Hans-CN cmn-Hant-TW cs-CZ cy-GB da-DK de-AT de-CH de-DE el-GR en-AU en-GB en-HK
    en-IE en-IN en-NZ en-PH en-PK en-SG en-US es-419 es-AR es-BO es-CL es-CO es-CR es-DO es-EC
    es-ES es-GT es-HN es-MX es-NI es-PA es-PE es-PR es-SV es-US es-UY es-VE et-EE eu-ES fa-IR ff-SN
    fi-FI fil-PH fr-BE fr-CA fr-CH fr-FR ga-IE gl-ES gu-IN ha-NG hi-IN hr-HR hu-HU hy-AM id-ID
    ig-NG is-IS it-CH it-IT iw-IL ja-JP jv-ID ka-GE kam-KE kea-CV kk-KZ km-KH kn-IN ko-KR ky-KG
    lb-LU lg-UG ln-CD lo-LA lt-LT luo-KE lv-LV mi-NZ mk-MK ml-IN mn-MN mr-IN ms-MY mt-MT my-MM
    ne-NP nl-BE nl-NL no-NO nso-ZA ny-MW oc-FR om-ET or-IN pa-Guru-IN pl-PL ps-AF pt-BR pt-PT ro-RO
    ru-RU rup-BG rw-RW sd-IN si-LK sk-SK sl-SI sn-ZW so-SO sq-AL sr-RS ss-Latn-ZA st-ZA su-ID sv-SE
    sw-KE ta-IN te-IN tg-TJ th-TH tn-Latn-ZA tr-TR ts-ZA uk-UA umb-AO ur-PK uz-UZ ve-ZA vi-VN wo-SN
    xh-ZA yo-NG yue-Hant-HK zu-ZA
  ).freeze

  # App locale forms whose Google code uses a different language subtag.
  ALIASES = {
    'zh' => 'cmn-Hans-CN', 'zh-CN' => 'cmn-Hans-CN', 'zh-Hans' => 'cmn-Hans-CN', 'zh-Hans-CN' => 'cmn-Hans-CN',
    'zh-TW' => 'cmn-Hant-TW', 'zh-Hant' => 'cmn-Hant-TW', 'zh-Hant-TW' => 'cmn-Hant-TW',
    'zh-HK' => 'yue-Hant-HK', 'zh-Hant-HK' => 'yue-Hant-HK', 'yue' => 'yue-Hant-HK',
    'he' => 'iw-IL', 'he-IL' => 'iw-IL',
    'nb' => 'no-NO', 'nb-NO' => 'no-NO',
    'tl' => 'fil-PH', 'tl-PH' => 'fil-PH',
    'pa' => 'pa-Guru-IN', 'pa-IN' => 'pa-Guru-IN'
  }.freeze

  # The region used for a bare language code that Google lists with several regions.
  PREFERRED = {
    'ar' => 'ar-EG', 'bn' => 'bn-BD', 'cmn' => 'cmn-Hans-CN', 'de' => 'de-DE', 'en' => 'en-US',
    'es' => 'es-US', 'fr' => 'fr-FR', 'it' => 'it-IT', 'nl' => 'nl-NL', 'pt' => 'pt-BR'
  }.freeze

  DEFAULT_FOR_LANGUAGE = SUPPORTED.group_by { |code| code.split('-')[0] }.map { |lang, codes|
    [lang, PREFERRED[lang] || codes.sort[0]]
  }.to_h.freeze

  # Language, then up to three subtags (script, region), '-' or '_' separated.
  LOCALE_PATTERN = /\A[a-zA-Z]{2,3}([-_][a-zA-Z0-9]{2,8}){0,3}\z/

  # Sent when nothing about the recording's language is known: the same
  # languageCode the request has always carried.
  DEFAULT_CODE = 'en'

  # Google's v1 limit for alternativeLanguageCodes.
  MAX_ALTERNATIVES = 3
  BOARD_SCAN_LIMIT = 25

  def self.valid_locale?(locale)
    locale.is_a?(String) && locale.match?(LOCALE_PATTERN)
  end

  def self.normalize(locale)
    return nil unless valid_locale?(locale)
    parts = locale.split(/[-_]/)
    lang = parts.shift.downcase
    script = nil
    region = nil
    parts.each do |part|
      if part.match?(/\A[a-zA-Z]{4}\z/)
        script ||= part.capitalize
      elsif part.match?(/\A([a-zA-Z]{2}|\d{3})\z/)
        region ||= part.upcase
      end
    end
    [[lang, script, region], [lang, region], [lang, script], [lang]].map { |c| c.compact.join('-') }.uniq.each do |code|
      return ALIASES[code] if ALIASES[code]
      return code if SUPPORTED.include?(code)
    end
    DEFAULT_FOR_LANGUAGE[lang]
  end

  def self.language_of(code)
    code.to_s.split('-')[0]
  end

  # Other languages from the owner's most recently updated boards, one code per
  # language, never the primary's language.
  def self.alternatives(user, primary)
    return [] unless user && user.id && primary
    langs = [language_of(primary)]
    res = []
    Board.where(user_id: user.id).order(updated_at: :desc).limit(BOARD_SCAN_LIMIT).each do |board|
      code = normalize(board.settings && board.settings['locale'])
      next if !code || langs.include?(language_of(code))
      langs << language_of(code)
      res << code
      break if res.length >= MAX_ALTERNATIVES
    end
    res
  end

  # [languageCode, alternativeLanguageCodes] for a recording, or nil when its
  # language is known and Google cannot transcribe it. The first locale-shaped
  # value wins: the recording's own, the owner's home board, the owner's.
  def self.for_recording(locale, user)
    prefs = (user && user.settings && user.settings['preferences']) || {}
    home = prefs['home_board'].is_a?(Hash) ? prefs['home_board'] : {}
    source = [locale, home['locale'], prefs['locale']].detect { |loc| valid_locale?(loc) }
    return [DEFAULT_CODE, []] unless source
    primary = normalize(source)
    return nil unless primary
    [primary, alternatives(user, primary)]
  end

  # True when Google refused the request over a language code (one bad
  # alternative fails the whole request).
  def self.language_rejected?(response, json)
    response.respond_to?(:code) && response.code.to_i == 400 &&
      json.is_a?(Hash) && json['error'].is_a?(Hash) && json['error']['message'].to_s.match?(/language/i)
  end
end
