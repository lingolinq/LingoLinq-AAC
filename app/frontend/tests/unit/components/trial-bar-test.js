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
    var calls = { copy: [], findRecord: [], transitions: [], speak: [], saved: [], discarded: [], stash: {} };
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
    var board = EmberObject.create({ id: '1_60', key: 'lingolinq/core-60', name: 'Core 60' });
    var appState = context.owner.lookup('service:app-state');
    var component = context.owner.factoryFor('component:trial-bar').create({
      board: board,
      view: o.classic ? 'basic' : 'modern',
      // Modern passes the controller's marker for THIS board (try_origin_board); Basic finds its own.
      mark: o.classic ? undefined : appState.get('board_detail_try_origin'),
      preloadImages: function() { return Promise.resolve(); },
      // The tried board is saved as the home board FIRST (final review, 2026-10-13), so the message is true.
      saveHome: o.saveFails ? function() { return Promise.reject('Save failed'); } :
        function(user, b) { calls.saved.push([user.get('user_name'), b.get('key')]); return Promise.resolve(user); },
      discardCopy: function(ids) { calls.discarded.push(ids); return Promise.resolve(); },
      stashes: { get: function(k) { return calls.stash[k]; }, persist: function(k, v) { calls.stash[k] = v; } },
      copyAsHome: o.copyFails ?
        function() { return Promise.reject('Copy failed'); } :
        function(b, user, locale, copyOpts) {
          calls.copy.push({ board: b, user: user, locale: locale, opts: copyOpts });
          var made = EmberObject.create({ id: '1_99', key: user.get('user_name') + '/core-60' });
          // `copyPending`: the copy finishes only when the test says so, as a long copy does.
          if (o.copyPending) {
            return new Promise(function(resolve, reject) {
              o.copyPending(function() {
                // As copy_or_reuse_as_home does when its cancel check says yes at the home-save moment.
                if (copyOpts && copyOpts.isCancelled && copyOpts.isCancelled()) { reject({ cancelled: true, board: made, new_board_ids: ['1_99'] }); } else { resolve(made); }
              });
            });
          }
          return Promise.resolve(made);
        }
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

  /* USE THIS BOARD OPENS SPEAK MODE RIGHT AWAY (requested 2026-10-13: "Use this board opens Speak Mode right
     away with 'Vocal Flair 40 is now your home board.' The copy finishes in the background."). It used to wait
     for the whole copy (about 30 seconds for a large set) before Speak Mode opened. Rewritten for that request:
     Speak Mode opens on the TRIED board at once, the copy then becomes the home board, and while it is copying
     Home goes to the tried board (`home_copy_pending`, controllers/user/board-detail.js#_trial_home). */
  test('Use, for yourself (Modern): Speak Mode opens right away on the board, and it says so', async function(assert) {
    var finish;
    var t = setup(this, { copyPending: function(f) { finish = f; } });
    var using = t.component.use();
    await new Promise(function(r) { setTimeout(r, 0); });
    assert.deepEqual(t.calls.saved, [['example', 'lingolinq/core-60']], 'the tried board is saved as the home board first, so the message is true');
    assert.strictEqual(t.calls.speak.length, 1, 'Speak Mode opens before the copy finishes');
    assert.strictEqual(t.calls.speak[0].user, t.me, 'as you');
    assert.deepEqual(t.calls.speak[0].force_board_state, { id: '1_60', key: 'lingolinq/core-60' }, 'on the board they tried');
    assert.deepEqual(messages, [['success', 'Core 60 is now your home board.']], 'and says so');
    assert.notOk(t.appState.get('board_detail_try_origin'), 'the trial is over');
    assert.deepEqual(t.appState.get('home_copy_pending'), { id: '1_60', key: 'lingolinq/core-60' }, 'Home goes to it while copying');
    assert.strictEqual(t.calls.copy.length, 1, 'the copy is under way, for you');
    assert.strictEqual(t.calls.copy[0].user, t.me);
    finish();
    await using;
    assert.notOk(t.appState.get('home_copy_pending'), 'copy done: their own copy is the home board now');
    assert.deepEqual(t.calls.transitions, [], 'no other navigation');
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

  test('a copy that fails after Speak Mode opened says so; the tried board stays the home board', async function(assert) {
    var t = setup(this, { copyFails: true });
    await t.component.use();
    assert.strictEqual(t.calls.speak.length, 1, 'Speak Mode had already opened');
    assert.deepEqual(messages[messages.length - 1], ['error', "Core 60 is your home board, but your own copy of it couldn't be made. You can copy it later from Boards."], 'the error is shown, and true');
    assert.notOk(t.appState.get('home_copy_pending'), 'nothing left pending');
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

  /* TRY ANOTHER AND CLOSE (requested 2026-10-13: "Trying Vocal Flair 40 · Use this board · Try another ·
     Close"). Try another is the old Exit (back to the picker, in its place); Close ends the trial and goes to
     the home page. In Modern it goes through the board page's own exit (`onClose`, exit_to_home, which asks
     for the Speak Mode PIN when one is set). */
  test('Close (Basic) ends the trial and goes to the home page', function(assert) {
    var t = setup(this, { classic: true });
    t.component.close();
    assert.notOk(t.appState.get('basic_try_home'), 'Basic marker cleared');
    assert.deepEqual(t.calls.transitions, [['index']], 'the home page');
  });

  test('Close (Modern) uses the board page\'s own exit', function(assert) {
    var t = setup(this);
    var used = [];
    t.component.set('onClose', function() { used.push(true); });
    t.component.close();
    assert.deepEqual(used, [true], 'its PIN-checked Exit Boards');
    assert.deepEqual(t.calls.transitions, [], 'no second navigation');
  });

  /* FINAL REVIEW (2026-10-13), High: "is now your home board" was said ~30s before anything was saved (the copy
     saves the home board when it finishes), so closing the app meanwhile left the old home board; and two quick
     Uses raced. Now the tried board is saved as home first; the copy replaces it only if it is still the latest
     choice, and a superseded copy is removed. When the copy lands, this Speak Mode session's home follows it. */
  test('if the home board cannot be saved, nothing claims it was', async function(assert) {
    var t = setup(this, { saveFails: true });
    await t.component.use();
    assert.deepEqual(messages, [['error', 'Save failed']], 'the error');
    assert.strictEqual(t.calls.speak.length, 0, 'no Speak Mode');
    assert.strictEqual(t.calls.copy.length, 0, 'no copy');
    assert.ok(t.appState.get('board_detail_try_origin'), 'still trying it');
  });

  test('a newer choice wins: a superseded copy does not become home and is removed', async function(assert) {
    var finish;
    var t = setup(this, { copyPending: function(f) { finish = f; } });
    var using = t.component.use();
    await new Promise(function(r) { setTimeout(r, 0); });
    t.appState.set('home_copy_pending', { id: '1_70', key: 'lingolinq/other' }); // they chose another board meanwhile
    finish();
    await using;
    assert.deepEqual(t.calls.discarded, [['1_99']], 'the superseded copy is removed');
    assert.deepEqual(t.appState.get('home_copy_pending'), { id: '1_70', key: 'lingolinq/other' }, 'the newer choice is left alone');
  });

  test('when the copy lands, this Speak Mode session\'s home follows it', async function(assert) {
    var finish;
    var t = setup(this, { copyPending: function(f) { finish = f; } });
    var using = t.component.use();
    await new Promise(function(r) { setTimeout(r, 0); });
    t.calls.stash.root_board_state = { id: '1_60', key: 'lingolinq/core-60' }; // Speak Mode entered on the tried board
    finish();
    await using;
    assert.deepEqual(t.calls.stash.root_board_state, { id: '1_99', key: 'example/core-60' }, 'their own copy');
  });
});
