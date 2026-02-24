module MediaObject
  extend ActiveSupport::Concern
  
  def update_media_object(opts)
    self.settings['transcoding_keys'] ||= []
    if self.settings['transcoding_keys'].include?(opts['transcoding_key'])
      # don't remove the old record for a long time, in case someone is still using it
      # Uploader.remote_remove(self.settings['full_filename'])
      self.settings['prior_full_filenames'] ||= []
      self.settings['prior_full_filenames'] << self.settings['full_filename'] if self.settings['full_filename'] != opts['filename']
      self.settings['prior_transcoding_keys'] ||= []
      self.settings['prior_transcoding_keys'] << opts['transcoding_key']
      self.settings['transcoding_keys'] -= [opts['transcoding_key']]
      self.settings['full_filename'] = opts['filename']
      self.settings['content_type'] = opts['content_type'] if opts['content_type']
      self.settings['duration'] = opts['duration'].to_i if opts['duration']
      self.settings['transcoding_in_progress'] = false
      self.settings['thumbnail_filename'] = opts['thumbnail_filename'] if opts['thumbnail_filename']
      params = self.remote_upload_params
      self.url = params[:upload_url] + opts['filename']
      self.settings['pending'] = false
      self.settings['pending_url'] = nil
      self.settings['secondary_output'] = opts['secondary_output'] if opts['secondary_output']
      self.save
    else
      false
    end
  end
  
  def media_object_error(opts)
    self.settings ||= {}
    self.settings['media_object_errors'] ||= []
    self.settings['media_object_errors'] << opts
    self.save
  end
  
  def schedule_transcoding(force=false)
    return true if !force && self.settings && self.settings['transcoding_attempted']
    if self.settings && self.settings['full_filename']
      method = self.is_a?(ButtonSound) ? :convert_audio : :convert_video
      prefix = self.file_path + self.file_prefix + "v" + Time.now.to_i.to_s
      transcoding_key = GoSecure.nonce('transcoding_key')
      Worker.schedule(Transcoder, method, self.global_id, prefix, transcoding_key)
      self.settings['transcoding_keys'] ||= []
      self.settings['transcoding_keys'] << transcoding_key
      self.settings['transcoding_attempted'] = true
      self.settings['transcoding_in_progress'] = true
      self.save
    end
    true
  end

  included do
    after_save :schedule_transcoding
  end
end
