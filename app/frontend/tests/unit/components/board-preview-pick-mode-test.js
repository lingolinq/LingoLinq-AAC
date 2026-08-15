import { setupTest } from 'frontend/tests/helpers';
import { run } from '@ember/runloop';
import * as QUnit from 'qunit';

/*
 * board-preview decides whether its footer offers to ASSIGN the board
 * ("Pick this Board" -> board-preview-overlay#pick_for_home, which copies it to
 * `setup_user || currentUser` and sets it as their home board) or merely to open
 * it ("Try This Board" -> `select` -> home_in_speak_mode for whoever is SIGNED
 * IN). Getting that wrong is silent and expensive in both directions:
 *
 *   - too narrow, and a card whose label promises to choose a board for someone
 *     cannot do it. That was the live bug: the gate read ONLY
 *     appState.tour_board_picker_active, which just the board-picker tour sets,
 *     so the eval report's "Preview & choose for <user>" card rendered the
 *     ordinary details footer. `recommend` was threaded from
 *     utils/modal#board_preview through services/modal onto the settings object
 *     and then read by nothing at all.
 *
 *   - too broad, and an ORDINARY board preview grows an assign CTA. This
 *     component is shared by board-icon (library/My Boards) and button-settings,
 *     neither of which passes opts, so `recommend` must stay falsy for them.
 *
 * There is no acceptance coverage for this component, so these pin the decision
 * itself. Live counterparts, against the running app, are the eval-report probes
 * in the 2026-08-15 P0 walkthrough log.
 */
QUnit.module('Unit | board-preview pick mode', function(hooks) {
  setupTest(hooks);

  hooks.afterEach(function() {
    const app = this.owner.lookup('service:app-state');
    if (app) { app.set('tour_board_picker_active', false); }
  });

  function build(owner, props) {
    return owner.factoryFor('component:board-preview').create(props || {});
  }

  QUnit.test('offers the assign CTA for a RECOMMENDED preview, with no tour active', function(assert) {
    const app = this.owner.lookup('service:app-state');
    app.set('tour_board_picker_active', false);

    const c = build(this.owner, { recommend: true });

    assert.true(c.get('pick_for_home_mode'),
      'the eval report opens the preview with recommend:true and nothing else; without this its "Preview & choose for <user>" CTA cannot assign at all');

    run(() => c.destroy());
  });

  QUnit.test('still offers the assign CTA inside the board-picker tour', function(assert) {
    const app = this.owner.lookup('service:app-state');
    app.set('tour_board_picker_active', true);

    const c = build(this.owner, {});

    assert.true(c.get('pick_for_home_mode'),
      'routes/board-picker.js arms this flag for the whole route visit; the tour must keep its "Pick this Board" CTA');

    run(() => c.destroy());
  });

  /*
   * The regression guard for the shared component. board-icon and
   * button-settings call modal.board_preview WITHOUT opts, so `recommend` is
   * undefined for them. If this ever returns true, every ordinary board preview
   * in the app silently gains a button that copies the board and reassigns
   * someone's home board.
   */
  QUnit.test('does NOT offer the assign CTA for an ordinary preview', function(assert) {
    const app = this.owner.lookup('service:app-state');
    app.set('tour_board_picker_active', false);

    const c = build(this.owner, {});

    assert.false(c.get('pick_for_home_mode'),
      'an ordinary board preview must keep "Try This Board"; an assign CTA here would reassign a home board from the library');

    run(() => c.destroy());
  });

  QUnit.test('treats an explicitly false recommend as ordinary', function(assert) {
    const app = this.owner.lookup('service:app-state');
    app.set('tour_board_picker_active', false);

    // utils/modal#board_preview always sets the key, as `!!(opts && opts.recommend)`,
    // so the common case is a literal false rather than undefined.
    const c = build(this.owner, { recommend: false });

    assert.false(c.get('pick_for_home_mode'), 'false must not be read as "assign"');

    run(() => c.destroy());
  });

  /*
   * The dismiss button is shared by both assign paths, but "Back to Picker" is a
   * lie when no picker is behind the preview — which is the case for the eval
   * report. It keys on the tour flag alone, NOT on pick_for_home_mode.
   */
  QUnit.test('labels the dismiss button for the context that opened it', function(assert) {
    const app = this.owner.lookup('service:app-state');

    app.set('tour_board_picker_active', true);
    const inTour = build(this.owner, {});
    const tourLabel = inTour.get('dismiss_label');
    run(() => inTour.destroy());

    app.set('tour_board_picker_active', false);
    const recommended = build(this.owner, { recommend: true });
    const recommendLabel = recommended.get('dismiss_label');
    run(() => recommended.destroy());

    assert.ok(tourLabel && tourLabel.length, 'tour dismiss label resolves');
    assert.ok(recommendLabel && recommendLabel.length, 'recommended dismiss label resolves');
    assert.notStrictEqual(tourLabel, recommendLabel,
      'a recommended preview has no picker to go "Back to Picker" to, so it must not reuse the tour label');
  });
});
