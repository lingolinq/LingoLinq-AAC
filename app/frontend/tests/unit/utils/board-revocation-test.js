import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import LingoLinq from 'frontend/app';
import lingoLinqExtras from 'frontend/utils/extras';
import boardRevocation from 'frontend/utils/board_revocation';

/* Offline copies of boards a synced user can no longer view (utils/board_revocation.js).
 * Owner decision: such copies are MARKED and blocked, never deleted; never on network
 * errors, timeouts, 5xx or token/scope/valet refusals; never while a board is in use in
 * Speak Mode; never while any synced user (root or supervisee) can still view or owns the
 * board; reversible when access returns.
 */
module('Unit | Utility | board_revocation', function(hooks) {
  hooks.beforeEach(function() {
    var db = { board: {}, settings: {} };
    var writes = [];
    var removes = [];
    this.db = db;
    this.writes = writes;
    this.removes = removes;
    var storage = lingoLinqExtras.storage;
    this.realStorage = {
      find: storage.find, find_all: storage.find_all, store: storage.store, remove: storage.remove
    };
    storage.find = function(store, key) {
      var rec = db[store] && db[store][key];
      return rec ? RSVP.resolve(JSON.parse(JSON.stringify(rec))) : RSVP.reject({error: 'no record found'});
    };
    storage.find_all = function(store) {
      return RSVP.resolve(Object.keys(db[store] || {}).map(function(k) {
        return {store: store, data: JSON.parse(JSON.stringify(db[store][k]))};
      }));
    };
    storage.store = function(store, record) {
      writes.push({store: store, record: record});
      db[store][record.id || record.storageId] = JSON.parse(JSON.stringify(record));
      return RSVP.resolve(record);
    };
    storage.remove = function(store, id) {
      removes.push({store: store, id: id});
      return RSVP.resolve();
    };
    this.realAppState = LingoLinq.appState;
    LingoLinq.appState = EmberObject.create({speak_mode: false});
    boardRevocation.reset_for_tests();
  });

  hooks.afterEach(function() {
    var storage = lingoLinqExtras.storage;
    storage.find = this.realStorage.find;
    storage.find_all = this.realStorage.find_all;
    storage.store = this.realStorage.store;
    storage.remove = this.realStorage.remove;
    LingoLinq.appState = this.realAppState;
    boardRevocation.reset_for_tests();
  });

  function addBoard(db, id, extra) {
    db.board[id] = {id: id, key: 'owner/' + id, persisted: 12345, raw: Object.assign({id: id, key: 'owner/' + id, name: 'Board ' + id, current_revision: 'r1'}, extra || {})};
  }

  function persistFor(root_id) {
    return EmberObject.create({sync_progress: {root_user: root_id}});
  }

  function user(id, supervisee_ids) {
    return EmberObject.create({id: id, supervisees: (supervisee_ids || []).map(function(s) { return {id: s}; })});
  }

  function answer(revisions, revoked) {
    return function(opts) {
      answer.last_opts = opts;
      return RSVP.resolve({revisions: revisions, revoked_ids: revoked});
    };
  }

  test('parse_revisions_response reads the wrapped shape and treats the flat map as carrying no revoked list', function(assert) {
    var wrapped = boardRevocation.parse_revisions_response({revisions: {'1_1': 'a'}, revoked_ids: ['1_2', 'self']});
    assert.deepEqual(wrapped.revisions, {'1_1': 'a'});
    assert.deepEqual(wrapped.revoked_ids, ['1_2'], 'only board ids are kept');
    var flat = boardRevocation.parse_revisions_response({'1_1': 'a', 'owner/b': 'a'});
    assert.deepEqual(flat.revisions, {'1_1': 'a', 'owner/b': 'a'});
    assert.strictEqual(flat.revoked_ids, null);
  });

  test('check_ids_for puts marked boards first and stops at 500', function(assert) {
    var local = [];
    for(var i = 0; i < 600; i++) { local.push({id: '1_' + i}); }
    local.push({id: 'tmp_x'});
    var ids = boardRevocation.check_ids_for(local, ['1_9999']);
    assert.strictEqual(ids.length, 500);
    assert.strictEqual(ids[0], '1_9999');
    assert.notOk(ids.includes('tmp_x'));
  });

  test('a revoked board is marked after a full sync of every synced user, and not deleted', async function(assert) {
    addBoard(this.db, '1_1');
    addBoard(this.db, '1_2');
    var persist = persistFor('u1');
    var revisions = await boardRevocation.fetch_revisions(persist, user('u1'), answer({'1_1': 'r1', 'owner/1_1': 'r1'}, ['1_2']));
    assert.deepEqual(revisions, {'1_1': 'r1', 'owner/1_1': 'r1'}, 'the sync code still gets the flat map');
    assert.strictEqual(answer.last_opts.data.include_revoked, '1');
    assert.deepEqual(answer.last_opts.data.check_ids.split(',').sort(), ['1_1', '1_2']);
    assert.true(boardRevocation.skip_board(persist, 'u1', {id: '1_2'}), 'traversal skips it by id');
    assert.true(boardRevocation.skip_board(persist, 'u1', {key: 'owner/1_2'}), 'and by its local key');
    assert.false(boardRevocation.skip_board(persist, 'u1', {id: '1_1'}));
    assert.deepEqual(boardRevocation.settled_revocations(persist.get('sync_progress'), 'u1', []), ['1_2']);
    await boardRevocation.apply_revocations(['1_2']);
    assert.true(this.db.board['1_2'].raw.revoked, 'marked on the local record');
    assert.strictEqual(this.db.board['1_2'].raw.name, 'Board 1_2', 'the rest of the copy is kept');
    assert.strictEqual(this.db.board['1_2'].persisted, 12345);
    assert.notOk(this.db.board['1_1'].raw.revoked, 'own viewable board untouched');
    assert.strictEqual(this.removes.length, 0, 'nothing removed');
    assert.true(await boardRevocation.is_revoked('1_2'));
    assert.false(await boardRevocation.is_revoked('1_1'));
  });

  test('a board a synced supervisee can still view, or owns, is not marked', function(assert) {
    assert.expect(1);
    var persist = persistFor('u1');
    var progress = persist.get('sync_progress');
    var done = boardRevocation.fetch_revisions(persist, user('u1', ['u2']), answer({}, ['1_2', '1_3'])).then(function() {
      // u2 owns 1_3 and can view it, so the server does not list it for u2
      return boardRevocation.fetch_revisions(persist, user('u2'), answer({'1_3': 'r'}, ['1_2']));
    }).then(function() {
      assert.deepEqual(boardRevocation.settled_revocations(progress, 'u1', []), ['1_2'], 'only the board both users lost');
    });
    return done;
  });

  test('nothing is decided when a supervisee did not sync, a supervisee failed, the sync had errors or was canceled', async function(assert) {
    var persist = persistFor('u1');
    var progress = persist.get('sync_progress');
    await boardRevocation.fetch_revisions(persist, user('u1', ['u2']), answer({}, ['1_2']));
    assert.strictEqual(boardRevocation.settled_revocations(progress, 'u1', []), null, 'supervisee u2 never reported');
    await boardRevocation.fetch_revisions(persist, user('u2'), answer({}, ['1_2']));
    assert.deepEqual(boardRevocation.settled_revocations(progress, 'u1', []), ['1_2'], 'control: both reported');
    assert.strictEqual(boardRevocation.settled_revocations(progress, 'u1', [{error: 'x'}]), null, 'board errors');
    progress.canceled = true;
    assert.strictEqual(boardRevocation.settled_revocations(progress, 'u1', []), null, 'canceled');
    progress.canceled = false;
    boardRevocation.note_failure(persist);
    assert.strictEqual(boardRevocation.settled_revocations(progress, 'u1', []), null, 'a supervisee sync failed');
  });

  test('a failed, timed-out or 5xx revisions request, or an older server, marks nothing', async function(assert) {
    assert.expect(11);
    addBoard(this.db, '1_2');
    var shapes = [
      {fakeXHR: {status: 500}, message: 'error', result: 'Internal Server Error'},
      {error: 'timeout'},
      {fakeXHR: {status: 0}},
      {fakeXHR: {status: 400, responseJSON: {error: 'Invalid token', invalid_token: true}}}
    ];
    for(var idx = 0; idx < shapes.length; idx++) {
      var persist = persistFor('u1');
      var err = shapes[idx];
      var caught = null;
      await boardRevocation.fetch_revisions(persist, user('u1'), function() { return RSVP.reject(err); }).then(null, function(e) { caught = e; });
      assert.strictEqual(caught, err, 'the rejection is passed through unchanged');
      assert.strictEqual(boardRevocation.finish_sync(persist, 'u1', []), null, 'no decision');
    }
    var old = persistFor('u1');
    await boardRevocation.fetch_revisions(old, user('u1'), function() { return RSVP.resolve({'1_1': 'r'}); });
    assert.strictEqual(boardRevocation.finish_sync(old, 'u1', []), null, 'flat response from an older server');
    assert.notOk(this.db.board['1_2'].raw.revoked);
    assert.strictEqual(this.writes.filter(function(w) { return w.store === 'board'; }).length, 0);
  });

  test('a mark is cleared once the board is no longer reported', async function(assert) {
    addBoard(this.db, '1_2');
    await boardRevocation.apply_revocations(['1_2']);
    assert.true(this.db.board['1_2'].raw.revoked);
    await boardRevocation.apply_revocations([]);
    assert.notOk(this.db.board['1_2'].raw.revoked, 'cleared');
    assert.false(await boardRevocation.is_revoked('1_2'));
  });

  test('marks wait while Speak Mode is on and apply once it is off', async function(assert) {
    addBoard(this.db, '1_2');
    LingoLinq.appState.set('speak_mode', true);
    await boardRevocation.apply_revocations(['1_2']);
    assert.notOk(this.db.board['1_2'].raw.revoked, 'not marked during Speak Mode');
    assert.true(boardRevocation.has_deferred());
    assert.false(await boardRevocation.flush_deferred(), 'still in Speak Mode');
    LingoLinq.appState.set('speak_mode', false);
    assert.true(await boardRevocation.flush_deferred());
    assert.true(this.db.board['1_2'].raw.revoked, 'marked after Speak Mode');
    assert.false(boardRevocation.has_deferred());
  });

  test('without_revoked and blocks_route leave out marked boards, except the board on screen', async function(assert) {
    addBoard(this.db, '1_1');
    addBoard(this.db, '1_2');
    await boardRevocation.apply_revocations(['1_2']);
    assert.deepEqual(await boardRevocation.without_revoked(['1_1', '1_2']), ['1_1']);
    var board = EmberObject.create({id: '1_2'});
    assert.true(await boardRevocation.blocks_route(board, EmberObject.create({currentBoardState: {id: '1_1'}})));
    assert.false(await boardRevocation.blocks_route(board, EmberObject.create({currentBoardState: {id: '1_2'}})), 'board on screen');
  });

  test('real_denial recognises only a real view refusal', function(assert) {
    assert.expect(10);
    var body = {error: 'Not authorized', unauthorized: true, permission: 'view', status: 400};
    assert.true(boardRevocation.real_denial({fakeXHR: {status: 400, responseJSON: body}, message: 'error', result: 'Not authorized'}), 'HTTP 400');
    assert.true(boardRevocation.real_denial({fakeXHR: {status: 200}, result: body}), 'X-Has-AppCache 200 carrying the 400 body');
    ['valet_blocked', 'device_scopes_none', 'scope_limited', 'invalid_token'].forEach(function(flag) {
      var b = Object.assign({}, body);
      b[flag] = true;
      assert.false(boardRevocation.real_denial({fakeXHR: {status: 400, responseJSON: b}}), flag);
    });
    assert.false(boardRevocation.real_denial({fakeXHR: {status: 500, responseJSON: {error: 'boom'}}}), '5xx');
    assert.false(boardRevocation.real_denial({error: 'timeout'}), 'timeout');
    assert.false(boardRevocation.real_denial({fakeXHR: {status: 0}}), 'offline');
    assert.false(boardRevocation.real_denial({fakeXHR: {status: 400, responseJSON: Object.assign({}, body, {permission: 'edit'})}}), 'not the view permission');
  });

  test('route_refuses_local only when the refusal speaks for every synced user', function(assert) {
    assert.expect(4);
    var err = {fakeXHR: {status: 400, responseJSON: {error: 'Not authorized', unauthorized: true, permission: 'view'}}};
    var realSession = LingoLinq.session;
    LingoLinq.session = EmberObject.create({as_user_id: null});
    try {
      assert.true(boardRevocation.route_refuses_local(err, EmberObject.create({sessionUser: {supervisees: []}})));
      assert.false(boardRevocation.route_refuses_local(err, EmberObject.create({sessionUser: {supervisees: [{id: 'u2'}]}})), 'a supervisee might view it');
      assert.false(boardRevocation.route_refuses_local(err, EmberObject.create({sessionUser: null})), 'no session user loaded');
      LingoLinq.session = EmberObject.create({as_user_id: 'u9'});
      assert.false(boardRevocation.route_refuses_local(err, EmberObject.create({sessionUser: {supervisees: []}})), 'acting as another user');
    } finally {
      LingoLinq.session = realSession;
    }
  });
});
