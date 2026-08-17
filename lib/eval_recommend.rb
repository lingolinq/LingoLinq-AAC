module EvalRecommend
  # Pure recommendation function for Quick Screen eval results.
  # Mirrors app/frontend/app/utils/eval_recommend.js for offline + Resque parity.
  # Inputs:
  #   events - Array<Hash>: subtest event records (see docs/EVAL_REWORK_PLAN.md schema).
  #   intake - Hash: intake form values (age_band, etiology, current_comm, suspected_access).
  # Output: Hash conforming to the recommendation schema in the plan doc.

  # Grid bands tuned so 60 and 84 sit as the most-common "doing well"
  # recommendations, with 24 as the smallest default and 112 as the
  # top tier. Thresholds intentionally permissive — a 4×4 access hit
  # lands at 60, a 4×6 access hit lands at 84. Mirrors
  # app/frontend/app/utils/eval_recommend.js GRID_BANDS exactly.
  GRID_BANDS = [
    { min_buttons: 1,  band: 'tiny',   rows: 4, cols: 6 },    # 24
    { min_buttons: 9,  band: 'small',  rows: 5, cols: 8 },    # 40
    { min_buttons: 16, band: 'medium', rows: 6, cols: 10 },   # 60
    { min_buttons: 24, band: 'large',  rows: 7, cols: 12 },   # 84
    { min_buttons: 48, band: 'xlarge', rows: 8, cols: 14 }    # 112
  ].freeze

  ACCESS_METHODS = %w[touch scan gaze].freeze

  STAGE_FROM_INTAKE = {
    'none_observable' => 1,
    'pre_symbolic'    => 3,
    'single_symbol'   => 4,
    'phrase'          => 6,
    'sentence'        => 7
  }.freeze

  def self.from_quick_screen(events, intake)
    events ||= []
    intake ||= {}
    # Controllers pass intake through as ActionController::Parameters;
    # tests/jobs may hand in a plain Hash. Normalize to a string-keyed
    # Hash so subsequent lookups like intake['age_band'] always work.
    intake = intake.respond_to?(:to_unsafe_h) ? intake.to_unsafe_h : intake.to_h
    intake = intake.each_with_object({}) {|(k, v), h| h[k.to_s] = v }
    events = events.map {|e| e.respond_to?(:to_unsafe_h) ? e.to_unsafe_h : e }

    access     = pick_access(events_for(events, 'access_snapshot'), intake)
    grid       = pick_grid(events_for(events, 'access_snapshot'))
    library    = pick_library(events_for(events, 'library_compare'))
    stage      = pick_stage(events_for(events, 'stage_probe'), intake)
    vocab      = pick_vocab(events_for(events, 'vocab_probe'), intake)
    confidence = compute_confidence(events, access, library, stage)

    {
      'access_method'        => access[:method],
      'access_secondary'     => access[:secondary],
      'grid_size'            => grid,
      'library'              => library[:winner],
      'communicator_stage'   => stage,
      'vocab_recommendation' => vocab,
      'starter_board_spec'   => assemble_board_spec(grid, library, vocab, stage),
      'confidence'           => confidence,
      'next_action'          => confidence < 0.6 ? 'promote_to_targeted' : 'build_starter_board',
      'promote_reasons'      => promotion_reasons(events, access, library, stage)
    }
  end

  # Mirrors the frontend eval_recommend.fromTargeted — extends the
  # Quick Screen recommendation with overrides derived from the
  # Targeted Eval's adaptive_grid, library_3way, access_co_trial and
  # syntax_probe converged events.
  def self.from_targeted(events, intake)
    events ||= []
    intake ||= {}
    intake = intake.respond_to?(:to_unsafe_h) ? intake.to_unsafe_h : intake.to_h
    intake = intake.each_with_object({}) {|(k, v), h| h[k.to_s] = v }
    events = events.map {|e| e.respond_to?(:to_unsafe_h) ? e.to_unsafe_h : e }

    base = from_quick_screen(events, intake)

    grid_sweep   = pick_grid_from_sweep(events)
    library_3way = pick_library_3way(events)
    access_cotr  = pick_access_from_cotrial(events)
    syntax       = pick_syntax(events)
    motor_map    = pick_motor_map(events)

    grid             = grid_sweep || base['grid_size']
    library_winner   = library_3way ? library_3way[:winner] : base['library']
    access_method    = access_cotr  ? access_cotr[:method]  : base['access_method']
    access_secondary = access_cotr  ? access_cotr[:secondary] : base['access_secondary']

    confidence = base['confidence']
    confidence += 0.10 if grid_sweep
    confidence += 0.08 if library_3way
    confidence += 0.08 if access_cotr
    confidence += 0.05 if syntax
    confidence += 0.05 if motor_map
    confidence = 0.95 if confidence > 0.95
    confidence = (confidence * 100).round / 100.0

    base.merge(
      'access_method'        => access_method,
      'access_secondary'     => access_secondary,
      'grid_size'            => grid,
      'library'              => library_winner,
      'starter_board_spec'   => assemble_board_spec(
        grid,
        { winner: library_winner, margin: (library_3way ? library_3way[:margin] : 0) },
        base['vocab_recommendation'],
        base['communicator_stage']
      ),
      'confidence'           => confidence,
      'next_action'          => confidence < 0.7 ? 'promote_to_comprehensive' : 'build_starter_board',
      'eval_mode'            => 'targeted',
      'targeted_report'      => {
        'adaptive_grid'   => grid_sweep,
        'library_3way'    => library_3way,
        'access_co_trial' => access_cotr,
        'syntax_probe'    => syntax,
        'motor_map'       => motor_map
      }
    )
  end

  def self.pick_grid_from_sweep(events)
    converge = events.select {|e| (e['subtest'] || e[:subtest]) == 'adaptive_grid' && (e['converged'] || e[:converged]) }.last
    return nil unless converge
    rec = converge['recommendation'] || converge[:recommendation]
    rec && (rec.respond_to?(:to_unsafe_h) ? rec.to_unsafe_h : rec.to_h)
  end

  def self.pick_library_3way(events)
    converge = events.select {|e| (e['subtest'] || e[:subtest]) == 'library_3way' && (e['converged'] || e[:converged]) }.last
    return nil unless converge && (converge['winner'] || converge[:winner])
    winner = converge['winner'] || converge[:winner]
    picks  = converge['picks']  || converge[:picks] || {}
    total  = picks.values.map(&:to_i).sum
    winner_picks = picks[winner].to_i
    runner_up = picks.reject {|k, _| k == winner }.values.map(&:to_i).max || 0
    margin = total.positive? ? (((winner_picks - runner_up).to_f / total) * 1000).round / 1000.0 : 0.0
    { winner: winner, margin: margin, picks: picks }
  end

  def self.pick_access_from_cotrial(events)
    converge = events.select {|e| (e['subtest'] || e[:subtest]) == 'access_co_trial' && (e['converged'] || e[:converged]) }.last
    return nil unless converge && (converge['winner'] || converge[:winner])
    winner = converge['winner'] || converge[:winner]
    summary = converge['summary'] || converge[:summary] || []
    top, runner = summary[0], summary[1]
    secondary = if runner && (runner['attempts'] || runner[:attempts]).to_i.positive? && (runner['accuracy'] || runner[:accuracy]).to_f >= 0.5
                  runner['method'] || runner[:method]
                else
                  nil
                end
    {
      method:    winner,
      accuracy:  top ? (top['accuracy'] || top[:accuracy] || 0) : 0,
      secondary: secondary,
      tallies:   converge['tallies'] || converge[:tallies] || {}
    }
  end

  # motor_map mirror of the frontend eval_recommend.pickMotorMap. The
  # converged event has hit_locations + accuracy precomputed; fall
  # back to assembling them from the per-trial events when convergence
  # was skipped so a partial subtest still yields a renderable summary.
  def self.pick_motor_map(events)
    converge = events.select {|e| (e['subtest'] || e[:subtest]) == 'motor_map' && (e['converged'] || e[:converged]) }.last
    if converge
      return {
        'rows'          => converge['rows']          || converge[:rows],
        'cols'          => converge['cols']          || converge[:cols],
        'total_trials'  => converge['total_trials']  || converge[:total_trials],
        'total_correct' => converge['total_correct'] || converge[:total_correct],
        'accuracy'      => converge['accuracy']      || converge[:accuracy],
        'hit_locations' => (converge['hit_locations'] || converge[:hit_locations] || []).map {|h| h.respond_to?(:to_unsafe_h) ? h.to_unsafe_h : h }
      }
    end
    trials = events.select {|e| (e['subtest'] || e[:subtest]) == 'motor_map' && !(e['converged'] || e[:converged]) }
    return nil if trials.empty?
    total   = trials.length
    correct = trials.count {|t| t['correct'] || t[:correct] }
    {
      'rows'          => trials[0]['rows'] || trials[0][:rows],
      'cols'          => trials[0]['cols'] || trials[0][:cols],
      'total_trials'  => total,
      'total_correct' => correct,
      'accuracy'      => total.positive? ? (correct.to_f / total) : 0.0,
      'hit_locations' => trials.map do |t|
        {
          'possibly_correct' => true,
          'correct'          => !!(t['correct'] || t[:correct]),
          'partial'          => false,
          'cpctx'            => t['cpctx'] || t[:cpctx],
          'cpcty'            => t['cpcty'] || t[:cpcty],
          'pctx'             => t['pctx']  || t[:pctx],
          'pcty'             => t['pcty']  || t[:pcty]
        }
      end
    }
  end

  def self.pick_syntax(events)
    converge = events.select {|e| (e['subtest'] || e[:subtest]) == 'syntax_probe' && (e['converged'] || e[:converged]) }.last
    return nil unless converge
    summary = converge['summary'] || converge[:summary]
    summary && (summary.respond_to?(:to_unsafe_h) ? summary.to_unsafe_h : summary.to_h)
  end

  # Mirrors the frontend eval_recommend.fromComprehensive — extends
  # the Targeted recommendation with the comprehensive subtests:
  # dynamic_assessment learning-potential summary, literacy_probe
  # score, and the SETT companion form. AI narrative is carried on
  # the session payload and surfaced verbatim on the report.
  def self.from_comprehensive(events, intake, sett = nil)
    events ||= []
    intake ||= {}
    intake = intake.respond_to?(:to_unsafe_h) ? intake.to_unsafe_h : intake.to_h
    intake = intake.each_with_object({}) {|(k, v), h| h[k.to_s] = v }
    sett = sett.respond_to?(:to_unsafe_h) ? sett.to_unsafe_h : (sett.respond_to?(:to_h) ? sett.to_h : nil)
    events = events.map {|e| e.respond_to?(:to_unsafe_h) ? e.to_unsafe_h : e }

    base     = from_targeted(events, intake)
    da       = pick_dynamic_assessment(events)
    literacy = pick_literacy_probe(events)

    confidence = base['confidence']
    confidence += 0.12 if da
    confidence += 0.05 if literacy
    confidence += 0.03 if sett && (sett['student'].to_s.length.positive? || sett['environment'].to_s.length.positive? || sett['task'].to_s.length.positive?)
    confidence = 0.99 if confidence > 0.99
    confidence = (confidence * 100).round / 100.0

    stage = base['communicator_stage']
    if da && (da['independence_pct'] || da[:independence_pct]).to_i >= 60 && stage && stage.to_i < 6
      stage = stage.to_i + 1
    end

    base.merge(
      'communicator_stage'    => stage,
      'confidence'            => confidence,
      'next_action'           => 'build_starter_board',
      'eval_mode'             => 'comprehensive',
      'comprehensive_report'  => {
        'dynamic_assessment' => da,
        'literacy_probe'     => literacy,
        'sett'               => sett,
        'targeted'           => base['targeted_report']
      }
    )
  end

  def self.pick_dynamic_assessment(events)
    converge = events.select {|e| (e['subtest'] || e[:subtest]) == 'dynamic_assessment' && (e['converged'] || e[:converged]) }.last
    return nil unless converge
    summary = converge['summary'] || converge[:summary]
    return nil unless summary
    h = summary.respond_to?(:to_unsafe_h) ? summary.to_unsafe_h : summary.to_h
    # Normalize to string keys so downstream callers (and the JSON
    # serializer) can use h['independence_pct'] regardless of whether
    # the caller passed symbol- or string-keyed events.
    h.each_with_object({}) {|(k, v), out| out[k.to_s] = v }
  end

  def self.pick_literacy_probe(events)
    converge = events.select {|e| (e['subtest'] || e[:subtest]) == 'literacy_probe' && (e['converged'] || e[:converged]) }.last
    return nil unless converge
    summary = converge['summary'] || converge[:summary]
    summary && (summary.respond_to?(:to_unsafe_h) ? summary.to_unsafe_h : summary.to_h)
  end

  def self.events_for(events, subtest)
    events.select {|e| e['subtest'] == subtest || e[:subtest] == subtest }
  end

  def self.pick_access(events, intake)
    by_method = events.group_by {|e| e['access_method'] || e[:access_method] || intake['suspected_access'] || 'touch' }
    scored = by_method.map do |method, evs|
      correct = evs.count {|e| (e['response'] || e[:response]) == 'correct' }
      total   = evs.length.nonzero? || 1
      avg_lat = evs.map {|e| (e['latency_ms'] || e[:latency_ms]).to_i }.reject(&:zero?).then {|l| l.empty? ? 0 : l.sum.to_f / l.length }
      score   = (correct.to_f / total) - (avg_lat / 10_000.0)
      [method, { score: score, accuracy: correct.to_f / total, latency: avg_lat }]
    end.sort_by {|_, v| -v[:score] }

    primary = scored.first
    secondary = scored[1]
    {
      method:    primary ? primary[0] : (intake['suspected_access'] || 'touch'),
      secondary: secondary && secondary[1][:score] > 0.5 ? secondary[0] : nil,
      detail:    scored.to_h
    }
  end

  def self.pick_grid(events)
    correct = events.select {|e| (e['response'] || e[:response]) == 'correct' }
    sizes = correct.map do |e|
      grid = e['grid'] || e[:grid] || []
      grid[0].to_i * grid[1].to_i
    end
    # Floor at 1 so the no-data case lands in the tiny (24-button)
    # band — the spec'd minimum default. Floors >= 9 would bump the
    # recommendation up into small (40+) by accident.
    max_correct_size = [sizes.max || 0, 1].max

    band = GRID_BANDS.reverse.find {|b| max_correct_size >= b[:min_buttons] } || GRID_BANDS.first
    { 'rows' => band[:rows], 'cols' => band[:cols], 'band' => band[:band] }
  end

  def self.pick_library(events)
    by_lib = events.group_by {|e| e['library'] || e[:library] }
    return { winner: nil, margin: 0.0, response_times: {} } if by_lib.empty?
    scored = by_lib.map do |lib, evs|
      correct = evs.count {|e| (e['response'] || e[:response]) == 'correct' }
      total   = evs.length.nonzero? || 1
      avg_lat = evs.map {|e| (e['latency_ms'] || e[:latency_ms]).to_i }.reject(&:zero?).then {|l| l.empty? ? 0 : l.sum.to_f / l.length }
      [lib, correct.to_f / total, avg_lat]
    end.sort_by {|_, acc, lat| [-acc, lat] }
    winner_acc = scored.first[1]
    runner_up_acc = scored[1] ? scored[1][1] : 0.0
    {
      winner: scored.first[0],
      margin: (winner_acc - runner_up_acc).round(3),
      response_times: scored.to_h {|lib, _, lat| [lib, lat] }
    }
  end

  def self.pick_stage(events, intake)
    base = STAGE_FROM_INTAKE[intake['current_comm']] || 4
    return base if events.empty?
    correct_pct = events.count {|e| (e['response'] || e[:response]) == 'correct' }.to_f / events.length
    delta = correct_pct >= 0.75 ? 1 : (correct_pct <= 0.25 ? -1 : 0)
    [[base + delta, 1].max, 7].min
  end

  def self.pick_vocab(events, intake)
    correct = events.count {|e| (e['response'] || e[:response]) == 'correct' }
    total   = events.length.nonzero? || 1
    pct = correct.to_f / total
    band = pct >= 0.66 ? 'expanding' : (pct >= 0.33 ? 'emerging' : 'foundational')
    fringe = case intake['age_band']
             when '<3', '3-5'   then %w[food animals play family]
             when '6-12'        then %w[food school play feelings]
             when '13-21'       then %w[social school feelings activities]
             when '22-64', '65+' then %w[needs people activities feelings]
             else %w[food people activities]
             end
    { 'core' => true, 'fringe_categories' => fringe, 'band' => band }
  end

  def self.assemble_board_spec(grid, library, vocab, stage)
    {
      'grid'         => grid,
      'library'      => library[:winner],
      'vocab_band'   => vocab['band'],
      'stage'        => stage,
      'core_layout'  => stage >= 4 ? 'core_first' : 'choice_grid',
      'fringe_seeds' => vocab['fringe_categories']
    }
  end

  def self.compute_confidence(events, access, library, _stage)
    return 0.0 if events.empty?
    counts = events.length
    # Denominator = events a COMPLETE session is expected to produce.
    # library_compare contributes 4; when it is not in the flow (single-library
    # deployments, eval_single_library flag) the target drops to 8 and the
    # library bonus is unreachable. Keyed off the events, not the flag, so a
    # saved session is always scored by the rule that generated it.
    library_ran = events.any? {|e| (e['subtest'] || e[:subtest]) == 'library_compare' }
    base = [counts / (library_ran ? 12.0 : 8.0), 1.0].min
    library_bonus = (library_ran && (library[:margin] || 0.0) >= 0.2) ? 0.1 : 0.0
    secondary_penalty = access[:secondary] ? -0.05 : 0.0
    raw = base + library_bonus + secondary_penalty
    # Cap upper bound at 0.95 to match Targeted-eval downstream and
    # fix the 110% confidence bug (base + library_bonus could push
    # past 100% on a clean Quick Screen with many events + clear
    # library winner).
    clamped = [[raw, 0.0].max, 0.95].min
    (clamped * 100).round / 100.0
  end

  def self.promotion_reasons(events, access, library, stage)
    reasons = []
    reasons << 'low_event_count' if events.length < 8
    reasons << 'access_ambiguous' if access[:secondary]
    # Only a session that actually ran the bake-off can have an ambiguous winner.
    library_ran = events.any? {|e| (e['subtest'] || e[:subtest]) == 'library_compare' }
    reasons << 'library_tie' if library_ran && library[:margin] && library[:margin] < 0.1 && library[:winner]
    reasons << 'stage_borderline' if [3, 4].include?(stage)
    reasons
  end
end
