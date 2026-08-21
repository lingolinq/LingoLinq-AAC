/*
 * EvalSession — finite state machine for the tiered eval flow.
 *
 * States:
 *   configuring → screening → targeting → comprehensive → reviewing
 *
 * Phase 1A scope: screening flow only. Other transitions are stubs that
 * Modes 2/3 will fill in. Designed to be resumable so a Quick Screen
 * session can be promoted to a Targeted Eval without losing data.
 */

import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import persistence from './persistence';
import stashes from './_stashes';
import eval_recommend from './eval_recommend';
import app_state from './app_state';

const STATES = ['configuring', 'screening', 'targeting', 'comprehensive', 'reviewing'];

const SUBTEST_ORDER = {
  // 'general' — the un-narrowed screen a supervisor gets when they skip the
  // demographic intake ("Run a general screen"). Runs the standard screening
  // subtests with no population tailoring; recorded as item_bank_profile
  // 'general' in the recommendation so the report is honest about the mode.
  'general':            ['stage_probe', 'access_snapshot', 'library_compare', 'vocab_probe', 'wrap'],
  'early-comm':         ['stage_probe', 'access_snapshot', 'choice_probe', 'wrap'],
  'peds-emerging':      ['stage_probe', 'access_snapshot', 'library_compare', 'vocab_probe', 'wrap'],
  'peds-established':   ['stage_probe', 'access_snapshot', 'library_compare', 'vocab_probe', 'literacy_probe', 'wrap'],
  'adult-motor':        ['access_snapshot', 'cognitive_probe', 'library_compare', 'vocab_probe', 'wrap'],
  'adult-progressive':  ['access_snapshot', 'cognitive_probe', 'vocab_probe', 'wrap']
};

// Targeted (Mode 2) layers four subtests on top of the Quick Screen
// events that are already captured:
//   adaptive_grid    — binary-search grid sweep, 4 → 9 → 16 → 24 → 36 → 60 → 84
//   library_3way     — three-way symbol library bake-off with shuffled order
//   access_co_trial  — same 6 items run via each available access method
//   syntax_probe     — receptive/expressive split on a phrase target
// The wrap subtest from screening is re-used; the targeted recommendation
// merges screening + targeted events.
const TARGETED_SUBTEST_ORDER = {
  'early-comm':         ['access_co_trial', 'adaptive_grid', 'motor_map', 'wrap'],
  'peds-emerging':      ['adaptive_grid', 'library_3way', 'access_co_trial', 'syntax_probe', 'motor_map', 'wrap'],
  'peds-established':   ['adaptive_grid', 'library_3way', 'syntax_probe', 'motor_map', 'wrap'],
  'adult-motor':        ['access_co_trial', 'adaptive_grid', 'library_3way', 'motor_map', 'wrap'],
  'adult-progressive':  ['access_co_trial', 'adaptive_grid', 'motor_map', 'wrap']
};

// Comprehensive (Mode 3) adds dynamic-assessment probes (every item
// escalates through 6 prompt levels), an optional literacy probe,
// the SETT companion form (Student / Environment / Task), and an
// AI-narrated SLP report. Each layers on top of the screening +
// targeted events without losing any prior data.
const COMPREHENSIVE_SUBTEST_ORDER = {
  'early-comm':         ['dynamic_assessment', 'sett_form', 'ai_narration', 'wrap'],
  'peds-emerging':      ['dynamic_assessment', 'literacy_probe', 'sett_form', 'ai_narration', 'wrap'],
  'peds-established':   ['dynamic_assessment', 'literacy_probe', 'sett_form', 'ai_narration', 'wrap'],
  'adult-motor':        ['dynamic_assessment', 'sett_form', 'ai_narration', 'wrap'],
  'adult-progressive':  ['dynamic_assessment', 'sett_form', 'ai_narration', 'wrap']
};

