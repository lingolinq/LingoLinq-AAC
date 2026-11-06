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
import { refuse_device_copy } from 'frontend/routes/user/board-detail/edit';

/* The Modern board page shows a synced board from the device when the server gives no usable
 * answer (#1213). These run routes/user/board-detail.js#model with the real Ember Data store; only
 * the network and the device read are stubbed, and the device read answers by key only, as
 * the route has no id at this point. */
var denied = {fakeXHR: {status: 400, responseJSON: {error: 'Not authorized', unauthorized: true, permission: 'view', status: 400}}, message: 'error', result: 'Not authorized'};
var missing = {fakeXHR: {status: 404, responseJSON: {error: 'Not found', status: 404}}};
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

function wait(ms) {
  return new RSVP.Promise(function(res) { setTimeout(res, ms); });
}

function deferred() {
  var out = {};
  out.promise = new RSVP.Promise(function(res, rej) { out.resolve = res; out.reject = rej; });
  return out;
}

function assert_device_copy(assert, context, model, label) {
  assert.strictEqual(model.get('key'), 'me/board', label + ': the record');
  assert.strictEqual(context.route.get('_raw_board_data.buttons.0.label'), 'want', label + ': the grid source');
  assert.true(context.controller.get('served_from_device'), label + ': marked as a device copy');
  assert.notOk(boardDetailCache.get('me/board'), label + ': never entered as a fresh cache entry');
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
      ajax: function(url) {
        _this.requests.push(url);
        var next = _this.answers.length > 1 ? _this.answers.shift() : _this.answers[0];
        return next === 'hang' ? new RSVP.Promise(function() { }) : RSVP.reject(next);
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
    // A plain stand-in: the real controller starts timers that would outlive the test.
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

  test('offline: opens a synced board that is not in memory', async function(assert) {
    assert.expect(4);
    this.persistenceService.set('online', false);
    this.answers = [offline];
    assert_device_copy(assert, this, await open(this), 'offline');
  });

  test('online with no route to the server: opens the device copy', async function(assert) {
    assert.expect(4);
    this.answers = [no_answer];
    assert_device_copy(assert, this, await open(this), 'status 0');
  });

  test('a server outage opens the device copy after the retry', async function(assert) {
    assert.expect(5);
    this.answers = [server_error];
    assert_device_copy(assert, this, await open(this), '503');
    assert.strictEqual(this.requests.length, 3, '/tree, show and the one retry');
  });

  test('a network that never answers opens the device copy at the deadline', async function(assert) {
    assert.expect(4);
    this.route.device_copy_wait = 10;
    this.answers = ['hang'];
    assert_device_copy(assert, this, await open(this), 'hanging');
  });

  test('a late server answer does not replace the board on screen, but is cached', async function(assert) {
    this.route.device_copy_wait = 10;
    var finish;
    stub(this.persistenceService, 'ajax', function() { return new RSVP.Promise(function(res) { finish = finish || res; }); });
    await open(this);
    finish({root: {board: row({name: 'Fresh', buttons: [{id: 1, label: 'late'}]})}});
    await new RSVP.Promise(function(res) { setTimeout(res, 0); });
    assert.strictEqual(this.route.get('_raw_board_data.buttons.0.label'), 'want', 'the grid source is unchanged');
    assert.strictEqual(boardDetailCache.get('me/board').name, 'Fresh', 'the next visit gets the server copy');
    assert.strictEqual(this.owner.lookup('service:store').peekRecord('board', '1_7').get('name'), 'Stored', 'and the record on screen is left alone');
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
    this.answers = [denied, no_answer];
    assert.true((await open(this)).error, 'denied, then no answer');
    this.answers = [missing];
    assert.true((await open(this)).error, 'missing');
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
      seen.push([online, options && options.ignore_speak_mode]);
      return RSVP.resolve(true);
    });
    this.answers = [no_answer];
    assert.deepEqual(await open(this), {error: true, boardname: 'board'}, 'a marked copy is blocked');
    assert.deepEqual(seen, [[false, true]]);
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
    stub(this.persistenceService, 'ajax', function() { return RSVP.resolve({root: {board: row({name: 'Fresh'})}}); });
    var model = await open(this);
    assert.strictEqual(model.get('name'), 'Fresh');
    assert.false(this.controller.get('served_from_device'));
  });

  test('two overlapping navigations: an abandoned board cannot paint over the next one', async function(assert) {
    this.route.set('_raw_board_data', null);
    this.device = {'me/a': row({id: '1_8', key: 'me/a', buttons: [{id: 1, label: 'from A'}]}), 'me/b': row({id: '1_9', key: 'me/b', buttons: [{id: 1, label: 'stale B'}]})};
    this.route.device_copy_wait = 5;
    this.answers = ['hang'];
    open(this, 'a');
    this.route.device_copy_wait = 5000;
    var server = deferred();
    stub(this.persistenceService, 'ajax', function() { return server.promise; });
    var b = open(this, 'b');
    await wait(30);
    assert.notOk(this.controller.get('served_from_device'), 'the abandoned deadline changed nothing');
    assert.notOk(this.route.get('_raw_board_data'), 'not even the grid source');
    server.resolve({root: {board: row({id: '1_9', key: 'me/b', buttons: [{id: 1, label: 'server B'}]})}});
    var model = await b;
    assert.strictEqual(model.get('key'), 'me/b');
    assert.strictEqual(this.route.get('_raw_board_data.buttons.0.label'), 'server B', 'the grid source is the board on screen');
    assert.false(this.controller.get('served_from_device'));
  });

  test('an abandoned server answer does not replace the current board', async function(assert) {
    var first = deferred();
    stub(this.persistenceService, 'ajax', function() { return first.promise; });
    open(this, 'a');
    stub(this.persistenceService, 'ajax', function() { return RSVP.resolve({root: {board: row({key: 'me/b', id: '1_9', buttons: [{id: 1, label: 'B'}]})}}); });
    await open(this, 'b');
    first.resolve({root: {board: row({key: 'me/a', id: '1_8', buttons: [{id: 1, label: 'A'}]})}});
    await wait(0);
    assert.strictEqual(this.route.get('_raw_board_data.buttons.0.label'), 'B');
  });

  test('the flag clears on the next normal load and on leaving', async function(assert) {
    this.answers = [no_answer];
    await open(this);
    assert.true(this.controller.get('served_from_device'));
    stub(this.persistenceService, 'ajax', function() { return RSVP.resolve({root: {board: row()}}); });
    await open(this);
    assert.false(this.controller.get('served_from_device'), 'next load');
    this.controller.set('served_from_device', true);
    this.route.resetController(this.controller, true);
    assert.false(this.controller.get('served_from_device'), 'on exit');
  });

  test('the server wins when it answers during the device read', async function(assert) {
    var read = deferred();
    var server = deferred();
    stub(this.persistenceService, 'find', function() { return read.promise; });
    stub(this.persistenceService, 'ajax', function() { return server.promise; });
    this.route.device_copy_wait = 1;
    var model = open(this);
    await wait(10);
    server.resolve({root: {board: row({name: 'Fresh'})}});
    var record = await model;
    read.resolve(row());
    await wait(0);
    assert.strictEqual(record.get('name'), 'Fresh');
    assert.false(this.controller.get('served_from_device'));
    assert.strictEqual(this.route.get('_raw_board_data.name'), 'Fresh', 'the finished read changed nothing');
  });

  test('the waits are the ones the design promises', function(assert) {
    assert.strictEqual(DEVICE_COPY_WAIT_MS, 8000, 'a healthy connection is never cut short before the first request times out');
    assert.strictEqual(DEVICE_READ_WAIT_MS, 5000);
    assert.strictEqual(this.route.device_copy_wait, DEVICE_COPY_WAIT_MS);
  });

  test('the deadline runs even when `online` is false, because ajax can flip it and really send', async function(assert) {
    assert.expect(4);
    this.persistenceService.set('online', false);
    this.route.device_copy_wait = 10;
    this.answers = ['hang'];
    assert_device_copy(assert, this, await open(this), 'hanging');
  });

  test('a refusal after the deadline goes back through model(), then Try Again asks the server', async function(assert) {
    var server = deferred();
    var refreshes = 0;
    this.route.refresh = function() { refreshes++; };
    stub(this.persistenceService, 'ajax', function() { return server.promise; });
    this.route.device_copy_wait = 5;
    await open(this);
    assert.true(this.controller.get('served_from_device'));
    server.reject(denied);
    await wait(1400);
    assert.strictEqual(refreshes, 1, 'one refresh, so the router runs setupController');
    var first = await open(this);
    assert.true(first.error, 'a new error object');
    assert.false(this.controller.get('served_from_device'));
    stub(this.persistenceService, 'ajax', function() { return RSVP.reject(no_answer); });
    var retry = await open(this);
    assert.true(retry.error, 'Try Again with no answer: no copy until the server answers');
    assert.notStrictEqual(retry, first);
    stub(this.persistenceService, 'ajax', function() { return RSVP.resolve({root: {board: row()}}); });
    assert.strictEqual((await open(this)).get('key'), 'me/board', 'the server answered');
    stub(this.persistenceService, 'ajax', function() { return RSVP.reject(no_answer); });
    assert.strictEqual((await open(this)).get('key'), 'me/board', 'and device copies work again');
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
    assert_device_copy(assert, this, await open(this), 'a new sign-in');
  });

  test('a device read that never ends still reaches the error page', async function(assert) {
    stub(this.persistenceService, 'find', function() { return new RSVP.Promise(function() { }); });
    this.route.device_read_wait = 5;
    this.answers = [server_error];
    assert.true((await open(this)).error);
  });

  test('a 200 that is not a board (a school filter page) counts as no answer', async function(assert) {
    assert.expect(4);
    stub(this.persistenceService, 'ajax', function() { return RSVP.resolve({text: '<html>Blocked</html>', meta: {}}); });
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
});

