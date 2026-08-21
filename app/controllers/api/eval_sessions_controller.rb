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
    payload = payload.with_indifferent_access
    # Explicit opt-in for external-model narration. The SLP clicking "Generate
    # AI Narrative" sends use_anthropic: true; a request that omits it (or any
    # other caller) gets the deterministic local template and no eval data
    # leaves for the AI provider. Accept ONLY a literal boolean true (JSON) or
    # the string "true" (form/test posts); every other value -- including
    # ambiguous strings like "no"/"off"/"False" -- resolves to false so the
    # default stays no-egress. (Deliberately NOT ActiveModel::Type::Boolean,
    # whose cast treats any non-false-token string as true and would enable
    # egress for "no"/"False"/"Off".)
    raw_opt_in = params['use_anthropic']
    payload['use_anthropic'] = (raw_opt_in == true || raw_opt_in == 'true')
    # EU AI Act Article 50(1) server-side backstop (shared helper LL-6723438462):
    # only reachable when payload['use_anthropic'] is true, since that is the only
    # branch that actually interacts with an AI system (the default path returns a
    # deterministic local template with no external call, and Article 50(1) applies
    # to AI interaction, not to this endpoint unconditionally). Gates on @api_user
    # (the SLP clicking "Generate AI Narrative"), the same caller article_50 disclosure
    # is tracked against at every other AI ingress -- not `user` (the evaluated
    # student), whose own COPPA/EU-under-16 consent gate is enforced inside
    # EvalNarrator itself.
    return if payload['use_anthropic'] && !require_article_50_disclosure!

    result = EvalNarrator.draft_narrative(payload, user: user)
    # EU AI Act Article 50(2): the RAW signed marker (nil for the deterministic
    # template draft) is returned to the frontend at generation time so it can be
    # carried unmodified into the eval session's persisted log data
    # (log.data['ai_generated']), exactly like AiBoardGenerator's marker flows
    # through boards_controller#generate_labels into board.settings. Read-side API
    # responses (lib/json_api/log.rb) expose only the non-secret public view via
    # Art50Marker.public_view -- never this raw form -- matching lib/json_api/board.rb.
    render json: { 'narrative' => result['narrative'], 'ai_generated' => result['ai_generated'] }
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
