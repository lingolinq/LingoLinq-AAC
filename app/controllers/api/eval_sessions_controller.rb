class Api::EvalSessionsController < ApplicationController
  before_action :require_api_token

  # Per-user Quick Screen session endpoints. Split out from
  # EvalProtocolsController so EvalProtocols stays a pure read-model
  # controller (catalog of static + DB-backed protocols) while
  # EvalSessions owns per-user state.
  #
  # Phase 1A scope: only `recommend` is implemented — the frontend
  # eval_session.js handles event collection client-side and persists
  # the final session via the existing /api/v1/logs endpoint
  # (log_type='eval'). `create` and `update` slots are reserved for
  # Phase 1B+ when we surface server-driven session resumption and
  # mid-eval persistence.

  def recommend
    return unless feature_enabled?
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    return unless allowed?(user, 'supervise')

    events = params['events'] || []
    intake = params['intake'] || {}
    rec = EvalRecommend.from_quick_screen(events, intake)
    render json: {
      'recommendation'    => rec,
      'protocol_profile'  => EvalProtocol.profile_for_intake(intake)
    }
  end

  protected

  def feature_enabled?
    return true if FeatureFlags.feature_enabled_for?('quick_screen_eval', @api_user)
    api_error 400, { error: 'feature not enabled' }
    false
  end
end
