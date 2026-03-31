class SupervisorKeyProcessor
  attr_reader :user, :key_string

  def initialize(user, key_string)
    @user = user
    @key_string = key_string
  end

  def call
    return false unless key_string && key_string.is_a?(String) && key_string.length > 0
    action, @key = key_string.split(/-/, 2)
    return false unless action && action.length > 0
    @action_parts = action.split(/_/)

    case action
    when 'approve_supervision'
      process_approve_supervision
    when 'remove_supervision'
      process_remove_supervision
    when 'remove_supervisor'
      process_remove_supervisor
    when 'remove_supervisee'
      process_remove_supervisee
    when 'request_supervision'
      process_request_supervision
    when 'approve_consent'
      process_approve_consent
    when 'deny_consent'
      process_deny_consent
    else
      case @action_parts[0]
      when 'add'
        process_add
      when 'approve'
        if @key == 'org'
          process_approve_org
        else
          false
        end
      when 'start'
        process_start
      else
        false
      end
    end
  end

  private

  def process_add
    return false unless user.any_premium_or_grace_period? && user.id
    supervisor = User.find_by_path(@key)
    if @key.match(/@/)
      users = User.find_by_email(@key)
      supervisor = users[0] if users.length == 1
    end
    return false if !supervisor || user == supervisor
    grant_code = nil
    grant_code = 'granted' if @action_parts.include?('premium') && user.premium_supporter_grants > 0
    type = nil
    type = 'edit' if @action_parts.include?('edit')
    type = 'modeling_only' if @action_parts.include?('modeling')
    User.link_supervisor_to_user(supervisor, user, nil, type, grant_code)
    true
  end

  def process_approve_org
    user.settings['pending'] = false
    user.update_subscription_organization(user.managing_organization(true).global_id, false, nil, nil)
    true
  end

  def process_approve_supervision
    org = Organization.find_by_global_id(@key)
    if org.pending_supervisor?(user)
      org.approve_supervisor(user)
      true
    elsif org.supervisor?(user)
      true
    else
      false
    end
  end

  def process_remove_supervision
    org = Organization.find_by_global_id(@key)
    org.reject_supervisor(user)
    true
  end

  def process_remove_supervisor
    if @key.match(/^org/)
      org_id = @key.split(/-/)[1]
      org_id ||= user.managing_organization && user.managing_organization.global_id
      user.update_subscription_organization("r#{org_id}") if org_id
    else
      supervisor = User.find_by_path(@key)
      return false unless supervisor && user
      User.unlink_supervisor_from_user(supervisor, user)
    end
    true
  end

  def process_remove_supervisee
    supervisor = user
    communicator = User.find_by_path(@key)
    return false unless supervisor && communicator
    User.unlink_supervisor_from_user(supervisor, communicator)
  end

  def process_start
    res = Organization.parse_activation_code(@key, user)
    return false if !res || res[:disabled]
    user.instance_variable_set(:@start_code_progress, res[:progress])
    true
  end

  def process_request_supervision
    return false unless FeatureFlags.feature_enabled_for?('supervisor_consent_flow', user)
    communicator = User.find_by_path(@key)
    return false unless communicator && communicator != user
    rel = SupervisorRelationship.find_or_initialize_by(
      supervisor_user: user,
      communicator_user: communicator,
      status: 'pending'
    )
    return true if rel.persisted?
    rel.initiated_by = 'supervisor'
    rel.creation_method = 'supervisor_key'
    rel.save!
    rel.generate_consent_token!
    true
  end

  def process_approve_consent
    rel = SupervisorRelationship.find_by(consent_response_token: @key)
    return false unless rel && rel.token_valid?
    return false if rel.supervisor_user_id == user.id
    return false unless rel.communicator_user_id == user.id
    rel.update!(
      status: 'approved',
      consent_responded_at: Time.current,
      activated_at: Time.current,
      consent_response_token: nil
    )
    User.link_supervisor_to_user(rel.supervisor_user, rel.communicator_user, nil, rel.user_link_type)
    true
  end

  def process_deny_consent
    rel = SupervisorRelationship.find_by(consent_response_token: @key)
    return false unless rel && rel.token_valid?
    return false if rel.supervisor_user_id == user.id
    return false unless rel.communicator_user_id == user.id
    rel.update!(
      status: 'denied',
      consent_responded_at: Time.current,
      consent_response_token: nil
    )
    true
  end
end
