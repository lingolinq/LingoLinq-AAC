import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import { setupTest } from 'frontend/tests/helpers';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';
import evaluation from 'frontend/utils/eval';

/* THE SESSION USER HELD AS 'self' (section 24 of docs/task-management/2026-11-10_offline-followup-proposals.md).
 * After a board copy or a token check the session user is the record keyed 'self' (serializers/application.js), real
 * id in _actual_id. Comparisons by `id` read the person themself as someone else, and ids sent to the server as 'self'
 * inside a body are dropped. Stubs use the network-load shape; a different person is the guard. */
module('Unit | Service | app state and models with the session user keyed self', function(hooks) {
  setupTest(hooks);
  hooks.afterEach(function() { restoreStubs(); });

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
    with_users(this.owner, { sessionUser: me_self(), currentUser: me_self(), referenced_speak_mode_user: me_real(), speak_mode: true, modeling_for_self: false }, function(app) {
      assert.false(!!app.get('modeling_for_user'));
    });
  });

  test('a word activity is logged under your real id', function(assert) {
    assert.expect(1);
    var store = this.owner.lookup('service:store');
    var me = store.push({ data: { type: 'user', id: 'self', attributes: { _actual_id: '1_3', user_name: 'example' } } });
    var logged = [];
    stub(me.stashes, 'log_event', function(opts, user_id) { logged.push(user_id); });
    stub(me.stashes, 'push_log', function() { });
    stub(me.persistence, 'find', function() { return RSVP.reject(); });
    stub(me.persistence, 'store', function() { return RSVP.resolve(); });
    try {
      me.log_word_activity({ word: 'go' });
      assert.deepEqual(logged, ['1_3']);
    } finally {
      me.unloadRecord();
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
    with_users(this.owner, { sessionUser: me_self(), currentUser: me_self(), speak_mode: true, tour_offer_visible: true, tour_offer_user: '1_3' }, function() {
      assert.true(component.get('visible'));
    });
    component.destroy();
  });
});
