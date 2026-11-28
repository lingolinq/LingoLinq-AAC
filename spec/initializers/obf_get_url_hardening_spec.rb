require 'spec_helper'

# Board export (lib/obf_lingolinq_patch.rb) and the gem's PDF code fetch image and sound urls through
# OBF::Utils.get_url, image_raw, image_base64, sound_raw and sound_base64. These drive the real SafeHttp
# path: public hostnames resolve to a documentation address in specs (spec/support/outside_services.rb),
# IP literals as given. WebMock never follows a redirect, so any redirect that is followed here was
# followed by the code under test.
describe 'OBFGetUrlHardening' do
  let(:png) { "\x89PNG\r\n\x1a\nfake".b }
  let(:mp3) { "ID3fake".b }

  def run_hydra(res)
    hydra = OBF::Utils.hydra
    hydra.queue(res['request']) if res['request']
    hydra.run
    res
  end

  def stub_internal(url)
    stub_request(:get, url).to_return(status: 200, body: 'secret', headers: { 'Content-Type' => 'image/png' })
  end

  describe 'OBF::Utils.get_url' do
    it 'does not fetch an RFC1918 address' do
      internal = stub_internal('http://10.0.0.5/secret.png')
      res = OBF::Utils.get_url('http://10.0.0.5/secret.png')
      expect(internal).not_to have_been_requested
      expect(res['data']).to be_nil
    end

    it 'does not queue a request for a link-local address' do
      internal = stub_internal('http://169.254.169.254/computeMetadata/v1/')
      res = run_hydra(OBF::Utils.get_url('http://169.254.169.254/computeMetadata/v1/', true))
      expect(res['request']).to be_nil
      expect(internal).not_to have_been_requested
      expect(res['data']).to be_nil
    end

    it 'fetches a public url' do
      stub_request(:get, 'https://images.example.com/a.png').to_return(status: 200, body: png, headers: { 'Content-Type' => 'image/png' })
      res = OBF::Utils.get_url('https://images.example.com/a.png')
      expect(res['data']).to eq(png)
      expect(res['content_type']).to eq('image/png')
      expect(res['extension']).to eq('.png')
    end

    it 'fetches a public url on a non-default https port from that port' do
      on_port = stub_request(:get, 'https://media.example.com:8443/a.png').to_return(status: 200, body: png, headers: { 'Content-Type' => 'image/png' })
      default_port = stub_request(:get, 'https://media.example.com/a.png').to_return(status: 200, body: 'other', headers: { 'Content-Type' => 'image/png' })
      expect(OBF::Utils.get_url('https://media.example.com:8443/a.png')['data']).to eq(png)
      expect(run_hydra(OBF::Utils.get_url('https://media.example.com:8443/a.png', true))['data']).to eq(png)
      expect(on_port).to have_been_requested.twice
      expect(default_port).not_to have_been_requested
    end

    it 'fetches a public url through the hydra' do
      stub_request(:get, 'https://images.example.com/a.png').to_return(status: 200, body: png, headers: { 'Content-Type' => 'image/png' })
      res = run_hydra(OBF::Utils.get_url('https://images.example.com/a.png', true))
      expect(res['data']).to eq(png)
      expect(res['content_type']).to eq('image/png')
    end

    it 'follows a redirect to another public url' do
      stub_request(:get, 'https://images.example.com/old.png').to_return(status: 302, headers: { 'Location' => 'https://cdn.example.com/new.png' })
      stub_request(:get, 'https://cdn.example.com/new.png').to_return(status: 200, body: png, headers: { 'Content-Type' => 'image/png' })
      expect(OBF::Utils.get_url('https://images.example.com/old.png')['data']).to eq(png)
    end

    it 'follows a redirect to another public url through the hydra' do
      stub_request(:get, 'https://images.example.com/old.png').to_return(status: 302, headers: { 'Location' => 'https://cdn.example.com/new.png' })
      stub_request(:get, 'https://cdn.example.com/new.png').to_return(status: 200, body: png, headers: { 'Content-Type' => 'image/png' })
      res = run_hydra(OBF::Utils.get_url('https://images.example.com/old.png', true))
      expect(res['data']).to eq(png)
    end

    it 'does not follow a redirect to an internal address' do
      stub_request(:get, 'https://images.example.com/hop.png').to_return(status: 302, headers: { 'Location' => 'http://10.0.0.5/secret' })
      internal = stub_internal('http://10.0.0.5/secret')
      res = OBF::Utils.get_url('https://images.example.com/hop.png')
      expect(internal).not_to have_been_requested
      expect(res['data']).to be_nil
    end

    it 'does not follow a redirect to an internal address through the hydra' do
      stub_request(:get, 'https://images.example.com/hop.png').to_return(status: 302, headers: { 'Location' => 'http://10.0.0.5/secret' })
      internal = stub_internal('http://10.0.0.5/secret')
      res = run_hydra(OBF::Utils.get_url('https://images.example.com/hop.png', true))
      expect(internal).not_to have_been_requested
      expect(res['data']).to be_nil
    end

    it 'decodes a data: uri without a request' do
      expect(Typhoeus).not_to receive(:get)
      expect(Typhoeus::Request).not_to receive(:new)
      res = OBF::Utils.get_url('data:image/png;base64,' + Base64.strict_encode64(png))
      expect(res['data']).to eq(png)
      expect(res['content_type']).to eq('image/png')
      expect(res['extension']).to eq('.png')
    end

    it 'does not send a value with a data: line after another line to the network' do
      internal = stub_internal('http://10.0.0.5/secret')
      res = OBF::Utils.get_url("http://10.0.0.5/secret\ndata:image/png;base64,AAAA")
      expect(internal).not_to have_been_requested
      expect(res['data']).to be_nil
    end
  end

  describe 'a hostname that resolves to a private address', own_resolver: true do
    before do
      allow(Addrinfo).to receive(:getaddrinfo).with('intranet.example.com', any_args).and_return([instance_double(Addrinfo, ip_address: '10.0.0.7')])
    end

    it 'is not fetched' do
      internal = stub_internal('http://intranet.example.com/secret')
      res = OBF::Utils.get_url('http://intranet.example.com/secret')
      expect(internal).not_to have_been_requested
      expect(res['data']).to be_nil
    end

    it 'is not queued' do
      internal = stub_internal('http://intranet.example.com/secret')
      res = run_hydra(OBF::Utils.get_url('http://intranet.example.com/secret', true))
      expect(res['request']).to be_nil
      expect(internal).not_to have_been_requested
    end
  end

  describe 'OBF::Utils.image_raw' do
    it 'does not fetch an internal address' do
      internal = stub_internal('http://10.0.0.5/secret.png')
      res = OBF::Utils.image_raw('http://10.0.0.5/secret.png')
      expect(internal).not_to have_been_requested
      expect(res && res['data']).to be_nil
    end
  end

  describe 'OBF::Utils.image_base64' do
    it 'does not read a server file path' do
      expect(File).not_to receive(:read)
      expect(OBF::Utils.image_base64('/etc/hosts')).to be_nil
    end

    it 'does not fetch an internal address' do
      internal = stub_internal('http://10.0.0.5/secret.png')
      expect(OBF::Utils.image_base64('http://10.0.0.5/secret.png')).to be_nil
      expect(internal).not_to have_been_requested
    end

    it 'encodes a public image' do
      stub_request(:get, 'https://images.example.com/a.png').to_return(status: 200, body: png, headers: { 'Content-Type' => 'image/png' })
      expect(OBF::Utils.image_base64('https://images.example.com/a.png')).to eq('data:image/png;base64,' + Base64.strict_encode64(png))
    end

    it 'keeps a data: uri' do
      uri = 'data:image/png;base64,' + Base64.strict_encode64(png)
      expect(OBF::Utils.image_base64(uri)).to eq(uri)
    end

    it 'returns nil for a response without a content type instead of raising' do
      stub_request(:get, 'https://images.example.com/bare').to_return(status: 200, body: png)
      expect(OBF::Utils.image_base64('https://images.example.com/bare')).to be_nil
    end
  end

  describe 'OBF::Utils.sound_base64' do
    it 'does not read a server file path' do
      expect(File).not_to receive(:read)
      expect(OBF::Utils.sound_base64('/etc/hosts')).to be_nil
    end

    it 'returns nil for a blocked address instead of raising' do
      internal = stub_internal('http://10.0.0.5/secret.mp3')
      expect(OBF::Utils.sound_base64('http://10.0.0.5/secret.mp3')).to be_nil
      expect(internal).not_to have_been_requested
    end

    it 'encodes a public sound' do
      stub_request(:get, 'https://sounds.example.com/a.mp3').to_return(status: 200, body: mp3, headers: { 'Content-Type' => 'audio/mpeg' })
      expect(OBF::Utils.sound_base64('https://sounds.example.com/a.mp3')).to eq('data:audio/mpeg;base64,' + Base64.strict_encode64(mp3))
    end

    it 'keeps a data: uri' do
      uri = 'data:audio/mpeg;base64,' + Base64.strict_encode64(mp3)
      expect(OBF::Utils.sound_base64(uri)).to eq(uri)
    end
  end

  describe 'OBF::Utils.sound_raw' do
    it 'returns nil for a blocked address so nothing empty is zipped' do
      internal = stub_internal('http://10.0.0.5/secret.mp3')
      expect(OBF::Utils.sound_raw('http://10.0.0.5/secret.mp3')).to be_nil
      expect(internal).not_to have_been_requested
    end

    it 'returns a public sound' do
      stub_request(:get, 'https://sounds.example.com/a.mp3').to_return(status: 200, body: mp3, headers: { 'Content-Type' => 'audio/mpeg' })
      expect(OBF::Utils.sound_raw('https://sounds.example.com/a.mp3')['data']).to eq(mp3)
    end
  end
end
