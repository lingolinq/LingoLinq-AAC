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
    # These get_job responses are OpenStructs that supply only what a real GetJob
    # has: user_metadata and the output destination. The output paths come from
    # the COMPLETE event (outputGroupDetails), as on a real MediaConvert job; the
    # SDK-shaped versions are in "handle_event against an SDK-shaped GetJob".
    def file_group_job(user_metadata)
      OpenStruct.new({
        status: 'COMPLETE',
        user_metadata: user_metadata,
        settings: OpenStruct.new({output_groups: [OpenStruct.new({
          output_group_settings: OpenStruct.new({
            file_group_settings: OpenStruct.new({destination: 's3://lingolinq-test-uploads/some/'})
          })
        })]})
      })
    end

    def output_group_details(outputs)
      {'outputGroupDetails' => [{
        'type' => 'FILE_GROUP',
        'outputDetails' => outputs.map { |path, ms| {'outputFilePaths' => [path], 'durationInMs' => ms}.compact }
      }]}
    end

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

    it "should update the sound for audio COMPLETE events using the event's durationInMs" do
      config = OpenStruct.new
      job = file_group_job({
        'audio_id' => 'sound_id',
        'conversion_type' => 'audio',
        'transcoding_key' => 'bacon'
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
      res = Transcoder.handle_event({'Message' => eventbridge_message('jobby', 'COMPLETE', output_group_details([
        ['s3://lingolinq-test-uploads/some/file.mp3', 12000],
        ['s3://lingolinq-test-uploads/some/file.wav', 12000]
      ]))})
      expect(res).to eq(true)
    end

    it "should update the video for video COMPLETE events" do
      config = OpenStruct.new
      job = file_group_job({
        'video_id' => 'video_id',
        'conversion_type' => 'video',
        'transcoding_key' => 'bacon'
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
      res = Transcoder.handle_event({'Message' => eventbridge_message('jobby', 'COMPLETE', output_group_details([
        ['s3://lingolinq-test-uploads/some/file.mp4', 12000],
        ['s3://lingolinq-test-uploads/some/file.mp4.0000001.jpg', nil]
      ]))})
      expect(res).to eq(true)
    end

    it "should fall back to a 7-digit jpg thumbnail guess when the event lists no still" do
      config = OpenStruct.new
      job = file_group_job({
        'video_id' => 'video_id',
        'conversion_type' => 'video',
        'transcoding_key' => 'bacon'
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
      res = Transcoder.handle_event({'Message' => eventbridge_message('jobby', 'COMPLETE', output_group_details([
        ['s3://lingolinq-test-uploads/some/file.mp4', 12000]
      ]))})
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

      # Pins the SDK shape behind #981: a real OutputDetail has no
      # output_file_paths, so GetJob alone yields no output files. The paths come
      # from the COMPLETE event; see "handle_event against an SDK-shaped GetJob".
      it "should find no output files on an SDK-shaped GetJob response" do
        client = stubbed_client
        client.stub_responses(:get_job, {job: {
          id: 'stub-job',
          role: 'arn:aws:iam::123:role/MediaConvert',
          settings: {},
          output_group_details: [{output_details: [{duration_in_ms: 12000}]}]
        }})
        job = client.get_job({id: 'stub-job'}).job
        expect(job.output_group_details[0].output_details[0].respond_to?(:output_file_paths)).to eq(false)
        expect(Transcoder.output_files(job, {})).to eq([])
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

  describe "handle_event against an SDK-shaped GetJob" do
    # GetJob's OutputDetail has no file paths (aws-sdk-mediaconvert types.rb,
    # OutputDetail = duration_in_ms, video_details). AWS documents them on the
    # EventBridge COMPLETE event instead, detail.outputGroupDetails[].outputDetails[]
    # .outputFilePaths (docs.aws.amazon.com/mediaconvert/latest/ug/file-group.html).
    # The events below follow that documented shape; the client is a real
    # stub_responses client, so GetJob cannot grow members the SDK lacks.
    def stubbed_get_job(user_metadata, status='COMPLETE')
      client = Aws::MediaConvert::Client.new(region: 'us-west-2', stub_responses: true)
      client.stub_responses(:get_job, {job: {
        id: 'jobby',
        status: status,
        role: 'arn:aws:iam::123:role/MediaConvert',
        settings: {output_groups: [{output_group_settings: {
          type: 'FILE_GROUP_SETTINGS',
          file_group_settings: {destination: 's3://lingolinq-test-uploads/some/dir/'}
        }}]},
        user_metadata: user_metadata,
        # A different duration from the event's, so reading it from here fails.
        output_group_details: [{output_details: [{duration_in_ms: 99000}]}]
      }})
      expect(Transcoder).to receive(:config).and_return(client)
    end

    def complete_message(outputs)
      {
        'detail-type' => 'MediaConvert Job State Change',
        'source' => 'aws.mediaconvert',
        'detail' => {
          'jobId' => 'jobby',
          'status' => 'COMPLETE',
          'outputGroupDetails' => [{
            'type' => 'FILE_GROUP',
            'outputDetails' => outputs.map { |path, ms| {'outputFilePaths' => [path], 'durationInMs' => ms}.compact }
          }]
        }
      }.to_json
    end

    env_wrap({'UPLOADS_S3_BUCKET' => 'lingolinq-test-uploads'}) do
      it "should update the sound from the COMPLETE event's output paths" do
        stubbed_get_job({'audio_id' => 'sound_id', 'conversion_type' => 'audio', 'transcoding_key' => 'bacon'})
        bs = ButtonSound.create
        expect(ButtonSound).to receive(:find_by_global_id).with('sound_id').and_return(bs)
        expect(bs).to receive(:update_media_object).with({
          'filename' => 'some/dir/file.mp3',
          'duration' => 12,
          'content_type' => 'audio/mp3',
          'transcoding_key' => 'bacon',
          'secondary_output' => {
            'filename' => 'some/dir/file.wav',
            'duration' => 12,
            'content_type' => 'audio/wav'
          }
        })
        res = Transcoder.handle_event({'Message' => complete_message([
          ['s3://lingolinq-test-uploads/some/dir/file.mp3', 12000],
          ['s3://lingolinq-test-uploads/some/dir/file.wav', 12000]
        ])})
        expect(res).to eq(true)
      end

      it "should update the video and its still from the COMPLETE event's output paths" do
        stubbed_get_job({'video_id' => 'video_id', 'conversion_type' => 'video', 'transcoding_key' => 'bacon'})
        v = UserVideo.create
        expect(UserVideo).to receive(:find_by_global_id).with('video_id').and_return(v)
        expect(v).to receive(:update_media_object).with({
          'filename' => 'some/dir/file.mp4',
          'duration' => 12,
          'content_type' => 'video/mp4',
          'transcoding_key' => 'bacon',
          'thumbnail_filename' => 'some/dir/file.mp4.0000003.jpg'
        })
        res = Transcoder.handle_event({'Message' => complete_message([
          ['s3://lingolinq-test-uploads/some/dir/file.mp4', 12000],
          ['s3://lingolinq-test-uploads/some/dir/file.mp4.0000003.jpg', nil]
        ])})
        expect(res).to eq(true)
      end

      # Exact match on the GetJob destination: a sibling bucket that shares the
      # prefix, another record's directory, and a directory nested under ours
      # (record directories are id digits, so some/dir/ is a prefix of some/dir/0/).
      [
        's3://some-other-bucket/some/dir/file.mp3',
        's3://lingolinq-test-uploads-evil/some/dir/file.mp3',
        's3://lingolinq-test-uploads/other/dir/file.mp3',
        's3://lingolinq-test-uploads/some/dir/0/file.mp3',
        # The name must not walk out of the directory either: the stored URL is
        # bucket + key (media_object.rb:63), best_url unescapes it when it holds
        # %20 (uploadable.rb:48), and a browser reads \\ as / and resolves ..
        's3://lingolinq-test-uploads/some/dir/..\\..\\other\\dir\\file.mp3',
        's3://lingolinq-test-uploads/some/dir/%20%2F..%2F..%2Fother%2Fdir%2Ffile.mp3',
        's3://lingolinq-test-uploads/some/dir/0%2Ffile.mp3'
      ].each do |path|
        it "should not point a record at #{path}" do
          stubbed_get_job({'audio_id' => 'sound_id', 'conversion_type' => 'audio', 'transcoding_key' => 'bacon'})
          bs = ButtonSound.create
          expect(ButtonSound).to receive(:find_by_global_id).with('sound_id').and_return(bs)
          expect(bs).to_not receive(:update_media_object)
          res = Transcoder.handle_event({'Message' => complete_message([[path, 12000]])})
          expect(res).to eq(false)
        end
      end

      # The event's status is only as trusted as its SNS sender; GetJob's is AWS's own.
      %w[SUBMITTED PROGRESSING].each do |status|
        it "should ask for a redelivery when GetJob still reports #{status}" do
          stubbed_get_job({'audio_id' => 'sound_id', 'conversion_type' => 'audio', 'transcoding_key' => 'bacon'}, status)
          bs = ButtonSound.create
          expect(ButtonSound).to receive(:find_by_global_id).with('sound_id').and_return(bs)
          expect(bs).to_not receive(:update_media_object)
          res = Transcoder.handle_event({'Message' => complete_message([
            ['s3://lingolinq-test-uploads/some/dir/file.mp3', 12000]
          ])})
          expect(res).to eq(:retry)
        end
      end

      %w[ERROR CANCELED].each do |status|
        it "should not complete a record whose GetJob reports #{status}" do
          stubbed_get_job({'audio_id' => 'sound_id', 'conversion_type' => 'audio', 'transcoding_key' => 'bacon'}, status)
          bs = ButtonSound.create
          expect(ButtonSound).to receive(:find_by_global_id).with('sound_id').and_return(bs)
          expect(bs).to_not receive(:update_media_object)
          res = Transcoder.handle_event({'Message' => complete_message([
            ['s3://lingolinq-test-uploads/some/dir/file.mp3', 12000]
          ])})
          expect(res).to eq(false)
        end
      end

      [{'ms' => 1}, [1], true, -1, :overflow].each do |duration|
        it "should store no duration when the event's durationInMs is #{duration.inspect}" do
          stubbed_get_job({'audio_id' => 'sound_id', 'conversion_type' => 'audio', 'transcoding_key' => 'bacon'})
          bs = ButtonSound.create
          expect(ButtonSound).to receive(:find_by_global_id).with('sound_id').and_return(bs)
          expect(bs).to receive(:update_media_object).with({
            'filename' => 'some/dir/file.mp3',
            'duration' => nil,
            'content_type' => 'audio/mp3',
            'transcoding_key' => 'bacon'
          })
          # 1e400 parses to Infinity; to_json would write null, so it is spliced in.
          message = complete_message([
            ['s3://lingolinq-test-uploads/some/dir/file.mp3', duration == :overflow ? 12345 : duration]
          ]).sub('12345', '1e400')
          res = Transcoder.handle_event({'Message' => message})
          expect(res).to eq(true)
        end
      end
    end
  end

  describe "audio_job" do
    # The two audio outputs share one name_modifier and neither set an explicit
    # extension. AWS's own docs promise a codec-derived default for a RAW
    # (no-container) output, but confirmed on staging 2026-09-19 against two
    # real jobs (1789855178463-xw2g13, 1789856386401-7lemzf): MediaConvert
    # rejected both with errorCode 1040, "Duplicate output paths ... found in
    # input job." This is an AWS execution-time uniqueness check, not the SDK's
    # local ParamValidator, so stub_responses cannot reproduce it; the
    # assertion instead pins the invariant AWS enforces directly on the hash.
    it "should give the MP3 and WAV outputs distinct file extensions" do
      u = User.create
      bs = ButtonSound.create(:user => u, :settings => {'full_filename' => 'a/b/c.wav'})
      job = Transcoder.audio_job(bs, 'd/e/f', 'qwert')
      outputs = job[:settings][:output_groups][0][:outputs]
      mp3 = outputs.detect { |o| o.dig(:audio_descriptions, 0, :codec_settings, :codec) == 'MP3' }
      wav = outputs.detect { |o| o.dig(:audio_descriptions, 0, :codec_settings, :codec) == 'WAV' }
      expect(mp3[:extension]).to eq('mp3')
      expect(wav[:extension]).to eq('wav')
      # Broader than the two literal checks above: pins the actual invariant AWS
      # enforces (every output's [name_modifier, extension] pair must be unique
      # within the group), not just that these two happen to differ today. Would
      # also catch a third output added later that collides with either.
      pairs = outputs.map { |o| [o[:name_modifier], o[:extension]] }
      expect(pairs.uniq.length).to eq(pairs.length)
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
