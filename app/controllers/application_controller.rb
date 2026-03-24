class ApplicationController < ActionController::Base
  # API-style auth endpoints (token, saml, oauth) are called via AJAX without CSRF token
  protect_from_forgery with: :null_session
  before_action :set_host
  before_action :check_api_token
  before_action :replace_helper_params
  before_action :load_domain
  before_action :set_paper_trail_whodunnit
  after_action :log_api_call
  before_bugsnag_notify :add_user_info_to_bugsnag
  
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

  def log_api_call
    time = @time ? (Time.now - @time) : nil
    ApiCall.log(@token, @api_user, request, response, time)
    true
  end
  
  def add_user_info_to_bugsnag(report)
    report.user = {
      id: GoSecure.sha512(request.remote_ip, 'user_ip')
    }
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
    scopes = ['*']
    if @api_user && @api_device_id
      scopes = @api_user.permission_scopes || []
    end
    if !obj || !obj.allows?(@api_user, permission, scopes)
      res = {error: "Not authorized", unauthorized: true}
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
    Rails.logger.info("[INSTALLED_HEADER] #{source} val=#{h.inspect} effective=#{installed_app_header_effective.inspect} params=#{params['installed_app'].inspect} installed_app=#{installed_app?} browser_client=#{browser_client?}")
  end
end
