require 'spec_helper'

describe 'OBFSaveImageHardening' do
  describe 'OBF::Utils.save_image' do
    it 'returns nil when url fetch yields empty data' do
      expect(SafeHttp).to receive(:get).with('https://example.com/missing.png', hash_including(:timeout, :connecttimeout)).and_return(OpenStruct.new(code: 200, headers: {'Content-Type' => 'image/png'}, body: '', success?: true))
      expect(Process).not_to receive(:spawn)
      res = OBF::Utils.save_image({'url' => 'https://example.com/missing.png'}, nil, 'white')
      expect(res).to be_nil
    end

    it 'returns nil when url fetch yields nil data' do
      expect(SafeHttp).to receive(:get).with('https://example.com/gone.png', hash_including(:timeout, :connecttimeout)).and_return(OpenStruct.new(code: 200, headers: {'Content-Type' => 'image/png'}, body: nil, success?: true))
      expect(Process).not_to receive(:spawn)
      res = OBF::Utils.save_image({'url' => 'https://example.com/gone.png'}, nil, 'white')
      expect(res).to be_nil
    end

    it 'signs uploads-bucket urls through Uploader.signed_internal_url before fetching' do
      orig = ENV['UPLOADS_S3_BUCKET']
      ENV['UPLOADS_S3_BUCKET'] = 'spec-uploads'
      begin
        raw = "https://spec-uploads.s3.amazonaws.com/images/1/pic.png"
        expect(Uploader).to receive(:signed_internal_url).with(raw).and_return('https://signed.example.com/pic.png')
        expect(SafeHttp).to receive(:get).with('https://signed.example.com/pic.png', hash_including(:timeout, :connecttimeout)).and_return(OpenStruct.new(code: 200, headers: {'Content-Type' => 'image/png'}, body: '', success?: true))
        res = OBF::Utils.save_image({'url' => raw}, nil, 'white')
        expect(res).to be_nil
      ensure
        if orig.nil?
          ENV.delete('UPLOADS_S3_BUCKET')
        else
          ENV['UPLOADS_S3_BUCKET'] = orig
        end
      end
    end

    it 'fetches external urls unsigned (signed_internal_url passes them through)' do
      expect(SafeHttp).to receive(:get).with('https://external.example.com/pic.png', hash_including(:timeout, :connecttimeout)).and_return(OpenStruct.new(code: 200, headers: {'Content-Type' => 'image/png'}, body: '', success?: true))
      res = OBF::Utils.save_image({'url' => 'https://external.example.com/pic.png'}, nil, 'white')
      expect(res).to be_nil
    end


    # --- SSRF hardening (2026-09-10). These drive the REAL SafeHttp path on purpose:
    # stubbing SafeHttp would delete the code under test. Stub Addrinfo/Typhoeus instead,
    # which is the pattern spec/lib/safe_http_spec.rb:118-143 uses.
    describe 'SSRF hardening' do
      it 'does not fetch a link-local metadata address' do
        expect(Typhoeus).not_to receive(:get)
        res = OBF::Utils.save_image({'url' => 'http://169.254.169.254/latest/meta-data/'}, nil, 'white')
        expect(res).to be_nil
      end

      it 'does not fetch an RFC1918 address' do
        expect(Typhoeus).not_to receive(:get)
        res = OBF::Utils.save_image({'url' => 'http://10.0.0.5:6379/'}, nil, 'white')
        expect(res).to be_nil
      end

      it 'does not fetch a bracketed IPv6 loopback literal' do
        expect(Typhoeus).not_to receive(:get)
        res = OBF::Utils.save_image({'url' => 'http://[::1]/latest/'}, nil, 'white')
        expect(res).to be_nil
      end

      it 'does not let libcurl follow redirects, and stops an internal redirect target' do
        # Discriminating on followlocation is the point: with followlocation:true libcurl
        # follows the hop INTERNALLY, so call-count alone cannot tell the two apart.
        addrs = [instance_double(Addrinfo, ip_address: '93.184.216.34')]
        allow(Addrinfo).to receive(:getaddrinfo).and_return(addrs)
        redirect = OpenStruct.new(code: 302, headers: {'Location' => 'http://169.254.169.254/latest/meta-data/'}, body: '', success?: false)
        expect(Typhoeus).to receive(:get).with(
          'http://www.example.com/pic.png',
          hash_including(followlocation: false)
        ).once.and_return(redirect)
        res = OBF::Utils.save_image({'url' => 'http://www.example.com/pic.png'}, nil, 'white')
        expect(res).to be_nil
      end

      it 'passes an explicit timeout so a hanging origin cannot stall the worker' do
        addrs = [instance_double(Addrinfo, ip_address: '93.184.216.34')]
        allow(Addrinfo).to receive(:getaddrinfo).and_return(addrs)
        expect(Typhoeus).to receive(:get).with(
          'http://www.example.com/pic.png',
          hash_including(:timeout, :connecttimeout)
        ).and_return(OpenStruct.new(code: 200, headers: {}, body: '', success?: true))
        OBF::Utils.save_image({'url' => 'http://www.example.com/pic.png'}, nil, 'white')
      end

      it 'does not treat a blocked response body as image data' do
        # SafeHttp.failed_response returns body='blocked or invalid URL' (22 bytes) with
        # code 0. It must be rejected on success?, not merely by being under MIN_IMAGE_BYTES.
        expect(Typhoeus).not_to receive(:get)
        img = {'url' => 'http://169.254.169.254/latest/'}
        res = OBF::Utils.save_image(img, nil, 'white')
        expect(res).to be_nil
        expect(img['raw_data']).to be_blank
      end
    end

    # --- REGRESSION GUARDS. These must be GREEN both before and after the fix.
    describe 'legitimate traffic' do
      it 'still decodes a data: uri inline with no network fetch' do
        png = "\x89PNG\r\n\x1a\n" + ('x' * 200)
        data_uri = 'data:image/png;base64,' + Base64.strict_encode64(png)
        expect(Typhoeus).not_to receive(:get)
        expect(SafeHttp).not_to receive(:get)
        img = {'url' => data_uri}
        OBF::Utils.save_image(img, nil, 'white')
        expect(img['raw_data'].to_s.b).to eq(png.b)
        expect(img['content_type']).to eq('image/png')
      end

      it 'passes a presigned S3 url through byte-identically, signature intact' do
        signed = 'https://spec-uploads.s3.us-west-2.amazonaws.com/images/1/a%20pic.png' \
                 '?X-Amz-Algorithm=AWS4-HMAC-SHA256' \
                 '&X-Amz-Credential=AKIA%2F20260910%2Fus-west-2%2Fs3%2Faws4_request' \
                 '&X-Amz-Signature=210cdb0000000000000000000000000000000000000000000000000000000000'
        allow(Uploader).to receive(:signed_internal_url).and_return(signed)
        addrs = [instance_double(Addrinfo, ip_address: '52.92.128.1')]
        allow(Addrinfo).to receive(:getaddrinfo).and_return(addrs)
        expect(Typhoeus).to receive(:get).with(signed, anything).and_return(
          OpenStruct.new(code: 200, headers: {}, body: '', success?: true)
        )
        OBF::Utils.save_image({'url' => 'https://spec-uploads.s3.amazonaws.com/images/1/a pic.png'}, nil, 'white')
      end
    end

    it 'returns nil when raw_data is too small to be a valid image' do
      expect(Process).not_to receive(:spawn)
      res = OBF::Utils.save_image({'raw_data' => 'x' * 10, 'content_type' => 'image/png'}, nil, 'white')
      expect(res).to be_nil
    end

    it 'pins the Tempfile on the returned hash when threadable is set' do
      png_data = "\x89PNG\r\n\x1a\n" + ('x' * 200)
      fake_thr = double('thread')
      allow(Process).to receive(:spawn).and_return(12345)
      allow(Process).to receive(:detach).with(12345).and_return(fake_thr)
      res = OBF::Utils.save_image({'raw_data' => png_data, 'content_type' => 'image/png', 'threadable' => true}, nil, 'white')
      expect(res).to be_a(Hash)
      expect(res[:thread]).to eq(fake_thr)
      expect(res[:tempfile]).to be_a(Tempfile)
      expect(File.exist?(res[:tempfile].path)).to be true
    ensure
      begin
        res[:tempfile].close! if res.is_a?(Hash) && res[:tempfile]
      rescue Errno::ENOENT
        # already cleaned up, fine
      end
    end
  end
end
