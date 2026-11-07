import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import RSVP from 'rsvp';
import { settled } from '@ember/test-helpers';
import { setupTest } from '../../helpers';
import LingoLinq from 'frontend/app';
import modal from 'frontend/utils/modal';
import boardDetailCache from 'frontend/utils/board_detail_cache';
import boardRevocation from 'frontend/utils/board_revocation';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';
import { DEVICE_COPY_WAIT_MS, DEVICE_READ_WAIT_MS } from 'frontend/utils/board_device_copy';

/* The Modern board page is network first with a timeout, then the device copy (#1213). These run
 * routes/user/board-detail.js#model with the real Ember Data store; only the network and the device
 * read are stubbed, and the device read answers by key only, as the route has no id at this point. */
var denied = {fakeXHR: {status: 400, responseJSON: {error: 'Not authorized', unauthorized: true, permission: 'view', status: 400}}, message: 'error', result: 'Not authorized'};
var missing = {fakeXHR: {status: 404, responseJSON: {error: 'Record not found', status: 404}}};
var no_answer = {fakeXHR: {status: 0}, message: 'error', result: ''};
var server_error = {fakeXHR: {status: 503}};
var offline = {offline: true, error: 'not online', short_circuit: true};

function row(extra) {
  return Object.assign({
    id: '1_7', key: 'me/board', name: 'Stored', updated: '2026-11-01T00:00:00Z',
    grid: {rows: 1, columns: 1, order: [[1]]},
    buttons: [{id: 1, label: 'want'}]
  }, extra);
}

function server_board(extra) {
  return {root: {board: row(extra)}};
}

function wait(ms) {
  return new RSVP.Promise(function(res) { setTimeout(res, ms); });
}

function deferred() {
  var out = {};
  out.promise = new RSVP.Promise(function(res, rej) { out.resolve = res; out.reject = rej; });
  return out;
}

