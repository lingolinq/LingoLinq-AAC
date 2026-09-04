require 'json'
require_relative 'ai_client'
require_relative 'pii_scrubber'
# Art50Marker is require_relative'd (not autoloaded) so it is defined even on the
# Resque-worker path where lib/ autoload is skipped, matching lib/ai_board_generator.rb.
require_relative 'art50_marker'
require_relative 'lingo_linq/article50_call_context'

module EvalNarrator
  # Drafts an SLP-readable narrative for a Comprehensive Eval. Takes
  # the session payload (intake, recommendation, events, sett,
  # slp_notes, ai_narrative) and returns a string suitable for an
  # IEP / insurance writeup that the SLP will then edit.
  #
  # The actual LLM call is intentionally pluggable so this file can:
  #   (a) ship today as a deterministic template-narrative — no API
  #       key required, no per-session cost; the SLP edits and the
  #       experience works end-to-end
  #   (b) be swapped to an Anthropic SDK call (with prompt caching
  #       per CLAUDE.md `claude-api` skill) once the Anthropic key
  #       is configured for the org — see `draft_via_anthropic`.
  #
  # The deterministic template draft is intentionally conservative —
  # it summarizes only what was actually captured, so the SLP can
  # trust it and edit toward intent rather than away from
  # hallucination.
  #
  # COMPLIANCE CLASSIFICATION (adjudicated by Scot Wahlquist, 2026-07-19):
  # Eval narration is NOT a HIPAA "Healthcare Activity" under Anthropic's
  # HIPAA-Ready Implementation Guide. The eval is an assistive-technology
  # ACCESS / feature-match assessment (find-the-target tasks at shrinking grid
  # sizes -> a hit/miss heat map -> a recommended board size and layout). The
  # model summarizes access findings and a board-layout recommendation; it does
  # not diagnose, treat, or produce medical charting/billing/coding/claims.
  # Therefore Anthropic Healthcare-Activity condition (iii) (restrict use to
  # licensed clinicians) does NOT apply, and there is intentionally no
  # licensed-clinician gate on this path. Rationale, retained controls, and the
  # register entry: docs/legal/ANTHROPIC_BAA_ACCEPTED.md and audit-reports/
  # FINDINGS.json (ruleKey eval-narration-healthcare-activity-classification).
  # Controls that DO apply and are enforced: Messages-API-only transport on the
  # HIPAA-Ready org key, PII scrub + student-name drop + etiology minimization
  # before egress, the EVAL_NARRATOR_MODEL allowlist (below), the COPPA gate,
  # explicit opt-in, and the org AI opt-out. Do not re-flag the absent
  # licensed-clinician gate as a finding without first reopening this
  # classification with Scot.

  class NarrationError < StandardError; end

  # Runtime model allowlist (Tier 1 compliance control). EVAL_NARRATOR_MODEL is
  # env-overridable; pin it to an EXACT set of vetted, in-scope Claude model IDs
  # so a misconfigured, future, or otherwise unrecognized model ID can never
  # egress eval data. This is deliberately an exact-ID allowlist, NOT a family
  # prefix: a prefix check (e.g. "starts with claude-opus") would silently accept
  # a future model in that family that might carry mandatory retention. Adding a
  # model is a deliberate vetting step (edit ALLOWED_MODELS below). Fable 5 /
  # Mythos 5 (ZDR-excluded Covered Models per CLAUDE.md) and every unrecognized
  # id are refused by construction. Enforced best-effort at boot
  # (config/initializers/eval_narrator_model_allowlist.rb) and authoritatively,
  # fail-closed, at call time. See docs/legal/ANTHROPIC_BAA_ACCEPTED.md.
  # IDs are Bedrock model ids (anthropic. prefix, bare alias): runtime AI egresses
  # to Claude on AWS Bedrock (BAA/HIPAA path) via AiClient, not the direct
  # api.anthropic.com endpoint. The vetted models are unchanged (Opus 4.7, Haiku
  # 4.5); only the id string form is the Bedrock one that actually egresses.
  DEFAULT_MODEL = 'anthropic.claude-opus-4-7'.freeze
  # Exact, vetted in-scope runtime model IDs (the current Tier 1 runtime
  # inventory), in Bedrock id form. Extend ONLY after confirming a model is
  # HIPAA-eligible and is not a mandatory-retention Covered Model.
  ALLOWED_MODELS = %w[
    anthropic.claude-opus-4-7
    anthropic.claude-haiku-4-5
  ].freeze

  # True only when `model` is one of the exact vetted in-scope model IDs. Any
  # unrecognized id (including a future model in an in-scope family) is refused.
  def self.allowed_model?(model)
    model.is_a?(String) && ALLOWED_MODELS.include?(model)
  end

  # Resolves EVAL_NARRATOR_MODEL (or the default) and refuses anything outside
  # the allowlist. Raising here fails closed: draft_narrative's rescue falls back
  # to the deterministic no-egress template rather than sending eval data to a
  # disallowed model.
  def self.resolved_model
    model = ENV['EVAL_NARRATOR_MODEL']
    model = DEFAULT_MODEL if model.nil? || model.empty?
    unless allowed_model?(model)
      raise NarrationError, "EVAL_NARRATOR_MODEL #{model.inspect} is not a vetted in-scope Claude model " \
        "(allowed: #{ALLOWED_MODELS.join(', ')}); refusing to egress eval data"
    end
    model
  end

  # Returns a Hash `{ 'narrative' => String, 'ai_generated' => Hash|nil }`. The
  # `ai_generated` key is the EU AI Act Article 50(2) machine-readable marker
  # (see Art50Marker) minted ONLY when the narrative came from the external
  # model -- the deterministic template draft is not AI-generated output and
  # is never marked, matching the word-prediction scope decision (Sec 9.1 of
  # docs/legal/EU_AI_ACT_ARTICLE_50_PLAN.md) that marking must never be
  # applied to content the system did not actually generate.
  def self.draft_narrative(eval_session, user: nil)
    payload = eval_session.is_a?(Hash) ? eval_session : eval_session.to_h
    raise NarrationError, 'eval_session must be a Hash' unless payload.is_a?(Hash)

    # External-model narration is OPT-IN: it runs only when the caller
    # explicitly sets use_anthropic == true (the SLP clicking "Generate AI
    # Narrative" in the controller). Any caller that omits the flag gets the
    # deterministic local template and no eval data leaves for the AI
    # provider. This default-safe posture is in addition to the ai_allowed_for?
    # COPPA/org gate, not a replacement for it.
    if anthropic_configured? && payload['use_anthropic'] == true && ai_allowed_for?(user)
      begin
        narrative, marker = draft_via_anthropic(payload, user)
        return { 'narrative' => narrative, 'ai_generated' => marker }
      rescue => e
        # Soft-fall back to the template draft if the Anthropic SDK
        # call fails so the SLP always gets something to start from.
        Rails.logger.warn("[EvalNarrator] Anthropic draft failed (#{e.class}: #{e.message}); falling back to template.") if defined?(Rails)
      end
    end

    { 'narrative' => draft_via_template(payload), 'ai_generated' => nil }
  end

  # Compliance hard-gate shared with every other AI call site
  # (AiWordPredictor, AiBoardGenerator). The external-model draft path may
  # run only when there is a resolved student User who (a) is not awaiting
  # COPPA parental consent and (b) belongs to an organization that has not
  # opted out of AI processing. Without a resolvable student we never send
  # eval data externally -- the deterministic template draft is returned
  # instead. This is the invariant the comment at
  # feature_flags.rb:150-152 ("used by every AI call site") describes.
  #
  # SLP/student split (intentional, diverges from the sibling sites): the
  # comprehensive_eval_ai *feature flag* is SLP-facing tooling enabled per
  # supervisor/org, so it is checked against the requesting clinician
  # (@api_user) in the controller. The data subject whose eval data would
  # leave is the STUDENT, so the COPPA consent gate and the org-level AI
  # opt-out (disable_ai_features, via ai_enabled_for?) are checked against
  # the student here. We deliberately do NOT require the comprehensive_eval_ai
  # flag to be enabled on the student's own account: it is beta-opt-in and a
  # student account is almost never the SLP-tooling audience, so requiring it
  # would block legitimate narration. The student org's disable_ai_features
  # is the FERPA backstop for a school that wants no AI processing at all.
  # (In AiBoardGenerator/AiWordPredictor the `user` IS the feature audience,
  # so they gate the flag on that same user.)
  def self.ai_allowed_for?(user)
    return false unless user
    return false if FeatureFlags.coppa_blocks_ai_for?(user)
    return false if FeatureFlags.eu_under16_blocks_ai_for?(user)
    return false unless FeatureFlags.ai_enabled_for?(user)
    true
  end

  # Anthropic SDK integration (optional, gated by env var). Uses the
  # claude-api skill's prompt-caching pattern: cache the system prompt +
  # few-shot examples, send only the per-session payload as the user
  # message. Cuts per-call cost ~90% after the first call.
  #
  # Compliance: the payload is PII-scrubbed (PiiScrubber.redact_for_ai)
  # before egress and the call is recorded in AiApiLog with an audit
  # trail, exactly like AiWordPredictor / AiBoardGenerator. The COPPA +
  # org opt-out gate is enforced upstream in draft_narrative via
  # ai_allowed_for?, so this method only runs for an eligible student.
  def self.draft_via_anthropic(payload, user = nil)
    require 'anthropic'
    raise NarrationError, 'Anthropic client not available' unless defined?(::Anthropic::Client)

    # Configure the PII blocklist with the student's account names AND the
    # free-text SETT student name, so the name is redacted everywhere it
    # appears (sett.student, slp_notes, intake free-text) before egress.
    configure_blocklist_for(user, payload)

    scrub_result = PiiScrubber.redact_for_ai(payload_for_prompt(payload))
    scrubbed_payload = scrub_result[:payload]
    pii_detected = scrub_result[:pii_found]
    pii_findings = scrub_result[:findings]
    user_content = JSON.pretty_generate(scrubbed_payload)

    model = resolved_model
    # Plain-string system prompt, matching AiBoardGenerator / AiWordPredictor
    # against the official anthropic (~> 1.23) gem. The prior array +
    # cache_control "ephemeral" shape was never verified against this gem; a
    # malformed request would silently soft-fall-back to the template and
    # mask the failure. Eval narration is low-volume, so the prompt-cache
    # saving is marginal -- correctness on this compliance path wins.
    system_prompt = ANTHROPIC_SYSTEM_PROMPT

    start_time = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    narrative = nil
    marker = nil
    success = false
    error_message = nil
    tokens_sent = nil
    tokens_received = nil

    begin
      response = call_anthropic(model: model, system_prompt: system_prompt, user_content: user_content)
      narrative = extract_text(response)
      if response.respond_to?(:usage) && response.usage
        tokens_sent = response.usage.respond_to?(:input_tokens) ? response.usage.input_tokens : nil
        tokens_received = response.usage.respond_to?(:output_tokens) ? response.usage.output_tokens : nil
      end
      success = narrative.present?
      # EU AI Act Article 50(2): mint the marker only for a successful, non-blank
      # narrative. Minting is unconditional on jurisdiction/feature-flag state (only
      # the 50(1) disclosure is gated) but conditional on there actually being AI
      # output to mark -- a blank/failed draft raises NarrationError below and never
      # reaches the caller, so no marker should be attributed to it either.
      marker = Art50Marker.build(provider: 'claude', model: model) if success
    rescue => e
      error_message = "#{e.class}: #{e.message}"
      raise
    ensure
      duration_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - start_time) * 1000).round
      log_ai_call(
        model: model,
        user: user,
        request_summary: "Eval narration (#{payload['eval_mode'] || 'comprehensive'})",
        response_summary: narrative.to_s,
        tokens_sent: tokens_sent,
        tokens_received: tokens_received,
        duration_ms: duration_ms,
        pii_detected: pii_detected,
        pii_findings: pii_findings,
        success: success,
        error_message: error_message,
        ai_content_marked: !!marker,
        ai_generated_content_id: marker && marker['content_id']
      )
      # Clear the thread-local blocklist so a later PiiScrubber caller on
      # this Puma worker thread does not inherit this student's name list.
      PiiScrubber.reset_blocklist!
    end

    raise NarrationError, 'Anthropic returned an empty narrative' if narrative.blank?
    [narrative, marker]
  end

  # Claude-on-AWS-Bedrock call via AiClient (whichever plane BEDROCK_PLANE selects).
  # Isolated so specs can stub the network boundary, matching AiWordPredictor /
  # AiBoardGenerator.
  #
  # NOTE: `model` here is the allowlisted alias, deliberately NOT passed through
  # AiClient.bedrock_model. On the classic plane the current default alias
  # (Opus 4.7) has no inference-profile mapping because that model is absent from
  # the classic catalog entirely, so this call fails and draft_narrative falls back
  # to the deterministic template. Routing eval narration to an invokable model is
  # a separate change: it alters the model named in the Article 50 and consent
  # disclosures, so it needs those updated in the same commit.
  def self.call_anthropic(model:, system_prompt:, user_content:)
    client = AiClient.build!
    client.messages.create(
      model: model,
      max_tokens: 1200,
      system: system_prompt,
      messages: [{ role: 'user', content: user_content }]
    )
  end

  # Build the PiiScrubber blocklist for this narration call. Mirrors the
  # AiWordPredictor / AiBoardGenerator pattern (user account names) and
  # adds the free-text SETT student name so a clinician-typed name is
  # redacted even when it differs from the account name.
  def self.configure_blocklist_for(user, payload)
    names = []
    if user
      names << user.user_name if user.respond_to?(:user_name) && user.user_name.present?
      if user.respond_to?(:settings) && user.settings.is_a?(Hash) && user.settings['full_name'].present?
        names << user.settings['full_name']
      end
    end
    sett = payload['sett']
    student = sett_student(sett)
    names << student if student.present?

    # Expand multi-token names into individual tokens so a known name is
    # redacted even when only one part appears (e.g. SETT student "Janie"
    # while the surname "Doe" is typed in slp_notes). This intentionally
    # over-redacts on the external-egress path and is stricter than the
    # sibling AI sites: an over-zealous redaction in an editable SLP draft
    # is recoverable, a leaked student/family name is not. Tokens under 2
    # chars are dropped so initials do not match everywhere. NOTE: this
    # cannot catch a third-party name (family, school, peer) typed free-hand
    # in slp_notes that matches none of these sources -- that needs NER and
    # remains a surface-wide limitation, not specific to this path.
    expanded = names.flat_map { |n| [n] + n.to_s.split(/\s+/) }
                    .map { |n| n.to_s.strip }
                    .reject { |n| n.length < 2 }
                    .uniq
    PiiScrubber.configure_blocklist(expanded)
  end

  # Returns the SETT student name regardless of key casing ('student',
  # 'Student', ...) so a case-variant key cannot slip the name past the
  # blocklist (it is also dropped from egress in payload_for_prompt).
  def self.sett_student(sett)
    return '' unless sett.is_a?(Hash)
    pair = sett.find { |k, _| k.to_s.downcase == 'student' }
    pair ? pair.last.to_s.strip : ''
  end

  # Records the AI call in AiApiLog for compliance auditing. Never raises
  # into the caller -- a logging failure must not break narration.
  def self.log_ai_call(model:, user:, request_summary:, response_summary:,
                       tokens_sent: nil, tokens_received: nil, duration_ms: nil,
                       pii_detected: false, pii_findings: [], success: true, error_message: nil,
                       ai_content_marked: false, ai_generated_content_id: nil)
    return unless defined?(AiApiLog)
    # EU AI Act Article 50: resolve the jurisdiction + disclosure-shown call context from the
    # in-scope data-subject `user` (the supervised STUDENT, D-02) via the ONE shared helper
    # (ENF-01). The helper owns the guarded reads + scrubbed logged fallback, so it never
    # raises into this wrapper.
    art50_ctx = LingoLinq::Article50CallContext.for(user)
    AiApiLog.log_ai_call(
      provider: 'claude',
      model: model,
      type: 'eval_narration',
      user: user,
      request_summary: request_summary,
      response_summary: response_summary,
      tokens_sent: tokens_sent,
      tokens_received: tokens_received,
      duration_ms: duration_ms,
      pii_detected: pii_detected,
      pii_findings: pii_findings,
      success: success,
      error_message: error_message,
      feature_flag: 'comprehensive_eval_ai',
      ai_content_marked: ai_content_marked,
      ai_generated_content_id: ai_generated_content_id,
      jurisdiction: art50_ctx[:jurisdiction],
      article_50_disclosure_shown: art50_ctx[:article_50_disclosure_shown]
    )
  rescue StandardError => e
    Rails.logger.warn "EvalNarrator: failed to log AI API call: #{e.message}" if defined?(Rails)
  end

  # Asks AiClient whether the ACTIVE Bedrock plane's client class is loaded,
  # rather than naming one plane's constant. Hardcoding BedrockMantleClient here
  # was a latent bug: the constant is defined by the anthropic gem regardless of
  # which plane is selected, so this check passed even when the Mantle client
  # could never be built, and it would have gone false for the wrong reason had
  # the gem ever dropped that constant while classic was active.
  def self.anthropic_configured?
    AiClient.available? && AiClient.client_defined?
  end

  # Template-based deterministic draft. Pulls only fields that are
  # actually present in the payload and builds a single-block
  # narrative.
  def self.draft_via_template(payload)
    intake = payload['intake'] || {}
    rec    = payload['recommendation'] || {}
    sett   = payload['sett'] || {}
    notes  = payload['slp_notes']
    mode   = payload['eval_mode'] || 'quick_screen'
    duration_s = payload['duration_s'].to_i
    duration_minutes = duration_s.positive? ? (duration_s / 60.0).round(1) : nil

    grid = rec['grid_size'] || {}
    vocab = rec['vocab_recommendation'] || {}
    comp = rec['comprehensive_report'] || {}
    da = comp['dynamic_assessment'] || {}
    targeted = comp['targeted'] || rec['targeted_report'] || {}

    sections = []

    sections << begin
      header_parts = []
      header_parts << "#{mode_label(mode)} Evaluation Summary"
      header_parts << "Duration: ~#{duration_minutes} minutes" if duration_minutes
      header_parts.join(' · ')
    end

    sections << intake_paragraph(intake)
    sections << recommendation_paragraph(rec, grid, vocab)
    sections << targeted_paragraph(targeted) if mode == 'targeted' || mode == 'comprehensive'
    sections << dynamic_assessment_paragraph(da) if da.present?
    sections << sett_paragraph(sett) if sett.is_a?(Hash) && (sett.values.any? { |v| v.to_s.strip.length.positive? })
    sections << "SLP Notes: #{notes.strip}" if notes.is_a?(String) && notes.strip.length.positive?
    sections << "Next step: build the recommended starter board and review usage data over the next two weeks to validate the recommendation in real-world use."

    sections.compact.reject { |s| s.to_s.strip.empty? }.join("\n\n")
  end

  def self.mode_label(mode)
    case mode
    when 'targeted'      then 'Targeted Feature-Match'
    when 'comprehensive' then 'Comprehensive'
    else                      'Quick Screen'
    end
  end

  def self.intake_paragraph(intake)
    age = intake['age_band']
    etiology = intake['etiology']
    comm = intake['current_comm']
    access = intake['suspected_access']
    parts = []
    parts << "Communicator characteristics: age band #{age}" if age
    parts << "etiology #{etiology}" if etiology
    parts << "current communication #{comm}" if comm
    parts << "suspected access channel #{access}" if access
    return nil if parts.empty?
    parts.join(', ').then { |s| "#{s}." }
  end

  def self.recommendation_paragraph(rec, grid, vocab)
    return nil if rec.blank?
    parts = []
    parts << "Recommended access method: #{rec['access_method']}" if rec['access_method']
    parts << "secondary #{rec['access_secondary']}" if rec['access_secondary']
    parts << "grid size #{grid['rows']}×#{grid['cols']} (#{grid['band']})" if grid['rows']
    parts << "primary symbol library #{rec['library']}" if rec['library']
    parts << "communicator stage #{rec['communicator_stage']} on the Communication Matrix" if rec['communicator_stage']
    parts << "vocabulary band #{vocab['band']}" if vocab['band']
    parts << "confidence #{((rec['confidence'] || 0) * 100).round}%" if rec['confidence']
    return nil if parts.empty?
    "Recommendation: #{parts.join(', ')}."
  end

  def self.targeted_paragraph(targeted)
    return nil unless targeted.is_a?(Hash)
    bits = []
    if (g = targeted['adaptive_grid'])
      bits << "Adaptive grid sweep converged at #{g['rows']}×#{g['cols']} in #{g['attempts']} attempts"
    end
    if (l = targeted['library_3way']) && l['winner']
      bits << "library bake-off winner #{l['winner']} (margin #{l['margin']})"
    end
    if (a = targeted['access_co_trial']) && a['method']
      bits << "access co-trial winner #{a['method']}"
    end
    if (s = targeted['syntax_probe']) && s.is_a?(Hash)
      bits << "syntax probe: receptive #{((s['receptive_accuracy'] || 0) * 100).round}%, expressive #{((s['expressive_accuracy'] || 0) * 100).round}%"
    end
    return nil if bits.empty?
    "Targeted feature-match data: #{bits.join('; ')}."
  end

  def self.dynamic_assessment_paragraph(da)
    return nil unless da.is_a?(Hash)
    parts = []
    parts << "average prompt level #{da['independence_avg']}" if da['independence_avg']
    parts << "independent at #{da['independence_pct']}% of items" if da['independence_pct']
    parts << "supported at #{da['supported_pct']}%" if da['supported_pct']
    parts << "not-yet at #{da['not_yet_pct']}%" if da['not_yet_pct']
    return nil if parts.empty?
    "Dynamic assessment indicates #{parts.join(', ')} — interpret with Vygotsky's zone of proximal development in mind: scores at levels 1–2 suggest emerging independence, 3–5 indicate the support level needed to access the target."
  end

  def self.sett_paragraph(sett)
    parts = []
    parts << "Student: #{sett['student'].to_s.strip}"         if sett['student'].to_s.strip.length.positive?
    parts << "Environment: #{sett['environment'].to_s.strip}" if sett['environment'].to_s.strip.length.positive?
    parts << "Task: #{sett['task'].to_s.strip}"               if sett['task'].to_s.strip.length.positive?
    return nil if parts.empty?
    "SETT framework — #{parts.join(' · ')}"
  end

  # Selects only the fields the model needs, as a Hash. The caller scrubs
  # this through PiiScrubber and JSON-encodes it before egress.
  #
  # The eval subject's identity is DERIVED FROM THE RESOLVED USER, never from
  # the client-asserted payload: the free-text sett.student name is dropped
  # from the egress payload entirely (the AI drafts about "the student" and
  # the SLP fills the name in when editing). This is the structural defense
  # against the user_id/payload decoupling -- a request that gates on user A
  # but carries student B's notes cannot leak B's name through the structured
  # identity field, because no client-asserted name is forwarded at all. The
  # resolved user's own name is independently blocklisted (configure_blocklist_for)
  # so it is redacted wherever it appears in remaining free text. Arbitrary
  # third-party names typed into slp_notes remain a surface-wide NER limitation.
  def self.payload_for_prompt(payload)
    sett = payload['sett']
    # Drop the student name under ANY key casing ('student', 'Student', ...)
    # and never forward a non-Hash sett shape verbatim.
    safe_sett = sett.is_a?(Hash) ? sett.reject { |k, _| k.to_s.downcase == 'student' } : {}
    # Data minimization: drop the intake `etiology` field (the medical cause /
    # diagnosis, e.g. cerebral palsy, autism) before egress. It is not needed to
    # produce the access / board-size recommendation the narrative summarizes,
    # and it is the one clinical-diagnosis datum in the payload. The local
    # deterministic template (intake_paragraph) still uses it; only the external
    # egress path drops it, mirroring the student-name drop above. The SLP fills
    # in etiology when editing, exactly as they fill in the student name.
    intake = payload['intake']
    safe_intake = intake.is_a?(Hash) ? intake.reject { |k, _| k.to_s.downcase == 'etiology' } : intake
    {
      'mode' => payload['eval_mode'],
      'intake' => safe_intake,
      'recommendation' => payload['recommendation'],
      'sett' => safe_sett,
      'slp_notes' => payload['slp_notes'],
      'duration_s' => payload['duration_s']
    }
  end

  def self.extract_text(response)
    return response.to_s if response.is_a?(String)
    # Official anthropic gem (~> 1.23): response.content is an array of
    # content blocks with #type / #text.
    if response.respond_to?(:content) && response.content.is_a?(Array)
      text_blocks = response.content.select { |b| b.respond_to?(:type) && b.type.to_s == 'text' }
      return text_blocks.map { |b| b.respond_to?(:text) ? b.text : b.to_s }.join("\n").strip
    end
    # Hash-shaped fallback (older SDK / stubbed responses in specs).
    body = response.respond_to?(:[]) ? (response['content'] || response[:content]) : nil
    return '' if body.blank?
    body.first.is_a?(Hash) ? (body.first['text'] || body.first[:text]).to_s : body.to_s
  end

  ANTHROPIC_SYSTEM_PROMPT = <<~PROMPT.freeze
    You are an experienced speech-language pathologist drafting evaluation summaries for AAC users.

    You will receive a single JSON evaluation payload. Write an IEP-ready
    narrative (4–7 paragraphs) covering:
      1. Communicator background from the intake
      2. The recommended access method, grid size, symbol library,
         communicator stage, and vocabulary band
      3. Targeted feature-match data (adaptive grid, library bake-off,
         access co-trial, syntax probe) when present
      4. Dynamic assessment results — frame using Vygotsky's zone of
         proximal development; do NOT report numbers without
         clinical interpretation
      5. SETT framework if filled (Student / Environment / Task)
      6. Specific next-step recommendation: build the starter board,
         monitor for 2 weeks, escalate to Targeted/Comprehensive if
         confidence < 0.7

    Tone: clinical, specific, no marketing language. Cite numbers
    exactly as provided. If a field is missing or null, omit it —
    never invent data. End with a concrete first-week action plan.
  PROMPT
end
