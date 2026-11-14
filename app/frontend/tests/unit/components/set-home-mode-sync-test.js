import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import { setupTest } from '../../helpers';
import { settled } from '@ember/test-helpers';
import modal from 'frontend/utils/modal';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';
import { stubOnPersistence } from 'frontend/tests/helpers/persistence-stub';

/* "CHANGE HOME BOARD" SAVES THE NEW HOME BOARD ON THE DEVICE, AS THE PICKER DOES (Traci, 2026-11-13).
 *
 * The board picker starts a sync once a home board is set, when the device is online and automatic sync is on
 * (components/board-preview-overlay.js#_finishPickForHome, utils/home_board.js#sync_after_home_change, #1034). The
 * Boards page's set-home mode (Modern) and the Basic dashboard's Assign / Change Home Board mode set the home board
 * through the same helper (utils/board-copy.js#copy_or_reuse_as_home), which never syncs, so the new home board was
 * not on the device until the server's sync stamp brought a sync minutes later. Only the signed-in person's own home
 * board starts their sync: a supervisor setting a communicator's home board does not sync the supervisor's boards. */
module('Unit | Component | set-home modes start the home-board sync', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.syncs = [];
    var syncs = this.syncs;
    stubOnPersistence('sync', function() { syncs.push(Array.prototype.slice.call(arguments)); return RSVP.resolve(); });
    var service = this.owner.lookup('service:persistence');
    var app = this.owner.lookup('service:app-state');
    this.prior = { online: service.get('online'), auto_sync: service.get('auto_sync'), currentUser: app.get('currentUser') };
    service.set('online', true);
    service.set('auto_sync', true);
    this.me = EmberObject.create({ id: 'self', global_id: '1_3', user_name: 'example', preferences: {} });
    app.set('currentUser', this.me);
  });
  hooks.afterEach(function() {
    var service = this.owner.lookup('service:persistence');
    service.set('online', this.prior.online);
    service.set('auto_sync', this.prior.auto_sync);
    this.owner.lookup('service:app-state').set('currentUser', this.prior.currentUser);
    restoreStubs();
  });

  var HOME_SYNC = ['self', null, null, 'home_board_changed'];
  function board(key) { return EmberObject.create({ key: key, id: '1_9', name: 'B' }); }
  // The page's user: the session user under its real id, or someone else.
  function section(owner, pageUser) {
    var ctrl = { model: pageUser, send: function() { }, get: function(k) { var parts = k.split('.'); var o = this[parts.shift()]; parts.forEach(function(part) { o = o && (o.get ? o.get(part) : o[part]); }); return o; } };
    var comp = owner.factoryFor('component:available-boards-section').create({ boardsCtrl: ctrl });
    comp.copyAsHome = function(b) { return RSVP.resolve(b); };
    comp._followHomeMove = function() { };
    return comp;
  }
  // The dialog runs its copy step (model.copyAsHome) and calls onDone only while it is still open
  // (components/confirm-home-board-copy.js#confirm); these tests run the copy step and never call onDone, as when the
  // dialog was closed during a long copy.
  function runCopy(dialog, key) { return dialog.copyAsHome(board(key), dialog.user, null, { isCancelled: function() { return false; } }); }

  test('Modern, your own board: setting it as home starts the sync', async function(assert) {
    var opened = [];
    stub(modal, 'open', function(template, opts) { opened.push(opts); return RSVP.resolve(); });
    var comp = section(this.owner, EmberObject.create({ id: '1_3', user_name: 'example', preferences: {} }));
    comp.send('toggleSetHomeMode');
    comp.onOpenBoardInUserView(board('example/two'));
    await settled();
    assert.strictEqual(opened.length, 1, 'the dialog asks whether to open it');
    assert.deepEqual(this.syncs, [HOME_SYNC], 'one home-board sync');
    comp.destroy();
  });

  test('Modern, a failed save starts no sync', async function(assert) {
    stub(modal, 'open', function() { return RSVP.resolve(); });
    stub(modal, 'error', function() { });
    var comp = section(this.owner, EmberObject.create({ id: '1_3', user_name: 'example', preferences: {} }));
    comp.copyAsHome = function() { return RSVP.reject('nope'); };
    comp.send('toggleSetHomeMode');
    comp.onOpenBoardInUserView(board('example/two'));
    await settled();
    assert.deepEqual(this.syncs, []);
    comp.destroy();
  });

  test("Modern, someone else's board copied as your home: the sync starts when the copy is done, even if the dialog was closed", async function(assert) {
    var opened = [];
    stub(modal, 'open', function(template, opts) { opened.push(opts); return RSVP.resolve(); });
    var comp = section(this.owner, EmberObject.create({ id: '1_3', user_name: 'example', preferences: {} }));
    comp.send('toggleSetHomeMode');
    comp.onOpenBoardInUserView(board('lingolinq/quick-core-24'));
    await settled();
    assert.deepEqual(this.syncs, [], 'no sync while the copy question is open');
    await runCopy(opened[0], 'lingolinq/quick-core-24');
    await settled();
    assert.deepEqual(this.syncs, [HOME_SYNC], 'one home-board sync once the copy is the home board');
    comp.destroy();
  });

  test('Modern, a cancelled copy starts no sync', async function(assert) {
    var opened = [];
    stub(modal, 'open', function(template, opts) { opened.push(opts); return RSVP.resolve(); });
    var comp = section(this.owner, EmberObject.create({ id: '1_3', user_name: 'example', preferences: {} }));
    comp.copyAsHome = function() { return RSVP.reject({ cancelled: true }); };
    comp.send('toggleSetHomeMode');
    comp.onOpenBoardInUserView(board('lingolinq/quick-core-24'));
    await settled();
    await runCopy(opened[0], 'lingolinq/quick-core-24').then(null, function() { });
    await settled();
    assert.deepEqual(this.syncs, []);
    comp.destroy();
  });

  // As the picker (board-preview-overlay.js, pickingForOther): another person's home board starts no sync here.
  test("Modern, a supervisor setting a communicator's home board starts no sync, as the picker", async function(assert) {
    var opened = [];
    stub(modal, 'open', function(template, opts) { opened.push(opts); return RSVP.resolve(); });
    var comp = section(this.owner, EmberObject.create({ id: '1_8', user_name: 'sam', preferences: {} }));
    comp.send('toggleSetHomeMode');
    comp.onOpenBoardInUserView(board('sam/two'));
    await settled();
    comp.send('toggleSetHomeMode'); // the first tap ended the mode
    comp.onOpenBoardInUserView(board('lingolinq/quick-core-24'));
    await settled();
    await runCopy(opened[opened.length - 1], 'lingolinq/quick-core-24');
    await settled();
    assert.deepEqual(this.syncs, [], 'no sync');
    comp.destroy();
  });

  test('Modern, with automatic sync off nothing starts', async function(assert) {
    this.owner.lookup('service:persistence').set('auto_sync', false);
    stub(modal, 'open', function() { return RSVP.resolve(); });
    var comp = section(this.owner, EmberObject.create({ id: '1_3', user_name: 'example', preferences: {} }));
    comp.send('toggleSetHomeMode');
    comp.onOpenBoardInUserView(board('example/two'));
    await settled();
    assert.deepEqual(this.syncs, []);
    comp.destroy();
  });

  test("the home-board sync never starts into a database that is not the signed-in person's", async function(assert) {
    stubOnPersistence('local_db_is_current_user', function() { return false; });
    stub(modal, 'open', function() { return RSVP.resolve(); });
    var comp = section(this.owner, EmberObject.create({ id: '1_3', user_name: 'example', preferences: {} }));
    comp.send('toggleSetHomeMode');
    comp.onOpenBoardInUserView(board('example/two'));
    await settled();
    assert.deepEqual(this.syncs, []);
    comp.destroy();
  });

  // Basic: components/dashboard/classic-view.js#_basicAssign, which acts for appState.currentUser.
  function classic(owner, copyAsHome) {
    var model = EmberObject.create({ id: '1_3', user_name: 'example', preferences: {}, load_word_activities: function() { } });
    var comp = owner.factoryFor('component:dashboard/classic-view').create({ model: model });
    comp.set('basicCopyAsHome', copyAsHome || function(brd) { return RSVP.resolve(brd); });
    comp.update_selected = function() { };
    comp._setBasicAssigning(true);
    return comp;
  }

  test('Basic, your own board: setting it as home starts the sync', async function(assert) {
    stub(modal, 'open', function() { return RSVP.resolve(); });
    var comp = classic(this.owner);
    await comp._basicAssign(board('example/two'));
    await settled();
    assert.deepEqual(this.syncs, [HOME_SYNC]);
    comp.destroy();
  });

  test("Basic, someone else's board: the sync starts when the copy is the home board, even if the dialog was closed", async function(assert) {
    var opts = null;
    stub(modal, 'open', function(template, o) { opts = o; return RSVP.resolve(); });
    var comp = classic(this.owner);
    await comp._basicAssign(board('lingolinq/quick-core-24'));
    await settled();
    assert.deepEqual(this.syncs, [], 'no sync while the copy question is open');
    await runCopy(opts, 'lingolinq/quick-core-24');
    await settled();
    assert.deepEqual(this.syncs, [HOME_SYNC]);
    comp.destroy();
  });

  test('Basic, a failed save starts no sync', async function(assert) {
    stub(modal, 'open', function() { return RSVP.resolve(); });
    stub(modal, 'error', function() { });
    var comp = classic(this.owner, function() { return RSVP.reject('nope'); });
    await comp._basicAssign(board('example/two'));
    await settled();
    assert.deepEqual(this.syncs, []);
    comp.destroy();
  });
});
