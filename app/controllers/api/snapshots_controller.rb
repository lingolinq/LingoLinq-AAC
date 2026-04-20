class Api::SnapshotsController < ApplicationController
  before_action :require_api_token

  def index
    user = User.find_by_global_id(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'supervise')
    
    # TODO: sharding
    @snapshots = LogSnapshot.where(:user_id => user.id).order('started_at DESC')
    render json: JsonApi::Snapshot.paginate(params, @snapshots)
  end
  
  def create
    snap_data = params['snapshot']
    snap_data = snap_data.permit! if snap_data.is_a?(ActionController::Parameters)
    user = User.find_by_global_id(snap_data['user_id'])
    return unless exists?(user, snap_data['user_id'])
    return unless allowed?(user, 'edit')
    @snapshot = LogSnapshot.process_new(snap_data, {:user => user})
    if @snapshot.errored?
      api_error(400, {error: "snapshot creation failed", errors: @snapshot && @snapshot.processing_errors})
    else
      render json: JsonApi::Snapshot.as_json(@snapshot, :wrapper => true, :permissions => @api_user).to_json
    end
  end
  
  def show
    @snapshot = LogSnapshot.find_by_global_id(params['id'])
    return unless exists?(@snapshot, params['id'])
    return unless allowed?(@snapshot, 'view')
    render json: JsonApi::Snapshot.as_json(@snapshot, :wrapper => true, :permissions => @api_user).to_json
  end

  def update
    @snapshot = LogSnapshot.find_by_global_id(params['id'])
    return unless exists?(@snapshot, params['id'])
    return unless allowed?(@snapshot, 'edit')
    snap_update = params['snapshot']
    snap_update = snap_update.permit! if snap_update.is_a?(ActionController::Parameters)
    if @snapshot.process(snap_update)
      render json: JsonApi::Snapshot.as_json(@snapshot, :wrapper => true, :permissions => @api_user).to_json
    else
      api_error(400, {error: "snapshot update failed", errors: @snapshot.processing_errors})
    end
  end
  
  def destroy
    @snapshot = LogSnapshot.find_by_global_id(params['id'])
    return unless exists?(@snapshot, params['id'])
    return unless allowed?(@snapshot, 'delete')
    @snapshot.destroy
    render json: JsonApi::Snapshot.as_json(@snapshot, :wrapper => true, :permissions => @api_user).to_json
  end
end
