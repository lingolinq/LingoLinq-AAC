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
    token = params['token'] || params['consent_response_token'] || params['id']
    action = params['action']
    
    service = SupervisorConsentService.new
    result = if action == 'approve'
               service.approve(token: token)
             else
               service.deny(token: token)
             end

    if result[:error]
      api_error 400, { error: result[:error] }
    else
      render json: JsonApi::SupervisorRelationship.as_json(result[:relationship], wrapper: true).to_json
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
      render json: JsonApi::SupervisorRelationship.as_json(result[:relationship], wrapper: true).to_json
    end
  end

  private

  def user_is_party?(rel)
    unless @api_user && (rel.supervisor_user_id == @api_user.id || rel.communicator_user_id == @api_user.id)
      api_error 400, { error: 'Not authorized' }
      return false
    end
    true
  end
end