const EvalSession = EmberObject.extend({
  init() {
    this._super(...arguments);
    this.set('state', 'configuring');
    this.set('events', []);
    this.set('intake', {});
    this.set('protocolProfile', null);
    this.set('subtestIndex', 0);
    this.set('startedAt', null);
    this.set('endedAt', null);
    this.set('recommendation', null);
    this.set('mode', 'quick_screen');
    // SETT companion (Mode 3 only): { student, environment, task }
    // free-text fields. Saved alongside the events in the LogSession.
    this.set('sett', { student: '', environment: '', task: '' });
  },

  // --- transitions -------------------------------------------------------

  beginScreening(intake) {
    intake = intake || {};
    this.set('intake', intake);
    // A generalized skip (supervisor chose "Run a general screen") runs the
    // standard, un-narrowed protocol — record it honestly as 'general' rather
    // than routing through profileForIntake to a mislabeled population profile.
    this.set('protocolProfile', intake.generalized ? 'general' : eval_recommend.profileForIntake(intake));
    this.set('subtestIndex', 0);
    this.set('startedAt', Date.now());
    this.set('state', 'screening');
    return this;
  },

  recordEvent(event) {
    if (!event || !event.subtest) { return; }
    const events = this.get('events').slice();
    events.push(Object.assign({ ts: Date.now() }, event));
    this.set('events', events);
  },

  advanceSubtest() {
    const order = this.subtestOrder();
    const next = this.get('subtestIndex') + 1;
    if (next >= order.length) {
      return this.review();
    }
    this.set('subtestIndex', next);
    return this.currentSubtest();
  },

  review() {
    this.set('endedAt', Date.now());
    this.set('state', 'reviewing');
    // Route to the right recommendation engine based on the current
    // mode. Each engine accepts the full events array and just reads
    // its own subtest events on top of prior data:
    //   quick_screen → fromQuickScreen (stage/access/library/vocab)
    //   targeted     → fromTargeted (+ adaptive_grid, library_3way,
    //                  access_co_trial, syntax_probe)
    //   comprehensive→ fromComprehensive (+ dynamic_assessment,
    //                  literacy_probe, SETT form, AI narration)
    const mode = this.get('mode');
    let rec;
    if (mode === 'comprehensive' && eval_recommend.fromComprehensive) {
      rec = eval_recommend.fromComprehensive(this.get('events'), this.get('intake'), this.get('sett'));
    } else if (mode === 'targeted') {
      rec = eval_recommend.fromTargeted(this.get('events'), this.get('intake'));
    } else {
      rec = eval_recommend.fromQuickScreen(this.get('events'), this.get('intake'));
    }
    this.set('recommendation', rec);
    return rec;
  },

  promoteToTargeted() {
    // Preserve all screening events + intake + recommendation; just
    // flip the mode and reset the subtest cursor so the targeted
    // subtests run on top of the already-captured screening data.
    this.set('mode', 'targeted');
    this.set('state', 'targeting');
    this.set('subtestIndex', 0);
    this.set('endedAt', null);
    return this;
  },

  promoteToComprehensive() {
    // Same shape as promoteToTargeted: preserve everything captured
    // so far (screening + targeted events + recommendation) and flip
    // the mode to comprehensive. Dynamic-assessment probes, the SETT
    // form, and AI narration all run on top of prior data.
    this.set('mode', 'comprehensive');
    this.set('state', 'comprehensive');
    this.set('subtestIndex', 0);
    this.set('endedAt', null);
    return this;
  },

  // --- queries -----------------------------------------------------------

  // Symbol-library subtests. On a deployment that ships a single library there
  // is nothing to compare and no preference the recommendation could honour, so
  // asking the communicator to pick between three renderings only costs them
  // session time. Filtered out behind `eval_single_library`.
  // Filtering HERE rather than editing the SUBTEST_ORDER tables keeps one
  // definition of each flow and means every consumer (currentSubtest,
  // progressFraction, the runners) sees the same filtered list automatically.
  _withoutLibrarySubtests(order) {
    if (!app_state || typeof app_state.get !== 'function') { return order; }
    if (!app_state.get('feature_flags.eval_single_library')) { return order; }
    return order.filter(function(s) { return s !== 'library_compare' && s !== 'library_3way'; });
  },

  subtestOrder() {
    var order;
    if (this.get('state') === 'comprehensive') {
      order = COMPREHENSIVE_SUBTEST_ORDER[this.get('protocolProfile')] || COMPREHENSIVE_SUBTEST_ORDER['peds-emerging'];
    } else if (this.get('state') === 'targeting') {
      order = TARGETED_SUBTEST_ORDER[this.get('protocolProfile')] || TARGETED_SUBTEST_ORDER['peds-emerging'];
    } else {
      order = SUBTEST_ORDER[this.get('protocolProfile')] || SUBTEST_ORDER['peds-emerging'];
    }
    return this._withoutLibrarySubtests(order);
  },

  currentSubtest() {
    return this.subtestOrder()[this.get('subtestIndex')];
  },

  progressFraction() {
    const order = this.subtestOrder();
    if (!order.length) { return 0; }
    return this.get('subtestIndex') / order.length;
  },

  durationSeconds() {
    if (!this.get('startedAt')) { return 0; }
    const end = this.get('endedAt') || Date.now();
    return Math.round((end - this.get('startedAt')) / 1000);
  },

  // --- persistence -------------------------------------------------------

  toLogPayload() {
    return {
      log_type: 'eval',
      data: {
        eval_mode: this.get('mode'),
        protocol_version: '1.0',
        intake: this.get('intake'),
        item_bank_profile: this.get('protocolProfile'),
        events: this.get('events'),
        recommendation: this.get('recommendation'),
        duration_s: this.durationSeconds(),
        slp_notes: this.get('slpNotes') || '',
        sett: this.get('sett') || null,
        ai_narrative: this.get('aiNarrative') || null,
        // EU AI Act Article 50(2): the raw signed marker the /narrate endpoint returned
        // for the AI-drafted narrative (null for the deterministic template, or when AI
        // narration was never run). Carried through opaquely -- the server re-verifies it
        // on save (LogSession#process_params via Art50Marker.normalized) and again on every
        // read (json_api/log.rb via Art50Marker.public_view), so this client value is never
        // trusted as-is.
        ai_generated: this.get('aiGenerated') || null
      }
    };
  },

  persist(userId) {
    const payload = this.toLogPayload();
    payload.user_id = userId;
    if (persistence.get('online')) {
      return persistence.ajax('/api/v1/logs', { type: 'POST', data: { log: payload } });
    } else {
      stashes.log_event(payload, userId);
      stashes.push_log(true);
      return RSVP.resolve(payload);
    }
  }
});

EvalSession.reopenClass({
  STATES: STATES,
  SUBTEST_ORDER: SUBTEST_ORDER,
  TARGETED_SUBTEST_ORDER: TARGETED_SUBTEST_ORDER,
  COMPREHENSIVE_SUBTEST_ORDER: COMPREHENSIVE_SUBTEST_ORDER
});

export default EvalSession;
