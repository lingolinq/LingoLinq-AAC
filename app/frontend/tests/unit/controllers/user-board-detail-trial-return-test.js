import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';

/* TWO GAPS IN A MODERN TRIAL, both measured live on develop (2026-11-20, 1280x800 touch):
 *
 * 1. "Try another" for someone else. An SLP opened the picker for a communicator (/board-picker?user_id=1_40),
 *    tried a board, and "Try another" brought back the SLP's OWN picker (/board-picker, for_self true): the
 *    picker's route clears `user_id` when it is left (routes/board-picker.js resetController), and the trial
 *    did not carry it back. The next board chosen would have gone to the wrong person.
 *
 * 2. The device back gesture after Home. Try -> a folder -> Home -> back: the folder came back without the
 *    trial bar. Home starts the trail again (_trial_home), and the trail was the only record that the folder
 *    was reached from the tried board (trial_includes). */
module('Unit | Controller | user/board-detail trial return', function(hooks) {
  setupTest(hooks);

  var ELENA = EmberObject.create({ id: 'self', global_id: '1_25', user_name: 'elena_rodriguez_slp' });

  function page(owner, opts) {
    var calls = [];
    var c = owner.factoryFor('controller:user/board-detail').create();
    c.set('app_state', EmberObject.create({
      board_detail_try_origin: opts.origin,
      board_detail_nav_history: opts.history || [],
      currentUser: ELENA, sessionUser: ELENA,
      restore_session_locale_override: function() {}
    }));
    c.set('stashes', EmberObject.create({ sticky_board: false }));
    c.set('router', { transitionTo: function() { calls.push(Array.prototype.slice.call(arguments)); } });
    c.set('user', EmberObject.create({ user_name: opts.user || 'lingolinq' }));
    c.set('boardname', opts.board || 'vocal-flair-40');
    return { c: c, calls: calls };
  }

  test('Try another for a communicator returns to THEIR picker', function(assert) {
    var t = page(this.owner, { origin: { key: 'lingolinq/vocal-flair-40', name: 'Vocal Flair 40', from: 'board_picker', user_id: '1_40', user_name: 'oliver_harris' } });
    t.c.send('try_back_to_picker');
    assert.deepEqual(t.calls, [['board-picker', { queryParams: { user_id: '1_40' } }]], 'the picker for Oliver, not for the SLP');
    assert.strictEqual(t.c.get('app_state.board_detail_try_origin'), null, 'the trial is over');
  });

  test('CONTROL: Try another for yourself is the plain picker, as before', function(assert) {
    var t = page(this.owner, { origin: { key: 'lingolinq/vocal-flair-40', from: 'board_picker', user_id: '1_25', user_name: 'elena_rodriguez_slp' } });
    t.c.send('try_back_to_picker');
    assert.deepEqual(t.calls, [['board-picker']]);
  });

  test('after Home, the back gesture into a folder of the trial keeps the trial', function(assert) {
    var tried = { key: 'lingolinq/vocal-flair-40', name: 'Vocal Flair 40', from: 'board_picker', user_id: '1_25', user_name: 'elena_rodriguez_slp' };
    // In the "places" folder, reached from the tried board.
    var t = page(this.owner, { origin: tried, board: 'vocal-flair-40-places_2', history: [{ user_name: 'lingolinq', boardname: 'vocal-flair-40' }] });
    assert.strictEqual(t.c.get('try_origin_board'), tried, 'in the folder: in the trial');
    // Home: the tried board's main page, and the trail starts again.
    t.c.send('go_home');
    assert.deepEqual(t.c.get('app_state.board_detail_nav_history'), [], 'the trail starts again');
    t.c.set('boardname', 'vocal-flair-40');
    // The device back gesture: the folder again, with an empty trail.
    t.c.set('boardname', 'vocal-flair-40-places_2');
    assert.strictEqual(t.c.get('try_origin_board'), tried, 'back in the folder: still in the trial, so the bar shows');
  });

  test('CONTROL: a board the trial never reached is not part of it', function(assert) {
    var tried = { key: 'lingolinq/vocal-flair-40', from: 'board_picker' };
    var t = page(this.owner, { origin: tried, board: 'vocal-flair-40-places_2', history: [{ user_name: 'lingolinq', boardname: 'vocal-flair-40' }] });
    assert.strictEqual(t.c.get('try_origin_board'), tried);
    t.c.send('go_home');
    t.c.set('user', EmberObject.create({ user_name: 'elena_rodriguez_slp' }));
    t.c.set('boardname', 'my-own-board');
    assert.strictEqual(t.c.get('try_origin_board'), null, 'their own board, never reached from the trial');
  });
});
