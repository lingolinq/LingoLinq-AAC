require 'spec_helper'

describe 'OBFSaveImageHardening' do
  describe 'OBF::Utils.save_image' do
    it 'returns nil when url fetch yields empty data' do
      expect(OBF::Utils).to receive(:get_url).with('https://example.com/missing.png').and_return({'data' => '', 'content_type' => 'image/png'})
      expect(Process).not_to receive(:spawn)
      res = OBF::Utils.save_image({'url' => 'https://example.com/missing.png'}, nil, 'white')
      expect(res).to be_nil
    end

    it 'returns nil when url fetch yields nil data' do
      expect(OBF::Utils).to receive(:get_url).with('https://example.com/gone.png').and_return({'data' => nil, 'content_type' => 'image/png'})
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
        expect(OBF::Utils).to receive(:get_url).with('https://signed.example.com/pic.png').and_return({'data' => '', 'content_type' => 'image/png'})
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
      expect(OBF::Utils).to receive(:get_url).with('https://external.example.com/pic.png').and_return({'data' => '', 'content_type' => 'image/png'})
      res = OBF::Utils.save_image({'url' => 'https://external.example.com/pic.png'}, nil, 'white')
      expect(res).to be_nil
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
