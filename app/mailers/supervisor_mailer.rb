class SupervisorMailer < ActionMailer::Base
  include General
  helper MailerHelper
  default from: ENV['DEFAULT_EMAIL_FROM']
  layout 'email'

  def consent_request(relationship_id)
    @relationship = SupervisorRelationship.find_by_global_id(relationship_id)
    return unless @relationship && @relationship.status == 'pending'
    @supervisor = @relationship.supervisor_user
    @communicator = @relationship.communicator_user
    return unless @communicator
    @permission_description = SupervisorRelationship::PERMISSION_DESCRIPTIONS[@relationship.permission_level]
    @org = @relationship.organization
    @approve_url = consent_response_url(@relationship, 'approve')
    @deny_url = consent_response_url(@relationship, 'deny')
    
    target_email = @relationship.consent_email_sent_to
    if target_email.present?
      # F10: Route to parent/guardian if specified
      from = JsonApi::Json.current_domain['settings']['admin_email']
      opts = { to: target_email, subject: "#{app_name} - Supervisor Access Request" }
      opts[:from] = from if from.present?
      mail(opts)
    else
      mail_message(@communicator, "Supervisor Access Request")
    end
  end

  def consent_approved(relationship_id)
    @relationship = SupervisorRelationship.find_by_global_id(relationship_id)
    return unless @relationship
    @supervisor = @relationship.supervisor_user
    @communicator = @relationship.communicator_user
    return unless @supervisor
    @permission_description = SupervisorRelationship::PERMISSION_DESCRIPTIONS[@relationship.permission_level]
    mail_message(@supervisor, "Supervisor Access Approved")
  end

  def consent_denied(relationship_id)
    @relationship = SupervisorRelationship.find_by_global_id(relationship_id)
    return unless @relationship
    @supervisor = @relationship.supervisor_user
    @communicator = @relationship.communicator_user
    return unless @supervisor
    mail_message(@supervisor, "Supervisor Access Denied")
  end

  def supervisor_revoked(relationship_id, revoker_type)
    @relationship = SupervisorRelationship.find_by_global_id(relationship_id)
    return unless @relationship
    @supervisor = @relationship.supervisor_user
    @communicator = @relationship.communicator_user
    @revoker_type = revoker_type
    if revoker_type == 'supervisor'
      @recipient = @communicator
      @revoker = @supervisor
    else
      @recipient = @supervisor
      @revoker = @communicator
    end
    return unless @recipient
    @permission_description = SupervisorRelationship::PERMISSION_DESCRIPTIONS[@relationship.permission_level]
    mail_message(@recipient, "Supervisor Access Revoked")
  end

  private

  def consent_response_url(relationship, action)
    token = relationship.consent_response_token
    "#{JsonApi::Json.current_host}/consent/#{token}?action=#{action}"
  end
end
