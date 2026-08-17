module MediaObject
  extend ActiveSupport::Concern

  # Neither the exact thumbnail count nor the image format Elastic Transcoder
  # produces for a given UserVideo is knowable ahead of time from stored
  # metadata alone (preset config -- interval, Thumbnails.Format -- isn't
  # reachable from this environment; ETS is deprecated with no live API
  # access here). So rather than guess a single key to schedule, recover the
  # record-owned thumbnail STEM (the part of thumbnail_filename before the
  # AWS-appended ".<count>.<ext>", or before the legacy hardcoded ".0000.png"
  # -- both shapes share the same stem, since it's just <output_key>, the
  # same key stored as full_filename once transcoding completes) and use it
  # to look up what AWS actually created.
  THUMBNAIL_KEY_STEM = /\A(.+)\.(?:0000|\d{5})\.(?:jpg|png)\z/

  def thumbnail_stem(thumbnail_filename)
    return nil unless thumbnail_filename
    m = thumbnail_filename.match(THUMBNAIL_KEY_STEM)
    m && m[1]
  end

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
      # A stalled/overlapping transcode job that completes after a replacement
      # was already scheduled (ButtonSound.schedule_missing_transcodings runs
      # daily) would otherwise overwrite these with no record of the outgoing
      # value, the same orphan risk full_filename is already guarded against
      # two lines above -- so preserve them the same way. The outgoing
      # thumbnail is preserved as a STEM (prior_thumbnail_stems), not a
      # single key in prior_full_filenames: it may have been a multi-object
      # family too (00001, 00002, ...), and remove_derivative_remote_data
      # below re-lists a stem in full rather than assuming it was ever just
      # one file. Falls back to the single-key list only if the stored value
      # doesn't match the expected shape at all.
      if opts['thumbnail_filename']
        old_thumb = self.settings['thumbnail_filename']
        if old_thumb && old_thumb != opts['thumbnail_filename']
          old_stem = thumbnail_stem(old_thumb)
          if old_stem
            self.settings['prior_thumbnail_stems'] ||= []
            self.settings['prior_thumbnail_stems'] << old_stem
          else
            self.settings['prior_full_filenames'] << old_thumb
          end
        end
        self.settings['thumbnail_filename'] = opts['thumbnail_filename']
      end
      params = self.remote_upload_params
      self.url = params[:upload_url] + opts['filename']
      self.settings['pending'] = false
      self.settings['pending_url'] = nil
      if opts['secondary_output']
        self.settings['prior_full_filenames'] << self.settings['secondary_output']['filename'] if self.settings['secondary_output'] && self.settings['secondary_output']['filename']
        self.settings['secondary_output'] = opts['secondary_output']
      end
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

  # Transcoding leaves derivative S3 objects that Uploadable's after_destroy
  # (schedule_remote_removal_if_unique) never reaches, because that hook only
  # ever removes self.url: ButtonSound's un-transcribed working copy
  # (settings['secondary_output']['filename']), replaced-but-never-swept
  # originals from a prior transcode (settings['prior_full_filenames']),
  # UserVideo's still-frame thumbnail (settings['thumbnail_filename']), and an
  # abandoned/never-confirmed direct upload (settings['full_filename'] set,
  # but self.url never finalized -- see the comment below). All are stored as
  # bare S3 keys (lib/transcoder.rb; uploadable.rb's full_filename), so
  # Uploader.remote_remove can take them directly without building a signed
  # upload URL, which keeps this off the content_type-dependent path
  # (Uploadable#content_type raises on a legacy row with no content_type) and
  # out of the destroy transaction, so a malformed/legacy row can't abort the
  # rest of a user's Flusher erasure sweep.
  def remove_derivative_remote_data
    # Tagged with a category (not just the bare key) so a scheduling-failure
    # log line is enough to diagnose and manually retry a specific derivative
    # without having to re-derive which settings field it came from.
    keyed = []
    thumbnail_stems = []
    begin
      if self.settings
        keyed << ['secondary_output', self.settings.dig('secondary_output', 'filename')]
        # Neither the exact thumbnail count nor the image format Elastic
        # Transcoder produced for THIS record is knowable from stored
        # metadata alone -- only the stem (recovered here, a pure settings
        # read) is. The actual S3 lookup + strict-filter + delete is deferred
        # to Uploader.remote_remove_thumbnail_family below, matching every
        # other category here: this callback only ever enqueues, it never
        # itself makes a network call. A superseded thumbnail from an
        # overlapping/stalled transcode (see prior_thumbnail_stems above) may
        # have been its own multi-object family too, so it gets the same
        # full family sweep as the current one -- not folded into the
        # single-key prior_full_filenames list.
        if self.settings['thumbnail_filename']
          stem = thumbnail_stem(self.settings['thumbnail_filename'])
          if stem
            thumbnail_stems << stem
          else
            Rails.logger.error("Thumbnail stem could not be recovered for #{self.class.name} #{self.global_id}: unrecognized thumbnail_filename shape")
          end
        end
        if self.settings['prior_thumbnail_stems'].is_a?(Array)
          thumbnail_stems.concat(self.settings['prior_thumbnail_stems'].compact)
        end
        if self.settings['prior_full_filenames'].is_a?(Array)
          self.settings['prior_full_filenames'].each { |k| keyed << ['prior_full_filename', k] }
        end
        # The client requests upload params (which persists
        # settings['full_filename'] via Uploadable#full_filename's own
        # self.save) before it ever PUTs the file to S3; self.url is only set
        # later, by the /upload_success confirmation callback
        # (app/controllers/concerns/remote_uploader.rb:19). If that
        # confirmation never arrives -- dropped connection, closed tab,
        # client bug -- the object can be genuinely present in S3 with url
        # still nil forever, and Uploadable's after_destroy (keyed on
        # self.url) never reaches it. Only treat full_filename as a residual
        # when it ISN'T the record's current, already-covered primary object,
        # so this never double-schedules (or interferes with) the normal
        # case Uploadable already handles. No separate cross-record
        # uniqueness lookup is needed: full_filename is derived from this
        # record's own global_id + created_at (Uploadable#file_prefix), so it
        # cannot collide with another record's key.
        full_filename = self.settings['full_filename']
        if full_filename && !(self.url.present? && self.url.to_s.end_with?(full_filename))
          keyed << ['abandoned_full_filename', full_filename]
        end
      end
    rescue StandardError => e
      # settings is secure_serialize'd (go_secure); this runs in an after_commit,
      # so a decrypt failure here must never propagate into Flusher's sweep.
      Rails.logger.error("Derivative remote removal key collection failed for #{self.class.name} #{self.global_id}: #{e.class}: #{e.message}")
      return
    end
    seen = {}
    keyed.each do |category, key|
      next unless key
      next if seen[key]
      seen[key] = true
      begin
        Worker.schedule(Uploader, :remote_remove, key)
      rescue StandardError => e
        Rails.logger.error("Derivative remote removal scheduling failed for #{self.class.name} #{self.global_id}, category=#{category}, key=#{key}: #{e.class}: #{e.message}")
      end
    end
    thumbnail_stems.uniq.each do |stem|
      begin
        Worker.schedule(Uploader, :remote_remove_thumbnail_family, stem, self.class.name, self.global_id)
      rescue StandardError => e
        Rails.logger.error("Derivative remote removal scheduling failed for #{self.class.name} #{self.global_id}, category=thumbnail_family, stem=#{stem}: #{e.class}: #{e.message}")
      end
    end
  end

  included do
    after_save :schedule_transcoding
    after_destroy_commit :remove_derivative_remote_data
  end
end
