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

  # POST /api/v1/eval_sessions/narrate
  #
  # Comprehensive Eval (Mode 3) AI narration. Takes the session
  # payload (eval_mode, intake, recommendation, events, sett,
  # slp_notes) and returns an SLP-readable narrative drafted by the
  # configured AI provider. Gated by the comprehensive_eval_ai
  # feature flag so it only runs for opted-in orgs.
  #
  # Uses EvalNarrator with prompt caching on the system prompt (per
  # CLAUDE.md `claude-api` skill) so the per-session cost stays low —
  # the system prompt + few-shot examples are cached, only the
  # per-session evaluation data varies.
  def narrate
    return unless ai_feature_enabled?
    eval_data = params['eval_session'] || {}
    if !eval_data.respond_to?(:present?) || !eval_data.present?
      api_error(400, { error: 'eval_session payload required' })
      return
    end
    # Resolve the evaluated student so the narrator can apply the same
    # COPPA parental-consent hard-gate and org-level AI opt-out as every
    # other external-model call site. The requester must supervise the
    # student before any eval data becomes eligible to leave for an AI
    # provider. When no student can be resolved, the narrator refuses the
    # AI draft and returns the deterministic local template (no external
    # call) instead of sending data ungated.
    user = params['user_id'].present? ? User.find_by_path(params['user_id']) : nil
    if params['user_id'].present?
      return unless exists?(user, params['user_id'])
      return unless allowed?(user, 'supervise')
    end
    payload = eval_data.respond_to?(:to_unsafe_h) ? eval_data.to_unsafe_h : eval_data.to_h
    narrative = EvalNarrator.draft_narrative(payload.with_indifferent_access, user: user)
    render json: { 'narrative' => narrative }
  rescue EvalNarrator::NarrationError => e
    api_error 502, { error: e.message }
  end

  protected

  def feature_enabled?
    return true if FeatureFlags.feature_enabled_for?('quick_screen_eval', @api_user)
    api_error 400, { error: 'feature not enabled' }
    false
  end

  def ai_feature_enabled?
    # ai_feature_enabled_for? combines the feature flag with the org-level
    # AI opt-out (disable_ai_features), so an org that has opted out of AI
    # processing cannot reach the narrator at all. Requires
    # 'comprehensive_eval_ai' to be registered in FeatureFlags::AI_FEATURES.
    return true if FeatureFlags.ai_feature_enabled_for?('comprehensive_eval_ai', @api_user)
    api_error 400, { error: 'comprehensive_eval_ai feature not enabled' }
    false
  end
end
