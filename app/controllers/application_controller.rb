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
    # Rails 7: Ensure params are accessible
    params.permit! if params.respond_to?(:permit!)
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
      Rails.logger.debug("check_api_token: No token found for path #{request.path}, params['access_token']: #{params['access_token']}, Authorization header: #{request.headers['Authorization'] ? 'present' : 'missing'}")
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
    # Rails 7: Ensure params are permitted for modification
    # After permit!, params should be mutable, but we need to iterate over the actual params
    # object keys, not a copy, to ensure modifications persist
    if params.respond_to?(:permit!)
      params.permit!
    end
    
    # Get all parameter keys as an array to iterate over (avoids modification during iteration)
    # Use to_unsafe_h to get all parameters including unpermitted ones
    param_keys = (params.respond_to?(:to_unsafe_h) ? params.to_unsafe_h : params.to_h).keys.map(&:to_s)
    
    # Iterate over the keys and modify params directly
    # This ensures we're modifying the actual params object, not a copy
    param_keys.each do |key_str|
      val = params[key_str]
      
      if @api_user && (key_str == 'id' || key_str.match(/_id$/)) && val == 'self'
        # Modify params directly - after permit! this should persist
        params[key_str] = @api_user.global_id
      elsif !@api_user && (key_str == 'id' || key_str.match(/_id$/)) && val == 'self'
        # If user_id=self but no @api_user, this will fail later, but don't crash here
        # The controller will handle the authentication error
      end
      
      if @api_user && (key_str == 'id' || key_str.match(/_id$/)) && val == 'my_org' && Organization.manager?(@api_user)
        org = @api_user.organization_hash.select{|o| o['type'] == 'manager' }.sort_by{|o| o['added'] || Time.now.iso8601 }[0]
        if org
          params[key_str] = org['id']
        end
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
end
