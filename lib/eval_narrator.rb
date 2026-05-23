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

  def self.draft_narrative(eval_session)
    payload = eval_session.is_a?(Hash) ? eval_session : eval_session.to_h
    raise NarrationError, 'eval_session must be a Hash' unless payload.is_a?(Hash)

    if anthropic_configured? && payload['use_anthropic'] != false
      begin
        return draft_via_anthropic(payload)
      rescue => e
        # Soft-fall back to the template draft if the Anthropic SDK
        # call fails so the SLP always gets something to start from.
        Rails.logger.warn("[EvalNarrator] Anthropic draft failed (#{e.class}: #{e.message}); falling back to template.") if defined?(Rails)
      end
    end

    draft_via_template(payload)
  end

  # Anthropic SDK integration (optional, gated by env var). Uses the
  # claude-api skill's prompt-caching pattern: cache the system
  # prompt + few-shot examples, send only the per-session payload as
  # the user message. Cuts per-call cost ~90% after the first call.
  def self.draft_via_anthropic(payload)
    raise NarrationError, 'Anthropic client not available' unless defined?(::Anthropic::Client)
    client = ::Anthropic::Client.new(access_token: ENV['ANTHROPIC_API_KEY'])
    system_prompt = [
      {
        type: 'text',
        text: ANTHROPIC_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' }
      }
    ]
    response = client.messages(parameters: {
      model: ENV['EVAL_NARRATOR_MODEL'] || 'claude-opus-4-7',
      max_tokens: 1200,
      system: system_prompt,
      messages: [
        { role: 'user', content: payload_for_prompt(payload) }
      ]
    })
    extract_text(response)
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

  def self.payload_for_prompt(payload)
    # Compact JSON the model can ingest deterministically.
    require 'json'
    JSON.pretty_generate(
      'mode' => payload['eval_mode'],
      'intake' => payload['intake'],
      'recommendation' => payload['recommendation'],
      'sett' => payload['sett'],
      'slp_notes' => payload['slp_notes'],
      'duration_s' => payload['duration_s']
    )
  end

  def self.extract_text(response)
    return response.to_s if response.is_a?(String)
    body = response['content'] || response[:content]
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
