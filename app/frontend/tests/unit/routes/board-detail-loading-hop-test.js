import { module, test } from 'qunit';
import { setupTest } from '../../helpers';

/* TAPPING A FOLDER MUST NOT CLEAR THE SENTENCE (Traci, Android phone, 2026-11-14).
 *
 * A folder whose board is not in memory takes long enough that Ember shows the loading substate
 * (templates/user/board-detail-loading.hbs, `user.board-detail_loading`). Entering it exits `user.board-detail`, so
 * the route's resetController ran with isExiting = true and did a real exit's cleanup: the bar's words
 * (`sentence_parts`) emptied, edit mode switched off, and the mode put back to default. Measured on the Android
 * emulator: after "I want" and a folder tap the bar showed nothing while app_state.button_list still held both
 * words; resetController was called with {to: 'user.board-detail_loading', intermediate} while the real transition
 * went to 'user.board-detail.index'. A fast hop never reaches the substate and never ran that cleanup. */
module('Unit | Route | user/board-detail loading hop', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.route = this.owner.lookup('route:user/board-detail');
    this.controller = this.owner.lookup('controller:user/board-detail');
    this.appState = this.owner.lookup('service:app-state');
    this.prior_layout = this.appState.get('board_layout_mode');
    this.appState.set('board_layout_mode', false);
    this.controller.set('sentence_parts', [{ id: 'b1', label: 'I' }, { id: 'b2', label: 'want' }]);
    this.controller.set('edit_mode', true);
  });

  hooks.afterEach(function() {
    this.controller.set('sentence_parts', []);
    this.controller.set('edit_mode', false);
    this.controller.set('_was_not_speak_mode', false);
    this.appState.set('board_layout_mode', this.prior_layout);
  });

  function into(name) {
    return { to: { name: name }, targetName: name, isIntermediate: true };
  }

  test('a hop through the board loading screen keeps the sentence and the mode', function(assert) {
    this.route.resetController(this.controller, true, into('user.board-detail_loading'));
    assert.deepEqual((this.controller.get('sentence_parts') || []).map(function(p) { return p.label; }), ['I', 'want'], 'the words stay in the bar');
    assert.true(this.controller.get('edit_mode'), 'edit mode stays on');
  });

  test('really leaving the board page still clears the sentence and edit mode', function(assert) {
    this.route.resetController(this.controller, true, into('user.index'));
    assert.deepEqual(this.controller.get('sentence_parts'), [], 'cleared on a real exit');
    assert.false(this.controller.get('edit_mode'));
  });

  test('an exit with no transition passed is still a real exit', function(assert) {
    this.route.resetController(this.controller, true);
    assert.deepEqual(this.controller.get('sentence_parts'), []);
  });
});
