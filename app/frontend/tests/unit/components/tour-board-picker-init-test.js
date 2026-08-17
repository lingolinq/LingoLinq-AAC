import { setupTest } from 'frontend/tests/helpers';
import { run } from '@ember/runloop';
import * as QUnit from 'qunit';

/*
 * tour-board-picker used to declare TWO `init` keys in one object literal. In a
 * JS object literal the LAST key wins, so the first never ran and
 * `appState.tour_board_picker_active` was never armed. `willDestroy` still set
 * it false, which hid the asymmetry. Merged 2026-08-11.
 *
 * What the flag drives: inside the tour, a card tap must open the board PREVIEW
 * (whose CTA becomes "Pick this Board") rather than navigating the user away to
 * Speak Mode and abandoning the tour (board-icon.js, board-preview.js
 * #pick_for_home_mode). The only other writer that sets it TRUE is
 * board-preview-overlay.js#_handlePickError, an error path, so nothing
 * compensated on the normal open.
 *
 * The other two tests cover defects the adversarial review caught in the first
 * version of that fix: reading currentUser instead of appState.setup_user (a
 * silent wrong-user home-board write in the supervisor flow), and clearing a
 * flag routes/board-picker.js owns for the whole route visit.
 *
 * Fast counterpart to scripts/tour-board-picker-probe.mjs, which proves the
 * flag behaviour against the running app.
 */
QUnit.module('Unit | tour-board-picker init', function(hooks) {
  setupTest(hooks);

  hooks.afterEach(function() {
    const app = this.owner.lookup('service:app-state');
    if (app) { app.set('tour_board_picker_active', false); }
  });

  QUnit.test('arms tour_board_picker_active on construction', function(assert) {
    const app = this.owner.lookup('service:app-state');
    app.set('tour_board_picker_active', false);

    const c = this.owner.factoryFor('component:tour-board-picker').create();

    assert.true(app.get('tour_board_picker_active'),
      'the tour must arm the flag, or a card tap navigates away instead of previewing');

    run(() => c.destroy());
  });

  /*
   * Second casualty of the same dead init: `setup_user` stayed at its `null`
   * default, so `assign_default_home_board` bailed with "Home board update
   * failed unexpectedly" — the tour's one-click Vocal Flair 84 assignment could
   * never work at all.
   */
  QUnit.test('populates setup_user, which the quick-assign action depends on', function(assert) {
    const app = this.owner.lookup('service:app-state');
    const fakeUser = { id: 'u1', save() { return Promise.resolve(this); } };
    app.set('setup_user', null);
    app.set('currentUser', fakeUser);

    const c = this.owner.factoryFor('component:tour-board-picker').create();

    assert.strictEqual(c.get('setup_user'), fakeUser,
      'falls back to the current user, or assign_default_home_board errors immediately');

    run(() => c.destroy());
  });

  /*
   * The supervisor flow. controllers/board-picker#_resolve_setup_user turns
   * ?user_id=<supervisee> into appState.setup_user, and the pick path honors it
   * (board-preview-overlay.js:266). If the quick-assign action read currentUser
   * instead, "Pick this Board" would assign to the supervisee while "Assign a
   * Home Board For Me" assigned to the SUPERVISOR — a silent wrong-user write
   * to the field that decides what a communicator sees.
   */
  QUnit.test('prefers appState.setup_user so a supervisor assigns to the supervisee', function(assert) {
    const app = this.owner.lookup('service:app-state');
    const supervisor = { id: 'sup', save() { return Promise.resolve(this); } };
    const supervisee = { id: 'kid', save() { return Promise.resolve(this); } };
    app.set('currentUser', supervisor);
    app.set('setup_user', supervisee);

    const c = this.owner.factoryFor('component:tour-board-picker').create();

    assert.strictEqual(c.get('setup_user'), supervisee,
      'the pick is FOR the supervisee, matching board-preview-overlay.js:266');

    run(() => c.destroy());
    app.set('setup_user', null);
  });

  /*
   * routes/board-picker.js owns the same flag for a whole route visit
   * (activate -> true, deactivate -> false) and the tour opens on top of it.
   * Clearing unconditionally on modal close would strand the picker behind us
   * with card taps routing to Speak Mode.
   */
  QUnit.test('does not disarm a flag the board-picker route already owned', function(assert) {
    const app = this.owner.lookup('service:app-state');
    app.set('tour_board_picker_active', true);   // the route armed it

    const c = this.owner.factoryFor('component:tour-board-picker').create();
    run(() => c.destroy());

    assert.true(app.get('tour_board_picker_active'),
      'the route still owns it, so the modal must leave it armed');
  });

  QUnit.test('clears the flag on teardown', function(assert) {
    const app = this.owner.lookup('service:app-state');
    const c = this.owner.factoryFor('component:tour-board-picker').create();
    assert.true(app.get('tour_board_picker_active'), 'armed while alive');

    // destroy() is runloop-SCHEDULED, so willDestroy has not run yet and the
    // assertion below would race it — it passed for the wrong reason while the
    // flag was never armed at all. run() flushes the destroy queue and nothing
    // else; `await settled()` is WRONG here because helpers/index.js sets
    // `waitForSettled: false` precisely because this app's orphan RSVP/runLater
    // work never settles (~60s hang).
    run(() => c.destroy());

    assert.false(!!app.get('tour_board_picker_active'),
      'willDestroy clears it so the CTA reverts outside the tour');
  });
});
