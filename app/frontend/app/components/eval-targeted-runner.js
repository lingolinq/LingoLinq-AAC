import Component from '@ember/component';
import { computed, observer } from '@ember/object';
import i18n from '../utils/i18n';
import grid_sweep from '../utils/eval_grid_sweep';

// library_3way trial bank — 4 words, each shown across all three
// libraries side-by-side. The SLP taps which library the
// communicator preferred. 4 trials × 3 libraries = 12 data points,
// enough to detect a winner without dragging the subtest beyond
// ~90s.
const LIBRARY_3WAY_TRIALS = [
  { word: 'eat',  prompt_key: 'lib3_eat'  },
  { word: 'play', prompt_key: 'lib3_play' },
  { word: 'help', prompt_key: 'lib3_help' },
  { word: 'want', prompt_key: 'lib3_want' }
];
const LIBRARY_3WAY_OPTIONS = [
  { id: 'symbolstix', label: 'SymbolStix' },
  { id: 'pcs',        label: 'PCS / Boardmaker' },
  { id: 'arasaac',    label: 'ARASAAC' }
];

// access_co_trial — 6 trials cycling through access methods so the
// recommendation engine can pick the fastest+most-accurate channel
// the same way pickAccess does for screening.
const ACCESS_COTRIAL_TRIALS = [
  { id: 'aco_01', target: 'eat' },
  { id: 'aco_02', target: 'play' },
  { id: 'aco_03', target: 'more' },
  { id: 'aco_04', target: 'help' },
  { id: 'aco_05', target: 'go' },
  { id: 'aco_06', target: 'stop' }
];
const ACCESS_METHOD_OPTIONS = [
  { id: 'touch', label: 'Touch' },
  { id: 'scan',  label: 'Switch / Scan' },
  { id: 'gaze',  label: 'Eye Gaze' }
];

// motor_map — spatial accuracy probe. Render a fixed N×M grid, light
// up one target cell per trial, capture which cell the student
// actually tapped. Produces real spatial hit data (cpctx/cpcty target
// + pctx/pcty press) for the `stats/eval-hits` heatmap component —
// the only new-flow subtest that yields a motor-map visualization.
//
// 8 trials × ~4s each = ~32s. Cells are scattered across corners +
// center + interior so the heatmap reveals quadrant-specific accuracy
// patterns (e.g. consistently missed top-right targets → adjust grid
// or access method).
const MOTOR_MAP_GRID = { rows: 5, cols: 7 };
const MOTOR_MAP_TRIALS = [
  { id: 'mm_01', row: 0, col: 0 },
  { id: 'mm_02', row: 0, col: 6 },
  { id: 'mm_03', row: 4, col: 0 },
  { id: 'mm_04', row: 4, col: 6 },
  { id: 'mm_05', row: 2, col: 3 },
  { id: 'mm_06', row: 1, col: 2 },
  { id: 'mm_07', row: 3, col: 4 },
  { id: 'mm_08', row: 2, col: 6 }
];

// syntax_probe — receptive then expressive trial pair per phrase.
// 3 trials × 2 modalities = 6 data points; the recommendation
// engine breaks out receptive vs expressive accuracy separately so
// the report card can name the imbalance (a key feature-match
// outcome that legacy eval.js does not surface).
const SYNTAX_PROBE_TRIALS = [
  { id: 'syn_01', phrase: 'I want more',     receptive_prompt: 'Show me the picture for "I want more".',     expressive_prompt: 'Ask for more using two buttons.' },
  { id: 'syn_02', phrase: 'Big dog runs',    receptive_prompt: 'Show me the picture for "the big dog runs".', expressive_prompt: 'Tell me what the big dog is doing.' },
  { id: 'syn_03', phrase: 'Go play outside', receptive_prompt: 'Show me where the child is playing.',         expressive_prompt: 'Tell me where you want to play.' }
];

/*
 * eval-targeted-runner — Phase 2 scaffold. Targeted Eval (10 min)
 * layers four subtests onto the screening events that are already
 * captured on the session:
 *   adaptive_grid   — binary-search grid sweep via eval_grid_sweep
 *   library_3way    — three-way library bake-off (Phase 2.B)
 *   access_co_trial — multi-method timing trial (Phase 2.C)
 *   syntax_probe    — receptive/expressive split (Phase 2.D)
 *
 * This first cut implements the adaptive_grid subtest end-to-end
 * (the most differentiated piece vs the legacy linear stepping) and
 * shows a placeholder card for the remaining subtests so the SLP
 * can see what's next and continue the session. Subsequent
 * iterations wire each placeholder into a full subtest.
 */
