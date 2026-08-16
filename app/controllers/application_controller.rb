class ApplicationController < ActionController::Base
  # API-style auth endpoints (token, saml, oauth) are called via AJAX without CSRF token
  protect_from_forgery with: :null_session
  before_action :set_host
  before_action :check_api_token
  before_action :replace_helper_params
  before_action :load_domain
  before_action :set_paper_trail_whodunnit
  after_action :log_api_call
  before_action :set_sentry_user
  around_action :with_request_caching

  # Clears request-scoped Thread.current caches after each request to prevent
  # data leaking between requests on the same Puma thread.
  # See: app/models/board_content.rb, app/models/word_data.rb
  def with_request_caching
    yield
  ensure
    Worker.clear_request_thread_caches
  end

  def set_host
    Rails.logger.info("Request ID #{request.headers['X-Request-Id'] || request.headers['X-Request-ID'] || request.request_id} #{request.headers['X-Request-Start']} #{}")
    if request.headers['X-SILENCE-LOGGER']
      Rails.logger.silence(Logger::INFO) do
        Rails.logger.info("APP LOGS DISABLED, user has opted out of tracking")
      end
    end
    JsonApi::Json.set_host("#{request.protocol}#{request.host_with_port}")
  end

  def load_domain
    host = request.host
    @domain_overrides = JsonApi::Json.load_domain(host)
    true
  end

  # EU launch (GDPR Art. 8): per-request jurisdiction-aware parental-consent age,
  # delivered to the anonymous registration UI via domain_settings. Returns {}
  # unless the eu_consent_age feature is enabled, so with the flag OFF the
  # injected domain_settings are byte-identical to today. Callers MUST merge this
  # into a fresh copy of the settings hash (never mutate @domain_overrides, which
  # is the cached per-host blob from JsonApi::Json.load_domain).
  def coppa_consent_age_injection
    return {} unless FeatureFlags.eu_consent_age_enabled?
    { 'coppa_consent_age' => JsonApi::Json.coppa_consent_age(jurisdiction_signal_for_request) }
  end
  helper_method :coppa_consent_age_injection

  # Compliance Kernel: inject anonymous signup routing hints into domain_settings
  # when the flag is ON. Returns {} when OFF so payloads stay identical to today.
  def compliance_kernel_injection
    return {} unless FeatureFlags.compliance_workflow_kernel_enabled?

    profile = Compliance::Profile.for(nil, request: request, declaration: params[:jurisdiction].presence)
    {
      'compliance_kernel' => {
        'digital_consent_age' => profile.digital_consent_age,
        'jurisdiction' => profile.jurisdiction,
        'effective_rules' => profile.effective_rules
      }
    }
  end
  helper_method :compliance_kernel_injection

  # Best jurisdiction signal available for THIS request, using only signals that
  # already exist (no IP geolocation). This is best-effort BROWSER-LOCALE
  # detection: an explicit ?locale= param, then the Accept-Language header.
  #
  # Deliberately does NOT read a country/region/locale off @domain_overrides:
  # host_settings carries no such key today (see Organization#process_params
  # allowlist), so those reads would be dead and misrepresent the signal source.
  # A region-less locale (bare 'pl') resolves to unknown and preserves the
  # default age-13 gate. Wiring an AUTHORITATIVE org-configured EU-host country
  # is a tracked follow-up and is required before eu_consent_age is relied on as
  # a GDPR Art. 8 control (browser locale under-fires for EU users who send a
  # bare language subtag).
  def jurisdiction_signal_for_request
    params[:locale].presence || request.headers['Accept-Language'].presence
  end

  def log_api_call
    time = @time ? (Time.now - @time) : nil
    ApiCall.log(@token, @api_user, request, response, time)
    true
  end
  
  # Hash the requester IP and attach to the Sentry scope as the synthetic
  # user id so issues group per-requester without exposing raw IPs.
  # CoppaSentryScrub redacts the event entirely if a logged-in user turns
  # out to be COPPA-pending. The actual User reference for that consent
  # check rides on RequestStore (NOT on the Sentry event itself), because
  # Sentry.user_hash[:id] is the IP hash and won't resolve to a database id.
  def set_sentry_user
    return unless defined?(Sentry) && Sentry.respond_to?(:initialized?) && Sentry.initialized?
    Sentry.set_user(id: GoSecure.sha512(request.remote_ip, 'user_ip'))
    stash_coppa_sentry_user(coppa_sentry_subject_user)
  rescue StandardError
    nil
  end

  # Stash the User whose data might appear on a Sentry event. Call again
  # from actions that resolve the authenticated user after before_action.
  def stash_coppa_sentry_user(user)
    CoppaSentryScrub.stash_request_user(user)
  end

  def coppa_sentry_subject_user
    return @api_user if defined?(@api_user) && @api_user

    if controller_path == 'parental_consents' || controller_path == 'eu_ai_parental_consents'
      user_id = params[:user_id].presence || params['user_id']
      return User.find_by_path(user_id) if user_id.present?
    end

    nil
  rescue StandardError
    nil
  end
  
  def check_api_token
    return true unless request.path.match(/^\/api/) || request.path.match(/^\/oauth2/) || request.path.match(/^\/saml/) || request.path.match(/^\/auth/) || params['check_token'] || request.headers['Check-Token']
    if request.path.match(/^\/api\/v1\/.+\/simple\.obf/)
      headers['Access-Control-Allow-Origin'] = '*'
      headers['Access-Control-Allow-Methods'] = 'GET'
      headers['Access-Control-Max-Age'] = "1728000"      
    end
