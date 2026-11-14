import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import { setupTest } from '../../helpers';
import { board_target, is_board_page, no_connection, no_server_answer, owner_stand_in } from 'frontend/utils/board_owner';
import boardDetailCache from 'frontend/utils/board_detail_cache';
import modal from 'frontend/utils/modal';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';

/* Every board URL sits under its owner's name, so the `user` route must resolve before a board can
 * open, and sync saves boards but not their owners (#1213). routes/user.js finds an owner for a board
 * page from the device: a real record first, a stand-in only for a board that is on the device. */
var no_answer = {fakeXHR: {status: 0}};
var missing = {fakeXHR: {status: 404, responseJSON: {error: 'Record not found'}}};

function to_board(boardname, route) {
  return {to: {name: route || 'user.board-detail.index', params: {}, parent: {params: {boardname: boardname}, parent: {params: {user_id: 'x'}}}}};
}

module('Unit | Route | user owner of a board page', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    var _this = this;
    this.device = {user: {}, board: {}};
    this.queries = [];
    this.server = function() { return RSVP.reject(no_answer); };
    this.route = this.owner.lookup('route:user');
    this.route.persistence = EmberObject.extend({
      find: function(store, key) {
        var found = _this.device[store][key];
        return found ? RSVP.resolve(found) : RSVP.reject({error: 'not found'});
      }
    }).create({online: false, local_db_is_current_user: function() { return _this.db_current; }});
    this.route.session = EmberObject.create({access_token: 'tok', user_name: 'me', user_id: '1_1'});
    this.route.appState = EmberObject.create({currentUser: null, session_user_promise: null, sessionUser: EmberObject.create({preferences: {device: {long_token: true}}})});
    this.route.offline_shell_on = function() { return false; };
    this.watching = 0;
    this.moved = [];
    this.route.set('router', {on: function() { _this.watching++; }, off: function() { _this.watching--; }, replaceWith: function() { _this.moved.push(Array.prototype.slice.call(arguments)); }});
    this.db_current = true;
    stub(modal, 'warning', function() { });
    this.pushed = [];
    this.route.store = {
      peekAll: function() { return _this.loaded || []; },
      normalize: function(type, raw) { return raw; },
      push: function(raw) { _this.pushed.push(raw); return EmberObject.create(raw); },
      queryRecord: function(type, query) { _this.queries.push(query); return _this.server(query); }
    };
  });

  hooks.afterEach(function() { restoreStubs(); });

  test('offline: a synced board under an owner the device never saved gets a stand-in', async function(assert) {
    this.device.board['lingolinq/crisis'] = {id: '1_9', key: 'lingolinq/crisis'};
    var owner = await this.route.model({user_id: 'lingolinq'}, to_board('crisis'));
    assert.strictEqual(owner.get('user_name'), 'lingolinq');
    assert.true(owner.get('board_owner_stand_in'));
    assert.true(this.route.get('owner_stand_in'));
    assert.deepEqual(this.queries, [], 'no request while offline');
    assert.strictEqual(this.watching, 1, 'watching for the page that replaces it');
    this.route.resetController(EmberObject.create(), true);
    assert.strictEqual(this.watching, 0, 'and not after leaving');
  });

  test('nothing is watched unless a stand-in is in use', async function(assert) {
    this.route.persistence.set('online', true);
    this.server = function() { return RSVP.resolve(EmberObject.create({user_name: 'lingolinq', really_fresh: true})); };
    await this.route.model({user_id: 'lingolinq'}, to_board('crisis'));
    assert.strictEqual(this.watching, 0);
  });

  test('a stand-in holds nothing but the name, and survives the setup of the page that replaces it', async function(assert) {
    var owner = owner_stand_in('lingolinq');
    assert.deepEqual(owner.get('preferences'), {});
    assert.notOk(owner.get('id'));
    assert.strictEqual(await owner.reload(), owner);
  });

  test('another user\'s open database is never read', async function(assert) {
    this.db_current = false;
    this.device.user.kid = {id: '1_4', user_name: 'kid'};
    this.device.board['kid/home'] = {id: '1_9', key: 'kid/home'};
    await assert.rejects(this.route.model({user_id: 'kid'}, to_board('home')));
    assert.deepEqual(this.pushed, [], 'the record stayed out of the store');
  });

  test('a shared device gets no owner from the device, supervisee or stand-in', async function(assert) {
    this.route.appState.set('sessionUser', EmberObject.create({preferences: {device: {long_token: false}}}));
    this.device.user.kid = {id: '1_4', user_name: 'kid'};
    this.device.board['kid/home'] = {id: '1_9', key: 'kid/home'};
    await assert.rejects(this.route.model({user_id: 'kid'}, to_board('home')));
  });

  test('a board only in memory still gets its owner, so the tap that was allowed works', async function(assert) {
    boardDetailCache.set({id: '1_9', key: 'lingolinq/crisis', buttons: []});
    var owner = await this.route.model({user_id: 'lingolinq'}, to_board('crisis'));
    boardDetailCache.clear();
    assert.true(owner.get('board_owner_stand_in'));
  });

  test('with no owner and no connection, it leaves for a safe page, not the error page', async function(assert) {
    var err = await this.route.model({user_id: 'lingolinq'}, to_board('crisis')).then(null, function(e) { return e; });
    assert.true(err.reserved_path, 'the error action treats this as already redirected');
    assert.deepEqual(this.moved, [['offline_boards']]);
  });

  test('any navigation starts with no owner from the device, also one that returns early', async function(assert) {
    this.device.board['lingolinq/crisis'] = {id: '1_9', key: 'lingolinq/crisis'};
    await this.route.model({user_id: 'lingolinq'}, to_board('crisis'));
    assert.true(this.route.get('owner_stand_in'));
    this.route.appState.set('currentUser', EmberObject.create({user_name: 'me', id: '1_1'}));
    await this.route.model({user_id: 'me'}, to_board('home'));
    assert.false(this.route.get('owner_stand_in'), 'your own board, which returns before the owner lookup');
    assert.strictEqual(this.watching, 0);
  });

  test('a real record is watched too, so it serves board pages only', async function(assert) {
    this.device.user.kid = {id: '1_4', user_name: 'kid'};
    await this.route.model({user_id: 'kid'}, to_board('home'));
    assert.strictEqual(this.watching, 1);
  });

  test('a real stored record comes first, so speak-as keeps the supervisee\'s preferences', async function(assert) {
    this.device.user.kid = {id: '1_4', user_name: 'kid', preferences: {skin: 'dark'}};
    this.device.board['kid/home'] = {id: '1_9', key: 'kid/home'};
    var owner = await this.route.model({user_id: 'kid'}, to_board('home'));
    assert.strictEqual(owner.get('id'), '1_4');
    assert.notOk(owner.get('board_owner_stand_in'));
  });

  test('a record already in memory comes before the device', async function(assert) {
    var kid = EmberObject.create({user_name: 'kid'});
    this.loaded = [kid];
    assert.strictEqual(await this.route.model({user_id: 'kid'}, to_board('home')), kid);
  });

  test('no stand-in when the board is not on the device, or belongs to someone else', async function(assert) {
    await assert.rejects(this.route.model({user_id: 'lingolinq'}, to_board('crisis')), 'not on the device');
    this.device.board['lingolinq/crisis'] = {id: '1_9', key: 'other/crisis'};
    await assert.rejects(this.route.model({user_id: 'lingolinq'}, to_board('crisis')), 'the key names another owner');
  });

  test('never on a page that is not a board, and never signed out', async function(assert) {
    this.device.board['lingolinq/crisis'] = {id: '1_9', key: 'lingolinq/crisis'};
    await assert.rejects(this.route.model({user_id: 'lingolinq'}, {to: {name: 'user.boards', params: {}}}), 'the owner\'s boards page');
    assert.strictEqual(this.queries.length, 1, 'that page asks the server, as before');
    this.route.session.set('access_token', null);
    await assert.rejects(this.route.model({user_id: 'lingolinq'}, to_board('crisis')), 'signed out');
  });

  test('your own page needs a trusted device', async function(assert) {
    this.device.user.me = {id: '1_1', user_name: 'me', preferences: {device: {long_token: true}}};
    assert.strictEqual((await this.route.model({user_id: 'me'}, to_board('home'))).get('id'), '1_1', 'trusted');
    this.device.user.me = {id: '1_1', user_name: 'me', preferences: {device: {long_token: false}}};
    this.device.board['me/home'] = {id: '1_9', key: 'me/home'};
    await assert.rejects(this.route.model({user_id: 'me'}, to_board('home')), 'shared: not even a stand-in');
  });

  test('online with no route to the server: one bounded try, then the device', async function(assert) {
    this.route.persistence.set('online', true);
    this.device.board['lingolinq/crisis'] = {id: '1_9', key: 'lingolinq/crisis'};
    var owner = await this.route.model({user_id: 'lingolinq'}, to_board('crisis'));
    assert.true(owner.get('board_owner_stand_in'));
    assert.strictEqual(this.queries[0].one_try, 8000);
    assert.strictEqual(this.queries.length, 1);
  });

  test('online with no route to the server: the START of the silent try is noted for the board request that follows', async function(assert) {
    this.route.persistence.set('online', true);
    this.device.board['lingolinq/crisis'] = {id: '1_9', key: 'lingolinq/crisis'};
    this.route.appState.set('device_copy_server_silent_at', null);
    // The server stays silent for a while, as a hung network does; the note must be the time the try was sent.
    var sent = null;
    this.server = function() { sent = Date.now(); return new RSVP.Promise(function(resolve, reject) { setTimeout(function() { reject(no_answer); }, 120); }); };
    var before = Date.now();
    await this.route.model({user_id: 'lingolinq'}, to_board('crisis'));
    var noted = this.route.appState.get('device_copy_server_silent_at');
    assert.strictEqual(typeof noted, 'number', 'noted when the bounded try got no answer');
    assert.true(noted >= before, 'not before the launch');
    assert.true(noted <= sent, 'the time the try was sent, not the time it failed');
  });

  test('a server that answers clears the note', async function(assert) {
    this.route.persistence.set('online', true);
    this.route.appState.set('device_copy_server_silent_at', Date.now() - 1000);
    this.server = function() { return RSVP.resolve(EmberObject.create({user_name: 'lingolinq', really_fresh: true})); };
    await this.route.model({user_id: 'lingolinq'}, to_board('crisis'));
    assert.strictEqual(this.route.appState.get('device_copy_server_silent_at'), null);
  });

  test('a silent try, no owner on the device, then a patient answer: the note is cleared', async function(assert) {
    this.route.persistence.set('online', true);
    this.route.appState.set('device_copy_server_silent_at', null);
    var calls = 0;
    this.server = function() { calls++; return calls === 1 ? RSVP.reject(no_answer) : RSVP.resolve(EmberObject.create({user_name: 'lingolinq', really_fresh: true})); };
    await this.route.model({user_id: 'lingolinq'}, to_board('crisis'));
    assert.strictEqual(calls, 2, 'the bounded try, then the patient one');
    assert.strictEqual(this.route.appState.get('device_copy_server_silent_at'), null, 'the server answered in the end');
  });

  test('a server that refuses clears the note too', async function(assert) {
    this.route.persistence.set('online', true);
    this.route.appState.set('device_copy_server_silent_at', Date.now() - 1000);
    this.server = function() { return RSVP.reject({fakeXHR: {status: 404}}); };
    await assert.rejects(this.route.model({user_id: 'lingolinq'}, to_board('crisis')));
    assert.strictEqual(this.route.appState.get('device_copy_server_silent_at'), null);
  });

  test('online with no copy: the normal request still runs after the bounded one', async function(assert) {
    this.route.persistence.set('online', true);
    await assert.rejects(this.route.model({user_id: 'lingolinq'}, to_board('crisis')));
    assert.strictEqual(this.queries.length, 2);
    assert.strictEqual(this.queries[1].one_try, undefined);
  });

  test('a refusal from the server stays a refusal', async function(assert) {
    this.route.persistence.set('online', true);
    this.device.board['lingolinq/crisis'] = {id: '1_9', key: 'lingolinq/crisis'};
    this.server = function() { return RSVP.reject(missing); };
    await assert.rejects(this.route.model({user_id: 'lingolinq'}, to_board('crisis')));
    assert.strictEqual(this.queries.length, 1);
  });

  test('a healthy server answers as before', async function(assert) {
    this.route.persistence.set('online', true);
    var user = EmberObject.create({user_name: 'lingolinq', really_fresh: true});
    this.server = function() { return RSVP.resolve(user); };
    assert.strictEqual(await this.route.model({user_id: 'lingolinq'}, to_board('crisis')), user);
    assert.notOk(this.route.get('owner_stand_in'));
  });

  test('a stuck device read does not hold the page', async function(assert) {
    this.route.offline_session_wait_ms = 5;
    this.route.persistence.find = function() { return new RSVP.Promise(function() { }); };
    await assert.rejects(this.route.model({user_id: 'lingolinq'}, to_board('crisis')));
  });
});

