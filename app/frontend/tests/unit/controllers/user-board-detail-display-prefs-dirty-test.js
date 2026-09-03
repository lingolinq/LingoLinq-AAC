import { module, test } from 'qunit';
import { setupTest } from '../../helpers';

/* `edit_session_has_changes()` decides whether leaving edit mode has to warn about
 * losing work. It is assembled from every vector the exit paths roll back, and it errs
 * deliberately in ONE direction: unsure means "there are changes", which costs a confirm
 * dialog, where the opposite mistake costs the user their work.
 *
 * DISPLAY PREFERENCES were missing from that assembly. The display-prefs panel writes
 * into `pending_display_prefs` and keeps the entry values in `original_display_prefs`;
 * leaving edit mode runs `close_display_preferences`, which REVERTS them. So a session
 * whose only change was a pending display pref reported clean, and the user lost it with
 * no warning.
 *
 * Narrow by construction: `close_display_preferences` nulls both objects, so
 * `original_display_prefs` is non-null only while the panel is OPEN. The uncovered state
 * is exactly "panel open, pref changed, user exits".
 *
 * These assert the METHOD rather than a click path, because the method is the single
 * place every exit path consults, and it is what the missing term belongs in.
 */
module('Unit | Controller | user/board-detail display-prefs dirty check', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.controller = this.owner.factoryFor('controller:user/board-detail').create();
    // The three pre-existing signals all report CLEAN, so any dirty verdict below comes
    // from the display-prefs term and nothing else. `noUndo` true means the undo history
    // is empty; an empty baseline object (not null) means "nothing was dirty at entry".
    this.controller.set('noUndo', true);
    this.controller.set('board_recolored', false);
    this.controller.set('borders_matched', false);
    this.controller.set('_edit_dirty_baseline', {});
    this.controller.set('model', null);
  });

  hooks.afterEach(function() {
    this.controller.destroy();
  });

  test('a session with no changes at all is clean', function(assert) {
    // The control. If this ever fails the other assertions prove nothing, because a
    // method that always returns true would satisfy every "prompts" case below.
    assert.false(this.controller.edit_session_has_changes(),
      'nothing touched, nothing pending');
  });

  test('a PENDING display pref that differs from its original is a change', function(assert) {
    this.controller.set('original_display_prefs', { text_size: 'medium', spacing: 'medium' });
    this.controller.set('pending_display_prefs', { text_size: 'large', spacing: 'medium' });
    assert.true(this.controller.edit_session_has_changes(),
      'text_size moved medium -> large, so exiting would discard it');
  });

  test('a pending set that MATCHES the original is not a change', function(assert) {
    // Opening the panel seeds `pending` from `original`, so this is the state after
    // merely opening it. Reporting dirty here would prompt on every panel open — the
    // always-prompt bug the surrounding fix exists to remove.
    this.controller.set('original_display_prefs', { text_size: 'medium', spacing: 'medium' });
    this.controller.set('pending_display_prefs', { text_size: 'medium', spacing: 'medium' });
    assert.false(this.controller.edit_session_has_changes(),
      'panel opened but nothing altered');
  });

  test('a closed panel is not a change', function(assert) {
    // close_display_preferences nulls both. The term must not fire on nulls, or every
    // exit outside the panel would prompt.
    this.controller.set('original_display_prefs', null);
    this.controller.set('pending_display_prefs', null);
    assert.false(this.controller.edit_session_has_changes(),
      'no panel state means no pending prefs to lose');
  });

  test('the fail-safe direction is preserved: no baseline still means dirty', function(assert) {
    // Asserted explicitly so a later refactor cannot quietly flip this to "clean". A
    // sibling branch implemented the same idea with the OPPOSITE default; on this app,
    // an unnecessary dialog is cheaper than a silent loss of a board edit.
    this.controller.set('_edit_dirty_baseline', null);
    assert.true(this.controller.edit_session_has_changes(),
      'unknown baseline is treated as "there are changes"');
  });
});
