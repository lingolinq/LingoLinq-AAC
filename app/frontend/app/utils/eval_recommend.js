/*
 * Pure recommendation function for the Quick Screen eval mode.
 * Mirrors lib/eval_recommend.rb. No Ember dependencies — keep this importable
 * by tests, web workers, and offline contexts.
 */

// Grid bands tuned so 60 and 84 sit as the most-common "doing well"
// recommendations, with 24 as the smallest default and 112 as the
// top tier. Thresholds are intentionally permissive — a student
// who reliably selects a 4×4 (16 cells) lands at 60, a 4×6 (24
// cells) lands at 84. Anchored to commercial AAC defaults: PRC
// LAMP / WordPower (84), Smartbox Super Core 50 / Grid 60, and
// per-org overrides will be wired in a later phase.
const GRID_BANDS = [
  { min: 1,  band: 'tiny',   rows: 4, cols: 6 },    // 24 — smallest default
  { min: 9,  band: 'small',  rows: 5, cols: 8 },    // 40
  { min: 16, band: 'medium', rows: 6, cols: 10 },   // 60 — sweet spot
  { min: 24, band: 'large',  rows: 7, cols: 12 },   // 84 — sweet spot
  { min: 48, band: 'xlarge', rows: 8, cols: 14 }    // 112 — largest
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
  // Floor at 1 so a student with no correct access events lands in
  // the tiny (24-button) band — the spec'd minimum default board
  // size. Higher floors push the no-data case into small (40) which
  // overrules the "smallest default = 24" requirement.
  let max = 1;
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
  // 3-way bake-off path: events carry `library_picked` directly
  // (the library whose symbol the user tapped). Tally picks; the
  // library with the most picks wins. Tie-break by lower latency.
  const hasPicks = events.some(function(e) { return e.library_picked; });
  if (hasPicks) {
    const tallies = {};
    const lats = {};
    events.forEach(function(e) {
      if (!e.library_picked) { return; }
      tallies[e.library_picked] = (tallies[e.library_picked] || 0) + 1;
      if (e.latency_ms) {
        lats[e.library_picked] = lats[e.library_picked] || [];
        lats[e.library_picked].push(e.latency_ms);
      }
    });
    const ranked = Object.keys(tallies).map(function(lib) {
      return { library: lib, picks: tallies[lib], latency: avg(lats[lib] || []) };
    }).sort(function(a, b) {
      if (b.picks !== a.picks) { return b.picks - a.picks; }
      return a.latency - b.latency;
    });
    const total = ranked.reduce(function(s, r) { return s + r.picks; }, 0) || 1;
    const winner = ranked[0];
    const runner = ranked[1];
    const margin = winner && runner ? (winner.picks - runner.picks) / total : (winner ? 1 : 0);
    const response_times = {};
    ranked.forEach(function(r) { response_times[r.library] = r.latency; });
    return {
      winner: winner ? winner.library : null,
      margin: Math.round(margin * 1000) / 1000,
      tallies: tallies,
      response_times: response_times,
      ranked: ranked
    };
  }
  // Legacy path — score by accuracy + latency on a/b labeled events.
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
  // `base` already caps at 1.0; adding the library bonus on top
  // pushed the Quick-Screen-only path past 100% (the source of the
  // "110% confidence" bug). Clamp the upper bound to 0.95 to match
  // the Targeted-eval cap downstream — once we know there's a clear
  // library winner + plenty of events, 95% is honest; 100%+ isn't.
  // The denominator is the number of events a COMPLETE session is expected to
  // produce. library_compare contributes 4 of them, so when that subtest is not
  // in the flow (single-library deployments — see the eval_single_library flag)
  // the target drops to 8 and the library bonus is not reachable. Keying off the
  // events themselves rather than the flag keeps a session scored by the same
  // rule that generated it, including saved sessions recorded before the change.
  const libraryRan = events.some(function(e) { return e.subtest === 'library_compare'; });
  const base = Math.min(events.length / (libraryRan ? 12 : 8), 1);
  const libraryBonus = (libraryRan && (library.margin || 0) >= 0.2) ? 0.1 : 0;
  const secondaryPenalty = access.secondary ? -0.05 : 0;
  const raw = base + libraryBonus + secondaryPenalty;
  const clamped = Math.max(0, Math.min(0.95, raw));
  return Math.round(clamped * 100) / 100;
}

