import { module, test } from 'qunit';
import sessionHistory from 'frontend/utils/session_history';

var USER = 'testuser';

function clear_keys() {
  sessionHistory.clear_board(USER);
  sessionHistory.clear_location(USER);
}

module('Unit | Utility | session_history', function(hooks) {
  hooks.beforeEach(function() {
    clear_keys();
  });

  hooks.afterEach(function() {
    clear_keys();
  });

  test('recordable_route accepts real destinations', function(assert) {
    assert.ok(sessionHistory.recordable_route('user.board-detail.index'));
    assert.ok(sessionHistory.recordable_route('user.stats'));
    assert.ok(sessionHistory.recordable_route('board.index'));
    assert.ok(sessionHistory.recordable_route('organization.reports'));
    assert.ok(sessionHistory.recordable_route('user.home'));
  });

  test('recordable_route rejects transient, one-shot and token-bearing routes', function(assert) {
    assert.notOk(sessionHistory.recordable_route(null));
    assert.notOk(sessionHistory.recordable_route('index'));
    assert.notOk(sessionHistory.recordable_route('login'));
    assert.notOk(sessionHistory.recordable_route('login.device'));
    assert.notOk(sessionHistory.recordable_route('register'));
    assert.notOk(sessionHistory.recordable_route('setup'));
    assert.notOk(sessionHistory.recordable_route('board-picker'));
    assert.notOk(sessionHistory.recordable_route('consent-response'));
    assert.notOk(sessionHistory.recordable_route('user.password_reset'));
    assert.notOk(sessionHistory.recordable_route('eval.quick'));
    assert.notOk(sessionHistory.recordable_route('user.board-detail.edit'));
    assert.notOk(sessionHistory.recordable_route('pricing'));
  });

  test('a route name that merely starts with a skipped name is still recordable', function(assert) {
    // 'index' is skipped, 'inflections' must not be caught by it
    assert.ok(sessionHistory.recordable_route('inflections'));
    // 'lesson' is skipped (token-bearing), 'user.lessons' is a real page
    assert.ok(sessionHistory.recordable_route('user.lessons'));
  });

  test('record_location round-trips per user', function(assert) {
    sessionHistory.record_location(USER, 'user.stats', '/testuser/stats');
    var res = sessionHistory.last_location(USER);
    assert.strictEqual(res.url, '/testuser/stats');
    assert.strictEqual(res.route, 'user.stats');
    assert.ok(res.at > 0);
    assert.strictEqual(sessionHistory.last_location('someone_else'), null);
    assert.strictEqual(sessionHistory.last_location(null), null);
  });

  test('record_location ignores skipped routes and keeps the prior record', function(assert) {
    sessionHistory.record_location(USER, 'user.stats', '/testuser/stats');
    sessionHistory.record_location(USER, 'login', '/login');
    sessionHistory.record_location(USER, 'user.board-detail.edit', '/testuser/board-detail/example%2Fyesno/edit');
    assert.strictEqual(sessionHistory.last_location(USER).url, '/testuser/stats');
  });

  test('record_location requires both a user and a url', function(assert) {
    sessionHistory.record_location(null, 'user.stats', '/testuser/stats');
    sessionHistory.record_location(USER, 'user.stats', null);
    assert.strictEqual(sessionHistory.last_location(USER), null);
  });

  test('last_location drops a stored record whose route has since become ineligible', function(assert) {
    // Simulate a record written before the route joined the skip list.
    localStorage['ll_last_location_' + USER] = JSON.stringify({url: '/setup', route: 'setup', at: 1});
    assert.strictEqual(sessionHistory.last_location(USER), null);
  });

  test('record_board round-trips and skips synthetic obf boards', function(assert) {
    sessionHistory.record_board(USER, {name: "My Board", key: 'testuser/my-board'});
    assert.strictEqual(sessionHistory.last_board(USER).name, "My Board");
    assert.strictEqual(sessionHistory.last_board(USER).key, 'testuser/my-board');

    sessionHistory.record_board(USER, {name: 'b123bxyz', key: 'obf/eval'});
    assert.strictEqual(sessionHistory.last_board(USER).key, 'testuser/my-board');

    sessionHistory.record_board(USER, {key: 'testuser/nameless'});
    assert.strictEqual(sessionHistory.last_board(USER).key, 'testuser/my-board');
  });

  test('clear_location and clear_board remove only that user record', function(assert) {
    sessionHistory.record_location(USER, 'user.stats', '/testuser/stats');
    sessionHistory.record_board(USER, {name: "My Board", key: 'testuser/my-board'});
    sessionHistory.clear_location(USER);
    assert.strictEqual(sessionHistory.last_location(USER), null);
    assert.strictEqual(sessionHistory.last_board(USER).key, 'testuser/my-board');
    sessionHistory.clear_board(USER);
    assert.strictEqual(sessionHistory.last_board(USER), null);
  });
});
