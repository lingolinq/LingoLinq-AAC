import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import { setupTest } from '../../helpers';
import modal from 'frontend/utils/modal';
import boardsPageListCache from 'frontend/utils/boards_page_list_cache';

/* "SET HOME BOARD" ON THE BOARDS PAGE IS A MODE, NOT A TRIP TO THE PICKER (requested 2026-10-11).
 * The button turns on an assignment mode (a different pointer and a tooltip: click any board to make
 * it the home board) that survives switching tabs. A click on a board the page's user owns sets it as
 * home; a click on anyone else's board asks to copy it first (confirm-home-board-copy), and only
 * outside the mode does a click open the board. */
module('Unit | Component | available-boards-section set-home mode', function(hooks) {
  setupTest(hooks);

  var originalOpen;
  hooks.beforeEach(function() { originalOpen = modal.open; });
  hooks.afterEach(function() { modal.open = originalOpen; });

  function section(owner) {
    var sent = [];
    var user = EmberObject.create({ id: '1_1', user_name: 'example', preferences: {} });
    var ctrl = { model: user, send: function() { sent.push(Array.prototype.slice.call(arguments)); }, get: function(k) { var parts = k.split('.'); var o = this[parts.shift()]; parts.forEach(function(part) { o = o && (o.get ? o.get(part) : o[part]); }); return o; } };
    var comp = owner.factoryFor('component:available-boards-section').create({ boardsCtrl: ctrl });
    var copies = [];
    comp.copyAsHome = function(board, u) { copies.push([board.get('key'), u.get('user_name')]); return RSVP.resolve(board); };
    return { comp: comp, sent: sent, copies: copies, user: user };
  }
  function board(key) { return EmberObject.create({ key: key, id: '1_9' }); }

  test('outside the mode a click opens the board, as before', function(assert) {
    var t = section(this.owner);
    t.comp.onOpenBoardInUserView(board('example/mine'));
    assert.strictEqual(t.sent[0][0], 'open_board_in_user_view');
    assert.strictEqual(t.copies.length, 0);
    t.comp.destroy();
  });

  test('the button turns the mode on and off', function(assert) {
    var t = section(this.owner);
    t.comp.send('toggleSetHomeMode');
    assert.true(t.comp.get('assigningHome'), 'on');
    t.comp.send('toggleSetHomeMode');
    assert.false(t.comp.get('assigningHome'), 'off again');
    t.comp.destroy();
  });

  test('after an owned board becomes home, ask whether to open it; Not now follows it to the top of My Boards', async function(assert) {
    var t = section(this.owner);
    var opened = [];
    modal.open = function(template, opts) { opened.push([template, opts]); return RSVP.resolve(); };
    var played = [];
    t.comp._followHomeMove = function(key) { played.push(key); };
    t.comp.send('toggleSetHomeMode');
    t.comp.onOpenBoardInUserView(board('example/three'));
    await RSVP.resolve(); await RSVP.resolve();
    assert.strictEqual(opened.length, 1, 'the dialog opens');
    assert.strictEqual(opened[0][0], 'confirm-home-board-copy');
    assert.strictEqual(opened[0][1].stage, 'done', 'straight at "open your new home board?"');
    assert.false(opened[0][1].copied);
    assert.strictEqual(opened[0][1].home.get('key'), 'example/three');
    opened[0][1].onNotNow(opened[0][1].home);
    assert.deepEqual(played, ['example/three'], 'Not now follows the board');
    t.comp.destroy();
  });

  test('Not now after a copy from another tab switches to My Boards to show it arrive', function(assert) {
    var t = section(this.owner);
    var played = [];
    t.comp._followHomeMove = function(key) { played.push(key); };
    var opts;
    modal.open = function(template, o) { opts = o; return RSVP.resolve(); };
    t.comp.send('toggleSetHomeMode');
    t.comp.onOpenBoardInUserView(board('lingolinq/quick-core-24'));
    opts.onNotNow(EmberObject.create({ key: 'example/quick-core-24' }));
    assert.deepEqual(t.sent[0], ['set_selected', 'mine'], 'My Boards');
    assert.deepEqual(played, ['example/quick-core-24']);
    t.comp.destroy();
  });

  test('Not now after a copy refreshes My Boards so the new copy is listed', function(assert) {
    var t = section(this.owner);
    var cleared = [];
    var origClear = boardsPageListCache.clear;
    boardsPageListCache.clear = function(id) { cleared.push(id); };
    t.comp._followHomeMove = function() {};
    var opts;
    modal.open = function(template, o) { opts = o; return RSVP.resolve(); };
    // Already on My Boards (a liked board listed there is not theirs): re-query in place.
    t.comp.get('boardsCtrl').mine_selected = true;
    t.comp.send('toggleSetHomeMode');
    t.comp.onOpenBoardInUserView(board('lingolinq/quick-core-24'));
    opts.onNotNow(EmberObject.create({ key: 'example/quick-core-24' }));
    boardsPageListCache.clear = origClear;
    assert.deepEqual(cleared, ['1_1'], 'the cached list is dropped');
    assert.deepEqual(t.sent[0], ['retry_board_list'], 're-queried');
    t.comp.destroy();
  });

  test("after a copy on your own page, the page's own user record is reloaded so My Boards re-sorts", function(assert) {
    // copy_board reloads only the record it was given (utils/edit_manager.js, copy_board_links), and
    // the copy is saved on the session user ('self'); the page lists boards from its own '1_1' record.
    var t = section(this.owner);
    var reloaded = 0;
    t.user.reload = function() { reloaded++; return RSVP.resolve(t.user); };
    t.comp.set('appState', EmberObject.create({ currentUser: EmberObject.create({ id: 'self', global_id: '1_1', user_name: 'example' }) }));
    var opts;
    modal.open = function(template, o) { opts = o; return RSVP.resolve(); };
    t.comp.send('toggleSetHomeMode');
    t.comp.onOpenBoardInUserView(board('lingolinq/quick-core-24'));
    opts.onDone(EmberObject.create({ key: 'example/quick-core-24' }));
    assert.strictEqual(reloaded, 1, 'the page record is reloaded');
    t.comp.destroy();
  });

  test("the tooltip's Cancel ends the mode", function(assert) {
    var t = section(this.owner);
    t.comp.send('toggleSetHomeMode');
    t.comp.send('cancelSetHomeMode');
    assert.false(t.comp.get('assigningHome'), 'off');
    t.comp.send('cancelSetHomeMode');
    assert.false(t.comp.get('assigningHome'), 'stays off when already off');
    t.comp.destroy();
  });

  test('in the mode, a board the user owns becomes home without opening it', async function(assert) {
    var t = section(this.owner);
    modal.open = function() { return RSVP.resolve(); };
    t.comp.send('toggleSetHomeMode');
    t.comp.onOpenBoardInUserView({ board: board('example/mine'), children: [] });
    await RSVP.resolve();
    assert.deepEqual(t.copies, [['example/mine', 'example']], 'set as home');
    assert.deepEqual(t.sent, [], 'not opened');
    assert.false(t.comp.get('assigningHome'), 'the mode ends once a board is assigned');
    t.comp.destroy();
  });

  test('on your own page the home board is saved on the session user, so the app sees it at once', async function(assert) {
    // The page's model ('1_1') and the session user ('self') are separate records for the same person;
    // the picker saves on the session user (components/board-preview-overlay.js#pick_for_home).
    var t = section(this.owner);
    var me = EmberObject.create({ id: 'self', global_id: '1_1', user_name: 'example' });
    t.comp.set('appState', EmberObject.create({ currentUser: me }));
    var saved_on = [];
    modal.open = function() { return RSVP.resolve(); };
    t.comp.copyAsHome = function(b, u) { saved_on.push(u); return RSVP.resolve(b); };
    t.comp.send('toggleSetHomeMode');
    t.comp.onOpenBoardInUserView(board('example/mine'));
    await RSVP.resolve();
    assert.strictEqual(saved_on[0], me, 'the session user record');
    t.comp.destroy();
  });

  test("on your own page the tooltip says 'your' even when the session user is keyed 'self'", function(assert) {
    // Ember Data keys the signed-in user as 'self' (utils/backend_user_id.js); the page's model is '1_1'.
    var t = section(this.owner);
    t.comp.set('appState', EmberObject.create({ currentUser: EmberObject.create({ id: 'self', global_id: '1_1', user_name: 'example' }) }));
    assert.strictEqual(t.comp.get('setHomeTip'), 'Click any board to make it your home board');
    t.comp.destroy();
  });

  test("on a communicator's page the tooltip names them", function(assert) {
    var t = section(this.owner);
    t.comp.set('appState', EmberObject.create({ currentUser: EmberObject.create({ id: 'self', global_id: '1_2', user_name: 'sup' }) }));
    assert.strictEqual(t.comp.get('setHomeTip'), "Click any board to make it example's home board");
    t.comp.destroy();
  });

  test("in the mode, someone else's board asks to copy it first", function(assert) {
    var t = section(this.owner);
    var opened = [];
    modal.open = function(template, opts) { opened.push([template, opts.board.get('key'), opts.user.get('user_name')]); return RSVP.resolve(); };
    t.comp.send('toggleSetHomeMode');
    t.comp.onOpenBoardInUserView(board('lingolinq/quick-core-24'));
    assert.deepEqual(opened, [['confirm-home-board-copy', 'lingolinq/quick-core-24', 'example']]);
    assert.strictEqual(t.copies.length, 0, 'nothing copied before they agree');
    assert.deepEqual(t.sent, [], 'not opened');
    t.comp.destroy();
  });
});
