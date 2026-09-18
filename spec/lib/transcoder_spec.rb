require 'spec_helper'

describe Transcoder do
  describe "configured?" do
    env_wrap({
      'MEDIACONVERT_ROLE_ARN' => '',
      'UPLOADS_S3_BUCKET' => 'lingolinq-test-uploads'
    }) do
      it "should be false when the role is blank" do
        expect(Transcoder.configured?).to eq(false)
      end
    end

    env_wrap({
      'MEDIACONVERT_ROLE_ARN' => 'arn:aws:iam::123:role/MediaConvert',
      'UPLOADS_S3_BUCKET' => ''
    }) do
      it "should be false when the bucket is blank" do
        expect(Transcoder.configured?).to eq(false)
      end
    end

    env_wrap({
      'MEDIACONVERT_ROLE_ARN' => 'arn:aws:iam::123:role/MediaConvert',
      'UPLOADS_S3_BUCKET' => 'lingolinq-test-uploads'
    }) do
      it "should be true when role and bucket are set" do
        expect(Transcoder.configured?).to eq(true)
      end
    end
  end

  describe "handle_event" do
    # These get_job responses are OpenStructs, so they accept members the SDK does
    # not have (output_file_paths is not on a real OutputDetail). Green here does
    # not mean the read path works; see
    # docs/task-management/2026-09-18_mediaconvert-sdk-setting-keys.md.
    def eventbridge_message(job_id, status, extra={})
      {
        'detail-type' => 'MediaConvert Job State Change',
        'source' => 'aws.mediaconvert',
        'detail' => {'jobId' => job_id, 'status' => status}.merge(extra)
      }.to_json
    end

    it "should return false if it can't find a matching job" do
      config = OpenStruct.new
      expect(Transcoder).to receive(:config).and_return(config)
      expect(config).to receive(:get_job).with({id: 'jobby'}).and_return(nil)
      expect(Transcoder.handle_event({'Message' => eventbridge_message('jobby', 'COMPLETE')})).to eq(false)
    end

    it "should return false if it doesn't have audio or video metadata" do
      config = OpenStruct.new
      job = OpenStruct.new
      expect(Transcoder).to receive(:config).and_return(config)
      expect(config).to receive(:get_job).with({id: 'jobby'}).and_return(OpenStruct.new({job: job}))
      expect(Transcoder.handle_event({'Message' => eventbridge_message('jobby', 'COMPLETE')})).to eq(false)
    end

    it "should update the sound for audio COMPLETE events using GetJob durationInMs" do
      config = OpenStruct.new
      job = OpenStruct.new({
        user_metadata: {
          'audio_id' => 'sound_id',
          'conversion_type' => 'audio',
          'transcoding_key' => 'bacon'
        },
        output_group_details: [
          OpenStruct.new({
            output_details: [
              OpenStruct.new({
                duration_in_ms: 12000,
                output_file_paths: ['s3://lingolinq-test-uploads/some/file.mp3']
              }),
              OpenStruct.new({
                duration_in_ms: 12000,
                output_file_paths: ['s3://lingolinq-test-uploads/some/file.wav']
              })
            ]
          })
        ]
      })
      expect(Transcoder).to receive(:config).and_return(config)
      expect(config).to receive(:get_job).with({id: 'jobby'}).and_return(OpenStruct.new({job: job}))
      bs = ButtonSound.create
      expect(ButtonSound).to receive(:find_by_global_id).with('sound_id').and_return(bs)
      expect(bs).to receive(:update_media_object).with({
        'filename' => 'some/file.mp3',
        'duration' => 12,
        'content_type' => 'audio/mp3',
        'transcoding_key' => 'bacon',
        'secondary_output' => {
          'filename' => 'some/file.wav',
          'duration' => 12,
          'content_type' => 'audio/wav'
        }
      })
      res = Transcoder.handle_event({'Message' => eventbridge_message('jobby', 'COMPLETE')})
      expect(res).to eq(true)
    end

    it "should update the video for video COMPLETE events" do
      config = OpenStruct.new
      job = OpenStruct.new({
        user_metadata: {
          'video_id' => 'video_id',
          'conversion_type' => 'video',
          'transcoding_key' => 'bacon'
        },
        output_group_details: [
          OpenStruct.new({
            output_details: [
              OpenStruct.new({
                duration_in_ms: 12000,
                output_file_paths: ['s3://lingolinq-test-uploads/some/file.mp4']
              }),
              OpenStruct.new({
                output_file_paths: ['s3://lingolinq-test-uploads/some/file.mp4.0000001.jpg']
              })
            ]
          })
        ]
      })
      expect(Transcoder).to receive(:config).and_return(config)
      expect(config).to receive(:get_job).with({id: 'jobby'}).and_return(OpenStruct.new({job: job}))
      v = UserVideo.create
      expect(UserVideo).to receive(:find_by_global_id).with('video_id').and_return(v)
      expect(v).to receive(:update_media_object).with({
        'filename' => 'some/file.mp4',
        'duration' => 12,
        'content_type' => 'video/mp4',
        'transcoding_key' => 'bacon',
        'thumbnail_filename' => 'some/file.mp4.0000001.jpg'
      })
      res = Transcoder.handle_event({'Message' => eventbridge_message('jobby', 'COMPLETE')})
      expect(res).to eq(true)
    end

    it "should fall back to a 7-digit jpg thumbnail guess when GetJob lists no still" do
      config = OpenStruct.new
      job = OpenStruct.new({
        user_metadata: {
          'video_id' => 'video_id',
          'conversion_type' => 'video',
          'transcoding_key' => 'bacon'
        },
        output_group_details: [
          OpenStruct.new({
            output_details: [
              OpenStruct.new({
                duration_in_ms: 12000,
                output_file_paths: ['s3://lingolinq-test-uploads/some/file.mp4']
              })
            ]
          })
        ]
      })
      expect(Transcoder).to receive(:config).and_return(config)
      expect(config).to receive(:get_job).with({id: 'jobby'}).and_return(OpenStruct.new({job: job}))
      v = UserVideo.create
      expect(UserVideo).to receive(:find_by_global_id).with('video_id').and_return(v)
      expect(v).to receive(:update_media_object).with({
        'filename' => 'some/file.mp4',
        'duration' => 12,
        'content_type' => 'video/mp4',
        'transcoding_key' => 'bacon',
        'thumbnail_filename' => 'some/file.mp4.0000001.jpg'
      })
      res = Transcoder.handle_event({'Message' => eventbridge_message('jobby', 'COMPLETE')})
      expect(res).to eq(true)
    end

    it "should record an error for ERROR events" do
      config = OpenStruct.new
      job = OpenStruct.new({
        user_metadata: {
          'audio_id' => 'sound_id',
          'conversion_type' => 'audio'
        },
        output_group_details: [
          OpenStruct.new({
            output_details: [
              OpenStruct.new({
                duration_in_ms: 12000,
                output_file_paths: ['s3://lingolinq-test-uploads/some/file.mp3']
              })
            ]
          })
        ]
      })
      expect(Transcoder).to receive(:config).and_return(config)
      expect(config).to receive(:get_job).with({id: 'jobby'}).and_return(OpenStruct.new({job: job}))
      bs = ButtonSound.create
      expect(ButtonSound).to receive(:find_by_global_id).with('sound_id').and_return(bs)
      expect(bs).to receive(:media_object_error).with({
        code: 'err',
        job: 'jobby'
      })
      res = Transcoder.handle_event({'Message' => eventbridge_message('jobby', 'ERROR', 'errorCode' => 'err')})
      expect(res).to eq(true)
    end
  end

  describe "convert_audio" do
    it "should return false if the sound can't be found" do
      expect(Transcoder).to_not receive(:config)
      res = Transcoder.convert_audio('asdf', 'something', 'qwert')
      expect(res).to eq(false)
    end

    env_wrap({
      'MEDIACONVERT_ROLE_ARN' => '',
      'UPLOADS_S3_BUCKET' => 'lingolinq-test-uploads'
    }) do
      it "should return false without building a client when MediaConvert is not configured" do
        u = User.create
        bs = ButtonSound.create(:user => u, :settings => {'full_filename' => 'a/b/c.wav'})
        expect(Transcoder).to_not receive(:config)
        expect(Aws::MediaConvert::Client).to_not receive(:new)
        allow(Rails.logger).to receive(:warn)
        res = Transcoder.convert_audio(bs.global_id, 'd/e/f', 'qwert')
        expect(res).to eq(false)
        expect(Rails.logger).to have_received(:warn).with(/MediaConvert is not configured/)
      end
    end

    env_wrap({
      'MEDIACONVERT_ROLE_ARN' => 'arn:aws:iam::123:role/MediaConvert',
      'MEDIACONVERT_QUEUE_ARN' => 'arn:aws:mediaconvert:us-west-2:123:queues/Default',
      'UPLOADS_S3_BUCKET' => 'lingolinq-test-uploads'
    }) do
      it "should schedule a transcoding job and return the id" do
        u = User.create
        bs = ButtonSound.create(:user => u, :settings => {'full_filename' => 'a/b/c.wav'})
        config = OpenStruct.new
        job = OpenStruct.new
        job.id = 'asdf'
        expect(Transcoder).to receive(:config).and_return(config)
        expect(config).to receive(:create_job) do |job_args|
          expect(job_args[:role]).to eq('arn:aws:iam::123:role/MediaConvert')
          expect(job_args[:queue]).to eq('arn:aws:mediaconvert:us-west-2:123:queues/Default')
          expect(job_args[:user_metadata]).to eq({
            'audio_id' => bs.global_id,
            'conversion_type' => 'audio',
            'transcoding_key' => 'qwert'
          })
          input = job_args[:settings][:inputs][0]
          expect(input[:file_input]).to eq('s3://lingolinq-test-uploads/a/b/c.wav')
          outputs = job_args[:settings][:output_groups][0][:outputs]
          mp3 = outputs.detect { |o| o.dig(:audio_descriptions, 0, :codec_settings, :codec) == 'MP3' }
          wav = outputs.detect { |o| o.dig(:audio_descriptions, 0, :codec_settings, :codec) == 'WAV' }
          expect(mp3[:audio_descriptions][0][:codec_settings][:mp_3_settings][:bitrate]).to eq(128000)
          expect(wav[:audio_descriptions][0][:codec_settings][:wav_settings]).to eq({
            bit_depth: 16,
            channels: 1,
            sample_rate: 44100
          })
          expect(job_args[:settings][:output_groups][0][:output_group_settings][:file_group_settings][:destination]).to eq('s3://lingolinq-test-uploads/d/e/')
        end.and_return(OpenStruct.new({job: job}))
        res = Transcoder.convert_audio(bs.global_id, 'd/e/f', 'qwert')
        expect(res).to eq({job_id: 'asdf'})
      end
    end
  end

  describe "convert_video" do
    it "should return false if the video can't be found" do
      expect(Transcoder).to_not receive(:config)
      res = Transcoder.convert_video('asdf', 'something', 'qwert')
      expect(res).to eq(false)
    end

    env_wrap({
      'MEDIACONVERT_ROLE_ARN' => '',
      'UPLOADS_S3_BUCKET' => 'lingolinq-test-uploads'
    }) do
      it "should return false without building a client when MediaConvert is not configured" do
        u = User.create
        v = UserVideo.create(:user => u, :settings => {'full_filename' => 'a/b/c.avi'})
        expect(Transcoder).to_not receive(:config)
        expect(Aws::MediaConvert::Client).to_not receive(:new)
        allow(Rails.logger).to receive(:warn)
        res = Transcoder.convert_video(v.global_id, 'd/e/f', 'qwert')
        expect(res).to eq(false)
      end
    end

    env_wrap({
      'MEDIACONVERT_ROLE_ARN' => 'arn:aws:iam::123:role/MediaConvert',
      'UPLOADS_S3_BUCKET' => 'lingolinq-test-uploads'
    }) do
      it "should schedule a transcoding job and return the id" do
        u = User.create
        v = UserVideo.create(:user => u, :settings => {'full_filename' => 'a/b/c.avi'})
        config = OpenStruct.new
        job = OpenStruct.new
        job.id = 'asdf'
        expect(Transcoder).to receive(:config).and_return(config)
        expect(config).to receive(:create_job) do |job_args|
          expect(job_args[:role]).to eq('arn:aws:iam::123:role/MediaConvert')
          expect(job_args).to_not have_key(:queue)
          expect(job_args[:user_metadata]).to eq({
            'video_id' => v.global_id,
            'conversion_type' => 'video',
            'transcoding_key' => 'qwert'
          })
          expect(job_args[:settings][:inputs][0][:file_input]).to eq('s3://lingolinq-test-uploads/a/b/c.avi')
          outputs = job_args[:settings][:output_groups][0][:outputs]
          mp4 = outputs.detect { |o| o.dig(:container_settings, :container) == 'MP4' }
          thumb = outputs.detect { |o| o.dig(:video_description, :codec_settings, :codec) == 'FRAME_CAPTURE' }
          expect(mp4[:video_description][:width]).to eq(640)
          expect(mp4[:video_description][:height]).to eq(480)
          expect(thumb).to_not eq(nil)
        end.and_return(OpenStruct.new({job: job}))
        res = Transcoder.convert_video(v.global_id, 'd/e/f', 'qwert')
        expect(res).to eq({job_id: 'asdf'})
      end
    end
  end

  describe "SDK parameter validation" do
    # The specs above hand create_job an OpenStruct, so they only prove the hash
    # matches itself. A real client with stub_responses runs the SDK's own
    # ParamValidator (no network), which is what rejects a misspelled member.
    def stubbed_client
      client = Aws::MediaConvert::Client.new(region: 'us-west-2', stub_responses: true)
      client.stub_responses(:create_job, {job: {id: 'stub-job', role: 'arn:aws:iam::123:role/MediaConvert', settings: {}}})
      client
    end

    env_wrap({
      'MEDIACONVERT_ROLE_ARN' => 'arn:aws:iam::123:role/MediaConvert',
      'MEDIACONVERT_QUEUE_ARN' => 'arn:aws:mediaconvert:us-west-2:123:queues/Default',
      'UPLOADS_S3_BUCKET' => 'lingolinq-test-uploads'
    }) do
      it "should build an audio job the MediaConvert client accepts" do
        u = User.create
        bs = ButtonSound.create(:user => u, :settings => {'full_filename' => 'a/b/c.wav'})
        expect(Transcoder).to receive(:config).and_return(stubbed_client)
        res = Transcoder.convert_audio(bs.global_id, 'd/e/f', 'qwert')
        expect(res).to eq({job_id: 'stub-job'})
      end

      it "should build a video job the MediaConvert client accepts" do
        u = User.create
        v = UserVideo.create(:user => u, :settings => {'full_filename' => 'a/b/c.mov'})
        expect(Transcoder).to receive(:config).and_return(stubbed_client)
        res = Transcoder.convert_video(v.global_id, 'd/e/f', 'qwert')
        expect(res).to eq({job_id: 'stub-job'})
      end
    end
  end

  describe "config" do
    env_wrap({
      'AWS_KEY' => 'bacon',
      'AWS_SECRET' => 'fried',
      'TRANSCODER_REGION' => 'overthere',
      'MEDIACONVERT_ENDPOINT' => ''
    }) do
      it "should create a valid MediaConvert client" do
        expect(Aws::Credentials).to receive(:new).with('bacon', 'fried').and_return('bob')
        expect(Aws::MediaConvert::Client).to receive(:new) do |opts|
          expect(opts[:region]).to eq('overthere')
          expect(opts[:credentials]).to eq('bob')
          expect(opts[:retry_limit]).to eq(2)
          expect(opts[:retry_backoff]).to_not eq(nil)
          expect(opts).to_not have_key(:endpoint)
        end
        Transcoder.config
      end
    end

    env_wrap({
      'AWS_KEY' => 'bacon',
      'AWS_SECRET' => 'fried',
      'AWS_REGION' => 'us-west-2',
      'MEDIACONVERT_ENDPOINT' => 'https://abcd.mediaconvert.us-west-2.amazonaws.com'
    }) do
      it "should pass a configured account endpoint through" do
        expect(Aws::Credentials).to receive(:new).with('bacon', 'fried').and_return('bob')
        expect(Aws::MediaConvert::Client).to receive(:new) do |opts|
          expect(opts[:endpoint]).to eq('https://abcd.mediaconvert.us-west-2.amazonaws.com')
          expect(opts[:credentials]).to eq('bob')
        end
        Transcoder.config
      end
    end
  end
end
