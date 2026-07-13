require 'ffi'
require 'spec_helper'

describe SafeHttp do
  describe '.blocked_address?' do
    it 'blocks cloud metadata, RFC1918, link-local, and CGN ranges' do
      expect(SafeHttp.blocked_address?('169.254.169.254')).to eq(true)
      expect(SafeHttp.blocked_address?('10.0.0.5')).to eq(true)
      expect(SafeHttp.blocked_address?('172.16.4.4')).to eq(true)
      expect(SafeHttp.blocked_address?('192.168.1.1')).to eq(true)
      expect(SafeHttp.blocked_address?('100.64.0.1')).to eq(true)
      expect(SafeHttp.blocked_address?('::1')).to eq(true)
      expect(SafeHttp.blocked_address?('fe80::1')).to eq(true)
    end

    it 'blocks non-canonical IPv6 mapped forms with binary-safe byte comparison' do
      # ::ffff:0:7f00:1 encodes 127.0.0.1; hton returns ASCII-8BIT so comparisons must use .b literals.
      expect(SafeHttp.blocked_address?('::ffff:0:7f00:1')).to eq(true)
      expect(SafeHttp.blocked_address?('::ffff:0:a9fe:a9fe')).to eq(true)
    end

    it 'blocks IPv4-compatible and non-canonical IPv6 embeddings of blocked IPv4' do
      expect(SafeHttp.blocked_address?('::ffff:169.254.169.254')).to eq(true)
      expect(SafeHttp.blocked_address?('::169.254.169.254')).to eq(true)
      expect(SafeHttp.blocked_address?('::10.0.0.1')).to eq(true)
      expect(SafeHttp.blocked_address?('::127.0.0.1')).to eq(true)
      expect(SafeHttp.blocked_address?('::ffff:0:7f00:1')).to eq(true)
      expect(SafeHttp.blocked_address?('0000:0000:0000:0000:0000:0000:a9fe:a9fe')).to eq(true)
      expect(SafeHttp.blocked_address?('[::ffff:169.254.169.254]')).to eq(true)
    end

    it 'blocks link-local IPv6 with zone index after normalization' do
      expect(SafeHttp.blocked_address?('fe80::1%eth0')).to eq(true)
      expect(SafeHttp.blocked_address?('fe80::1%25eth0')).to eq(true)
    end

    it 'allows public addresses including RFC1918 boundaries' do
      expect(SafeHttp.blocked_address?('8.8.8.8')).to eq(false)
      expect(SafeHttp.blocked_address?('172.15.0.1')).to eq(false)
      expect(SafeHttp.blocked_address?('172.32.0.1')).to eq(false)
      expect(SafeHttp.blocked_address?('2606:2800:220:1:248:1893:25c8:1946')).to eq(false)
    end
  end

  describe '.resolve_addresses' do
    it 'collapses IPv4-mapped IPv6 answers to IPv4 for block checks' do
      addrs = [
        instance_double(Addrinfo, ip_address: '::ffff:93.184.216.34'),
        instance_double(Addrinfo, ip_address: '93.184.216.34')
      ]
      expect(Addrinfo).to receive(:getaddrinfo).and_return(addrs)

      expect(SafeHttp.resolve_addresses('example.com')).to eq(['93.184.216.34'])
    end

    it 'returns deduped public IPs when all answers are safe' do
      addrs = [
        instance_double(Addrinfo, ip_address: '93.184.216.34'),
        instance_double(Addrinfo, ip_address: '93.184.216.34'),
        instance_double(Addrinfo, ip_address: '2606:2800:220:1:248:1893:25c8:1946')
      ]
      expect(Addrinfo).to receive(:getaddrinfo).with('example.com', nil, Socket::AF_UNSPEC, Socket::SOCK_STREAM).and_return(addrs)

      expect(SafeHttp.resolve_addresses('example.com')).to eq([
        '93.184.216.34',
        '2606:2800:220:1:248:1893:25c8:1946'
      ])
    end

    it 'rejects when any answer resolves to a blocked range' do
      addrs = [
        instance_double(Addrinfo, ip_address: '8.8.8.8'),
        instance_double(Addrinfo, ip_address: '10.0.0.1')
      ]
      expect(Addrinfo).to receive(:getaddrinfo).and_return(addrs)

      expect(SafeHttp.resolve_addresses('evil.example.com')).to eq(nil)
    end

    it 'returns nil on resolution failure' do
      expect(Addrinfo).to receive(:getaddrinfo).and_raise(SocketError)

      expect(SafeHttp.resolve_addresses('missing.example.com')).to eq(nil)
    end

    it 'returns nil when DNS resolution times out' do
      expect(Addrinfo).to receive(:getaddrinfo) do
        sleep(SafeHttp::DNS_RESOLVE_TIMEOUT + 1)
        []
      end

      expect(SafeHttp.resolve_addresses('slow.example.com')).to eq(nil)
    end
  end

  describe '.resolve_pins' do
    it 'formats IPv4 and IPv6 pins for libcurl' do
      uri = URI.parse('https://example.com/path')
      pins = SafeHttp.resolve_pins(uri, ['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946'])

      expect(pins).to eq(['example.com:443:93.184.216.34,[2606:2800:220:1:248:1893:25c8:1946]'])
    end
  end

  describe 'Ethon resolve slist' do
    it 'builds an FFI slist Ethon accepts for CURLOPT_RESOLVE' do
      pins = ['www.example.com:80:93.184.216.34']
      slist = SafeHttp.send(:build_resolve_slist, pins)

      expect(slist).to be_a(FFI::AutoPointer)

      easy = Ethon::Easy.new(url: 'http://www.example.com/')
      expect { easy.resolve = slist }.not_to raise_error
    end
  end

  describe '.get' do
    it 'pins resolved public IPs and disables followlocation' do
      addrs = [instance_double(Addrinfo, ip_address: '93.184.216.34')]
      expect(Addrinfo).to receive(:getaddrinfo).and_return(addrs)
      response = OpenStruct.new(code: 200, headers: {}, body: 'ok')
      expect(Typhoeus).to receive(:get).with(
        'http://www.example.com/pic.png',
        hash_including(
          followlocation: false,
          resolve: kind_of(FFI::AutoPointer)
        )
      ).and_return(response)

      res = SafeHttp.get('http://www.example.com/pic.png')
      expect(res).to eq(response)
      expect(res.effective_url).to eq('http://www.example.com/pic.png')
    end

    it 'returns a failed response for blocked URLs without calling Typhoeus' do
      expect(Typhoeus).not_to receive(:get)

      res = SafeHttp.get('http://169.254.169.254/latest/meta-data/')
      expect(res.success?).to eq(false)
      expect(res.code).to eq(0)
      expect(res.body).to eq('blocked or invalid URL')
      expect(res.effective_url).to eq(nil)
    end

    it 'coerces non-string failed_response messages to strings' do
      expect(Typhoeus).not_to receive(:get)

      res = SafeHttp.get('http://127.0.0.1/internal')
      expect(res.body).to be_a(String)
      expect(res.return_message).to be_a(String)
    end

    it 'returns a failed response for IPv4-compatible IPv6 literals without calling Typhoeus' do
      expect(Typhoeus).not_to receive(:get)

      res = SafeHttp.get('http://[::169.254.169.254]/meta')
      expect(res.success?).to eq(false)
      expect(res.code).to eq(0)
    end

    it 'forwards Typhoeus options such as connecttimeout and ssl_verifypeer' do
      addrs = [instance_double(Addrinfo, ip_address: '93.184.216.34')]
      expect(Addrinfo).to receive(:getaddrinfo).and_return(addrs)
      response = OpenStruct.new(code: 200, headers: {}, body: 'ok')

      expect(Typhoeus).to receive(:get).with(
        'http://www.example.com/pic.png',
        hash_including(
          followlocation: false,
          connecttimeout: 30,
          ssl_verifypeer: true,
          resolve: kind_of(FFI::AutoPointer)
        )
      ).and_return(response)

      SafeHttp.get('http://www.example.com/pic.png', connecttimeout: 30, ssl_verifypeer: true)
    end

    it 'follows redirects through the full validation pipeline' do
      addrs = [instance_double(Addrinfo, ip_address: '93.184.216.34')]
      expect(Addrinfo).to receive(:getaddrinfo).twice.and_return(addrs)

      redirect = OpenStruct.new(
        code: 302,
        headers: { 'Location' => 'http://www.example.com/final.png' },
        body: ''
      )

      final = OpenStruct.new(code: 200, headers: { 'Content-Type' => 'image/png' }, body: 'data')

      expect(Typhoeus).to receive(:get).with(
        'http://www.example.com/start.png',
        hash_including(followlocation: false, resolve: kind_of(FFI::AutoPointer))
      ).and_return(redirect)
      expect(Typhoeus).to receive(:get).with(
        'http://www.example.com/final.png',
        hash_including(followlocation: false, resolve: kind_of(FFI::AutoPointer))
      ).and_return(final)

      res = SafeHttp.get('http://www.example.com/start.png')
      expect(res).to eq(final)
      expect(res.effective_url).to eq('http://www.example.com/final.png')
    end

    it 'does not follow redirects to blocked targets' do
      public_addrs = [instance_double(Addrinfo, ip_address: '93.184.216.34')]
      expect(Addrinfo).to receive(:getaddrinfo).once.and_return(public_addrs)

      redirect = OpenStruct.new(
        code: 302,
        headers: { 'Location' => 'http://169.254.169.254/meta' },
        body: ''
      )

      expect(Typhoeus).to receive(:get).once.and_return(redirect)

      res = SafeHttp.get('http://www.example.com/start.png')
      expect(res.success?).to eq(false)
      expect(res.body).to eq('blocked or invalid URL')
    end

    it 'applies lessonpix redirect query escaping' do
      addrs = [instance_double(Addrinfo, ip_address: '93.184.216.34')]
      expect(Addrinfo).to receive(:getaddrinfo).twice.and_return(addrs)

      redirect = OpenStruct.new(
        code: 302,
        headers: { 'Location' => 'https://lessonpix.com/pic.png?token=abc' },
        body: ''
      )

      final = OpenStruct.new(code: 200, headers: { 'Content-Type' => 'image/png' }, body: 'data')

      expect(Typhoeus).to receive(:get).with('http://www.example.com/start.png', anything).and_return(redirect)
      expect(Typhoeus).to receive(:get).with(
        'https://lessonpix.com/pic.png%3Ftoken=abc',
        anything
      ).and_return(final)

      SafeHttp.get('http://www.example.com/start.png')
    end
  end

  describe '.build_typhoeus_request' do
    it 'returns a pinned Typhoeus::Request for hostnames' do
      addrs = [instance_double(Addrinfo, ip_address: '93.184.216.34')]
      expect(Addrinfo).to receive(:getaddrinfo).and_return(addrs)

      req = SafeHttp.build_typhoeus_request('http://www.example.com/pic.png')
      expect(req).to be_a(Typhoeus::Request)
      expect(req.options[:followlocation]).to eq(false)
      expect(req.options[:resolve]).to be_a(FFI::AutoPointer)
      expect(req.effective_url).to eq('http://www.example.com/pic.png')
    end

    it 'returns nil for blocked URLs' do
      expect(SafeHttp.build_typhoeus_request('http://169.254.169.254/meta')).to eq(nil)
    end
  end

  describe '.post' do
    it 'posts with DNS pins for hostnames' do
      addrs = [instance_double(Addrinfo, ip_address: '93.184.216.34')]
      expect(Addrinfo).to receive(:getaddrinfo).and_return(addrs)
      response = OpenStruct.new(code: 200, headers: {}, body: 'ok')

      expect(Typhoeus).to receive(:post).with(
        'http://www.example.com/callback',
        hash_including(
          body: { notification: 'test' },
          timeout: 10,
          followlocation: false,
          resolve: kind_of(FFI::AutoPointer)
        )
      ).and_return(response)

      res = SafeHttp.post('http://www.example.com/callback', body: { notification: 'test' }, timeout: 10)
      expect(res.effective_url).to eq('http://www.example.com/callback')
    end
  end
end
