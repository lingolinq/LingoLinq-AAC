require_relative '../../../lib/method_tracer'

class Api::UsersController < ApplicationController
  extend MethodTracer
  before_action :require_api_token, :except => [:update, :show, :create, :confirm_registration, :forgot_password, :password_reset, :protected_image, :subscribe, :activate_button, :resend_parental_consent, :submit_parental_consent_email]
  def show
    # If requesting 'self' but no authenticated user, return 401 instead of 404
    if params['id'] == 'self' && !@api_user
      return api_error 401, {error: "Authentication required to access current user", unauthorized: true}
    end
    user = User.find_by_path(params['id'])
    user_device = (user && @api_user && @api_user.global_id == user.global_id) && Device.find_by_global_id(@api_device_id)
    allowed = false
    return unless exists?(user, params['id'])
    if user.registration_code && params['confirmation'] == user.registration_code
      allowed = true
      @include_subscription = true
    end
    self.class.trace_execution_scoped(['user/permission_check']) do
      allowed ||= allowed?(user, 'view_existence')
    end
    return unless allowed
    json = {}
    self.class.trace_execution_scoped(['user/json_render']) do
      json = JsonApi::User.as_json(user, :wrapper => true, :permissions => @api_user, :device => user_device, :include_subscription => @include_subscription)
    end
    
    render json: json
  end
  
  def sync_stamp
    user = User.select('id', 'sync_stamp', 'updated_at', 'badges_updated_at', 'created_at').find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    if user.global_id != @api_user.global_id
      return unless allowed?(user, 'never_allow')
    end
    render json: {sync_stamp: (user.sync_stamp || user.updated_at).utc.iso8601, badges_updated_at: (user.badges_updated_at || user.created_at).utc.iso8601}
  end

  def valet_credentials
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'delete')
    if !user.settings['valet_password']
      return unless allowed?(user, 'never_allow')
    end
    nonce = GoSecure.nonce('valet_hash_password')[0, 5]
    password = user.valet_temp_password(nonce)
    credentials = "model-#{user.global_id}:#{password.gsub(/\?:\#/, '-')}"
    url = "#{JsonApi::Json.absolute_host}/login?#{credentials}"
    render json: {user_name: "model@#{user.global_id.sub(/_/, '.')}", password: password, url: url}
  end
  
  def places
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'model')
    render json: Geolocation.find_places(params['latitude'], params['longitude'])
  end

  def ws_encrypt
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'supervise')
    str = GoSecure.encrypt("#{params['user_id']}.#{params['text']}", 'ws_content_encrypted', ENV['LLWEBSOCKET_ENCRYPTION_KEY']).map(&:strip).join('$')
    render json: {encoded: str, user_id: user.global_id}
  end

  def ws_decrypt
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'supervise')
    return api_error(400, {error: 'text required'}) if params['text'].blank?
    str, iv = params['text'].split(/\$/)
    user_id, text = begin
      GoSecure.decrypt(str, iv, 'ws_content_encrypted', ENV['LLWEBSOCKET_ENCRYPTION_KEY']).split(/\./, 2)
    rescue OpenSSL::Cipher::CipherError, ArgumentError
      [nil, nil]
    rescue StandardError => e
      Rails.logger.warn("ws_decrypt: unexpected error #{e.class}: #{e.message}")
      [nil, nil]
    end
    return api_error(400, {error: 'invalid decryption'}) unless user_id && text
    return api_error(400, {error: 'user_id mismatch'}) unless user_id == user.global_id
    render json: {decoded: text, user_id: user.global_id}    
  end

  def ws_lookup
    obfuscated_user_id = params['user_id']
    return api_error(400, {error: 'user_id required'}) if obfuscated_user_id.blank?
    str, iv = obfuscated_user_id.sub(/^me\$/, '').split(/\$/)
    user_id, device_id = begin
      GoSecure.decrypt(str, iv, 'ws_device_id_encrypted', ENV['LLWEBSOCKET_ENCRYPTION_KEY']).split(/\./)
    rescue OpenSSL::Cipher::CipherError, ArgumentError
      [nil, nil]
    rescue StandardError => e
      Rails.logger.warn("ws_lookup: unexpected error #{e.class}: #{e.message}")
      [nil, nil]
    end
    return api_error(400, {error: 'invalid decryption'}) unless user_id && device_id
    user = User.find_by_path(user_id)
    return unless exists?(user, user_id)
    # Supervisee needs to look up supervisors as well
    if !@api_user.allows?(user, 'supervise')
      return unless allowed?(user, 'supervise')
    end
    render json: {
      user_id: user.global_id,
      user_name: user.user_name,
      device_id: device_id,
      avatar_url: user.generated_avatar_url
    }
  end

  def ws_settings
    # Self should always get the verifier
    # Supervisor should get supervisee ids
    # Org manager should be able to query for individual ids in their org
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'supervise')
    res = {
      user_id: user.global_id,
      ws_user_id: user.global_id
    }

    # We manually set the IV so that device_id remains consistent across 
    # page reloads, and doesn't imply multiple devices to the websocket service
    iv = Digest::SHA2.hexdigest("user_settings_iv_for_" + (@token || @api_user.global_id))[0, 16]
    device_id = GoSecure.encrypt("#{@api_user.global_id}.#{@api_device_id}", 'ws_device_id_encrypted', ENV['LLWEBSOCKET_ENCRYPTION_KEY'], iv).map(&:strip).join('$')
    ts = Time.now.to_i
    if user.global_id == @api_user.global_id
      res[:my_device_id] = "me$#{device_id}"
    else
      res[:my_device_id] = device_id
    end
    code = GoSecure.sha512("#{res[:ws_user_id]}:#{res[:my_device_id]}:#{ts}", "room_join_verifier", ENV['LLWEBSOCKET_SHARED_VERIFIER'])[0, 30]
    res[:verifier] = "#{code}:#{ts}"
    if user.supporter_role?
      # Same fan-out as users#supervisees: the gate above authorizes the list
      # owner, not the children inside. Filter before emitting ids (and, on
      # self, room-join verifiers).
      sups = user.supervisees.select { |s| supervisee_listable?(s) }
      if sups.length < 20
        res[:supervisees] = sups.map do |sup|
          ws_user_id = sup.global_id
          sup = {
            user_id: sup.global_id,
            ws_user_id: ws_user_id,
          }
          if user.global_id == @api_user.global_id
            sup[:my_device_id] = device_id
            code = GoSecure.sha512("#{ws_user_id}:#{device_id}:#{ts}", "room_join_verifier", ENV['LLWEBSOCKET_SHARED_VERIFIER'])[0, 30]
            sup[:verifier] = "#{code}:#{ts}"
          end
          sup
        end
      end
    end

    render json: res
  end
  
  def index
    lookup = User
    org = nil
    if params['org_id']
      org = Organization.find_by_global_id(params['org_id'])
      return unless allowed?(org, 'edit')
      lookup = org.attached_users('all')
    elsif !Organization.admin_manager?(@api_user)
      return api_error 400, {error: 'admins only'}
    end
    if !params['q']
      return api_error 400, {error: 'q parameter required'}
    end
    query = params['q'].downcase
    users = []
    if org && org.settings['saml_metadata_url']
      user = org.find_saml_alias(params['q'], params['q'].downcase)
      users = [user] if user
    end
    if users.empty?
      if query.match(/@/)
        users = lookup.find_by_email(query)
      else
        users = lookup.where(:user_name => query)
        users = [lookup.find_by_global_id(query)].compact if users.count == 0 && query.match(/^\d+_\d+$/)
        if users.count == 0
          users = lookup.where(["user_name ILIKE ?", "%#{ActiveRecord::Base.sanitize_sql_like(query)}%"]).order('user_name')
        end
      end
    end
    render json: JsonApi::User.paginate(params, users)
  end
  
  def update
    user = User.find_by_path(params['id'])
    user_device = (user && @api_user && @api_user.global_id == user.global_id) && Device.find_by_global_id(@api_device_id)
    return unless exists?(user)
    options = {}
    # Build user_data from params, restricting fields based on authorization level
    user_data = params['user'] || {}
    user_data = user_data.permit! if user_data.is_a?(ActionController::Parameters)
    user_data = user_data.to_h if user_data.respond_to?(:to_h) && !user_data.is_a?(Hash)
    if params['reset_token'] && user.valid_reset_token?(params['reset_token'])
      user_data = user_data.slice('password')
      options[:allow_password_change] = true
      user.used_reset_token!(params['reset_token'])
    elsif params['reset_token'] == 'admin' && user.allows?(@api_user, 'support_actions')
      user_data = user_data.slice('password')
      options[:allow_password_change] = true
      user.used_reset_token!(params['reset_token'])
    elsif user.allows?(@api_user, 'manage_supervision') && !user.allows?(@api_user, 'edit')
      user_data = user_data.slice('supervisor_key')
    # Scopes passed explicitly — a bare `allows?` uses the RAW permission_scopes
    # and skips api_permission_scopes' normalization (blank / legacy '*' -> full),
    # which would deny integration and dev-key devices. (The adjacent branches
    # predate this branch and are left as-is rather than widened here.)
    elsif user.allows?(@api_user, 'supervise', api_permission_scopes) && !user.allows?(@api_user, 'edit', api_permission_scopes) && supervise_home_board_update?(user_data)
      user_data = supervise_home_board_update_slice(user_data)
    else
      return unless allowed?(user, 'edit')
    end
    # we don't want to set device preferences unless the user actually changed device settings
    device_updated = (params['user'] && params['user']['preferences'] && params['user']['preferences']['device'] && params['user']['preferences']['device']['updated'])
    device_updated ||= (params['user'] && params['user']['preference'] && params['user']['preference']['device'] && params['user']['preference']['device']['updated'])
    device_updated ||= (user_data && user_data['preference'] && user_data['preference']['device'] && user_data['preference']['device']['updated'])
    if device_updated && !user_device
      if @api_user && @api_user.global_id == user.global_id
        user_device = Device.where(user: @api_user).find_by_global_id(@api_device_id)
      else
        # Supervisor editing another user: use the target user's most recent device
        # so preferences are stored under a key the target user will actually read
        user_device = Device.where(user: user, user_integration_id: nil).order('updated_at DESC').first
      end
    end
    options['device'] = user_device
    options['updater'] = @api_user

    if user.process(user_data, options)
      start_code_progress = user.instance_variable_get('@start_code_progress')
      json = JsonApi::User.as_json(user, :wrapper => true, :permissions => @api_user, :device => user_device)
      if start_code_progress
        json['user']['start_progress'] = JsonApi::Progress.as_json(start_code_progress)
      end
      render json: json
    else
      return api_error 400, {error: 'update failed', errors: user.processing_errors}
    end
  end
  
  def create
    user_data = params['user']
    user_data = user_data.permit! if user_data.is_a?(ActionController::Parameters)
    if user_data && user_data['start_code'].present?
      # Validate user.start_code if present and error before trying to create
      # (Blank string must be ignored: in Ruby "" is truthy, but optional forms submit it.)
      code = Organization.parse_activation_code(user_data['start_code'])
      return api_error(400, {error: "invalid start code", start_code_error: true}) if !code || code[:disabled]
    end
    # Public signup and authenticated non-org creates cannot omit birth to
    # skip COPPA classification. Only a validated org-authored create
    # (same predicate process_params uses) skips this gate.
    if JsonApi::Json.coppa_parental_consent_enabled? && user_data
      unless User.validated_org_author(@api_user, user_data['authored_organization_id'])
        month, year = User.signup_birth_from_params(user_data)
        if User.age_under_threshold?(birth_month: month, birth_year: year, age: JsonApi::Json::DEFAULT_COPPA_CONSENT_AGE).nil?
          return api_error(400, {error: "user creation failed", errors: ['birth month and year required']})
        end
      end
    end
    user = User.process_new(user_data, {:pending => true, :author => @api_user})
    start_progress = nil
    start_code_org = nil
    if !user || user.errored?
      return api_error(400, {error: "user creation failed", errors: user && user.processing_errors})
    end
    if user_data && user_data['start_code'].present?
      # Process start code actions once the user is fully created (can't add supervisors beforehand)
      res = Organization.parse_activation_code(user_data['start_code'], user)
      start_progress = res[:progress]
      start_code_org = res[:target] if res.is_a?(Hash) && res[:target].is_a?(Organization)
    end
    UserBoardProvisioner.provision_for(user)
    # Org-authored (school-official) creation: emit the immutable authorization audit
    # now that the user is persisted. process_params recorded the basis in settings
    # but had no global_id to key the event on. This makes every school-authorized
    # under-13 account creation traceable to the authorizing org and manager.
    sa = user.settings && user.settings['school_authorization']
    if sa.is_a?(Hash) && sa['basis'] == 'school_official'
      begin
        AuditEvent.create!(
          user_key: user.global_id,
          data: {
            'type' => 'school_authorization',
            'basis' => sa['basis'],
            'organization_id' => sa['organization_id'],
            'authorized_by' => sa['authorized_by'],
            'record_id' => sa['record_id']
          },
          event_type: 'school_authorization',
          record_id: sa['record_id']
        )
      rescue => e
        # Fail-open: the child account is already persisted, so a failed audit insert
        # must NOT 500 the request (that would orphan the account and invite a
        # duplicate-creating retry). Log loudly so a missed accounting-of-disclosure
        # row is caught. e.message can echo DB input, so PII-scrub it (guarded, the
        # same way AuditEvent.log_command does) rather than logging the raw message.
        detail = begin
          PiiScrubber.scrub_log_line(e.message.to_s).truncate(300)
        rescue ScriptError, StandardError => scrub_err
          "[unscrubbable:#{scrub_err.class}]"
        end
        Rails.logger.error("school_authorization audit failed to persist for #{user.global_id}: #{e.class} #{detail}")
      end
    end
    # General account-creation audit trail (LL-d35cbdb313): fires for EVERY new account,
    # regardless of how it was created (self-registration, admin-created, or via an org
    # start code). This is additive to, not a replacement for, the school_authorization
    # event above -- that one separately records the specific COPPA authorization basis
    # for org-authored under-13 accounts. Together: "was any account created" (this event,
    # always) vs. "was it specifically authorized under the school exception" (that event,
    # only when applicable).
    begin
      AuditEvent.create!(
        user_key: user.global_id,
        data: {
          'type' => 'user_creation',
          'author' => @api_user && @api_user.global_id,
          'via_start_code' => !!(user_data && user_data['start_code'].present?),
          'organization_id' => start_code_org && start_code_org.global_id
        },
        event_type: 'user_creation',
        record_id: start_code_org && start_code_org.global_id
      )
    rescue => e
      # Fail-open, same rationale as school_authorization above: the account is already
      # persisted, so a failed audit insert must not 500 the request or orphan the account.
      detail = begin
        PiiScrubber.scrub_log_line(e.message.to_s).truncate(300)
      rescue ScriptError, StandardError => scrub_err
        "[unscrubbable:#{scrub_err.class}]"
      end
      Rails.logger.error("user_creation audit failed to persist for #{user.global_id}: #{e.class} #{detail}")
    end
    coppa_pending = user.coppa_parental_consent_pending?
    unless coppa_pending
      UserMailer.schedule_delivery(:confirm_registration, user.global_id)
      UserMailer.schedule_delivery(:new_user_registration, user.global_id)
      ExternalTracker.track_new_user(user)
    else
      schedule_parental_consent_request_email!(user)
    end

    d = Device.find_or_create_by(:user_id => user.id, :device_key => 'default', :developer_key_id => 0)
    d.settings['ip_address'] = request.remote_ip
    log_installed_client_signal('api/users#create')
    apply_device_classification!(d, installed_app?)
    d.settings['user_agent'] = request.headers['User-Agent']
    d.save
    d.generate_token!(!!d.settings['app']) unless coppa_pending

    res = JsonApi::User.as_json(user, :wrapper => true, :permissions => @api_user || user)
    res['user']['start_progress'] = JsonApi::Progress.as_json(start_progress) if start_progress
    if coppa_pending
      res['meta'] = {
        'token_type' => 'bearer',
        'coppa_parental_consent_pending' => true
      }
    else
      res['meta'] = JsonApi::Token.as_json(user, d)
    end
    render json: res
  end
  
  def claim_voice
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'edit')
    if user.add_premium_voice(params['voice_id'], params['system'])
      res = {voice_added: true, voice_id: params['voice_id']}
      if params['voice_url']
        res[:download_url] = Uploader.signed_download_url(params['voice_url'])
        res[:download_language_url] = Uploader.signed_download_url(params['language_url']) if params['language_url']
        res[:download_binary_url] = Uploader.signed_download_url(params['binary_url']) if params['binary_url']
      end
      render json: res
    else
      api_error(400, {error: "no more voices available"})
    end
  end
  
  def start_code
    # post 'start_code'
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'edit')
    return allowed?(user, 'never_allow') unless user.supporter_role?
    if params['delete'] && params['code']
      res = Organization.remove_start_code(user, params['code'])
      return api_error(400, {error: 'code not found'}) unless res
      render json: {code: params['code'], deleted: true}
    else
      code = nil
      begin
        overrides = params['overrides']
        overrides = overrides.permit! if overrides.is_a?(ActionController::Parameters)
        code = Organization.activation_code(user, overrides)
      rescue => e
        err = {error: e.message}
        err[:code_taken] = true if e.message == 'code is taken'
        err[:invalid_board] = true if e.message == 'invalid home board'
        return api_error(400, err)
      end
      api_error(400, {error: 'code generation failed'}) unless code
      render json: {code: code}
    end
  end

  def activate_button
    user = User.find_by_path(params['user_id'])
    return if params['user_id'] != 'nobody' && !exists?(user, params['user_id'])
    return if user && !allowed?(user, 'model')
    board = Board.find_by_path(params['board_id'])
    return unless exists?(board, params['board_id'])
    return unless allowed?(board, 'view')
    button = params['button_id'] && board.buttons.detect{|b| b['id'].to_s == params['button_id'].to_s }
    if !button
      return api_error(400, {error: 'button not found'})
    elsif !button['integration'] || !button['integration']['user_integration_id']
      return api_error(400, {error: 'button integration not configured'})
    end
    associated_user = nil
    if params['associated_user_id']
      supervisee = User.find_by_path(params['associated_user_id'])
      if supervisee && supervisee.allows?(user, 'model')
        associated_user = supervisee
      end
    end
    progress = Progress.schedule(board, :notify, 'button_action', {
      'user_id' => user && user.global_id,
      'immediate' => true,
      'associated_user_id' => (associated_user && associated_user.global_id),
      'button_id' => params['button_id']
    }, for_user: @api_user)
    render json: JsonApi::Progress.as_json(progress, :wrapper => true)
  end
  
  def rename
    user = User.find_by_path(params['user_id'])
    return unless exists?(user)
    return unless allowed?(user, 'support_actions')
    return if params['new_key'].blank? && !allowed?(user, 'never_allow')
    if params['new_key'] && params['old_key'] && params['old_key'].downcase == user.user_name && user.rename_to(params['new_key'])
      key = User.clean_path(params['new_key'])
      render json: {rename: true, key: key}
    else
      api_error(400, {error: "user rename failed", key: params['key'], invalid_name: user.invalid_name_error?, collision: user.collision_error?})
    end
  end
  
  def flush_logs
    user = User.find_by_path(params['user_id'])
    return unless allowed?(user, 'delete')
    return api_error(400, {'flushed' => 'false', 'user_name_math' => (user.user_name == params['user_name']), 'user_id_match' => (user.global_id == params['confirm_user_id'])}) unless user.user_name == params['user_name'] && user.global_id == params['confirm_user_id']
    progress = Progress.schedule(Flusher, :flush_user_logs, user.global_id, user.user_name, for_user: @api_user)
    AuditEvent.log_command(@api_user.global_id, {
      'type' => 'user_logs_flush_scheduled',
      'user_id' => user.global_id,
      'progress_id' => progress.global_id
    })
    render json: JsonApi::Progress.as_json(progress, :wrapper => true)
  end

  def flush_user
    user = User.find_by_path(params['user_id'])
    return unless allowed?(user, 'delete')
    return api_error(400, {'flushed' => 'false'}) unless user.user_name == params['user_name'] && user.global_id == params['confirm_user_id']
    user.schedule_deletion_at = 36.hours.from_now
    user.save
    Purchasing.cancel_other_subscriptions(user, 'all')
    SubscriptionMailer.deliver_message(:account_deleted, user.global_id)
    AdminMailer.schedule_delivery(:opt_out, user.global_id, 'deleted')
    AuditEvent.log_command(@api_user.global_id, {
      'type' => 'user_deletion_scheduled',
      'user_id' => user.global_id,
      'scheduled_deletion_at' => user.schedule_deletion_at&.iso8601
    })
    render json: {flushed: 'pending'}
  end
  
  def hide_device
    user = User.find_by_path(params['user_id'])
    return unless allowed?(user, 'delete')
    device = Device.find_by_global_id(params['device_id'])
    if device && device.user_id == user.id
      device.settings['hidden'] = true
      device.save
      render json: JsonApi::Device.as_json(device, :current_device => Device.find_by_global_id(@api_device_id))
    else
      api_error 400, {error: 'matching device not found'}
    end
  end
  
  def rename_device
    user = User.find_by_path(params['user_id'])
    return unless allowed?(user, 'edit')
    device = Device.find_by_global_id(params['device_id'])
    if device && device.user_id == user.id
      device_data = params['device']
      device_data = device_data.permit(:name) if device_data.is_a?(ActionController::Parameters)
      device.settings['name'] = device_data['name']
      device.save
      render json: JsonApi::Device.as_json(device, :current_device => Device.find_by_global_id(@api_device_id))
    else
      api_error 400, {error: 'matching device not found'}
    end
  end
  
  def word_activities
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'model')
    
    # skip if recently-retrieved
    existing = WordData.activities_for(user, true)
    if existing.instance_variable_get('@fresh')
      render json: existing
    else
      progress = Progress.schedule(WordData, :update_activities_for, user.global_id, true, for_user: @api_user)
      render json: JsonApi::Progress.as_json(progress, :wrapper => true)
    end
  end

  def ensure_board_tag
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'model')
    extra = UserExtra.find_or_create_by(user: user)
    res = extra.ensure_board_tag(params['tag'])
    if res
      board_tag_map = (extra.settings['board_tags'] || {}).transform_values { |v| v || [] }
      render json: {ok: true, board_tags: res, board_tag_map: board_tag_map}
    else
      api_error 400, {error: 'invalid tag'}
    end
  end

  def rename_board_tag
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'model')
    extra = UserExtra.find_or_create_by(user: user)
    res = extra.rename_board_tag(params['old_tag'], params['new_tag'])
    if res
      board_tag_map = (extra.settings['board_tags'] || {}).transform_values { |v| v || [] }
      render json: {ok: true, board_tags: res, board_tag_map: board_tag_map}
    else
      api_error 400, {error: 'invalid rename'}
    end
  end

  def delete_board_tag
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'model')
    extra = UserExtra.find_or_create_by(user: user)
    res = extra.delete_board_tag_folder(params['tag'])
    if res
      board_tag_map = (extra.settings['board_tags'] || {}).transform_values { |v| v || [] }
      render json: {ok: true, board_tags: res, board_tag_map: board_tag_map}
    else
      api_error 400, {error: 'invalid tag'}
    end
  end

  def history
    user_id = nil
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    if user
      return unless allowed?(user, 'admin_support_actions')
      user_id = user.global_id
    elsif @api_user.allows?(@api_user, 'admin_support_action')
      user_id = params['user_id']
    end
    return unless exists?(user_id)
    # Accounting-of-disclosure: admin-support reads of another user's full version
    # history are timestamped. Self-reads are not logged.
    if @api_user && user_id != @api_user.global_id
      AuditEvent.log_command(@api_user.global_id, {
        'type' => 'admin_support_history_read',
        'user_id' => user_id
      })
    end
    versions = User.user_versions(user_id)
    render json: JsonApi::UserVersion.paginate(params, versions, {:admin => Organization.admin_manager?(@api_user)})
  end
  
  def supervisors
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'supervise')
    supervisors = user.supervisors
    render json: JsonApi::User.paginate(params, supervisors, limited_identity: true, supervisee: user, prefix: "/users/#{user.global_id}/supervisors")
  end
  
  def supervisees
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'supervise')
    # Third instance of the fan-out defect fixed in badges#index and logs#index:
    # the gate above authorizes the caller against `user`, and then every account
    # in `user.supervisees` was serialized regardless of the caller's standing
    # with THOSE accounts. Reachable when an org manager holds `supervise` over a
    # supporter (user.rb:87) who also supervises communicators outside that org --
    # a contracting SLP with a private caseload -- and equally when a supporter
    # asks about themselves, where the gate passes unconditionally.
    #
    # `limited_identity` is not a redaction: json_api/user.rb:327 emits the child's
    # real name, avatar, unread message and alert counts, external device,
    # preferred symbols, and (with :supervisor set) org_status. Name plus org
    # affiliation across a district boundary is the FERPA disclosure, and the
    # unread counts are activity metadata about a child the caller has no
    # relationship with.
    #
    # This is ROSTER identity, so the check is supervisee_listable? ('model'), not
    # supervisee_readable? ('supervise'). 'supervise' carries a modeling_only
    # conjunct that fails for a BILLING-lapsed supporter against their own
    # caseload, which emptied the list for that whole tier; 'model' is granted to
    # any supervisor_for? (user.rb:68) and to an org manager (user.rb:87) but to
    # no stranger, so a manager reviewing a therapist's in-org caseload is
    # unaffected and only the out-of-org rows drop out.
    supervisees = user.supervisees.select{|s| supervisee_listable?(s) }
    render json: JsonApi::User.paginate(params, supervisees, limited_identity: true, supervisor: user, prefix: "/users/#{user.global_id}/supervisees")
  end
  
  def subscribe
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])

    admin = Organization.admin
    token = nil
    if params['token'].is_a?(ActionController::Parameters)
      token = params['token'].permit!.to_h
    elsif params['token'].respond_to?(:to_h)
      token = params['token'].to_h
    end
    if params['type'] == 'gift_code'
      return require_api_token unless @api_user
      return unless allowed?(user, 'edit')
      progress = Progress.schedule(user, :redeem_gift_token, token['code'], for_user: @api_user)
    elsif['never_expires', 'eval', 'add_1', 'add_5_years', 'manual_supporter', 'add_voice', 'communicator_trial', 'force_logout', 'enable_extras', 'supporter_credit', 'check_remote', 'restore', 'manual_modeler'].include?(params['type'])
      return require_api_token unless @api_user
      return unless allowed?(user, 'admin_support_actions')
      progress = Progress.schedule(user, :subscription_override, params['type'], @api_user && @api_user.global_id, for_user: @api_user)
    else
      if user.registration_code && params['confirmation'] == user.registration_code
      else
        return require_api_token unless @api_user
        return unless allowed?(user, 'edit')
      end
      # for_user: @api_user (NOT `|| user`). The confirmation-code branch
      # above intentionally allows anonymous calls (no @api_user). The
      # frontend then polls /api/v1/progress/<id> anonymously, and
      # Api::ProgressController authorizes against @api_user. Owner-scoping
      # to the target user would 401 those polls and hang the purchase UI.
      # When @api_user is nil here, the progress falls back to legacy
      # permissive view (protected by the global_id nonce on Progress).
      progress = Progress.schedule(user, :process_subscription_token, token, params['type'], params['code'], for_user: @api_user)
    end
    render json: JsonApi::Progress.as_json(progress, :wrapper => true)
  end
  
  def unsubscribe
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'edit')
    user.settings['subscription'] ||= {}
    user.settings['subscription']['unsubscribe_reason'] = params['reason'] if params['reason']
    user.save_with_sync('unsubscribe')
    progress = Progress.schedule(user, :process_subscription_token, 'token', 'unsubscribe', for_user: @api_user)
    render json: JsonApi::Progress.as_json(progress, :wrapper => true)
  end

  def verify_receipt
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'edit')
    progress = Progress.schedule(user, :verify_receipt, params['receipt_data'], for_user: @api_user)
    render json: JsonApi::Progress.as_json(progress, :wrapper => true)
  end
  
  def replace_board
    user = User.find_by_path(params['user_id'])
    old_board = Board.find_by_path(params['old_board_id'])
    new_board = Board.find_by_path(params['new_board_id'])
    return unless exists?(user, params['user_id']) && exists?(old_board, params['old_board_id']) && exists?(new_board, params['new_board_id'])
    return unless allowed?(user, 'edit') && allowed?(old_board, 'view') && allowed?(new_board, 'view')
    return allowed?(user, 'never_allow') unless new_board.user == user
    
    make_public = params['make_public'] && params['make_public'] == '1' || params['make_public'] == 'true' || params['make_public'] == true
    progress = Progress.schedule(user, :replace_board, {
      old_board_id: params['old_board_id'],
      new_board_id: params['new_board_id'],
      old_default_locale: params['old_default_locale'],
      new_default_locale: params['new_default_locale'],
      ids_to_copy: params['ids_to_copy'],
      copy_prefix: params['copy_prefix'],
      update_inline: params['update_inline'],
      copier_id: @api_user && @api_user.global_id,
      new_owner: params['new_owner'],
      disconnect: params['disconnect'],
      make_public: make_public,
      user_for_paper_trail: user_for_paper_trail
    }, for_user: @api_user)
    render json: JsonApi::Progress.as_json(progress, :wrapper => true)
  end
  
  def copy_board_links
    user = User.find_by_path(params['user_id'])
    old_board = Board.find_by_path(params['old_board_id'])
    new_board = Board.find_by_path(params['new_board_id'])
    return unless exists?(user, params['user_id']) && exists?(old_board, params['old_board_id']) && exists?(new_board, params['new_board_id'])
    # Supervise-only supervisors reach this via the board-picker home-board flow.
    # `allows?` is the PURE predicate and must come first: `allowed?` renders a
    # 400 as a side effect before returning false, so `allowed?(a) || allowed?(b)`
    # renders on the first failure regardless of the second and then double-renders
    # (500). At most one `allowed?(user, …)` call may run here.
    # The next line still requires the destination board to be owned by the user.
    # Scopes are passed explicitly: a bare `allows?` falls back to the RAW
    # user.permission_scopes (permissable.rb:72) and skips the normalization
    # api_permission_scopes does, which would deny integration / dev-key devices.
    return unless (user.allows?(@api_user, 'supervise', api_permission_scopes) || allowed?(user, 'edit')) && allowed?(old_board, 'view') && allowed?(new_board, 'view')
    return allowed?(user, 'never_allow') unless new_board.user == user
    
    make_public = params['make_public'] && params['make_public'] == '1' || params['make_public'] == 'true' || params['make_public'] == true
    progress = Progress.schedule(user, :copy_board_links, {
        old_board_id: params['old_board_id'], 
        new_board_id: params['new_board_id'], 
        old_default_locale: params['old_default_locale'], 
        new_default_locale: params['new_default_locale'], 
        ids_to_copy: params['ids_to_copy'], 
        expand_selected_board_ids: params['expand_selected_board_ids'],
        copy_prefix: params['copy_prefix'],
        make_public: make_public,
        copier_id: @api_user && @api_user.global_id,
        new_owner: params['new_owner'],
        disconnect: params['disconnect'],
        user_for_paper_trail: user_for_paper_trail,
        swap_library: params['swap_library']
    }, for_user: @api_user)
    render json: JsonApi::Progress.as_json(progress, :wrapper => true)
  end
  
  def board_revisions
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'model')
    roots = []
    if user.settings['preferences']['home_board']
      roots << Board.find_by_global_id(user.settings['preferences']['home_board']['id'])
    end
    roots += Board.find_all_by_path(user.sidebar_boards.map{|b| b['key'] })
    if user.settings['preferences']['sync_starred_boards']
      roots += Board.find_all_by_path(user.settings['starred_board_ids'] || [])
    end
    all_ids = []
    roots.compact.each do |root|
      all_ids << root.global_id
      all_ids += root.downstream_board_ids
    end
    all_ids.uniq!
    res = {}
    Board.select('id, current_revision, key').find_all_by_global_id(all_ids).each do |brd|
      res[brd.global_id] = brd.current_revision
      res[brd.key] = brd.current_revision
    end
    render json: res
  end

  def boards
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'model')
    ids = params['ids'].split(/,/)
    return api_error(400, {error: 'too many ids'}) if ids.length > 25
    boards = Board.find_all_by_global_id(ids)
    res = []
    boards.select{|b| b.allows?(user, 'view')}.each do |board|
      board.track_usage!
      res << JsonApi::Board.as_json(board, :permissions => @api_user, :wrapper => true, :skip_subs => true)['board']
    end
    render json: res
  end
  
  def confirm_registration
    user = User.find_by_path(params['user_id'])
    if params['resend']
      sent = false
      if user.settings['pending'] != false
        if user.coppa_parental_consent_pending? || user.coppa_parental_consent_revoked?
          sent = false
        else
          sent = true
          UserMailer.schedule_delivery(:confirm_registration, user.global_id)
        end
      end
      render json: {sent: sent}
    else
      confirmed = !!(user && !user.settings['pending'])
      if params['code'] && user && params['code'] == user.registration_code
        if user.coppa_parental_consent_revoked?
          return api_error 400, {error: 'parental consent revoked', coppa_parental_consent_revoked: true}
        end
        if user.coppa_parental_consent_declined?
          return api_error 400, {error: 'parental consent declined', coppa_parental_consent_declined: true}
        end
        if user.coppa_needs_parent_email?
          return api_error 400, {error: 'parent email required', coppa_parent_email_required: true}
        end
        if user.coppa_parental_consent_pending?
          return api_error 400, {error: 'awaiting parental consent', coppa_parental_consent_pending: true}
        end
        confirmed = true
        user.update_setting('pending', false)
      end
      render json: {:confirmed => confirmed}
    end
  end
  
  def forgot_password
    # TODO: throttling...
    user = User.find_by_path(params['key'])
    users = [user].compact
    if !user && params['key'] && params['key'].match(/@/)
      users = User.where(:email_hash => User.generate_email_hash(params['key'].strip))
    end
    not_disabled_users = users.select{|u| !u.settings['email_disabled'] }
    reset_users = not_disabled_users.select{|u| u.generate_password_reset }
    # Send the appropriate email when one is warranted, but always return the
    # same response shape regardless of whether an account exists, is disabled,
    # or is throttled. Leaking existence (via a users count, a 400 status, or a
    # distinguishing message) enabled account enumeration (finding LL-9a3ee852d5).
    if reset_users.length > 0
      UserMailer.schedule_delivery(:forgot_password, reset_users.map(&:global_id))
    elsif users.length == 0 && params['key'] && params['key'].match(/@/)
      UserMailer.schedule_delivery(:login_no_user, params['key'])
    end
    render json: {email_sent: true}
  end

  # Re-send parental consent email when the child cannot log in until a parent approves (same flow as signup).
  # Requires username + password and a valid browser client_secret (same bar as /token). Rate-limited per user in Redis.
  def resend_parental_consent
    unless JsonApi::Json.coppa_parental_consent_enabled?
      return api_error 400, {error: 'Invalid authentication attempt'}
    end
    unless params['client_id'].to_s == 'browser' && GoSecure.valid_browser_token?(params['client_secret'])
      return api_error 400, {error: 'Invalid authentication attempt'}
    end
    identification = (params['username'] || params['identification'] || params['user_name']).to_s.strip
    password = params['password'].to_s
    if identification.blank? || password.blank?
      return api_error 400, {error: 'Invalid authentication attempt'}
    end
    user = User.find_for_login(identification, nil, password)
    if !user || !user.valid_password?(password)
      return api_error 400, {error: 'Invalid authentication attempt'}
    end
    unless user.coppa_parental_consent_pending?
      return api_error 400, {error: 'Invalid authentication attempt'}
    end
    if user.coppa_needs_parent_email?
      return api_error 400, {error: 'parent email required', coppa_parent_email_required: true}
    end
    key = parental_consent_resend_redis_key(user)
    ttl_ms = begin
      RedisInit.default.pttl(key)
    rescue Redis::BaseError
      nil
    end
    if ttl_ms && ttl_ms > 0
      retry_after = [(ttl_ms / 1000.0).ceil, 1].max
      return api_error 429, {error: 'parental_consent_resend_throttled', retry_after_seconds: retry_after}
    end
    Permissions.setex(RedisInit.default, key, parental_consent_resend_ttl_seconds, '1', true)
    schedule_parental_consent_request_email!(user)
    render json: {sent: true}
  end

  # Login-time (or revoked re-request): collect parent email, stamp COPPA token, send consent mail.
  # Same credential bar as resend_parental_consent. Does not issue a session.
  def submit_parental_consent_email
    unless JsonApi::Json.coppa_parental_consent_enabled?
      return api_error 400, {error: 'Invalid authentication attempt'}
    end
    unless params['client_id'].to_s == 'browser' && GoSecure.valid_browser_token?(params['client_secret'])
      return api_error 400, {error: 'Invalid authentication attempt'}
    end
    identification = (params['username'] || params['identification'] || params['user_name']).to_s.strip
    password = params['password'].to_s
    parent_email = (
      params['parent_consent_email'] ||
      params['parent-consent-email'] ||
      params['parentConsentEmail'] ||
      ''
    ).to_s.strip
    if identification.blank? || password.blank?
      return api_error 400, {error: 'Invalid authentication attempt'}
    end
    user = User.find_for_login(identification, nil, password)
    if !user || !user.valid_password?(password)
      return api_error 400, {error: 'Invalid authentication attempt'}
    end
    unless user.coppa_needs_parent_email?
      return api_error 400, {error: 'Invalid authentication attempt'}
    end
    begin
      unless user.submit_parental_consent_email!(parent_email)
        return api_error 400, {error: 'Invalid authentication attempt'}
      end
    rescue ArgumentError => e
      return api_error 400, {error: e.message, invalid_parent_consent_email: true}
    end
    render json: {sent: true, coppa_parental_consent_pending: true}
  end

  # Request (or re-request) EU AI parental consent email for an eu_under_16 user.
  # Requires API token + edit/self. Body: parent_email.
  def request_eu_ai_parental_consent
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'edit')
    unless user.eu_under_16?
      return api_error 400, {error: 'eu_under_16_required'}
    end
    parent_email = (
      params['parent_email'] ||
      (params['user'] && params['user']['parent_email']) ||
      ''
    ).to_s.strip
    requested = params['requested_features'] ||
                (params['user'] && params['user']['requested_features'])
    begin
      user.request_eu_ai_parental_consent!(parent_email, requested_features: requested)
    rescue ArgumentError => e
      return api_error 400, {error: e.message}
    end
    UserMailer.schedule_parent_consent_delivery(:eu_ai_parental_consent_request, user.global_id)
    render json: {
      pending: true,
      eu_ai_parental_consent_pending: true,
      requested_features: user.settings.dig('eu_ai_parental_consent', 'requested_features')
    }
  end

  # Records that the EU AI Act Article 50(1) transparency disclosure was shown to and
  # acknowledged by the caller. Requires API token + edit permission on the target user.
  # Per D-06 (Phase 3 CONTEXT), both the source and the disclosures version are server-side
  # constants -- the corresponding request params are intentionally never referenced in this
  # action, so a client cannot widen ARTICLE_50_DISCLOSURE_SOURCES or backdate/forge the
  # recorded version. mark_article_50_disclosure_shown! itself is idempotent (same-version
  # re-call is a no-op) and audited (one AuditEvent), so a repeat POST (e.g. a double-click)
  # is still a 200 rather than surfacing as an error to the modal.
  def article_50_disclosure_ack
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'edit')
    begin
      user.mark_article_50_disclosure_shown!(
        disclosures_version: LingoLinq::Article50Disclosures::CURRENT_VERSION,
        source: 'modal_ack',
        ip: request.remote_ip,
        user_agent: request.user_agent
      )
    rescue ArgumentError => e
      return api_error 400, {error: e.message}
    end
    render json: {
      article_50_disclosure_shown: true,
      disclosures_version: LingoLinq::Article50Disclosures::CURRENT_VERSION
    }
  end

  def password_reset
    user = User.find_by_path(params['user_id'])
    if user && reset_token = user.reset_token_for_code(params['code'])
      render json: {valid: true, reset_token: reset_token}
    else
      api_error 400, {valid: false}
    end
  end
  
  def core_lists
    res = {defaults: WordData.core_lists, fringe: WordData.fringe_lists}
    if params['user_id'] != 'none'
      user = User.find_by_path(params['user_id'])
      return unless exists?(user, params['user_id'])
      return unless allowed?(user, 'model')
      # TODO: move this to a progress call and return 
      # an auto-deleting download link
      res.merge!(WordData.core_and_fringe_for(user))
    end
    render json: res
  end
  
  def update_core_list
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'edit')
    template = UserIntegration.find_by(:template => true, :integration_key => 'core_word_list')
    if !template
      return api_error 400, {error: 'no core word list integration defined'}
    end
    
    ui = UserIntegration.find_or_create_by(:template_integration => template, :user => user)
    ui.settings['core_word_list'] = {
      id: params['id'],
      words: params['words']
    }
    ui.save
    render json: {updated: true, words: ui.settings['core_word_list']}
  end
  
  def message_bank_suggestions
    list = WordData.message_bank_suggestions
    render json: list
  end
  
  def daily_stats
    user = User.find_by_path(params['user_id'])
    return unless allowed?(user, 'supervise')
    begin
      options = request.query_parameters
      render json: Stats.cached_daily_use(user.global_id, options)
    rescue Stats::StatsError => e
      api_error 400, {error: e.message}
    end
  end
  
  def daily_use
    # Authentication is enforced by require_api_token before_action (daily_use is not in :except).
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    # Cross-user daily usage logs stay limited to admin_support_actions to avoid privilege escalation.
    unless user.global_id == @api_user.global_id
      scopes = api_permission_scopes
      ok = user.allows?(@api_user, 'admin_support_actions', scopes)
      unless ok
        api_error 400, {error: 'Not authorized', unauthorized: true}
        return
      end
      # Accounting-of-disclosure: admin-support reads of another user's daily-use
      # communication log are timestamped.
      AuditEvent.log_command(@api_user.global_id, {
        'type' => 'admin_support_daily_use_read',
        'user_id' => user.global_id
      })
    end
    log = LogSession.find_by(:user_id => user.id, :log_type => 'daily_use')
    if log
      render json: JsonApi::Log.as_json(log, :wrapper => true, :permissions => @api_user)
    else
      # No LogSession row yet — omit persisted id so the client does not push a fake
      # record into the store (log is created when usage is first pushed via stashes).
      render json: {
        log: {
          empty_daily_use_log: true,
          type: 'daily_use',
          user: { id: user.global_id, user_name: user.user_name },
          author: { id: user.global_id, user_name: user.user_name },
          daily_use: []
        }
      }
    end
  end
  
  def hourly_stats
    user = User.find_by_path(params['user_id'])
    return unless allowed?(user, 'supervise')
    begin
      options = request.query_parameters
      render json: Stats.hourly_use(user.global_id, options)
    rescue Stats::StatsError => e
      api_error 400, {error: e.message}
    end
  end

  def alerts
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'supervise')
    alerts = LogSession.where(user: user, log_type: 'note').order('id DESC').select{|s| s.data['notify_user'] && !s.alert_cleared? }
    render json: JsonApi::Alert.paginate(params, alerts)
  end

  def protected_image
    user = User.find_by_path(params['user_id'])
    api_user = User.find_by_protected_image_token(params['user_token'])
    valid_result = nil
    if !api_user
      expires_in 30.minutes, :public => true
      fallback = Uploader.fallback_image_url(params['image_id'], params['library'])
      if fallback
        res = grab_url(fallback)
        send_data res.body, :type => res.headers['Content-Type'], :disposition => 'inline'
        return
      end
      return redirect_to '/images/square.svg'
    else
      users = [user, api_user].uniq
      users.each do |user|
        next if valid_result || !user
        safe_url = ButtonImage.cached_copy_url(request.original_url, user, false)
        if safe_url
          expires_in 12.days, :public => true
          return redirect_to safe_url, allow_other_host: true
        end
        url = Uploader.found_image_url(params['image_id'], params['library'], user)
        if url
          url = url.sub(/^https/, 'http') if params['library'] == 'lessonpix'
          begin
            Timeout.timeout(5) do
              res = grab_url(url)
              if res.headers['Content-Type'] && res.headers['Content-Type'].match(/image/)
                valid_result = res
                expires_in 12.days, :public => true
              end
            end
          rescue Timeout::Error => e
            valid_result = nil
          end
        end
      end
    end
    if valid_result
      expires_in 24.hours, :public => true
      send_data valid_result.body, :type => valid_result.headers['Content-Type'], :disposition => 'inline'
    else
      expires_in 30.minutes, :public => true
      fallback = Uploader.fallback_image_url(params['image_id'], params['library'])
      if fallback
        res = grab_url(fallback)
        send_data res.body, :type => res.headers['Content-Type'], :disposition => 'inline'                
      else
        redirect_to '/images/error.png'
      end
    end
  end

  
  def translate
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'delete')
    # Board translation is not gated by org external_ai_processing (that
    # off-switch covers voice transcription). The Translate Boards modal
    # shows a Google Cloud Translation disclaimer before this call.
    res = WordData.translate_batch(params['words'].map{|w| {:text => w } }, params['source_lang'], params['destination_lang'])
    render json: res
  end
  
  def word_map
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'view_word_map')
    res = BoardDownstreamButtonSet.word_map_for(user)
    render json: res
  end

  def transfer_eval
    # TODO: throttling
    # supervisor or user may transfer the eval
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'edit')
    return allowed?(user, 'never_allow') unless user.eval_account?
    target = User.find_by_path(params['user_name'])
    if !target || !target.valid_password?(params['password'])
      return api_error(400, {error: 'invalid_credentials'})
    end
    progress = Progress.schedule(user, :transfer_eval_to, target.global_id, @api_device_id, true, for_user: @api_user)
    render json: JsonApi::Progress.as_json(progress, :wrapper => true)
  end

  def reset_eval
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'edit')
    # if user has supervisors, then only the supervisor can reset the eval
    return allowed?(user, 'never_allow') if user == @api_user && !user.supervisors.blank?
    # if user has a managed org, then they can't reset their own eval
    return allowed?(user, 'never_allow') if user == @api_user && Organization.managed?(user)
    return api_error(400, {error: "not an eval account"}) unless user.eval_account?

    if !params['email'] || params['email'] == user.settings['email']
