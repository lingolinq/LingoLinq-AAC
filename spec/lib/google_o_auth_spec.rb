require 'spec_helper'

RSpec.describe GoogleOAuth do
  describe '.valid_return_origin?' do
    it 'accepts scheme://host origins' do
      expect(described_class.valid_return_origin?('http://localhost:8184')).to eq(true)
    end

    it 'rejects origins with paths, queries, or fragments' do
      expect(described_class.valid_return_origin?('http://localhost:8184/login')).to eq(false)
      expect(described_class.valid_return_origin?('http://localhost:8184?x=1')).to eq(false)
      expect(described_class.valid_return_origin?('http://localhost:8184#frag')).to eq(false)
    end
  end
end