export default Component.extend({
  classNames: ['evq-targeted'],
  tagName: 'section',
  session: null,
  user: null,

  // Per-attempt state for the adaptive_grid subtest. Reset whenever
  // the subtest becomes active.
  sweepState: null,
  sweepAttemptStartedAt: null,

  // Per-trial state for the library_3way subtest.
  libraryTrialIndex: 0,
  libraryTrialStartedAt: null,
  libraryPicks: null, // map of libraryId → pick count

  // Per-trial state for the access_co_trial subtest. Two-step UI:
  // SLP picks the method used for the trial, then marks hit/miss.
  accessTrialIndex: 0,
  accessTrialStartedAt: null,
  accessTrialMethod: null, // active method (touch / scan / gaze) once chosen
  accessTallies: null,     // { touch: { hits, misses }, scan: {...}, gaze: {...} }

  // Per-trial state for the syntax_probe subtest. Each trial walks
  // through a receptive phase then an expressive phase; both phases
  // can be marked correct/incorrect or skipped (recorded as null).
  syntaxTrialIndex: 0,
  syntaxPhase: 'receptive', // 'receptive' | 'expressive'
  syntaxTrialStartedAt: null,
  syntaxScores: null, // [{ receptive: bool|null, expressive: bool|null }, …]

  // Per-trial state for the motor_map subtest. Each trial highlights
  // one cell on a fixed grid; SLP taps where the student actually
  // pressed; we record cpctx/cpcty (target center) + pctx/pcty (press
  // center) so `stats/eval-hits` can render the spatial hit pattern.
  motorTrialIndex: 0,
  motorTrialStartedAt: null,
  motorHits: null, // accumulated hit_locations across the subtest

  currentLibraryTrial: computed('libraryTrialIndex', function() {
    return LIBRARY_3WAY_TRIALS[this.get('libraryTrialIndex')] || null;
  }),
  libraryOptions: computed(function() {
    return LIBRARY_3WAY_OPTIONS;
  }),
  libraryTrialNumber: computed('libraryTrialIndex', function() {
    return this.get('libraryTrialIndex') + 1;
  }),
  libraryTrialTotal: computed(function() {
    return LIBRARY_3WAY_TRIALS.length;
  }),

  currentAccessTrial: computed('accessTrialIndex', function() {
    return ACCESS_COTRIAL_TRIALS[this.get('accessTrialIndex')] || null;
  }),
  accessMethodOptions: computed(function() {
    return ACCESS_METHOD_OPTIONS;
  }),
  accessTrialNumber: computed('accessTrialIndex', function() {
    return this.get('accessTrialIndex') + 1;
  }),
  accessTrialTotal: computed(function() {
    return ACCESS_COTRIAL_TRIALS.length;
  }),
  accessAwaitingOutcome: computed('accessTrialMethod', function() {
    return !!this.get('accessTrialMethod');
  }),
  activeAccessLabel: computed('accessTrialMethod', function() {
    const m = this.get('accessTrialMethod');
    const opt = ACCESS_METHOD_OPTIONS.find(function(o) { return o.id === m; });
    return opt ? opt.label : '';
  }),
  // Touch trials get a fast-path UI: the target word itself is the
  // button. Communicator taps it -> auto-record Hit + advance. Scan
  // and gaze trials keep the manual Hit/Miss buttons (SLP-judged).
  isTouchTrial: computed('accessTrialMethod', function() {
    return this.get('accessTrialMethod') === 'touch';
  }),

  currentSyntaxTrial: computed('syntaxTrialIndex', function() {
    return SYNTAX_PROBE_TRIALS[this.get('syntaxTrialIndex')] || null;
  }),
  syntaxTrialNumber: computed('syntaxTrialIndex', function() {
    return this.get('syntaxTrialIndex') + 1;
  }),
  syntaxTrialTotal: computed(function() {
    return SYNTAX_PROBE_TRIALS.length;
  }),
  isSyntaxReceptive: computed('syntaxPhase', function() {
    return this.get('syntaxPhase') === 'receptive';
  }),
  syntaxPrompt: computed('currentSyntaxTrial', 'syntaxPhase', function() {
    const trial = this.get('currentSyntaxTrial');
    if (!trial) { return ''; }
    return this.get('syntaxPhase') === 'expressive' ? trial.expressive_prompt : trial.receptive_prompt;
  }),
  syntaxPhaseLabel: computed('syntaxPhase', function() {
    return this.get('syntaxPhase') === 'expressive'
      ? i18n.t('syntax_phase_expressive', "Expressive")
      : i18n.t('syntax_phase_receptive',  "Receptive");
  }),

  currentSubtest: computed('session.subtestIndex', 'session.state', function() {
    const session = this.get('session');
    return session ? session.currentSubtest() : null;
  }),

  isAdaptiveGrid: computed('currentSubtest', function() {
    return this.get('currentSubtest') === 'adaptive_grid';
  }),
  isLibrary3Way: computed('currentSubtest', function() {
    return this.get('currentSubtest') === 'library_3way';
  }),
  isAccessCoTrial: computed('currentSubtest', function() {
    return this.get('currentSubtest') === 'access_co_trial';
  }),
  isSyntaxProbe: computed('currentSubtest', function() {
    return this.get('currentSubtest') === 'syntax_probe';
  }),
  isMotorMap: computed('currentSubtest', function() {
    return this.get('currentSubtest') === 'motor_map';
  }),
  isWrap: computed('currentSubtest', function() {
    return this.get('currentSubtest') === 'wrap';
  }),

  currentMotorTrial: computed('motorTrialIndex', function() {
    return MOTOR_MAP_TRIALS[this.get('motorTrialIndex')] || null;
  }),
  motorTrialNumber: computed('motorTrialIndex', function() {
    return this.get('motorTrialIndex') + 1;
  }),
  motorTrialTotal: computed(function() {
    return MOTOR_MAP_TRIALS.length;
  }),
  motorGridRows: computed(function() { return MOTOR_MAP_GRID.rows; }),
  motorGridCols: computed(function() { return MOTOR_MAP_GRID.cols; }),
  motorGridCells: computed('currentMotorTrial', function() {
    const trial = this.get('currentMotorTrial');
    const cells = [];
    for (let r = 0; r < MOTOR_MAP_GRID.rows; r++) {
      for (let c = 0; c < MOTOR_MAP_GRID.cols; c++) {
        cells.push({
          row: r,
          col: c,
          isTarget: trial && trial.row === r && trial.col === c
        });
      }
    }
    return cells;
  }),

  // Convergence-aware live state for the adaptive_grid view.
  currentGrid: computed('sweepState', function() {
    const state = this.get('sweepState');
    if (!state) { return grid_sweep.GRID_LADDER[2]; }
    return grid_sweep.GRID_LADDER[state.index];
  }),

  sweepHistory: computed('sweepState.history.[]', function() {
    return (this.get('sweepState.history') || []).map(function(h) {
      return {
        grid: h.grid,
        correct: h.correct,
        latency_ms: h.latency_ms
      };
    });
  }),

  didInsertElement() {
    this._super(...arguments);
    this._initActiveSubtest();
  },

  // Re-run init whenever the active subtest changes — handles the
  // case where the runner stays mounted but the session advances
  // through targeted subtests in sequence.
  subtestObserver: observer('currentSubtest', function() {
    this._initActiveSubtest();
  }),

  _initActiveSubtest() {
    if (this.get('isAdaptiveGrid')) {
      this._resetSweep();
    } else if (this.get('isLibrary3Way')) {
      this._resetLibrary();
    } else if (this.get('isAccessCoTrial')) {
      this._resetAccess();
    } else if (this.get('isSyntaxProbe')) {
      this._resetSyntax();
    } else if (this.get('isMotorMap')) {
      this._resetMotor();
    }
  },

  _resetMotor() {
    this.set('motorTrialIndex', 0);
    this.set('motorTrialStartedAt', Date.now());
    this.set('motorHits', []);
  },

  // Record one motor_map trial: SLP clicked the cell at (r, c) on the
  // fixed N×M grid; the target is at trial.row / trial.col. Emit a
  // session event whose shape matches the legacy eval.js hit-location
  // payload so `stats/eval-hits` can render the heatmap unchanged.
  _recordMotorTap(r, c) {
    const trial = this.get('currentMotorTrial');
    if (!trial) { return; }
    const rows = MOTOR_MAP_GRID.rows;
    const cols = MOTOR_MAP_GRID.cols;
    const cpctx = (trial.col / cols) + (1 / cols * 0.5);
    const cpcty = (trial.row / rows) + (1 / rows * 0.5);
    const pctx  = (c / cols) + (1 / cols * 0.5);
    const pcty  = (r / rows) + (1 / rows * 0.5);
    const correct = (r === trial.row && c === trial.col);
    const latency_ms = this.get('motorTrialStartedAt')
      ? Date.now() - this.get('motorTrialStartedAt')
      : null;

    const hit = {
      possibly_correct: true,
      correct: correct,
      partial: false,
      cpctx: cpctx, cpcty: cpcty,
      pctx: pctx,  pcty: pcty
    };
    const hits = (this.get('motorHits') || []).slice();
    hits.push(hit);
    this.set('motorHits', hits);

    const onEvent = this.get('onEvent');
    if (onEvent) {
      onEvent({
        subtest: 'motor_map',
        trial: trial.id,
        rows: rows,
        cols: cols,
        crow: trial.row, ccol: trial.col,
        prow: r,         pcol: c,
        cpctx: cpctx, cpcty: cpcty,
        pctx: pctx,   pcty: pcty,
        correct: correct,
        latency_ms: latency_ms
      });
    }

    const nextIndex = this.get('motorTrialIndex') + 1;
    if (nextIndex >= MOTOR_MAP_TRIALS.length) {
      const totalCorrect = hits.filter(function(h) { return h.correct; }).length;
      const accuracy = hits.length ? totalCorrect / hits.length : 0;
      if (onEvent) {
        onEvent({
          subtest: 'motor_map',
          converged: true,
          rows: rows,
          cols: cols,
          total_trials: hits.length,
          total_correct: totalCorrect,
          accuracy: accuracy,
          hit_locations: hits
        });
      }
      const onAdvance = this.get('onAdvance');
      if (onAdvance) { onAdvance(); }
      return;
    }

    this.set('motorTrialIndex', nextIndex);
    this.set('motorTrialStartedAt', Date.now());
  },

  _resetSyntax() {
    this.set('syntaxTrialIndex', 0);
    this.set('syntaxPhase', 'receptive');
    this.set('syntaxTrialStartedAt', Date.now());
    const scores = SYNTAX_PROBE_TRIALS.map(function() {
      return { receptive: null, expressive: null };
    });
    this.set('syntaxScores', scores);
  },

  _recordSyntaxOutcome(correct) {
    const trial = this.get('currentSyntaxTrial');
    if (!trial) { return; }
    const phase = this.get('syntaxPhase');
    const latency_ms = this.get('syntaxTrialStartedAt')
      ? Date.now() - this.get('syntaxTrialStartedAt')
      : null;

    // Persist locally for the summary at the end.
    const scores = (this.get('syntaxScores') || []).slice();
    const idx = this.get('syntaxTrialIndex');
    const slot = Object.assign({}, scores[idx] || {});
    slot[phase] = !!correct;
    scores[idx] = slot;
    this.set('syntaxScores', scores);

    const onEvent = this.get('onEvent');
    if (onEvent) {
      onEvent({
        subtest: 'syntax_probe',
        trial: trial.id,
        phrase: trial.phrase,
        modality: phase,
        correct: !!correct,
        latency_ms: latency_ms
      });
    }

    if (phase === 'receptive') {
      // Move to expressive phase of the same trial.
      this.set('syntaxPhase', 'expressive');
      this.set('syntaxTrialStartedAt', Date.now());
      return;
    }

    // expressive done — advance trial or finish.
    const nextIndex = this.get('syntaxTrialIndex') + 1;
    if (nextIndex >= SYNTAX_PROBE_TRIALS.length) {
      // Summarize accuracy per modality and emit converge.
      const receptiveScores = scores.map(function(s) { return s.receptive; }).filter(function(v) { return v != null; });
      const expressiveScores = scores.map(function(s) { return s.expressive; }).filter(function(v) { return v != null; });
      const accuracy = function(arr) {
        if (!arr.length) { return null; }
        const hits = arr.filter(function(v) { return v === true; }).length;
        return Math.round((hits / arr.length) * 100) / 100;
      };
      const summary = {
        receptive_accuracy: accuracy(receptiveScores),
        expressive_accuracy: accuracy(expressiveScores),
        trial_count: SYNTAX_PROBE_TRIALS.length
      };
      if (onEvent) {
        onEvent({
          subtest: 'syntax_probe',
          converged: true,
          summary: summary,
          scores: scores
        });
      }
      const onAdvance = this.get('onAdvance');
      if (onAdvance) { onAdvance(); }
      return;
    }

    this.set('syntaxTrialIndex', nextIndex);
    this.set('syntaxPhase', 'receptive');
    this.set('syntaxTrialStartedAt', Date.now());
  },

  _resetAccess() {
    this.set('accessTrialIndex', 0);
    this.set('accessTrialStartedAt', Date.now());
    this.set('accessTrialMethod', null);
    const tallies = {};
    ACCESS_METHOD_OPTIONS.forEach(function(opt) {
      tallies[opt.id] = { hits: 0, misses: 0 };
    });
    this.set('accessTallies', tallies);
  },

  _pickAccessMethod(methodId) {
    // First click of the two-step trial — captures the method and
    // resets the latency timer so hit/miss timing reflects the
    // communicator's response from method selection forward.
    this.set('accessTrialMethod', methodId);
    this.set('accessTrialStartedAt', Date.now());
  },

  _recordAccessOutcome(hit) {
    const trial = this.get('currentAccessTrial');
    const method = this.get('accessTrialMethod');
    if (!trial || !method) { return; }
    const latency_ms = this.get('accessTrialStartedAt')
      ? Date.now() - this.get('accessTrialStartedAt')
      : null;
    const tallies = Object.assign({}, this.get('accessTallies') || {});
    const bucket = Object.assign({ hits: 0, misses: 0 }, tallies[method] || {});
    if (hit) { bucket.hits += 1; } else { bucket.misses += 1; }
    tallies[method] = bucket;
    this.set('accessTallies', tallies);

    const onEvent = this.get('onEvent');
    if (onEvent) {
      onEvent({
        subtest: 'access_co_trial',
        trial: trial.id,
        target: trial.target,
        access_method: method,
        correct: !!hit,
        latency_ms: latency_ms
      });
    }

    const nextIndex = this.get('accessTrialIndex') + 1;
    if (nextIndex >= ACCESS_COTRIAL_TRIALS.length) {
      // Compute winner method by accuracy, tie-break by total trials.
      const summary = Object.keys(tallies).map(function(key) {
        const t = tallies[key];
        const attempts = t.hits + t.misses;
        return { method: key, attempts: attempts, accuracy: attempts ? t.hits / attempts : 0 };
      });
      summary.sort(function(a, b) {
        if (b.accuracy !== a.accuracy) { return b.accuracy - a.accuracy; }
        return b.attempts - a.attempts;
      });
      const winner = summary[0] && summary[0].attempts > 0 ? summary[0].method : null;
      if (onEvent) {
        onEvent({
          subtest: 'access_co_trial',
          converged: true,
          winner: winner,
          tallies: tallies,
          summary: summary
        });
      }
      const onAdvance = this.get('onAdvance');
      if (onAdvance) { onAdvance(); }
      return;
    }

    this.set('accessTrialIndex', nextIndex);
    this.set('accessTrialMethod', null);
    this.set('accessTrialStartedAt', Date.now());
  },

  _resetSweep() {
    this.set('sweepState', grid_sweep.initialSweepState(2));
    this.set('sweepAttemptStartedAt', Date.now());
  },

  _resetLibrary() {
    this.set('libraryTrialIndex', 0);
    this.set('libraryTrialStartedAt', Date.now());
    const picks = {};
    LIBRARY_3WAY_OPTIONS.forEach(function(opt) { picks[opt.id] = 0; });
    this.set('libraryPicks', picks);
  },

  _recordLibraryPick(libraryId) {
    const trial = this.get('currentLibraryTrial');
    if (!trial) { return; }
    const latency_ms = this.get('libraryTrialStartedAt')
      ? Date.now() - this.get('libraryTrialStartedAt')
      : null;
    // Tally picks for the local winner calculation + stream each
    // trial as a session event so the recommendation engine can
    // pick the winner from the data the same way.
    const picks = Object.assign({}, this.get('libraryPicks') || {});
    picks[libraryId] = (picks[libraryId] || 0) + 1;
    this.set('libraryPicks', picks);

    const onEvent = this.get('onEvent');
    if (onEvent) {
      onEvent({
        subtest: 'library_3way',
        word: trial.word,
        library: libraryId,
        correct: true, // pick-style trials are always "correct" — the data point is which option won
        latency_ms: latency_ms
      });
    }

    const nextIndex = this.get('libraryTrialIndex') + 1;
    if (nextIndex >= LIBRARY_3WAY_TRIALS.length) {
      // Trials exhausted — emit a final converge event and advance.
      const finalPicks = this.get('libraryPicks');
      const winner = Object.keys(finalPicks).reduce(function(best, key) {
        if (best === null || finalPicks[key] > finalPicks[best]) { return key; }
        return best;
      }, null);
      if (onEvent) {
        onEvent({
          subtest: 'library_3way',
          converged: true,
          winner: winner,
          picks: finalPicks
        });
      }
      const onAdvance = this.get('onAdvance');
      if (onAdvance) { onAdvance(); }
      return;
    }
    this.set('libraryTrialIndex', nextIndex);
    this.set('libraryTrialStartedAt', Date.now());
  },

  _recordSweepAttempt(correct) {
    const state = this.get('sweepState');
    if (!state) { return; }
    const latency_ms = this.get('sweepAttemptStartedAt')
      ? Date.now() - this.get('sweepAttemptStartedAt')
      : null;
    const next = grid_sweep.advanceSweep(state, { correct: correct, latency_ms: latency_ms });
    this.set('sweepState', next);
    this.set('sweepAttemptStartedAt', Date.now());

    // Stream every attempt as an event so the report has full data.
    const onEvent = this.get('onEvent');
    if (onEvent) {
      onEvent({
        subtest: 'adaptive_grid',
        grid: grid_sweep.GRID_LADDER[state.index].id,
        correct: correct,
        latency_ms: latency_ms
      });
    }

    if (next.converged) {
      const onEventConverge = this.get('onEvent');
      if (onEventConverge) {
        onEventConverge({
          subtest: 'adaptive_grid',
          converged: true,
          recommendation: grid_sweep.recommendationFromSweep(next)
        });
      }
      const onAdvance = this.get('onAdvance');
      if (onAdvance) { onAdvance(); }
    }
  },
  init() {
    this._super(...arguments);
    var self = this;
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };
  },


  actions: {
    sweepCorrect() {
      this._recordSweepAttempt(true);
    },
    sweepIncorrect() {
      this._recordSweepAttempt(false);
    },
    pickLibrary(libraryId) {
      this._recordLibraryPick(libraryId);
    },
    pickAccessMethod(methodId) {
      this._pickAccessMethod(methodId);
    },
    accessHit() {
      this._recordAccessOutcome(true);
    },
    accessMiss() {
      this._recordAccessOutcome(false);
    },
    syntaxCorrect() {
      this._recordSyntaxOutcome(true);
    },
    syntaxIncorrect() {
      this._recordSyntaxOutcome(false);
    },
    motorTap(row, col) {
      this._recordMotorTap(parseInt(row, 10), parseInt(col, 10));
    },
    skipSubtest() {
      const onAdvance = this.get('onAdvance');
      if (onAdvance) { onAdvance(); }
    },
    finishTargeted() {
      const onFinish = this.get('onFinish');
      if (onFinish) { onFinish(); }
    }
  },

  // Friendly title for the current subtest. Used in the section
  // header so the SLP knows where they are in the targeted flow.
  subtestTitle: computed('currentSubtest', function() {
    switch (this.get('currentSubtest')) {
      case 'adaptive_grid':   return i18n.t('targeted_adaptive_grid_title', "Adaptive Grid Sweep");
      case 'library_3way':    return i18n.t('targeted_library_3way_title', "3-Way Library Bake-Off");
      case 'access_co_trial': return i18n.t('targeted_access_co_trial_title', "Access Method Co-Trial");
      case 'syntax_probe':    return i18n.t('targeted_syntax_probe_title', "Syntax Probe");
      case 'motor_map':       return i18n.t('targeted_motor_map_title', "Motor Map");
      case 'wrap':            return i18n.t('targeted_wrap_title', "Wrap-Up");
      default:                return i18n.t('targeted_default_title', "Targeted Subtest");
    }
  })
});