#      return api_error(400, {error: 'new email cannot match previous email'})
    end

    opts = {
      'email' => params['email'], 
      'password' => params['password'], 
      'home_board_key' => params['home_board_key'],
      'symbol_library' => params['symbol_library']
    }
    if params['expires']
      opts['expires'] = params['expires']
    end

    progress = Progress.schedule(user, :reset_eval, @api_device_id, opts, for_user: @api_user)
    render json: JsonApi::Progress.as_json(progress, :wrapper => true)
  end

  def update_2fa
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'edit')
    if params['action_2fa'] == 'enable' || (params['action_2fa'] == 'reset' && (user.settings['2fa'] || user.settings['tmp_2fa']))
      user.assert_2fa!(user.global_id == @api_user.global_id)
    elsif params['action_2fa'] == 'disable'
      user.settings.delete('2fa')
      user.settings.delete('tmp_2fa')
      user.save
    elsif params['action_2fa'] == 'confirm'
      ts = user.valid_2fa?(params['code_2fa'])
      return api_error 400, {error: "invalid code: #{params['code_2fa']}"} unless ts
    else
      return api_error 400, {error: "unregognized action: #{params['action_2fa']}"}
    end
    res = {updated: true, state: user.state_2fa}
    if (user.settings || {})['tmp_2fa']
      res[:uri] = user.uri_2fa 
    end
    render json: res
  end

  def external_nonce
    nonce = ExternalNonce.find_by_global_id(params['nonce_id'])
    if params['ref_type'] == 'log_session' && params['ref_id']
      session = LogSession.find_by_global_id(params['ref_id'])
      return unless exists?(session, params['ref_id'])
      return unless allowed?(session.user, 'supervise')
    else
      nonce = nil
    end
    return unless exists?(nonce, params['nonce_id'])
    render json: nonce.encryption_result
  end
  
  private

  def schedule_parental_consent_request_email!(user)
    # Mail goes to settings['coppa']['parent_email'] (see UserMailer#parental_consent_request).
    UserMailer.schedule_parent_consent_delivery(:parental_consent_request, user.global_id)
  end

  def parental_consent_resend_redis_key(user)
    "parental_consent_resend:#{user.global_id}"
  end

  def parental_consent_resend_ttl_seconds
    180
  end

  protected
  def grab_url(url)
    res = Typhoeus.get(url, timeout: 3)
    if res.headers['Location']
      res = Typhoeus.get(URI.escape(res.headers['Location']), timeout: 3)
    end
    res
  end

  # Supervise-only supervisors may set a communicatee's home board.
  #
  # Do NOT require the payload to contain only `preferences`. Ember's `user.save()`
  # serializes the WHOLE record — verified against the running app, a real pick sends
  # user[user_name], user[user_token], user[link], user[name], user[email],
  # user[description] and ~20 more alongside preferences. An earlier version of this
  # check required `(top_keys - ['preferences']).empty?`, which no real client request
  # can satisfy, so every supervise-only pick fell through to `allowed?(user, 'edit')`
  # and 400'd. Its spec passed only because the spec sent a payload shape the app
  # never produces.
  #
  # Safety comes from DISCARDING rather than from inspecting: whatever else the client
  # sent, supervise_home_board_update_slice throws it all away and keeps home_board
  # alone, and User#process_home_board still requires the board to be viewable by the
  # communicatee or shareable by the updater.
  def supervise_home_board_update?(data)
    return false unless data.is_a?(Hash)

    prefs = data['preferences'] || data[:preferences]
    return false unless prefs.is_a?(Hash)

    home_board = prefs['home_board'] || prefs[:home_board]
    # Require a real board reference. `!!home_board` also accepted `{}`, which sliced
    # to an empty home_board and persisted `preferences.home_board = {}` — leaving the
    # communicatee worse off than the nil they started with, since User#process_home_board
    # (user.rb:2467) only runs when an id is present and so never cleaned it up.
    home_board.is_a?(Hash) && (home_board['id'] || home_board[:id]).present?
  end

  def supervise_home_board_update_slice(data)
    prefs = data['preferences'] || data[:preferences]
    home_board = prefs['home_board'] || prefs[:home_board]
    { 'preferences' => { 'home_board' => home_board } }
  end
end
