class SessionController < ApplicationController
  before_action :require_api_token, :only => [:oauth_logout]
  
  def oauth
    error = nil
    response.headers.except! 'X-Frame-Options'
    authorized_user_id = nil
    if params['tmp_token']
      # Restoring code state after going through SAML auth process
      @access_token = RedisInit.default.get("token_tmp_#{params['tmp_token']}")
      config = JSON.parse(RedisInit.default.get("oauth_#{params['oauth_code']}")) rescue nil
      if @access_token && config
        user = config['authorized_user_id'] && User.find_by_path(config['authorized_user_id'])
        if user && user.state_2fa[:required]
          @code_plus_2fa = params['oauth_code']
        end

        @user_name = params['user_name']
        authorized_user_id = config['authorized_user_id']
        params['redirect_uri'] = config['redirect_uri']
        params['scope'] = config['scope']
        params['device_key'] = config['device_key']
        params['device_name'] = config['device_name']
        params['client_id'] = config['client_id']
      else
        error = 'resume_failed'
      end
    end
    key = DeveloperKey.find_by(:key => params['client_id'])
    if !key
      error = 'invalid_key'
    end
    if key && !key.valid_uri?(params['redirect_uri'])
      error = 'bad_redirect_uri'
    end
    @app_name = (key && key.name) || "the application"
    @app_icon = (key && key.icon_url) || "https://opensymbols.s3.amazonaws.com/libraries/arasaac/friends_3.png"
    if error
      @error = error
      render #:status => 400
    else
      scope = params['scope'] || 'read_profile'
      scope = scope.sub(/full/, '')
      config = {
        'client_id' => params['client_id'],
        'scope' => scope,
        'redirect_uri' => params['redirect_uri'] || key.redirect_uri,
        'device_key' => params['device_key'],
        'device_name' => params['device_name'],
        'authorized_user_id' => authorized_user_id,
        'app_name' => @app_name,
        'app_icon' => @app_icon
      }
      @config = config
      @scope_descriptors = scope.split(/:/).uniq.map{|s| Device::VALID_API_SCOPES[s] }.compact.join("\n")
      @scope_descriptors = "no permissions requested" if @scope_descriptors.blank?
      
      @code = GoSecure.nonce('oauth_code')
      Permissions.setex(RedisInit.default, "oauth_#{@code}", 1.hour.to_i, config.to_json, true)
      # render login page
      render
    end
  end
  
  def oauth_login
    error = nil
    user = nil
    authorized_user = nil
    response.headers.except! 'X-Frame-Options'
    config = JSON.parse(RedisInit.default.get("oauth_#{params['code']}")) rescue nil
    if !config
      error = 'code_not_found'
    else
      paramified_redirect = config['redirect_uri'] + (config['redirect_uri'].match(/\?/) ? '&' : '?')
      if params['reject']
        if config['redirect_uri'] == DeveloperKey.oob_uri
          redirect_to oauth_local_url(:error => 'access_denied')
        else
          redirect_to paramified_redirect + "error=access_denied", allow_other_host: true
        end
        return
      end
      authorized_user = User.find_by_path(config['authorized_user_id']) if config['authorized_user_id'] && params['resume']
      user = authorized_user
      stash_coppa_sentry_user(user) if user
      if !user
        auth_org = Organization.external_auth_for(params['username'])
        if auth_org
          # SAML auth required for this user
          redirect_to "/saml/init?org_id=#{auth_org.global_id}&device_id=saml_auth&embed=1&oauth_code=#{params['code']}"
          return
        end
        user = User.find_for_login(params['username'], (@domain_overrides || {})['org_id'], params['password'])
        stash_coppa_sentry_user(user) if user

        if user && user.valet_mode?
          error = 'invalid_login'
        elsif user && params['approve_token']
          id = params['approve_token'].split(/~/)[0]
          device = Device.find_by_global_id(id)
          if !device || !device.valid_token?(params['approve_token']) || !device.permission_scopes.include?('full')
            error = 'invalid_token'
          end
        elsif !user || !user.valid_password?(params['password'])
          error = 'invalid_login'
        end
      end
    end
    if !error && user && user.coppa_parental_consent_revoked?
      error = 'parental_consent_revoked'
    elsif !error && user && user.coppa_parental_consent_declined?
      error = 'parental_consent_declined'
    elsif !error && user && user.coppa_needs_parent_email?
      error = 'parent_email_required'
    elsif !error && user && user.coppa_parental_consent_pending?
      error = 'awaiting_parental_consent'
    end
    if !error && params['2fa_code']
      if user.valid_2fa?(params['2fa_code'])
        @valid_2fa = true
        config['approved_2fa'] = true
      else
        @code_plus_2fa = params['code']
        @invalid_2fa = true
        @app_name = (config && config['app_name']) || 'the application'
        @app_icon = (config && config['app_icon']) || "https://opensymbols.s3.amazonaws.com/libraries/arasaac/friends_3.png"
        @scope_descriptors = (config['scope'] || '').split(/:/).uniq.map{|s| Device::VALID_API_SCOPES[s] }.compact.join("\n")
        @scope_descriptors = "no permissions requested" if @scope_descriptors.blank?
        render :oauth, :status => 400
        return
      end
    end
    if error
      config ||= {}
      @app_name = (config && config['app_name']) || 'the application'
      @app_icon = (config && config['app_icon']) || "https://opensymbols.s3.amazonaws.com/libraries/arasaac/friends_3.png"
      @scope_descriptors = (config['scope'] || '').split(/:/).uniq.map{|s| Device::VALID_API_SCOPES[s] }.compact.join("\n")
      @scope_descriptors = "no permissions requested" if @scope_descriptors.blank?
      @code = params['code']
      @error = error
      render :oauth, :status => 400
    else
      do_render = false
      if !@valid_2fa && user.state_2fa[:required]
        # If the user is authenticated but missing 2fa, show the prompt
        config['authorized_user_id'] = user.global_id
        @code_plus_2fa = params['code']
        do_render = true
      end
      if !params['resume']
        user.password_used!
      end
      config['user_id'] = user.id.to_s
      Permissions.setex(RedisInit.default, "oauth_#{params['code']}", 1.hour.to_i, config.to_json, true)
      if do_render
        @app_name = (config && config['app_name']) || 'the application'
        @app_icon = (config && config['app_icon']) || "https://opensymbols.s3.amazonaws.com/libraries/arasaac/friends_3.png"
        @scope_descriptors = (config['scope'] || '').split(/:/).uniq.map{|s| Device::VALID_API_SCOPES[s] }.compact.join("\n")
        @scope_descriptors = "no permissions requested" if @scope_descriptors.blank?
        render :oauth
      elsif config['redirect_uri'] == DeveloperKey.oob_uri
        redirect_to oauth_local_url(:code => params['code'])
      else
        redirect_to paramified_redirect + "code=#{params['code']}", allow_other_host: true
      end
    end
  end
  
  def oauth_token
    key = DeveloperKey.find_by(:key => params['client_id'])
    error = nil
    if !key
      error = 'invalid_key'
    elsif key.secret != params['client_secret']
      error = 'invalid_secret'
    end
    
    config = JSON.parse(RedisInit.default.get("oauth_#{params['code']}")) rescue nil
    if !error
      if !config
        error = 'code_not_found'
      elsif !config['user_id']
        error = 'token_not_ready'
      end
    end
    
    if error
      api_error 400, {error: error}
    else
      RedisInit.default.del("oauth_#{params['code']}")
      device = Device.find_or_create_by(:user_id => config['user_id'], :developer_key_id => key.id, :device_key => config['device_key'])
      device.settings['name'] = config['device_name']
      device.settings['name'] += device.id.to_s if device.settings['name'] == 'browser'
      device.settings['name'] ||= (key.name || "Token") + " account"
      device.settings['permission_scopes'] = []
      (config['scope'] || '').split(/:/).uniq.each do |scope|
        device.settings['permission_scopes'].push(scope) if Device::VALID_API_SCOPES[scope]
      end
      device.generate_token!
      if device.settings['2fa'] && device.settings['2fa']['pending']
        if config['approved_2fa']
          device.confirm_2fa!(:approve, true)
        end
      end
      # Rails 7: render json: expects a hash, not a pre-encoded string
      render json: JsonApi::Token.as_json(device.user, device, :include_refresh => true)
    end
  end
  
  def oauth_logout
    Device.find_by_global_id(@api_device_id).logout!
    # Rails 7: render json: expects a hash, not a pre-encoded string
    render json: {logout: true}
  end
  
  def oauth_local
    response.headers.except! 'X-Frame-Options'
  end

  def oauth_token_refresh
    device = Device.find_by_global_id(@api_device_id)

    key = DeveloperKey.find_by(:key => params['client_id'])
    error = nil
    if !key
      error = 'invalid_key'
    elsif key.secret != params['client_secret']
      error = 'invalid_secret'
    elsif !device || device.developer_key_id != key.id
      error = 'invalid_token'
    end

    if error
      api_error 400, {error: error}
    elsif @api_user && device && device.token_type == :integration
      token, refresh_token = device.generate_from_refresh_token!(params['access_token'], params['refresh_token'])
      if token
        # Rails 7: render json: expects a hash, not a pre-encoded string
        render json: JsonApi::Token.as_json(@api_user, device, :include_refresh => true)
      else
        api_error 400, { error: "Invalid refresh token" }
      end
    else
      api_error 400, { error: "Could not find refresh token"}
    end
  end

  def auth_admin
    success = false
    if @api_user && @api_user.admin?
      admin_token = GoSecure.nonce('admin_token')
      cookies[:admin_token] = admin_token
      Permissions.setex(Permissable.permissions_redis, '/admin/auth/' + admin_token, 2.hours.to_i, @api_user.global_id, true)
      success = true
    end
    render json: {success: success}
  end

  def saml_metadata
    org = Organization.find_by_global_id(params['org_id']) if params['org_id']
    return render inline: "Error: no org specified" unless org
    return render inline: "Error: org not configured" unless org.settings['saml_metadata_url']
    settings = saml_settings(org)
    meta = OneLogin::RubySaml::Metadata.new
    xml = Nokogiri(meta.generate(settings))
    elem = xml.css('md|SPSSODescriptor')[0]
    root = xml.css('md|EntityDescriptor')[0]
    if elem && root
      root.add_namespace('mdui', "urn:oasis:names:tc:SAML:metadata:ui")
      ext = Nokogiri::XML::Node.new('md:Extensions', xml)
      uiinf = Nokogiri::XML::Node.new('mdui:UIInfo', xml)
      dn = Nokogiri::XML::Node.new('mdui:DisplayName', xml)
      dn['xml:lang'] = 'en'
      dn.content = "LingoLinq"
      desc = Nokogiri::XML::Node.new('mdui:Description', xml)
      desc['xml:lang'] = 'en'
      desc.content = "LingoLinq LingoLinqlication"
      logo = Nokogiri::XML::Node.new('mdui:Logo', xml)
      logo['xml:lang'] = 'en'
      logo['width'] = '64'
      logo['height'] = '64'
      logo.content = "#{request.protocol}#{request.host_with_port}/images/logo.png"
      uiinf << dn
      uiinf << desc
      uiinf << logo
      ext << uiinf
      elem.prepend_child(ext)
    end
    render :xml => xml.to_s, :content_type => "application/samlmetadata+xml"
  end

  def auth_lookup
    org = Organization.find_by_saml_issuer(params['ref'])
    org ||= Organization.find_by_global_id(params['ref'])
    if !org
      user = User.find_by_path(params['ref']) 
      user ||= User.find_by_email(params['ref'])[0]
      org = Organization.external_auth_for(user, true) if user
    end
    if org && org.settings['saml_metadata_url']
      url = "#{request.protocol}#{request.host_with_port}/saml/init?org_id=#{org.global_id}&device_id=#{params['device_id'] || 'saml_auth'}"
      if params['user_id']
        user = User.find_by_path(params['user_id'])
        return unless exists?(user, params['user_id'])
        return unless allowed?(user, 'link_auth')
        nonce = GoSecure.nonce('saml_tmp_token')
        Permissions.setex(RedisInit.default, "token_tmp_#{nonce}", 15.minutes.to_i, @token, true)
        url += "&user_id=#{user.global_id}&tmp_token=#{nonce}"
      end
      render json: {url: url}
    else
      api_error 400, {error: "no result found", ref: params['ref']}
    end
  end

  def saml_tmp_token
    if !@token
      return api_error 400, {error: 'no token available'}
    end
    nonce = GoSecure.nonce('saml_tmp_token')
    Permissions.setex(RedisInit.default, "token_tmp_#{nonce}", 15.minutes.to_i, @token, true)
    render json: {tmp_token: nonce}
  end

  def saml_redirect
    org = Organization.find_by_global_id(params['org_id'])
    if !org || !org.settings['saml_metadata_url']
    end
    render
  end

  def saml_start
    org = Organization.find_by_global_id(params['org_id'])
    return render inline: "Org missing" unless org
    return render inline: "Org not set up for external auth" unless org.settings['saml_metadata_url']

    return_params = {}
    if params['user_id']
      user = User.find_by_path(params['user_id'])
      if @api_user && user && user.allows?(@api_user, 'link_auth')
        return_params['user_id'] = user.global_id
        return_params['auth_user_id'] = @api_user.global_id
      else
        return render inline: "Could not connect external login to user account"
      end
    else
    end
    return_params['oauth_code'] = params['oauth_code'] if params['oauth_code']
    return_params['device_id'] = params['device_id'] || 'unnamed device'
    # Always boolean in Redis; cast so app=false is not truthy (Ruby strings are truthy).
    return_params['app'] = ActiveModel::Type::Boolean.new.cast(params['app'] || false)
    return_params['embed'] = true if params['embed']
    return_params['popout_id'] = params['popout_id'] if params['popout_id']

    code = GoSecure.nonce('saml_session_code')

    return_params['org_id'] = org.global_id
    Permissions.setex(RedisInit.default, "saml_#{code}", 1.hour.to_i, return_params.to_json, true)
    @saml_code = code

    request = OneLogin::RubySaml::Authrequest.new
    settings = saml_settings(org, code)
    redirect_to(request.create(settings, :RelayState => code), allow_other_host: true)
  end

  def saml_consume
    @error = nil
    code = params['code'] || params['RelayState']
    config = JSON.parse(RedisInit.default.get("saml_#{code}")) rescue nil
    if !config
      @error = code ? "Auth session lost" : "Missing auth session code"
      return render
    end
    org = Organization.find_by_global_id(config['org_id'])
    if !org
      @error = "Provider not found in the system" 
      return render
    end
    response = OneLogin::RubySaml::Response.new(params[:SAMLResponse], :settings => saml_settings(org, code))
    authenticated_user = nil
    if !response.is_valid?
      @error = "Authenticator signature failed"
      return render
    end

    email = response.attributes.fetch('email') || response.attributes['urn:oid:0.9.2342.19200300.100.1.3'] || response.attributes['urn:mace:dir:attribute-def:mail']
    user_name = response.attributes.fetch('uid') || response.attributes['urn:oid:0.9.2342.19200300.100.1.1'] || response.attributes['urn:mace:dir:attribute-def:uid']
    data = {external_id: response.name_id, issuer: response.issuers[0], email: email, user_name: user_name, roles: response.attributes.multi(:role)}
    if org != Organization.find_by_saml_issuer(data[:issuer])
      @error = "Org mismatch"
      return render
    end
    if config['user_id']
      # link the user to the external authentication
      auth_user = User.find_by_global_id(config['auth_user_id'])
      existing_user = User.find_by_global_id(config['user_id']) 
      if !existing_user || !existing_user.allows?(auth_user, 'link_auth')
        @error = "Mismatched user connection" 
        return render
      end
      org.link_saml_user(existing_user, data)
      authenticated_user = existing_user
    else
      authenticated_user = org.find_saml_user(data[:external_id], email)
      if !authenticated_user
        # If user isn't already connected, see if you can auto-connect by user name or email
        attached = org.attached_users('all')
        fallback_user = org.find_saml_alias(data[:user_name], data[:email])
        fallback_user ||= attached.find_by(user_name: user_name)
        if !fallback_user
          emails = attached.where(email_hash: User.generate_email_hash(data[:email]))
          fallback_user = emails[0] if emails.count == 1
        end
        if fallback_user
          org.link_saml_user(fallback_user, data)
          authenticated_user = fallback_user
        end
      end
      if !authenticated_user
        @error = "User not found in the system, please have your account admin connect your accounts (#{data[:user_name]})" 
        return render
      end
    end
    # We validate the SAML Response and check if the user already exists in the system
    if response.is_valid? && authenticated_user
      RedisInit.default.del("saml_#{code}")
      device = Device.find_or_create_by(:user_id => authenticated_user.id, :developer_key_id => 0, :device_key => config['device_id'] || 'unnamed device')
      native_app_device = ActiveModel::Type::Boolean.new.cast(config['app'])
      if config['oauth_code']
        # Redirect back to authorization for oauth flow
        RedisInit.default.del("saml_#{config['oauth_code']}")
        device.settings['auth_device'] = true
        device.save
        token = device.generate_token!(false)
        nonce = GoSecure.nonce('oauth_access_token')
        @temp_token = nonce
        Permissions.setex(RedisInit.default, "token_tmp_#{nonce}", 15.minutes.to_i, token, true)
        redirect_to oauth2_token_url(tmp_token: nonce, user_name: authenticated_user.user_name, oauth_code: config['oauth_code'])
      elsif config['embed']
        # For embed flow, show success and post it to the parent window
        device.settings['used_for_saml'] = true
        assert_session_device(device, authenticated_user, native_app_device, force_device_classification: true)
        @saml_data = data
        @authenticated_user = authenticated_user
        render
      elsif config['popout_id']
        # For popout flow, where a browser window opens to perform the auth,
        # show a success message and direct the user to return to the app
        device.settings['used_for_saml'] = true
        Permissions.setex(RedisInit.default, "token_popout_#{config['popout_id']}", 30.minutes.to_i, {user_id: authenticated_user.global_id, device_id: device.global_id}.to_json, true)
        assert_session_device(device, authenticated_user, native_app_device, force_device_classification: true)
        @saml_data = data
        @authenticated_user = authenticated_user
        @no_parent = true
        render
      elsif config['user_id']
        # For connection flow, redirect back to the user's profile page, all is done
        redirect_to "/#{authenticated_user.user_name}"
      else
        device.settings['used_for_saml'] = true
        # For standard flow, redirect to login page with temporary auth token
        nonce = GoSecure.nonce('saml_tmp_token')
        assert_session_device(device, authenticated_user, native_app_device, force_device_classification: true)
        access, refresh = device.tokens
        @temp_token = nonce
        Permissions.setex(RedisInit.default, "token_tmp_#{nonce}", 15.minutes.to_i, access, true)
        redirect_to "/login?auth-#{nonce}_#{authenticated_user.user_name}"
      end
    else
      @error = authenticated_user ? "Invalid authentication" : "No user found"
      return render
    end    
  end

  # Method to handle IdP initiated logouts
  def saml_idp_logout_request
    logout_request = OneLogin::RubySaml::SloLogoutrequest.new(params[:SAMLRequest]) rescue nil
    if !logout_request || !logout_request.is_valid?
      logger.error "IdP initiated LogoutRequest was not valid!"
      return render :inline => "Error: Invalid logout request"
    end
    org = Organization.find_by_saml_issuer(logout_request.issuer)
    return render inline: "No valid org found for issuer" unless org
    settings = saml_settings(org)
    logger.info "IdP initiated Logout for org #{org.global_id}"

    # Actually log out this session
    user = org.find_saml_user(logout_request.name_id)
    if user
      user.devices.each{|d| d.invalidate_keys! if d.settings['used_for_saml'] }
    end

    # Generate a response to the IdP.
    logout_request_id = logout_request.id
    logout_response = OneLogin::RubySaml::SloLogoutresponse.new.create(settings, logout_request_id, nil, :RelayState => params[:RelayState])
    redirect_to logout_response, allow_other_host: true
  end

  def token_wait
    if params['popout_id']
      json = RedisInit.default.get("token_popout_#{params['popout_id']}")
      auth = JSON.parse(json) rescue nil
      user = auth && User.find_by_global_id(auth['user_id'])
      device = auth && Device.find_by_global_id(auth['device_id'])
      if user && device && user == device.user
        RedisInit.default.del("token_popout_#{params['popout_id']}")
        # Rails 7: render json: expects a hash, not a pre-encoded string
        render json: JsonApi::Token.as_json(user, device)
      else
        return render json: {error: 'not found'}
      end
    else
      api_error 400, {error: 'popout_id required'}
    end
  end

  def token
    set_browser_token_header
    if params['grant_type'] == 'password'
      pending_u = User.find_for_login(params['username'], (@domain_overrides || {})['org_id'], params['password'], true)
      auth_org = Organization.external_auth_for(params['username'])
      if auth_org
        return render json: {auth_redirect: "#{request.protocol}#{request.host_with_port}/saml/init?org_id=#{auth_org.global_id}&device_id=#{params['device_id']}"}
      end
      u = nil
      if params['client_id'] == 'browser' && GoSecure.valid_browser_token?(params['client_secret'])
        u = pending_u
        stash_coppa_sentry_user(u) if u
      else
        return api_error 400, { error: "Invalid client_secret for client_id", client_id: params['client_id'] }
      end
      if u && u.valid_password?(params['password'])
        if u.coppa_parental_consent_revoked?
          return api_error 400, {error: 'parental consent revoked', coppa_parental_consent_revoked: true}
        end
        if u.coppa_parental_consent_declined?
          return api_error 400, {error: 'parental consent declined', coppa_parental_consent_declined: true}
        end
        if u.coppa_needs_parent_email?
          return api_error 400, {error: 'parent email required', coppa_parent_email_required: true}
        end
        if u.coppa_parental_consent_pending?
          return api_error 400, {error: 'awaiting parental consent', coppa_parental_consent_pending: true}
        end
        # generated based on request headers
        device_key = request.headers['X-Device-Id'] || params['device_id'] || 'default'

        log_installed_client_signal('session/token')
        native_app_device = installed_app?
        d = Device.find_or_create_by(:user_id => u.id, :developer_key_id => 0, :device_key => device_key)
        d.save! if d.new_record?
        assert_session_device(d, u, native_app_device)

        u.password_used!
        token_json = JsonApi::Token.as_json(u, d)
        # Log only non-sensitive metadata; never log tokens (security)
        Rails.logger.info("Token issued for user #{u.global_id}: keys=#{token_json.keys.join(',')}")
        # Rails 7: render json: expects a hash, not a pre-encoded string
        render json: token_json
      else
        old_key = nil
        begin
          old_key = OldKey.find_by(:type => 'user', :key => params['username'])
        rescue ActiveRecord::StatementInvalid => e
          ActiveRecord::Base.connection.verify!
          old_key = OldKey.find_by(:type => 'user', :key => params['username'])
        end

        user = old_key && old_key.record
        if user && user.valid_password?(params['password'])
          api_error 400, { error: "User name was changed", user_name: user.user_name}
        else
          api_error 400, { error: "Invalid authentication attempt" }
        end
      end
    else
      api_error 400, { error: "Invalid authentication approach" }
    end
  end
  
  def token_check
    set_browser_token_header
    json = nil
    begin
      if @api_user
        params['access_token'] = @token if @token && @tmp_token
        device = Device.find_by_global_id(@api_device_id)
        valid = device && device.valid_token?(params['access_token'], request.headers['X-LingoLinq-Version'])
        expired = device && (device.instance_variable_get('@expired_keys') || {})[params['access_token']]
        needs_refresh = device && (device.instance_variable_get('@refreshable_keys') || {})[params['access_token']]
        
        # Safely get global integrations
        global_integrations = []
        begin
          if UserIntegration.respond_to?(:global_integrations)
            integrations = UserIntegration.global_integrations
            # Ensure integrations is a Hash before calling .keys to prevent NoMethodError
            if integrations && integrations.is_a?(Hash)
              global_integrations = integrations.keys
            else
              global_integrations = []
            end
          end
        rescue => e
          Rails.logger.warn("Error getting global_integrations: #{e.message}")
          global_integrations = []
        end
        
        # Safely get current sale
        sale = nil
        begin
          sale = Purchasing.current_sale if Purchasing.respond_to?(:current_sale)
        rescue => e
          Rails.logger.warn("Error getting current_sale: #{e.message}")
        end
        
        json = {
          authenticated: valid, 
          expired: !!(expired || needs_refresh),
          user_name: @api_user.user_name, 
          user_id: @api_user.global_id,
          device_id: @api_device_id,
          modeling_session: @api_user.valet_mode?,
          avatar_image_url: (valid ? @api_user.generated_avatar_url : nil),
          scopes: device && device.permission_scopes,
          sale: sale,
          ws_url: ENV['LLWEBSOCKET_URL'],
          global_integrations: global_integrations,
        }
        if params['2fa_code']
          if device
            begin
              json[:valid_2fa] = !!device.confirm_2fa!(params['2fa_code'])
              json[:scopes] = device.permission_scopes
              json[:cooldown_2fa] = device.settings['2fa']['cooldown'] if device.settings && device.settings['2fa'] && device.settings['2fa']['cooldown']
            rescue => e
              Rails.logger.warn("Error processing 2FA: #{e.message}")
              json[:valid_2fa] = false
              json[:scopes] = nil
              json[:error] = '2FA validation failed'
              json[:error_status] = 401
            end
          else
            # Security: If 2FA code is provided but device is missing, this is an error condition
            # Previously this would silently ignore the 2FA code, potentially bypassing security
            Rails.logger.error("2FA code provided but device not found for user #{@api_user.global_id}")
            json[:valid_2fa] = false
            json[:scopes] = nil
            json[:error] = 'Device not found for 2FA validation'
            json[:error_status] = 401
          end
        end
        # Ensure 2FA failure (invalid code or missing device) always returns 401 and is not considered authenticated.
        # Explicitly set authenticated false and clear scopes so clients don't use token-valid but 2FA-failed state.
        if params['2fa_code'] && json[:valid_2fa] != true
          json[:authenticated] = false
          json[:scopes] = nil
          json[:error] ||= '2FA validation failed'
          json[:error_status] = 401
        end
        if params['include_token'] && device
          json[:token] = JsonApi::Token.as_json(@api_user, device)
        end
        json[:can_refresh] = true if needs_refresh && !expired
      else
        # Safely get global integrations and sale for unauthenticated response
        global_integrations = []
        begin
          if UserIntegration.respond_to?(:global_integrations)
            integrations = UserIntegration.global_integrations
            # Ensure integrations is a Hash before calling .keys to prevent NoMethodError
            if integrations && integrations.is_a?(Hash)
              global_integrations = integrations.keys
            else
              global_integrations = []
            end
          end
        rescue => e
          Rails.logger.warn("Error getting global_integrations: #{e.message}")
          global_integrations = []
        end
        
        sale = nil
        begin
          sale = Purchasing.current_sale if Purchasing.respond_to?(:current_sale)
        rescue => e
          Rails.logger.warn("Error getting current_sale: #{e.message}")
        end
        
        json = {
          authenticated: false, 
          sale: sale,
          ws_url: ENV['LLWEBSOCKET_URL'],
          global_integrations: global_integrations
        }
      end
    rescue StandardError => e
      Rails.logger.error("Error in token_check: #{e.class.name}: #{e.message}")
      Rails.logger.error(e.backtrace.join("\n"))
      # Use 4xx for client/permission-style errors so clients can distinguish from server errors
      client_error = e.is_a?(ArgumentError) || e.message.to_s.match?(/not authorized|permission|unauthorized|invalid token|invalid 2fa/i)
      error_status = client_error ? 401 : 500
      error_message = client_error ? e.message : "Internal server error"
      json = {
        authenticated: false,
        error: error_message,
        error_status: error_status,
        sale: nil,
        ws_url: ENV['LLWEBSOCKET_URL'],
        global_integrations: []
      }
    end

    # Single render point to avoid double render errors
    # Note: render json: automatically calls .to_json, so don't call it explicitly
    # error_status is set explicitly for 2FA (401) and server errors (500)
    if json
      status_code = json[:error_status]
      if status_code.nil? && json[:error]
        status_code = (json[:error] == 'Internal server error') ? 500 : 401
      end
      status_code ||= 200
      # Ensure we never return 200 when an error message is present (safety for any path that set :error but not :error_status)
      status_code = 500 if json[:error] && status_code == 200
      render json: json, status: status_code
    else
      render json: {authenticated: false, error: "Unknown error"}, status: 500
    end
  end

  def heartbeat
    render json: {active: true}
  end

  def health
    # Lightweight health check for Render/orchestrators: verify DB and Redis
    ActiveRecord::Base.connection.execute('SELECT 1')
    RedisInit.default.ping
    render json: {ok: true}, status: 200
  rescue => e
    Rails.logger.warn("Health check failed: #{e.message}")
    render json: {ok: false}, status: 503
  end

  def google_start
    unless google_sso_available?
      return render inline: 'Google sign-in is not available', status: :not_found
    end
    flow = params['flow'].to_s == 'register' ? 'register' : 'login'
    code = GoSecure.nonce('google_oauth_state')
    config = {
      'flow' => flow,
      'device_id' => params['device_id'] || request.headers['X-Device-Id'] || 'default',
      'popout_id' => params['popout_id'],
      'app' => ActiveModel::Type::Boolean.new.cast(params['app'] || false)
    }
    return_origin = params['return_origin'].to_s.strip
    if flow == 'register'
      registration_type = params['registration_type'].to_s.strip
      allowed_registration_types = %w[communicator therapist parent teacher other]
      registration_type = 'communicator' unless allowed_registration_types.include?(registration_type)
      config['registration_type'] = registration_type
      config['user_name'] = params['user_name'].to_s.strip
      config['terms_agree'] = ActiveModel::Type::Boolean.new.cast(params['terms_agree'])
      country = LingoLinq::Jurisdiction.trusted_country(params['country'])
      under_16 = ActiveModel::Type::Boolean.new.cast(params['under_16'])
      config['country'] = country
      config['under_16'] = under_16
      config['locale'] = sanitize_google_signup_locale(params['locale'])
      if JsonApi::Json.coppa_parental_consent_enabled?
        birth_month, birth_year = User.signup_birth_from_params(params)
        classified_under_13 = User.age_under_threshold?(
          birth_month: birth_month,
          birth_year: birth_year,
          age: JsonApi::Json::DEFAULT_COPPA_CONSENT_AGE
        )
        if classified_under_13.nil?
          return redirect_to google_frontend_redirect('/register?google_error=birthdate_required', return_origin.present? ? { 'return_origin' => return_origin } : nil), allow_other_host: true
        end
        if classified_under_13
          return redirect_to google_frontend_redirect('/register?google_error=coppa_age', return_origin.present? ? { 'return_origin' => return_origin } : nil), allow_other_host: true
        end
        config['birth_month'] = birth_month.to_i
        config['birth_year'] = birth_year.to_i
      end
      # EU under-16: never carry product-improvement opt-in through Google signup.
      eu_under_16 = !!(country && LingoLinq::Jurisdiction.eu?(country) && under_16)
      pi = ActiveModel::Type::Boolean.new.cast(params['product_improvement_opt_in'])
      config['product_improvement_opt_in'] = eu_under_16 ? false : pi
      unless config['terms_agree']
        return redirect_to google_frontend_redirect('/register?google_error=terms_required', return_origin.present? ? { 'return_origin' => return_origin } : nil), allow_other_host: true
      end
    end
    origin = GoogleOAuth.frontend_origin(request, return_origin.present? ? { 'return_origin' => return_origin } : nil)
    config['return_origin'] = origin if origin.present?
    GoogleOAuth.store_state(code, config)
    redirect_to GoogleOAuth.authorization_url(request, code, config), allow_other_host: true
  end

  def google_callback
    unless google_sso_available?
      return redirect_to google_frontend_redirect('/login', nil), allow_other_host: true
    end
    if params['error'].present?
      return redirect_to google_auth_error_redirect('access_denied', nil), allow_other_host: true
    end
    config = GoogleOAuth.fetch_state(params['state'])
    unless config
      return redirect_to google_auth_error_redirect('session_expired', nil), allow_other_host: true
    end
    GoogleOAuth.clear_state(params['state'])
    begin
      payload = GoogleOAuth.exchange_code(request, params['code'], config)
    rescue GoogleOAuth::Error
      return redirect_to google_auth_error_redirect('auth_failed', config), allow_other_host: true
    end
    profile = GoogleOAuth.profile_from_payload(payload)
    unless profile[:sub].present? && profile[:email_verified] && profile[:email].present?
      return redirect_to google_auth_error_redirect('unverified_email', config), allow_other_host: true
    end

    if config['flow'] == 'register'
      nonce = GoSecure.nonce('google_link')
      GoogleOAuth.store_link(nonce, google_link_config(profile, config, [], 'signup_complete'))
      return redirect_to google_frontend_redirect("/register?google_signup=#{nonce}", config), allow_other_host: true
    end

    linked_users = User.find_all_by_google_sub(profile[:sub]).reject(&:google_sso_blocked?)
    unlinked_candidates = google_unlinked_email_candidates(profile, linked_users)
    if linked_users.length > 1
      nonce = GoSecure.nonce('google_link')
      GoogleOAuth.store_link(nonce, google_link_config(profile, config, linked_users, 'account_select', unlinked_candidates: unlinked_candidates, allow_manual_link: true))
      return redirect_to google_frontend_redirect("/login?google_link=#{nonce}", config), allow_other_host: true
    elsif linked_users.length == 1
      return google_finish_login(linked_users.first, config) unless linked_users.first.google_sso_blocked?
      return redirect_to google_auth_error_redirect('org_sso_required', config), allow_other_host: true
    end

    candidates = User.users_by_verified_email(profile[:email]).reject(&:google_sso_blocked?)
    if candidates.length > 1
      nonce = GoSecure.nonce('google_link')
      GoogleOAuth.store_link(nonce, google_link_config(profile, config, candidates, 'email_match'))
      return redirect_to google_frontend_redirect("/login?google_link=#{nonce}", config), allow_other_host: true
    elsif candidates.length == 1
      nonce = GoSecure.nonce('google_link')
      GoogleOAuth.store_link(nonce, google_link_config(profile, config, candidates, 'email_match', single_candidate: true))
      return redirect_to google_frontend_redirect("/login?google_link=#{nonce}", config), allow_other_host: true
    end

    nonce = GoSecure.nonce('google_link')
    GoogleOAuth.store_link(nonce, google_link_config(profile, config, [], 'manual_link'))
    redirect_to google_frontend_redirect("/login?google_link=#{nonce}", config), allow_other_host: true
  end

  def google_link_candidates
    unless google_sso_available?
      return api_error 404, {error: 'not available'}
    end
    link = GoogleOAuth.fetch_link(params['nonce'])
    unless link
      return api_error 404, {error: 'session_expired'}
    end
    candidates = google_link_candidates_for(link)
    unlinked_candidates = google_link_unlinked_candidates_for(link)
    selected_user_name = candidates.length == 1 ? candidates[0][:user_name] : nil
    render json: {
      mode: link['mode'] || 'email_match',
      candidates: candidates,
      unlinked_candidates: unlinked_candidates,
      allow_manual_link: !!link['allow_manual_link'],
      email: link['email'],
      single_candidate: !!link['single_candidate'] || candidates.length == 1,
      selected_user_name: selected_user_name
    }
  end

  def google_link_complete
    unless google_sso_available?
      return api_error 404, {error: 'not available'}
    end
    link = GoogleOAuth.fetch_link(params['nonce'])
    unless link
      return api_error 400, {error: 'session_expired'}
    end
    mode = link['mode'] || 'email_match'
    user = resolve_google_link_user(link, params)
    return if performed?

    if mode == 'account_select'
      linked_ids = link['candidate_user_ids'] || []
      if linked_ids.include?(user.global_id)
        if user.google_sso_blocked?
          return api_error 403, {error: 'org_sso_required'}
        end
        config = google_link_session_config(link)
        GoogleOAuth.clear_link(params['nonce'])
        return finish_google_link_json(user, config)
      end

      unlinked_ids = link['unlinked_candidate_user_ids'] || []
      linking_allowed = unlinked_ids.include?(user.global_id) || !!link['allow_manual_link']
      unless linking_allowed
        return api_error 400, {error: 'invalid_user'}
      end
    end

    unless user && user.valid_password?(params['password'].to_s)
      return api_error 401, {error: 'invalid_password'}
    end
    if user.google_sso_blocked?
      return api_error 403, {error: 'org_sso_required'}
    end
    user.link_google!(link['sub'], email: link['email'], name: link['name'])
    user.password_used!
    config = google_link_session_config(link)
    GoogleOAuth.clear_link(params['nonce'])
    finish_google_link_json(user, config)
  end

  def google_signup_candidates
    unless google_sso_available?
      return api_error 404, {error: 'not available'}
    end
    link = GoogleOAuth.fetch_link(params['nonce'])
    unless link
      return api_error 404, {error: 'session_expired'}
    end
    unless ['manual_link', 'signup_complete'].include?(link['mode'])
      return api_error 400, {error: 'invalid_mode'}
    end
    if link['mode'] == 'manual_link'
      link['mode'] = 'signup_complete'
      GoogleOAuth.store_link(params['nonce'], link)
    end
    country = link['country']
    under_16 = !!link['under_16']
    eu_under_16 = !!(country && LingoLinq::Jurisdiction.eu?(country) && under_16)
    render json: {
      email: link['email'],
      name: link['name'],
      user_name: link['user_name'],
      registration_type: link['registration_type'] || 'communicator',
      terms_agree: !!link['terms_agree'],
      product_improvement_opt_in: eu_under_16 ? false : !!link['product_improvement_opt_in'],
      show_product_improvement_opt_in: !eu_under_16
    }
  end

  def google_signup_complete
    unless google_sso_available?
      return api_error 404, {error: 'not available'}
    end
    link = GoogleOAuth.fetch_link(params['nonce'])
    unless link && link['mode'] == 'signup_complete'
      return api_error 400, {error: 'session_expired'}
    end
    unless ActiveModel::Type::Boolean.new.cast(params['terms_agree'])
      return api_error 400, {error: 'terms_required'}
    end
    unless ActiveModel::Type::Boolean.new.cast(link['terms_agree'])
      return api_error 400, {error: 'terms_required'}
    end
    profile = {
      sub: link['sub'],
      email: link['email'],
      name: link['name']
    }
    begin
      country = link['country']
      under_16 = !!link['under_16']
      eu_under_16 = !!(country && LingoLinq::Jurisdiction.eu?(country) && under_16)
      pi = ActiveModel::Type::Boolean.new.cast(
        params['product_improvement_opt_in'].presence || link['product_improvement_opt_in']
      )
      user = User.create_from_google_signup!(
        profile,
        user_name: params['user_name'].presence || link['user_name'],
        registration_type: params['registration_type'].presence || link['registration_type'],
        terms_agree: params['terms_agree'].presence || link['terms_agree'],
        product_improvement_opt_in: eu_under_16 ? false : pi,
        country: country,
        under_16: under_16,
        signup_name: sanitize_google_signup_name(params['signup_name'].presence || link['signup_name']),
        locale: link['locale'],
        birth_month: link['birth_month'],
        birth_year: link['birth_year']
      )
    rescue GoogleOAuth::Error => e
      error = e.message == 'user_creation_failed' ? 'registration_failed' : e.message
      return api_error 400, {error: error}
    end
    UserBoardProvisioner.provision_for(user)
    unless user.coppa_parental_consent_pending?
      UserMailer.schedule_delivery(:confirm_registration, user.global_id)
      UserMailer.schedule_delivery(:new_user_registration, user.global_id)
      ExternalTracker.track_new_user(user)
    else
      UserMailer.schedule_delivery(:parental_consent_request, user.global_id)
    end
    config = google_link_session_config(link)
    GoogleOAuth.clear_link(params['nonce'])
    finish_google_link_json(user, config)
  end

  def status
    # Security: only expose internal diagnostics to authenticated API users.
    # Unauthenticated callers get a minimal response (use /api/v1/health for orchestrators).
    unless @api_user
      render json: {active: true}
      return
    end

    last_id = (Board.last || OpenStruct.new(id: 5)).id
    Board.find_by(id: rand(last_id))
    user_id = (User.last || OpenStruct.new(id: 9)).id
    LogSession.where(user_id: user_id).count
    ids = Board.where(public: true).limit(10).map(&:global_id)
    RedisInit.default.incr('status_checks')
    RedisInit.default.del('status_checks') if RedisInit.default.get('status_checks').to_i > 50000
    RedisInit.default.get('trends_tracked_recently')
    if ENV['QUEUE_MAX']
      ['slow', 'default', 'priority'].each do |q|
        if Resque.redis.llen("queue:#{q}") > ENV['QUEUE_MAX'].to_i * 2
          render json: {danger: true, reason: 'queue'}
          return
        end
      end
    end
    render json: {active: true}
  end

  protected
  def google_sso_available?
    GoogleOAuth.enabled?
  end

  def sanitize_google_signup_name(name)
    s = name.to_s.gsub(/[\x00-\x1F\x7F]/, '').strip
    return nil if s.blank?
    s[0, 200]
  end

  def sanitize_google_signup_locale(locale)
    s = locale.to_s.strip.downcase
    s.match?(/\A[a-z]{2,8}\z/) ? s : 'en'
  end

  def google_auth_error_redirect(error_code, config = nil)
    google_frontend_redirect("/login?google_error=#{CGI.escape(error_code.to_s)}", config)
  end

  def google_finish_login(user, config)
    if user.coppa_parental_consent_revoked?
      return redirect_to google_frontend_redirect('/login?coppa_revoked=1', config), allow_other_host: true
    end
    if user.coppa_parental_consent_declined?
      return redirect_to google_frontend_redirect('/login?coppa_declined=1', config), allow_other_host: true
    end
    if user.coppa_needs_parent_email?
      return redirect_to google_frontend_redirect('/login?coppa_parent_email=1', config), allow_other_host: true
    end
    if user.coppa_parental_consent_pending?
      return redirect_to google_frontend_redirect('/register?coppa_waiting=1', config), allow_other_host: true
    end
    if user.google_sso_blocked?
      return redirect_to google_auth_error_redirect('org_sso_required', config), allow_other_host: true
    end
    data = google_login_response(user, config)
    if data[:popout_id]
      return redirect_to google_frontend_redirect("/login?google_popout=#{data[:popout_id]}", config), allow_other_host: true
    end
    redirect_to google_frontend_redirect(data[:redirect], config), allow_other_host: true
  end

  def google_frontend_redirect(path, config = nil)
    GoogleOAuth.frontend_redirect_url(request, config, path)
  end

  def google_link_config(profile, config, candidates, mode, single_candidate: false, unlinked_candidates: [], allow_manual_link: false)
    link = {
      'mode' => mode,
      'sub' => profile[:sub],
      'email' => profile[:email],
      'name' => profile[:name],
      'candidate_user_ids' => candidates.map(&:global_id),
      'candidates' => candidates.map { |u| google_link_user_candidate(u, include_user_id: true).stringify_keys },
      'flow' => config['flow'],
      'device_id' => config['device_id'],
      'popout_id' => config['popout_id'],
      'app' => config['app'],
      'return_origin' => config['return_origin'],
      'registration_type' => config['registration_type'],
      'user_name' => config['user_name'],
      'terms_agree' => config['terms_agree'],
      'product_improvement_opt_in' => config['product_improvement_opt_in'],
      'country' => config['country'],
      'under_16' => config['under_16'],
      'signup_name' => config['signup_name'],
      'locale' => config['locale'],
      'birth_month' => config['birth_month'],
      'birth_year' => config['birth_year']
    }
    link['single_candidate'] = true if single_candidate
    if unlinked_candidates.any?
      link['unlinked_candidate_user_ids'] = unlinked_candidates.map(&:global_id)
      link['unlinked_candidates'] = unlinked_candidates.map { |u| google_link_user_candidate(u, include_user_id: true).stringify_keys }
    end
    link['allow_manual_link'] = true if allow_manual_link
    link
  end

  def google_unlinked_email_candidates(profile, linked_users)
    User.users_by_verified_email(profile[:email]).reject(&:google_sso_blocked?).reject do |user|
      linked_users.any? { |linked| linked.id == user.id }
    end
  end

  def google_link_user_display_name(user)
    # display_name, not `name.presence || display_user_name`: that guard cannot
    # filter the legacy "No name" sentinel, which is a non-empty string.
    user.display_name
  end

  def google_link_user_candidate(user, include_user_id: false)
    entry = {
      user_name: user.user_name,
      display_name: google_link_user_display_name(user)
    }
    entry[:user_id] = user.global_id if include_user_id
    entry
  end

  def google_link_candidates_for(link)
    candidates = google_link_candidates_from_stored(link)
    if candidates.empty?
      users = User.find_all_by_global_id(link['candidate_user_ids'] || [])
      candidates = users.map { |u| google_link_user_candidate(u) }
      if candidates.empty? && (link['candidate_user_ids'] || []).length == 1
        user = User.find_by_global_id(link['candidate_user_ids'][0])
        candidates = [google_link_user_candidate(user)] if user
      end
    end
    if candidates.empty?
      mode = link['mode'] || 'email_match'
      if mode == 'email_match' && link['email'].present?
        candidates = User.users_by_verified_email(link['email']).reject(&:google_sso_blocked?).map do |u|
          google_link_user_candidate(u)
        end
      elsif mode == 'account_select' && (link['candidate_user_ids'] || []).any?
        users = User.find_all_by_global_id(link['candidate_user_ids'])
        candidates = users.map { |u| google_link_user_candidate(u) }
      end
    end
    candidates.uniq { |c| c[:user_name] }
  end

  def google_link_unlinked_candidates_for(link)
    candidates = google_link_candidates_from_stored(link, 'unlinked_candidates')
    if candidates.empty?
      users = User.find_all_by_global_id(link['unlinked_candidate_user_ids'] || [])
      candidates = users.map { |u| google_link_user_candidate(u) }
    end
    if candidates.empty? && link['mode'] == 'account_select' && link['email'].present?
      linked_ids = link['candidate_user_ids'] || []
      candidates = User.users_by_verified_email(link['email']).reject(&:google_sso_blocked?).reject do |user|
        linked_ids.include?(user.global_id)
      end.map { |u| google_link_user_candidate(u) }
    end
    candidates.uniq { |c| c[:user_name] }
  end

  def google_link_candidates_from_stored(link, key = 'candidates')
    stored = link[key]
    return [] unless stored.is_a?(Array)

    stored.filter_map do |c|
      user_name = (c['user_name'] || c[:user_name]).to_s.strip
      next if user_name.blank?

      entry = {user_name: user_name}
      display_name = (c['display_name'] || c[:display_name]).to_s.strip
      entry[:display_name] = display_name if display_name.present?
      entry
    end
  end

  def google_link_session_config(link)
    {
      'flow' => link['flow'],
      'device_id' => link['device_id'],
      'popout_id' => link['popout_id'],
      'app' => link['app'],
      'return_origin' => link['return_origin']
    }
  end

  def resolve_google_link_user(link, params)
    mode = link['mode'] || 'email_match'
    user = nil
    if mode == 'account_select'
      user_name = params['user_name'].to_s.strip
      if user_name.blank?
        api_error(400, {error: 'username_required'})
        return nil
      end
      user = User.find_by(user_name: user_name)
      unless user
        api_error(400, {error: 'invalid_user'})
        return nil
      end
      linked_ids = link['candidate_user_ids'] || []
      unlinked_ids = link['unlinked_candidate_user_ids'] || []
      if linked_ids.include?(user.global_id) || unlinked_ids.include?(user.global_id) || link['allow_manual_link']
        return user
      end
      api_error(400, {error: 'invalid_user'})
      return nil
    end
    if mode == 'manual_link'
      user_name = params['user_name'].to_s.strip
      if user_name.blank?
        api_error(400, {error: 'username_required'})
        return nil
      end
      user = User.find_by(user_name: user_name)
      unless user
        api_error(400, {error: 'invalid_user'})
        return nil
      end
      return user
    end
    if params['user_name'].present?
      user = User.find_by(user_name: params['user_name'].to_s.strip)
      unless user && (link['candidate_user_ids'] || []).include?(user.global_id)
        api_error(400, {error: 'invalid_user'})
        return nil
      end
    elsif link['single_candidate'] && (link['candidate_user_ids'] || []).length == 1
      user = User.find_by_global_id(link['candidate_user_ids'][0])
    else
      api_error(400, {error: 'username_required'})
      return nil
    end
    user
  end

  def finish_google_link_json(user, config)
    device_key = config['device_id'] || 'default'
    native_app_device = ActiveModel::Type::Boolean.new.cast(config['app'])
    device = Device.find_or_create_by(user_id: user.id, developer_key_id: 0, device_key: device_key)
    device.save! if device.new_record?
    assert_session_device(device, user, native_app_device, force_device_classification: true)
    render json: {token: JsonApi::Token.as_json(user, device, :include_refresh => true)}
  end

  def google_login_response(user, config)
    device_key = config['device_id'] || 'default'
    native_app_device = ActiveModel::Type::Boolean.new.cast(config['app'])
    device = Device.find_or_create_by(user_id: user.id, developer_key_id: 0, device_key: device_key)
    device.save! if device.new_record?
    assert_session_device(device, user, native_app_device, force_device_classification: true)

    if config['popout_id'].present?
      Permissions.setex(
        RedisInit.default,
        "token_popout_#{config['popout_id']}",
        30.minutes.to_i,
        {user_id: user.global_id, device_id: device.global_id}.to_json,
        true
      )
      return {popout_id: config['popout_id']}
    end

    nonce = GoSecure.nonce('google_tmp_token')
    access, _refresh = device.tokens
    Permissions.setex(RedisInit.default, "token_tmp_#{nonce}", 15.minutes.to_i, access, true)
    {redirect: "/login?auth-#{nonce}_#{user.user_name}", tmp_token: nonce}
  end

  # native_app_device: true when this auth flow is a native/installed client — from password token
  # (installed_app?) or SAML (normalized config['app']). When true, request browser signals must not downgrade
  # the device to :browser (SAML ACS posts often lack the install header).
  # +force_device_classification+ — SAML: drop stale app/browser before re-applying from flow + request.
  def assert_session_device(d, u, native_app_device, force_device_classification: false)
    d.settings ||= {}
    store_user_data = !u.cookies_opted_out?
    d.settings['ip_address'] = store_user_data ? request.remote_ip : nil
    d.settings['user_agent'] = store_user_data ? request.headers['User-Agent'] : nil
    d.settings['system'] ||= params['system']
    d.settings['system_version'] ||= params['system_version']
    d.settings['mobile'] = params['mobile'] == 'true' if params['mobile'] != nil
    apply_device_classification!(d, native_app_device, force: force_device_classification)
    long_token = params['long_token'] && params['long_token'] != 'false'
    if native_app_device
      long_token = true
      app_devices = Device.where(user_id: u.id, developer_key_id: 0).select{|d| d.token_type == :app && !d.settings['temporary_device'] }
      if app_devices.length > 0 && u.eval_account?
        # Eval accounts are only allowed to log in on one device at a time.
        # If they log into a new device. prompt them to see if they want to
        # auto-log-out on the other device, or cancel this login.
        temporary_device = true
      end
    end

    d.settings['temporary_device'] = true if temporary_device
    d.settings.delete('temporary_device') unless u.eval_account?
    d.settings.delete('temporary_device') if u.valet_mode?
    d.settings.delete('auth_device')
    d.settings['valet'] = !!u.valet_mode?
    d.settings['valet_long_term'] = !!(u.valet_mode? && u.settings['valet_long_term'])
    if u.valet_mode? && !u.settings['valet_long_term']
      long_token = false
    end
    d.generate_token!(long_token)
  end

  def saml_settings(org=nil, code=nil)
    settings = OneLogin::RubySaml::Settings.new
  
    if org
      idp_metadata_parser = OneLogin::RubySaml::IdpMetadataParser.new
      # Returns OneLogin::RubySaml::Settings prepopulated with idp metadata
      settings = idp_metadata_parser.parse_remote(org.settings['saml_metadata_url'], {
        :sso_binding => ['urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect'],
        :slo_binding => ['urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect']
      })
      # settings.idp_entity_id                  = "https://app.onelogin.com/saml/metadata/#{OneLoginAppId}"
      # settings.idp_sso_service_url             = "https://app.onelogin.com/trust/saml2/http-post/sso/#{OneLoginAppId}"
      # settings.idp_slo_service_url             = "https://app.onelogin.com/trust/saml2/http-redirect/slo/#{OneLoginAppId}"
      # settings.idp_cert_fingerprint           = OneLoginAppCertFingerPrint
      # settings.idp_cert_fingerprint_algorithm = "http://www.w3.org/2000/09/xmldsig#sha1"
      # settings.name_identifier_format         = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
      settings.idp_sso_service_url = org.settings['saml_sso_url'] if org.settings['saml_sso_url']
    end
  
    url = "#{request.protocol}#{request.host_with_port}/saml/consume"
    url += "?org_id=#{org.global_id}" if org
    # url += (url.match(/\?/) ? '&' : '?') + "code=#{code}" if code
    settings.assertion_consumer_service_url = url
    meta_url = "#{request.protocol}#{request.host_with_port}/saml/metadata"
    meta_url += "?org_id=#{org.global_id}" if org
    settings.issuer = meta_url
    settings.sp_entity_id                   = meta_url
    # settings.logo = "http"

    # Optional for most SAML IdPs
    # settings.authn_context = "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport"
    # or as an array
    # settings.authn_context = [
    #   "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport",
    #   "urn:oasis:names:tc:SAML:2.0:ac:classes:Password"
    # ]
  
    # Optional bindings (defaults to Redirect for logout POST for acs)
    settings.single_logout_service_binding      = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
    settings.assertion_consumer_service_binding = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
  
    settings
  end
end
