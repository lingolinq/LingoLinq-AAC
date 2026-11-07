import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import { setupTest } from '../../helpers';
import { board_target, is_board_page, no_server_answer, owner_stand_in } from 'frontend/utils/board_owner';

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
    }).create({online: false});
    this.route.session = EmberObject.create({access_token: 'tok', user_name: 'me', user_id: '1_1'});
    this.route.appState = EmberObject.create({currentUser: null, session_user_promise: null});
    this.route.offline_shell_on = function() { return false; };
    this.pushed = [];
    this.route.store = {
      peekAll: function() { return _this.loaded || []; },
      normalize: function(type, raw) { return raw; },
      push: function(raw) { _this.pushed.push(raw); return EmberObject.create(raw); },
      queryRecord: function(type, query) { _this.queries.push(query); return _this.server(query); }
    };
  });

  test('offline: a synced board under an owner the device never saved gets a stand-in', async function(assert) {
    this.device.board['lingolinq/crisis'] = {id: '1_9', key: 'lingolinq/crisis'};
    var owner = await this.route.model({user_id: 'lingolinq'}, to_board('crisis'));
    assert.strictEqual(owner.get('user_name'), 'lingolinq');
    assert.true(owner.get('board_owner_stand_in'));
    assert.true(this.route.get('owner_stand_in'));
    assert.deepEqual(this.queries, [], 'no request while offline');
  });

  test('a stand-in holds nothing but the name, and survives the setup of the page that replaces it', async function(assert) {
    var owner = owner_stand_in('lingolinq');
    assert.deepEqual(owner.get('preferences'), {});
    assert.notOk(owner.get('id'));
    assert.strictEqual(await owner.reload(), owner);
  });

  test('a real stored record comes first, so speak-as keeps the supervisee\'s preferences', async function(assert) {
    this.device.user.kid = {id: '1_4', user_name: 'kid', preferences: {skin: 'dark'}};
    this.device.board['kid/home'] = {id: '1_9', key: 'kid/home'};
    var owner = await this.route.model({user_id: 'kid'}, to_board('home'));
    assert.strictEqual(owner.get('id'), '1_4');
    assert.notOk(owner.get('board_owner_stand_in'));
    assert.notOk(this.route.get('owner_stand_in'));
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
