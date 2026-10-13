import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';

/* A TRIAL LASTS THROUGH THE TRIED BOARD'S OWN FOLDERS (tablet report, 2026-10-13: "The exit button
 * disappears ... In a folder it becomes Home plus a small Back", and "Home inside the Vocal Flair 40 trial
 * opened Quick Core 60, the board tried first"). Measured live: inside Vocal Flair 40's "places" folder the
 * trial bar was gone, and Home left the trial for the user's own home board.
 *
 * The trial is the tried board and every board reached from it by its folders: board-detail's trail
 * (`app_state.board_detail_nav_history`, pushed on each folder) contains the tried board. Home, during a
 * trial, returns to the tried board's main page. */
module('Unit | Controller | user/board-detail trial through folders', function(hooks) {
  setupTest(hooks);

  var TRIED = { key: 'lingolinq/vocal-flair-40', name: 'Vocal Flair 40', from: 'board_picker' };

  function page(owner, opts) {
    var calls = [];
    var c = owner.factoryFor('controller:user/board-detail').create();
    c.set('app_state', EmberObject.create({
      board_detail_try_origin: opts.origin === undefined ? TRIED : opts.origin,
      board_detail_nav_history: opts.history || [],
      currentUser: EmberObject.create({ preferences: { home_board: { key: 'aiden/vocal-flair-60', id: '1_60' } } }),
      restore_session_locale_override: function() {}
    }));
    c.set('stashes', EmberObject.create({ sticky_board: false }));
    c.set('router', { transitionTo: function() { calls.push(Array.prototype.slice.call(arguments)); } });
    c.set('user', EmberObject.create({ user_name: opts.user }));
    c.set('boardname', opts.board);
    return { c: c, calls: calls };
  }

  test('the bar stays in a folder of the tried board', function(assert) {
    var t = page(this.owner, { user: 'lingolinq', board: 'vocal-flair-40-places_2', history: [{ user_name: 'lingolinq', boardname: 'vocal-flair-40' }] });
    assert.strictEqual(t.c.get('try_origin_board'), TRIED);
  });

  test('two folders deep, too', function(assert) {
    var t = page(this.owner, { user: 'lingolinq', board: 'vocal-flair-40-food_9', history: [
      { user_name: 'lingolinq', boardname: 'vocal-flair-40' }, { user_name: 'lingolinq', boardname: 'vocal-flair-40-places_2' }] });
    assert.strictEqual(t.c.get('try_origin_board'), TRIED);
  });

  test('CONTROL: not on a board the trial never reached', function(assert) {
    var t = page(this.owner, { user: 'aiden', board: 'vocal-flair-60', history: [{ user_name: 'lingolinq', boardname: 'quick-core-60' }] });
    assert.strictEqual(t.c.get('try_origin_board'), null);
  });

  test('Home during a trial returns to the tried board\'s main page', function(assert) {
    var t = page(this.owner, { user: 'lingolinq', board: 'vocal-flair-40-places_2', history: [{ user_name: 'lingolinq', boardname: 'vocal-flair-40' }] });
    t.c.send('go_home');
    assert.deepEqual(t.calls, [['user.board-detail', 'lingolinq', 'vocal-flair-40']], 'the tried board, not their own home board');
    assert.deepEqual(t.c.get('app_state.board_detail_nav_history'), [], 'its trail starts again');
    assert.strictEqual(t.c.get('app_state.board_detail_try_origin'), TRIED, 'still trying it');
  });

  test('CONTROL: Home outside a trial goes to their own home board', function(assert) {
    var t = page(this.owner, { origin: null, user: 'lingolinq', board: 'quick-core-60' });
    t.c.send('go_home');
    assert.deepEqual(t.calls, [['user.board-detail', 'aiden', 'vocal-flair-60']]);
  });

  // "Use this board" opens Speak Mode at once and copies in the background (components/trial-bar.js#use); until
  // the copy is the home board, Home goes to the board they chose, not their old home board.
  test('Home while the chosen board is still copying goes to it', function(assert) {
    var t = page(this.owner, { origin: null, user: 'lingolinq', board: 'vocal-flair-40-places_2' });
    t.c.set('app_state.home_copy_pending', { id: '1_40', key: 'lingolinq/vocal-flair-40' });
    t.c.send('go_home');
    assert.deepEqual(t.calls, [['user.board-detail', 'lingolinq', 'vocal-flair-40']]);
  });
});
