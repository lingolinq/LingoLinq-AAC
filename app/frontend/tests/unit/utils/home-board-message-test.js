import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import { setupTest } from 'frontend/tests/helpers';
import { home_board_set_message, sync_after_home_change } from 'frontend/utils/home_board';
import modal from 'frontend/utils/modal';
import persistence from 'frontend/utils/persistence';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';
import { stubOnPersistence } from 'frontend/tests/helpers/persistence-stub';

/* PICKING A HOME BOARD SAYS WHAT IS TRUE, AND STARTS THE SYNC THAT MAKES IT TRUE (#1034).
 *
 * "Pick this Board" ended with "This is now your home board, and it's saved for offline use." Nothing had been
 * saved: the step before the message only loads the board's pictures into the browser's memory and always
 * resolves (utils/board_preview_warmer.js#preload_board_images), so the message showed whatever happened, and
 * that path started no sync. A board is on the device only once a sync has saved it.
 */
module('Unit | Utility | home board message and sync', function(hooks) {
  setupTest(hooks);
  hooks.afterEach(function() { restoreStubs(); });

  function fake_persistence(state, calls, outcome) {
    return EmberObject.create(Object.assign({
      sync: function() { calls.push(Array.prototype.slice.call(arguments)); return outcome || RSVP.resolve(); }
    }, state));
  }

  test('the message does not say the board is already saved', function(assert) {
    var text = home_board_set_message();
    assert.ok(/home board/i.test(text), 'says the home board changed');
    assert.ok(/after the next sync/i.test(text), 'says when it will be on the device');
    assert.notOk(/saved for offline|is saved|available offline/i.test(text), 'makes no claim that it already is');
  });

  test('online with automatic syncing on, a sync for the person is started', async function(assert) {
    var calls = [];
    var started = await sync_after_home_change(fake_persistence({ online: true, auto_sync: true }, calls));
    assert.deepEqual(calls, [['self', null, null, 'home_board_changed']]);
    assert.true(started);
  });

  test('offline, or with automatic syncing off, no sync is started', async function(assert) {
    var calls = [];
    assert.false(await sync_after_home_change(fake_persistence({ online: false, auto_sync: true }, calls)), 'offline');
    assert.false(await sync_after_home_change(fake_persistence({ online: true, auto_sync: false }, calls)), 'automatic syncing off');
    assert.false(await sync_after_home_change(null), 'no persistence');
    assert.deepEqual(calls, []);
  });

  test('a sync that fails does not fail the home-board change', async function(assert) {
    var calls = [];
    var result = await sync_after_home_change(fake_persistence({ online: true, auto_sync: true }, calls, RSVP.reject({ error: 'already syncing' })));
    assert.true(result, 'resolves');
    assert.strictEqual(calls.length, 1);
  });

  test('"Pick this Board" for yourself shows that message and starts the sync', async function(assert) {
    assert.expect(4);
    var shown = [];
    var syncs = [];
    var moves = [];
    stub(modal, 'success', function(text) { shown.push(text); });
    stubOnPersistence('sync', function() { syncs.push(Array.prototype.slice.call(arguments)); return RSVP.resolve(); });
    var service = this.owner.lookup('service:persistence');
    var prior = { online: service.get('online'), auto_sync: service.get('auto_sync') };
    service.set('online', true);
    service.set('auto_sync', true);
    try {
      assert.true(!!persistence.get('online'), 'the code under test sees the connection');
      var overlay = this.owner.factoryFor('component:board-preview-overlay').create();
      // No key: the finish step takes its plain route change, with no screen overlay to clean up.
      var board = EmberObject.create({ key: '' });
      overlay._finishPickForHome(board, null, null, { transitionTo: function() { moves.push(Array.prototype.slice.call(arguments)); } });
      await new RSVP.Promise(function(resolve) { RSVP.resolve().then(function() { RSVP.resolve().then(resolve); }); });
      assert.deepEqual(shown, [home_board_set_message()], 'one message, the true one');
      assert.deepEqual(syncs, [['self', null, null, 'home_board_changed']], 'a sync was started');
      assert.strictEqual(moves.length, 1, 'and the board opens');
    } finally {
      service.set('online', prior.online);
      service.set('auto_sync', prior.auto_sync);
    }
  });

  /* A FRESH COPY CHANGES THE SESSION USER'S RECORD (2026-11-12). The copy job ends with refresh_session_user()
   * (utils/edit_manager.js, the copy_board_links progress handler), which loads findRecord('user', 'self'); the
   * serializer keys that record 'self' (serializers/application.js#normalizeResponse) and models/user.js#global_id
   * holds the real id. The pick's snapshot was taken before, under the real id. Comparing `id` read '1_3' != 'self'
   * as "picking for someone else": no board opened and no sync started. Stubs use the network-load shape
   * ({ id: 'self', global_id }), as LEARNINGS asks. */
  function pick_with_users(owner, snapshot, current) {
    var shown = [];
    var syncs = [];
    var moves = [];
    stub(modal, 'success', function(text) { shown.push(text); });
    stub(modal, 'close_board_preview', function() { });
    stubOnPersistence('sync', function() { syncs.push(Array.prototype.slice.call(arguments)); return RSVP.resolve(); });
    var service = owner.lookup('service:persistence');
    var app = owner.lookup('service:app-state');
    var prior = { online: service.get('online'), auto_sync: service.get('auto_sync'), currentUser: app.get('currentUser'), setup_user: app.get('setup_user') };
    service.set('online', true);
    service.set('auto_sync', true);
    app.set('setup_user', null);
    app.set('currentUser', current);
    var overlay = owner.factoryFor('component:board-preview-overlay').create();
    var board = EmberObject.create({ key: '' });
    overlay._finishPickForHome(board, null, snapshot, { transitionTo: function() { moves.push(Array.prototype.slice.call(arguments)); } });
    return new RSVP.Promise(function(resolve) { RSVP.resolve().then(function() { RSVP.resolve().then(resolve); }); }).then(function() {
      service.set('online', prior.online);
      service.set('auto_sync', prior.auto_sync);
      app.set('currentUser', prior.currentUser);
      app.set('setup_user', prior.setup_user);
      return { shown: shown, syncs: syncs, moves: moves };
    });
  }

  test('"Pick this Board" for yourself after a copy refreshed your record still opens the board and starts the sync', async function(assert) {
    var snapshot = EmberObject.create({ id: '1_3', global_id: '1_3', user_name: 'example' });
    var current = EmberObject.create({ id: 'self', global_id: '1_3', user_name: 'example' });
    var result = await pick_with_users(this.owner, snapshot, current);
    assert.deepEqual(result.syncs, [['self', null, null, 'home_board_changed']], 'a sync was started');
    assert.deepEqual(result.shown, [home_board_set_message()], 'the message for your own home board');
    assert.strictEqual(result.moves.length, 1, 'and the board opens');
  });

  test('"Pick this Board" for someone else still takes the other-person path', async function(assert) {
    var snapshot = EmberObject.create({ id: '1_9', global_id: '1_9', user_name: '' });
    var current = EmberObject.create({ id: 'self', global_id: '1_3', user_name: 'example' });
    stub(this.owner.lookup('service:app-state'), 'return_to_index', function() { });
    var result = await pick_with_users(this.owner, snapshot, current);
    assert.deepEqual(result.syncs, [], 'no sync of your own boards');
    assert.deepEqual(result.moves, [], 'your board does not open');
    assert.strictEqual(result.shown.length, 1, 'the other-person message');
  });
});
