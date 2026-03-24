class Api::VideosController < ApplicationController
  include RemoteUploader
  before_action :require_api_token, :except => [:upload_success]

  def create
    video_data = params['video']
    video_data = video_data.permit! if video_data.is_a?(ActionController::Parameters)
    video = UserVideo.process_new(video_data, {:user => @api_user, :remote_upload_possible => true})
    if !video || video.errored?
      api_error(400, {error: "video creation failed", errors: video && video.processing_errors})
    else
      render json: JsonApi::Video.as_json(video, :wrapper => true, :permissions => @api_user).to_json
    end
  end
  
  def show
    video = UserVideo.find_by_path(params['id'])
    return unless exists?(video, params['id'])
    return unless allowed?(video, 'view')
    render json: JsonApi::Video.as_json(video, :wrapper => true, :permissions => @api_user).to_json
  end
  
  def update
    video = UserVideo.find_by_path(params['id'])
    return unless exists?(video, params['id'])
    return unless allowed?(video, 'edit')
    video_update = params['video']
    video_update = video_update.permit! if video_update.is_a?(ActionController::Parameters)
    if video.process(video_update)
      render json: JsonApi::Video.as_json(video, :wrapper => true, :permissions => @api_user).to_json
    else
      api_error(400, {error: "video update failed", errors: video.processing_errors})
    end
  end
end
