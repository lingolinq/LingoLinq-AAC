/*
 * Pure recommendation function for the Quick Screen eval mode.
 * Mirrors lib/eval_recommend.rb. No Ember dependencies — keep this importable
 * by tests, web workers, and offline contexts.
 */

const GRID_BANDS = [
  { min: 1,  band: 'tiny',   rows: 2, cols: 2 },
  { min: 4,  band: 'small',  rows: 3, cols: 3 },
  { min: 9,  band: 'medium', rows: 4, cols: 6 },
  { min: 16, band: 'large',  rows: 6, cols: 10 },
  { min: 36, band: 'xlarge', rows: 8, cols: 14 }
];

const STAGE_FROM_INTAKE = {
  none_observable: 1,
  pre_symbolic: 3,
  single_symbol: 4,
  phrase: 6,
  sentence: 7
};

function pickField(ev, key) {
  return ev[key];
}

function eventsForSubtest(events, subtest) {
  return events.filter(function(e) { return e.subtest === subtest; });
}

function avg(arr) {
  if (!arr.length) { return 0; }
  return arr.reduce(function(s, v) { return s + v; }, 0) / arr.length;
}

function pickAccess(events, intake) {
  const groups = {};
  events.forEach(function(e) {
    const m = e.access_method || intake.suspected_access || 'touch';
    groups[m] = groups[m] || [];
    groups[m].push(e);
  });
  const scored = Object.keys(groups).map(function(method) {
    const evs = groups[method];
    const correct = evs.filter(function(e) { return e.response === 'correct'; }).length;
    const total = evs.length || 1;
    const lat = avg(evs.map(function(e) { return e.latency_ms || 0; }).filter(function(n) { return n > 0; }));
    const score = (correct / total) - (lat / 10000);
    return { method: method, score: score, accuracy: correct / total, latency: lat };
  }).sort(function(a, b) { return b.score - a.score; });

  const primary = scored[0];
  const secondary = scored[1];
  return {
    method: primary ? primary.method : (intake.suspected_access || 'touch'),
    secondary: secondary && secondary.score > 0.5 ? secondary.method : null,
    detail: scored
  };
}

function pickGrid(events) {
  const correct = events.filter(function(e) { return e.response === 'correct'; });
  let max = 4;
  correct.forEach(function(e) {
    const g = e.grid || [];
    const size = (g[0] || 0) * (g[1] || 0);
    if (size > max) { max = size; }
  });
  const band = GRID_BANDS.slice().reverse().find(function(b) { return max >= b.min; }) || GRID_BANDS[0];
  return { rows: band.rows, cols: band.cols, band: band.band };
}

function pickLibrary(events) {
  if (!events.length) { return { winner: null, margin: 0, response_times: {} }; }
  const groups = {};
  events.forEach(function(e) {
    const lib = e.library || 'unknown';
    groups[lib] = groups[lib] || [];
    groups[lib].push(e);
  });
  const scored = Object.keys(groups).map(function(lib) {
    const evs = groups[lib];
    const correct = evs.filter(function(e) { return e.response === 'correct'; }).length;
    const total = evs.length || 1;
    const lat = avg(evs.map(function(e) { return e.latency_ms || 0; }).filter(function(n) { return n > 0; }));
    return { library: lib, accuracy: correct / total, latency: lat };
  }).sort(function(a, b) {
    if (b.accuracy !== a.accuracy) { return b.accuracy - a.accuracy; }
    return a.latency - b.latency;
  });

  const winner = scored[0];
  const runner = scored[1];
  const response_times = {};
  scored.forEach(function(s) { response_times[s.library] = s.latency; });
  return {
    winner: winner.library,
    margin: Math.round(((winner.accuracy - (runner ? runner.accuracy : 0)) * 1000)) / 1000,
    response_times: response_times
  };
}

function pickStage(events, intake) {
  const base = STAGE_FROM_INTAKE[intake.current_comm] || 4;
  if (!events.length) { return base; }
  const correct = events.filter(function(e) { return e.response === 'correct'; }).length;
  const pct = correct / events.length;
  let delta = 0;
  if (pct >= 0.75) { delta = 1; }
  else if (pct <= 0.25) { delta = -1; }
  return Math.max(1, Math.min(7, base + delta));
}

