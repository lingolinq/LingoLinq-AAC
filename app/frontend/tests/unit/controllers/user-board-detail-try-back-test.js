import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';

/*
 * The "Try this Board" return control on board-detail.
 *
 * Its whole risk is LIFETIME, not appearance. The marker is set by the picker's
 * try_board action and has to disappear again when the trial ends -- otherwise a
 * stale flag puts a "Back to picker" button on an unrelated board later in the
 * session, and pressing it would throw the user out of whatever they were doing.
 *
 * So these tests are mostly about when it must NOT show: on a different board, on
 * a folder the user drilled into, and after it has been used.
 */
module('Unit | Controller | user/board-detail try-back', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.controller = this.owner.factoryFor('controller:user/board-detail').create();
    this.controller.set('app_state', EmberObject.create({ board_detail_try_origin: null }));
    this.controller.set('user', EmberObject.create({ user_name: 'example' }));
    this.controller.set('boardname', 'communikate-home');
  });

  hooks.afterEach(function() {
    if(this.controller) { this.controller.destroy(); this.controller = null; }
  });

  test('hidden when the user did not arrive via Try this Board', function(assert) {
    assert.false(this.controller.get('show_try_back_nav'),
      'the ordinary way onto a board must not grow a Back-to-picker control');
  });

  test('shown on the board the trial was started for', function(assert) {
    this.controller.set('app_state.board_detail_try_origin',
      { key: 'example/communikate-home', from: 'board_picker' });
    assert.true(this.controller.get('show_try_back_nav'),
      'this is the board they came to try');
  });

  test('hidden once they navigate to a DIFFERENT board', function(assert) {
    // The trap this guards: a bare boolean marker would keep the button alive
    // across every board the user reaches next, and it would still claim to go
    // "back" to a picker they left several boards ago.
    this.controller.set('app_state.board_detail_try_origin',
      { key: 'example/communikate-home', from: 'board_picker' });
    this.controller.set('boardname', 'communikate-action');
    assert.false(this.controller.get('show_try_back_nav'),
      'drilling into another board ends the trial as far as this control is concerned');
  });

  test('a marker with no key never shows it', function(assert) {
    this.controller.set('app_state.board_detail_try_origin', { from: 'board_picker' });
    assert.false(this.controller.get('show_try_back_nav'),
      'an unusable marker must fail closed, not paint a button that cannot be right');
  });

  test('using it clears the marker and returns to the picker LIST', function(assert) {
    assert.expect(3);
    this.controller.set('app_state.board_detail_try_origin',
      { key: 'example/communikate-home', from: 'board_picker' });
    var transitions = [];
    this.controller.set('router', EmberObject.create({
      transitionTo: function() { transitions.push(Array.prototype.slice.call(arguments)); }
    }));

    this.controller.actions.try_back_to_picker.call(this.controller);

    assert.deepEqual(transitions, [['board-picker']],
      'lands on the picker list, not back inside the preview overlay');
    assert.strictEqual(this.controller.get('app_state.board_detail_try_origin'), null,
      'the marker is consumed, so the button does not survive the trip');
    assert.false(this.controller.get('show_try_back_nav'), 'and the control is gone');
  });
});
