class Api::EvalProtocolsController < ApplicationController
  before_action :require_api_token

  def index
    return unless feature_enabled?
    user = User.find_by_path(params['user_id']) if params['user_id']
    if user
      return unless allowed?(user, 'supervise')
    end

    list = EvalProtocol.static_templates
    list += EvalProtocol.where(organization_id: nil).where.not(public_protocol_id: nil) if params['include_db']
    if user
      org_ids = Organization.attached_orgs(user).map {|o| o['id'] }
      list += EvalProtocol.where(organization_id: User.local_ids(org_ids)) if org_ids.any?
    end
    list = list.uniq

    render json: list.map {|p| JsonApi::EvalProtocol.as_json(p, permissions: @api_user) }
  end

  def show
    return unless feature_enabled?
    protocol = EvalProtocol.find_by_code(params['id'])
    return unless exists?(protocol, params['id'])
    return unless allowed?(protocol, 'view')
    render json: JsonApi::EvalProtocol.as_json(protocol, wrapper: true, permissions: @api_user)
  end

  protected

  def feature_enabled?
    return true if FeatureFlags.feature_enabled_for?('quick_screen_eval', @api_user)
    api_error 400, { error: 'feature not enabled' }
    false
  end
end
