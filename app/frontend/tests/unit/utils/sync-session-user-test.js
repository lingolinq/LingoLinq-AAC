import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { waitUntil } from '@ember/test-helpers';
import sync from 'frontend/utils/sync';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';

/* THE SESSION USER'S OWN ROOM (section 21 of docs/task-management/2026-11-10_offline-followup-proposals.md). Room
 * subscriptions are keyed by the server's real id (api users#ws_settings -> utils/sync.js connect). While the session
 * user is the record keyed 'self', lookups by `currentUser.id` / `sessionUser.id` ('self') missed every room: your own
 * updates, pairing confirmations and rejections were dropped. */
module('Unit | Utility | sync rooms for the session user', function(hooks) {
  var sent = null;
  hooks.beforeEach(function() {
    sent = [];
    var subs = [
      { user_id: '1_3', ws_user_id: 'me$a', send: function(msg) { sent.push(['1_3', msg]); } },
      { user_id: '1_9', ws_user_id: 'me$b', send: function(msg) { sent.push(['1_9', msg]); } }
    ];
    stub(sync, 'con', { connection: { isOpen: function() { return true; } }, subscriptions: { subscriptions: subs } });
    stub(sync, 'get_app_state', function() { return EmberObject.create({ sessionUser: EmberObject.create({ id: 'self', global_id: '1_3' }) }); });
  });
  hooks.afterEach(function() { restoreStubs(); });

  test('your own room is found by the id self', function(assert) {
    assert.true(sync.in_room('self'));
  });

  test('a message to the id self reaches your own room', async function(assert) {
    sync.send('self', { type: 'update' });
    await waitUntil(function() { return sent.length > 0; });
    assert.deepEqual(sent.map(function(s) { return s[0]; }), ['1_3']);
  });

  test('a communicator\'s room is still found by their own id, and only theirs', async function(assert) {
    assert.true(sync.in_room('1_9'));
    sync.send('1_9', { type: 'update' });
    await waitUntil(function() { return sent.length > 0; });
    assert.deepEqual(sent.map(function(s) { return s[0]; }), ['1_9']);
  });

  test('a room nobody subscribed to is not found', function(assert) {
    assert.false(sync.in_room('1_77'));
    assert.false(sync.send('1_77', { type: 'update' }));
  });

  test("the follow and pairing checks treat 'self' and your real id as you, and nobody else", function(assert) {
    assert.true(sync.same_user('self', '1_3'), 'self is the session user');
    assert.true(sync.same_user('1_3', 'self'));
    assert.false(sync.same_user('self', '1_9'), 'a communicator is not you');
    assert.false(sync.same_user('1_9', '1_77'));
  });
});
