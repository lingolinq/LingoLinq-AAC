class Api::IntegrationsController < ApplicationController
  before_action :require_api_token, :except => [:show, :domain_settings]
  
  def index
    integrations = UserIntegration.where(:template => true).order('id ASC')
    if params['user_id']
      user = User.find_by_path(params['user_id'])
      return unless exists?(user, params['user_id'])
      return unless allowed?(user, 'supervise')
      # TODO: sharding
      integrations = UserIntegration.where(:user_id => user.id).order('id DESC')
      if params['for_button']
        integrations = integrations.where(:for_button => true)
      end
    end
    render json: JsonApi::Integration.paginate(params, integrations)
  end
  
  def show
    orig_id = params['id']
    if UserIntegration.global_integrations[params['id']]
      params['id'] = UserIntegration.global_integrations[params['id']]
    end
    integration = UserIntegration.find_by_path(params['id'])
    return unless exists?(integration, orig_id)
    return unless allowed?(integration, 'view')
    render json: JsonApi::Integration.as_json(integration, {wrapper: true, permissions: @api_user})
  end
  
  def create
    int_data = params['integration']
    int_data = int_data.permit! if int_data.is_a?(ActionController::Parameters)
    user = User.find_by_path(int_data['user_id'])
    return unless exists?(user, int_data['user_id'])
    return unless allowed?(user, 'supervise')
    integration = nil
    if int_data && int_data['integration_key']
      template = UserIntegration.find_by(template: true, integration_key: int_data['integration_key'])
      integration = UserIntegration.find_or_initialize_by(user: user, template_integration: template)
    end
    if integration
      integration.process(int_data, {user: user})
    else
      integration = UserIntegration.process_new(int_data, {user: user})
    end
    if integration.errored?
      api_error(400, {error: "integration creation failed", errors: integration && integration.processing_errors})      
    else
      render json: JsonApi::Integration.as_json(integration, {wrapper: true, permissions: @api_user})
    end
  end
  
  def update
    integration = UserIntegration.find_by_path(params['id'])
    return unless exists?(integration, params['id'])
    return unless allowed?(integration, 'edit')
    int_update = params['integration']
    int_update = int_update.permit! if int_update.is_a?(ActionController::Parameters)
    if integration.process(int_update)
      render json: JsonApi::Integration.as_json(integration, {wrapper: true, permissions: @api_user})
    else
      api_error(400, {error: "integration update failed", errors: integration.processing_errors})
    end
  end
  
  def destroy
    integration = UserIntegration.find_by_path(params['id'])
    return unless exists?(integration, params['id'])
    return unless allowed?(integration, 'delete')
    if integration.destroy
      render json: JsonApi::Integration.as_json(integration, {wrapper: true, permissions: @api_user})
    else
      api_error(400, {error: "integration deletion failed"})
    end
  end

  def domain_settings
    render json: @domain_overrides.to_json
  end

  def focus_usage
    UserIntegration.schedule(:track_focus, @api_user && @api_user.global_id, params['focus_id'])
    render json: {accepted: true}
  end
end
