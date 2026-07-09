require 'spec_helper'

describe JsonApi::Json do
  describe ".coppa_consent_age" do
    it "returns 16 for an EU jurisdiction (Poland and others)" do
      expect(JsonApi::Json.coppa_consent_age('PL')).to eq(16)
      expect(JsonApi::Json.coppa_consent_age('pl-PL')).to eq(16)
      expect(JsonApi::Json.coppa_consent_age('pl-PL,pl;q=0.9')).to eq(16)
      expect(JsonApi::Json.coppa_consent_age({ 'country' => 'DE' })).to eq(16)
    end

    it "returns 13 for a non-EU jurisdiction" do
      expect(JsonApi::Json.coppa_consent_age('US')).to eq(13)
      expect(JsonApi::Json.coppa_consent_age('en-US')).to eq(13)
      expect(JsonApi::Json.coppa_consent_age('GB')).to eq(13)
    end

    it "returns the default (13) when jurisdiction is unknown" do
      expect(JsonApi::Json.coppa_consent_age(nil)).to eq(13)
      expect(JsonApi::Json.coppa_consent_age('')).to eq(13)
      expect(JsonApi::Json.coppa_consent_age('pl')).to eq(13) # bare language, ambiguous
    end
  end
end
