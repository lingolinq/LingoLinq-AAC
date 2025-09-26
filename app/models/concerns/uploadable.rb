require 'marcel'

module Uploadable
  extend ActiveSupport::Concern
  
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
    res = URI.decode(res) if res && res.match(/%20/)
    res
  end

  def full_filename
    return self.settings['full_filename'] if self.settings['full_filename']
    extension = ""
    extension = Marcel::MimeType.for(name: self.content_type)&.extension
    extension = "." + extension if extension && !extension.start_with?(".")
    self.settings['full_filename'] = self.file_path + self.file_prefix + (extension || "")
    self.save
    self.settings['full_filename']
  end
  
  def url_for(user)
    token = user && user.user_token
    return self.url if !token
    return self.url unless self.url.match(/\/api\/v1\/users\/.+\/protected_image/)
    self.url + (self.url.match(/\?/) ? '&' : '?') + "user_token=#{token}"
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
    
    # If there's no client to handle remote upload, go ahead and unmark it as
    # pending and schedule a bg job to download server-side
    if !@remote_upload_possible && self.settings['pending'] && self.settings['pending_url']
      self.settings['pending'] = false
      self.url = self.settings['pending_url']
      @schedule_upload_to_remote = true
    end
    # TODO: check if it's a protected image (i.e. lessonpix) and download a cached
    # copy according. Keep the link pointing to our API for permission checks,
    # but store somewhere and allow for redirects
    true
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
    if @schedule_upload_to_remote
      self.schedule(:upload_to_remote, self.settings['pending_url'])
      @schedule_upload_to_remote = false
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
      res = Typhoeus.head(Uploader.sanitize_url(URI.escape("#{self.url}.raster.png")), followlocation: true)
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
  
  def upload_to_remote(url, rasterize=false)
    raise "must have id first" unless self.id
    self.settings['pending_url'] = nil
    url = self.settings['data_uri'] if url == 'data_uri'
    file = Tempfile.new(["stash", rasterize ? ".svg" : ""])
    file.binmode
    if url.match(/^data:/)
      self.settings['content_type'] = url.split(/;/)[0].split(/:/)[1]
      data = url.split(/,/)[1]
      file.write(Base64.strict_decode64(data))
    else
      self.settings['source_url'] = url if !rasterize
      res = Typhoeus.get(Uploader.sanitize_url(URI.escape(url)), followlocation: true)
      if res.headers['Location']
        redirect_url = res.headers['Location']
        redirect_url = redirect_url.sub(/\?/, "%3F") if redirect_url.match(/lessonpix\.com/) && redirect_url.match(/\?.*\.png/)
        res = Typhoeus.get(Uploader.sanitize_url(URI.escape(redirect_url)))
      end
      re = /^audio/
      re = /^image/ if file_type == 'images'
      re = /^video/ if file_type == 'videos'
      if res.success? && res.headers['Content-Type'].match(re)
        self.settings['content_type'] = res.headers['Content-Type']
        file.write(res.body)

        if file_type == 'images' && !self.settings['width']
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
        self.settings['errored_pending_url'] = url
        self.save
        return
      end
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
    res = Typhoeus.post(params[:upload_url], body: post_params)
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
        self.save
      else
        self.settings['errored_pending_url'] = url
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
        url = URI.decode(url) if url && url.match(/%20/)
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
          url: "coughdrop://protected_image/#{parts[2]}/#{parts[3]}"
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
