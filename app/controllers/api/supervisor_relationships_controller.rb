class Api::SupervisorRelationshipsController < ApplicationController
  before_action :require_api_token, except: [:consent_lookup, :consent_response, :approve, :deny]

  def index
    return unless @api_user
    role = params['role'] # 'supervisor' or 'communicator'
    status_filter = params['status']

    if role == 'supervisor'
      rels = SupervisorRelationship.where(supervisor_user_id: @api_user.id)
    elsif role == 'communicator'
      rels = SupervisorRelationship.where(communicator_user_id: @api_user.id)
    else
      rels = SupervisorRelationship.where(
        'supervisor_user_id = ? OR communicator_user_id = ?', @api_user.id, @api_user.id
      )
    end

    if status_filter.present?
      rels = rels.where(status: status_filter)
    end

    rels = rels.includes(:supervisor_user, :communicator_user, :organization).order('created_at DESC')
    render json: JsonApi::SupervisorRelationship.paginate(params, rels)
  end

  def show
    rel = SupervisorRelationship.find_by_global_id(params['id'])
    return unless exists?(rel, params['id'])
    return unless user_is_party?(rel)
    render json: JsonApi::SupervisorRelationship.as_json(rel, wrapper: true).to_json
  end

  def create
    return unless @api_user
    rel_params = params['supervisor_relationship'] || {}
    rel_params = rel_params.permit! if rel_params.is_a?(ActionController::Parameters)

    lookup_key = rel_params['lookup_key'].presence ||
                 rel_params['owner_email'].presence ||
                 rel_params['communicator_lookup'].presence
    permission_level = rel_params['permission_level'].presence || 'view_only'
    permission_level = { 'read_only' => 'view_only', 'edit' => 'edit_boards' }.fetch(permission_level, permission_level)
    service = SupervisorConsentService.new
    result = service.request_access(
      supervisor: @api_user,
      lookup_key: lookup_key,
      permission_level: permission_level,
      organization_id: rel_params['organization_id']
    )

    AuditEvent.log_command(@api_user.global_id, {
      'type' => 'supervisor_access_request',
      'lookup_key' => lookup_key,
      'permission_level' => permission_level,
      'organization_id' => rel_params['organization_id']
    })
    render json: { meta: { message: result[:message] } }.to_json
  end

  def consent_lookup
    token = params['token']
    rel = SupervisorRelationship.find_by(consent_response_token: token)
    
    # F8: Prevent token leaking via Referer headers
    response.headers['Referrer-Policy'] = 'no-referrer'

    if rel && rel.token_valid?
      render json: {
        id: rel.global_id,
        requester_name: rel.supervisor_user.display_user_name,
        communicator_name: rel.communicator_user.display_user_name,
        permission_level: rel.permission_level,
        permission_level_description: SupervisorRelationship::PERMISSION_DESCRIPTIONS[rel.permission_level],
        requested_at: rel.consent_requested_at&.iso8601,
        expires_at: rel.consent_token_expires_at&.iso8601,
        requires_auth: true
      }.to_json
    else
      status = (rel && rel.status != 'pending') ? 410 : 404
      api_error status, { error: 'Request not found or expired' }
    end
  end

  def consent_response
    decision = consent_decision
    unless decision == 'approve' || decision == 'deny'
      return api_error 400, { error: 'invalid_decision' }
    end

    token = params['token'].presence || params['consent_response_token'].presence
    service = SupervisorConsentService.new

    # Held so a REJECTED in-app attempt can still name its subject: the service
    # returns only an :error for not_authorized / not_pending, with no
    # :relationship, and a wrong-party approval attempt is precisely the event
    # worth auditing with the relationship attached.
    resolved_rel = nil

    result = if token.present?
               decision == 'approve' ? service.approve(token: token) : service.deny(token: token)
             elsif params['id'].present? && @api_user
               # In-app pending list: relationship global id + authenticated communicator
               resolved_rel = SupervisorRelationship.find_by_global_id(params['id'])
               return unless exists?(resolved_rel, params['id'])
               if decision == 'approve'
                 service.approve_as_party(relationship: resolved_rel, actor: @api_user)
               else
                 service.deny_as_party(relationship: resolved_rel, actor: @api_user)
               end
             elsif params['id'].present?
               # Unauthenticated path where the consent token was passed as :id
               decision == 'approve' ? service.approve(token: params['id']) : service.deny(token: params['id'])
             else
               { error: 'invalid_or_expired_token' }
             end

    rel = result[:relationship] || resolved_rel
    # Log the DECISION, not just the successful decision. A rejected attempt —
    # expired token, wrong party, already-answered relationship — is the event a
    # reviewer most needs, and previously it left no trace at all. Never log the
    # consent token itself; `outcome`/`reason` carry the diagnosis instead.
    #
    # A rejection is only recorded when the attempt actually resolved to a
    # relationship. This endpoint is reachable unauthenticated, so writing a row
    # for every unresolvable token would let anyone drive unbounded inserts into
    # the audit table by replaying random strings — turning the audit trail into
    # an amplification vector. Those attempts also carry no subject (no
    # relationship, supervisor, or communicator to name), so the row would record
    # nothing a reviewer could act on. Detecting token guessing is a rate-limiting
    # concern, not an audit-trail one.
    if rel || result[:error].nil?
      actor_id = @api_user&.global_id || rel&.communicator_user&.global_id || 'consent_flow'
      AuditEvent.log_command(actor_id, {
        'type' => 'supervisor_consent_response',
        'decision' => decision,
        'outcome' => result[:error] ? 'rejected' : 'accepted',
        'reason' => result[:error],
        'relationship_id' => rel&.global_id,
        'supervisor_id' => rel&.supervisor_user&.global_id,
        'communicator_id' => rel&.communicator_user&.global_id
      })
    end

    if result[:error]
      api_error 400, { error: result[:error] }
    else
      render json: JsonApi::SupervisorRelationship.as_json(rel, wrapper: true).to_json
    end
  end

  def approve
    consent_response
  end

  def deny
    consent_response
  end

  def destroy
    rel = SupervisorRelationship.find_by_global_id(params['id'])
    return unless exists?(rel, params['id'])
    return unless user_is_party?(rel)

    service = SupervisorConsentService.new
    result = service.revoke(
      relationship: rel,
      revoker: @api_user,
      reason: params['reason']
    )

    if result[:error]
      api_error 400, { error: result[:error] }
    else
      AuditEvent.log_command(@api_user.global_id, {
        'type' => 'supervisor_relationship_revoked',
        'relationship_id' => result[:relationship]&.global_id,
        'reason' => params['reason']
      })
      render json: JsonApi::SupervisorRelationship.as_json(result[:relationship], wrapper: true).to_json
    end
  end

  private

  # Rails reserves params['action'] for the controller action name, so clients must
  # send decision/consent_action (or hit PUT approve/deny member routes).
  def consent_decision
    explicit = params['decision'].presence || params['consent_action'].presence
    return explicit if explicit == 'approve' || explicit == 'deny'

    name = action_name.to_s
    return 'approve' if name == 'approve'
    return 'deny' if name == 'deny'

    nil
  end

  def user_is_party?(rel)
    unless @api_user && (rel.supervisor_user_id == @api_user.id || rel.communicator_user_id == @api_user.id)
      api_error 400, { error: 'Not authorized' }
      return false
    end
    true
  end
end