module('Unit | Route | user/board-detail device copy', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    var _this = this;
    this.device = {'me/board': row()};
    this.answers = [];
    this.requests = [];
    this.db_is_current = true;
    this.realSession = LingoLinq.session;
    LingoLinq.session = EmberObject.create({access_token: 'tok', as_user_id: null});
    this.owner.unregister('service:app-state');
    this.owner.register('service:app-state', Service.extend({
      sessionUser: null, speak_mode: false,
      hide_loading_overlay: function() { }
    }));
    this.appState = this.owner.lookup('service:app-state');
    this.appState.set('sessionUser', EmberObject.create({user_name: 'me', supervisees: [], preferences: {device: {long_token: true}}}));
    this.owner.unregister('service:stashes');
    this.owner.register('service:stashes', Service.extend({
      get: function() { return null; }, set: function() { }, persist: function() { }
    }));
    this.owner.unregister('service:session');
    this.owner.register('service:session', Service.extend({
      access_token: 'tok',
      dead_session_response: function(xhr) { return !!(xhr && xhr.status == 400 && xhr.responseJSON && xhr.responseJSON.invalid_token); }
    }));
    // A stand-in service: the real one reacts to `online` changes with work that outlives the test.
    // It is also put on window.persistence, which is where utils/persistence.js (a proxy) looks.
    this.owner.unregister('service:persistence');
    this.owner.register('service:persistence', Service.extend({
      online: true,
      local_db_is_current_user: function() { return _this.db_is_current; },
      ajax: function(url, options) {
        _this.requests.push({url: url, options: Object.assign({}, options)});
        var next = _this.answers.length > 1 ? _this.answers.shift() : _this.answers[0];
        return (next && (next.root || next.board || next.text)) ? RSVP.resolve(next) : RSVP.reject(next);
      },
      find: function(store, key) {
        var found = store === 'board' && _this.device[key];
        return found ? RSVP.resolve(JSON.parse(JSON.stringify(found))) : RSVP.reject({error: 'record not found'});
      }
    }));
    this.persistenceService = this.owner.lookup('service:persistence');
    this.realPersistence = window.persistence;
    window.persistence = this.persistenceService;
    boardDetailCache.clear();
    this.route = this.owner.lookup('route:user/board-detail');
    this.route.modelFor = function() { return EmberObject.create({user_name: 'me'}); };
    // A plain stand-in: nothing here needs the real page.
    var controller = EmberObject.create();
    this.controller = controller;
    this.route.controllerFor = function() { return controller; };
  });

  hooks.afterEach(function() {
    restoreStubs();
    boardDetailCache.clear();
    LingoLinq.session = this.realSession;
    window.persistence = this.realPersistence;
  });

  function open(context, boardname) {
    return context.route.model({boardname: boardname || 'board'});
  }

  function urls(context) {
    return context.requests.map(function(r) { return r.url.replace('/api/v1/boards/me/board', '') || 'show'; });
  }

  function assert_device_copy(assert, context, model, label) {
    assert.strictEqual(model.get('key'), 'me/board', label + ': the record');
    assert.strictEqual(context.route.get('_raw_board_data.buttons.0.label'), 'want', label + ': the grid source');
    assert.true(context.controller.get('served_from_device'), label + ': marked as a device copy');
    assert.notOk(boardDetailCache.get('me/board'), label + ': never entered as a fresh cache entry');
  }

  test('offline: opens a synced board that is not in memory, with no retries', async function(assert) {
    assert.expect(5);
    this.persistenceService.set('online', false);
    this.answers = [offline];
    assert_device_copy(assert, this, await open(this), 'offline');
    assert.deepEqual(urls(this), ['/tree?root_only=1']);
  });

  test('no answer: the first request is one bounded try, then the copy', async function(assert) {
    assert.expect(7);
    this.answers = [no_answer];
    assert_device_copy(assert, this, await open(this), 'status 0');
    assert.strictEqual(this.requests.length, 1, 'nothing else is in flight');
    assert.strictEqual(this.requests[0].options.timeout, DEVICE_COPY_WAIT_MS);
    assert.strictEqual(this.requests[0].options.attempt, 3, 'utils/extras.js does not retry past attempt 2');
  });

  test('no answer and no copy: the usual patience, then the error page', async function(assert) {
    this.device = {};
    this.answers = [no_answer];
    assert.true((await open(this)).error);
    assert.deepEqual(urls(this), ['/tree?root_only=1', '/tree?root_only=1', 'show', 'show']);
    assert.strictEqual(this.requests[1].options.attempt, 2, 'the second try has the normal retries');
    assert.strictEqual(this.requests[1].options.timeout, undefined);
    assert.strictEqual(this.requests[2].options.timeout, undefined);
  });

  test('no copy: a board that answers on the second try opens normally', async function(assert) {
    this.device = {};
    this.answers = [no_answer, server_board({name: 'Fresh'})];
    assert.strictEqual((await open(this)).get('name'), 'Fresh');
    assert.false(this.controller.get('served_from_device'));
  });

  test('an outage: the show request is bounded too, then the copy', async function(assert) {
    assert.expect(6);
    this.answers = [server_error];
    assert_device_copy(assert, this, await open(this), '503');
    assert.deepEqual(urls(this), ['/tree?root_only=1', 'show']);
    assert.strictEqual(this.requests[1].options.timeout, DEVICE_COPY_WAIT_MS);
  });

  test('a 5xx then a hang is bounded the same way', async function(assert) {
    assert.expect(5);
    this.answers = [server_error, no_answer];
    assert_device_copy(assert, this, await open(this), '503 then no answer');
    assert.strictEqual(this.requests.length, 2);
  });

  test('an outage with no copy keeps the one retry', async function(assert) {
    this.device = {};
    this.answers = [server_error];
    assert.true((await open(this)).error);
    assert.deepEqual(urls(this), ['/tree?root_only=1', 'show', 'show']);
  });

  test('not on the device: the error state, offline and online', async function(assert) {
    this.device = {};
    this.persistenceService.set('online', false);
    this.answers = [offline];
    assert.deepEqual(await open(this), {error: true, boardname: 'board'}, 'offline');
    this.persistenceService.set('online', true);
    this.answers = [no_answer];
    assert.deepEqual(await open(this), {error: true, boardname: 'board'}, 'online');
  });

  test('a row that cannot render counts as not on the device', async function(assert) {
    this.device = {'me/board': {id: '1_7', key: 'me/board'}};
    this.answers = [no_answer];
    assert.true((await open(this)).error);
  });

  test('a real denial or a 404 keeps the error page, even if a later attempt had no answer', async function(assert) {
    this.answers = [denied];
    assert.true((await open(this)).error, 'denied');
    this.answers = [missing, no_answer];
    assert.true((await open(this)).error, 'missing, then no answer');
  });

  test('a denial sticks until the server answers, also with no copy on the device', async function(assert) {
    this.device = {};
    this.answers = [denied];
    await open(this);
    this.device = {'me/board': row()};
    this.answers = [no_answer];
    assert.true((await open(this)).error, 'Try Again with no connection does not open the copy');
    this.answers = [server_board()];
    assert.strictEqual((await open(this)).get('key'), 'me/board', 'the server answered');
    this.answers = [no_answer];
    assert.notOk((await open(this)).error, 'and copies work again');
  });

  test('a denial is forgotten at a new sign-in', async function(assert) {
    this.answers = [denied];
    await open(this);
    this.owner.lookup('service:session').set('access_token', 'new');
    this.answers = [no_answer];
    assert.notOk((await open(this)).error);
  });

  test('a denial drops the memory cache, so a cache hit cannot bring the board back', async function(assert) {
    var refreshes = 0;
    this.route.refresh = function() { refreshes++; };
    boardDetailCache.set(row());
    this.route.device_copy_fetch_failed('me/board', denied);
    assert.strictEqual(boardDetailCache.peek('me/board'), null);
    assert.strictEqual(refreshes, 1, 'and the page goes back through model()');
    this.route.device_copy_fetch_failed('me/other', no_answer);
    assert.strictEqual(refreshes, 1, 'a failure that is not a refusal leaves the copy');
  });

  test('on a cold start, a denial waits for the session user before it is judged', async function(assert) {
    var user = this.appState.get('sessionUser');
    var loading = deferred();
    this.appState.setProperties({sessionUser: null, session_user_promise: loading.promise});
    var _this = this;
    this.answers = [denied];
    var opened = open(this);
    await wait(5);
    _this.appState.set('sessionUser', user);
    loading.resolve(user);
    assert.true((await opened).error, 'the copy does not open');
  });

  test('a 404 is not remembered before the session user is known, so a home board keeps its copy', async function(assert) {
    var user = this.appState.get('sessionUser');
    user.set('preferences.home_board', {id: '1_7', key: 'me/board'});
    this.appState.set('sessionUser', null);
    this.route.session_wait = 1;
    this.route.denial_session_wait = 1;
    this.answers = [missing];
    await open(this);
    this.appState.set('sessionUser', user);
    assert.notOk((await open(this)).error, 'Try Again with the user loaded opens the copy');
  });

  test('a home board keeps its copy even if a refusal was remembered first', async function(assert) {
    this.answers = [denied];
    await open(this);
    this.appState.set('sessionUser.preferences.home_board', {id: '1_7', key: 'me/board'});
    this.answers = [no_answer];
    assert.notOk((await open(this)).error);
  });

  test('after a server refusal, the session user gets longer to arrive', async function(assert) {
    var user = this.appState.get('sessionUser');
    var loading = deferred();
    this.appState.setProperties({sessionUser: null, session_user_promise: loading.promise});
    this.route.session_wait = 1;
    this.route.denial_session_wait = 2000;
    this.answers = [denied];
    var opened = open(this);
    await wait(40);
    this.appState.set('sessionUser', user);
    loading.resolve(user);
    assert.true((await opened).error, 'a slow sign-in does not open a denied board');
  });

  test('a failure inside the copy lookup moves on to the normal requests, never a hang', async function(assert) {
    var calls = 0;
    this.route._checked_copy = function() { calls++; throw new Error('lookup failed'); };
    this.answers = [no_answer, server_board({name: 'Fresh'})];
    assert.strictEqual((await open(this)).get('name'), 'Fresh');
    assert.ok(calls > 0);
  });

  test('a read that timed out is tried again before the error page', async function(assert) {
    var first = true;
    var _this = this;
    stub(this.persistenceService, 'find', function() {
      if(first) { first = false; return new RSVP.Promise(function() { }); }
      return RSVP.resolve(JSON.parse(JSON.stringify(_this.device['me/board'])));
    });
    this.route.device_read_wait = 5;
    this.answers = [no_answer];
    var model = await open(this);
    assert.strictEqual(model.get('key'), 'me/board', 'the row was there all along');
    assert.true(this.controller.get('served_from_device'));
  });

  test('a home board held by id keeps its copy after a refusal', async function(assert) {
    this.appState.set('sessionUser.preferences.home_board', {id: '1_7'});
    this.answers = [no_answer];
    await open(this);
    this.answers = [denied];
    assert.notOk((await open(this)).error);
  });

  test('a device copy never fills the cached grid; a normal board does', function(assert) {
    var stored = [];
    stub(boardDetailCache, 'set_ordered_buttons', function() { stored.push(true); });
    var controller = this.owner.lookup('controller:user/board-detail');
    controller._apply_shift_to_ordered_buttons = function() { };
    controller.set('model', EmberObject.create({key: 'me/board'}));
    controller.set('served_from_device', true);
    var no_grid = row({grid: null});
    controller._build_from_raw(no_grid);
    assert.deepEqual(stored, [], 'device copy');
    controller.set('served_from_device', false);
    controller._build_from_raw(no_grid);
    assert.ok(stored.length > 0);
  });

  test('a real denial wins in Speak Mode too, which Modern turns on for everyone', async function(assert) {
    this.appState.set('speak_mode', true);
    this.answers = [denied];
    assert.true((await open(this)).error);
  });

  test('a home or sidebar board keeps its copy after a denial', async function(assert) {
    assert.expect(8);
    this.answers = [denied];
    this.appState.set('sessionUser.preferences.home_board', {id: '1_7', key: 'me/board'});
    assert_device_copy(assert, this, await open(this), 'home');
    this.appState.set('sessionUser.preferences.home_board', null);
    this.appState.set('sessionUser.preferences.sidebar_boards', [{key: 'me/board'}]);
    assert_device_copy(assert, this, await open(this), 'sidebar');
  });

  test('the revocation gate counts a server that never answered as offline', async function(assert) {
    var seen = [];
    stub(boardRevocation, 'blocks_view_route', function(record, state, online, options) {
      seen.push([online, options && options.ignore_speak_mode, record.get('id')]);
      return RSVP.resolve(true);
    });
    this.answers = [no_answer];
    assert.true((await open(this)).error, 'a marked copy is blocked');
    assert.deepEqual(seen[0], [false, true, '1_7']);
  });

  test('a record already in memory is not overwritten by an older row', async function(assert) {
    var store = this.owner.lookup('service:store');
    var loaded = store.push(store.normalize('board', row({name: 'In memory', updated: '2026-11-03T00:00:00Z'})));
    this.answers = [no_answer];
    var model = await open(this);
    assert.strictEqual(model, loaded);
    assert.strictEqual(model.get('name'), 'In memory');
  });

  test('an expired in-memory copy still opens, and wins over an older row', async function(assert) {
    stub(boardDetailCache, 'peek', function() { return row({name: 'Session copy', updated: '2026-11-03T00:00:00Z'}); });
    this.answers = [no_answer];
    await open(this);
    assert.strictEqual(this.route.get('_raw_board_data.name'), 'Session copy');
    this.device = {};
    await open(this);
    assert.strictEqual(this.route.get('_raw_board_data.name'), 'Session copy', 'not on the device at all');
  });

  test('a row the store cannot take gives the error state, not a hang', async function(assert) {
    var store = this.owner.lookup('service:store');
    stub(store, 'push', function() { throw new Error('bad row'); });
    this.answers = [no_answer];
    assert.true((await open(this)).error);
  });

  test('a normal online load is not marked as a device copy', async function(assert) {
    this.answers = [server_board({name: 'Fresh'})];
    var model = await open(this);
    assert.strictEqual(model.get('name'), 'Fresh');
    assert.false(this.controller.get('served_from_device'));
    assert.strictEqual(urls(this)[0], '/tree?root_only=1');
    assert.strictEqual(this.requests[0].options.timeout, DEVICE_COPY_WAIT_MS);
  });

  test('two overlapping navigations: an abandoned board cannot paint over the next one', async function(assert) {
    this.device = {'me/a': row({id: '1_8', key: 'me/a', buttons: [{id: 1, label: 'from A'}]})};
    var slow = deferred();
    this.route.set('_raw_board_data', null);
    stub(this.persistenceService, 'ajax', function() { return slow.promise; });
    open(this, 'a');
    stub(this.persistenceService, 'ajax', function() { return RSVP.resolve(server_board({id: '1_9', key: 'me/b', buttons: [{id: 1, label: 'server B'}]})); });
    await open(this, 'b');
    slow.reject(no_answer);
    await wait(5);
    assert.strictEqual(this.route.get('_raw_board_data.buttons.0.label'), 'server B', 'the grid source is the board on screen');
    assert.false(this.controller.get('served_from_device'));
  });

  test('an abandoned server answer does not replace the current board', async function(assert) {
    var first = deferred();
    stub(this.persistenceService, 'ajax', function() { return first.promise; });
    open(this, 'a');
    stub(this.persistenceService, 'ajax', function() { return RSVP.resolve(server_board({key: 'me/b', id: '1_9', buttons: [{id: 1, label: 'B'}]})); });
    await open(this, 'b');
    first.resolve(server_board({key: 'me/a', id: '1_8', buttons: [{id: 1, label: 'A'}]}));
    await wait(0);
    assert.strictEqual(this.route.get('_raw_board_data.buttons.0.label'), 'B');
  });

  test('the flag clears on the next normal load and on leaving', async function(assert) {
    this.answers = [no_answer];
    await open(this);
    assert.true(this.controller.get('served_from_device'));
    this.answers = [server_board()];
    await open(this);
    assert.false(this.controller.get('served_from_device'), 'next load');
    this.controller.set('served_from_device', true);
    this.route.resetController(this.controller, true);
    assert.false(this.controller.get('served_from_device'), 'on exit');
  });

  test('the loading page exits this route mid-navigation, and the board still arrives', async function(assert) {
    var slow = deferred();
    stub(this.persistenceService, 'ajax', function() { return slow.promise; });
    var opened = open(this);
    this.route.resetController(this.controller, true);
    slow.resolve(server_board({name: 'Fresh'}));
    await opened;
    assert.strictEqual(this.route.get('_raw_board_data.name'), 'Fresh', 'a server answer');
    slow = deferred();
    stub(this.persistenceService, 'ajax', function() { return slow.promise; });
    this.route.set('_raw_board_data', null);
    boardDetailCache.clear();
    opened = open(this);
    this.route.resetController(this.controller, true);
    slow.reject(no_answer);
    assert.strictEqual((await opened).get('key'), 'me/board', 'a device copy');
    assert.true(this.controller.get('served_from_device'));
  });

  test('the flag stays on the board on screen until the next one has loaded', async function(assert) {
    this.answers = [no_answer];
    await open(this);
    var slow = deferred();
    stub(this.persistenceService, 'ajax', function() { return slow.promise; });
    var next = open(this, 'a');
    await wait(0);
    assert.true(this.controller.get('served_from_device'), 'still a copy on screen, so still read-only');
    slow.resolve(server_board({key: 'me/a', id: '1_8'}));
    await next;
    assert.false(this.controller.get('served_from_device'));
  });

  test('offline with nothing to show goes to the boards page; a refusal keeps its error page', async function(assert) {
    var moved = [];
    this.route.set('router', {replaceWith: function() { moved.push(Array.prototype.slice.call(arguments)); }});
    this.owner.lookup('service:session').set('user_name', 'me');
    stub(modal, 'warning', function() { });
    this.persistenceService.set('online', false);
    this.device = {};
    this.answers = [offline];
    this.route.afterModel(await open(this));
    assert.deepEqual(moved, [['user.boards', 'me']]);
    moved.length = 0;
    this.answers = [denied];
    this.route.afterModel(await open(this));
    assert.deepEqual(moved, [], 'refused');
  });

  test('with no file storage, a device copy loads its own pictures before the grid is built', async function(assert) {
    var urls = [];
    this.device = {'me/board': row({image_urls: {a: 'https://x/a.png'}, images: [{id: '1_9', url: 'https://x/b.png'}]})};
    this.persistenceService.setProperties({local_system: {available: false}, url_uncache: {'https://x/a.png': true}});
    this.persistenceService.find_url = function(url) {
      urls.push(url);
      return url.match(/a\.png/) ? RSVP.resolve('data:image/png;base64,AAAA') : RSVP.reject({error: 'not saved'});
    };
    this.answers = [no_answer];
    await open(this);
    assert.deepEqual(urls.sort(), ['https://x/a.png', 'https://x/b.png']);
    assert.strictEqual(this.persistenceService.url_cache['https://x/a.png'], 'data:image/png;base64,AAAA');
    assert.false(this.persistenceService.url_uncache['https://x/a.png'], 'the grid would skip it otherwise');
    assert.notOk(this.persistenceService.url_cache['https://x/b.png'], 'a picture that was never saved is left alone');
  });

  test('with file storage, nothing extra is read', async function(assert) {
    var reads = 0;
    this.device = {'me/board': row({image_urls: {a: 'https://x/a.png'}})};
    this.persistenceService.set('local_system', {available: true});
    this.persistenceService.find_url = function() { reads++; return RSVP.resolve('x'); };
    this.answers = [no_answer];
    await open(this);
    assert.strictEqual(reads, 0);
  });

  test('a picture read that sticks does not hold the board back', async function(assert) {
    this.device = {'me/board': row({image_urls: {a: 'https://x/a.png'}})};
    this.persistenceService.set('local_system', {available: false});
    this.persistenceService.find_url = function() { return new RSVP.Promise(function() { }); };
    this.route.device_read_wait = 5;
    this.answers = [no_answer];
    assert.strictEqual((await open(this)).get('key'), 'me/board');
  });

  test('the waits are the ones the design promises', function(assert) {
    assert.strictEqual(DEVICE_COPY_WAIT_MS, 8000, 'the normal first GET limit (utils/extras.js)');
    assert.strictEqual(DEVICE_READ_WAIT_MS, 5000);
    assert.strictEqual(this.route.device_copy_wait, DEVICE_COPY_WAIT_MS);
    assert.strictEqual(this.route.device_read_wait, DEVICE_READ_WAIT_MS);
  });

  test('a stuck device read gives up, and when it lands much later it changes nothing', async function(assert) {
    var read = deferred();
    stub(this.persistenceService, 'find', function() { return read.promise; });
    this.route.device_read_wait = 5;
    this.answers = [no_answer, server_board({name: 'Fresh'})];
    var record = await open(this);
    assert.strictEqual(record.get('name'), 'Fresh', 'the server answered, and the page opened');
    read.resolve(row());
    await wait(5);
    assert.false(this.controller.get('served_from_device'));
    assert.strictEqual(this.route.get('_raw_board_data.name'), 'Fresh');
  });

  test('a stuck device read still reaches the error page', async function(assert) {
    stub(this.persistenceService, 'find', function() { return new RSVP.Promise(function() { }); });
    this.route.device_read_wait = 5;
    this.answers = [server_error];
    assert.true((await open(this)).error);
  });

  test('no device read when signed out, or when the open database is another user\'s', async function(assert) {
    var reads = 0;
    stub(this.persistenceService, 'find', function() { reads++; return RSVP.reject({error: 'none'}); });
    stub(boardDetailCache, 'peek', function() { return row(); });
    this.answers = [no_answer];
    var session = this.owner.lookup('service:session');
    session.set('access_token', null);
    assert.true((await open(this)).error, 'signed out, including after a forced logout left empty auth settings');
    session.set('access_token', 'tok');
    this.db_is_current = false;
    assert.true((await open(this)).error, 'another user\'s database');
    assert.strictEqual(reads, 0);
  });

  test('after the server ends a session, only a trusted device keeps the copy', async function(assert) {
    assert.expect(10);
    var dead = {fakeXHR: {status: 400, responseJSON: {error: 'Not authorized', invalid_token: true, status: 400}}};
    this.answers = [dead];
    assert_device_copy(assert, this, await open(this), 'trusted');
    this.appState.set('sessionUser.preferences.device.long_token', false);
    assert.true((await open(this)).error, 'shared');
    this.answers = [no_answer];
    assert.true((await open(this)).error, 'shared, on the next navigation with no server answer');
    this.owner.lookup('service:session').set('access_token', 'new');
    this.appState.set('sessionUser.preferences.device.long_token', true);
    assert_device_copy(assert, this, await open(this), 'a new sign-in');
  });

  test('a dead session is noticed on a board with no copy, and from the session itself', async function(assert) {
    var dead = {fakeXHR: {status: 400, responseJSON: {error: 'Not authorized', invalid_token: true, status: 400}}};
    this.appState.set('sessionUser.preferences.device.long_token', false);
    this.device = {'me/board': row()};
    this.answers = [dead];
    await open(this, 'not-saved');
    this.answers = [no_answer];
    assert.true((await open(this)).error, 'the next board, which is saved, stays refused');
    this.owner.lookup('service:session').setProperties({access_token: 'other', invalid_token: true});
    assert.true((await open(this)).error, 'sync\'s token check counts too');
  });

  test('a 200 that is not a board (a school filter page) counts as no answer', async function(assert) {
    assert.expect(4);
    this.answers = [{text: '<html>Blocked</html>', meta: {}}];
    assert_device_copy(assert, this, await open(this), 'block page');
  });

  test('a device copy is not warmed or prefetched; a normal board is', async function(assert) {
    var warmed = [];
    stub(boardDetailCache, 'warm_images', function() { warmed.push('warm'); });
    stub(boardDetailCache, 'prefetch_linked', function() { warmed.push('prefetch'); });
    var controller = EmberObject.extend({ _build_from_raw: function() { } }).create();
    controller.set('served_from_device', true);
    this.route._finalize_board_display(controller, row());
    await settled();
    assert.deepEqual(warmed, [], 'device copy');
    controller.set('served_from_device', false);
    this.route._finalize_board_display(controller, row());
    await settled();
    assert.deepEqual(warmed, ['warm', 'prefetch']);
  });

  test('the edit route sends a device copy back to the board, and leaves a normal board alone', function(assert) {
    var edit = this.owner.lookup('route:user/board-detail/edit');
    var moved = [];
    var blocked = 0;
    var parent = EmberObject.extend({ _blocked_on_device_copy: function() { blocked++; return true; } })
      .create({served_from_device: true, user: {user_name: 'me'}, boardname: 'board'});
    edit.controllerFor = function() { return parent; };
    edit.set('router', {transitionTo: function() { moved.push(Array.prototype.slice.call(arguments)); }});
    edit.setupController(EmberObject.create(), EmberObject.create({key: 'me/board'}));
    assert.deepEqual(moved, [['user.board-detail', 'me', 'board']]);
    assert.strictEqual(blocked, 1);
    assert.notOk(parent.get('grid_loading'), 'stopped before the edit setup');
  });
});

