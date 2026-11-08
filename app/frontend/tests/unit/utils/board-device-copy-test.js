import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';
import LingoLinq from 'frontend/app';
import RSVP from 'rsvp';
import modal from 'frontend/utils/modal';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';
import { usable_copy, newest_copy, server_refused, session_ended, board_saved_here, device_has_board, leave_unsaved_board } from 'frontend/utils/board_device_copy';

/* Which copy of a board the Modern board page may show when the server gave no usable answer
 * (#1213). The rejection shapes are the real ones: utils/extras.js wraps every failure as
 * {fakeXHR: {status}, message, result}, and a permission denial is a 400 (utils/board_revocation.js
 * #real_denial). */
module('Unit | Utility | board_device_copy', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.realSession = LingoLinq.session;
    LingoLinq.session = EmberObject.create({as_user_id: null});
  });
  hooks.afterEach(function() {
    LingoLinq.session = this.realSession;
  });

  var raw = {id: '1_7', key: 'me/board', buttons: []};
  var denied = {fakeXHR: {status: 400, responseJSON: {error: 'Not authorized', unauthorized: true, permission: 'view', status: 400}}, message: 'error', result: 'Not authorized'};
  var dead_session = {fakeXHR: {status: 400, responseJSON: {error: 'Not authorized', unauthorized: true, permission: 'view', status: 400, invalid_token: true}}};
  var missing = {fakeXHR: {status: 404, responseJSON: {error: 'Record not found', status: 404}}};
  var no_answer = {fakeXHR: {status: 0}, message: 'error', result: ''};
  var server_error = {fakeXHR: {status: 503}};
  var offline = {offline: true, error: 'not online', short_circuit: true};
  function state(props) {
    return EmberObject.create(Object.assign({sessionUser: {user_name: 'me', supervisees: [], preferences: {}}, speak_mode: false}, props));
  }

  module('offline boards that are not saved', function(hooks) {
    hooks.afterEach(function() { restoreStubs(); });
    var cache = { peek: function() { return null; } };
    function device(online, rows) {
      return EmberObject.extend({
        find: function(store, key) { return rows[key] ? RSVP.resolve(rows[key]) : RSVP.reject({error: 'none'}); }
      }).create({online: online});
    }

    test('board_saved_here only says no offline, for a board that is really missing', async function(assert) {
      assert.true(await board_saved_here(device(true, {}), cache, 'me/board'), 'online');
      assert.false(await board_saved_here(device(false, {}), cache, 'me/board'), 'offline, not on the device');
      assert.true(await board_saved_here(device(false, {'me/board': raw}), cache, 'me/board'), 'offline, on the device');
      assert.false(await board_saved_here(device(false, {'me/board': {id: '1_7', key: 'me/board'}}), cache, 'me/board'), 'a row that cannot render');
      assert.true(await board_saved_here(device(false, {}), {peek: function() { return raw; }}, 'me/board'), 'in memory');
      assert.true(await board_saved_here(device(false, {}), cache, 'obf/emergency'), 'not a stored board');
    });

    test('a slow read is not a missing board', async function(assert) {
      assert.true(await device_has_board(EmberObject.extend({ find: function() { return RSVP.reject({}); } }).create(), {peek: function() { return raw; }}, 'me/board'), 'in memory');
    });

    function leaving(home, rows) {
      var moved = [];
      var user = EmberObject.create({preferences: {home_board: home ? {key: home} : null}});
      stub(modal, 'warning', function() { });
      return leave_unsaved_board({ replaceWith: function() { moved.push(Array.prototype.slice.call(arguments)); } },
        EmberObject.create({sessionUser: user}), device(false, rows), cache, 'me/gone').then(function() { return moved; });
    }

    test('leave_unsaved_board goes to the home board when it is here', async function(assert) {
      assert.deepEqual(await leaving('me/home', {'me/home': raw}), [['user.board-detail', 'me', 'home']]);
    });

    test('a message that cannot show yet never stops the move', async function(assert) {
      var moved = [];
      stub(modal, 'warning', function() { throw new Error('must call setup before trying to show a flash message'); });
      await leave_unsaved_board({ replaceWith: function(name) { moved.push(name); } },
        EmberObject.create({sessionUser: null}), device(false, {}), cache, 'me/gone');
      await new RSVP.Promise(function(res) { setTimeout(res, 0); });
      assert.deepEqual(moved, ['offline_boards']);
    });

    test('leave_unsaved_board goes to the bundled boards otherwise, never the same board', async function(assert) {
      assert.deepEqual(await leaving('me/home', {}), [['offline_boards']], 'home not saved');
      assert.deepEqual(await leaving(null, {}), [['offline_boards']], 'no home board');
      assert.deepEqual(await leaving('me/gone', {'me/gone': raw}), [['offline_boards']], 'the home board is the one that failed');
    });
  });

  test('usable_copy needs an id, a key and a buttons list', function(assert) {
    assert.true(usable_copy(raw));
    assert.false(usable_copy({id: '1_7', key: 'me/board'}), 'no buttons');
    assert.false(usable_copy({key: 'me/board', buttons: []}), 'no id');
    assert.false(usable_copy({text: '<html>blocked</html>'}), 'a non-JSON 200 body');
    assert.false(usable_copy(null));
  });

  test('newest_copy takes the later update, and whichever copy is usable', function(assert) {
    var older = {id: '1_7', key: 'me/board', buttons: [], updated: '2026-11-01T00:00:00Z'};
    var newer = {id: '1_7', key: 'me/board', buttons: [], updated: '2026-11-02T00:00:00Z'};
    assert.strictEqual(newest_copy(older, newer), newer);
    assert.strictEqual(newest_copy(newer, older), newer);
    assert.strictEqual(newest_copy(older, null), older, 'not in memory');
    assert.strictEqual(newest_copy(null, newer), newer, 'not on the device');
    assert.strictEqual(newest_copy({id: '1_7'}, newer), newer, 'a row that cannot render');
    assert.strictEqual(newest_copy(null, null), null);
  });

  test('server_refused: no answer, a server error or offline never refuses', function(assert) {
    assert.false(server_refused([no_answer, server_error, offline], 'me/board', '1_7', state()));
    assert.false(server_refused([], 'me/board', '1_7', state()));
  });

  test('server_refused: a real denial or a 404 on ANY attempt refuses, whatever came after', function(assert) {
    assert.true(server_refused([denied], 'me/board', '1_7', state()));
    assert.true(server_refused([denied, no_answer], 'me/board', '1_7', state()), 'denied, then the network dropped');
    assert.true(server_refused([no_answer, denied], 'me/board', '1_7', state()));
    assert.true(server_refused([missing, no_answer], 'me/board', '1_7', state()));
  });

  test('session_ended reads the HTTP status and a 200 body', function(assert) {
    var session = { dead_session_response: function(xhr) { return !!(xhr && xhr.status == 400 && xhr.responseJSON.invalid_token); } };
    assert.true(session_ended(dead_session, session));
    assert.true(session_ended({fakeXHR: {status: 200}, result: {invalid_token: true}}, session), 'in a 200 body');
    assert.false(session_ended(denied, session));
    assert.false(session_ended(null, session));
  });

  test('server_refused: a 404 counts only when it is the API speaking', function(assert) {
    assert.true(server_refused([{fakeXHR: {status: 200}, result: {status: 404, error: 'Record not found'}}], 'me/board', '1_7', state()), 'in a 200 body');
    assert.false(server_refused([{fakeXHR: {status: 404}}], 'me/board', '1_7', state()), 'a proxy with no API body');
  });

  test('server_refused: a home or sidebar board keeps its copy even after a 404', function(assert) {
    assert.false(server_refused([missing], 'me/board', '1_7', state({sessionUser: {user_name: 'me', supervisees: [], preferences: {home_board: {id: '1_7', key: 'me/board'}}}})));
  });

  test('server_refused: Speak Mode does not excuse a denial, a home board does', function(assert) {
    assert.true(server_refused([denied], 'me/board', '1_7', state({speak_mode: true})), 'Speak Mode');
    assert.false(server_refused([denied], 'me/board', '1_7', state({sessionUser: {user_name: 'me', supervisees: [], preferences: {home_board: {id: '1_7', key: 'me/board'}}}})), 'the home board');
    assert.false(server_refused([dead_session], 'me/board', '1_7', state()), 'a dead session is not a denial of this board');
  });
});