#     if request.path.match(/^\/api/)
#       headers['Access-Control-Allow-Origin'] = '*'
#       headers['Access-Control-Allow-Methods'] = 'POST, GET, OPTIONS'
#       headers['Access-Control-Max-Age'] = "1728000"      
#     end
    @time = Time.now
    Time.zone = nil
    # NOTE: Do not globally call `params.permit!` here; keep Strong Parameters
    # protections intact. Controllers that need nested params must explicitly
    # permit them or use `to_unsafe_h` in a narrowly scoped way.
    token = params['access_token']
    # If token is "none" (default value from frontend), treat it as missing and check Authorization header
    token = nil if token == 'none' || token.blank?
    PaperTrail.request.whodunnit = nil
    if !token && params['tmp_token'] && (request.path.match(/^\/(auth|saml)\//) || request.path.match(/^\/api\/v1\/token_check/) || (params['check_token'] && Rails.env.test?))
      @tmp_token = true
      token = RedisInit.default.get("token_tmp_#{params['tmp_token']}")
    elsif !token && request.headers['Authorization']
      match = request.headers['Authorization'].match(/^Bearer ([\w\-_\~]+)$/)
      token = match[1] if match
    end
    @token = token
    if token
      Rails.logger.debug("check_api_token: Token found for path #{request.path}") unless Rails.env.production?
      status = Device.check_token(token, request.headers['X-LingoLinq-Version'])
      @cached = true if status[:cached]
      ignorable_error = ['/api/v1/token_check', '/oauth/token/refresh'].include?(request.path) && status[:skip_on_token_check]
      Rails.logger.debug("check_api_token: status keys: #{status.keys.inspect}, error: #{status[:error]}, skip_on_token_check: #{status[:skip_on_token_check]}, ignorable_error: #{ignorable_error}")
      if status[:error] && !ignorable_error
        set_browser_token_header
        error = {error: status[:error], invalid_token: status[:invalid_token]}
        error[:refreshable] = true if status[:can_refresh]
        # Log token validation errors for debugging
        Rails.logger.warn("Token validation failed: #{status[:error]} for path: #{request.path}")
        api_error 400, error
        return false
      else
        @api_user = status[:user]
        @api_device_id = status[:device_id]
        Rails.logger.debug("check_api_token: @api_user set: #{!!@api_user}, @api_device_id: #{@api_device_id}")
        # Log if device_id is missing but user is present (debugging Rails 7 upgrade)
        if @api_user && !@api_device_id && !Rails.env.production?
          Rails.logger.warn("Device.check_token returned user but no device_id. Status keys: #{status.keys.inspect}")
        end
      end
      # TODO: timezone user setting
      Time.zone = "Mountain Time (US & Canada)"
      PaperTrail.request.whodunnit = user_for_paper_trail

      as_user = params['as_user_id'] || request.headers['X-As-User-Id']
      if @api_user && as_user
        @linked_user = User.find_by_path(as_user)
        admin = Organization.admin
        if admin && admin.manager?(@api_user) && @linked_user
          # Fail-closed disclosure: refuse impersonation if the accounting row
          # cannot be written (FERPA/HIPAA). Deduped per operator/target for 30m.
          if record_masquerade_audit!(operator: @api_user, target: @linked_user, branch: 'site_admin') != :ok
            api_error 503, {error: 'Audit log write failed; masquerade refused'}
            return false
          end
          @true_user = @api_user
          @linked_user.permission_scopes = @api_user.permission_scopes
          @api_user = @linked_user
          PaperTrail.request.whodunnit = "user:#{@true_user.global_id}:as:#{@api_user.global_id}"
        elsif @linked_user
          masq_key = "masq/#{@api_user.global_id}/#{@api_user.updated_at.to_i}/#{@linked_user.global_id}/#{@linked_user.updated_at.to_i}"
          masq_ok = RedisInit.default.get(masq_key)
          if masq_ok != 'true'
            managed_ids = Organization.attached_orgs(@api_user).select{|o| o['type'] == 'manager' && o['full_manager'] }.map{|o| o['id'] }
            attached_ids = Organization.attached_orgs(@linked_user).select{|o| ['user', 'supervisor'].include?(o['type']) && !o['pending'] }.map{|o| o['id'] }
            masq_ok = ((managed_ids & attached_ids).length > 0) && 'store'
          end
          if masq_ok
            if record_masquerade_audit!(operator: @api_user, target: @linked_user, branch: 'org_manager') != :ok
              api_error 503, {error: 'Audit log write failed; masquerade refused'}
              return false
            end
            Permissions.setex(RedisInit.default, masq_key, 30.minutes.to_i, 'true') if masq_ok == 'store'
            @true_user = @api_user
            @linked_user.permission_scopes = @api_user.permission_scopes
            @api_user = @linked_user
            PaperTrail.request.whodunnit = "user:#{@true_user.global_id}:as:#{@api_user.global_id}"
          else
            api_error 400, {error: "Invalid masquerade attempt", user_id: as_user}
          end
        else
          api_error 400, {error: "Invalid masquerade attempt", user_id: as_user}
        end
      end
    else
      # Never log token values; only indicate presence/absence
      token_present = params['access_token'].present? && params['access_token'] != 'none'
      Rails.logger.debug("check_api_token: No token found for path #{request.path}, params token: #{token_present ? 'present' : 'absent'}, Authorization header: #{request.headers['Authorization'] ? 'present' : 'missing'}")
      # Log when no token is provided for API requests
      if request.path.match(/^\/api/) && !request.path.match(/^\/api\/v1\/token/)
        Rails.logger.debug("No token provided for API request: #{request.path}")
      end

      # TODO: timezone user setting
      Time.zone = "Mountain Time (US & Canada)"
      PaperTrail.request.whodunnit = user_for_paper_trail
    end
  end
  
  def user_for_paper_trail
    @api_user ? "user:#{@api_user.global_id}.#{params['controller']}.#{params['action']}" : "unauthenticated:#{request.remote_ip}.#{params['controller']}.#{params['action']}"
  end
  
  def replace_helper_params
    # Iterate over routing/id params to replace 'self' and 'my_org' placeholders.
    # We only modify simple string params (id, *_id), not nested hashes.
    # Use to_unsafe_h for read-only iteration to find keys needing replacement.
    raw = params.respond_to?(:to_unsafe_h) ? params.to_unsafe_h : params.to_h
    raw.each do |key_str, val|
      key_str = key_str.to_s
      next unless val.is_a?(String)
      next unless key_str == 'id' || key_str.match?(/_id$/)

      if @api_user && val == 'self'
        params[key_str] = @api_user.global_id
      end

      if @api_user && val == 'my_org' && Organization.manager?(@api_user)
        org = @api_user.organization_hash.select{|o| o['type'] == 'manager' }.sort_by{|o| o['added'] || Time.now.iso8601 }[0]
        params[key_str] = org['id'] if org
      end
    end
  end
  
  def require_api_token
    if !@api_user
      if !@token || @token.length == 0
        api_error 400, {error: "Access token required for this endpoint: missing token"}
      elsif !@api_device_id
        api_error 400, {error: "Access token required for this endpoint: couldn't find matching device"}
      else
        api_error 400, {error: "Access token required for this endpoint: couldn't find matching user"}
      end
    end
  end
  
  # Returns true if authorized. On failure, renders api_error(400, {...}) and returns false.
  # Callers must return after checking: "return unless allowed?(obj, 'permission')"
  def allowed?(obj, permission)
    # Permissable grants an action only when (rule's allowed_scopes & relevant_scopes) is non-empty.
    # Rules for supervision use ['full'] or ['full', 'basic_supervision'] — never the string '*'.
    # Defaulting to ['*'] therefore blocked valid calls. Some devices (integrations / dev keys)
    # omit permission_scopes and yield [] — treat blank like a normal browser session (full).
    # Redis token cache can also store a lone '*' (legacy wildcard) which still does not intersect
    # with 'full' in Permissable — normalize that to full as well. Preserve explicit 'none'.
    scopes = api_permission_scopes
    if !obj || !obj.allows?(@api_user, permission, scopes)
      res = {
        error: "Not authorized",
        unauthorized: true,
        permission: permission.to_s,
        effective_scopes: scopes
      }
      if obj
        res[:resource_class] = obj.class.name
        res[:resource_id] = obj.respond_to?(:global_id) ? obj.global_id : obj.id
      end
      if scopes.include?('none')
        res[:device_scopes_none] = true
      end
      if @api_user && @api_user.respond_to?(:valet_mode?) && @api_user.valet_mode?
        res[:valet_blocked] = true
      end
      if permission.instance_variable_get('@scope_rejected')
        res[:scope_limited] = true
        res[:scopes] = scopes
      end
      api_error 400, res
      false
    else
      true
    end
  end

  def admin_support_actions_allowed?(user=@api_user)
    user && Organization.admin_manager?(user) && !user.valet_mode?
  end
  
  def api_error(status_code, hash)
    hash[:status] = status_code
    if hash[:error].blank? && hash['error'].blank?
      hash[:error] = "unspecified error"
    end
    cachey = request.headers['X-Has-AppCache'] || params['nocache']
    # Rails 7: render json: expects a hash, not a pre-encoded string
    render json: hash, status: (cachey ? 200 : status_code)
  end
  
  def exists?(obj, ref_id=nil)
    if !obj
      res = {error: "Record not found"}
      res[:id] = ref_id if ref_id
      api_error 404, res
      false
    else
      true
    end
  end

  def set_browser_token_header
    response.headers['BROWSER_TOKEN'] = GoSecure.browser_token
  end

  # Normalized token scopes for Permissable (same rules as +allowed?+).
  def api_permission_scopes
    scopes = ['full']
    if @api_user && @api_device_id
      raw = @api_user.permission_scopes || []
      scopes = PermissionScopesNormalize.for_api(raw)
    end
    scopes
  end

  # X-INSTALLED-LINGOLINQ: client declares native app vs browser.
  # Only canonical values 'true' and 'false' (case-insensitive) are honored; other non-blank values are ignored
  # and params['installed_app'] is used for both app and browser classification.
  # When the effective header is 'true' or 'false', it wins over params for the corresponding signal.
  protected

  def installed_app_header
    request.headers['X-INSTALLED-LINGOLINQ'].to_s.strip.downcase
  end

  # 'true', 'false', or nil (nil: treat like absent header — use params).
  def installed_app_header_effective
    h = installed_app_header
    return nil if h.blank?
    return h if h == 'true' || h == 'false'
    nil
  end

  def installed_app?
    eh = installed_app_header_effective
    if eh
      eh == 'true'
    else
      params['installed_app'].to_s == 'true'
    end
  end

  def browser_client?
    eh = installed_app_header_effective
    return true if eh == 'false'
    return false if eh == 'true'
    params['installed_app'].to_s == 'false'
  end

  # System device (developer_key_id 0): app/browser flags via DeviceClassification + request.
  # +native_app_device+ — password/registration: pass installed_app?; SAML: pass config['app'].
  # +force+ — clear stored app/browser before applying (SAML ACS: authoritative refresh).
  def apply_device_classification!(device, native_app_device, force: false)
    device.settings ||= {}
    DeviceClassification.apply_to_settings!(
      device.settings,
      native_app_device: native_app_device,
      browser_client: browser_client?,
      force: force
    )
    device
  end

  # TODO: Remove after validating device classification in production (few days).
  def log_installed_client_signal(source)
    h = installed_app_header
    return if h.blank? && !params.key?('installed_app')
    h_log = h[0, 64]
    raw_p = params['installed_app']
    p_log = if raw_p.nil? || (raw_p.is_a?(String) && raw_p.empty?)
      nil
    elsif raw_p.is_a?(String)
      raw_p[0, 64]
    elsif raw_p.is_a?(ActionController::Parameters) || raw_p.is_a?(Hash)
      '#<Hash>'
    else
      "#<#{raw_p.class.name}>"
    end
    Rails.logger.info("[INSTALLED_HEADER] #{source} val=#{h_log.inspect} effective=#{installed_app_header_effective.inspect} params=#{p_log.inspect} installed_app=#{installed_app?} browser_client=#{browser_client?}")
  end

  private

  # FERPA/HIPAA accounting-of-disclosures for masquerade authorization.
  # Deduped per operator/target for 30 minutes so per-request as_user_id does
  # not flood the audit table. Returns :ok when a prior window is still open or
  # a new row persisted; :failed when the write did not persist (caller must
  # refuse the impersonation — fail-closed).
  def record_masquerade_audit!(operator:, target:, branch:)
    return :failed unless operator && target
    audit_key = "masq_audit/#{operator.global_id}/#{target.global_id}"
    return :ok if RedisInit.default.get(audit_key) == 'true'

    event = AuditEvent.log_command(operator.global_id, {
      'type' => 'masquerade',
      'command' => 'authorize',
      'acting_as' => target.global_id,
      'branch' => branch.to_s
    })
    return :failed unless event&.persisted?

    Permissions.setex(RedisInit.default, audit_key, 30.minutes.to_i, 'true')
    :ok
  rescue => e
    Rails.logger.error('masquerade audit log failed: ' + e.class.to_s)
    :failed
  end
end