module('Unit | Controller | user/board-detail on a device copy', function(hooks) {
  setupTest(hooks);

  hooks.afterEach(function() {
    restoreStubs();
  });

  test('every action that writes or copies the board is refused; on a normal board they open', function(assert) {
    var opened = [];
    var warned = [];
    stub(modal, 'open', function(name) { opened.push(name); return RSVP.resolve(); });
    stub(modal, 'warning', function(text) { warned.push(text); });
    var controller = this.owner.lookup('controller:user/board-detail');
    controller.set('model', EmberObject.create({key: 'me/board'}));
    controller.set('served_from_device', true);
    controller.set('show_options_menu', true);
    var actions = ['share_board', 'open_board_privacy', 'translate_board', 'make_a_copy', 'enter_edit_mode', 'set_as_home'];
    actions.forEach(function(action) { controller.send(action); });
    assert.deepEqual(opened, []);
    assert.strictEqual(warned.length, actions.length);
    assert.false(controller.get('show_options_menu'), 'the menu closes, so the message can be read');
    controller.set('served_from_device', false);
    controller.send('open_board_privacy');
    controller.send('translate_board');
    controller.send('set_as_home');
    assert.deepEqual(opened, ['modals/board-privacy', 'translation-select', 'set-as-home']);
  });

  test('the languages modal is told, so its Translate button can refuse', function(assert) {
    var opts = [];
    stub(modal, 'open', function(name, options) { opts.push(options); return RSVP.resolve(); });
    var controller = this.owner.lookup('controller:user/board-detail');
    controller.set('model', EmberObject.create({key: 'me/board'}));
    controller.set('served_from_device', true);
    controller.send('switch_languages');
    assert.true(opts[0].device_copy);
  });

  test('the languages modal\'s Translate button refuses on a device copy', function(assert) {
    var opened = [];
    var warned = [];
    stub(modal, 'open', function(name) { opened.push(name); return RSVP.resolve(); });
    stub(modal, 'warning', function(text) { warned.push(text); });
    var board = EmberObject.create({key: 'me/board'});
    var languages = this.owner.factoryFor('component:switch-languages').create();
    languages.set('model', {board: board, device_copy: true});
    languages.send('open_translate');
    assert.deepEqual(opened, []);
    assert.strictEqual(warned.length, 1);
    languages.set('model', {board: board, device_copy: false});
    languages.send('open_translate');
    assert.deepEqual(opened, ['translation-select']);
  });

  test('the trial bar refuses Use on a device copy', async function(assert) {
    var warned = [];
    stub(modal, 'warning', function(text) { warned.push(text); });
    var bar = this.owner.factoryFor('component:trial-bar').create({deviceCopy: true});
    await bar._performUse();
    assert.strictEqual(warned.length, 1);
    assert.notOk(bar.get('busy'), 'stopped before the home board changes');
  });

  module('with a connection', function(hooks) {
    hooks.beforeEach(function() {
      var _this = this;
      this.pushed = [];
      this.failed = [];
      this.realPersistence = window.persistence;
      this.realStore = LingoLinq.store;
      this.server = deferred();
      window.persistence = EmberObject.create({online: true, ajax: function() { return _this.server.promise; }});
      LingoLinq.store = { normalize: function(type, raw) { return raw; }, push: function(raw) { _this.pushed.push(raw); } };
      stub(modal, 'warning', function() { });
      this.built = [];
      this.route = this.owner.lookup('route:user/board-detail');
      this.route.device_copy_fetch_failed = function(key, err) { _this.failed.push([key, err]); };
      this.controller = this.owner.lookup('controller:user/board-detail');
      this.controller._build_from_raw = function(raw) { _this.built.push(raw); };
      this.controller.set('model', EmberObject.create({key: 'me/board'}));
      this.controller.set('served_from_device', true);
    });
    hooks.afterEach(function() {
      window.persistence = this.realPersistence;
      LingoLinq.store = this.realStore;
      boardDetailCache.clear();
    });

    test('Edit fetches the board and rebuilds the grid, so the next tap edits the server copy', async function(assert) {
      this.controller.send('enter_edit_mode');
      assert.true(this.controller.get('served_from_device'), 'still a copy until the server answers');
      this.server.resolve({board: row({name: 'Fresh'})});
      await wait(0);
      assert.false(this.controller.get('served_from_device'));
      assert.strictEqual(this.built.length, 1, 'the grid was rebuilt, not just the flag cleared');
      assert.strictEqual(this.built[0].name, 'Fresh');
      assert.strictEqual(this.pushed[0].name, 'Fresh', 'the record is the server copy');
      assert.strictEqual(this.route.get('_raw_board_data.name'), 'Fresh', 'a pending setup will not rebuild the old copy');
      assert.strictEqual(boardDetailCache.get('me/board').name, 'Fresh');
      assert.true(boardDetailCache.is_root_only('me/board'), 'a show answer has no descendants yet');
    });

    test('Edit keeps the copy read-only when the server does not give a board', async function(assert) {
      this.controller.send('enter_edit_mode');
      this.server.resolve({text: '<html>Blocked</html>'});
      await wait(0);
      assert.true(this.controller.get('served_from_device'));
      assert.deepEqual(this.built, []);
    });

    test('a failure on that fetch goes to the route, which decides if it is a refusal', async function(assert) {
      this.controller.send('enter_edit_mode');
      this.server.reject(denied);
      await wait(0);
      assert.deepEqual(this.failed, [['me/board', denied]]);
      assert.true(this.controller.get('served_from_device'));
    });

    test('an answer for a board no longer on screen changes nothing', async function(assert) {
      this.controller.send('enter_edit_mode');
      this.controller.set('model', EmberObject.create({key: 'me/other'}));
      this.server.resolve({board: row()});
      await wait(0);
      assert.deepEqual(this.built, []);
    });
  });
});
