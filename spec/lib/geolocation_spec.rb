require 'spec_helper'

describe Geolocation do
  describe "find_places" do
    it "should return no places and make no request, even with a token set" do
      prior = ENV['GOOGLE_PLACES_TOKEN']
      ENV['GOOGLE_PLACES_TOKEN'] = 'token'
      expect(Typhoeus).not_to receive(:get)
      expect(Geolocation.find_places(0, 0)).to eq([])
      expect(Geolocation.find_places('12.5', '-3.25')).to eq([])
    ensure
      ENV['GOOGLE_PLACES_TOKEN'] = prior
    end
  end
end
