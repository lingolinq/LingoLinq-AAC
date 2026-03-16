require 'spec_helper'

describe Transcoder do
  describe "handle_event" do
    it "should return false if it can't find a matching job" do
      config = OpenStruct.new
      expect(Transcoder).to receive(:config).and_return(config)
      expect(config).to receive(:read_job).with({id: 'jobby'}).and_return(nil)
      expect(Transcoder.handle_event({'Message' => {'jobId' => 'jobby'}.to_json})).to eq(false)
    end
    
    it "should return false if it doesn't have audio or video metadata" do
      config = OpenStruct.new
      job = OpenStruct.new
      expect(Transcoder).to receive(:config).and_return(config)
      expect(config).to receive(:read_job).with({id: 'jobby'}).and_return(OpenStruct.new({job: job}))
      expect(Transcoder.handle_event({'Message' => {'jobId' => 'jobby'}.to_json})).to eq(false)
    end
    
    it "should update the sound for audio events" do
      config = OpenStruct.new
      job = OpenStruct.new({
        user_metadata: {
          'audio_id' => 'sound_id',
          'conversion_type' => 'audio',
          'transcoding_key' => 'bacon'
        },
        outputs: [
          OpenStruct.new({
            key: 'some/file.mp3',
            duration: 12
          })
        ]
      })
      expect(Transcoder).to receive(:config).and_return(config)
      expect(config).to receive(:read_job).with({id: 'jobby'}).and_return(OpenStruct.new({job: job}))
      bs = ButtonSound.create
      expect(ButtonSound).to receive(:find_by_global_id).with('sound_id').and_return(bs)
      expect(bs).to receive(:update_media_object).with({
        'filename' => 'some/file.mp3',
        'duration' => 12,
        'content_type' => 'audio/mp3',
        'transcoding_key' => 'bacon'
      })
      res = Transcoder.handle_event({'Message' => {
        'jobId' => 'jobby',
        'state' => 'COMPLETED'
      }.to_json})
      expect(res).to eq(true)
    end
    
    it "should update the video for video events" do
      config = OpenStruct.new
      job = OpenStruct.new({
        user_metadata: {
          'video_id' => 'video_id',
          'conversion_type' => 'video',
          'transcoding_key' => 'bacon'
        },
        outputs: [
          OpenStruct.new({
            key: 'some/file.mp4',
            duration: 12
          })
        ]
      })
      expect(Transcoder).to receive(:config).and_return(config)
      expect(config).to receive(:read_job).with({id: 'jobby'}).and_return(OpenStruct.new({job: job}))
      v = UserVideo.create
      expect(UserVideo).to receive(:find_by_global_id).with('video_id').and_return(v)
      expect(v).to receive(:update_media_object).with({
        'filename' => 'some/file.mp4',
        'duration' => 12,
        'content_type' => 'video/mp4',
        'transcoding_key' => 'bacon',
        'thumbnail_filename' => 'some/file.mp4.0000.png'
      })
      res = Transcoder.handle_event({'Message' => {
        'jobId' => 'jobby',
        'state' => 'COMPLETED'
      }.to_json})
      expect(res).to eq(true)
    end
    
    it "should record an error for errored events" do
      config = OpenStruct.new
      job = OpenStruct.new({
        user_metadata: {
          'audio_id' => 'sound_id',
          'conversion_type' => 'audio'
        },
        outputs: [
          OpenStruct.new({
            key: 'some/file.mp3',
            duration: 12
          })
        ]
      })
      expect(Transcoder).to receive(:config).and_return(config)
      expect(config).to receive(:read_job).with({id: 'jobby'}).and_return(OpenStruct.new({job: job}))
      bs = ButtonSound.create
      expect(ButtonSound).to receive(:find_by_global_id).with('sound_id').and_return(bs)
      expect(bs).to receive(:media_object_error).with({
        code: 'err',
        job: 'jobby'
      })
      res = Transcoder.handle_event({'Message' => {
        'jobId' => 'jobby',
        'state' => 'ERROR',
        'errorCode' => 'err'
      }.to_json})
      expect(res).to eq(true)
    end
  end
  
  describe "convert_audio" do
    it "should return false if the sound can't be found" do
      res = Transcoder.convert_audio('asdf', 'something', 'qwert')
      expect(Transcoder).to_not receive(:config)
      expect(res).to eq(false)
    end
    
    it "should schedule a transcoding job and return the id" do
      u = User.create
      bs = ButtonSound.create(:user => u, :settings => {'full_filename' => 'a/b/c.wav'})
      config = OpenStruct.new
      job = OpenStruct.new
      job.id = 'asdf'
      ENV['TRANSCODER_AUDIO_PIPELINE'] = 'pipe'
      expect(Transcoder).to receive(:config).and_return(config)
      expect(config).to receive(:create_job).with({
        pipeline_id: 'pipe',
        input: {
          key: 'a/b/c.wav'
        },
        outputs: [{
          key: 'd/e/f.mp3',
          preset_id: Transcoder::AUDIO_PRESET
        }, {
          key: 'd/e/f.wav',
          preset_id: Transcoder::AUDIO_TRANSCRIBE_PRESET
        }],
        user_metadata: {
          audio_id: bs.global_id,
          conversion_type: 'audio',
          transcoding_key: 'qwert'
        }
      }).and_return(OpenStruct.new({job: job}))
      res = Transcoder.convert_audio(bs.global_id, 'd/e/f', 'qwert')
      expect(res).to eq({job_id: 'asdf'})
    end
  end

  describe "convert_video" do
    it "should return false if the sound can't be found" do
      res = Transcoder.convert_video('asdf', 'something', 'qwert')
      expect(Transcoder).to_not receive(:config)
      expect(res).to eq(false)
    end
    
    it "should schedule a transcoding job and return the id" do
      u = User.create
      v = UserVideo.create(:user => u, :settings => {'full_filename' => 'a/b/c.avi'})
      config = OpenStruct.new
      job = OpenStruct.new
      job.id = 'asdf'
      ENV['TRANSCODER_VIDEO_PIPELINE'] = 'pipe'
      expect(Transcoder).to receive(:config).and_return(config)
      expect(config).to receive(:create_job).with({
        pipeline_id: 'pipe',
        input: {
          key: 'a/b/c.avi'
        },
        output: {
          key: 'd/e/f.mp4',
          preset_id: Transcoder::VIDEO_PRESET,
          thumbnail_pattern: 'd/e/f.mp4.{count}'
        },
        user_metadata: {
          video_id: v.global_id,
          conversion_type: 'video',
          transcoding_key: 'qwert'
        }
      }).and_return(OpenStruct.new({job: job}))
      res = Transcoder.convert_video(v.global_id, 'd/e/f', 'qwert')
      expect(res).to eq({job_id: 'asdf'})
    end
  end

  describe "config" do
    it "should create a valid config" do
      ENV['AWS_KEY'] = 'bacon'
      ENV['AWS_SECRET'] = 'fried'
      ENV['TRANSCODER_REGION'] = 'overthere'
      expect(Aws::Credentials).to receive(:new).with('bacon', 'fried').and_return('bob')
      expect(Aws::ElasticTranscoder::Client).to receive(:new) do |opts|
        expect(opts[:region]).to eq('overthere')
        expect(opts[:credentials]).to eq('bob')
        expect(opts[:retry_limit]).to eq(2)
        expect(opts[:retry_backoff]).to_not eq(nil)
      end
      Transcoder.config
    end
  end
end
