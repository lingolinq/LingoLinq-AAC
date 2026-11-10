require 'spec_helper'

describe LegacyLinks do
  describe "legacy_url?" do
    it "matches the legacy domain and its subdomains" do
      ['https://www.mylingolinq.com', 'https://mylingolinq.com', 'http://app.mylingolinq.com/images',
       'https://www.mylingolinq.com:443/x', ' https://WWW.MyLingoLinq.com '].each do |url|
        expect(LegacyLinks.legacy_url?(url)).to eq(true), url
      end
    end

    it "does not match other hosts" do
      [nil, '', 'not a url', 'https://www.lingolinq.com', 'https://notmylingolinq.com',
       'https://www.example.com/mylingolinq.com', 'https://mylingolinq.com:443@external.example/image',
       'https://mylingolinq.com.example.org'].each do |url|
        expect(LegacyLinks.legacy_url?(url)).to eq(false), url.inspect
      end
    end
  end

  describe "normalize_license" do
    it "rewrites a legacy author_url and leaves everything else" do
      expect(LegacyLinks.normalize_license({'type' => 'CC By', 'author_url' => 'https://www.mylingolinq.com'})).to eq(
        {'type' => 'CC By', 'author_url' => 'https://www.lingolinq.com'})
      expect(LegacyLinks.normalize_license({'type' => 'CC By', 'author_url' => 'https://www.example.com'})).to eq(
        {'type' => 'CC By', 'author_url' => 'https://www.example.com'})
      expect(LegacyLinks.normalize_license(nil)).to eq(nil)
      expect(LegacyLinks.normalize_license('private')).to eq('private')
    end
  end
end
