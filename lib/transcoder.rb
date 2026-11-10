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
    return reject_event(nil, 'no job id') if job_id.to_s.strip == ''

    res = config.get_job({id: job_id})
    job = res && (res.respond_to?(:job) ? res.job : nil)
    return reject_event(nil, 'GetJob returned no job') if !job

    meta = job_user_metadata(job)
    return reject_event(job_id, 'job has no user metadata') if meta.blank?

    record = if meta['conversion_type'] == 'audio'
      ButtonSound.find_by_global_id(meta['audio_id'])
    elsif meta['conversion_type'] == 'video'
      UserVideo.find_by_global_id(meta['video_id'])
    else
      return reject_event(job_id, 'unknown conversion_type')
    end

    if error_status?(status)
      record.media_object_error({code: (detail['errorCode'] || detail['errorMessage'] || args['errorCode']), job: job_id}) if record
      return true
    end
    return true unless complete_status?(status)
    # The event's status is only as trusted as its SNS sender; GetJob's is AWS's
    # own. A real COMPLETE that outruns GetJob gets :retry, which the controller
    # answers with a 503 so SNS redelivers it (SNS retries only 5xx and 429).
    job_status = job.respond_to?(:status) ? job.status.to_s : ''
    return :retry if %w[SUBMITTED PROGRESSING].include?(job_status)
    return reject_event(job_id, 'GetJob status is not COMPLETE') unless complete_status?(job_status)

    files = output_files(job, detail)
    new_record = {
      'transcoding_key' => meta['transcoding_key']
    }
    if meta['conversion_type'] == 'audio'
      mp3 = files.find { |f| f[:key].to_s.end_with?('.mp3') }
      wav = files.find { |f| f[:key].to_s.end_with?('.wav') }
      return reject_event(job_id, 'no mp3 output') unless mp3
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
      return reject_event(job_id, 'no mp4 output') unless mp4
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

  # Logged lines reach Cloud Logging and the upload buckets are public-read, so a key's 128-hex
  # file_prefix digest (uploadable.rb:67-70) must never be logged. Each rejection line carries a
  # fixed reason and, once GetJob has accepted it, the event's job id; no other event text.
  def self.reject_event(job_id, reason)
    Rails.logger.warn("Transcoder.handle_event rejected job=#{job_id || '-'}: #{reason}")
    false
  end

  LOGGED_EVENT_MAX = 4000
  LOG_SECRET_HEX = /\h{32,}/
  # No diagnostic value, and UnsubscribeURL can unsubscribe the endpoint.
  LOG_DROPPED_FIELDS = %w[Signature SigningCertURL UnsubscribeURL].freeze

  # The notification as a log line: its shape stays (job id, status, error code and message,
  # path layout) and the secrets go (long hex runs, transcoding_key). Never raises.
  def self.loggable_event(args)
    envelope = args.is_a?(Hash) ? args.except(*LOG_DROPPED_FIELDS) : {}
    message = envelope['Message']
    if message.is_a?(String)
      parsed = JSON.parse(message) rescue nil
      envelope['Message'] = parsed if parsed
    end
    redact_for_log(envelope).to_json[0, LOGGED_EVENT_MAX]
  rescue StandardError => e
    job_id = (parse_event_message(args)[0] rescue nil).to_s.scrub[/\A[\w-]{1,80}\z/]
    "unloggable event (#{e.class}) job=#{job_id || '-'}"
  end

  def self.redact_for_log(value)
    case value
    when Hash
      value.each_with_object({}) do |(k, v), res|
        res[k] = k.to_s == 'transcoding_key' ? '[redacted]' : redact_for_log(v)
      end
    when Array then value.map { |v| redact_for_log(v) }
    when String then value.scrub.gsub(LOG_SECRET_HEX, '[hex]')
    else value
    end
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

  # GetJob's OutputDetail has no file paths (aws-sdk-mediaconvert OutputDetail is
  # duration_in_ms + video_details only); the EventBridge COMPLETE event carries
  # them in detail.outputGroupDetails[].outputDetails[].outputFilePaths. The
  # event body is only as trusted as its SNS sender, so a path is kept only when
  # its directory is exactly a destination this job was given, read from GetJob,
  # and its name cannot leave that directory once it is a URL (no / \ % etc).
  OUTPUT_NAME = /\A[A-Za-z0-9._-]+\z/

  def self.output_files(job, detail)
    destinations = job_destinations(job)
    groups = detail.is_a?(Hash) ? detail['outputGroupDetails'] : nil
    Array(groups).flat_map do |group|
      details = group.is_a?(Hash) ? group['outputDetails'] : nil
      Array(details).flat_map do |out|
        next [] unless out.is_a?(Hash)
        Array(out['outputFilePaths']).filter_map do |path|
          dir, _slash, name = path.to_s.rpartition('/')
          next if !name.match?(OUTPUT_NAME) || !destinations.include?("#{dir}/")
          {key: s3_key_from_uri(path), duration_in_ms: out['durationInMs']}
        end
      end
    end
  end

  def self.job_destinations(job)
    settings = job.respond_to?(:settings) ? job.settings : nil
    groups = settings.respond_to?(:output_groups) ? settings.output_groups : nil
    Array(groups).filter_map do |group|
      group_settings = group.respond_to?(:output_group_settings) ? group.output_group_settings : nil
      file_group = group_settings.respond_to?(:file_group_settings) ? group_settings.file_group_settings : nil
      destination = file_group.respond_to?(:destination) ? file_group.destination.to_s : ''
      destination if destination.end_with?('/')
    end
  end

  def self.duration_seconds(file)
    ms = file && file[:duration_in_ms]
    return nil unless ms.is_a?(Numeric) && ms.finite? && ms >= 0
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
      extension: 'mp3',
      container_settings: {
        container: 'RAW'
      },
      audio_descriptions: [{
        audio_source_name: 'Audio Selector 1',
        codec_settings: {
          codec: 'MP3',
          mp_3_settings: {
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
      extension: 'wav',
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
        mp_4_settings: {}
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
