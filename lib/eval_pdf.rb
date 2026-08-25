require 'prawn'
Prawn::Fonts::AFM.hide_m17n_warning = true if defined?(Prawn::Fonts::AFM)

module EvalPdf
  # Prawn-based PDF renderer for tiered-eval LogSession reports.
  # Produces an IEP/insurance-grade clinical document containing:
  #   - Cover page with demographic + evaluator blocks
  #   - Per-page running header (student / DOB / page X of Y)
  #   - Methods & reliability caveat (Light/Dowden citation)
  #   - Background / case history section
  #   - Recommendation summary table
  #   - Targeted / comprehensive subtest detail
  #   - Per-competency clinical interpretation
  #   - DAGG-style IEP goal suggestions
  #   - AI-drafted narrative (when present)
  #   - SLP free-text notes
  #   - Signature block
  #   - Per-page FERPA notice + log ID footer
  #
  # Industry comparison: DAGG-3, AAC Profile, TASP, and ASHA SGD
  # documentation standards all expect this set of sections. Fields
  # we cannot auto-fill (DOB, license #, signature) render as labeled
  # fillable underline rules so the SLP can complete them by hand.
  #
  # Usage: EvalPdf.render(log_session) #=> binary PDF string

  HEADING_COLOR  = '2A3F5F'  # deep slate
  MUTED_COLOR    = '6B7B95'  # cool gray
  ACCENT_COLOR   = '3E8E7E'  # verdigris
  BORDER_COLOR   = 'D7DEEA'  # pale slate
  RULE_COLOR     = '94A3B8'  # signature/fillable rule

  PAGE_MARGIN = 54
  HEADER_HEIGHT = 22  # reserved at top of pages 2+
  FOOTER_HEIGHT = 30  # reserved at bottom of every page

  # LingoLinq wordmark used in the per-page header. Wide aspect
  # (~6.15:1) — render at modest width so it fits the 22pt header.
  LOGO_PATH = Rails.root.join('public', 'images', 'logo-new.png').to_s if defined?(Rails)
  LOGO_WIDTH = 90

  CATEGORY_LABELS = {
    'linguistic'  => 'Linguistic',
    'operational' => 'Operational',
    'social'      => 'Social',
    'strategic'   => 'Strategic'
  }.freeze

  COMPETENCY_INTERPRETATIONS = {
    'linguistic' => 'Linguistic competence reflects the learner\'s vocabulary breadth, symbol-to-meaning mapping, and ability to combine symbols into multi-word utterances. Findings below summarize observed performance on vocabulary and syntax probes.',
    'operational' => 'Operational competence reflects the motor and access skills needed to use the AAC system — selecting buttons, navigating between boards, and managing the device interface. Findings reflect the access-method co-trial and adaptive grid sweep results.',
    'social' => 'Social competence reflects communicative initiation, turn-taking, and partner engagement during the evaluation. Observations are drawn from the SLP\'s real-time notes; formal social-competence probes are recommended as part of ongoing assessment.',
    'strategic' => 'Strategic competence reflects the learner\'s ability to repair breakdowns, request clarification, and use alternative routes to a message when an intended word is unavailable. Goal targets below build these skills explicitly.'
  }.freeze

  MODE_LABELS = {
    'quick_screen'  => 'Quick Screen (5-minute screening)',
    'targeted'      => 'Targeted Feature-Match Eval (10 min)',
    'comprehensive' => 'Comprehensive AAC Eval (15 min)'
  }.freeze

  RELIABILITY_PARAGRAPH = "Standardized, norm-referenced tests are generally invalid for evaluating individuals who use AAC, because the underlying normative samples exclude non-speaking populations and because timed verbal-response formats penalize device-mediated communication (Light, 1989; Dowden, 1999). This evaluation therefore uses criterion-referenced, dynamic, and feature-match procedures — the current standard of practice in AAC assessment (Beukelman & Light, 2020; ASHA Practice Portal — AAC). Findings should be interpreted as descriptions of present performance and feature-match suitability, not as standardized scores."

  FERPA_NOTICE = "CONFIDENTIAL — This document contains protected educational and health information about an identified individual. It is shared under FERPA (20 U.S.C. § 1232g) and applicable HIPAA provisions, and may only be redisclosed with written consent of the student / parent / guardian or as otherwise permitted by law."

  def self.render(log)
    data = log.data || {}
    rec  = data['recommendation'] || {}
    mode = data['eval_mode'] || 'quick_screen'

    student_name = student_display_name(log)
    evaluator    = evaluator_info(log)
    eval_date    = log.started_at || log.created_at
    report_date  = Time.zone.now

    pdf = Prawn::Document.new(
      page_size: 'LETTER',
      margin: [PAGE_MARGIN + HEADER_HEIGHT, PAGE_MARGIN, PAGE_MARGIN + FOOTER_HEIGHT, PAGE_MARGIN]
    )
    pdf.font_families.update('Helvetica' => {
      normal: 'Helvetica',
      italic: 'Helvetica-Oblique',
      bold: 'Helvetica-Bold',
      bold_italic: 'Helvetica-BoldOblique'
    })
    pdf.font 'Helvetica'

    render_cover(pdf, log, mode, student_name, evaluator, eval_date, report_date)

    pdf.start_new_page
    render_methods_reliability(pdf)
    render_background(pdf, data)
    render_recommendation_summary(pdf, rec)
    render_targeted_section(pdf, rec) if targeted_mode?(mode)
    render_comprehensive_section(pdf, rec) if mode == 'comprehensive'
    render_clinical_interpretation(pdf, rec, data['ai_narrative'])
    render_goals_grid(pdf, rec)
    render_slp_notes(pdf, data['slp_notes'])
    render_signature_block(pdf, evaluator)

    render_running_header(pdf, student_name)
    render_running_footer(pdf, log)

    pdf.render
  end

  # --- cover page ---------------------------------------------------------

  def self.render_cover(pdf, log, mode, student_name, evaluator, eval_date, report_date)
    mode_label = MODE_LABELS[mode] || MODE_LABELS['quick_screen']

    if defined?(LOGO_PATH) && LOGO_PATH && File.exist?(LOGO_PATH)
      pdf.image LOGO_PATH, width: 120
      pdf.move_down 8
    end
    pdf.fill_color HEADING_COLOR
    pdf.font_size(22) { pdf.text 'AAC Evaluation Report', style: :bold }
    pdf.fill_color MUTED_COLOR
    pdf.font_size(12) { pdf.text mode_label }
    pdf.fill_color '000000'
    pdf.move_down 18
    pdf.stroke_color BORDER_COLOR
    pdf.stroke_horizontal_rule
    pdf.move_down 18

    section_title(pdf, 'Student / Client')
    demographic_rows = [
      ['Name',                  student_name],
      ['Date of Birth',         nil],
      ['Age at Evaluation',     nil],
      ['Gender',                nil],
      ['Grade',                 nil],
      ['School / District',     nil],
      ['Referral Source',       nil],
      ['Date of Evaluation',    eval_date ? eval_date.strftime('%B %-d, %Y') : nil],
      ['Report Date',           report_date.strftime('%B %-d, %Y')]
    ]
    render_fillable_table(pdf, demographic_rows)
    pdf.move_down 16

    section_title(pdf, 'Evaluator')
    evaluator_rows = [
      ['Name',                evaluator[:name]],
      ['Credentials',         nil],
      ['State License #',     nil],
      ['ASHA Account #',      nil],
      ['Agency / Practice',   nil],
      ['Contact (email)',     evaluator[:email]],
      ['Contact (phone)',     nil]
    ]
    render_fillable_table(pdf, evaluator_rows)
    pdf.move_down 18

    # FERPA notice — pin to bottom of page if there's room.
    if pdf.cursor < 100
      pdf.start_new_page
    end
    pdf.bounding_box([0, 90], width: pdf.bounds.width, height: 70) do
      pdf.stroke_color BORDER_COLOR
      pdf.stroke_bounds
      pdf.indent(10) do
        pdf.move_down 8
        pdf.fill_color HEADING_COLOR
        pdf.font_size(9) { pdf.text 'CONFIDENTIALITY NOTICE', style: :bold, character_spacing: 1 }
        pdf.fill_color MUTED_COLOR
        pdf.font_size(8.5) { pdf.text FERPA_NOTICE, leading: 1.5 }
        pdf.fill_color '000000'
      end
    end
  end

  def self.render_fillable_table(pdf, rows)
    label_w = 150
    value_w = pdf.bounds.width - label_w
    row_h = 18
    rows.each do |label, value|
      y = pdf.cursor
      pdf.bounding_box([0, y], width: label_w, height: row_h) do
        pdf.fill_color HEADING_COLOR
        pdf.font_size(10) { pdf.text "#{label}:", style: :bold, valign: :center }
        pdf.fill_color '000000'
      end
      pdf.bounding_box([label_w, y], width: value_w, height: row_h) do
        if value && !value.to_s.strip.empty?
          pdf.font_size(10) { pdf.text value.to_s, valign: :center }
        else
          pdf.move_down 14
          pdf.stroke_color RULE_COLOR
          pdf.stroke_horizontal_line(0, value_w - 4, at: pdf.cursor)
        end
      end
      pdf.move_cursor_to(y - row_h)
    end
  end

  # --- body sections ------------------------------------------------------

  def self.render_methods_reliability(pdf)
    section_title(pdf, 'Assessment Methods & Reliability')
    pdf.font_size(10) { pdf.text RELIABILITY_PARAGRAPH, leading: 2 }
    pdf.move_down 14
  end

  def self.render_background(pdf, data)
    section_title(pdf, 'Background / Case History')
    intake = data['intake'] || {}

    auto_lines = []
    auto_lines << "Age band: #{intake['age_band']}"           if intake['age_band'].to_s != ''
    auto_lines << "Etiology: #{intake['etiology']}"           if intake['etiology'].to_s != ''
    auto_lines << "Current communication: #{intake['current_comm']}" if intake['current_comm'].to_s != ''
    auto_lines << "Suspected access: #{intake['suspected_access']}"  if intake['suspected_access'].to_s != ''

    if auto_lines.any?
      pdf.fill_color MUTED_COLOR
      pdf.font_size(9) { pdf.text 'Captured at intake:', style: :italic }
      pdf.fill_color '000000'
      pdf.move_down 4
      auto_lines.each do |line|
        pdf.font_size(10) { pdf.indent(12) { pdf.text "• #{line}" } }
      end
      pdf.move_down 8
    end

    pdf.fill_color MUTED_COLOR
    pdf.font_size(9) { pdf.text 'Evaluator narrative — medical history, prior AAC trials, comorbidities, current educational placement, sensory/motor status, communication partners:', style: :italic }
    pdf.fill_color '000000'
    pdf.move_down 6
    render_blank_lines(pdf, 4)
    pdf.move_down 14
  end

  def self.render_recommendation_summary(pdf, rec)
    section_title(pdf, 'Recommendation Summary')

    grid = rec['grid_size'] || {}
    grid_label =
      if grid['rows'] && grid['cols']
        band = grid['band'] ? " (#{grid['band']})" : ''
        "#{grid['rows']} × #{grid['cols']}#{band}"
      else
        '—'
      end

    vocab = rec['vocab_recommendation'] || {}
    vocab_label = vocab['band'] || '—'
    if vocab['fringe_categories'].is_a?(Array) && vocab['fringe_categories'].any?
      vocab_label = "#{vocab_label} (#{vocab['fringe_categories'].join(', ')})"
    end

    confidence_pct = ((rec['confidence'] || 0).to_f * 100).round

    rows = [
      ['Access method',      rec['access_method'] || '—'],
      ['Secondary access',   rec['access_secondary'] || '—'],
      ['Grid',               grid_label],
      ['Symbol library',     rec['library'] || '—'],
      ['Communicator stage', rec['communicator_stage'].to_s.empty? ? '—' : "#{rec['communicator_stage']} / 7 (Communication Matrix)"],
      ['Vocabulary',         vocab_label],
      ['Confidence',         "#{confidence_pct}%"]
    ]

    label_w = 150
    value_w = pdf.bounds.width - label_w
    row_h = 22
    rows.each do |label, value|
      y = pdf.cursor
      pdf.bounding_box([0, y], width: label_w, height: row_h) do
        pdf.fill_color HEADING_COLOR
        pdf.font_size(10) { pdf.text label, style: :bold, valign: :center }
        pdf.fill_color '000000'
      end
      pdf.bounding_box([label_w, y], width: value_w, height: row_h) do
        pdf.font_size(10) { pdf.text value.to_s, valign: :center }
      end
      pdf.move_cursor_to(y - row_h)
      pdf.stroke_color BORDER_COLOR
      pdf.stroke_horizontal_rule
    end
    pdf.move_down 14
  end

  def self.render_targeted_section(pdf, rec)
    tr = rec['targeted_report'] || {}
    return if tr.empty?

    section_title(pdf, 'Targeted Subtests')

    grid = tr['adaptive_grid']
    lib  = tr['library_3way']
    acc  = tr['access_co_trial']
    syn  = tr['syntax_probe']

    if grid
      sub_line(pdf, 'Adaptive grid sweep',
        "#{grid['rows']} × #{grid['cols']} — converged in #{grid['attempts']} attempts")
    end
    if lib
      picks = lib['picks'] || {}
      picks_str = picks.map { |k, v| "#{k}: #{v}" }.join(' · ')
      sub_line(pdf, 'Library bake-off',
        "Winner: #{lib['winner'] || '—'}#{picks_str.empty? ? '' : " (#{picks_str})"}")
    end
    if acc
      tallies = acc['tallies'] || {}
      tally_str = tallies.map do |k, t|
        attempts = (t['hits'] || 0) + (t['misses'] || 0)
        pct = attempts.positive? ? ((t['hits'].to_f / attempts) * 100).round : nil
        "#{k}: #{pct ? "#{pct}%" : '—'}"
      end.join(' · ')
      sub_line(pdf, 'Access co-trial',
        "Recommended: #{acc['method'] || '—'}#{tally_str.empty? ? '' : " (#{tally_str})"}")
    end
    if syn
      rcv = syn['receptive_accuracy']
      exp = syn['expressive_accuracy']
      parts = []
      parts << "receptive #{(rcv * 100).round}%" if rcv
      parts << "expressive #{(exp * 100).round}%" if exp
      sub_line(pdf, 'Syntax probe', parts.empty? ? '—' : parts.join(' · '))
    end

    motor = tr['motor_map']
    if motor && motor['hit_locations'] && motor['hit_locations'].any?
      pdf.move_down 6
      pct = motor['accuracy'] ? (motor['accuracy'].to_f * 100).round : nil
      sub_line(pdf, 'Motor map',
        "#{pct ? "#{pct}%" : '—'} accurate (#{motor['total_correct']} of #{motor['total_trials']} target cells)")
      render_motor_map_heatmap(pdf, motor)
    end

    pdf.move_down 10
  end

  # Render the motor_map heatmap by replicating the canvas drawing
  # from app/frontend/app/components/stats/eval-hits.js using Prawn
  # primitives — radial-gradient dots for correct/incorrect targets +
  # hollow circles for press locations. Width/height mirror the
  # frontend container's 16:9 aspect ratio.
  def self.render_motor_map_heatmap(pdf, motor_summary)
    return unless motor_summary

    canvas_w = 280
    canvas_h = (canvas_w * 9.0 / 16).round
    pdf.move_down 4

    # Reserve box.
    top_y = pdf.cursor
    pdf.bounding_box([0, top_y], width: canvas_w, height: canvas_h) do
      pdf.stroke_color BORDER_COLOR
      pdf.stroke_bounds
      pdf.fill_color 'FAFBFD'
      pdf.fill_rectangle [0, canvas_h], canvas_w, canvas_h
    end

    base_x = pdf.bounds.left
    base_y_top = top_y
    radius = canvas_w / 18.0

    # Target dots (filled, faded center): green for correct, red for miss.
    motor_summary['hit_locations'].each do |hit|
      next unless hit['possibly_correct']
      cx = base_x + (hit['cpctx'].to_f * canvas_w)
      cy = base_y_top - (hit['cpcty'].to_f * canvas_h)
      pdf.fill_color(hit['correct'] ? '38A169' : 'E53E3E')
      pdf.transparent(0.32) do
        pdf.fill_circle [cx, cy], radius
      end
      pdf.transparent(0.60) do
        pdf.fill_circle [cx, cy], radius * 0.45
      end
    end

    # Press positions (hollow circles).
    motor_summary['hit_locations'].each do |hit|
      next if hit['pctx'].nil? || hit['pcty'].nil?
      px = base_x + (hit['pctx'].to_f * canvas_w)
      py = base_y_top - (hit['pcty'].to_f * canvas_h)
      pdf.stroke_color(hit['partial'] ? 'B7791F' : '2563EB')
      pdf.line_width = 1.4
      pdf.stroke_circle [px, py], radius * 0.28
    end
    pdf.line_width = 1
    pdf.fill_color '000000'

    pdf.move_cursor_to(top_y - canvas_h - 6)
    pdf.fill_color MUTED_COLOR
    pdf.font_size(8) do
      pdf.text 'Green = correct target · red = missed target · blue ring = student press position', style: :italic
    end
    pdf.fill_color '000000'
    pdf.move_down 6
  end

  def self.render_comprehensive_section(pdf, rec)
    cr = rec['comprehensive_report'] || {}
    return if cr.empty?

    section_title(pdf, 'Dynamic Assessment & SETT')

    da = cr['dynamic_assessment']
    if da
      sub_line(pdf, 'Dynamic assessment',
        "#{da['independence_pct']}% independent · avg prompt #{da['independence_avg']} · #{da['supported_pct']}% supported · #{da['not_yet_pct']}% not yet")
    end

    lit = cr['literacy_probe']
    if lit && lit['trials']
      pct = lit['accuracy'] ? ((lit['accuracy'].to_f) * 100).round : nil
      sub_line(pdf, 'Literacy probe',
        "#{pct ? "#{pct}%" : '—'} accuracy (#{lit['hits']} of #{lit['trials']} items)")
    end

    sett = cr['sett']
    if sett
      pdf.move_down 4
      pdf.fill_color HEADING_COLOR
      pdf.font_size(11) { pdf.text 'SETT framework', style: :bold }
      pdf.fill_color '000000'
      pdf.move_down 4
      %w[student environment task].each do |key|
        next if sett[key].to_s.strip.empty?
        pdf.font_size(10) do
          pdf.formatted_text [
            { text: "#{key.capitalize}: ", styles: [:bold], color: HEADING_COLOR },
            { text: sett[key].to_s }
          ]
        end
        pdf.move_down 3
      end
    end
    pdf.move_down 10
  end

  def self.render_clinical_interpretation(pdf, rec, ai_narrative)
    pdf.start_new_page if pdf.cursor < 260
    section_title(pdf, 'Clinical Interpretation')

    if ai_narrative.to_s.strip != ''
      pdf.fill_color MUTED_COLOR
      pdf.font_size(9) { pdf.text 'AI-drafted synthesis — review and edit before clinical sign-off.', style: :italic }
      pdf.fill_color '000000'
      pdf.move_down 4
      pdf.font_size(10) { pdf.text ai_narrative.to_s, leading: 2 }
      pdf.move_down 12
    end

    pdf.fill_color HEADING_COLOR
    pdf.font_size(11) { pdf.text 'By competency (Light, 1989/2014)', style: :bold }
    pdf.fill_color '000000'
    pdf.move_down 4

    %w[linguistic operational social strategic].each do |cat|
      pdf.fill_color HEADING_COLOR
      pdf.font_size(10) { pdf.text CATEGORY_LABELS[cat], style: :bold }
      pdf.fill_color '000000'
      pdf.move_down 2
      pdf.font_size(9.5) { pdf.text COMPETENCY_INTERPRETATIONS[cat], leading: 2 }
      pdf.move_down 8
    end
    pdf.move_down 4
  end

  def self.render_goals_grid(pdf, rec)
    grid = EvalGoalsGrid.generate(rec)
    return if grid.empty?

    pdf.start_new_page if pdf.cursor < 220
    section_title(pdf, 'DAGG-style IEP Goal Suggestions')
    pdf.fill_color MUTED_COLOR
    pdf.font_size(10) do
      pdf.text 'Drafted across Janice Light\'s four communicative competencies. Edit before adding to an IEP.', style: :italic
    end
    pdf.fill_color '000000'
    pdf.move_down 8

    grid.each do |bucket|
      label = CATEGORY_LABELS[bucket['category']] || bucket['category'].to_s.capitalize
      pdf.fill_color HEADING_COLOR
      pdf.font_size(11) { pdf.text label, style: :bold }
      pdf.fill_color '000000'
      pdf.move_down 3
      bucket['goals'].each do |g|
        pdf.font_size(10) do
          pdf.indent(12) do
            pdf.text "• #{g['text']}"
          end
        end
        pdf.move_down 2
      end
      pdf.move_down 6
    end
  end

  def self.render_slp_notes(pdf, notes)
    return if notes.to_s.strip.empty?
    pdf.start_new_page if pdf.cursor < 120
    section_title(pdf, 'SLP Notes')
    pdf.font_size(10.5) { pdf.text notes.to_s, leading: 2 }
    pdf.move_down 10
  end

  def self.render_signature_block(pdf, evaluator)
    pdf.start_new_page if pdf.cursor < 160
    section_title(pdf, 'Evaluator Signature')

    pdf.fill_color MUTED_COLOR
    pdf.font_size(9) { pdf.text 'I attest that the findings above reflect my professional assessment of the named individual on the date of evaluation.', style: :italic }
    pdf.fill_color '000000'
    pdf.move_down 16

    rule_color = RULE_COLOR
    sig_w = (pdf.bounds.width - 30) / 2
    y0 = pdf.cursor

    [
      ['Signature', 0, sig_w],
      ['Date',      sig_w + 30, sig_w]
    ].each do |label, x, w|
      pdf.bounding_box([x, y0], width: w, height: 40) do
        pdf.move_down 24
        pdf.stroke_color rule_color
        pdf.stroke_horizontal_line(0, w, at: pdf.cursor)
        pdf.move_down 4
        pdf.fill_color MUTED_COLOR
        pdf.font_size(9) { pdf.text label }
        pdf.fill_color '000000'
      end
    end
    pdf.move_cursor_to(y0 - 50)

    pdf.bounding_box([0, pdf.cursor], width: pdf.bounds.width, height: 40) do
      pdf.move_down 24
      pdf.stroke_color rule_color
      pdf.stroke_horizontal_line(0, pdf.bounds.width, at: pdf.cursor)
      pdf.move_down 4
      pdf.fill_color MUTED_COLOR
      pdf.font_size(9) { pdf.text "Printed name, credentials, and license # — pre-filled: #{evaluator[:name] || '____________'}" }
      pdf.fill_color '000000'
    end
  end

  # --- running header / footer (post-content, when page count is known) ---

  def self.render_running_header(pdf, student_name)
    # `dynamic: true` re-executes the block per page so `page_number` /
    # `page_count` are evaluated against the page being rendered, not
    # stamped once with the final page count. See Prawn repeater.rb:72.
    pdf.repeat(:all, dynamic: true) do
      next if pdf.page_number == 1
      pdf.canvas do
        pdf.bounding_box(
          [PAGE_MARGIN, pdf.bounds.top - 20],
          width: pdf.bounds.width - (PAGE_MARGIN * 2),
          height: HEADER_HEIGHT
        ) do
          pdf.fill_color MUTED_COLOR
          pdf.font_size(8.5) do
            left = "#{student_name} · DOB ____________ · Page #{pdf.page_number} of #{pdf.page_count}"
            pdf.formatted_text_box(
              [{ text: left }],
              at: [0, pdf.cursor],
              width: pdf.bounds.width - LOGO_WIDTH - 12
            )
          end
          pdf.fill_color '000000'
          if defined?(LOGO_PATH) && LOGO_PATH && File.exist?(LOGO_PATH)
            pdf.image LOGO_PATH,
              width: LOGO_WIDTH,
              at: [pdf.bounds.width - LOGO_WIDTH, pdf.cursor + 4]
          end
          pdf.move_down 14
          pdf.stroke_color BORDER_COLOR
          pdf.stroke_horizontal_line(0, pdf.bounds.width, at: pdf.cursor)
        end
      end
    end
  end

  def self.render_running_footer(pdf, log)
    pdf.repeat(:all, dynamic: true) do
      pdf.canvas do
        pdf.bounding_box(
          [PAGE_MARGIN, pdf.bounds.bottom + FOOTER_HEIGHT + 6],
          width: pdf.bounds.width - (PAGE_MARGIN * 2),
          height: FOOTER_HEIGHT
        ) do
          pdf.stroke_color BORDER_COLOR
          pdf.stroke_horizontal_line(0, pdf.bounds.width, at: pdf.cursor)
          pdf.move_down 4
          pdf.fill_color MUTED_COLOR
          pdf.font_size(7.5) do
            generated_at = Time.zone.now.strftime('%B %-d, %Y')
            ferpa_short = 'CONFIDENTIAL · FERPA-protected · Do not redisclose without consent.'
            footer_right = "LingoLinq tiered eval · generated #{generated_at} · log #{log.global_id}"
            pdf.formatted_text_box(
              [{ text: ferpa_short }],
              at: [0, pdf.cursor],
              width: pdf.bounds.width / 2
            )
            pdf.formatted_text_box(
              [{ text: footer_right }],
              at: [pdf.bounds.width / 2, pdf.cursor],
              width: pdf.bounds.width / 2,
              align: :right
            )
          end
          pdf.fill_color '000000'
        end
      end
    end
  end

  # --- helpers ------------------------------------------------------------

  def self.section_title(pdf, label)
    pdf.fill_color HEADING_COLOR
    pdf.font_size(13) { pdf.text label, style: :bold }
    pdf.fill_color '000000'
    pdf.move_down 6
  end

  def self.sub_line(pdf, label, value)
    pdf.font_size(10) do
      pdf.formatted_text [
        { text: "#{label}: ", styles: [:bold], color: HEADING_COLOR },
        { text: value.to_s }
      ]
    end
    pdf.move_down 4
  end

  def self.render_blank_lines(pdf, count)
    count.times do
      pdf.move_down 16
      pdf.stroke_color RULE_COLOR
      pdf.stroke_horizontal_line(0, pdf.bounds.width, at: pdf.cursor)
    end
    pdf.move_down 4
  end

  def self.targeted_mode?(mode)
    mode == 'targeted' || mode == 'comprehensive'
  end

  # display_name where available: the local blank check cannot filter the legacy
  # "No name" sentinel, which is a non-empty string. Kept tolerant of a stubbed
  # or non-User object, which is why this is not simply `user.display_name`.
  def self.student_display_name(log)
    user = log.user
    return 'Communicator' unless user
    return user.display_name.to_s if user.respond_to?(:display_name)
    settings = (user.respond_to?(:settings) && user.settings) || {}
    settings['name'].to_s.strip.empty? ? user.user_name.to_s : settings['name']
  end

  def self.evaluator_info(log)
    author = log.author
    return { name: nil, email: nil } unless author
    settings = (author.respond_to?(:settings) && author.settings) || {}
    {
      # See student_display_name above for why this prefers #display_name.
      name: author.respond_to?(:display_name) ? author.display_name :
              (settings['name'].to_s.strip.empty? ? author.user_name : settings['name']),
      email: settings['email']
    }
  end
end
