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
      #
      # The check must be AFFIRMATIVE. `progress_visible_to_api_user?` is an
      # exclusion filter, which is the right shape for the single-user gate above
      # (a stranger legitimately falls through to the public highlighted
      # showcase), but the wrong shape here: these are THIRD parties reached
      # through someone else's supervisee list, and supervising.rb:121 returns
      # false for a caller with no relationship at all, so the negation admitted
      # every stranger. See supervisee_progress_readable?.
      supervisees = user.supervisees.select{|s| supervisee_progress_readable?(s) }
      # TODO: sharding
      user_ids = [user.id] + supervisees.map(&:id)
      badges = UserBadge.where(:user_id => user_ids).where(['(earned = ? AND updated_at > ?) OR (earned = ? AND superseded = ?)', true, 2.weeks.ago, false, false])
      # The `highlighted` downgrade forced above was silently dropped on this
      # branch, so an unauthorized caller received the target's un-highlighted
      # badges here while the else-branch correctly limited them to the public
      # showcase.
      #
      # It applies to `user`'s OWN badges only, because that is the relationship
      # it was computed from: `user.allows?(@api_user,'supervise')`. Each
      # supervisee in this list has already passed its own affirmative
      # `supervisee_progress_readable?` check, so downgrading them on the strength
      # of the caller's relationship to a DIFFERENT account would hide records the
      # caller is independently entitled to read — an org manager holding
      # `set_goals` on a supervisee, but no `supervise` on the account whose list
      # it appeared in.
      if params['highlighted']
        # An empty supervisee list degrades to plain highlighted-only.
        badges = badges.where('user_badges.highlighted = ? OR user_badges.user_id IN (?)', true, supervisees.map(&:id))
      end
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
  #
  # This is deliberately an EXCLUSION filter, and only sound where a caller with
  # no relationship at all should still be served: #index falls through to the
  # public highlighted showcase (UserBadge#view, user_badge.rb:19) and #show is
  # already gated by that same permission. Do NOT reuse it to authorize a read of
  # a third party's record — use supervisee_progress_readable? for that.
  def progress_visible_to_api_user?(communicator)
    return false unless communicator && @api_user
    return true if communicator.id == @api_user.id
    !@api_user.modeling_only_for?(communicator)
  end

  # Affirmative counterpart, for communicators the caller reaches indirectly
  # through another account's supervisee list. Here "no relationship" must mean
  # DENIED, so the caller has to actually hold a permission on the supervisee.
  #
  # `set_goals` is the codebase's own predicate for "may see this communicator's
  # goal data": user_goal.rb:25 grants UserGoal#view through exactly
  # `self.user.allows?(user, 'set_goals')`. It resolves to self, non-modeling
  # supervisors, and org managers. It is declared under
  # ['full', 'basic_supervision', 'read_profile'], and permissable ADDS a rule's
  # scope list to 'full' rather than restricting to it, so basic_supervision
  # supporters still pass.
  #
  # The `modeling_only_for?` conjunct is still required: user.rb:66 deliberately
  # preserves `set_goals` for a BILLING-lapsed (globally modeling-only) supporter
  # who holds a real edit-level link, and that supporter must not read progress.
  def supervisee_progress_readable?(supervisee)
    return false unless supervisee && @api_user
    return true if supervisee.id == @api_user.id
    supervisee.allows?(@api_user, 'set_goals') && !@api_user.modeling_only_for?(supervisee)
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
