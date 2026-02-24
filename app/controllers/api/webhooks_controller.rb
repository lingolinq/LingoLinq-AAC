class Api::WebhooksController < ApplicationController
  before_action :require_api_token
  
  def index
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'supervise')
    # TODO: sharding
    webhooks = Webhook.where(:user_id => user.id).order('id DESC')
    render json: JsonApi::Webhook.paginate(params, webhooks)
  end
  
  def create
    user = User.find_by_path(params['webhook']['user_id'])
    return unless exists?(user, params['webhook']['user_id'])
    return unless allowed?(user, 'supervise')
    webhook = Webhook.process_new(params['webhook'], {user: user})
    if webhook.errored?
      api_error(400, {error: "webhook creation failed", errors: webhook && webhook.processing_errors})      
    else
      render json: JsonApi::Webhook.as_json(webhook, {wrapper: true, permissions: @api_user})
    end
  end

  def test
    webhook = Webhook.find_by_path(params['webhook_id'])
    return unless exists?(webhook, params['webhook_id'])
    return unless allowed?(webhook, 'edit')
    progress = Progress.schedule(webhook, :test_notification)
    render json: JsonApi::Progress.as_json(progress, :wrapper => true).to_json
  end
  
  def update
    webhook = Webhook.find_by_path(params['id'])
    return unless exists?(webhook, params['id'])
    return unless allowed?(webhook, 'edit')
    if webhook.process(params['webhook'], {user: @api_user})
      render json: JsonApi::Webhook.as_json(webhook, {wrapper: true, permissions: @api_user})
    else
      api_error(400, {error: "webhook update failed", errors: webhook.processing_errors})
    end
  end
  
  def destroy
    webhook = Webhook.find_by_path(params['id'])
    return unless exists?(webhook, params['id'])
    return unless allowed?(webhook, 'delete')
    if webhook.destroy
      render json: JsonApi::Webhook.as_json(webhook, {wrapper: true, permissions: @api_user})
    else
      api_error(400, {error: "webhook deletion failed"})
    end
  end
end
