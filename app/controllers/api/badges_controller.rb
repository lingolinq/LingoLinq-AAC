class Api::BadgesController < ApplicationController
  before_action :require_api_token

  def index
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'view_detailed')
    return unless require_progress_visible!(user)
    if !user.allows?(@api_user, 'supervise')
      params['highlighted'] = true
    end
    # TODO: sharding
    if params['recent']
      # This branch returns badges for the supporter AND every supervisee in one
      # response, so each supervisee needs its own check — the gate above only
      # covers `user`, and when a supporter asks about themselves it passes
      # unconditionally. Without this the endpoint handed back badge data for
      # communicators the per-user branch refuses.
      supervisees = user.supervisees.select{|s| progress_visible_to_api_user?(s) }
      # TODO: sharding
      user_ids = [user.id] + supervisees.map(&:id)
      badges = UserBadge.where(:user_id => user_ids).where(['(earned = ? AND updated_at > ?) OR (earned = ? AND superseded = ?)', true, 2.weeks.ago, false, false])
    else
      badges = UserBadge.where(:user_id => user.id, :disabled => false)
      if params['goal_id']
        goal = UserGoal.find_by_path(params['goal_id'])
        return unless exists?(goal, params['goal_id'])
        # Listing badges is read-only; require goal visibility (owner, supervisor with
        # model/edit/set_goals on the communicator, etc.) — not UserGoal#edit, which is stricter.
        return unless allowed?(goal, 'view')
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
    # UserBadge#view is granted through `model` (user_badge.rb:20), which is the
    # one permission a modeling-only link DOES hold, so `allowed?` alone would
    # hand the record over. Gate it on the same policy the index uses.
    return unless require_progress_visible!(badge.user)
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

  private

  # Badge progress is goal data, and a modeling-only link must never read it.
  # No existing permission expresses that on its own:
  #   * `view_detailed` is granted to EVERYONE for a public account (user.rb:58),
  #     so it lets a modeling-only link through for any public communicator;
  #   * `model` — which UserBadge#view accepts (user_badge.rb:20) — is precisely
  #     the permission a modeling-only link DOES hold;
  #   * `supervise` would work, but it is absent for legitimate
  #     `basic_supervision`-scoped callers (which this controller already treats
  #     as a soft signal at index, not a denial), so it would deny real users.
  # Hence an explicit check. Self is always visible: a supporter whose OWN account
  # is modeling-only still sees their own badges.
  def progress_visible_to_api_user?(communicator)
    return false unless communicator && @api_user
    return true if communicator.id == @api_user.id
    !@api_user.modeling_only_for?(communicator)
  end

  def require_progress_visible!(communicator)
    return true if progress_visible_to_api_user?(communicator)
    api_error(400, {
      error: "Not authorized",
      unauthorized: true,
      permission: 'view_progress',
      modeling_only: true,
      resource_class: 'User',
      resource_id: (communicator && communicator.global_id)
    })
    false
  end
end
