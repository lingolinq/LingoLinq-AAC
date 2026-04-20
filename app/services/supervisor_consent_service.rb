class SupervisorConsentService
  GENERIC_LOOKUP_MESSAGE = "If an account matching that information exists, an email has been sent.".freeze

  def create_with_supervisor(supervisor:, communicator_params:, owner_email:, permission_level: 'edit_boards')
    communicator = User.process_new(communicator_params)
    return { error: 'communicator_creation_failed', communicator: communicator } if communicator.errored?

    relationship = SupervisorRelationship.create!(
      supervisor_user: supervisor,
      communicator_user: communicator,
      status: 'approved',
      permission_level: permission_level,
      initiated_by: 'supervisor',
      creation_method: 'supervisor_created_account',
      supervisor_created_account: true,
      consent_responded_at: Time.current,
      activated_at: Time.current,
      consent_email_sent_to: owner_email,
      metadata: { 'owner_email' => owner_email }
    )

    link_type = relationship.user_link_type
    User.link_supervisor_to_user(supervisor, communicator, nil, link_type)

    { relationship: relationship, communicator: communicator }
  end

  def request_access(supervisor:, lookup_key:, permission_level: 'view_only', organization_id: nil)
    # F1: Anti-timing side-channel.
    if lookup_key.blank?
      ::BCrypt::Password.create(SecureRandom.hex) rescue nil
      return { message: GENERIC_LOOKUP_MESSAGE }
    end

    communicator = User.find_by_path(lookup_key)
    if !communicator && lookup_key.to_s.include?('@')
      users = User.find_by_email(lookup_key.downcase)
      communicator = users.first if users.length == 1
    end

    if communicator && communicator != supervisor
      # F6: Data Isolation - check organization compatibility
      comm_orgs = Organization.attached_orgs(communicator).map{|o| o['id']}
      sup_orgs = Organization.attached_orgs(supervisor).map{|o| o['id']}
      
      # If communicator is in an org, supervisor must be in same org or be a manager
      if comm_orgs.any? && (comm_orgs & sup_orgs).empty? && !Organization.manager_for?(supervisor, communicator)
        # Still return generic message to prevent leaking that user exists but is in different org
        ::BCrypt::Password.create(SecureRandom.hex) rescue nil
        return { message: GENERIC_LOOKUP_MESSAGE }
      end

      existing = SupervisorRelationship.where(
        supervisor_user: supervisor,
        communicator_user: communicator,
        status: ['pending', 'approved']
      ).first

      unless existing
        relationship = SupervisorRelationship.new(
          supervisor_user: supervisor,
          communicator_user: communicator,
          status: 'pending',
          permission_level: permission_level,
          initiated_by: 'supervisor',
          creation_method: 'request_access',
          lookup_method: lookup_key.include?('@') ? 'email' : 'username',
          organization_id: organization_id || (comm_orgs & sup_orgs).first
        )

        # F10: COPPA - Route to parent/guardian if under 13
        is_under_13 = communicator.settings['research_age'] == 'under_13' || 
                      communicator.settings['research_age'] == '0_12'
        
        target_email = nil
        if is_under_13 || communicator.settings['owner_email'].present?
          target_email = communicator.settings['owner_email']
        end
        
        # Fallback to user's email if no owner email found (or not under 13)
        target_email ||= communicator.settings['email']
        
        relationship.consent_email_sent_to = target_email
        relationship.save!
        relationship.generate_consent_token!
        
        SupervisorMailer.schedule_delivery(:consent_request, relationship.global_id)
      end
    else
      # Burn some time to match the "found" path
      ::BCrypt::Password.create(SecureRandom.hex) rescue nil
    end

    { message: GENERIC_LOOKUP_MESSAGE }
  end

  def approve(token:)
    relationship = SupervisorRelationship.find_by(consent_response_token: token)
    return { error: 'invalid_or_expired_token' } unless relationship && relationship.token_valid?

    relationship.update!(
      status: 'approved',
      consent_responded_at: Time.current,
      activated_at: Time.current,
      consent_response_token: nil
    )

    link_type = relationship.user_link_type
    User.link_supervisor_to_user(relationship.supervisor_user, relationship.communicator_user, nil, link_type)

    SupervisorMailer.schedule_delivery(:consent_approved, relationship.global_id)

    { relationship: relationship }
  end

  def deny(token:)
    relationship = SupervisorRelationship.find_by(consent_response_token: token)
    return { error: 'invalid_or_expired_token' } unless relationship && relationship.token_valid?

    relationship.update!(
      status: 'denied',
      consent_responded_at: Time.current,
      consent_response_token: nil
    )

    { relationship: relationship }
  end

  def revoke(relationship:, revoker:, reason: nil)
    return { error: 'not_active' } unless relationship.status == 'approved'

    revoker_type = if revoker.id == relationship.supervisor_user_id
                     'supervisor'
                   else
                     'communicator'
                   end

    relationship.update!(
      status: 'revoked',
      revoked_at: Time.current,
      revoked_by: revoker.id,
      revocation_reason: reason
    )

    User.unlink_supervisor_from_user(relationship.supervisor_user, relationship.communicator_user)

    SupervisorMailer.schedule_delivery(:supervisor_revoked, relationship.global_id, revoker_type)

    { relationship: relationship }
  end
end
