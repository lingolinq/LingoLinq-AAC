require 'mime/types'
class Api::SearchController < ApplicationController
  before_action :require_api_token, :except => [:audio, :focuses]
  def symbols
    # Extract query and parameters
    query = params['q']
    locale = (params['locale'] || 'en').split(/-|_/)[0]
    safe = params['safe'] != '0'

    # Determine library - default to 'opensymbols' for backward compatibility
    library = params['library'] || 'opensymbols'

    # Handle premium repository searches
    protected_source = nil
    if query.match(/premium_repo:pcs$/)
      user_allowed = @api_user && @api_user.subscription_hash['extras_enabled']
      if !user_allowed && @api_user && params['user_name']
        ref_user = User.find_by_path(params['user_name'])
        user_allowed = ref_user && ref_user.allows?(@api_user, 'edit') && ref_user.subscription_hash['extras_enabled']
      end
      if user_allowed
        query = query.sub(/premium_repo:pcs$/, '')
        library = 'pcs'
        protected_source = 'pcs'
      else
        return api_error 400, {error: 'premium search not allowed'}
      end
    elsif query.match(/premium_repo:symbolstix$/)
      user_allowed = @api_user && @api_user.subscription_hash['extras_enabled']
      if !user_allowed && @api_user && params['user_name']
        ref_user = User.find_by_path(params['user_name'])
        user_allowed = ref_user && ref_user.allows?(@api_user, 'edit') && ref_user.subscription_hash['extras_enabled']
      end
      if user_allowed
        query = query.sub(/premium_repo:symbolstix$/, '')
        library = 'symbolstix'
        protected_source = 'symbolstix'
      else
        return api_error 400, {error: 'premium search not allowed'}
      end
    end

    # Use Uploader to get results (handles v2 API with OPENSYMBOLS_SECRET fallback to v1)
    results = Uploader.find_images(query, library, locale, @api_user, nil, false, false)

    # Track missing symbols
    if results.empty? && query && RedisInit.default
      RedisInit.default.hincrby('missing_symbols', query.to_s, 1)
    end

    render json: results
  end

  def protected_symbols
    res = false
    ref_user = @api_user
    if params['library'] != 'giphy_asl' && params['user_name'] && params['user_name'] != ''
      maybe_ref_user = User.find_by_path(params['user_name'])
      return unless exists?(maybe_ref_user, params['user_name'])
      if maybe_ref_user.allows?(@api_user, 'edit')
        ref_user = maybe_ref_user
      end
    end
    if params['library']
      res = Uploader.find_images(params['q'], params['library'], 'en', ref_user, @api_user)
    end
    if res == false
      return allowed?(@api_user, 'never_allowed')
    end

    formatted = []
    res.each do |item|
      formatted << {
        'image_url' => item['url'],
        'thumbnail_url' => item['thumbnail_url'] || item['url'],
        'content_type' => item['content_type'],
        'name' => item['name'],
        'width' => item['width'],
        'height' => item['height'],
        'external_id' => item['external_id'],
        'finding_user_name' => @api_user.user_name,
        'protected' => !!item['protected'],
        'protected_source' => params['library'],
        'public' => false,
        'license' => item['license']['type'],
        'author' => item['license']['author_name'],
        'author_url' => item['license']['author_url'],
        'source_url' => item['license']['source_url'],
        'copyright_notice_url' => item['license']['copyright_notice_url']
      }
    end
    render json: formatted
  end
  
  def external_resources
    ref_user = @api_user
    if params['user_name'] && params['user_name'] != ''
      ref_user = User.find_by_path(params['user_name'])
      return unless exists?(ref_user, params['user_name'])
      return unless allowed?(ref_user, 'edit')
    end
    res = Uploader.find_resources(params['q'], params['source'], ref_user)
    render json: res
  end

  def focuses
    req = Typhoeus.get("https://workshop.openaac.org/api/v1/search/focus?locale=#{CGI.escape(params['locale'] || 'en')}&q=#{CGI.escape(params['q'] || '')}&category=#{CGI.escape(params['category'] || '')}&type=#{CGI.escape(params['type'] || '')}&sort=#{CGI.escape(params['sort'] || '')}", timeout: 10)
    json = JSON.parse(req.body) rescue nil
    render json: req.body
  end
    
  def parts_of_speech
    data = WordData.find_word(params['q'])
    res = {}
    if !data && params['suggestions']
      str = "#{params['q']}-not_defined"
      RedisInit.default.hincrby('overridden_parts_of_speech', str, 1) if RedisInit.default
      return api_error 404, {error: 'word not found'} unless data
    end
    
    if params['suggestions']
      # TODO: this is too slow to return real-time, consider caching it on the word_data record
      # res['recent_usage'] = WeeklyStatsSummary.word_trends(params['q'])
    end
    
    if params['suggestions'] && (data['sentences'] || []).length == 0
      str = "#{params['q']}-no_sentences"
      RedisInit.default.hincrby('overridden_parts_of_speech', str, 1) if RedisInit.default
    end

    render json: res.merge(data || {})
  end
  
  def proxy
    # TODO: must be escaped to correctly handle URLs like 
    # "https://opensymbols.s3.amazonaws.com/libraries/arasaac/to be reflected.png"
    # but it must also work for already-escaped URLs like
    # "http://www.stephaniequinn.com/Music/Commercial%2520DEMO%2520-%252013.mp3"
    url_param = params['url'] || ''
    
    # Handle S3 paths - convert relative S3 paths to full S3 URLs
    # Paths like /extras.../BoardDownstreamButtonSet/... are S3 paths, not server paths
    if url_param.start_with?('/extras') || url_param.start_with?('/extras-')
      # Reject directory traversal attempts (e.g. /extras-/../../../ or double-encoded %252e%252e)
      decoded = url_param
      10.times do
        prev = decoded
        decoded = URI.decode_www_form_component(decoded) rescue decoded
        break if decoded == prev
      end
      if decoded.include?('..')
        Rails.logger.error("Invalid proxy URL - path traversal rejected: #{url_param}")
        return api_error 400, {error: "Invalid URL: path traversal not allowed", original_url: params['url']}
      end
      # This is an S3 path - convert to full S3 URL
      bucket = ENV['UPLOADS_S3_BUCKET']
      if bucket
        url_param = "https://#{bucket}.s3.amazonaws.com#{url_param}"
      else
        Rails.logger.error("S3 bucket not configured, cannot proxy S3 path: #{url_param}")
        return api_error 400, {error: "S3 bucket not configured", original_url: params['url']}
      end
    # Handle other relative URLs - convert to absolute if they start with /
    elsif url_param.start_with?('/')
      # Relative URL - construct absolute URL from request
      url_param = "#{request.protocol}#{request.host_with_port}#{url_param}"
    end
    
    a, b = url_param.split(/\/\//, 2)
    # Check if b exists and matches pattern before calling .match() to avoid NoMethodError on nil
    b = (b || '').sub(/\/\//, '/').to_s if b && b.match(/^opensymbols/)
    url = [a, b].join("//")
    
    # Validate that we have a proper absolute URL
    unless url.match(/^https?:\/\//)
      # Distinguish between S3 configuration issues and general URL format issues
      original_url = params['url'] || url_param
      if original_url.start_with?('/extras') || original_url.start_with?('/extras-')
        Rails.logger.error("Invalid proxy URL - S3 path could not be converted to absolute URL: #{original_url}")
        return api_error 400, {error: "S3 path could not be converted to absolute URL. Check S3 bucket configuration.", original_url: original_url}
      else
        Rails.logger.error("Invalid proxy URL (not absolute): #{original_url}")
        return api_error 400, {error: "Invalid URL: must be an absolute URL (starting with http:// or https://)", original_url: original_url}
      end
    end
    
    uri = URI.parse(url) rescue nil
    Rails.logger.warn("proxying #{url}")
    
    unless uri
      # Try escaping the URL
      begin
        uri = URI.parse(URI.escape(url))
      rescue => e
        Rails.logger.error("Failed to parse proxy URL: #{url} - #{e.message}")
        return api_error 400, {error: "Invalid URL format: #{e.message}"}
      end
    end
    
    # TODO: add timeout for slow requests
    request = Typhoeus::Request.new(uri.to_s, followlocation: true)
    error = nil
    begin
      content_type, body = get_url_in_chunks(request)
      if content_type == 'redirect'
        uri = URI.parse(body)
        request = Typhoeus::Request.new(uri.to_s, followlocation: true)
        content_type, body = get_url_in_chunks(request)
      end
    rescue BadFileError => e
      error = e.message
      Rails.logger.error("Proxy error for #{url}: #{error}")
    rescue => e
      error = "Failed to fetch URL: #{e.message}"
      Rails.logger.error("Proxy exception for #{url}: #{e.class.name} - #{e.message}")
      Rails.logger.error(e.backtrace.join("\n"))
    end
    
    if !error
      str = "data:" + content_type
      str += ";base64," + Base64.strict_encode64(body)
      render json: {content_type: content_type, data: str}
    else
      api_error 400, {error: error}
    end
  end
  
  def apps
    res = AppSearcher.find(params['q'], params['os'])
    render json: res
  end
  
  def audio
    req = nil
    content_type = 'audio/wav'
    if params['locale'] && params['locale'].match(/^ga/)
      req = Typhoeus.post("https://abair.ie/aac_irish", body: {text: params['text'], voice: params['voice_id'] || 'Ulster'}, timeout: 5)
      if req.success?
        # src = Nokogiri(req.body).css('audio source')[0]['src']
        # req = Typhoeus.get("https://abair.ie#{src}")
      else
        return api_error 400, {error: 'endpoint failed to respond'}
        req = nil
      end
    # elsif params['locale'] && params['locale'].match(/^uk/)
    #   req = Typhoeus.post("https://hf.space/gradioiframe/robinhad/ukrainian-tts/+/api/predict/", body: {data: [params['text'], "uk/mai/vits-tts"]}.to_json, headers: {'Content-Type': 'application/json'})
    #   json = JSON.parse(req.body) rescue nil
    #   req = nil
    #   if json
    #     req = nil
    #     pre, data = json['data'][0].split(/,/)
    #     type = pre.match(/data:([^;]+);/)[1]
    #     if data && type
    #       bytes = Base64.decode64(data)
    #       req = OpenStruct.new(body: bytes, headers: {'Content-Type' => type})
    #     end
    #   end
    elsif ENV['GOOGLE_TTS_TOKEN']
      # TODO: API for getting a list of all available remote languages
      json = nil
      cache = RedisInit.permissions.get("google/voices/#{params['locale'] || 'en'}") rescue nil
      if cache
        json = JSON.parse(cache) rescue nil
      end
      if !json || json['voices'].length == 0
        req = Typhoeus.get("https://texttospeech.googleapis.com/v1beta1/voices?languageCode=#{CGI.escape(params['locale'] || 'en')}&key=#{ENV['GOOGLE_TTS_TOKEN']}")
        json = JSON.parse(req.body) rescue nil
        if json && (!json['voices'] || json['voices'].length == 0)
          req = Typhoeus.get("https://texttospeech.googleapis.com/v1beta1/voices?languageCode=#{CGI.escape((params['locale'] || 'en').split(/-|_/)[0])}&key=#{ENV['GOOGLE_TTS_TOKEN']}")
          json = JSON.parse(req.body) rescue nil
        end
        cache = nil
      end

      req = nil
      if json && !cache
        Permissions.setex(RedisInit.permissions, "google/voices/#{params['locale']}", 72.hours.to_i, json.to_json)
      end
      return api_error 400, {error: 'no voice found', locale: params['locale']} unless json && json['voices'] && json['voices'][0]
      if json && json['voices'] && json['voices'][0]
        gender = params['voice_id'] if ['male', 'female'].include?(params['voice_id'])
        voices = json['voices'].sort_by{|v| (v['name'] || '').match(/neural2/i) ? 0 : ((v['name'] || '').match(/wavenet/i) ? 1 : 2)}
        voice = voices.detect{|v| v['ssmlGender'] && v['ssmlGender'].upcase == (params['voice_id'] || '').upcase && v['languageCodes'].include?(params['locale']) }
        voice = voices.detect{|v| (v['languageCodes'] || []).include?(params['locale']) }
        voice = voices.detect{|v| v['ssmlGender'] && v['ssmlGender'].upcase == (params['voice_id'] || '').upcase }
        voice ||= voices[0]
        loc = params['locale']
        if voice && voice['languageCodes'] && !(voice['languageCodes'] || []).include?(params['locale'])
          loc = voice['languageCodes'][0]
        end
        # https://cloud.google.com/text-to-speech/?hl=en_US&_ga=2.240949507.-1294930961.1646091692
        content_type = 'audio/mp3' if params['mp3'] != '0'
        res = Typhoeus.post("https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=#{ENV['GOOGLE_TTS_TOKEN']}", body: 
          {
            audioConfig: {audioEncoding: content_type == 'audio/mp3' ? 'MP3' : 'LINEAR16', pitch: 0, speakingRate: 1},
            input: {text: params['text']},
            voice: {languageCode: loc, name: voice['name']}
          }.to_json, headers: {'Content-Type': 'application/json'}
        )
        json = JSON.parse(res.body) rescue nil
        if json && json['audioContent']
          bytes = Base64.decode64(json['audioContent'])
          req = OpenStruct.new(body: bytes, headers: {'Content-Type' => 'audio/wav'})
        end
      end
    else
      req = Typhoeus.get("http://translate.google.com/translate_tts?id=UTF-8&tl=#{params['locale'] || 'en'}&q=#{URI.escape(params['text'] || "")}&total=1&idx=0&textlen=#{(params['text'] || '').length}&client=tw-ob", timeout: 5, headers: {'Referer' => "https://translate.google.com/", 'User-Agent' => "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36"})
    end
    return api_error 400, {error: 'remote request failed'} unless req && !req.body.blank?
    response.headers['Content-Type'] = content_type
    send_data req.body, :type => content_type, :disposition => 'inline'
  end
  

  def get_url_in_chunks(request)
    content_type = nil
    body = ""
    so_far = 0
    done = false
    url_response = nil
    request.on_headers do |response|
      # For some reason, headers aren't populated until first body chunk
     url_response = response
    end
    request.on_body do |chunk|
      if url_response
        response = url_response
        # Some services (ahem, flickr) are returning a Location header, along with the response body
        if response.headers['Location'] && (response.code >= 300 || (response.headers['Content-Length'] && response.headers['Content-Length'].to_i <= response.headers['Location'].length))
          return ['redirect', URI.escape(response.headers['Location'])]
        elsif response.code == 302 && response.headers['Link']
          return ['redirect', URI.escape(response.headers['Link'].split(/<|>/)[1])]
        end
        if response.success? || response.code == 200
          content_type = response.headers['Content-Type']
          if !content_type.match(/^image/) && !content_type.match(/^audio/) && !content_type.match(/text\/json/)
            raise BadFileError, "Invalid file type, #{content_type}"
          end
        else
          raise BadFileError, "File not retrieved, status #{response.code} for #{request.url}"
        end
        url_response = nil
      end
      so_far += chunk.size
      if so_far < Uploader::CONTENT_LENGTH_RANGE
        body += chunk
      else
        raise BadFileError, "File too big (> #{Uploader::CONTENT_LENGTH_RANGE})"
      end
    end
    request.on_complete do |response|
      if !response.success? && response.code != 200
        raise BadFileError, "Bad file, #{response.code}"
      end
      done = true
    end
    request.run
    content_type ||= request.headers['Content-Type']
    return [content_type, body]
  end
  
  class BadFileError < StandardError
  end
end
