class SupervisorKeyProcessor
  attr_reader :user, :key_string

  # `actor` is the user who submitted the key, which is NOT always the target:
  # Api::UsersController#update accepts a supervisor_key from anyone holding
  # manage_supervision or edit on the target, and User#process_params then runs
  # process_supervisor_key with `self` = the TARGET. Defaults to the target so
  # existing callers keep their current (self-action) behaviour.
  def initialize(user, key_string, actor=nil)
    @user = user
    @key_string = key_string
    @actor = actor || user
  end

  attr_reader :actor

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

  def authority
    @authority ||= SupervisorKeyAuthority.new(actor, user)
  end

  # Returns true when this actor may RATIFY a pending attachment. On refusal it
  # audits and returns false, so the caller degrades to "key not processed"
  # rather than raising. A refused third-party ratification is exactly the event
  # a reviewer needs, and without this it would leave no trace at all.
  def permitted_ratification?(org, action)
    return true if authority.allows_ratification?
    AuditEvent.log_command('system', authority.denial_event(org, action))
    false
  end

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
    # Ratifying a pending org attachment IS the consent step, so only the party
    # themselves may do it. Resolve the org first so nothing is written on a
    # refusal, and so a nil org cannot reach `settings['pending'] = false` below.
    org = user.managing_organization(true)
    return false unless org.is_a?(Organization)
    return false unless permitted_ratification?(org, 'approve-org')
    user.settings['pending'] = false
    user.update_subscription_organization(org.global_id, false, nil, nil)
    true
  end

  def process_approve_supervision
    org = Organization.find_by_global_id(@key)
    # Same consent step as approve-org, by a different link type:
    # Organization#approve_supervisor sets an org_supervisor link non-pending,
    # and Organization.manager_for? counts NON-PENDING org_supervisor links
    # alongside org_user ones, so this reaches the same support_actions grant.
    return false unless org.is_a?(Organization)
    return false unless permitted_ratification?(org, 'approve_supervision')
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
    # A third party may enrol someone, but the attachment lands PENDING so it
    # confers no authority until the party themselves ratifies it. Self-service
    # redemption is unchanged and stays a single, immediately-active step.
    force_pending = authority.attachment_must_be_pending?
    res = Organization.parse_activation_code(@key, user, force_pending: force_pending)
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

  # Both consent transitions delegate to SupervisorConsentService rather than
  # reimplementing them.
  #
  # These were a complete second copy of the transition -- find_by(token),
  # token_valid?, update!, link_supervisor_to_user -- with no lock, no
  # transaction, and no in-lock recheck. That made this a live bypass of the
  # serialization the service provides: a supervisor_key approve issued while the
  # guardian clicks the emailed deny link performs a plain SELECT that
  # SELECT ... FOR UPDATE does not block, passes token_valid? on the pre-commit
  # snapshot, then blocks on its own UPDATE (which carries no status predicate)
  # and overwrites 'denied' with 'approved' plus a live supervisor link. Exactly
  # the defect the service was written to eliminate, reachable through
  # PUT /api/v1/users/:id with user[supervisor_key].
  #
  # Delegating also means these transitions now emit the consent_approved mail
  # and participate in the same after-commit ordering; previously this path
  # produced an approval with no mail and no accounting record at all.
  #
  # approve_as_party / deny_as_party (not the token-only entry points) because
  # this path has an authenticated actor, and the party methods enforce that the
  # actor IS the communicator -- preserving the two identity checks these methods
  # made, rather than treating token possession as sufficient.
  def process_approve_consent
    consent_transition(:approve_as_party)
  end

  def process_deny_consent
    consent_transition(:deny_as_party)
  end

  def consent_transition(method)
    rel = SupervisorRelationship.find_by(consent_response_token: @key)
    return false unless rel && rel.token_valid?

    result = SupervisorConsentService.new.send(method, relationship: rel, actor: user)
    result[:error].nil?
  end
end
