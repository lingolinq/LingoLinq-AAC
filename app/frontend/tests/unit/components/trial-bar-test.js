import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';
import modal from 'frontend/utils/modal';

/* THE TRIAL BAR (requested 2026-10-12: "Trying a board shows a trial bar, and 'Use this board' opens
 * Speak Mode on it (whether in basic or modern view) - basic should open speak mode in basic view,
 * modern should open speak mode in modern view"). Decided the same day: Try never changes the home
 * board; "Use this board" makes it the home board, then opens Speak Mode; the bar reads
 * "Trying: <board name>" with "Use this board" and "Exit". In Basic the trial browses the board
 * (normal mode); Modern's board page is always the speaking page, so its trial is that page + the bar.
 */
module('Unit | Component | trial-bar', function(hooks) {
  setupTest(hooks);
  var messages, realSuccess, realError;
  hooks.beforeEach(function() {
    messages = [];
    realSuccess = modal.success; realError = modal.error;
    modal.success = function(text) { messages.push(['success', text]); };
    modal.error = function(text) { messages.push(['error', text]); };
  });
  hooks.afterEach(function() { modal.success = realSuccess; modal.error = realError; });

  function setup(context, opts) {
    var o = opts || {};
    var calls = { copy: [], findRecord: [], transitions: [], speak: [] };
    var me = EmberObject.create({ id: '1_3', user_name: 'example', preferences: { board_view_style: o.classic ? 'classic' : 'modern' } });
    var aiden = EmberObject.create({ id: '1_7', user_name: 'aiden_parker' });
    var forOther = o.forOther;
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      currentUser: me,
      sessionUser: me,
      effective_view_user: me,
      speak_mode: !!o.speak,
      edit_mode: !!o.edit,
      label_locale: 'en',
      currentBoardState: { key: o.boardKey || 'lingolinq/core-60' },
      basic_try_home: o.classic ? (o.marker === undefined ? { key: 'lingolinq/core-60', user_id: forOther ? '1_7' : '1_3', user_name: forOther ? 'aiden_parker' : 'example' } : o.marker) : null,
      board_detail_try_origin: o.classic ? null : { key: 'lingolinq/core-60', from: 'board_picker', user_id: forOther ? '1_7' : '1_3', user_name: forOther ? 'aiden_parker' : 'example' },
      home_in_speak_mode: function(args) { calls.speak.push(args); }
    }));
    context.owner.unregister('service:store');
    context.owner.register('service:store', Service.extend({
      findRecord: function(type, id) { calls.findRecord.push(id); return Promise.resolve(id === '1_7' ? aiden : me); }
    }));
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({
      transitionTo: function() { calls.transitions.push(Array.prototype.slice.call(arguments)); }
    }));
    var board = EmberObject.create({ key: 'lingolinq/core-60', name: 'Core 60' });
    var appState = context.owner.lookup('service:app-state');
    var component = context.owner.factoryFor('component:trial-bar').create({
      board: board,
      view: o.classic ? 'basic' : 'modern',
      // Modern passes the controller's marker for THIS board (try_origin_board); Basic finds its own.
      mark: o.classic ? undefined : appState.get('board_detail_try_origin'),
      preloadImages: function() { return Promise.resolve(); },
      copyAsHome: o.copyFails ?
        function() { return Promise.reject('Copy failed'); } :
        function(b, user, locale) { calls.copy.push({ board: b, user: user, locale: locale }); return Promise.resolve(EmberObject.create({ id: '1_99', key: user.get('user_name') + '/core-60' })); }
    });
    return { component: component, calls: calls, appState: appState, board: board, me: me, aiden: aiden };
  }

  test('Basic: shown on the tried board in normal mode, for yourself and for someone else', function(assert) {
    assert.true(setup(this, { classic: true }).component.get('shown'), 'for yourself');
    assert.true(setup(this, { classic: true, forOther: true }).component.get('shown'), 'for a communicator');
  });

  test('Basic: hidden on another board, in speak mode, in edit mode, or with no trial', function(assert) {
    assert.false(setup(this, { classic: true, boardKey: 'lingolinq/other' }).component.get('shown'), 'another board');
    assert.false(setup(this, { classic: true, speak: true }).component.get('shown'), 'speak mode (after Use)');
    assert.false(setup(this, { classic: true, edit: true }).component.get('shown'), 'edit mode');
    assert.false(setup(this, { classic: true, marker: null }).component.get('shown'), 'no trial');
  });

  test('Modern: shown from the marker its board page passes', function(assert) {
    assert.true(setup(this).component.get('shown'));
  });

  test('the bar names the board, and the person it is for when that is someone else', function(assert) {
    assert.strictEqual(setup(this).component.get('boardName'), 'Core 60', 'board name');
    assert.strictEqual(setup(this).component.get('forUserName'), null, 'for yourself: no name');
    assert.strictEqual(setup(this, { forOther: true }).component.get('forUserName'), 'aiden_parker', 'for a communicator');
  });

  test('Use, for yourself (Modern): makes it YOUR home board, then opens Speak Mode on your copy', async function(assert) {
    var t = setup(this);
    await t.component.use();
    assert.strictEqual(t.calls.copy.length, 1, 'copied or reused once');
    assert.strictEqual(t.calls.copy[0].user, t.me, 'for you');
    assert.strictEqual(t.calls.copy[0].board, t.board, 'the tried board');
    assert.strictEqual(t.calls.speak.length, 1, 'Speak Mode opens');
    assert.strictEqual(t.calls.speak[0].user, t.me, 'as you');
    assert.deepEqual(t.calls.speak[0].force_board_state, { id: '1_99', key: 'example/core-60' }, 'on the new home board, whatever else the user prefers');
    assert.deepEqual(t.calls.transitions, [], 'no other navigation: Speak Mode picks the page for the view');
    assert.notOk(t.appState.get('board_detail_try_origin'), 'the trial is over');
  });

  test('Use, for yourself (Basic): the same, Speak Mode opens in Basic', async function(assert) {
    var t = setup(this, { classic: true });
    await t.component.use();
    assert.strictEqual(t.calls.speak.length, 1, 'Speak Mode opens (app-state picks the Basic board page for a Basic user)');
    assert.notOk(t.appState.get('basic_try_home'), 'the trial is over');
  });

  test('Use, for a communicator: makes it THEIR home board and returns as Pick this Board does', async function(assert) {
    var t = setup(this, { classic: true, forOther: true });
    await t.component.use();
    assert.deepEqual(t.calls.findRecord, ['1_7'], 'the communicator is loaded');
    assert.strictEqual(t.calls.copy[0].user, t.aiden, 'for them, not the signed-in supporter');
    assert.deepEqual(t.calls.speak, [], 'no Speak Mode as the supporter');
    assert.deepEqual(t.calls.transitions, [['board', 'aiden_parker/core-60']], 'Basic: their new home board');
    var m = setup(this, { forOther: true });
    await m.component.use();
    assert.deepEqual(m.calls.transitions, [['user.boards', 'aiden_parker']], 'Modern: their boards list');
  });

  test('a failed Use says so and leaves the trial where it is', async function(assert) {
    var t = setup(this, { copyFails: true });
    await t.component.use();
    assert.deepEqual(messages, [['error', 'Copy failed']], 'the error is shown');
    assert.deepEqual(t.calls.speak, [], 'no Speak Mode');
    assert.ok(t.appState.get('board_detail_try_origin'), 'still trying');
  });

  test('Exit ends the trial and returns to the board picker', function(assert) {
    var t = setup(this, { classic: true });
    t.component.exit();
    assert.notOk(t.appState.get('basic_try_home'), 'Basic marker cleared');
    assert.deepEqual(t.calls.transitions, [['board-picker']], 'back to the picker');
  });

  /* RESTORED COVERAGE (adversary review, 2026-10-13). basic-try-home-button-tail-test was deleted with that
     component; its preload and sync cases now belong here (trial-bar.js#use). Finished like the picker's
     "Pick this Board": preload the new home board's images, and sync when online with auto-sync on. */
  function syncing(t, online) {
    var log = [];
    t.component.set('preloadImages', function(b) { log.push('preload ' + b.get('key')); return Promise.resolve(); });
    t.component.set('persistence', EmberObject.create({
      online: online, auto_sync: true,
      sync: function(who, a, b, reason) { log.push('sync ' + who + ' ' + reason); return Promise.resolve(); }
    }));
    return log;
  }

  test('Use, online: preloads the new home board, then syncs', async function(assert) {
    var t = setup(this);
    var log = syncing(t, true);
    await t.component.use();
    assert.deepEqual(log, ['preload example/core-60', 'sync self home_board_changed']);
  });

  test('Use, offline: preloads, no sync', async function(assert) {
    var t = setup(this);
    var log = syncing(t, false);
    await t.component.use();
    assert.deepEqual(log, ['preload example/core-60']);
  });
});
