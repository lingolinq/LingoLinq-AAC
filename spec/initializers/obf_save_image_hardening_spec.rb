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
      res[:tempfile].close! rescue Errno::ENOENT if res && res[:tempfile]
    end
  end
end