function promotionReasons(events, access, library, stage) {
  const reasons = [];
  if (events.length < 8) { reasons.push('low_event_count'); }
  if (access.secondary) { reasons.push('access_ambiguous'); }
  // Only a session that actually ran the bake-off can have an ambiguous winner.
  if (events.some(function(e) { return e.subtest === 'library_compare'; }) &&
      library.winner && library.margin < 0.1) { reasons.push('library_tie'); }
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

// ============================================================
// Targeted Eval (Mode 2) recommendation
// ============================================================
// Builds on the Quick Screen recommendation by consuming the
// targeted events (adaptive_grid, library_3way, access_co_trial,
// syntax_probe). Falls back to screening data when a targeted
// subtest was skipped.

function pickGridFromSweep(events) {
  const converge = events.filter(function(e) { return e.subtest === 'adaptive_grid' && e.converged; }).pop();
  if (converge && converge.recommendation) { return converge.recommendation; }
  return null;
}

function pickLibrary3Way(events) {
  const converge = events.filter(function(e) { return e.subtest === 'library_3way' && e.converged; }).pop();
  if (converge && converge.winner) {
    const picks = converge.picks || {};
    const total = Object.keys(picks).reduce(function(s, k) { return s + (picks[k] || 0); }, 0);
    const winnerPicks = picks[converge.winner] || 0;
    const others = Object.keys(picks).filter(function(k) { return k !== converge.winner; }).map(function(k) { return picks[k] || 0; });
    const runnerUp = others.length ? Math.max.apply(null, others) : 0;
    const margin = total > 0 ? Math.round(((winnerPicks - runnerUp) / total) * 1000) / 1000 : 0;
    return { winner: converge.winner, margin: margin, picks: picks };
  }
  return null;
}

function pickAccessFromCoTrial(events) {
  const converge = events.filter(function(e) { return e.subtest === 'access_co_trial' && e.converged; }).pop();
  if (converge && converge.winner) {
    const summary = converge.summary || [];
    const top = summary[0] || {};
    const runner = summary[1];
    return {
      method: converge.winner,
      accuracy: top.accuracy || 0,
      secondary: (runner && runner.attempts && runner.accuracy >= 0.5) ? runner.method : null,
      tallies: converge.tallies || {}
    };
  }
  return null;
}

function pickSyntax(events) {
  const converge = events.filter(function(e) { return e.subtest === 'syntax_probe' && e.converged; }).pop();
  if (converge && converge.summary) { return converge.summary; }
  return null;
}

// motor_map — surface the SLP-captured cell-resolution hit pattern as
// a summary the eval-saved-summary / PDF can render via the existing
// stats/eval-hits heatmap. We prefer the converged event (already
// has hit_locations + accuracy precomputed) but synthesize from
// raw trials if convergence was skipped.
function pickMotorMap(events) {
  const converged = events.filter(function(e) { return e.subtest === 'motor_map' && e.converged; }).pop();
  if (converged) {
    return {
      rows: converged.rows,
      cols: converged.cols,
      total_trials: converged.total_trials,
      total_correct: converged.total_correct,
      accuracy: converged.accuracy,
      hit_locations: converged.hit_locations || []
    };
  }
  const trials = events.filter(function(e) { return e.subtest === 'motor_map' && !e.converged; });
  if (!trials.length) { return null; }
  const total = trials.length;
  const correct = trials.filter(function(t) { return t.correct; }).length;
  return {
    rows: trials[0].rows,
    cols: trials[0].cols,
    total_trials: total,
    total_correct: correct,
    accuracy: total ? correct / total : 0,
    hit_locations: trials.map(function(t) {
      return {
        possibly_correct: true,
        correct: !!t.correct,
        partial: false,
        cpctx: t.cpctx, cpcty: t.cpcty,
        pctx: t.pctx,  pcty: t.pcty
      };
    })
  };
}

function fromTargeted(events, intake) {
  events = events || [];
  intake = intake || {};

  // Start with the Quick Screen recommendation as a base — that
  // way targeted output always has at least the screening's
  // confidence + screening-derived fields, and a skipped targeted
  // subtest doesn't blank-out the corresponding recommendation.
  const base = fromQuickScreen(events, intake);

  const gridFromSweep    = pickGridFromSweep(events);
  const library3Way      = pickLibrary3Way(events);
  const accessFromCotr   = pickAccessFromCoTrial(events);
  const syntax           = pickSyntax(events);
  const motorMap         = pickMotorMap(events);

  const grid = gridFromSweep || base.grid_size;
  const library = library3Way ? library3Way.winner : base.library;
  const accessMethod = accessFromCotr ? accessFromCotr.method : base.access_method;
  const accessSecondary = accessFromCotr ? accessFromCotr.secondary : base.access_secondary;

  // Confidence climbs when targeted data is present — each
  // converged subtest adds 0.05–0.10. Caps at 0.95.
  let confidence = base.confidence;
  if (gridFromSweep) { confidence += 0.10; }
  if (library3Way) { confidence += 0.08; }
  if (accessFromCotr) { confidence += 0.08; }
  if (syntax) { confidence += 0.05; }
  if (motorMap) { confidence += 0.05; }
  if (confidence > 0.95) { confidence = 0.95; }
  confidence = Math.round(confidence * 100) / 100;

  const targetedReport = {
    adaptive_grid: gridFromSweep,
    library_3way: library3Way,
    access_co_trial: accessFromCotr,
    syntax_probe: syntax,
    motor_map: motorMap
  };

  return Object.assign({}, base, {
    access_method: accessMethod,
    access_secondary: accessSecondary,
    grid_size: grid,
    library: library,
    starter_board_spec: assembleBoardSpec(
      grid,
      { winner: library, margin: library3Way ? library3Way.margin : 0 },
      base.vocab_recommendation,
      base.communicator_stage
    ),
    confidence: confidence,
    next_action: confidence < 0.7 ? 'promote_to_comprehensive' : 'build_starter_board',
    eval_mode: 'targeted',
    targeted_report: targetedReport
  });
}

// ============================================================
// Comprehensive Eval (Mode 3) recommendation
// ============================================================
// Builds on the Targeted recommendation by consuming the
// comprehensive subtests: dynamic_assessment converges with a
// learning-potential summary (independence_avg, independence_pct,
// supported_pct, not_yet_pct), literacy_probe with a basic literacy
// score, plus the SETT form + AI narrative carried on the session.

function pickDynamicAssessment(events) {
  const converge = events.filter(function(e) { return e.subtest === 'dynamic_assessment' && e.converged; }).pop();
  if (converge && converge.summary) {
    return converge.summary;
  }
  return null;
}

function pickLiteracyProbe(events) {
  const converge = events.filter(function(e) { return e.subtest === 'literacy_probe' && e.converged; }).pop();
  if (converge && converge.summary) {
    return converge.summary;
  }
  return null;
}

function fromComprehensive(events, intake, sett) {
  events = events || [];
  intake = intake || {};
  sett = sett || null;

  // Targeted base — we've at minimum run screening + targeted,
  // and the Comprehensive layer just adds dynamic assessment +
  // literacy + SETT + AI narrative on top.
  const base = fromTargeted(events, intake);

  const da       = pickDynamicAssessment(events);
  const literacy = pickLiteracyProbe(events);

  // Confidence bumps: DA is the highest-signal new probe (it's the
  // only thing that surfaces learning potential), so weight it more.
  let confidence = base.confidence;
  if (da) { confidence += 0.12; }
  if (literacy) { confidence += 0.05; }
  if (sett && (sett.student || sett.environment || sett.task)) { confidence += 0.03; }
  if (confidence > 0.99) { confidence = 0.99; }
  confidence = Math.round(confidence * 100) / 100;

  // Push the communicator stage upward when DA shows independent
  // performance — the targeted base estimates stage from screening
  // probes only, but DA at level 1–2 is direct evidence of
  // independent symbolic communication.
  let stage = base.communicator_stage;
  if (da && da.independence_pct >= 60 && stage != null && stage < 6) {
    stage = stage + 1;
  }

  const comprehensiveReport = {
    dynamic_assessment: da,
    literacy_probe: literacy,
    sett: sett,
    targeted: base.targeted_report || null
  };

  return Object.assign({}, base, {
    communicator_stage: stage,
    confidence: confidence,
    next_action: 'build_starter_board',
    eval_mode: 'comprehensive',
    comprehensive_report: comprehensiveReport
  });
}

const eval_recommend = {
  fromQuickScreen: fromQuickScreen,
  fromTargeted: fromTargeted,
  fromComprehensive: fromComprehensive,
  profileForIntake: profileForIntake,
  GRID_BANDS: GRID_BANDS
};

window.eval_recommend = eval_recommend;
export default eval_recommend;
