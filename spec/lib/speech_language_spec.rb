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
        'zh_Hant_MO' => 'cmn-Hant-TW',
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
    def connect(user, locale, age)
      board = Board.create(:user => User.create, :settings => {'locale' => 'en'})
      ubc = UserBoardConnection.create(:user_id => user.id, :board_id => board.id, :locale => locale)
      ubc.update_column(:updated_at, age.hours.ago)
    end

    it "should return nothing without a user" do
      expect(SpeechLanguage.alternatives(nil, 'en-US')).to eq([])
    end

    it "should list up to 3 other supported languages from the boards the owner uses, most recent first" do
      u = User.create
      [['fr', 1], ['zz', 2], ['en_GB', 3], ['es', 4], ['de', 5], ['it', 6], [nil, 7], ['', 8]].each do |loc, age|
        connect(u, loc, age)
      end
      expect(SpeechLanguage.alternatives(u, 'en-US')).to eq(['fr-FR', 'es-US', 'de-DE'])
    end

    it "should send one code per language" do
      u = User.create
      [['fr', 1], ['fr_CA', 2], ['es', 3], ['fr', 4]].each do |loc, age|
        connect(u, loc, age)
      end
      expect(SpeechLanguage.alternatives(u, 'en-US')).to eq(['fr-FR', 'es-US'])
    end

    it "should use the boards the owner uses, not boards the owner merely owns" do
      u = User.create
      Board.create(:user => u, :settings => {'locale' => 'de'})
      connect(u, 'es', 1)
      expect(SpeechLanguage.alternatives(u, 'en-US')).to eq(['es-US'])
    end

    it "should rank the language with the most connected boards first" do
      u = User.create
      connect(u, 'fr', 1)
      connect(u, 'es', 30)
      connect(u, 'es', 31)
      connect(u, 'es', 32)
      expect(SpeechLanguage.alternatives(u, 'en-US')).to eq(['es-US', 'fr-FR'])
    end

    it "should count a language's boards across its locale variants" do
      u = User.create
      3.times { |i| connect(u, 'fr', i + 1) }
      2.times { |i| connect(u, 'fr_CA', i + 10) }
      4.times { |i| connect(u, 'es', i + 20) }
      expect(SpeechLanguage.alternatives(u, 'en-US')).to eq(['fr-FR', 'es-US'])
    end

    it "should put the home language first" do
      u = User.create
      3.times { |i| connect(u, 'es', i + 1) }
      board = Board.create(:user => User.create, :settings => {'locale' => 'en'})
      UserBoardConnection.create(:user_id => u.id, :board_id => board.id, :locale => 'de', :home => true)
      expect(SpeechLanguage.alternatives(u, 'en-US')).to eq(['de-DE', 'es-US'])
    end

    it "should send none when the kill switch is on" do
      u = User.create
      connect(u, 'es', 1)
      allow(SystemFeatureSettings).to receive(:effective_enabled_for).and_return(['disable_transcription_alternatives'])
      expect(SpeechLanguage.alternatives(u, 'en-US')).to eq([])
    end
  end

  describe "disable_transcription_alternatives flag" do
    it "should be registered, not enabled by default, and described for admins" do
      expect(FeatureFlags::AVAILABLE_FRONTEND_FEATURES).to include('disable_transcription_alternatives')
      expect(FeatureFlags::ENABLED_FRONTEND_FEATURES).not_to include('disable_transcription_alternatives')
      expect(SystemFeatureRegistry::METADATA['disable_transcription_alternatives']).to include(:name, :description)
    end

    it "should leave alternatives on unless the default or org list turns the switch on" do
      u = User.create
      expect(SpeechLanguage.alternatives_enabled?(u)).to eq(true)
      allow(SystemFeatureSettings).to receive(:effective_enabled_for).with(u).and_return(['disable_transcription_alternatives'])
      expect(SpeechLanguage.alternatives_enabled?(u)).to eq(false)
    end

    it "should turn alternatives off for an org with its own feature list when the default list turns the switch on" do
      o = Organization.create(settings: {'total_licenses' => 1})
      u = User.create
      o.add_user(u.user_name, false, true)
      u.reload
      SystemFeatureSettings.set_org_enabled_features!(o, ['subscriptions'])
      expect(SystemFeatureSettings.effective_enabled_for(u)).to eq(['subscriptions'])
      expect(SpeechLanguage.alternatives_enabled?(u)).to eq(true)
      SystemFeatureSettings.set_default_enabled_features!(SystemFeatureSettings.default_enabled_features + ['disable_transcription_alternatives'])
      expect(SpeechLanguage.alternatives_enabled?(u)).to eq(false)
      expect(SpeechLanguage.alternatives_enabled?(User.create)).to eq(false)
    end

    it "should turn alternatives off for an org that turns the switch on" do
      o = Organization.create(settings: {'total_licenses' => 1})
      u = User.create
      o.add_user(u.user_name, false, true)
      u.reload
      SystemFeatureSettings.set_org_enabled_features!(o, ['disable_transcription_alternatives'])
      expect(SpeechLanguage.alternatives_enabled?(u)).to eq(false)
      expect(SpeechLanguage.alternatives_enabled?(User.create)).to eq(true)
    end

    it "should not let canary or beta opt-in turn alternatives off" do
      u = User.create
      u.settings['feature_flags'] = {'canary' => true, 'disable_transcription_alternatives' => true}
      expect(SpeechLanguage.alternatives_enabled?(u)).to eq(true)
    end
  end

  describe "language_rejected?" do
    it "should only match a 400 that names the language" do
      lang = {'error' => {'message' => "Invalid recognition 'config': Bad language code."}}
      expect(SpeechLanguage.language_rejected?(OpenStruct.new(code: 400), lang)).to eq(true)
      expect(SpeechLanguage.language_rejected?(OpenStruct.new(code: 500), lang)).to eq(false)
      expect(SpeechLanguage.language_rejected?(OpenStruct.new(code: 403), lang)).to eq(false)
      expect(SpeechLanguage.language_rejected?(OpenStruct.new(code: 400), {'error' => {'message' => 'Sync input too long.'}})).to eq(false)
      expect(SpeechLanguage.language_rejected?(OpenStruct.new(code: 400), nil)).to eq(false)
    end
  end
end
