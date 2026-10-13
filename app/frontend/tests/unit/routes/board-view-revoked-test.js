import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import RSVP from 'rsvp';
import { settled } from '@ember/test-helpers';
import { setupTest } from '../../helpers';
import LingoLinq from 'frontend/app';
import lingoLinqExtras from 'frontend/utils/extras';
import boardRevocation from 'frontend/utils/board_revocation';
import boardDetailCache from 'frontend/utils/board_detail_cache';
import editManager from 'frontend/utils/edit_manager';
import contentGrabbers from 'frontend/utils/content_grabbers';

/* Offline copies of boards a synced user can no longer view (utils/board_revocation.js), in the
 * Basic and Modern board views.
 *
 * Every `owner/name` board key goes through routes/board.js#beforeModel, which redirects it to
 * user.board-alt (Basic view) or user.board-detail (Modern view) before routes/board.js's own
 * model hook runs; in-board navigation goes to those routes directly. So the revocation checks
 * in routes/board.js and routes/board/index.js never ran for those keys. Each test below opens
 * the key through that beforeModel and then runs the model (or setup) hook of the route it
 * redirected to.
 *
 * Basic view: offline, a marked local copy resolves as the same unavailable-board record the
 * legacy route uses (templates/board.hbs, shared through templateName); online, a real "Not
 * authorized" no longer falls back to the local copy. Modern view: it fetches over ajax and
 * fails offline, but a board held in its in-memory cache resolved as the stale copy; offline, a
 * marked one now resolves as its error state.
 *
 * Never blocked: the board on screen, a home or sidebar board, anything in Speak Mode, a board
 * opened while acting as another user, or any board before the session user has loaded.
 */