function pickVocab(events, intake) {
  const correct = events.filter(function(e) { return e.response === 'correct'; }).length;
  const total = events.length || 1;
  const pct = correct / total;
  const band = pct >= 0.66 ? 'expanding' : (pct >= 0.33 ? 'emerging' : 'foundational');
  let fringe;
  switch (intake.age_band) {
    case '<3':
    case '3-5':    fringe = ['food', 'animals', 'play', 'family']; break;
    case '6-12':   fringe = ['food', 'school', 'play', 'feelings']; break;
    case '13-21':  fringe = ['social', 'school', 'feelings', 'activities']; break;
    case '22-64':
    case '65+':    fringe = ['needs', 'people', 'activities', 'feelings']; break;
    default:       fringe = ['food', 'people', 'activities'];
  }
  return { core: true, fringe_categories: fringe, band: band };
}

function assembleBoardSpec(grid, library, vocab, stage) {
  return {
    grid: grid,
    library: library.winner,
    vocab_band: vocab.band,
    stage: stage,
    core_layout: stage >= 4 ? 'core_first' : 'choice_grid',
    fringe_seeds: vocab.fringe_categories
  };
}

function computeConfidence(events, access, library) {
  if (!events.length) { return 0; }
  const base = Math.min(events.length / 12, 1);
  const libraryBonus = (library.margin || 0) >= 0.2 ? 0.1 : 0;
  const secondaryPenalty = access.secondary ? -0.05 : 0;
  return Math.max(0, Math.round((base + libraryBonus + secondaryPenalty) * 100) / 100);
}

function promotionReasons(events, access, library, stage) {
  const reasons = [];
  if (events.length < 8) { reasons.push('low_event_count'); }
  if (access.secondary) { reasons.push('access_ambiguous'); }
  if (library.winner && library.margin < 0.1) { reasons.push('library_tie'); }
  if (stage === 3 || stage === 4) { reasons.push('stage_borderline'); }
  return reasons;
}

function fromQuickScreen(events, intake) {
  events = events || [];
  intake = intake || {};

  const access  = pickAccess(eventsForSubtest(events, 'access_snapshot'), intake);
  const grid    = pickGrid(eventsForSubtest(events, 'access_snapshot'));
  const library = pickLibrary(eventsForSubtest(events, 'library_compare'));
  const stage   = pickStage(eventsForSubtest(events, 'stage_probe'), intake);
  const vocab   = pickVocab(eventsForSubtest(events, 'vocab_probe'), intake);
  const confidence = computeConfidence(events, access, library);

  return {
    access_method: access.method,
    access_secondary: access.secondary,
    grid_size: grid,
    library: library.winner,
    communicator_stage: stage,
    vocab_recommendation: vocab,
    starter_board_spec: assembleBoardSpec(grid, library, vocab, stage),
    confidence: confidence,
    next_action: confidence < 0.6 ? 'promote_to_targeted' : 'build_starter_board',
    promote_reasons: promotionReasons(events, access, library, stage)
  };
}

function profileForIntake(intake) {
  intake = intake || {};
  if (intake.current_comm === 'pre_symbolic' || intake.current_comm === 'none_observable') { return 'early-comm'; }
  if (['<3', '3-5', '6-12'].indexOf(intake.age_band) >= 0 && intake.current_comm === 'single_symbol') { return 'peds-emerging'; }
  if (['6-12', '13-21'].indexOf(intake.age_band) >= 0 && ['phrase', 'sentence'].indexOf(intake.current_comm) >= 0) { return 'peds-established'; }
  if (intake.etiology === 'progressive') { return 'adult-progressive'; }
  if (['22-64', '65+'].indexOf(intake.age_band) >= 0 || intake.etiology === 'acquired') { return 'adult-motor'; }
  return 'peds-emerging';
}

const eval_recommend = {
  fromQuickScreen: fromQuickScreen,
  profileForIntake: profileForIntake,
  GRID_BANDS: GRID_BANDS
};

window.eval_recommend = eval_recommend;
export default eval_recommend;
