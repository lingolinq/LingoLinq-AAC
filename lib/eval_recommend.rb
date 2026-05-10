module EvalRecommend
  # Pure recommendation function for Quick Screen eval results.
  # Mirrors app/frontend/app/utils/eval_recommend.js for offline + Resque parity.
  # Inputs:
  #   events - Array<Hash>: subtest event records (see docs/EVAL_REWORK_PLAN.md schema).
  #   intake - Hash: intake form values (age_band, etiology, current_comm, suspected_access).
  # Output: Hash conforming to the recommendation schema in the plan doc.

  GRID_BANDS = [
    { min_buttons: 1,  band: 'tiny',   rows: 2, cols: 2 },
    { min_buttons: 4,  band: 'small',  rows: 3, cols: 3 },
    { min_buttons: 9,  band: 'medium', rows: 4, cols: 6 },
    { min_buttons: 16, band: 'large',  rows: 6, cols: 10 },
    { min_buttons: 36, band: 'xlarge', rows: 8, cols: 14 }
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
    max_correct_size = correct.map do |e|
      grid = e['grid'] || e[:grid] || []
      grid[0].to_i * grid[1].to_i
    end.max || 4

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
    base = [counts / 12.0, 1.0].min
    library_bonus = (library[:margin] || 0.0) >= 0.2 ? 0.1 : 0.0
    secondary_penalty = access[:secondary] ? -0.05 : 0.0
    [(base + library_bonus + secondary_penalty).round(2), 0.0].max
  end

  def self.promotion_reasons(events, access, library, stage)
    reasons = []
    reasons << 'low_event_count' if events.length < 8
    reasons << 'access_ambiguous' if access[:secondary]
    reasons << 'library_tie' if library[:margin] && library[:margin] < 0.1 && library[:winner]
    reasons << 'stage_borderline' if [3, 4].include?(stage)
    reasons
  end
end