module('Unit | Route | board views and revoked offline copies', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    var db = { board: {}, settings: {} };
    this.db = db;
    var storage = lingoLinqExtras.storage;
    this.realStorage = { find: storage.find, find_all: storage.find_all, store: storage.store };
    storage.find = function(store, key) {
      var rec = db[store] && db[store][key];
      return rec ? RSVP.resolve(JSON.parse(JSON.stringify(rec))) : RSVP.reject({error: 'no record found'});
    };
    storage.find_all = function(store) {
      return RSVP.resolve(Object.keys(db[store] || {}).map(function(k) { return {store: store, data: JSON.parse(JSON.stringify(db[store][k]))}; }));
    };
    storage.store = function(store, record) {
      db[store][record.id || record.storageId] = JSON.parse(JSON.stringify(record));
      return RSVP.resolve(record);
    };
    this.realStore = LingoLinq.store;
    this.realSession = LingoLinq.session;
    this.realAppState = LingoLinq.appState;
    // setupController runs editManager.setup, which writes these module-level slots.
    this.realEditManager = {controller: editManager._controller, services: editManager._services, app_state: editManager.get('app_state')};
    editManager._services = Object.assign({}, editManager._services);
    this.realBoardController = contentGrabbers.board_controller;
    LingoLinq.appState = EmberObject.create({speak_mode: false});
    LingoLinq.store = { createRecord: function(type, attrs) { return EmberObject.create(attrs); } };
    LingoLinq.session = EmberObject.create({access_token: 'tok', as_user_id: null});
    boardDetailCache.clear();
    boardRevocation.reset_for_tests();
  });

  hooks.afterEach(function() {
    var storage = lingoLinqExtras.storage;
    storage.find = this.realStorage.find;
    storage.find_all = this.realStorage.find_all;
    storage.store = this.realStorage.store;
    LingoLinq.store = this.realStore;
    LingoLinq.session = this.realSession;
    LingoLinq.appState = this.realAppState;
    editManager._controller = this.realEditManager.controller;
    editManager._services = this.realEditManager.services;
    editManager.set('app_state', this.realEditManager.app_state);
    contentGrabbers.board_controller = this.realBoardController;
    boardDetailCache.clear();
    boardRevocation.reset_for_tests();
  });

  var SIGNED_IN = {user_name: 'me', supervisees: [], preferences: {}};
  var denied = {fakeXHR: {status: 400, responseJSON: {error: 'Not authorized', unauthorized: true, permission: 'view', status: 400}}, message: 'error', result: 'Not authorized'};

  function storedBoard(db, id, key) {
    db.board[id] = {id: id, key: key, raw: {id: id, key: key, name: 'Shared'}};
  }

  // opts.view: 'classic' (Basic) or 'modern'. opts.sessionUser: undefined means signed in as
  // SIGNED_IN; null means the session user has not loaded yet. Routes are singletons that keep
  // the services they were created with, so the services are registered once and each later
  // call changes their properties.
  function setup(context, board, opts) {
    opts = opts || {};
    var viewer = EmberObject.create({user_name: 'me', preferences: {board_view_style: opts.view}});
    var state = {
      currentUser: viewer,
      sessionUser: opts.sessionUser === undefined ? SIGNED_IN : opts.sessionUser,
      currentBoardState: opts.onScreen ? {id: opts.onScreen} : {id: '1_1'},
      speak_mode: !!opts.speak_mode
    };
    if(!context.registered) {
      context.registered = true;
      context.owner.unregister('service:app-state');
      context.owner.register('service:app-state', Service.extend({
        board_virtual_dom: null,
        init: function() { this._super(...arguments); this.set('board_virtual_dom', {}); },
        hide_loading_overlay: function() { }
      }));
      context.owner.unregister('service:persistence');
      context.owner.register('service:persistence', Service.extend({ online: false, syncing: false }));
      context.owner.unregister('service:stashes');
      context.owner.register('service:stashes', Service.extend({
        get: function() { return null; }, set: function() { }, persist: function() { }
      }));
      context.owner.unregister('service:router');
      context.owner.register('service:router', Service.extend({
        moved: null,
        replaceWith: function() { this.get('moved').push(Array.prototype.slice.call(arguments)); }
      }));
      context.owner.unregister('service:store');
      context.owner.register('service:store', Service.extend({
        peekAll: function() { return this.get('inMemory') ? [this.get('board')] : []; },
        findRecord: function() { return RSVP.resolve(this.get('board')); },
        normalize: function(type, raw) { return raw; },
        push: function() { return this.get('board'); }
      }));
    }
    context.owner.lookup('service:app-state').setProperties(state);
    // editManager reads app state through this slot, primed by the test helper with the service
    // unregistered above.
    editManager._services.app_state = context.owner.lookup('service:app-state');
    context.owner.lookup('service:persistence').set('online', !!opts.online);
    context.owner.lookup('service:store').setProperties({board: board, inMemory: !!opts.inMemory});
    var moved = [];
    context.owner.lookup('service:router').set('moved', moved);
    return moved;
  }

  // Opens `key` the way the app does: routes/board.js#beforeModel picks the view route, then
  // that route's model hook runs with the params the redirect carried.
  async function open(context, key) {
    var moved = context.moved;
    await context.owner.lookup('route:board').beforeModel({to: {params: {key: key}}});
    var target = moved[moved.length - 1];
    var route = context.owner.lookup('route:' + target[0].replace(/\./g, '/'));
    var owner_name = target[1];
    route.paramsFor = function() { return {user_id: owner_name}; };
    route.modelFor = function() { return EmberObject.create({user_name: owner_name}); };
    return {target: target, model: await route.model({boardname: target[2]})};
  }

  // ---- Basic view, offline ----------------------------------------------------------

  test('Basic view offline: a marked local copy resolves as the unavailable-board record', async function(assert) {
    storedBoard(this.db, '1_7', 'owner/shared');
    await boardRevocation.apply_revocations(['1_7']);
    var board = EmberObject.create({id: '1_7', key: 'owner/shared'});
    this.moved = setup(this, board, {view: 'classic'});
    var res = await open(this, 'owner/shared');
    assert.deepEqual(res.target, ['user.board-alt', 'owner', 'shared'], 'redirected to the Basic view');
    assert.notStrictEqual(res.model, board, 'not the local copy');
    assert.notOk(res.model.get('id'), 'not a valid board id');
    assert.true(res.model.get('error.unauthorized'), 'the unavailable-board panel (templates/board.hbs)');
    assert.true(res.model.get('error.revoked'));
    assert.strictEqual(res.model.get('key'), 'owner/shared');
  });

  test('Basic view offline: a marked board already in memory is blocked too', async function(assert) {
    storedBoard(this.db, '1_7', 'owner/shared');
    await boardRevocation.apply_revocations(['1_7']);
    var board = EmberObject.create({id: '1_7', key: 'owner/shared'});
    this.moved = setup(this, board, {view: 'classic', inMemory: true});
    var res = await open(this, 'owner/shared');
    assert.strictEqual(res.target[0], 'user.board-alt');
    assert.true(res.model.get('error.revoked'), 'identity-map copy');
    boardDetailCache.set({id: '1_7', key: 'owner/shared', buttons: []});
    res = await open(this, 'owner/shared');
    assert.true(res.model.get('error.revoked'), 'board-detail cache copy');
  });

  test('Basic view: an unmarked board, and a marked one online, still open', async function(assert) {
    storedBoard(this.db, '1_7', 'owner/shared');
    var board = EmberObject.create({id: '1_7', key: 'owner/shared'});
    this.moved = setup(this, board, {view: 'classic'});
    assert.strictEqual((await open(this, 'owner/shared')).model, board, 'not marked');
    await boardRevocation.apply_revocations(['1_7']);
    this.owner.lookup('service:persistence').set('online', true);
    assert.strictEqual((await open(this, 'owner/shared')).model, board, 'online: the server decides');
  });

  test('Basic view offline: a marked board is never blocked in the never-block cases', async function(assert) {
    storedBoard(this.db, '1_7', 'owner/shared');
    await boardRevocation.apply_revocations(['1_7']);
    var board = EmberObject.create({id: '1_7', key: 'owner/shared'});
    var cases = [
      [{onScreen: '1_7'}, 'the board on screen'],
      [{speak_mode: true}, 'Speak Mode'],
      [{sessionUser: Object.assign({}, SIGNED_IN, {preferences: {home_board: {id: '1_7', key: 'owner/shared'}}})}, 'the home board'],
      [{sessionUser: Object.assign({}, SIGNED_IN, {preferences: {sidebar_boards: [{key: 'owner/shared'}]}})}, 'a sidebar board'],
      [{sessionUser: null}, 'the session user has not loaded'],
      [{as_user: 'u9'}, 'acting as another user']
    ];
    assert.expect(cases.length + 1);
    this.moved = setup(this, board, {view: 'classic'});
    assert.notStrictEqual((await open(this, 'owner/shared')).model, board, 'control: blocked');
    for(var idx = 0; idx < cases.length; idx++) {
      var opts = cases[idx][0];
      LingoLinq.session = EmberObject.create({access_token: 'tok', as_user_id: opts.as_user || null});
      this.moved = setup(this, board, Object.assign({view: 'classic'}, opts));
      assert.strictEqual((await open(this, 'owner/shared')).model, board, cases[idx][1]);
    }
  });

  // ---- Basic view, online -----------------------------------------------------------

  function remoteModel(reload) {
    return EmberObject.extend({
      load_button_set: function() { },
      without_lookups: function(fn) { fn(); },
      prefetch_linked_boards: function() { },
      reload: function(force) {
        this.get('reloads').push(force);
        return reload(force, this);
      }
    }).create({id: '1_7', key: 'owner/shared', valid_id: true, reloads: []});
  }

  function boardController() {
    return EmberObject.extend({ processButtons: function() { } }).create({has_rendered_material: false, valid_fast_html: true});
  }

  // Opens the key, then runs the Basic board page's setupController, where the online reload is.
  async function openOnline(context, model) {
    await context.owner.lookup('route:board').beforeModel({to: {params: {key: 'owner/shared'}}});
    var target = context.moved[context.moved.length - 1];
    var route = context.owner.lookup('route:' + target[0].replace(/\./g, '/') + '/index');
    var sent = [];
    route.send = function(name, err) { sent.push([name, err]); };
    route.setupController(boardController(), model);
    await settled();
    return {target: target, sent: sent};
  }

  test('Basic view online: a real denial does not fall back to the local copy', async function(assert) {
    var model = remoteModel(function(force) { return force ? RSVP.reject(denied) : RSVP.resolve(model); });
    this.moved = setup(this, model, {view: 'classic', online: true});
    var res = await openOnline(this, model);
    assert.strictEqual(res.target[0], 'user.board-alt', 'redirected to the Basic view');
    assert.deepEqual(model.get('reloads'), [true], 'no local reload');
    assert.strictEqual(res.sent.length, 1, 'the error state');
    var sent_error = (res.sent[0] || [])[1] || {};
    assert.true(sent_error.unauthorized, 'with the server refusal');
  });

  test('Basic view online: a denial keeps the local copy in the never-block cases, and other failures always do', async function(assert) {
    var cases = [
      [{sessionUser: null}, denied, 'the session user has not loaded'],
      [{as_user: 'u9'}, denied, 'acting as another user'],
      [{sessionUser: Object.assign({}, SIGNED_IN, {preferences: {home_board: {id: '1_7', key: 'owner/shared'}}})}, denied, 'the home board'],
      [{}, {fakeXHR: {status: 502}}, '5xx']
    ];
    assert.expect(cases.length * 2);
    for(var idx = 0; idx < cases.length; idx++) {
      var opts = cases[idx][0];
      var err = cases[idx][1];
      LingoLinq.session = EmberObject.create({access_token: 'tok', as_user_id: opts.as_user || null});
      var model = remoteModel(function(force, m) { return force ? RSVP.reject(err) : RSVP.resolve(m); });
      this.moved = setup(this, model, Object.assign({view: 'classic', online: true}, opts));
      var res = await openOnline(this, model);
      assert.deepEqual(model.get('reloads'), [true, false], cases[idx][2] + ': local reload');
      assert.strictEqual(res.sent.length, 0, cases[idx][2] + ': no error state');
    }
  });

  test('Basic view online: a forced reload the server answered clears the mark', async function(assert) {
    storedBoard(this.db, '1_7', 'owner/shared');
    await boardRevocation.apply_revocations(['1_7']);
    var model = remoteModel(function(force, m) { m.set('retrieved', (new Date()).getTime()); return RSVP.resolve(m); });
    this.moved = setup(this, model, {view: 'classic', online: true});
    await openOnline(this, model);
    assert.false(await boardRevocation.is_revoked('1_7'), 'cleared');
  });

  // ---- Modern view --------------------------------------------------------------------

  test('Modern view offline: a marked board held in memory resolves as the error state', async function(assert) {
    storedBoard(this.db, '1_7', 'owner/shared');
    await boardRevocation.apply_revocations(['1_7']);
    var board = EmberObject.create({id: '1_7', key: 'owner/shared'});
    boardDetailCache.set({id: '1_7', key: 'owner/shared', buttons: []});
    this.moved = setup(this, board, {view: 'modern', inMemory: true});
    var res = await open(this, 'owner/shared');
    assert.deepEqual(res.target, ['user.board-detail', 'owner', 'shared'], 'redirected to the Modern view');
    assert.notStrictEqual(res.model, board, 'not the stale copy');
    assert.true(res.model.error, 'the board-detail error state');
    assert.strictEqual(res.model.boardname, 'shared');
  });

  test('Modern view: the never-block cases, an unmarked board and online still open from memory', async function(assert) {
    storedBoard(this.db, '1_7', 'owner/shared');
    storedBoard(this.db, '1_8', 'owner/other');
    await boardRevocation.apply_revocations(['1_7']);
    var board = EmberObject.create({id: '1_7', key: 'owner/shared'});
    var cases = [
      [{online: true}, 'online'],
      [{onScreen: '1_7'}, 'the board on screen'],
      [{speak_mode: true}, 'Speak Mode'],
      [{sessionUser: Object.assign({}, SIGNED_IN, {preferences: {home_board: {id: '1_7', key: 'owner/shared'}}})}, 'the home board'],
      [{sessionUser: Object.assign({}, SIGNED_IN, {preferences: {sidebar_boards: [{id: '1_7'}]}})}, 'a sidebar board'],
      [{sessionUser: null}, 'the session user has not loaded'],
      [{as_user: 'u9'}, 'acting as another user']
    ];
    assert.expect(cases.length + 1);
    for(var idx = 0; idx < cases.length; idx++) {
      var opts = cases[idx][0];
      LingoLinq.session = EmberObject.create({access_token: 'tok', as_user_id: opts.as_user || null});
      boardDetailCache.set({id: '1_7', key: 'owner/shared', buttons: []}, {force: true});
      this.moved = setup(this, board, Object.assign({view: 'modern', inMemory: true}, opts));
      assert.strictEqual((await open(this, 'owner/shared')).model, board, cases[idx][1]);
    }
    var other = EmberObject.create({id: '1_8', key: 'owner/other'});
    boardDetailCache.set({id: '1_8', key: 'owner/other', buttons: []});
    LingoLinq.session = EmberObject.create({access_token: 'tok', as_user_id: null});
    this.moved = setup(this, other, {view: 'modern', inMemory: true});
    assert.strictEqual((await open(this, 'owner/other')).model, other, 'not marked');
  });
});
