import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';
import { remember_trial } from 'frontend/utils/board_picker_trials';

/* TRY ANOTHER RETURNS TO THE SAME SPOT IN THE PICKER, WITH "RECENTLY TRIED" CHIPS (tablet report and request,
 * 2026-10-13: "Back loses your place. Returning from a trial puts you at the top of the picker"; "Try another
 * returns to the same spot in the picker, with 'Recently tried' chips"). Measured live: the picker had "All
 * Available Boards" open and #content scrolled 294px; after the trial it showed "Robust Vocabularies" at the top.
 *
 * Recorded when it happens, not when the picker is torn down (the picker page rebuilds its picker during page
 * changes, measured live, so a teardown save recorded a fresh picker's defaults): the category when one is
 * chosen (components/board-picker.js, set_category), the scroll and the board when Try is pressed
 * (utils/board_picker_trials.js#remember_trial, from board-preview-overlay.js#try_board). */
module('Unit | Component | board-picker returns to its place', function(hooks) {
  setupTest(hooks);

  function picker(owner, scroller, opts) {
    var c = owner.factoryFor('component:board-picker').create(Object.assign({ searchAtTop: true, restoreWindow: 300 }, opts || {}));
    c._pickerScroller = function() { return scroller; };
    var sent = [];
    c.send = function() { sent.push(Array.prototype.slice.call(arguments)); };
    return { c: c, sent: sent, appState: owner.lookup('service:app-state') };
  }
  var wait = function(ms) { return new Promise(function(r) { setTimeout(r, ms); }); };
  function board(key, name) { return EmberObject.create({ key: key, name: name, icon_url_with_fallback: '/img/' + name + '.png' }); }

  test('Try records the place (category, scroll) and the board, newest first, no repeats', function(assert) {
    var appState = this.owner.lookup('service:app-state');
    appState.set('board_picker_recent', []);
    appState.set('board_picker_category', 'available_boards');
    remember_trial(appState, board('lingolinq/quick-core-60', 'Quick Core 60'), { scrollTop: 294 });
    remember_trial(appState, board('lingolinq/vocal-flair-40', 'Vocal Flair 40'), { scrollTop: 310 });
    remember_trial(appState, board('lingolinq/quick-core-60', 'Quick Core 60'), { scrollTop: 294 });
    assert.deepEqual(appState.get('board_picker_return'), { category: 'available_boards', scrollTop: 294 });
    assert.deepEqual(appState.get('board_picker_recent').map(function(r) { return r.key; }),
      ['lingolinq/quick-core-60', 'lingolinq/vocal-flair-40'], 'newest first, no repeats');
    assert.strictEqual(appState.get('board_picker_recent')[0].name, 'Quick Core 60');
  });

  test('at most six recently tried', function(assert) {
    var appState = this.owner.lookup('service:app-state');
    appState.set('board_picker_recent', []);
    for (var i = 0; i < 8; i++) { remember_trial(appState, board('lingolinq/b' + i, 'B' + i), { scrollTop: 0 }); }
    assert.strictEqual(appState.get('board_picker_recent').length, 6);
    assert.strictEqual(appState.get('board_picker_recent')[0].key, 'lingolinq/b7');
  });

  test('back from a trial: the category reopens and the scroll comes back, also for a rebuilt picker', async function(assert) {
    var scroller = { scrollTop: 0, scrollHeight: 2000, clientHeight: 800 };
    var t = picker(this.owner, scroller);
    t.appState.set('board_picker_return', { category: 'available_boards', scrollTop: 294 });
    t.appState.set('board_picker_restore', true);
    t.c.set('category_boards', { loading: false });
    t.c._restorePickerPlace();
    await wait(100);
    assert.deepEqual(t.sent, [['set_category', 'available_boards']], 'the category reopens');
    assert.strictEqual(scroller.scrollTop, 294, 'scrolled back');
    var rebuilt = picker(this.owner, { scrollTop: 0, scrollHeight: 2000, clientHeight: 800 });
    rebuilt.c.set('category_boards', { loading: false });
    rebuilt.c._restorePickerPlace();
    await wait(100);
    assert.deepEqual(rebuilt.sent, [['set_category', 'available_boards']], 'a picker rebuilt just after also comes back');
    await wait(400);
    assert.false(!!t.appState.get('board_picker_restore'), 'the request ends after a few seconds');
  });

  test('CONTROL: a plain visit starts at the top', async function(assert) {
    var scroller = { scrollTop: 0, scrollHeight: 2000, clientHeight: 800 };
    var t = picker(this.owner, scroller);
    t.appState.set('board_picker_return', { category: 'available_boards', scrollTop: 294 });
    t.appState.set('board_picker_restore', false);
    t.c._restorePickerPlace();
    await wait(100);
    assert.deepEqual(t.sent, []);
    assert.strictEqual(scroller.scrollTop, 0);
  });

  test('CONTROL: other pickers (the tour\'s, setup\'s) are left alone', async function(assert) {
    var scroller = { scrollTop: 0, scrollHeight: 2000, clientHeight: 800 };
    var t = picker(this.owner, scroller, { searchAtTop: false });
    t.appState.set('board_picker_return', { category: 'available_boards', scrollTop: 294 });
    t.appState.set('board_picker_restore', true);
    t.c._restorePickerPlace();
    await wait(100);
    assert.deepEqual(t.sent, []);
    t.appState.set('board_picker_restore', false);
  });
});
