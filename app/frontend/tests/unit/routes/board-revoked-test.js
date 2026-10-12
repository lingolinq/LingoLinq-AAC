import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import RSVP from 'rsvp';
import { setupTest } from '../../helpers';
import LingoLinq from 'frontend/app';
import lingoLinqExtras from 'frontend/utils/extras';
import boardRevocation from 'frontend/utils/board_revocation';

/* The board routes and offline copies of boards a synced user can no longer view
 * (utils/board_revocation.js).
 *
 * routes/board.js: a board whose local copy is marked resolves as the unavailable-board
 * record (templates/board.hbs), never as the stale copy; the board already on screen is
 * left alone.
 *
 * routes/board/index.js: online, a failed remote reload used to fall back to the local
 * copy on ANY error, so a board the server refuses kept rendering. A real "Not authorized"
 * for the view permission, from a user whose refusal speaks for every synced user, now
 * rejects instead; anything else keeps the fallback.
 */
module('Unit | Route | board revoked offline copies', function(hooks) {
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
    LingoLinq.appState = EmberObject.create({speak_mode: false});
    LingoLinq.store = { createRecord: function(type, attrs) { return EmberObject.create(attrs); } };
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
    boardRevocation.reset_for_tests();
  });

  function boardRoute(context, currentBoardId, board) {
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      currentBoardState: currentBoardId ? {id: currentBoardId} : null
    }));
    context.owner.unregister('service:stashes');
    context.owner.register('service:stashes', Service.extend({ get: function() { return null; } }));
    context.owner.unregister('service:store');
    context.owner.register('service:store', Service.extend({
      peekAll: function() { return [board]; },
      findRecord: function() { return RSVP.resolve(board); }
    }));
    return context.owner.lookup('route:board');
  }

  function storedBoard(db, id) {
    db.board[id] = {id: id, key: 'owner/shared', raw: {id: id, key: 'owner/shared', name: 'Shared'}};
  }

  test('a marked board resolves as the unavailable-board record, not the stale copy', async function(assert) {
    storedBoard(this.db, '1_7');
    await boardRevocation.apply_revocations(['1_7']);
    var board = EmberObject.create({id: '1_7', key: 'owner/shared'});
    var route = boardRoute(this, '1_1', board);
    var model = await route.model({key: 'owner/shared'});
    assert.notStrictEqual(model, board, 'not the local copy');
    assert.notOk(model.get('id'), 'not a valid board id');
    assert.true(model.get('error.unauthorized'));
    assert.strictEqual(model.get('key'), 'owner/shared');
  });

  test('an unmarked board, and the marked board already on screen, still resolve', async function(assert) {
    storedBoard(this.db, '1_7');
    var board = EmberObject.create({id: '1_7', key: 'owner/shared'});
    var route = boardRoute(this, '1_1', board);
    assert.strictEqual(await route.model({key: 'owner/shared'}), board, 'not marked');
    await boardRevocation.apply_revocations(['1_7']);
    this.owner.lookup('service:app-state').set('currentBoardState', {id: '1_7'});
    assert.strictEqual(await route.model({key: 'owner/shared'}), board, 'board on screen is left alone');
  });

  function indexRoute(context, sessionUser) {
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({ sessionUser: sessionUser }));
    return context.owner.lookup('route:board/index');
  }

  function localModel() {
    var model = { reloads: [] };
    model.reload = function(force) { model.reloads.push(force); return RSVP.resolve(model); };
    return model;
  }

  var denied = {fakeXHR: {status: 400, responseJSON: {error: 'Not authorized', unauthorized: true, permission: 'view', status: 400}}, message: 'error', result: 'Not authorized'};

  test('a real denial online does not resolve with the local copy', async function(assert) {
    LingoLinq.session = EmberObject.create({as_user_id: null});
    var route = indexRoute(this, {supervisees: []});
    var model = localModel();
    var rejected = null;
    await route.local_reload_unless_denied(model, denied).then(function() { }, function(err) { rejected = err; });
    assert.deepEqual(model.reloads, [], 'no local reload');
    assert.ok(rejected, 'rejects');
    assert.true(rejected.unauthorized, 'with the server refusal');
  });

  test('ambiguous or transient failures keep the local fallback', async function(assert) {
    assert.expect(12);
    LingoLinq.session = EmberObject.create({as_user_id: null});
    var cases = [
      [{supervisees: [{id: 'u2'}]}, denied, 'a synced supervisee might view it'],
      [{supervisees: []}, {fakeXHR: {status: 400, responseJSON: Object.assign({}, denied.fakeXHR.responseJSON, {valet_blocked: true})}}, 'valet'],
      [{supervisees: []}, {fakeXHR: {status: 400, responseJSON: Object.assign({}, denied.fakeXHR.responseJSON, {device_scopes_none: true})}}, 'device scopes'],
      [{supervisees: []}, {fakeXHR: {status: 400, responseJSON: Object.assign({}, denied.fakeXHR.responseJSON, {scope_limited: true})}}, 'scope limited'],
      [{supervisees: []}, {fakeXHR: {status: 502}}, '5xx'],
      [{supervisees: []}, {error: 'timeout'}, 'timeout']
    ];
    var route = indexRoute(this, null);
    for(var idx = 0; idx < cases.length; idx++) {
      this.owner.lookup('service:app-state').set('sessionUser', cases[idx][0]);
      var model = localModel();
      var res = await route.local_reload_unless_denied(model, cases[idx][1]);
      assert.strictEqual(res, model, cases[idx][2] + ': resolves with the local copy');
      assert.deepEqual(model.reloads, [false], cases[idx][2] + ': local reload');
    }
  });
});
