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

const STATES = ['configuring', 'screening', 'targeting', 'comprehensive', 'reviewing'];

const SUBTEST_ORDER = {
  'early-comm':         ['stage_probe', 'access_snapshot', 'choice_probe', 'wrap'],
  'peds-emerging':      ['stage_probe', 'access_snapshot', 'library_compare', 'vocab_probe', 'wrap'],
  'peds-established':   ['stage_probe', 'access_snapshot', 'library_compare', 'vocab_probe', 'literacy_probe', 'wrap'],
  'adult-motor':        ['access_snapshot', 'cognitive_probe', 'library_compare', 'vocab_probe', 'wrap'],
  'adult-progressive':  ['access_snapshot', 'cognitive_probe', 'vocab_probe', 'wrap']
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
  },

  // --- transitions -------------------------------------------------------

  beginScreening(intake) {
    this.set('intake', intake || {});
    this.set('protocolProfile', eval_recommend.profileForIntake(intake));
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
    const rec = eval_recommend.fromQuickScreen(this.get('events'), this.get('intake'));
    this.set('recommendation', rec);
    return rec;
  },

  promoteToTargeted() {
    this.set('state', 'targeting');
    this.set('subtestIndex', 0);
    return this;
  },

  // --- queries -----------------------------------------------------------

  subtestOrder() {
    return SUBTEST_ORDER[this.get('protocolProfile')] || SUBTEST_ORDER['peds-emerging'];
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
        slp_notes: this.get('slpNotes') || ''
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
  SUBTEST_ORDER: SUBTEST_ORDER
});

export default EvalSession;
