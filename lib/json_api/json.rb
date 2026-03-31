module JsonApi::Json
  def as_json(obj, args={})
    if obj.respond_to?(:cached_json_response) && !args[:nocache]
      res = obj.cached_json_response
      return res if res
    end
    json = build_json(obj, args)
    if args[:wrapper]
      new_json = {}
      new_json[self::TYPE_KEY] = json
      json = new_json
      if self.respond_to?(:extra_includes)
        json = extra_includes(obj, json, args.except(:wrapper))
      end
      if self.respond_to?(:meta)
        metadata = self.meta(obj)
        json['meta'] = metadata if !metadata.blank?
      end
    end
    json
  end
  
  def paginate(params, where, args={})
    per_page = params['per_page'] ? [self::MAX_PAGE, params['per_page'].to_i].min : self::DEFAULT_PAGE
    per_page = (args['per_page'] || args[:per_page]) if (args['per_page'] || args[:per_page])
    offset = params['offset'].to_i || 0
    if where.is_a?(Array)
      where = where[offset, per_page + 1]
    else
      where = where.limit(per_page + 1).offset(offset)
    end
    more = !!where[per_page]
    json = {
      :meta => {
        :per_page => per_page,
        :offset => offset,
        :next_offset => offset + per_page,
        :more => more,
        :next_url => nil
      }
    }
    extra_meta = {}
    if self.respond_to?(:paginate_meta)
      extra_meta = self.paginate_meta(params, json)
      extra_meta.each do |key, val|
        json[:meta][key] = val
      end
    end
    if more
      prefix = "#{JsonApi::Json.current_host}/api/v1/#{self::TYPE_KEY.pluralize}"
      if args[:prefix] || args['prefix']
        prefix = args[:prefix] || args['prefix']
        prefix = "#{JsonApi::Json.current_host}/api/v1" + prefix if prefix.match(/^\//)
      end
      
      json[:meta][:prefix] = prefix
      json[:meta][:next_url] = prefix + "?offset=#{offset+per_page}&per_page=#{per_page}"
      extra_meta.each do |key, val|
        json[:meta][:next_url] += "&#{key.to_s}=#{CGI.escape(val.to_s)}" if val
      end
    end
    results = where[0, per_page]
    if args[:extra_results] && args[:extra_results].length > 0
      results += args[:extra_results]
    end
    args[:page_results] = results
    if self.respond_to?(:page_data)
      args[:page_data] = self.page_data(results, args)
    end
    args[:paginated] = true
    json[self::TYPE_KEY] = results.map{|i| as_json(i, args) }
    json
  end
  
  def self.set_host(host)
    @@running_hosts ||= {}
    hosts = {}
    @@running_hosts.each{|id, h| hosts[id] = h }
    hosts.each{|id, hash| @@running_hosts.delete(id) if (hash['timestamp'] || 0) < 1.hour.ago.to_i }
    @@running_hosts[Worker.thread_id] = {'timestamp' => Time.now.to_i, 'host' => host}
  end
  
  def self.current_host
    @@running_hosts ||= {}
    (@@running_hosts[Worker.thread_id] || {})['host'] || ENV['DEFAULT_HOST']
  end

  def self.load_domain(host)
    host = host.split(/\/\//).pop.split(/\:/).first
    default_domain = JsonApi::Json.default_domain
    domain_overrides = default_domain
    domain = (::Organization.load_domains || {})[host]
    if domain
      domain_overrides = {
        'css' => domain['css_url'],
        'settings' => domain
      }
      domain_overrides['settings']['app_name'] ||= "LingoLinq"
      domain_overrides['settings']['company_name'] ||= "Someone"
    end
    domain_overrides['host'] = host
    @@running_domains ||= {}
    @@running_domains.each{|id, hash| @@running_domains.delete(id) if (hash['timestamp'] || 0) < 1.hour.ago.to_i }
    @@running_domains[Worker.thread_id] = {'timestamp' => Time.now.to_i, 'override' => domain_overrides}
    domain_overrides
  end

  def self.current_domain
    @@running_domains ||= {}
    (@@running_domains[Worker.thread_id] || {})['override'] || self.default_domain
  end

  def self.default_domain
    {
      'css' => nil,
      'settings' => {
        'app_name' => ENV['APP_NAME'] || "LingoLinq",
        'company_name' => ENV['COMPANY_NAME'] || "Someone",
        'logo_url' => "/images/logo-new.png",
        'ios_store_url' => ENV['IOS_STORE_URL'],
        'play_store_url' => ENV['PLAY_STORE_URL'],
        'kindle_store_url' => ENV['KINDLE_STORE_URL'],
        'windows_32_bit_url' => ENV['WINDOWS_32_BIT_URL'],
        'windows_64_bit_url' => ENV['WINDOWS_64_BIT_URL'],
        'blog_url' => ENV['BLOG_URL'],
        'twitter_url' => ENV['TWITTER_URL'],
        'twitter_handle' => ENV['TWITTER_HANDLE'],
        'facebook_url' => ENV['FACEBOOK_URL'],
        'youtube_url' => ENV['YOUTUBE_URL'],
        'support_url' => ENV['SUPPORT_URL'],
        'board_user_name' => ENV['BOARD_USER_NAME'] || 'example',
        'full_domain' => true
      }
    }
  end
end