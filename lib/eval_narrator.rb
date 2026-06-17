require 'json'
require_relative 'pii_scrubber'

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

  class NarrationError < StandardError; end

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
        return draft_via_anthropic(payload, user)
      rescue => e
        # Soft-fall back to the template draft if the Anthropic SDK
        # call fails so the SLP always gets something to start from.
        Rails.logger.warn("[EvalNarrator] Anthropic draft failed (#{e.class}: #{e.message}); falling back to template.") if defined?(Rails)
      end
    end

    draft_via_template(payload)
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

    model = ENV['EVAL_NARRATOR_MODEL'] || 'claude-opus-4-7'
    # Plain-string system prompt, matching AiBoardGenerator / AiWordPredictor
    # against the official anthropic (~> 1.23) gem. The prior array +
    # cache_control "ephemeral" shape was never verified against this gem; a
    # malformed request would silently soft-fall-back to the template and
    # mask the failure. Eval narration is low-volume, so the prompt-cache
    # saving is marginal -- correctness on this compliance path wins.
    system_prompt = ANTHROPIC_SYSTEM_PROMPT

    start_time = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    narrative = nil
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
        error_message: error_message
      )
      # Clear the thread-local blocklist so a later PiiScrubber caller on
      # this Puma worker thread does not inherit this student's name list.
      PiiScrubber.reset_blocklist!
    end

    raise NarrationError, 'Anthropic returned an empty narrative' if narrative.blank?
    narrative
  end

  # Official anthropic gem (~> 1.23) call. Isolated so specs can stub the
  # network boundary, matching AiWordPredictor / AiBoardGenerator.
  def self.call_anthropic(model:, system_prompt:, user_content:)
    client = ::Anthropic::Client.new(api_key: ENV['ANTHROPIC_API_KEY'])
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
    names << sett['student'].to_s.strip if sett.is_a?(Hash) && sett['student'].to_s.strip.present?

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

  # Records the AI call in AiApiLog for compliance auditing. Never raises
  # into the caller -- a logging failure must not break narration.
  def self.log_ai_call(model:, user:, request_summary:, response_summary:,
                       tokens_sent: nil, tokens_received: nil, duration_ms: nil,
                       pii_detected: false, pii_findings: [], success: true, error_message: nil)
    return unless defined?(AiApiLog)
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
      feature_flag: 'comprehensive_eval_ai'
    )
  rescue StandardError => e
    Rails.logger.warn "EvalNarrator: failed to log AI API call: #{e.message}" if defined?(Rails)
  end

  def self.anthropic_configured?
    !ENV['ANTHROPIC_API_KEY'].to_s.empty? && defined?(::Anthropic::Client)
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
    safe_sett = sett.is_a?(Hash) ? sett.reject { |k, _| k.to_s == 'student' } : sett
    {
      'mode' => payload['eval_mode'],
      'intake' => payload['intake'],
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
