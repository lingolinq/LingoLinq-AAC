class Api::ButtonSetsController < ApplicationController
  # extend ::NewRelic::Agent::MethodTracer # Removed - NewRelic not needed
  before_action :require_api_token, :except => [:show]
  
  def index
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'model')
    button_sets = BoardDownstreamButtonSet.for_user(user)
    render json: JsonApi::ButtonSet.paginate(params, button_sets, :remote_support => true)
  end
  
  def show
    Rails.logger.warn('looking up board')
    board = nil
    button_set = nil
    self.class.trace_execution_scoped(['button_set/board/lookup']) do
      board = Board.find_by_path(params['id'])
    end
    Rails.logger.warn('looking up button set')
    self.class.trace_execution_scoped(['button_set/button_set/lookup']) do
      button_set = board && board.board_downstream_button_set
    end
    button_set = nil if params['id'].match(/^i/)
    return unless exists?(button_set, params['id'])
    allowed = false
    Rails.logger.warn('permission check')
    self.class.trace_execution_scoped(['button_set/board/permission_check']) do
      allowed = allowed?(board, 'view')
    end
    return unless allowed
    json = {}
    json_str = "null"
    Rails.logger.warn('rendering json')
    self.class.trace_execution_scoped(['button_set/board/json_render']) do
      json = JsonApi::ButtonSet.as_json(button_set, :wrapper => true, :permissions => @api_user, :nocache => true, :remote_support => true)
    end
    self.class.trace_execution_scoped(['button_set/board/json_stringify']) do
      json_str = json.is_a?(String) ? json : json.to_json
    end
    Rails.logger.warn('rails render')
    render json: json_str
    Rails.logger.warn('done with controller')
  end

  def generate
    board = nil
    button_set = nil
    board = Board.find_by_path(params['id'])
    return unless exists?(board, params['id'])
    button_set = board && board.board_downstream_button_set
    return unless allowed?(board, 'view')
    if params['missing'] && button_set
      button_set.data['private_cdn_url_checked'] = 48.hours.ago.to_i
      button_set.save
    end
    download_url = button_set && button_set.url_for(@api_user, board.full_set_revision)
    if button_set && download_url && !params['missing']
      render json: {exists: true, id: params['id'], url: download_url}
      return
    else
      user_id = @api_user ? @api_user.global_id : nil
      progress = Progress.schedule(BoardDownstreamButtonSet, :generate_for, board.global_id, user_id)
      render json: JsonApi::Progress.as_json(progress, :wrapper => true).to_json
    end
  end
end
