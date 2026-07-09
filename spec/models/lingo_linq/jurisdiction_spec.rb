require 'spec_helper'

describe LingoLinq::Jurisdiction do
  describe ".country_code" do
    it "returns nil for nil / blank" do
      expect(LingoLinq::Jurisdiction.country_code(nil)).to eq(nil)
      expect(LingoLinq::Jurisdiction.country_code('')).to eq(nil)
      expect(LingoLinq::Jurisdiction.country_code('   ')).to eq(nil)
    end

    it "normalizes an explicit uppercase country token" do
      expect(LingoLinq::Jurisdiction.country_code('PL')).to eq('PL')
      expect(LingoLinq::Jurisdiction.country_code('US')).to eq('US')
    end

    it "derives the region subtag from a locale" do
      expect(LingoLinq::Jurisdiction.country_code('pl-PL')).to eq('PL')
      expect(LingoLinq::Jurisdiction.country_code('de_DE')).to eq('DE')
      expect(LingoLinq::Jurisdiction.country_code('en-US')).to eq('US')
    end

    it "takes the first tag of an Accept-Language header" do
      expect(LingoLinq::Jurisdiction.country_code('pl-PL,pl;q=0.9,en;q=0.8')).to eq('PL')
    end

    it "finds the region subtag past a script subtag (BCP-47)" do
      expect(LingoLinq::Jurisdiction.country_code('sr-Latn-RS')).to eq('RS')
      expect(LingoLinq::Jurisdiction.country_code('zh-Hant-HK')).to eq('HK')
      expect(LingoLinq::Jurisdiction.country_code('de-Latn-DE')).to eq('DE')
    end

    it "treats an explicit 2-letter token as its ISO country by contract" do
      # 'DE' is Delaware as a US state code but Germany as ISO 3166-1; the
      # primitive reads explicit country/region tokens as ISO country codes.
      expect(LingoLinq::Jurisdiction.country_code({ 'region' => 'DE' })).to eq('DE')
      expect(LingoLinq::Jurisdiction.eu?({ 'region' => 'DE' })).to eq(true)
    end

    it "treats a bare lowercase language subtag as unknown (ambiguous)" do
      expect(LingoLinq::Jurisdiction.country_code('pl')).to eq(nil)
      expect(LingoLinq::Jurisdiction.country_code('es')).to eq(nil)
      expect(LingoLinq::Jurisdiction.country_code('en')).to eq(nil)
    end

    it "trusts an explicit country/region hash field case-insensitively" do
      expect(LingoLinq::Jurisdiction.country_code({ 'country' => 'pl' })).to eq('PL')
      expect(LingoLinq::Jurisdiction.country_code({ country: 'de' })).to eq('DE')
      expect(LingoLinq::Jurisdiction.country_code({ 'region' => 'US' })).to eq('US')
    end

    it "falls back to a hash locale when no explicit country/region" do
      expect(LingoLinq::Jurisdiction.country_code({ 'locale' => 'pl-PL' })).to eq('PL')
      expect(LingoLinq::Jurisdiction.country_code({ 'locale' => 'pl' })).to eq(nil)
    end
  end

  describe ".eu?" do
    it "is true for an EU member state (Poland)" do
      expect(LingoLinq::Jurisdiction.eu?('PL')).to eq(true)
      expect(LingoLinq::Jurisdiction.eu?('pl-PL')).to eq(true)
      expect(LingoLinq::Jurisdiction.eu?({ 'country' => 'PL' })).to eq(true)
    end

    it "is true for other EU member states" do
      expect(LingoLinq::Jurisdiction.eu?('de-DE')).to eq(true)
      expect(LingoLinq::Jurisdiction.eu?('FR')).to eq(true)
      expect(LingoLinq::Jurisdiction.eu?('es-ES')).to eq(true)
    end

    it "is false for a non-EU country (United States)" do
      expect(LingoLinq::Jurisdiction.eu?('US')).to eq(false)
      expect(LingoLinq::Jurisdiction.eu?('en-US')).to eq(false)
    end

    it "is false for EEA-but-not-EU and other non-EU signals" do
      expect(LingoLinq::Jurisdiction.eu?('NO')).to eq(false) # Norway (EEA, not EU)
      expect(LingoLinq::Jurisdiction.eu?('GB')).to eq(false) # UK
      expect(LingoLinq::Jurisdiction.eu?('CA')).to eq(false) # Canada
    end

    it "is false when jurisdiction is unknown (fails toward non-EU)" do
      expect(LingoLinq::Jurisdiction.eu?(nil)).to eq(false)
      expect(LingoLinq::Jurisdiction.eu?('')).to eq(false)
      expect(LingoLinq::Jurisdiction.eu?('pl')).to eq(false) # bare language, ambiguous
    end

    it "reads locale/country signals off a User-like object" do
      eu_user = double('user', settings: { 'preferences' => { 'locale' => 'pl-PL' } })
      us_user = double('user', settings: { 'preferences' => { 'locale' => 'en-US' } })
      explicit_eu = double('user', settings: { 'country' => 'pl' })
      no_signal = double('user', settings: {})
      expect(LingoLinq::Jurisdiction.eu?(eu_user)).to eq(true)
      expect(LingoLinq::Jurisdiction.eu?(us_user)).to eq(false)
      expect(LingoLinq::Jurisdiction.eu?(explicit_eu)).to eq(true)
      expect(LingoLinq::Jurisdiction.eu?(no_signal)).to eq(false)
    end
  end
end
