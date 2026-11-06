import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import RSVP from 'rsvp';
import { setupTest } from '../../helpers';
import LingoLinq from 'frontend/app';
import modal from 'frontend/utils/modal';
import boardDetailCache from 'frontend/utils/board_detail_cache';
import boardRevocation from 'frontend/utils/board_revocation';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';

/* The Modern board page shows a synced board from the device when the server gives no usable
 * answer (#1213). These run routes/user/board-detail.js#model with the real Ember Data store; only
 * the network and the device read are stubbed, and the device read answers by key only, as
 * the route has no id at this point. */
module('Unit | Route | user/board-detail device copy', function(hooks) {
  setupTest(hooks);

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

  hooks.beforeEach(function() {
    var _this = this;
    this.device = {'me/board': row()};
    this.answers = [];
    this.requests = [];
    this.realSession = LingoLinq.session;
    LingoLinq.session = EmberObject.create({access_token: 'tok', as_user_id: null});
    this.owner.unregister('service:app-state');
    this.owner.register('service:app-state', Service.extend({
      sessionUser: null, speak_mode: false,
      hide_loading_overlay: function() { }
    }));
    this.appState = this.owner.lookup('service:app-state');
    this.appState.set('sessionUser', {user_name: 'me', supervisees: [], preferences: {}});
    // A stand-in service: the real one reacts to `online` changes with work that outlives the test.
    // It is also put on window.persistence, which is where utils/persistence.js (a proxy) looks.
    this.owner.unregister('service:persistence');
    this.owner.register('service:persistence', Service.extend({
      online: true,
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

  function open(context) {
    return context.route.model({boardname: 'board'});
  }

  function assert_device_copy(assert, context, model, label) {
    assert.strictEqual(model.get('key'), 'me/board', label + ': the record');
    assert.strictEqual(context.route.get('_raw_board_data.buttons.0.label'), 'want', label + ': the grid source');
    assert.true(context.route.get('served_from_device'), label + ': marked as a device copy');
    assert.true(context.controller.get('served_from_device'), label + ': for the edit route and reconnect');
    assert.notOk(boardDetailCache.get('me/board'), label + ': never entered as a fresh cache entry');
  }

  test('offline: opens a synced board that is not in memory', async function(assert) {
    assert.expect(5);
    this.persistenceService.set('online', false);
    this.answers = [offline];
    assert_device_copy(assert, this, await open(this), 'offline');
  });

  test('online with no route to the server: opens the device copy', async function(assert) {
    assert.expect(5);
    this.answers = [no_answer];
    assert_device_copy(assert, this, await open(this), 'status 0');
  });

  test('a server outage opens the device copy after the retry', async function(assert) {
    assert.expect(6);
    this.answers = [server_error];
    assert_device_copy(assert, this, await open(this), '503');
    assert.strictEqual(this.requests.length, 3, '/tree, show and the one retry');
  });

  test('a network that never answers opens the device copy at the deadline', async function(assert) {
    assert.expect(5);
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

  test('Speak Mode keeps the device copy after a denial', async function(assert) {
    assert.expect(5);
    this.appState.set('speak_mode', true);
    this.answers = [denied];
    assert_device_copy(assert, this, await open(this), 'speak mode');
  });

  test('the revocation gate counts a server that never answered as offline', async function(assert) {
    var seen = [];
    stub(boardRevocation, 'blocks_view_route', function(record, state, online) {
      seen.push(online);
      return RSVP.resolve(true);
    });
    this.answers = [no_answer];
    assert.deepEqual(await open(this), {error: true, boardname: 'board'}, 'a marked copy is blocked');
    assert.deepEqual(seen, [false]);
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
    assert.false(this.route.get('served_from_device'));
  });

  test('editing is refused on a device copy', function(assert) {
    var warned = [];
    stub(modal, 'warning', function(text) { warned.push(text); });
    var edit = this.owner.lookup('route:user/board-detail/edit');
    var moved = [];
    var parent = EmberObject.create({served_from_device: true, user: {user_name: 'me'}, boardname: 'board'});
    edit.controllerFor = function() { return parent; };
    edit.set('router', {transitionTo: function() { moved.push(Array.prototype.slice.call(arguments)); }});
    edit.setupController(EmberObject.create(), EmberObject.create({key: 'me/board'}));
    assert.deepEqual(moved, [['user.board-detail', 'me', 'board']]);
    assert.notOk(parent.get('grid_loading'), 'stopped before the edit setup');
    assert.strictEqual(warned.length, 1, 'and says why');
  });
});
