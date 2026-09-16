require 'spec_helper'

RSpec.describe CleverOAuth do
  describe '.enabled?' do
    it 'is false without credentials' do
      allow(described_class).to receive(:client_id).and_return('')
      allow(described_class).to receive(:client_secret).and_return('')
      expect(described_class.enabled?).to eq(false)
    end

    it 'is true when both credentials are present' do
      allow(described_class).to receive(:client_id).and_return('id')
      allow(described_class).to receive(:client_secret).and_return('secret')
      expect(described_class.enabled?).to eq(true)
    end
  end

  describe '.profile_from_user' do
    it 'maps v3 user fields including UTF-8 names and missing email' do
      profile = described_class.profile_from_user({
        'id' => 'clever-1',
        'district' => 'dist-9',
        'name' => { 'first' => 'José', 'last' => 'Niño' },
        'roles' => { 'student' => { 'grade' => '2' } },
        'schools' => ['school-1']
      })
      expect(profile[:id]).to eq('clever-1')
      expect(profile[:district_id]).to eq('dist-9')
      expect(profile[:name]).to eq('José Niño')
      expect(profile[:email]).to eq(nil)
      expect(profile[:roles]).to eq(['student'])
      expect(profile[:schools]).to eq(['school-1'])
    end

    it 'keeps dual teacher and district_admin roles' do
      profile = described_class.profile_from_user({
        'id' => 'clever-2',
        'district' => 'dist-9',
        'name' => { 'first' => 'Pat', 'last' => 'Lee' },
        'email' => 'pat@example.com',
        'roles' => {
          'teacher' => {},
          'district_admin' => {}
        }
      })
      expect(profile[:roles]).to include('teacher', 'district_admin')
      expect(profile[:email]).to eq('pat@example.com')
    end
  end

  describe '.callback_url' do
    it 'uses the request host when no frontend origin is present' do
      request = double('request', protocol: 'https://', host_with_port: 'app.example.com')
      allow(GoogleOAuth).to receive(:frontend_origin).and_return(nil)
      expect(described_class.callback_url(request, nil)).to eq('https://app.example.com/auth/clever/callback')
    end
  end

  describe '.exchange_code' do
    it 'posts the authorization code with HTTP Basic auth' do
      request = double('request', protocol: 'https://', host_with_port: 'app.example.com')
      allow(GoogleOAuth).to receive(:frontend_origin).and_return(nil)
      allow(described_class).to receive(:client_id).and_return('id')
      allow(described_class).to receive(:client_secret).and_return('secret')
      res = instance_double(Net::HTTPOK, body: { 'access_token' => 'tok' }.to_json)
      allow(res).to receive(:is_a?).with(Net::HTTPSuccess).and_return(true)
      expect(described_class).to receive(:http_request) do |_uri, req|
        expect(req['Authorization']).to match(/\ABasic /)
        body = JSON.parse(req.body)
        expect(body['code']).to eq('abc')
        expect(body['grant_type']).to eq('authorization_code')
        expect(body['redirect_uri']).to eq('https://app.example.com/auth/clever/callback')
        res
      end
      expect(described_class.exchange_code(request, 'abc')).to eq('tok')
    end

    it 'raises when the token exchange fails' do
      request = double('request', protocol: 'https://', host_with_port: 'app.example.com')
      allow(GoogleOAuth).to receive(:frontend_origin).and_return(nil)
      res = instance_double(Net::HTTPBadRequest, body: { 'error' => 'invalid_grant' }.to_json)
      allow(res).to receive(:is_a?).with(Net::HTTPSuccess).and_return(false)
      allow(described_class).to receive(:http_request).and_return(res)
      expect { described_class.exchange_code(request, 'abc') }.to raise_error(CleverOAuth::Error, 'invalid_grant')
    end
  end
end
