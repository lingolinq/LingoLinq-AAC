require 'spec_helper'

RSpec.describe CleverApi do
  describe '.extract_token' do
    it 'reads access_token from a hash' do
      expect(described_class.extract_token('access_token' => 'abc')).to eq('abc')
    end

    it 'reads the first token from a data array' do
      expect(described_class.extract_token('data' => [{ 'token' => 'xyz' }])).to eq('xyz')
    end

    it 'returns nil when empty' do
      expect(described_class.extract_token({})).to eq(nil)
    end
  end

  describe '.unwrap_item' do
    it 'unwraps nested data hashes' do
      expect(described_class.unwrap_item('data' => { 'id' => '1', 'name' => 'East' })).to eq('id' => '1', 'name' => 'East')
    end
  end

  describe '.each_page' do
    it 'follows rel=next pagination links' do
      page1 = {
        'data' => [{ 'data' => { 'id' => 'u1' } }],
        'links' => [{ 'rel' => 'next', 'uri' => '/v3.0/users?starting_after=u1' }]
      }
      page2 = {
        'data' => [{ 'data' => { 'id' => 'u2' } }],
        'links' => []
      }
      allow(described_class).to receive(:get_json).with('/v3.0/users', 'tok').and_return(page1)
      allow(described_class).to receive(:get_json).with('/v3.0/users?starting_after=u1', 'tok').and_return(page2)
      ids = []
      described_class.each_page('/v3.0/users', 'tok') { |user| ids << user['id'] }
      expect(ids).to eq(%w[u1 u2])
    end
  end

  describe '.district_app_token' do
    it 'raises when the token response has no access token' do
      allow(CleverOAuth).to receive(:enabled?).and_return(true)
      allow(CleverOAuth).to receive(:client_id).and_return('id')
      allow(CleverOAuth).to receive(:client_secret).and_return('secret')
      res = instance_double(Net::HTTPOK, body: '{}')
      allow(res).to receive(:is_a?).with(Net::HTTPSuccess).and_return(true)
      allow(CleverOAuth).to receive(:http_request).and_return(res)
      expect { described_class.district_app_token('dist-1') }.to raise_error(CleverApi::Error, 'district_token_missing')
    end
  end
end
