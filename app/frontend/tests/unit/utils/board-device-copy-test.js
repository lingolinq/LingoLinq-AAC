import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';
import LingoLinq from 'frontend/app';
import { usable_copy, newest_copy, server_refused } from 'frontend/utils/board_device_copy';

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
  var missing = {fakeXHR: {status: 404, responseJSON: {error: 'Not found', status: 404}}};
  var no_answer = {fakeXHR: {status: 0}, message: 'error', result: ''};
  var server_error = {fakeXHR: {status: 503}};
  var offline = {offline: true, error: 'not online', short_circuit: true};
  function state(props) {
    return EmberObject.create(Object.assign({sessionUser: {user_name: 'me', supervisees: [], preferences: {}}, speak_mode: false}, props));
  }

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
    assert.false(server_refused([no_answer, server_error, offline], raw, state()));
    assert.false(server_refused([], raw, state()));
  });

  test('server_refused: a real denial or a 404 on ANY attempt refuses, whatever came after', function(assert) {
    assert.true(server_refused([denied], raw, state()));
    assert.true(server_refused([denied, no_answer], raw, state()), 'denied, then the network dropped');
    assert.true(server_refused([no_answer, denied], raw, state()));
    assert.true(server_refused([missing, no_answer], raw, state()));
  });

  test('server_refused: the communicator keeps a voice, as in the Basic view', function(assert) {
    assert.false(server_refused([denied], raw, state({speak_mode: true})), 'Speak Mode');
    assert.false(server_refused([denied], raw, state({sessionUser: {user_name: 'me', supervisees: [], preferences: {home_board: {id: '1_7', key: 'me/board'}}}})), 'the home board');
    assert.false(server_refused([dead_session], raw, state()), 'a dead session is not a denial of this board');
  });
});
