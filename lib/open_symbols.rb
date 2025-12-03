# OpenSymbols API v2 Integration
# Handles authentication and symbol search via the OpenSymbols API
module OpenSymbols
  CACHE_KEY_PREFIX = 'opensymbols_v2'
  TOKEN_EXPIRY_BUFFER = 300 # 5 minutes before actual expiry
  
  class << self
    # Get a valid access token, using cache if available
    def access_token
      cached = get_cached_token
      return cached if cached
      
      generate_new_token
    end
    
    # Search for symbols using the v2 API
    # @param query [String] search term(s)
    # @param locale [String] language/locale (2-char lowercase, default 'en')
    # @param safe [Boolean] enable safe search (default true)
    # @param repo [String] optional repository key to limit results
    # @param favor [String] optional repository key to favor in results
    # @param high_contrast [Boolean] favor high-contrast results
    # @return [Array<Hash>] array of symbol objects
    def search(query, locale: 'en', safe: true, repo: nil, favor: nil, high_contrast: false)
      return [] if query.blank?
      
      # Build search string with modifiers
      search_str = query.to_s
      search_str += " repo:#{repo}" if repo.present?
      search_str += " favor:#{favor}" if favor.present?
      search_str += " hc:1" if high_contrast
      
      token = access_token
      return [] unless token
      
      params = {
        q: search_str,
        locale: locale,
        safe: safe ? 1 : 0
      }
      
      url = "https://www.opensymbols.org/api/v2/symbols"
      
      begin
        response = Typhoeus.get(
          url,
          params: params,
          headers: { 'Authorization' => "Bearer #{token}" },
          ssl_verifypeer: false,
          timeout: 10
        )
        
        if response.code == 401
          # Token expired, clear cache and retry once
          clear_token_cache
          token = generate_new_token
          return [] unless token
          
          response = Typhoeus.get(
            url,
            params: params,
            headers: { 'Authorization' => "Bearer #{token}" },
            ssl_verifypeer: false,
            timeout: 10
          )
        end
        
        if response.code == 429
          Rails.logger.warn "OpenSymbols API throttled"
          return []
        end
        
        if response.success?
          parse_search_results(JSON.parse(response.body))
        else
          Rails.logger.error "OpenSymbols API error: #{response.code} - #{response.body}"
          []
        end
      rescue => e
        Rails.logger.error "OpenSymbols API exception: #{e.message}"
        []
      end
    end

    # Get default symbols for a list of queries
    # @param library [String] the repository key (e.g., 'opensymbols', 'mulberry')
    # @param queries [Array<String>] list of terms to search for
    # @param locale [String] locale code
    # @return [Hash] mapping of query to symbol object
    def defaults(library, queries, locale)
      return {} if queries.blank?
      
      token = access_token
      return {} unless token
      
      url = "https://www.opensymbols.org/api/v2/repositories/#{library}/defaults"
      
      begin
        response = Typhoeus.post(
          url,
          body: {
            words: queries,
            locale: locale
          },
          headers: { 'Authorization' => "Bearer #{token}" },
          ssl_verifypeer: false,
          timeout: 30
        )
        
        if response.code == 401
          clear_token_cache
          token = generate_new_token
          return {} unless token
          
          response = Typhoeus.post(
            url,
            body: {
              words: queries,
              locale: locale
            },
            headers: { 'Authorization' => "Bearer #{token}" },
            ssl_verifypeer: false,
            timeout: 30
          )
        end
        
        if response.success?
          JSON.parse(response.body) rescue {}
        else
          Rails.logger.error "OpenSymbols Defaults API error: #{response.code} - #{response.body}"
          {}
        end
      rescue => e
        Rails.logger.error "OpenSymbols Defaults API exception: #{e.message}"
        {}
      end
    end
    
    # Search for symbols and return in LingoLinq format
    # This maintains compatibility with the existing find_images interface
    def find_images(keyword, library, locale, protected_source: nil)
      repo = nil
      favor = nil
      
      # Map library names to OpenSymbols repo keys
      case library
      when 'opensymbols'
        # No specific repo, search all
      when 'tawasol'
        favor = 'tawasol'
      when 'noun-project', 'sclera', 'arasaac', 'mulberry', 'twemoji'
        repo = library
      when 'pcs', 'symbolstix'
        repo = library
      else
        return []
      end
      
      results = search(keyword, locale: locale, repo: repo, favor: favor)
      
      # Convert to LingoLinq format
      results.map do |symbol|
        {
          'url' => symbol['image_url'],
          'thumbnail_url' => symbol['image_url'],
          'content_type' => content_type_for_extension(symbol['extension']),
          'width' => symbol['width'],
          'height' => symbol['height'],
          'external_id' => symbol['id'],
          'public' => !protected_source,
          'protected' => !!protected_source,
          'protected_source' => protected_source,
          'license' => {
            'type' => symbol['license'],
            'copyright_notice_url' => symbol['license_url'],
            'source_url' => symbol['source_url'],
            'author_name' => symbol['author'],
            'author_url' => symbol['author_url'],
            'uneditable' => true
          }
        }
      end
    end
    
    private
    
    def get_cached_token
      if defined?(RedisAccess) && RedisAccess.redis
        token_data = RedisAccess.get("#{CACHE_KEY_PREFIX}:token")
        if token_data
          data = JSON.parse(token_data) rescue nil
          if data && data['token'] && data['expires_at']
            expires_at = Time.parse(data['expires_at']) rescue nil
            if expires_at && expires_at > (Time.now + TOKEN_EXPIRY_BUFFER)
              return data['token']
            end
          end
        end
      end
      nil
    end
    
    def cache_token(token, expires_in_seconds = 3600)
      if defined?(RedisAccess) && RedisAccess.redis
        expires_at = Time.now + expires_in_seconds - TOKEN_EXPIRY_BUFFER
        token_data = {
          token: token,
          expires_at: expires_at.iso8601
        }
        RedisAccess.set("#{CACHE_KEY_PREFIX}:token", token_data.to_json)
        RedisAccess.expire("#{CACHE_KEY_PREFIX}:token", expires_in_seconds)
      end
    end
    
    def clear_token_cache
      if defined?(RedisAccess) && RedisAccess.redis
        RedisAccess.del("#{CACHE_KEY_PREFIX}:token")
      end
    end
    
    def generate_new_token
      secret = ENV['OPENSYMBOLS_SECRET']
      
      unless secret
        Rails.logger.error "OPENSYMBOLS_SECRET not configured"
        return nil
      end
      
      begin
        response = Typhoeus.post(
          "https://www.opensymbols.org/api/v2/token",
          body: { secret: secret },
          ssl_verifypeer: false,
          timeout: 10
        )
        
        if response.success?
          data = JSON.parse(response.body)
          token = data['access_token']
          
          if token
            # Cache for 50 minutes (tokens typically last 1 hour)
            cache_token(token, 3000)
            return token
          else
            Rails.logger.error "No access_token in OpenSymbols response"
            return nil
          end
        else
          Rails.logger.error "Failed to generate OpenSymbols token: #{response.code} - #{response.body}"
          return nil
        end
      rescue => e
        Rails.logger.error "OpenSymbols token generation exception: #{e.message}"
        return nil
      end
    end
    
    def parse_search_results(results)
      return [] unless results.is_a?(Array)
      
      results.map do |result|
        {
          'id' => result['id'],
          'symbol_key' => result['symbol_key'],
          'name' => result['name'],
          'locale' => result['locale'],
          'license' => result['license'],
          'license_url' => result['license_url'],
          'author' => result['author'],
          'author_url' => result['author_url'],
          'source_url' => result['source_url'],
          'skins' => result['skins'],
          'repo_key' => result['repo_key'],
          'hc' => result['hc'],
          'extension' => result['extension'],
          'image_url' => result['image_url'],
          'width' => result['width'],
          'height' => result['height'],
          'search_string' => result['search_string'],
          'unsafe_result' => result['unsafe_result']
        }
      end
    end
    
    def content_type_for_extension(ext)
      return 'image/png' unless ext
      
      type = MIME::Types.type_for(ext)[0]
      type ? type.content_type : 'image/png'
    end
  end
end
