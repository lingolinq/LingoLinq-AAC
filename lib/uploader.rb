require 's3'
require 'accessible-books'

module Uploader
  S3_EXPIRATION_TIME=60*60
  CONTENT_LENGTH_RANGE=200.megabytes.to_i
  
  def self.remote_upload(remote_path, local_path, content_type, checksum=nil)
    # NOTE: if you specify checksum, you may get back a different
    # remote path than you sent, but if checksum=nil then remote_path won't change
    if checksum
      # If something is there and it's identical, just touch and return it
      res = check_existing_upload(remote_path, checksum)
      if res[:url]
        remote_touch(remote_path)
        RemoteAction.where(action: 'delete', path: remote_path).delete_all
        return {url: res[:url], path: remote_path}
      elsif res[:mismatch]
        # If something is already there and it's not identical, change to a different url
        remote_path = remote_path.sub(/\/chksm[^\/]+/, '').sub(/.*\K\//, "/chksm#{checksum[0, 5]}/")
      end
    end
    params = remote_upload_params(remote_path, content_type)
    post_params = params[:upload_params]
    return nil unless File.exist?(local_path)
    RemoteAction.where(action: 'delete', path: remote_path).delete_all
    post_params[:file] = File.open(local_path, 'rb')

    # upload to s3 from tempfile
    res = Typhoeus.post(params[:upload_url], body: post_params)
    if res.success?
      return {url: params[:upload_url] + remote_path, path: remote_path, uploaded: true}
    else
      if res.body && res.body.match(/SlowDown/)
        raise "throttled uploading to #{remote_path}"
      else
        raise res.body
      end
      return nil
    end
  end

  def self.sanitize_url(url)
    uri = URI.parse(url) rescue nil
    return nil unless uri
    return nil if !Rails.env.development? && (uri.host.match(/^127/) || uri.host.match(/localhost/) || uri.host.match(/^0/) || uri.host.to_s == uri.host.to_i.to_s)
    port_suffix = ""
    port_suffix = ":#{uri.port}" if (uri.scheme == 'http' && uri.port != 80)
    "#{uri.scheme}://#{uri.host}#{port_suffix}#{uri.path}#{uri.query && "?#{uri.query}"}"
  end

  def self.invalidate_cdn(remote_path)
    remote_path = "/" + remote_path unless remote_path.match(/^\//)
    cred = Aws::Credentials.new(ENV['AWS_KEY'], ENV['AWS_SECRET'])
    client = Aws::CloudFront::Client.new(
      region: ENV['UPLOADS_S3_CDN_REGION'],
      credentials: cred
    )
    res = true
    begin
      client.create_invalidation({
        distribution_id: ENV['UPLOADS_S3_CDN_ID'],
        invalidation_batch: {
          paths: {
            quantity: 1,
            items: [remote_path]
          },
          caller_reference: "manual:#{Time.now.to_i}"
        }
      })
    rescue Aws::CloudFront::Errors::InvalidArgument => e       
      res = false
    end
    res
  end
  
  def self.check_existing_upload(remote_path, checksum=nil)
    return {found: false} unless remote_path
    config = remote_upload_config
    service = S3::Service.new(:access_key_id => config[:access_key], :secret_access_key => config[:secret], timeout: 3)    
    if remote_path.match(/^\//)
      remote_path = remote_path[1..-1]
    end
    bucket = service.buckets.find(config[:bucket_name])
    object = bucket.objects.find(remote_path) rescue nil
    if object
      req = object.send(:object_request, :head, {})
      return {found: true, mismatch: true} if checksum && req['etag'] && checksum != req['etag'].gsub(/\"/, '')
      exp = ((req['x-amz-expiration'] || "").match(/expiry-date="([^"]+)"/) || [])[1]
      exp = Time.parse(exp) rescue nil
      if exp && exp < 48.hours.from_now
        return {found: true, expired: true}
      else
        return {found: true, url: "#{ENV['UPLOADS_S3_CDN']}/#{remote_path}"}
      end
    end
    return {found: false}
  end

  def self.remote_touch(path)
    config = remote_upload_config
    service = S3::Service.new(:access_key_id => config[:access_key], :secret_access_key => config[:secret], timeout: 3)    
    bucket = service.buckets.find(config[:bucket_name])
    if path && path.match(/^\//)
      path = path[1..-1]
    end
    object = bucket.objects.find(path) rescue nil
    return false unless object
    res = object.copy(:key => path, :bucket => bucket, :acl => 'public-read') rescue nil
    !!res
  end

  def self.remote_remove_later(path, checksum)
    RemoteAction.where(path: path, action: 'delete', extra: checksum).delete_all if checksum
    RemoteAction.create(path: path, extra: checksum, act_at: 24.hours.from_now, action: 'delete')
  end

  def self.remote_remove_batch
    total = 0
    RemoteAction.where(['act_at < ?', Time.now]).find_in_batches(batch_size: 100) do |batch|
      updated_ids = []
      puts "#{batch[0].id}..."
      batch.each do |ra|
        updated_ids << ra.id
        ra.process_action
      end
      RemoteAction.where(id: updated_ids).delete_all
      total += updated_ids.length
    end
    RemoteAction.where(['created_at < ?', 3.months.ago]).delete_all
    total
  end

  def self.remote_remove(url, checksum=nil)
    remote_path = url.sub(/^https:\/\/#{ENV['UPLOADS_S3_BUCKET']}\.s3\.amazonaws\.com\//, '')
    remote_path = remote_path.sub(/^https:\/\/s3\.amazonaws\.com\/#{ENV['UPLOADS_S3_BUCKET']}\//, '')
    remote_path = remote_path.sub(/^#{ENV['UPLOADS_S3_CDN']}/, '')
    remote_path = remote_path.sub(/^\//, '')
    raise "scary delete, not a path I'm comfortable deleting: #{remote_path}" unless remote_path.match(/\w+\/.+\/\w+-\w+(\.\w+)?$/) || remote_path.match(/^extras/)

    do_remove = true
    if checksum
      check = check_existing_upload(remote_path, checksum)
      if check && (!check[:found] || check[:mismatch])
        do_remove = false
      end
    end
    if do_remove
      config = remote_upload_config
      service = S3::Service.new(:access_key_id => config[:access_key], :secret_access_key => config[:secret], timeout: 3)
      bucket = service.buckets.find(config[:bucket_name])
      object = bucket.objects.find(remote_path) rescue nil
      object.destroy if object
    else
      return false
    end
  end
  
  def self.fronted_url(url)
    return nil unless url
    maps = [[ENV['UPLOADS_S3_BUCKET'], ENV['UPLOADS_S3_CDN']], [ENV['OPENSYMBOLS_S3_BUCKET'], ENV['OPENSYMBOLS_S3_CDN']]]
    maps.each do |bucket, cdn|
      if bucket && url.match(/^https:\/\/#{bucket}\.s3\.amazonaws\.com\//) && cdn
        url = url.sub(/^https:\/\/#{bucket}\.s3\.amazonaws\.com\//, cdn + "/")
      elsif bucket && url.match(/^https:\/\/s3\.amazonaws\.com\/#{bucket}\//) && cdn
        url= url.sub(/^https:\/\/s3\.amazonaws\.com\/#{bucket}\//, cdn + "/")
      end
    end
    url
  end
  
  def self.signed_download_url(url)
    remote_path = url.sub(/^https:\/\/#{ENV['STATIC_S3_BUCKET']}\.s3\.amazonaws\.com\//, '')
    remote_path = remote_path.sub(/^https:\/\/s3\.amazonaws\.com\/#{ENV['STATIC_S3_BUCKET']}\//, '')

    config = remote_upload_config
    service = S3::Service.new(:access_key_id => config[:access_key], :secret_access_key => config[:secret], timeout: 3)
    bucket = service.buckets.find(config[:static_bucket_name])
    object = bucket.objects.find(remote_path) rescue nil
    if object
      object.temporary_url.sub(/^http:/, 'https:')
    else
      nil
    end
  end
  
  def self.remote_upload_params(remote_path, content_type)
    config = remote_upload_config
    
    res = {
      :upload_url => config[:upload_url],
      :upload_params => {
        'AWSAccessKeyId' => config[:access_key]
      }
    }
    
    policy = {
      'expiration' => (S3_EXPIRATION_TIME).seconds.from_now.utc.iso8601,
      'conditions' => [
        {'key' => remote_path},
        {'acl' => 'public-read'},
        ['content-length-range', 1, (CONTENT_LENGTH_RANGE)],
        {'bucket' => config[:bucket_name]},
        {'success_action_status' => '200'},
        {'content-type' => content_type}
      ]
    }
    # TODO: for pdfs, policy['conditions'] << {'content-disposition' => 'inline'}

    policy_encoded = Base64.encode64(policy.to_json).gsub(/\n/, '')
    signature = Base64.encode64(
      OpenSSL::HMAC.digest(
        OpenSSL::Digest.new('sha1'), config[:secret], policy_encoded
      )
    ).gsub(/\n/, '')

    res[:upload_params].merge!({
       'key' => remote_path,
       'acl' => 'public-read',
       'policy' => policy_encoded,
       'signature' => signature,
       'Content-Type' => content_type,
       'success_action_status' => '200'
    })
    res
  end
  
  def self.remote_upload_config
    @remote_upload_config ||= {
      :upload_url => "https://#{ENV['UPLOADS_S3_BUCKET']}.s3.amazonaws.com/",
      :access_key => ENV['AWS_KEY'],
      :secret => ENV['AWS_SECRET'],
      :bucket_name => ENV['UPLOADS_S3_BUCKET'],
      :static_bucket_name => ENV['STATIC_S3_BUCKET']
    }
  end
  
  def self.remote_zip(url, &block)
    result = []
    Progress.update_current_progress(0.1, :downloading_file)
    response = Typhoeus.get(Uploader.sanitize_url(url))
    Progress.update_current_progress(0.2, :processing_file)
    file = Tempfile.new('stash')
    file.binmode
    file.write response.body
    file.close
    OBF::Utils.load_zip(file.path) do |zipper|
      Progress.as_percent(0.2, 1.0) do
        block.call(zipper)
      end
    end
    file.unlink
  end
  
  def self.generate_zip(urls, filename)
    Progress.update_current_progress(0.2, :checking_files)
    path = OBF::Utils.temp_path("stash")

    content_type = 'application/zip'
    
    hash = Digest::MD5.hexdigest(urls.to_json)
    key = GoSecure.sha512(hash, 'url_list')
    remote_path = "downloads/#{key}/#{filename}"
    url = Uploader.check_existing_upload(remote_path)[:url]
    return url if url
    Progress.update_current_progress(0.3, :zipping_files)
    
    Progress.as_percent(0.3, 0.8) do
      OBF::Utils.build_zip(path) do |zipper|
        urls.each_with_index do |ref, idx|
          if ref['url']
            # download the file
            fetch = OBF::Utils.get_url(ref['url'])
            url_filename = ref['name']
            # add it to the zip
            zipper.add(url_filename, fetch['data'])
          elsif ref['data']
            zipper.add(ref['name'], ref['data'])
          end
          Progress.update_current_progress(idx.to_f / urls.length.to_f)
        end
      end
    end
    Progress.update_current_progress(0.9, :uploading_file)
    url = (Uploader.remote_upload(remote_path, path, content_type) || {})[:url]
    raise "File not uploaded" unless url
    File.unlink(path) if File.exist?(path)
    return url
  end
  
  def self.valid_remote_url?(url)
    res = self.removable_remote_url?(url)
    # don't re-download files that have already been downloaded
    res ||= url.match(/^https:\/\/#{ENV['OPENSYMBOLS_S3_BUCKET']}\.s3\.amazonaws\.com\//) if ENV['OPENSYMBOLS_S3_BUCKET']
    res ||= url.match(/^https:\/\/s3\.amazonaws\.com\/#{ENV['OPENSYMBOLS_S3_BUCKET']}\//) if ENV['OPENSYMBOLS_S3_BUCKET']
    res ||= url.match(/^#{ENV['OPENSYMBOLS_S3_CDN']}\//) if ENV['OPENSYMBOLS_S3_CDN']
    res ||= protected_remote_url?(url)
    !!res
  end
  
  def self.protected_remote_url?(url)
    !!(url && url.match(/\/api\/v\d+\/users\/.+\/protected_image/))
  end
  
  def self.removable_remote_url?(url)
    res = url.match(/^https:\/\/#{ENV['UPLOADS_S3_BUCKET']}\.s3\.amazonaws\.com\//)
    res ||= url.match(/^https:\/\/s3\.amazonaws\.com\/#{ENV['UPLOADS_S3_BUCKET']}\//)
    !!res
  end
  
  def self.lessonpix_credentials(opts)
    return nil unless ENV['LESSONPIX_PID'] && ENV['LESSONPIX_SECRET']
    username = nil
    password_md5 = nil
    if opts.is_a?(User) && opts.subscription_hash['extras_enabled'] && ENV['LESSONPIX_USER'] && ENV['LESSONPIX_MD5']
      username = ENV['LESSONPIX_USER']
      password_md5 = ENV['LESSONPIX_MD5']
    elsif opts.is_a?(User)
      template = UserIntegration.find_by(template: true, integration_key: 'lessonpix')
      ui = template && UserIntegration.find_by(user: opts, template_integration: template)
      return nil unless ui && ui.settings && ui.settings['user_settings'] && ui.settings['user_settings']['username']
      username = ui.settings['user_settings']['username']['value']
      password_md5 = GoSecure.decrypt(ui.settings['user_settings']['password']['value_crypt'], ui.settings['user_settings']['password']['salt'], 'integration_password')
    elsif opts.is_a?(UserIntegration)
      username = opts.settings['user_settings']['username']['value']
      password_md5 = GoSecure.decrypt(opts.settings['user_settings']['password']['value_crypt'], opts.settings['user_settings']['password']['salt'], 'integration_password')
    elsif opts.is_a?(Hash)
      username = opts['username']
      password_md5 = Digest::MD5.hexdigest((opts['password'] || '').downcase)
    else
      return nil
    end
    {
      'pid' => ENV['LESSONPIX_PID'],
      'username' => username,
      'token' => Digest::MD5.hexdigest(password_md5 + ENV['LESSONPIX_SECRET'])
    }
  end
  
  def self.found_image_url(image_id, library, user)
    if library == 'lessonpix'
      cred = lessonpix_credentials(user)
      return nil unless cred
      url = "https://lessonpix.com/apiGetImage.php?pid=#{cred['pid']}&username=#{cred['username']}&token=#{cred['token']}&image_id=#{image_id}&h=300&w=300&fmt=png"
    else
      return nil
    end
  end
  
  def self.fallback_image_url(image_id, library)
    if library == 'lessonpix'
      return "https://lessonpix.com/drawings/#{image_id}/100x100/#{image_id}.png"
    else
      return nil
    end
  end

  def self.default_images(library, words, locale, user, find_missing=true, cache_forever=false)
    cache = library.instance_variable_get('@library_cache')
    cache ||= LibraryCache.find_or_create_by(library: library, locale: locale)
    library.instance_variable_set('@library_cache', cache)
    found_words = {}
    found_words = cache.find_words(words, user) if cache && (!user || !user.subscription_hash['skip_cache'])
    if ['noun-project', 'sclera', 'arasaac', 'mulberry', 'tawasol', 'twemoji', 'opensymbols', 'pcs', 'symbolstix'].include?(library)
      # Use OpenSymbols v2 API if OPENSYMBOLS_SECRET is configured
      if ENV['OPENSYMBOLS_SECRET'].present?
        require 'open_symbols' unless defined?(OpenSymbols)
        
        protected_source = nil
        if library == 'pcs' && user && user.subscription_hash['extras_enabled']
          protected_source = 'pcs'
        elsif library == 'symbolstix' && user && user.subscription_hash['extras_enabled']
          protected_source = 'symbolstix'
        end
        
        list = words - found_words.keys
        results = {}
        
        if library == 'opensymbols'
          # The 'opensymbols' meta-repo doesn't support the defaults endpoint,
          # iterate and search for each word individually
          list.each do |word|
            search_results = OpenSymbols.search(word, locale: locale)
            results[word] = search_results.first if search_results.any?
          end
        else
          # Use the bulk defaults endpoint for specific repositories
          results = OpenSymbols.defaults(library, list, locale)
        end
      else
        # Fallback to v1 API with OPENSYMBOLS_TOKEN
        token = ENV['OPENSYMBOLS_TOKEN']
        protected_source = nil
        if library == 'pcs' && user && user.subscription_hash['extras_enabled']
          token += ":pcs"
          protected_source = 'pcs'
        elsif library == 'symbolstix' && user && user.subscription_hash['extras_enabled']
          token += ":symbolstix"
          protected_source = 'symbolstix'
        end
        url = "https://www.opensymbols.org/api/v2/repositories/#{library}/defaults"
        res = Typhoeus.post(url, body: {
          words: list,
          allow_search: find_missing,
          locale: locale,
          search_token: token
        }.to_json, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json' }, timeout: 10, :ssl_verifypeer => false)
        results = {}
        results = JSON.parse(res.body) unless res.code >= 400
      end
      hash = {}
      found_words.each do |word, h|
        hash[word] = h if !h['missing']
        hash['_missing'] ||= []
        hash['_missing'] << word if h['missing']
      end
      results.each do |word, result|
        if result['extension']
          type = MIME::Types.type_for(result['extension'])[0]
          result['content_type'] = type.content_type
        end
      end
      results.each do |word, obj|
        obj['protected'] = !!protected_source
        obj['public'] = true
        obj['protected_source'] = protected_source
        obj['default'] = true
        image_id = cache.add_word(word, obj, cache_forever)
        next unless words.include?(word)
        hash[word] = {
          'url' => obj['image_url'],
          'image_url' => obj['image_url'],
          'thumbnail_url' => obj['image_url'],
          'content_type' => obj['content_type'],
          'width' => obj['width'],
          'height' => obj['height'],
          'external_id' => obj['id'],
          'lingolinq_image_id' => image_id,
          'public' => true,
          'protected' => !!protected_source,
          'protected_source' => protected_source,
          'license' => {
            'type' => obj['license'],
            'copyright_notice_url' => obj['license_url'],
            'source_url' => obj['source_url'],
            'author_name' => obj['author'],
            'author_url' => obj['author_url'],
            'uneditable' => true
          }
        }        
      end
      cache.save_if_added
      return hash
    elsif found_words
      res = {}
      found_words.each do |word, hash|
        res[word] = hash if !hash['missing']
      end
      return res
    end
    {}
  end
  
  def self.find_images(keyword, library, locale, user, alt_user=nil, batch=false, cache_forever=false)
    return false if (keyword || '').strip.blank? || (library || '').strip.blank?
    list = nil
    if library == 'ss'
      return false
    elsif library == 'lessonpix'
      cred = lessonpix_credentials(user)
      valid = true
      valid = false unless cred
      results = nil
      if cred
        url = "https://lessonpix.com/apiKWSearch.php?pid=#{cred['pid']}&username=#{cred['username']}&token=#{cred['token']}&word=#{CGI.escape(keyword)}&fmt=json&allstyles=n&limit=30"
        req = Typhoeus.get(url, timeout: 5, followlocation: true)
        valid = true
        valid = false if req.body && (req.body.match(/Token Mismatch/) || req.body.match(/Unkonwn User/) || req.body.match(/Unknown User/))
        results = JSON.parse(req.body) rescue nil
        valid = false if !results
      end
      if !valid
        if alt_user && alt_user != user
          return find_images(keyword, library, locale, alt_user, nil, batch, cache_forever)
        else
          return false
        end
      end
      list = []
      results.each do |obj|
        next if !obj || obj['iscategory'] == 't'
        list << {
          'url' => "#{JsonApi::Json.current_host}/api/v1/users/#{user.global_id}/protected_image/lessonpix/#{obj['image_id']}",
          'thumbnail_url' => self.fallback_image_url(obj['image_id'], 'lessonpix'),
          'content_type' => 'image/png',
          'name' => obj['title'],
          'width' => 300,
          'height' => 300,
          'external_id' => obj['image_id'],
          'public' => false,
          'protected' => true,
          'protected_source' => 'lessonpix',
          'license' => {
            'type' => 'private',
            'source_url' => "https://lessonpix.com/pictures/#{obj['image_id']}/#{CGI.escape(obj['title'] || '')}",
            'author_name' => 'LessonPix',
            'author_url' => 'https://lessonpix.com',
            'uneditable' => true,
            'copyright_notice_url' => 'https://lessonpix.com/articles/11/28/LessonPix+Terms+and+Conditions'
          }          
        }
      end
      if list.length > 0
        Worker.schedule_for(batch ? :whenever : :slow, ButtonImage, :perform_action, {
          'method' => 'assert_cached_copies',
          'arguments' => [list.map{|r| r['url'] }]
        })
      end
    elsif ['pixabay_vectors', 'pixabay_photos'].include?(library)
      type = library.match(/vector/) ? 'vector' : 'photo'
      key = ENV['PIXABAY_KEY']
      return false unless key
      url = "https://pixabay.com/api/?key=#{key}&q=#{CGI.escape(keyword)}&image_type=#{type}&per_page=30&safesearch=true"
      req = Typhoeus.get(url, timeout: 5, :ssl_verifypeer => false)
      results = JSON.parse(req.body) rescue nil
      return [] unless results && results['hits']
      list = []
      results['hits'].each do |obj|
        ext = obj['webformatURL'].split(/\./)[-1]
        type = MIME::Types.type_for(ext)[0]
        list << {
          'url' => obj['webformatURL'],
          'thumbnail_url' => obj['previewURL'] || obj['webformatURL'],
          'content_type' => (type && type.content_type) || 'image/jpeg',
          'width' => obj['webformatWidth'],
          'height' => obj['webformatHeight'],
          'external_id' => obj['id'],
          'public' => true,
          'license' => {
            'type' => 'public_domain',
            'copyright_notice_url' => 'https://creativecommons.org/publicdomain/zero/1.0/',
            'source_url' => obj['pageURL'],
            'author_name' => 'unknown',
            'author_url' => 'https://creativecommons.org/publicdomain/zero/1.0/',
            'uneditable' => true
          }          
        }
      end
    elsif ['giphy_asl', 'giphy'].include?(library)
      str = keyword
      lang = 'en'
      rating = 'pg'
      if library == 'giphy_asl'
        str = "#asl #{keyword}" 
        rating = 'pg13'
      else
      end
      key = ENV['GIPHY_KEY']
      res = Typhoeus.get("http://api.giphy.com/v1/gifs/search?q=#{CGI.escape(str)}&api_key=#{key}&lang=#{lang}&rating=#{rating}", timeout: 5)
      results = JSON.parse(res.body)
      list = []
      results['data'].each do |result|
        if library == 'giphy' || (result['slug'].match(/signwithrobert/) || result['slug'].match(/asl/))
          list << {
            'url' => (result['images']['original']['url'] || '').sub(/^http:/, 'https:'),
            'thumbnail_url' => (result['images']['downsized_still']['url'] || '').sub(/^http:/, 'https:'),
            'content_type' => 'image/gif',
            'width' => result['images']['original']['width'].to_i,
            'height' => result['images']['original']['height'].to_i,
            'public' => false,
            'license' => {
              'type' => 'private',
              'copyright_notice_url' => 'https://giphy.com/terms',
              'source_url' => result['url'],
              'author_name' => result['username'],
              'author_url' => result['user'] && result['user']['profile_url'],
              'uneditable' => true
            }
          }
        end
      end
    elsif ['noun-project', 'sclera', 'arasaac', 'mulberry', 'tawasol', 'twemoji', 'opensymbols', 'pcs', 'symbolstix'].include?(library)
      # Use OpenSymbols v2 API if OPENSYMBOLS_SECRET is configured
      # Otherwise fall back to v1 API with OPENSYMBOLS_TOKEN
      if ENV['OPENSYMBOLS_SECRET'].present?
        # Determine protected source for premium libraries
        protected_source = nil
        if library == 'pcs' && user && user.subscription_hash['extras_enabled']
          protected_source = 'pcs'
        elsif library == 'symbolstix' && user && user.subscription_hash['extras_enabled']
          protected_source = 'symbolstix'
        end
        
        # Use the new OpenSymbols v2 API module
        require 'open_symbols' unless defined?(OpenSymbols)
        list = OpenSymbols.find_images(keyword, library, locale, protected_source: protected_source)
      else
        # Fall back to v1 API (legacy)
        str = keyword.to_s
        if library == 'tawasol'
          str += " favor:#{library}"
        elsif library != 'opensymbols'
          str += " repo:#{library}"
        end
        token = ENV['OPENSYMBOLS_TOKEN']
        protected_source = nil
        if library == 'pcs' && user && user.subscription_hash['extras_enabled']
          token += ":pcs"
          protected_source = 'pcs'
        elsif library == 'symbolstix' && user && user.subscription_hash['extras_enabled']
          token += ":symbolstix"
          protected_source = 'symbolstix'
        end
        res = Typhoeus.get("https://www.opensymbols.org/api/v1/symbols/search?q=#{CGI.escape(str)}&search_token=#{token}", :ssl_verifypeer => false, timeout: 5)
        results = JSON.parse(res.body) rescue []
        results.each do |result|
          if result['extension']
            type = MIME::Types.type_for(result['extension'])[0]
            result['content_type'] = type.content_type
          end
        end
        list = []
        results.each do |obj|
          list << {
            'url' => obj['image_url'],
            'thumbnail_url' => obj['image_url'],
            'content_type' => obj['content_type'],
            'width' => obj['width'],
            'height' => obj['height'],
            'external_id' => obj['id'],
            'public' => true,
            'protected' => !!protected_source,
            'protected_source' => protected_source,
            'license' => {
              'type' => obj['license'],
              'copyright_notice_url' => obj['license_url'],
              'source_url' => obj['source_url'],
              'author_name' => obj['author'],
              'author_url' => obj['author_url'],
              'uneditable' => true
            }
          }        
        end
      end
    end
    cache = library.instance_variable_get('@library_cache')
    # puts " GETTING NEW CACHE find" if !cache
    cache ||= LibraryCache.find_or_create_by(library: library, locale: locale)
    library.instance_variable_set('@library_cache', cache)
    if cache && list && list[0]
      cache.add_word(keyword, list[0], cache_forever)
    else
      # Only cache missing words if they're on an "important" board (for now)
      cache.add_missing_word(keyword, cache_forever) if cache_forever
    end
    cache.save_if_added
    return list || false
  end
  
  def self.find_resources(query, source, user)
    tarheel_prefix = "https://tarheelreader.org" #ENV['TARHEEL_PROXY'] || "https://images.weserv.nl/?url=tarheelreader.org"
    if source == 'tarheel'
      url = "https://tarheelreader.org/find/?search=#{CGI.escape(query)}&category=&reviewed=R&audience=E&language=en&page=1&json=1"
      res = Typhoeus.get(url, timeout: 5)
      results = JSON.parse(res.body)
      list = []
      results['books'].each do |book|
        list << {
          'url' => "https://tarheelreader.org#{book['link']}",
          'image' => tarheel_prefix + book['cover']['url'],
          'title' => book['title'],
          'author' => book['author'],
          'id' => book['slug'],
          'image_attribution' => "https://tarheelreader.org/photo-credits/?id=#{book['ID']}"
        }
      end
      return list
    elsif source == 'tarheel_book'
      url = "https://tarheelreader.org/book-as-json/?slug=#{CGI.escape(query)}"
      if query.match(/^http/)
        url = query
      end
      results = AccessibleBooks.find_json(url)
      list = []
      results['pages'].each_with_index do |page, idx|
        list << {
          'id' => page['id'] || "#{results['slug']}-#{idx}",
          'title' => page['text'],
          'image' => page['image_url'] || (tarheel_prefix + page['url']),
          'image_content_type' => page['image_content_type'] || 'image/jpeg',
          'url' => results['book_url'] || "https://tarheelreader.org#{results['link']}",
          'image_attribution' => page['image_attribution_url'] || "https://tarheelreader.org/photo-credits/?id=#{results['ID']}",
          'image_author' => page['image_attribution_author'] || 'Flickr User'
        }
      end
      return list
    end
    []
  end
end
