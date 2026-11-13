import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import RSVP from 'rsvp';
import { settled } from '@ember/test-helpers';
import { setupTest } from 'frontend/tests/helpers';
import { standInGlobals } from 'frontend/tests/helpers/stand-in-globals';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';
import LingoLinq from 'frontend/app';
import modal from 'frontend/utils/modal';
import profiles from 'frontend/utils/profiles';
import evaluation from 'frontend/utils/eval';

/* The session user can be held by a record keyed 'self' (network load) and by one keyed by the real
 * global id ('1_3'). Ids sent in a body or compared with server ids must be backend ids. Section 24 of
 * docs/task-management/2026-11-10_offline-followup-proposals.md. */
function self_record() {
  return EmberObject.create({ id: 'self', global_id: '1_3', user_name: 'test-me' });
}
function other_record() {
  return EmberObject.create({ id: '1_9', global_id: '1_9', user_name: 'test-other' });
}

module('Unit | backend id | profile, log and user pages', function(hooks) {
  setupTest(hooks);
  standInGlobals(hooks, {
    stashes: () => EmberObject.create({
      logged: [],
      log_event(obj, user_id, session_user_id) { this.logged.push({ obj: obj, user_id: user_id, session_user_id: session_user_id }); return obj; },
      push_log() {},
      track_daily_event() {}
    }),
    persistence: () => EmberObject.create({ online: false, ajax() { return RSVP.resolve([]); } }),
    appState: () => EmberObject.create({ sessionUser: self_record(), controller: { router: { transitionTo() {} } } }),
    store: () => ({ made: [], createRecord(type, attrs) { const r = EmberObject.create(attrs || {}); r.save = () => RSVP.resolve(r); this.made.push(r); return r; } })
  });
  let saved_profiles = null;
  hooks.beforeEach(function() {
    saved_profiles = { recent: profiles.recent, nonces: profiles.nonces };
  });
  hooks.afterEach(function() {
    restoreStubs();
    profiles.recent = saved_profiles.recent;
    profiles.nonces = saved_profiles.nonces;
  });

  test('profile: a prior profile by the person themself reads as a self assessment', async function(assert) {
    stub(profiles, 'process', function() { return EmberObject.create(); });
    const answers = { mine: [{ profile: {}, author: { id: '1_3' } }], theirs: [{ profile: {}, author: { id: '1_9' } }] };
    const controller = this.owner.lookup('controller:profile');
    controller.set('user', self_record());
    controller.set('profile', { template: { id: 'p1' } });
    this.standIns.persistence.set('ajax', () => RSVP.resolve(answers.mine));
    controller.check_prior();
    await settled();
    assert.true(controller.get('prior_profile.self_assessment'), 'same person');
    this.standIns.persistence.set('ajax', () => RSVP.resolve(answers.theirs));
    controller.check_prior();
    await settled();
    assert.false(controller.get('prior_profile.self_assessment'), 'someone else assessed');
  });

  test('profile: a submitted profile event carries the backend id', async function(assert) {
    const controller = this.owner.lookup('controller:profile');
    const me = self_record();
    me.set('external_nonce', { id: 'test-nonce' });
    controller.set('user', me);
    controller.set('profile', { output_json() { return RSVP.resolve({ guid: 'test-guid' }); } });
    controller.send('submit');
    await settled();
    const logged = this.standIns.stashes.logged[0];
    assert.strictEqual(logged.user_id, '1_3');
    assert.strictEqual(logged.obj.user_id, '1_3');
    assert.strictEqual(logged.session_user_id, '1_3');
  });

  test('user/log route: in-memory eval and profile logs carry the backend author id', function(assert) {
    assert.expect(3);
    // Its own app state, so no app-wide observer runs against this module's stand-in globals.
    const Fake = this.owner.factoryFor('route:user/log').class.extend({ appState: EmberObject.create({ sessionUser: self_record() }) });
    this.owner.register('route:user/log-under-test', Fake);
    try {
      const route = this.owner.lookup('route:user/log-under-test');
      stub(route, 'modelFor', function() { return other_record(); });
      const evalLog = route.model({ log_id: 'last-eval' });
      assert.strictEqual(evalLog.get('author').id, '1_3');
      const profileLog = route.model({ log_id: 'profile-abc' });
      assert.strictEqual(profileLog.get('author').id, '1_3');
      assert.strictEqual(profileLog.get('user_id'), '1_9', 'the communicator id is unchanged');
    } finally {
      this.owner.unregister('route:user/log-under-test');
    }
  });

  test('user/edit: the valet login name and the message-link ids use the backend id', async function(assert) {
    let opened = null;
    stub(modal, 'open', function(name, opts) { opened = opts; return RSVP.resolve(); });
    stub(modal, 'error', function() {});
    const controller = this.owner.lookup('controller:user/edit');
    const me = self_record();
    me.check_integrations = function() {};
    controller.set('model', me);
    assert.strictEqual(controller.get('valet_user_name'), 'model@1.3');
    controller.send('message_link', { name: 'Test Contact', hash: 'abc' });
    await settled();
    assert.strictEqual(this.standIns.store.made[0].get('user_id'), '1_3');
    assert.strictEqual(opened.user.id, '1_3xabc');
    const other = other_record();
    other.check_integrations = function() {};
    controller.set('model', other);
    assert.strictEqual(controller.get('valet_user_name'), 'model@1.9');
    await settled();
  });

  test('user/logs: the logging code is stored under the backend id and replaces an older self entry', function(assert) {
    assert.expect(1);
    const desc = Object.getOwnPropertyDescriptor(LingoLinq, 'session');
    const session = EmberObject.create({ logging_codes: [{ user_id: 'self', code: 'old' }, { user_id: '1_9', code: 'theirs' }] });
    Object.defineProperty(LingoLinq, 'session', { value: session, configurable: true, writable: true, enumerable: true });
    try {
      const controller = this.owner.lookup('controller:user/logs');
      stub(controller, 'send', function() {});
      controller.set('model', self_record());
      controller.set('logging_code', 'new');
      controller.actions.update_logging_code.call(controller);
      assert.deepEqual(session.get('logging_codes').map((c) => [c.user_id, c.code]), [['1_9', 'theirs'], ['1_3', 'new']]);
    } finally {
      if (desc) { Object.defineProperty(LingoLinq, 'session', desc); } else { delete LingoLinq.session; }
    }
  });

  test('user/log: the eval fallback loads and adopts the snapshot under the backend id', async function(assert) {
    const asked = [];
    stub(evaluation, 'last_assessment_from_memory', function() { return {}; });
    stub(evaluation, 'load_progress', function(uid) { asked.push(uid); return RSVP.resolve({ user_id: '1_3', events: [1] }); });
    const ctx = EmberObject.create({ model: { type: 'eval', eval_in_memory: true }, user: self_record() });
    const UserLog = this.owner.factoryFor('controller:user/log').class;
    UserLog.proto().load_eval_fallback.call(ctx);
    await settled();
    assert.deepEqual(asked, ['1_3']);
    assert.strictEqual(ctx.get('eval_memory_fallback.user_id'), '1_3');
  });

  test('user/log: a snapshot for the backend id renders for the self-keyed user; a stored self does not', async function(assert) {
    stub(evaluation, 'last_assessment_from_memory', function() { return {}; });
    stub(evaluation, 'load_progress', function() { return new RSVP.Promise(function() {}); });
    const controller = this.owner.lookup('controller:user/log');
    const snap = { user_id: '1_3', events: [1] };
    controller.setProperties({ model: EmberObject.create({ type: 'eval', eval_in_memory: true }), user: self_record(), eval_memory_fallback: snap });
    assert.strictEqual(controller.get('raw_assessment'), snap);
    const stale = { user_id: 'self', events: [1] };
    controller.set('eval_memory_fallback', stale);
    assert.notStrictEqual(controller.get('raw_assessment'), stale, 'a stored self is never treated as this person');
    await settled();
  });

  test('user/log: repeating a profile goes to the person by user name, never self', async function(assert) {
    const controller = this.owner.lookup('controller:user/log');
    let args = null;
    stub(controller.router, 'transitionTo', function() { args = Array.prototype.slice.call(arguments); });
    controller.set('user', self_record());
    controller.set('processed_profile', { template: { id: 'p1' } });
    controller.send('repeat_profile');
    assert.deepEqual(args, ['profile', 'test-me', 'p1']);
    await settled();
  });
});