module('Unit | Utility | board_owner', function() {
  test('is_board_page names only the two board routes', function(assert) {
    assert.expect(8);
    ['user.board-detail', 'user.board-detail.index', 'user.board-detail.edit', 'user.board-alt.index'].forEach(function(name) {
      assert.true(is_board_page(name), name);
    });
    ['user.boards', 'user.index', 'user', null].forEach(function(name) {
      assert.false(is_board_page(name), String(name));
    });
  });

  test('board_target finds the board name on the parent route', function(assert) {
    assert.strictEqual(board_target(to_board('crisis')), 'crisis');
    assert.strictEqual(board_target({to: {name: 'user.boards', params: {}}}), null);
    assert.strictEqual(board_target(null), null);
  });

  test('no_connection: only when nothing answered', function(assert) {
    assert.true(no_connection(no_answer));
    assert.true(no_connection({short_circuit: true}));
    assert.false(no_connection({fakeXHR: {status: 503}}));
    assert.false(no_connection(missing));
  });

  test('no_server_answer: no answer and server errors, not refusals', function(assert) {
    assert.true(no_server_answer(no_answer));
    assert.true(no_server_answer({fakeXHR: {status: 503}}));
    assert.true(no_server_answer({_result: {fakeXHR: {status: 0}}}), 'as the store wraps it');
    assert.true(no_server_answer({short_circuit: true}));
    assert.false(no_server_answer(missing));
    assert.false(no_server_answer({fakeXHR: {status: 400}}));
    assert.false(no_server_answer(null));
  });
});
