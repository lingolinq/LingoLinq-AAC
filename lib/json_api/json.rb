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

  # Absolute base URL -- scheme guaranteed -- for links handed to a HUMAN:
  # emails, and anything else opened outside the app.
  #
  # `current_host` is not reliably absolute. Set from a web request it carries
  # the protocol (`application_controller#set_host` uses
  # "#{request.protocol}#{request.host_with_port}"), but its fallback
  # ENV['DEFAULT_HOST'] is a BARE host by design -- .env.example documents it as
  # e.g. "www.lingolinq.com". A link built as "#{current_host}/path" against that
  # bare fallback reaches the recipient as "www.lingolinq.com/path" -- a RELATIVE
  # url inside an <a href>, which a mail client resolves against its own base and
  # cannot follow. That is the MECHANISM this method exists to prevent, and the
  # mechanism is verified. It was REPORTED AS having occurred on the COPPA
  # parental-consent approval link, i.e. the only way to activate a child's
  # account; that specific delivered email has not itself been verified (see
  # below), so treat the mechanism as established and the historical incident as
  # reported.
  #
  # CORRECTED 2026-09-02. An earlier version of this comment explained that
  # failure by asserting that mail is delivered from a Resque worker "and nothing
  # restores the request host across the queue boundary (Worker.domain_id /
  # Worker.set_domain_id exist but are called from nowhere)". THAT WAS FALSE, and
  # it was false when written. boy_band appends "domain::<Worker.domain_id>" at
  # enqueue (boy_band.rb:58) and pops it at perform to call Worker.set_domain_id
  # (boy_band.rb:140-142), and lib/worker.rb:149-152 has that call set_host AND
  # load_domain. The host DOES survive the queue. That behavior dates to
  # de621007b4 (2019-04-16); the claim was written 2026-08-25. Round trip proven
  # by spec/lib/worker_spec.rb:41-47.
  #
  # So this method is still correct and still needed -- a bare ENV['DEFAULT_HOST']
  # is restored just as faithfully as an absolute one, and any chain ORIGINATING
  # outside a request still yields relative links -- but do not cite the queue
  # boundary as the reason. The actual trigger of the reported COPPA failure is
  # NOT established, and neither is the delivered email itself. Note that consent delivery is NOT exclusively controller
  # backed: user.rb:874 is reached request-lessly from
  # app/workers/offboarding_coppa_expiration_worker.rb via
  # User.process_expired_offboarding_consents!. See the N1 entry in
  # docs/task-management/CLAIM-CHECK-BACKLOG.md, whose closure review is reopened.
  #
  # Deliberately a separate method rather than a change to current_host, which is
  # also consumed as a bare identifier (job_stash.rb:64 ships it as a 'host'
  # field; load_domain strips a scheme back off). Idempotent: a host that already
  # carries a scheme is returned untouched, so request-context callers are
  # unaffected and cannot end up double-prefixed.
  def self.absolute_host
    host = current_host.to_s.strip.sub(/\/+\z/, '')
    if host.blank?
      # No request host AND no ENV['DEFAULT_HOST']. Returning '' reproduces the
      # exact defect this method exists to prevent -- every link built on it
      # becomes relative and unfollowable from a mail client -- but raising here
      # would take down mail delivery from a Resque worker for what is a
      # configuration problem. Log it instead, so a misconfigured environment is
      # findable in the logs rather than showing up as parents who cannot approve
      # their child's account. Every deployment path sets DEFAULT_HOST
      # (Dockerfile ARG, deploy-cloudrun.yml BOOT_SECRETS, .env.example), so this
      # should be unreachable in practice.
      Rails.logger.error('JsonApi::Json.absolute_host: no host available (ENV["DEFAULT_HOST"] unset and no request host) — generated links will be RELATIVE and unfollowable') rescue nil
      return host
    end
    return host if host.match?(/\A[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//)
    "#{url_scheme_for(host)}#{host}"
  end

  # Loopback hosts are served over http in development; everything else is https.
  #
  # An already-absolute host is returned untouched by absolute_host above, http
  # included -- deliberately, so that a request-context caller is never rewritten.
  # That is safe in production because config/environments/production.rb sets
  # `config.force_ssl = true`, so a request that reaches set_host has already been
  # redirected to https and `request.protocol` is https. The http case is
  # therefore development and self-hosting only.
  def self.url_scheme_for(host)
    return 'http://' if host.to_s.match?(/\A(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?\z/i)
    'https://'
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
      domain_overrides['settings']['company_name'] ||= "Lingolinq"
      # Org host_settings replace default_domain; merge COPPA from ENV unless org set it explicitly.
      s = domain_overrides['settings']
      if s['coppa_parental_consent'].nil?
        s['coppa_parental_consent'] = JsonApi::Json.coppa_parental_consent_from_env?
      end
    end
    domain_overrides['host'] = host
    if defined?(Rails) && Rails.env.development?
      s = domain_overrides['settings'] || {}
      Rails.logger.info(
        "[domain_settings] host=#{host.inspect} org_custom_domain=#{!!domain} " \
        "coppa_parental_consent=#{s['coppa_parental_consent'].inspect} " \
        "COPPA_PARENTAL_CONSENT=#{ENV['COPPA_PARENTAL_CONSENT'].inspect}"
      )
    end
    @@running_domains ||= {}
    @@running_domains.each{|id, hash| @@running_domains.delete(id) if (hash['timestamp'] || 0) < 1.hour.ago.to_i }
    @@running_domains[Worker.thread_id] = {'timestamp' => Time.now.to_i, 'override' => domain_overrides}
    domain_overrides
  end

  def self.current_domain
    @@running_domains ||= {}
    (@@running_domains[Worker.thread_id] || {})['override'] || self.default_domain
  end

  # COPPA under-13 signup: age gate + parental email consent (see User#coppa_parental_consent_pending?).
  def self.coppa_parental_consent_enabled?
    !!(current_domain && current_domain['settings'] && current_domain['settings']['coppa_parental_consent'])
  end

  # Default digital-consent age for the registration parental-consent gate.
  # US COPPA baseline; used for every non-EU jurisdiction.
  DEFAULT_COPPA_CONSENT_AGE = 13
  # EU maximum (GDPR Art. 8). Poland and other EU member states require
  # verifiable parental consent below this age.
  EU_COPPA_CONSENT_AGE = 16

  # Resolve the applicable parental-consent age for a jurisdiction signal
  # (locale/region/country String, User-like object, Hash, or nil). Returns 16
  # for EU jurisdictions, 13 otherwise. Pure: the feature-flag gate lives at the
  # delivery point (ApplicationController#coppa_consent_age_injection), so an
  # unflagged call still resolves the honest age without changing behavior.
  def self.coppa_consent_age(signal)
    LingoLinq::Jurisdiction.eu?(signal) ? EU_COPPA_CONSENT_AGE : DEFAULT_COPPA_CONSENT_AGE
  end

  # Default ON for COPPA under-13 signup + parental email consent.
  # Set COPPA_PARENTAL_CONSENT=0|false|no|off only to disable (e.g. legacy dev).
  def self.coppa_parental_consent_from_env?
    v = ENV['COPPA_PARENTAL_CONSENT'].to_s.strip.downcase
    return false if %w[0 false no off].include?(v)

    true
  end

  def self.base_default_domain_settings
    {
      'app_name' => ENV['APP_NAME'] || "LingoLinq",
      'company_name' => ENV['COMPANY_NAME'] || "Lingolinq",
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
      'full_domain' => true,
      'coppa_parental_consent' => JsonApi::Json.coppa_parental_consent_from_env?
    }
  end

  def self.default_domain
    settings = base_default_domain_settings.merge(SystemAppDefaults.get.slice(*SystemAppDefaults::EDITABLE_FIELDS))
    {
      'css' => nil,
      'settings' => settings
    }
  end
end