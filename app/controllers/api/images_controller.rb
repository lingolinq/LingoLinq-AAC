class Api::ImagesController < ApplicationController
  include RemoteUploader
  before_action :require_api_token, :except => [:upload_success]
  
  def create
    image_data = params['image']
    image_data = image_data.permit! if image_data.is_a?(ActionController::Parameters)
    if !image_data || !image_data['content_type']
      return api_error(400, {error: 'content type required for image creationg'})
    end
    image = ButtonImage.process_new(image_data, {:user => @api_user, :remote_upload_possible => true})
    if !image || image.errored?
      api_error(400, {error: "image creation failed", errors: image && image.processing_errors})
    elsif !image.settings['content_type']
      api_error(400, {error: 'content type required for image creationg'})
    else
      render json: JsonApi::Image.as_json(image, :wrapper => true, :permissions => @api_user).to_json
    end
  end
  
  def show
    image = ButtonImage.find_by_path(params['id'])
    image = nil if params['id'].match(/^tmpimg/)
    return unless exists?(image)
    return unless allowed?(image, 'view')
    args = {:wrapper => true, :permissions => @api_user}

    # It's important that this match cached data, but edit mode will possibly
    # mismatch as a result, so make sure to check for original when editing
    pref = @api_user && @api_user.settings['preferences']['preferred_symbols']
    args[:preferred_source] = pref if pref

    if @api_user && (@api_user.supporter_role? || (@api_user.settings['preferences']['preferred_symbols'] || 'original') != 'original')
      args[:include_other_sources] = true
      args[:allowed_sources] = (@api_user && @api_user.enabled_protected_sources(true)) || []
    else
    end
    render json: JsonApi::Image.as_json(image, args).to_json
  end
  
  def update
    image = ButtonImage.find_by_path(params['id'])
    return unless exists?(image)
    return unless allowed?(image, 'view')
    image_update = params['image']
    image_update = image_update.permit! if image_update.is_a?(ActionController::Parameters)
    if image.process(image_update, {:user => @api_user})
      render json: JsonApi::Image.as_json(image, :wrapper => true, :permissions => @api_user).to_json
    else
      api_error(400, {error: "image update failed", errors: image.processing_errors})
    end
  end
end