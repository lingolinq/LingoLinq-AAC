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

  describe '.enabled?' do
    env_wrap('GOOGLE_OAUTH_CLIENT_ID' => 'spec-client-id', 'GOOGLE_OAUTH_CLIENT_SECRET' => 'spec-client-secret') do
      it 'is true when both the client id and secret are set' do
        expect(described_class.enabled?).to eq(true)
      end
    end

    env_wrap('GOOGLE_OAUTH_CLIENT_ID' => 'spec-client-id', 'GOOGLE_OAUTH_CLIENT_SECRET' => ' ') do
      it 'is false when the secret is blank' do
        expect(described_class.enabled?).to eq(false)
      end
    end
  end

  describe '.fetch_link' do
    it 'returns nil for a nonce that was never stored or has expired' do
      expect(described_class.fetch_link('spec-unknown-nonce')).to eq(nil)
    end

    it 'returns the stored link config' do
      described_class.store_link('spec-nonce', {'mode' => 'manual_link'})
      expect(described_class.fetch_link('spec-nonce')).to eq({'mode' => 'manual_link'})
    end
  end
end
