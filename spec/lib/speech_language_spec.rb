require 'spec_helper'

describe SpeechLanguage do
  describe "normalize" do
    it "should map app locales to a supported Speech-to-Text code" do
      {
        'en' => 'en-US',
        'en_US' => 'en-US',
        'EN-gb' => 'en-GB',
        'en_CA' => 'en-US',
        'es' => 'es-US',
        'ES' => 'es-US',
        'es_MX' => 'es-MX',
        'es-419' => 'es-419',
        'fr' => 'fr-FR',
        'uk' => 'uk-UA',
        'zh' => 'cmn-Hans-CN',
        'zh_TW' => 'cmn-Hant-TW',
        'zh_Hans_CN' => 'cmn-Hans-CN',
        'zh_Hant_TW' => 'cmn-Hant-TW',
        'zh_Hant_HK' => 'yue-Hant-HK',
        'he_IL' => 'iw-IL',
        'nb_NO' => 'no-NO',
        'sr_Latn_RS' => 'sr-RS'
      }.each do |locale, code|
        expect([locale, SpeechLanguage.normalize(locale)]).to eq([locale, code])
      end
    end

    it "should return nil for locales it cannot map" do
      [nil, '', 'zz', 'tlh', 'english', 'en-US-x-very-long-junk-code', '<script>', ['es'], {'a' => 'b'}].each do |locale|
        expect([locale, SpeechLanguage.normalize(locale)]).to eq([locale, nil])
      end
    end
  end

  describe "valid_locale?" do
    it "should accept locale-shaped strings only" do
      expect(SpeechLanguage.valid_locale?('es_MX')).to eq(true)
      expect(SpeechLanguage.valid_locale?('zh_Hant_HK')).to eq(true)
      expect(SpeechLanguage.valid_locale?('tlh')).to eq(true)
      expect(SpeechLanguage.valid_locale?('')).to eq(false)
      expect(SpeechLanguage.valid_locale?('english')).to eq(false)
      expect(SpeechLanguage.valid_locale?('<script>')).to eq(false)
      expect(SpeechLanguage.valid_locale?(['es'])).to eq(false)
    end
  end

  describe "alternatives" do
    it "should return nothing without a user" do
      expect(SpeechLanguage.alternatives(nil, 'en-US')).to eq([])
    end

    it "should list up to 3 other supported languages from the owner's most recently updated boards" do
      u = User.create
      [['fr', 1], ['zz', 2], ['en_GB', 3], ['es', 4], ['de', 5], ['it', 6]].each do |loc, age|
        b = Board.create(:user => u, :settings => {'locale' => loc})
        b.update_column(:updated_at, age.hours.ago)
      end
      expect(SpeechLanguage.alternatives(u, 'en-US')).to eq(['fr-FR', 'es-US', 'de-DE'])
    end
  end
end
