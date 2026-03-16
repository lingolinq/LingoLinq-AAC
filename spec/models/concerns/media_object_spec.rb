require 'spec_helper'

describe MediaObject, :type => :model do
  let(:u) { User.create }
  describe "update_media_object" do
    it "should update the record if the filename has changed" do
      bs = ButtonSound.create(:user => u, :settings => {'full_filename' => 'sounds/1/2/3/4/5/6/a-b.wav', 'transcoding_keys' => ['qwert']})
      # expect(Uploader).to receive(:remote_remove).with('sounds/1/2/3/4/5/6/a-b.wav')
      res = bs.update_media_object({
        'filename' => 'sounds/1/2/3/4/5/6/a-b.mp3',
        'content_type' => 'a/b',
        'duration' => '123',
        'thumbnail_filename' => 'a/b/c.jpg'
      })
      expect(res).to eq(false)

      res = bs.update_media_object({
        'filename' => 'sounds/1/2/3/4/5/6/a-b.mp3',
        'content_type' => 'a/b',
        'duration' => '123',
        'thumbnail_filename' => 'a/b/c.jpg',
        'transcoding_key' => 'qwert'
      })
      expect(res).to eq(true)
      expect(bs.settings['full_filename']).to eq('sounds/1/2/3/4/5/6/a-b.mp3')
      expect(bs.settings['content_type']).to eq('a/b')
      expect(bs.settings['duration']).to eq(123)
      expect(bs.settings['thumbnail_filename']).to eq('a/b/c.jpg')
    end
    
    it "should return false if nothing has changed" do
      bs = ButtonSound.create(:user => u, :settings => {'full_filename' => 'sounds/1/2/3/4/5/6/a-b.wav'})
      expect(Uploader).to_not receive(:remote_remove)
      res = bs.update_media_object({'filename' => 'sounds/1/2/3/4/5/6/a-b.wav'})
      expect(res).to eq(false)
    end
  end
  
  describe "media_object_error" do
    it "should append error messages" do
      bs = ButtonSound.create(:user => u)
      bs.media_object_error('asdf')
      expect(bs.reload.settings['media_object_errors']).to eq(['asdf'])
      bs.media_object_error({a: 1})
      expect(bs.reload.settings['media_object_errors']).to eq(['asdf', {'a' =>  1}])
    end
  end
  
  describe "schedule_transcoding" do
    it "should do nothing if transcoding already attempted" do
      bs = ButtonSound.create(:user => u, :settings => {'transcoding_attempted' => true})
      expect(Worker).to_not receive(:schedule)
      bs.schedule_transcoding
    end
    
    it "should do nothing if no filename defined" do
      bs = ButtonSound.create(:user => u, :settings => {})
      expect(Worker).to_not receive(:schedule)
      bs.schedule_transcoding
    end
    
    it "should schedule transcoding only the first save after a filename is created" do
      expect(GoSecure).to receive(:nonce).and_return('chicken').at_least(1).times
      bs = ButtonSound.create(:user => u, :settings => {'full_filename' => 'a/b/c'})
      prefix = bs.file_path + bs.file_prefix + "v" + Time.now.to_i.to_s
      expect(Worker.scheduled?(Transcoder, :convert_audio, bs.global_id, prefix, 'chicken')).to eq(true)

      Worker.flush_queues
      bs.settings['full_filename'] = 'c/d/e'
      expect(Worker).to_not receive(:schedule)
      bs.schedule_transcoding
      bs.schedule_transcoding
    end
    
    it "should re-transcode if already attempted but force=true" do
      expect(GoSecure).to receive(:nonce).and_return('chicken').at_least(1).times
      bs = ButtonSound.create(:user => u, :settings => {'full_filename' => 'a/b/c'})
      prefix = bs.file_path + bs.file_prefix + "v" + Time.now.to_i.to_s
      expect(Worker.scheduled?(Transcoder, :convert_audio, bs.global_id, prefix, 'chicken')).to eq(true)

      Worker.flush_queues
      bs.schedule_transcoding(true)
      expect(Worker.scheduled?(Transcoder, :convert_audio, bs.global_id, prefix, 'chicken')).to eq(true)
    end
  end
end
