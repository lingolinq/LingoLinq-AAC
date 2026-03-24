class Api::BadgesController < ApplicationController
  before_action :require_api_token

  def index
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'view_detailed')
    if !user.allows?(@api_user, 'supervise')
      params['highlighted'] = true
    end
    # TODO: sharding
    if params['recent']
      supervisees = user.supervisees
      # TODO: sharding
      user_ids = [user.id] + supervisees.map(&:id)
      badges = UserBadge.where(:user_id => user_ids).where(['(earned = ? AND updated_at > ?) OR (earned = ? AND superseded = ?)', true, 2.weeks.ago, false, false])
    else
      badges = UserBadge.where(:user_id => user.id, :disabled => false)
      if params['goal_id']
        goal = UserGoal.find_by_path(params['goal_id'])
        return unless exists?(goal, params['goal_id'])
        return unless allowed?(goal, 'edit')
        # TODO: sharding
        badges = badges.where(:user_goal_id => goal.id)
      else
        badges = badges.where(:superseded => false)
      end
      if params['highlighted']
        badges = badges.where(:highlighted => true)
      end
      if params['earned']
        badges = badges.where(:earned => true)
      end
      badges = badges.order('highlighted DESC, id DESC')
    end
    
    render json: JsonApi::Badge.paginate(params, badges)
  end
  
  def show
    badge = UserBadge.find_by_path(params['id'])
    return unless exists?(badge, params['id'])
    return unless allowed?(badge, 'view')
    render json: JsonApi::Badge.as_json(badge, :wrapper => true, :permissions => @api_user).to_json
  end
  
  def update
    badge = UserBadge.find_by_path(params['id'])
    return unless exists?(badge, params['id'])
    return unless allowed?(badge, 'edit')
    badge_data = params['badge']
    badge_data = badge_data.permit! if badge_data.is_a?(ActionController::Parameters)
    if badge.process(badge_data)
      render json: JsonApi::Badge.as_json(badge, :wrapper => true, :permissions => @api_user).to_json
    else
      api_error(400, {error: "badge update failed", errors: badge.processing_errors})
    end
  end
end
