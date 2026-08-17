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
    result = transition_by_token(token) { |rel| finalize_approve(rel) }
    schedule_after_commit(result, :consent_approved)
    result
  end

  # Logged-in communicator approves from the in-app pending list (relationship id, not email token).
  def approve_as_party(relationship:, actor:)
    result = transition_as_party(relationship, actor) { |rel| finalize_approve(rel) }
    schedule_after_commit(result, :consent_approved)
    result
  end

  def deny(token:)
    transition_by_token(token) { |rel| finalize_deny(rel) }
  end

  def deny_as_party(relationship:, actor:)
    transition_as_party(relationship, actor) { |rel| finalize_deny(rel) }
  end

  def revoke(relationship:, revoker:, reason: nil)
    return { error: 'not_active' } unless relationship

    revoker_type = if revoker && revoker.id == relationship.supervisor_user_id
                     'supervisor'
                   else
                     'communicator'
                   end

    result = locked_transition(
      relationship,
      # Re-read inside the lock: a concurrent revoke (or an expiry sweep) can move
      # the row off 'approved' between the caller's read and this write.
      recheck: ->(rel) { rel.status == 'approved' ? nil : { error: 'not_active' } }
    ) do |rel|
      rel.update!(
        status: 'revoked',
        revoked_at: Time.current,
        revoked_by: revoker&.id,
        revocation_reason: reason
      )

      User.unlink_supervisor_from_user(rel.supervisor_user, rel.communicator_user)

      { relationship: rel }
    end

    schedule_after_commit(result, :supervisor_revoked, revoker_type)
    result
  end

  private

  # ---------------------------------------------------------------------------
  # Concurrency
  #
  # Every consent transition is a check-then-act on a row that two different
  # parties can reach at the same time: the guardian's emailed approve/deny links
  # and the communicator's in-app pending list. Previously nothing serialized
  # them — no `with_lock`, no `transaction`, no conditional UPDATE — so a
  # simultaneous approve and deny both read `status == 'pending'`, both passed
  # their guard, and both wrote. Two orderings, both wrong:
  #
  #   * deny commits last  -> row reads 'denied', but finalize_approve has ALREADY
  #                           called link_supervisor_to_user, leaving a live
  #                           supervisor link on a relationship the guardian
  #                           refused. This is the dangerous one: the audit trail
  #                           and the UI say "denied" while access is real.
  #   * approve commits last -> the guardian's denial is silently overwritten.
  #
  # The same gap admitted approval after expiry, because `token_valid?` was
  # evaluated on a copy read before the write.
  #
  # Fix: load, then take a row-level lock, then re-validate against committed
  # state, then transition — all inside one transaction, so the status write and
  # the supervisor-link change either both land or neither does. A competing
  # transition blocks on the lock and, when it resumes, fails its recheck.
  # ---------------------------------------------------------------------------

  # Token path. Every failure mode collapses to one generic error so the endpoint
  # does not distinguish "no such token" from "already answered" from "expired".
  def transition_by_token(token, &block)
    return { error: 'invalid_or_expired_token' } if token.blank?

    relationship = SupervisorRelationship.find_by(consent_response_token: token)
    return { error: 'invalid_or_expired_token' } unless relationship && relationship.token_valid?

    locked_transition(
      relationship,
      recheck: ->(rel) { rel.token_valid? ? nil : { error: 'invalid_or_expired_token' } },
      &block
    )
  end

  # In-app path. Preserves this path's more specific error contract
  # (not_authorized / not_pending / invalid_or_expired_token).
  def transition_as_party(relationship, actor, &block)
    auth_error = party_response_error(relationship, actor)
    return auth_error if auth_error

    locked_transition(
      relationship,
      recheck: ->(rel) { party_response_error(rel, actor) },
      &block
    )
  end

  # `with_lock` opens a transaction and issues SELECT ... FOR UPDATE, which
  # reloads the row, so `recheck` runs against committed state rather than the
  # attributes the caller read earlier.
  def locked_transition(relationship, recheck:)
    return { error: 'invalid_or_expired_token' } unless relationship&.persisted?

    # Re-find rather than locking the caller's instance. `with_lock` calls `lock!`,
    # which raises on a record carrying unsaved changes, so a caller that handed us
    # a modified object would get a 500 instead of a transition. Re-finding also
    # guarantees the recheck below evaluates committed state rather than whatever
    # the caller happened to have assigned in memory.
    relationship = relationship.class.find(relationship.id)

    result = nil
    relationship.with_lock do
      stale = recheck.call(relationship)
      result = stale || yield(relationship)
    end
    result
  end

  # Mail is scheduled only after the transaction has committed. `schedule_delivery`
  # pushes onto Resque immediately (mailers/concerns/general.rb:24), so enqueuing
  # inside the lock would let a worker dequeue and read the row before this
  # transaction commits — the mailers re-load by global_id and would see the
  # pre-transition state.
  #
  # `after_all_transactions_commit` rather than a bare call, because being outside
  # `with_lock` is not the same as being outside a transaction. If a caller wraps
  # this service in its own transaction, `with_lock` joins that transaction instead
  # of opening one, so by the time control returns here nothing has committed yet
  # and a later rollback would leave an email queued for a transition that never
  # happened. With no surrounding transaction the block runs immediately, so the
  # ordinary controller path is unchanged.
  def schedule_after_commit(result, delivery_type, *args)
    return unless result.is_a?(Hash) && result[:error].nil?

    relationship = result[:relationship]
    return unless relationship

    ActiveRecord.after_all_transactions_commit do
      SupervisorMailer.schedule_delivery(delivery_type, relationship.global_id, *args)
    end
  end

  def party_response_error(relationship, actor)
    return { error: 'not_authorized' } unless actor && relationship && relationship.communicator_user_id == actor.id
    return { error: 'not_pending' } unless relationship.status == 'pending'
    if relationship.consent_token_expires_at.present? && relationship.consent_token_expires_at <= Time.current
      return { error: 'invalid_or_expired_token' }
    end
    nil
  end

  # Runs inside the caller's lock and transaction. Mail is NOT scheduled here;
  # see schedule_after_commit.
  def finalize_approve(relationship)
    relationship.update!(
      status: 'approved',
      consent_responded_at: Time.current,
      activated_at: Time.current,
      consent_response_token: nil
    )

    link_type = relationship.user_link_type
    User.link_supervisor_to_user(relationship.supervisor_user, relationship.communicator_user, nil, link_type)

    { relationship: relationship }
  end

  def finalize_deny(relationship)
    relationship.update!(
      status: 'denied',
      consent_responded_at: Time.current,
      consent_response_token: nil
    )

    { relationship: relationship }
  end
end
