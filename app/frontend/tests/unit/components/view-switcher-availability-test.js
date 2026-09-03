import { module, test } from 'qunit';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* The navbar View switch decides whether to render at all through `available`.
 * That one computed is a safety gate, not a cosmetic one, so each state it
 * excludes is pinned here.
 *
 * EDIT MODE is the case with teeth. Switching view on a board transitions to the
 * counterpart route, and `app-state.global_transition` reacts to leaving
 * `user.board-detail.edit` by calling `toggle_edit_mode()` (services/app-state.js:734),
 * which runs `editManager.clear_history()` and abandons the edit session. The two
 * deliberate exits from edit mode both put `confirm-discard-changes` in front of
 * that (controllers/user/board-detail.js:8797, :8806); a switcher offered during
 * edit mode is a third exit with no such prompt, so it must not be offered.
 *
 * app-state is stubbed rather than used live: `edit_mode` is a real computed over
 * `stashes.current_mode` + `currentBoardState` (app-state.js:3217), and driving it
 * for real would mean standing up a board and a stashes service to test one boolean.
 */
module('Unit | Component | view-switcher availability', function(hooks) {
  setupTest(hooks);

  function stubAppState(context, props) {
    // UNREGISTER FIRST. A bare `register` over an already-registered service is
    // silently ignored, yielding a service whose every property reads `undefined` —
    // which makes every `assert.false` below pass for the wrong reason. Same reason
    // boards-layout-toggle-test.js#withUser unregisters before registering.
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend(props));
  }

  function switcher(context) {
    return context.owner.factoryFor('component:view-switcher').create();
  }

  test('renders for a signed-in user who is not in speak or edit mode', function(assert) {
    stubAppState(this, { currentUser: { id: 'u1' }, speak_mode: false, edit_mode: false });
    assert.true(switcher(this).get('available'), 'the switch is offered on an ordinary page');
  });

  test('is hidden with no signed-in user', function(assert) {
    stubAppState(this, { currentUser: null, speak_mode: false, edit_mode: false });
    assert.false(switcher(this).get('available'), 'nobody to hold the preference');
  });

  test('is hidden in speak mode', function(assert) {
    stubAppState(this, { currentUser: { id: 'u1' }, speak_mode: true, edit_mode: false });
    assert.false(switcher(this).get('available'), 'speak mode is a locked-down surface');
  });

  // The regression this file exists for: without the edit_mode clause the switch
  // renders over an open edit session and discards it with no discard prompt.
  test('is hidden while editing a board, so it cannot bypass the discard prompt', function(assert) {
    stubAppState(this, { currentUser: { id: 'u1' }, speak_mode: false, edit_mode: true });
    assert.false(switcher(this).get('available'), 'no unprompted exit from an edit session');
  });
});

