require 'aws-sdk-mediaconvert'

module Transcoder
  # MediaConvert Frame Capture numbers frames with seven digits (0000001).
  # Leftover Elastic Transcoder thumbs used five. handle_event guesses the
  # current default when GetJob omits a still; the destroy-time sweep accepts both.
  THUMBNAIL_FALLBACK_COUNTER = '0000001'

  def self.configured?
    ENV['MEDIACONVERT_ROLE_ARN'].to_s.strip != '' && ENV['UPLOADS_S3_BUCKET'].to_s.strip != ''
  end

  def self.handle_event(args)
    job_id, status, detail = parse_event_message(args)
    return false if job_id.to_s.strip == ''

    res = config.get_job({id: job_id})
    job = res && (res.respond_to?(:job) ? res.job : nil)
    return false if !job

    meta = job_user_metadata(job)
    return false if meta.blank?

    record = if meta['conversion_type'] == 'audio'
      ButtonSound.find_by_global_id(meta['audio_id'])
    elsif meta['conversion_type'] == 'video'
      UserVideo.find_by_global_id(meta['video_id'])
    else
      return false
    end

    if error_status?(status)
      record.media_object_error({code: (detail['errorCode'] || detail['errorMessage'] || args['errorCode']), job: job_id}) if record
      return true
    end
    return true unless complete_status?(status)

    files = output_files(job)
    new_record = {
      'transcoding_key' => meta['transcoding_key']
    }
    if meta['conversion_type'] == 'audio'
      mp3 = files.find { |f| f[:key].to_s.end_with?('.mp3') }
      wav = files.find { |f| f[:key].to_s.end_with?('.wav') }
      return false unless mp3
      new_record['filename'] = mp3[:key]
      new_record['duration'] = duration_seconds(mp3)
      new_record['content_type'] = 'audio/mp3'
      if wav
        new_record['secondary_output'] = {
          'filename' => wav[:key],
          'duration' => duration_seconds(wav),
          'content_type' => 'audio/wav'
        }
      end
    else
      mp4 = files.find { |f| f[:key].to_s.end_with?('.mp4') }
      thumb = files.find { |f| f[:key].to_s.match?(/\.(jpg|png)\z/) }
      return false unless mp4
      new_record['filename'] = mp4[:key]
      new_record['duration'] = duration_seconds(mp4)
      new_record['content_type'] = 'video/mp4'
      # thumbnail_filename only seeds MediaObject#thumbnail_stem for the
      # destroy-time live S3 listing. A wrong first-frame guess costs nothing.
      new_record['thumbnail_filename'] = thumb ? thumb[:key] : "#{mp4[:key]}.#{THUMBNAIL_FALLBACK_COUNTER}.jpg"
    end

    record.update_media_object(new_record) if record
    true
  end

  def self.convert_audio(button_sound_id, prefix, transcoding_key)
    button_sound = ButtonSound.find_by_global_id(button_sound_id)
    return false unless button_sound
    unless configured?
      Rails.logger.warn("Transcoder.convert_audio skipped for #{button_sound.global_id}: MediaConvert is not configured")
      return false
    end
    res = config.create_job(audio_job(button_sound, prefix, transcoding_key))
    {job_id: res.job.id}
  end

  def self.convert_video(video_id, prefix, transcoding_key)
    video = UserVideo.find_by_global_id(video_id)
    return false unless video
    unless configured?
      Rails.logger.warn("Transcoder.convert_video skipped for #{video.global_id}: MediaConvert is not configured")
      return false
    end
    res = config.create_job(video_job(video, prefix, transcoding_key))
    {job_id: res.job.id}
  end

  def self.config
    cred = Aws::Credentials.new((ENV['TRANSCODER_KEY'] || ENV['AWS_KEY']), (ENV['TRANSCODER_SECRET'] || ENV['AWS_SECRET']))
    opts = {
      region: (ENV['TRANSCODER_REGION'] || ENV['AWS_REGION'] || 'us-west-2'),
      credentials: cred,
      retry_limit: 2,
      retry_backoff: lambda { |_c| sleep(3) }
    }
    opts[:endpoint] = ENV['MEDIACONVERT_ENDPOINT'] if ENV['MEDIACONVERT_ENDPOINT'].to_s.strip != ''
    Aws::MediaConvert::Client.new(opts)
  end

  def self.audio_job(button_sound, prefix, transcoding_key)
    modifier = name_modifier_for(prefix, button_sound.full_filename)
    job = {
      role: ENV['MEDIACONVERT_ROLE_ARN'],
      user_metadata: {
        'audio_id' => button_sound.global_id,
        'conversion_type' => 'audio',
        'transcoding_key' => transcoding_key
      },
      settings: {
        inputs: [audio_input(button_sound.full_filename)],
        output_groups: [{
          name: 'File Group',
          output_group_settings: file_group_settings(prefix),
          outputs: [
            mp3_output(modifier),
            wav_output(modifier)
          ]
        }]
      }
    }
    apply_queue!(job)
    job
  end

  def self.video_job(video, prefix, transcoding_key)
    modifier = name_modifier_for(prefix, video.full_filename)
    job = {
      role: ENV['MEDIACONVERT_ROLE_ARN'],
      user_metadata: {
        'video_id' => video.global_id,
        'conversion_type' => 'video',
        'transcoding_key' => transcoding_key
      },
      settings: {
        inputs: [video_input(video.full_filename)],
        output_groups: [{
          name: 'File Group',
          output_group_settings: file_group_settings(prefix),
          outputs: [
            mp4_output(modifier),
            frame_capture_output(modifier)
          ]
        }]
      }
    }
    apply_queue!(job)
    job
  end

  def self.s3_uri(key)
    "s3://#{ENV['UPLOADS_S3_BUCKET']}/#{key.to_s.sub(%r{\A/}, '')}"
  end

  def self.s3_key_from_uri(uri)
    return nil if uri.nil?
    uri.to_s.sub(%r{\As3://[^/]+/}, '').sub(%r{\Ahttps://[^/]+\.s3(?:\.[a-z0-9-]+)?\.amazonaws\.com/}, '')
  end

  def self.name_modifier_for(prefix, input_key)
    input_stem = File.basename(input_key.to_s, '.*')
    prefix_base = File.basename(prefix.to_s)
    if prefix_base.start_with?(input_stem)
      prefix_base[input_stem.length..-1].to_s
    else
      "_#{prefix_base}"
    end
  end

  def self.parse_event_message(args)
    raw = args && (args['Message'] || args[:Message] || args)
    payload = raw.is_a?(String) ? JSON.parse(raw) : raw
    payload = {} unless payload.is_a?(Hash)
    detail = payload['detail']
    detail = {} unless detail.is_a?(Hash)
    job_id = detail['jobId'] || payload['jobId']
    status = detail['status'] || payload['state'] || payload['status']
    [job_id, status, detail]
  end

  def self.complete_status?(status)
    %w[COMPLETE COMPLETED].include?(status.to_s)
  end

  def self.error_status?(status)
    status.to_s == 'ERROR'
  end

  def self.job_user_metadata(job)
    meta = job.respond_to?(:user_metadata) ? job.user_metadata : nil
    meta = meta.to_h if meta.respond_to?(:to_h)
    return {} unless meta.is_a?(Hash)
    meta.with_indifferent_access
  end

  def self.output_files(job)
    groups = job.respond_to?(:output_group_details) ? job.output_group_details : nil
    return [] unless groups
    Array(groups).flat_map do |group|
      details = group.respond_to?(:output_details) ? group.output_details : nil
      Array(details).flat_map do |out|
        paths = out.respond_to?(:output_file_paths) ? out.output_file_paths : nil
        duration_ms = out.respond_to?(:duration_in_ms) ? out.duration_in_ms : nil
        Array(paths).map do |path|
          {key: s3_key_from_uri(path), duration_in_ms: duration_ms}
        end
      end
    end
  end

  def self.duration_seconds(file)
    ms = file && file[:duration_in_ms]
    return nil if ms.nil?
    (ms.to_f / 1000).to_i
  end

  def self.apply_queue!(job)
    queue = ENV['MEDIACONVERT_QUEUE_ARN'].to_s.strip
    job[:queue] = queue unless queue == ''
    job
  end

  def self.file_group_settings(prefix)
    dir = File.dirname(prefix.to_s)
    {
      type: 'FILE_GROUP_SETTINGS',
      file_group_settings: {
        destination: s3_uri("#{dir}/")
      }
    }
  end

  def self.audio_input(key)
    {
      file_input: s3_uri(key),
      audio_selectors: {
        'Audio Selector 1' => {
          default_selection: 'DEFAULT'
        }
      }
    }
  end

  def self.video_input(key)
    {
      file_input: s3_uri(key),
      audio_selectors: {
        'Audio Selector 1' => {
          default_selection: 'DEFAULT'
        }
      },
      video_selector: {},
      timecode_source: 'ZEROBASED'
    }
  end

  def self.mp3_output(name_modifier)
    {
      name_modifier: name_modifier,
      container_settings: {
        container: 'RAW'
      },
      audio_descriptions: [{
        audio_source_name: 'Audio Selector 1',
        codec_settings: {
          codec: 'MP3',
          mp3_settings: {
            bitrate: 128000,
            channels: 2,
            rate_control_mode: 'CBR',
            sample_rate: 44100
          }
        }
      }]
    }
  end

  def self.wav_output(name_modifier)
    {
      name_modifier: name_modifier,
      container_settings: {
        container: 'RAW'
      },
      audio_descriptions: [{
        audio_source_name: 'Audio Selector 1',
        codec_settings: {
          codec: 'WAV',
          wav_settings: {
            bit_depth: 16,
            channels: 1,
            sample_rate: 44100
          }
        }
      }]
    }
  end

  def self.mp4_output(name_modifier)
    {
      name_modifier: name_modifier,
      container_settings: {
        container: 'MP4',
        mp4_settings: {}
      },
      video_description: {
        width: 640,
        height: 480,
        codec_settings: {
          codec: 'H_264',
          h264_settings: {
            rate_control_mode: 'CBR',
            bitrate: 1200000,
            codec_profile: 'MAIN',
            codec_level: 'AUTO',
            gop_size: 90,
            gop_size_units: 'FRAMES',
            number_b_frames_between_reference_frames: 2,
            number_reference_frames: 3,
            framerate_control: 'INITIALIZE_FROM_SOURCE',
            par_control: 'INITIALIZE_FROM_SOURCE',
            interlace_mode: 'PROGRESSIVE'
          }
        }
      },
      audio_descriptions: [{
        audio_source_name: 'Audio Selector 1',
        codec_settings: {
          codec: 'AAC',
          aac_settings: {
            bitrate: 96000,
            coding_mode: 'CODING_MODE_2_0',
            sample_rate: 48000
          }
        }
      }]
    }
  end

  def self.frame_capture_output(name_modifier)
    {
      name_modifier: "#{name_modifier}.mp4",
      container_settings: {
        container: 'RAW'
      },
      video_description: {
        codec_settings: {
          codec: 'FRAME_CAPTURE',
          frame_capture_settings: {
            framerate_numerator: 1,
            framerate_denominator: 5,
            max_captures: 1,
            quality: 80
          }
        }
      }
    }
  end
end
