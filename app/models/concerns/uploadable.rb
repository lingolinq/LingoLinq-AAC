require 'mime/types'
require 'uri'
require Rails.root.join('lib/svg_sanitizer').to_s

module Uploadable
  extend ActiveSupport::Concern

  # Worker/job argument: upload bytes from settings['data_uri'] instead of fetching a URL.
  UPLOAD_FROM_STORED_DATA_URI = '__upload_stored_data_uri__'

  # Max size for data URIs stored in DB when S3 upload fails. Prevents DB bloat from large images.
  # 512KB is enough for typical button images (400x400) but blocks oversized photos.
  DATA_URI_STORE_MAX_BYTES = 512 * 1024

  PROTECTED_IMAGE_URL_MATCHER = /\/api\/v1\/users\/.+\/protected_image/

  # Shared by url_for and ButtonImage#settings_for so the protected_image
  # token-minting logic (and any future changes to it) lives in one place.
  def self.tokenize_protected_image_url(url, user)
    return url unless user && url && url.match(PROTECTED_IMAGE_URL_MATCHER)
    url + (url.match(/\?/) ? '&' : '?') + "user_token=#{user.protected_image_token}"
  end

  def file_type 
    if self.is_a?(ButtonImage)
      'images'
    elsif self.is_a?(ButtonSound)
      'sounds'
    elsif self.is_a?(UserVideo)
      'videos'
    else
      'objects'
    end
  end
  
  def confirmation_key
    GoSecure.sha512(self.global_id + self.class.to_s, 'uploadable_file')
  end
  
  def best_url
    res = nil
    if self.settings && self.settings['cached_copy_url']
      res = self.settings['cached_copy_url']
    else
      res = Uploader.fronted_url(self.url)
    end
    # URI.decode was removed; use the default parser to unescape percent-encoded spaces
    res = URI::DEFAULT_PARSER.unescape(res) if res && res.match(/%20/)
    res
  end

  def full_filename
    return self.settings['full_filename'] if self.settings['full_filename']
    extension = ""
    type = MIME::Types[self.content_type]
    type = type && type[0]
    extension = ("." + type.extensions.first) if type && type.extensions && type.extensions.length > 0
    self.settings['full_filename'] = self.file_path + self.file_prefix + extension
    self.save
    self.settings['full_filename']
  end
  
  def url_for(user)
    Uploadable.tokenize_protected_image_url(self.url, user)
  end
  
  def file_prefix
    sha = GoSecure.sha512(self.global_id, self.created_at.iso8601)
    self.global_id + "-" + sha
  end
  
  def file_path
    digits = self.id.to_s.split(//)
    self.file_type + "/" + digits.join("/") + "/"
  end
  
  def content_type
    self.settings['content_type'] || raise("content type required for uploads")
  end
  
  def pending_upload?
    !!self.settings['pending']
  end
  
  def process_url(url, non_user_params)
    already_stored = Uploader.valid_remote_url?(url)
    if already_stored || non_user_params[:download] == false
      self.url = url
    else
      self.settings['pending_url'] = url
    end
    @remote_upload_possible = non_user_params[:remote_upload_possible]
    url
  end
  
  def check_for_pending
    self.settings ||= {}
    self.settings['pending'] = !!(!self.url || self.settings['pending_url'])

    remote_upload_possible = @remote_upload_possible
    remote_upload_possible = false if requires_server_sanitized_upload?

    # If there's no client to handle remote upload, go ahead and unmark it as
    # pending and schedule a bg job to download server-side
    if !remote_upload_possible && self.settings['pending']
      if self.settings['pending_url'].present?
        self.settings['pending'] = false
        self.url = self.settings['pending_url'].to_s
        @upload_to_remote_arg = self.settings['pending_url'].to_s
      elsif !self.url && self.settings['data_uri'].present? && requires_server_sanitized_upload?
        self.settings['pending'] = false
        @upload_to_remote_arg = UPLOAD_FROM_STORED_DATA_URI
      end
    end
    # TODO: check if it's a protected image (i.e. lessonpix) and download a cached
    # copy according. Keep the link pointing to our API for permission checks,
    # but store somewhere and allow for redirects
    true
  end

  def requires_server_sanitized_upload?
    return false unless file_type == 'images'
    return true if SvgSanitizer.svg_content_type?(self.settings['content_type'])
    return true if self.settings['data_uri'].to_s.match?(/\Adata:image\/svg\+xml/i)

    stored = self.data if respond_to?(:data)
    stored.to_s.match?(/\Adata:image\/svg\+xml/i)
  end
  
  def check_for_removable
    if self.url && Uploader.removable_remote_url?(self.url)
      self.removable = true
    end
    true
  end
  
  def schedule_remote_removal_if_unique
    if self.url && self.removable
      if self.class.where(:url => self.url).count == 0
        Worker.schedule(Uploader, :remote_remove, self.url)
        true
      end
    end
    false
  end

  def check_for_cached_copy
    if self.url && Uploader.protected_remote_url?(self.url) && self.settings && !self.settings['cached_copy_url']
      # Try a little bit to find an existing cache url before resorting to a bg job
      found = ButtonImage.where(url: self.url).limit(3)
      found.each do |bi|
        self.settings['cached_copy_url'] ||= bi.settings['cached_copy_url'] if bi.settings['cached_copy_url']
        label = self.settings['button_label'] || self.settings['search_term']
        if label && bi.settings['fallback'] && (bi.settings['button_label'] == label || bi.settings['search_term'] == label)
          self.settings['fallback'] ||= bi.settings['fallback']
        end
      end
    end
  end
    
  def upload_after_save
    if @upload_to_remote_arg
      self.schedule(:upload_to_remote, @upload_to_remote_arg)
      @upload_to_remote_arg = nil
    end
    if self.url && Uploader.protected_remote_url?(self.url) && self.settings && !self.settings['cached_copy_url']
      if !self.settings['cached_copy_url']
        self.schedule(:assert_cached_copy)
      end
    end
    if self.url && self.settings && self.settings['content_type'] && self.settings['content_type'].match(/image\/svg/) && !self.settings['rasterized']
      if self.settings['raster_attempted_at'] && self.settings['raster_attempted_at'] > 24.hours.ago.iso8601
        # prevent scheduling loop
      else
        self.schedule(:assert_raster)
      end
    end
    true
  end

  def assert_raster
    if self.settings && self.settings['rasterized'] == 'pending' && (!self.settings['rasterized_at'] || self.settings['rasterized_at'] < 1.week.ago.iso8601)
      self.settings['rasterized'] = nil
    end
    if self.url && self.settings && self.settings['content_type'] && self.settings['content_type'].match(/image\/svg/) && !self.settings['rasterized']
      self.settings['rasterized'] = 'pending'
      self.settings['rasterized_at'] = Time.now.iso8601
      res = SafeHttp.head(URI.escape("#{self.url}.raster.png"))
      # check if there's already a .raster.png for the image (i.e. on opensymbols)
      if res.success?
        self.settings['rasterized'] = 'from_url'
        self.save
      else
        self.settings['raster_attempted_at'] = Time.now.iso8601
        self.save
        self.schedule(:upload_to_remote, self.url, true)
      end
    end
  end

  def raster_url(skinned_url=nil)
    if self.settings && self.settings['rasterized'] == 'from_url' && self.url
      "#{skinned_url || self.url}.raster.png"
    elsif self.settings && self.settings['rasterized'] == 'from_filename' && self.full_filename
      if skinned_url
        "#{skinned_url}.raster.png"
      else
        "#{ENV['UPLOADS_S3_CDN'] || "https://#{ENV['UPLOADS_S3_BUCKET']}.s3.amazonaws.com"}/#{self.full_filename}.raster.png"
      end
    else
      nil
    end
  end

  def possible_raster(skinned_url=nil)
    url = skinned_url || self.url
    res = nil
    if url && url.match(/libraries\/mulberry/) && url.match(/\.svg$/)
      res = "#{url}.raster.png"
    elsif url && url.match(/libraries\/noun-project/) && url.match(/\.svg$/)
      res = "#{url}.raster.png"
    end
    res = res.sub(/varianted-skin\.svg\./, '') if res
    res
  end
  
  def assert_cached_copy
    self.class.assert_cached_copy(self.url)
  end
  
  def remote_upload_params(rasterize=false)
    fn = rasterize ? "#{self.full_filename}.raster.png" : self.full_filename
    res = Uploader.remote_upload_params(fn, rasterize ? 'image/png' : self.content_type)
    res[:success_url] = "#{JsonApi::Json.current_host}/api/v1/#{self.file_type}/#{self.global_id}/upload_success?confirmation=#{self.confirmation_key}"
    res  
  end
  
  def upload_to_remote(source, rasterize=false)
    raise "must have id first" unless self.id
    self.settings['pending_url'] = nil
    url = resolve_upload_source(source)
    unless url
      record_upload_rejection(source, 'missing_upload_source')
      return
    end
    file = Tempfile.new(["stash", rasterize ? ".svg" : ""])
    file.binmode
    if url.match(/^data:/)
      self.settings['content_type'] = SvgSanitizer.data_uri_content_type(url) || self.settings['content_type']
      payload = decode_data_uri_body(url)
      if payload.nil?
        record_upload_rejection(url, 'invalid_data_uri')
        return
      end
      if payload.bytesize > SvgSanitizer::MAX_BYTES
        record_upload_rejection(url, 'too_large')
        return
      end
      file.write(payload)
    else
      self.settings['source_url'] = url if !rasterize
      fetch_url = Uploader.sanitize_url(url) || url.to_s
      res = SafeHttp.get(fetch_url)
      response_content_type = res.headers && res.headers['Content-Type']
      if res.success? && acceptable_remote_content_type?(response_content_type, url)
        body = res.body.to_s
        if body.bytesize > SvgSanitizer::MAX_BYTES
          record_upload_rejection(url, 'too_large')
          return
        end
        if file_type == 'images' && SvgSanitizer.looks_like_svg?(body)
          self.settings['content_type'] = 'image/svg+xml'
        else
          self.settings['content_type'] = stored_content_type_for_download(response_content_type, url)
        end
        file.write(body)

        if file_type == 'images' && !self.settings['width'] && !SvgSanitizer.svg_content_type?(self.settings['content_type'])
          identify_data = `identify -verbose #{file.path}`
          identify_data.split(/\n/).each do |line|
            pre, post = line.sub(/^\s+/, '').split(/:\s/, 2)
            if pre == 'Geometry'
              match = (post || "").match(/(\d+)x(\d+)/)
              if match && match[1] && match[2]
                self.settings['width'] = match[1].to_i
                self.settings['height'] = match[2].to_i
              end
            end
          end
        end
      else
        record_upload_rejection(url, 'fetch_failed')
        return
      end
    end
    unless sanitize_stored_image_file!(file, url)
      return
    end
    file.rewind
    if rasterize
      convert_image(file.path)
      file.close
      if !File.exist?("#{file.path}.raster.png")
        if self.settings['rasterized'] == 'pending' && rasterize
          self.settings['rasterized'] = nil 
          self.save
        end
        return
      end
      file = File.open("#{file.path}.raster.png", 'rb')
    end
    params = self.remote_upload_params(rasterize)
    post_params = params[:upload_params]
    post_params[:file] = file

    # upload to s3 from tempfile
    res = Typhoeus.post(params[:post_url], body: post_params)
    if rasterize
      if res.success?
        self.settings['rasterized'] = 'from_filename'
        self.save
      else
        self.settings['rasterized'] = false if self.settings['rasterized'] == 'pending'
        self.save
      end
    else
      if res.success?
        self.url = params[:upload_url] + self.full_filename
        self.settings['pending'] = false
        self.settings['data_uri'] = nil
        self.settings['pending_url'] = nil
        self.data = nil if self.respond_to?(:data=)
        self.save
      else
        # S3 upload failed - fall back to storing data URI directly when small enough
        # This allows images to work without S3 configuration, but we limit size to prevent DB bloat
        if url.match(/^data:/)
          if url.bytesize <= DATA_URI_STORE_MAX_BYTES
            self.data = url
            self.settings['pending'] = false
            self.settings['pending_url'] = nil
            Rails.logger.warn("S3 upload failed, storing data URI directly for #{self.class.name} #{self.id}")
          else
            self.settings['errored_pending_url'] = url
            Rails.logger.warn("S3 upload failed, data URI too large (#{url.bytesize} bytes > #{DATA_URI_STORE_MAX_BYTES}) for #{self.class.name} #{self.id}")
          end
        elsif store_downloaded_file_fallback!(file, url)
          Rails.logger.warn("S3 upload failed, stored downloaded #{file_type} locally for #{self.class.name} #{self.id}")
        else
          self.settings['errored_pending_url'] = url
        end
        self.save
      end
    end
  end

  def convert_image(path)
    # TODO: PCS images aren't getting sized correctly with 
    # server-side convert, other SVGs probably have problems too
    # TODO: remove font-family from svg's as a tag attribute, it causes problems with rendering
    `convert -background none -density 300 -resize 400x400 -gravity center -extent 400x400 #{path} #{path}.raster.png`
  end

  def decode_data_uri_body(data_uri)
    SvgSanitizer.decode_image_data_uri_payload(data_uri)
  end

  # When S3 is unavailable, keep imported media usable:
  # - images: data_uri (≤512KB) or trusted symbol CDN URL
  # - sounds: keep the already-fetched source URL playable (no DB data_uri —
  #   audio blobs are often large; signed source URLs may expire later)
  def store_downloaded_file_fallback!(file, source_url)
    if file_type == 'sounds'
      kept = encode_source_url_for_fetch(source_url)
      return false if kept.blank? || !kept.match?(%r{\Ahttps?://}i)

      self.url = kept
      self.settings['pending'] = false
      self.settings['pending_url'] = nil
      self.settings['errored_pending_url'] = nil
      return true
    end

    return false unless file_type == 'images'

    file.rewind
    byte_size = file.respond_to?(:size) ? file.size : File.size(file.path)
    if byte_size > DATA_URI_STORE_MAX_BYTES
      if importable_symbol_cdn_url?(source_url)
        self.url = encode_source_url_for_fetch(source_url)
        self.settings['pending'] = false
        self.settings['pending_url'] = nil
        self.settings['errored_pending_url'] = nil
        return true
      end
      return false
    end

    body = file.read
    return false if body.blank?

    ct = self.settings['content_type'].presence || 'application/octet-stream'
    data_uri = "data:#{ct};base64,#{Base64.strict_encode64(body)}"
    self.data = data_uri if respond_to?(:data=)
    self.settings['data_uri'] = data_uri
    self.settings['pending'] = false
    self.settings['pending_url'] = nil
    self.settings['errored_pending_url'] = nil
    true
  end

  # S3/CloudFront often serves mp3/wav as application/octet-stream. Accept those
  # for sounds when the URL extension or declared content_type is clearly audio.
  def acceptable_remote_content_type?(content_type, source_url)
    ct = content_type.to_s
    case file_type
    when 'images'
      ct.match?(/\Aimage\b/i)
    when 'videos'
      ct.match?(/\Avideo\b/i)
    when 'sounds'
      return true if ct.match?(/\Aaudio\b/i)
      return false unless ct.match?(%r{\A(application|binary)/octet-stream\b}i)

      declared = (settings && settings['content_type']).to_s
      return true if declared.match?(/\Aaudio\b/i)
      source_url.to_s.match?(/\.(mp3|wav|ogg|m4a|aac|webm)(?:\?|#|$)/i)
    else
      ct.present?
    end
  end

  def stored_content_type_for_download(response_content_type, source_url)
    ct = response_content_type.to_s
    return ct if file_type != 'sounds'
    return ct if ct.match?(/\Aaudio\b/i)

    declared = (settings && settings['content_type']).to_s
    return declared if declared.match?(/\Aaudio\b/i)

    inferred_audio_content_type(source_url) || 'audio/mpeg'
  end

  def inferred_audio_content_type(source_url)
    case source_url.to_s
    when /\.wav(?:\?|#|$)/i then 'audio/wav'
    when /\.ogg(?:\?|#|$)/i then 'audio/ogg'
    when /\.m4a(?:\?|#|$)/i then 'audio/mp4'
    when /\.aac(?:\?|#|$)/i then 'audio/aac'
    when /\.webm(?:\?|#|$)/i then 'audio/webm'
    when /\.mp3(?:\?|#|$)/i then 'audio/mpeg'
    else nil
    end
  end

  def importable_symbol_cdn_url?(url)
    str = url.to_s
    return true if str.match?(%r{\Ahttps://d18vdu4p71yql0\.cloudfront\.net/})
    return true if str.match?(%r{\Ahttps://dc5pvf6xvgi7y\.cloudfront\.net/})

    cdn = ENV['OPENSYMBOLS_S3_CDN'].to_s
    cdn.present? && str.start_with?(cdn)
  end

  def encode_source_url_for_fetch(url)
    uri = Uploader.parse_http_uri(url.to_s)
    return url.to_s unless uri

    port_suffix = ''
    if (uri.scheme == 'http' && uri.port != 80) || (uri.scheme == 'https' && uri.port != 443)
      port_suffix = ":#{uri.port}"
    end
    "#{uri.scheme}://#{uri.host}#{port_suffix}#{uri.path}#{uri.query ? "?#{uri.query}" : ''}"
  end

  def resolve_upload_source(source)
    if source == UPLOAD_FROM_STORED_DATA_URI
      stored = self.settings['data_uri'].presence
      stored ||= (respond_to?(:data) ? self.data : nil)
      return stored if stored.to_s.match?(/\Adata:/)

      nil
    else
      source.to_s.presence
    end
  end

  def sanitize_stored_image_file!(file, source_url)
    return true unless file_type == 'images'

    file.rewind
    body = file.read
    file.rewind
    svg = SvgSanitizer.svg_content_type?(self.settings['content_type']) || SvgSanitizer.looks_like_svg?(body)
    return true unless svg

    self.settings['content_type'] = 'image/svg+xml' if SvgSanitizer.looks_like_svg?(body)

    result = SvgSanitizer.sanitize(body)
    unless result[:ok]
      record_upload_rejection(source_url, result[:error])
      return false
    end

    if result[:changed]
      Rails.logger.info("SvgSanitizer stripped active content from #{self.class.name} #{self.global_id}")
    end

    file.rewind
    file.truncate(0)
    file.write(result[:bytes])
    file.rewind
    true
  end

  def verify_stored_s3_upload!(s3_url)
    return true unless file_type == 'images'

    unless SvgSanitizer.svg_content_type?(self.settings['content_type'])
      sample = fetch_uploaded_object_range(s3_url)
      if sample && !sample.empty?
        return true unless SvgSanitizer.looks_like_svg?(sample)
      end
    end

    body = fetch_uploaded_object_body(s3_url)
    return true if body.nil? || body.empty?
    return true unless SvgSanitizer.looks_like_svg?(body)

    result = SvgSanitizer.sanitize(body)
    unless result[:ok]
      Rails.logger.warn("Rejected stored SVG upload for #{self.class.name} #{self.global_id}: #{result[:error]}")
      record_upload_rejection(s3_url, "svg_verification_failed:#{result[:error]}")
      return false
    end

    self.settings['content_type'] = 'image/svg+xml'
    return true unless result[:changed]

    replace_stored_upload_body!(result[:bytes], 'image/svg+xml')
  end

  def fetch_uploaded_object_range(s3_url)
    last_byte = SvgSanitizer::SNIFF_BYTES - 1
    res = Typhoeus.get(s3_url, headers: { 'Range' => "bytes=0-#{last_byte}" })
    return nil unless res.code == 206 || res.code == 200

    res.body.to_s.b.byteslice(0, SvgSanitizer::SNIFF_BYTES)
  end

  def fetch_uploaded_object_body(s3_url)
    res = Typhoeus.get(s3_url)
    return nil unless res.success?

    body = res.body.to_s
    return nil if body.bytesize > SvgSanitizer::MAX_BYTES

    body
  end

  def replace_stored_upload_body!(bytes, content_type)
    file = Tempfile.new(['stash', '.svg'])
    file.binmode
    file.write(bytes)
    file.rewind
    params = remote_upload_params(false)
    post_params = params[:upload_params]
    post_params['Content-Type'] = content_type
    post_params[:file] = file
    res = Typhoeus.post(params[:post_url], body: post_params)
    file.close
    unless res.success?
      Rails.logger.warn("Failed to replace sanitized SVG for #{self.class.name} #{self.global_id}")
      return false
    end
    true
  ensure
    file.unlink if file
  end

  def record_upload_rejection(source_url, reason=nil)
    safe_source = source_url.to_s.gsub(/[\r\n]/, '')[0, 500]
    safe_reason = reason.to_s.gsub(/[\r\n]/, '')[0, 200]
    self.settings['errored_pending_url'] = safe_source unless safe_source == UPLOAD_FROM_STORED_DATA_URI
    self.settings['errored_pending_url'] ||= self.settings['data_uri']
    Rails.logger.warn("Upload rejected for #{self.class.name} #{self.global_id}: #{safe_reason}")
    save(validate: false)
  rescue StandardError => e
    Rails.logger.error("Upload rejection save failed for #{self.class.name} #{self.global_id}: #{e.class}: #{e.message}")
  end

  # Backward-compatible alias for callers/tests.
  alias_method :reject_svg_upload, :record_upload_rejection

  module ClassMethods
    def assert_cached_copies(urls)
      res = {}
      ref_urls = urls.map{|u| (self.cached_copy_identifiers(u) || {})[:url] }
      bis = ButtonImage.where(:url => ref_urls.compact.uniq).to_a
      urls.each_with_index do |url, idx|
        bi = bis.detect{|bi| bi.url == ref_urls[idx] }
        if bi && bi.settings['cached_copy_url']
          res[url] = true
        else
          res[url] = assert_cached_copy(url)
        end
      end
      res
    end
    
    def assert_cached_copy(url)
      if url && Uploader.protected_remote_url?(url)
        ref = self.cached_copy_identifiers(url)
        return false unless ref
        bi = ButtonImage.find_by(url: ref[:url])
        if bi && (bi.settings['copy_attempts'] || []).select{|a| a > 24.hours.ago.to_i }.length > 2
          return false
        end
        if !bi || !bi.settings['cached_copy_url']
          user = User.find_by_path(ref[:user_id])
          remote_url = Uploader.found_image_url(ref[:image_id], ref[:library], user)
          if remote_url
            bi ||= ButtonImage.create(url: ref[:url], public: false, settings: {'skip_tracking' => true})
            bi.upload_to_remote(remote_url)
            if bi.settings['errored_pending_url']
              bi.settings['copy_attempts'] ||= []
              bi.settings['copy_attempts'] << Time.now.to_i
              bi.save
              self.schedule(:assert_cached_copies, [url])
              return false
            else
              bi.settings['cached_copy_url'] = bi.url
              bi.settings['copy_attempts'] = []
              bi.url = ref[:url]
              bi.save
              return true
            end
          else
            return false
          end
        else
          return true
        end
      else
        false
      end
    end

    def cached_copy_urls(records, user, allow_fallbacks=true, protected_sources=nil)
      # returns a mapping of canonical URLs to cached or
      # fallback URLs (we locally cache results from third-party
      # image libraries like lessonpix) . Also stores on any 
      # records that have
      # a cached result, a reference to the cached and fallback URLs
      sources = {}
      if protected_sources
        protected_sources.each{|s| sources[s.to_sym] = true}
      else
        sources[:lessonpix] = true if user && Uploader.lessonpix_credentials(user)
      end
      lookups = {}
      caches = {}
      fallbacks = {}
      records.each do |record|
        # Retrieve the attributes for the source image
        url = record.is_a?(String) ? record : record.url
        url = URI::DEFAULT_PARSER.unescape(url) if url && url.match(/%20/)
        ref = self.cached_copy_identifiers(url)
        next unless ref
        if !record.is_a?(String) && record.settings['cached_copy_url']
          # If the record has a cached url already, use that
          # along with whatever fallback is available
          if ref[:library] == 'lessonpix'
            fallbacks[url] = Uploader.fallback_image_url(ref[:image_id], ref[:library])
            if sources[:lessonpix]
              caches[url] = record.settings['cached_copy_url']
            end
          end
        else
          # Otherwise, set the fallback and note
          # that the cached url needs to be looked up on another record
          if url && Uploader.protected_remote_url?(url)
            if ref[:library] == 'lessonpix'
              fallbacks[url] = Uploader.fallback_image_url(ref[:image_id], ref[:library])
              if sources[:lessonpix]
                lookups[ref[:url]] = url
              end
            end
          end
        end
      end
      if lookups.keys.length > 0 || fallbacks.keys.length > 0
        if lookups.keys.length > 0
          # For any where a cache url couldn't be found, look
          # on other records with the same url
          ButtonImage.where(:url => lookups.keys).each do |bi|
            if bi.settings['cached_copy_url']
              caches[lookups[bi.url]] = bi.settings['cached_copy_url'] 
            elsif bi && (bi.settings['copy_attempts'] || []).select{|a| a > 48.hours.ago.to_i }.length == 0
              bi.schedule(:assert_cached_copy)
            end
          end
        end
        # For all records without a cached url, try 
        # setting/updating it now if it was just found
        records.each do |record|
          url = record.is_a?(String) ? record : record.url
          if !record.is_a?(String)
            record.settings['fallback_copy_url'] ||= fallbacks[url] || caches[url]
            if caches[url] && record.settings['cached_copy_url'] != caches[url]
              record.settings['cached_copy_url'] = caches[url]
              record.save
            end
          end
        end
      end
      fallbacks = {} if !allow_fallbacks
      fallbacks.merge(caches)
    end
    
    def cached_copy_url(url, user, allow_fallbacks=true)
      cached_copy_urls([url], user, allow_fallbacks)[url]
    end

    def cached_copy_identifiers(url)
      return nil unless url
      parts = url.match(/api\/v\d+\/users\/([^\/]+)\/protected_image\/(\w+)\/(\w+)/)
      if parts && parts[1] && parts[2] && parts[3]
        res = {
          user_id: parts[1],
          library: parts[2],
          image_id: parts[3],
          original_url: url,
          url: "lingolinq://protected_image/#{parts[2]}/#{parts[3]}"
        }
        return res
      end
      nil
    end
  end
  
  included do
    before_save :check_for_pending
    before_save :check_for_removable
    before_save :check_for_cached_copy
    after_save :upload_after_save
    after_destroy :schedule_remote_removal_if_unique
  end
end
