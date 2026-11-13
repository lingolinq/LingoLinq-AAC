import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import { setupTest } from 'frontend/tests/helpers';
import { settled } from '@ember/test-helpers';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';
import evaluation from 'frontend/utils/eval';
import modal from 'frontend/utils/modal';

/* THE SESSION USER HELD AS 'self' (section 24 of docs/task-management/2026-11-10_offline-followup-proposals.md).
 * After a board copy or a token check the session user is the record keyed 'self' (serializers/application.js), real
 * id in _actual_id. Comparisons by `id` read the person themself as someone else, and ids sent to the server as 'self'
 * inside a body are dropped. Stubs use the network-load shape; a different person is the guard. */
module('Unit | Service | app state and models with the session user keyed self', function(hooks) {
  setupTest(hooks);
  // App-state observers these tests trigger show flash messages, which need a route this unit test does not set up.
  hooks.beforeEach(function() { stub(modal, 'flash', function() { }); });
  hooks.afterEach(function() { restoreStubs(); });

  // last_speak_mode first: entering speak mode on the real app state otherwise runs the once-per-session block
  // (toasts, speech), which needs app pieces a unit test does not set up.
  function with_users(owner, props, fn) {
    var app = owner.lookup('service:app-state');
    var keys = Object.keys(props);
    var prior = {};
    keys.forEach(function(k) { prior[k] = app.get(k); });
    keys.forEach(function(k) { app.set(k, props[k]); });
    try { return fn(app); } finally { keys.slice().reverse().forEach(function(k) { app.set(k, prior[k]); }); }
  }
  var me_self = function() { return EmberObject.create(Object.assign({ id: 'self', global_id: '1_3', user_name: 'example' }, { reload: function() { return RSVP.resolve(this); } })); };
  var me_real = function() { return EmberObject.create(Object.assign({ id: '1_3', global_id: '1_3', user_name: 'example' }, { reload: function() { return RSVP.resolve(this); } })); };
  var other = function() { return EmberObject.create(Object.assign({ id: '1_9', global_id: '1_9', user_name: 'sam' }, { reload: function() { return RSVP.resolve(this); } })); };

  test('Speak as with your own real id or user name is you, not a second copy of you', function(assert) {
    assert.expect(2);
    var found = [];
    stub(window.LingoLinq.store, 'findRecord', function(type, id) { found.push(id); return RSVP.resolve(other()); });
    with_users(this.owner, { sessionUser: me_self(), speakModeUser: null }, function(app) {
      stub(app, 'toggle_speak_mode', function() { });
      stub(app, 'home_in_speak_mode', function() { });
      app.set_speak_mode_user('1_3', true);
      app.set_speak_mode_user('example', true);
      assert.deepEqual(found, [], 'no other user was loaded');
      assert.strictEqual(app.get('speakModeUser'), null);
    });
  });

  test('Speak as a communicator still loads the communicator', function(assert) {
    assert.expect(1);
    var found = [];
    stub(window.LingoLinq.store, 'findRecord', function(type, id) { found.push(id); return RSVP.defer().promise; });
    with_users(this.owner, { sessionUser: me_self() }, function(app) {
      stub(app, 'toggle_speak_mode', function() { });
      stub(app, 'home_in_speak_mode', function() { });
      app.set_speak_mode_user('1_9', true);
      assert.deepEqual(found, ['1_9']);
    });
  });

  test('you referenced in speak mode are not "modeling for" someone else', function(assert) {
    assert.expect(1);
    with_users(this.owner, { last_speak_mode: true, sessionUser: me_self(), currentUser: me_self(), referenced_speak_mode_user: me_real(), speak_mode: true, modeling_for_self: false }, function(app) {
      assert.false(!!app.get('modeling_for_user'));
    });
  });

  test('a word activity is logged and cached under your real id', async function(assert) {
    assert.expect(2);
    var store = this.owner.lookup('service:store');
    var me = store.push({ data: { type: 'user', id: 'self', attributes: { _actual_id: '1_3', user_name: 'example' } } });
    var logged = [];
    var stored = [];
    stub(me.stashes, 'log_event', function(opts, user_id) { logged.push(user_id); });
    stub(me.stashes, 'push_log', function() { });
    stub(me.persistence, 'find', function() { return RSVP.reject(); });
    stub(me.persistence, 'store', function(type, data, key) { stored.push(key); return RSVP.resolve(); });
    try {
      me.log_word_activity({ word: 'go' });
      await settled();
      assert.deepEqual(logged, ['1_3'], 'the event carries the real id');
      assert.deepEqual(stored, ['word_log/1_3'], "the device cache is this person's, not every account's 'self'");
    } finally {
      me.unloadRecord();
    }
  });

  // The usage log: every logged speak-mode event takes its user from this stash (services/stashes.js log). Under
  // 'self' the server dropped the events ("no valid events to process"). The observer's own function runs against
  // a minimal app state (last_speak_mode set, so the once-per-session block with speech and fullscreen is skipped).
  test('entering speak mode stashes your real id for logged events', function(assert) {
    assert.expect(2);
    var stashed = {};
    var me = me_self();
    var fake = EmberObject.create({
      speak_mode: true, last_speak_mode: true, currentUser: me, sessionUser: me, referenced_user: me, sidebar_boards: [],
      session: EmberObject.create({ isAuthenticated: true }),
      stashes: { set: function(k, v) { stashed[k] = v; }, get: function(k) { return stashed[k]; }, persist: function(k, v) { stashed[k] = v; }, geo: { poll: function() { } } }
    });
    var handlers = this.owner.factoryFor('service:app-state').class.proto().speak_mode_handlers;
    try { handlers.call(fake); } catch(e) { /* later steps need a full app state; the stash comes first */ }
    assert.strictEqual(stashed.speaking_user_id, '1_3');
    assert.strictEqual(stashed.session_user_id, '1_3');
  });

  test('a saved workbook logs its events under real ids', async function(assert) {
    assert.expect(1);
    var logged = [];
    var saved = Object.assign({}, evaluation._services);
    evaluation._services.appState = EmberObject.create({ sessionUser: me_self(), currentUser: me_self() });
    evaluation._services.stashes = { log_event: function(obj, uid, sid) { logged.push([uid, sid]); }, push_log: function() { } };
    evaluation._services.persistence = EmberObject.create({ online: false });
    try {
      await evaluation.save_workbook({ assessment: { user_id: 'self', mastery_cutoff: 1 }, workbook: {} });
      assert.deepEqual(logged, [['1_3', '1_3']]);
    } finally {
      Object.keys(evaluation._services).forEach(function(k) { if(!(k in saved)) { delete evaluation._services[k]; } });
      Object.assign(evaluation._services, saved);
    }
  });

  test('an assessment for yourself is filed under your real id', function(assert) {
    assert.expect(1);
    with_users(this.owner, { sessionUser: me_self(), currentUser: me_self() }, function() {
      assert.strictEqual(evaluation._eval_user_id(), '1_3');
    });
  });

  test('the tour offer stays up when your record changes to the one keyed self', function(assert) {
    assert.expect(1);
    var component = this.owner.factoryFor('component:tour-offer').create();
    with_users(this.owner, { last_speak_mode: true, sessionUser: me_self(), currentUser: me_self(), speak_mode: true, tour_offer_visible: true, tour_offer_user: '1_3' }, function() {
      assert.true(component.get('visible'));
    });
    component.destroy();
  });
});