module('Unit | Controller | user/board-detail on a device copy', function(hooks) {
  setupTest(hooks);

  hooks.afterEach(function() {
    restoreStubs();
  });

  test('share, privacy and translate are refused; on a normal board they open', function(assert) {
    var opened = [];
    var warned = [];
    stub(modal, 'open', function(name) { opened.push(name); return RSVP.resolve(); });
    stub(modal, 'warning', function(text) { warned.push(text); });
    var controller = this.owner.lookup('controller:user/board-detail');
    controller.set('model', EmberObject.create({key: 'me/board'}));
    controller.set('served_from_device', true);
    ['share_board', 'open_board_privacy', 'translate_board', 'make_a_copy', 'enter_edit_mode'].forEach(function(action) { controller.send(action); });
    assert.deepEqual(opened, []);
    assert.strictEqual(warned.length, 5);
    controller.set('served_from_device', false);
    controller.send('open_board_privacy');
    controller.send('translate_board');
    assert.deepEqual(opened, ['modals/board-privacy', 'translation-select']);
  });

  module('with a connection', function(hooks) {
    hooks.beforeEach(function() {
      var _this = this;
      this.pushed = [];
      this.realPersistence = window.persistence;
      this.realStore = LingoLinq.store;
      this.server = deferred();
      window.persistence = EmberObject.create({online: true, ajax: function() { return _this.server.promise; }});
      LingoLinq.store = { normalize: function(type, raw) { return raw; }, push: function(raw) { _this.pushed.push(raw); } };
      stub(modal, 'warning', function() { });
      this.built = [];
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
      assert.strictEqual(boardDetailCache.get('me/board').name, 'Fresh');
    });

    test('Edit keeps the copy read-only when the server does not give a board', async function(assert) {
      this.controller.send('enter_edit_mode');
      this.server.resolve({text: '<html>Blocked</html>'});
      await wait(0);
      assert.true(this.controller.get('served_from_device'));
      assert.deepEqual(this.built, []);
      this.server = deferred();
      this.controller.send('enter_edit_mode');
      this.server.reject(no_answer);
      await wait(0);
      assert.true(this.controller.get('served_from_device'), 'a failure changes nothing');
    });

    test('an answer for a board no longer on screen changes nothing', async function(assert) {
      this.controller.send('enter_edit_mode');
      this.controller.set('model', EmberObject.create({key: 'me/other'}));
      this.server.resolve({board: row()});
      await wait(0);
      assert.deepEqual(this.built, []);
    });

    test('a direct way into Edit is refused only on a device copy', function(assert) {
      assert.true(refuse_device_copy(this.controller));
      assert.false(refuse_device_copy(EmberObject.create({served_from_device: false})));
    });
  });
});
