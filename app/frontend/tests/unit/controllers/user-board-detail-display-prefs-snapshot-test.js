import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';

/* `open_display_preferences` seeds `pending_display_prefs` and `original_display_prefs`
 * from one snapshot of the display preferences. THREE consumers then iterate
 * `Object.keys(original_display_prefs)` to do their job:
 *
 *   save_display_preferences   - decides whether anything changed; early-returns without
 *                                saving when the diff is empty
 *   close_display_preferences  - reverts each key onto the live user model
 *   edit_session_has_changes   - decides whether exiting edit mode must warn
 *
 * So a preference that is WRITABLE but never seeded is invisible to all three at once: it
 * applies live, is never persisted, is never reverted, and never counts as unsaved work.
 * `vocalization_height` (the Sentence Bar height, right panel -> Speak Bar) was exactly
 * that — present in `_display_prefs_paths`, absent from the snapshot.
 *
 * This asserts the INVARIANT rather than that one key, because the class of bug is
 * "someone adds a path and forgets the snapshot", and a test naming only
 * vocalization_height would go green the moment the next key is added.
 */
module('Unit | Controller | user/board-detail display-prefs snapshot', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.controller = this.owner.factoryFor('controller:user/board-detail').create();
    // open_display_preferences reads prefs off `_pref_user_for_display()`, which falls back
    // to app_state.currentUser. Empty preferences exercise the `|| default` branch of every
    // line in the snapshot, which is the state a fresh user is actually in.
    this.controller.set('app_state', EmberObject.create({
      currentUser: EmberObject.create({ preferences: {} })
    }));
  });

  hooks.afterEach(function() {
    if(this.controller) { this.controller.destroy(); this.controller = null; }
  });

  test('the snapshot seeds every preference that is writable through _display_prefs_paths', function(assert) {
    this.controller.send('open_display_preferences');
    var seeded = Object.keys(this.controller.get('original_display_prefs') || {}).sort();
    var writable = Object.keys(this.controller._display_prefs_paths).sort();
    assert.deepEqual(seeded, writable,
      'a writable pref missing here is invisible to save, revert AND the dirty check');
  });

  test('pending and original are seeded identically, and are separate objects', function(assert) {
    this.controller.send('open_display_preferences');
    var pending = this.controller.get('pending_display_prefs');
    var orig = this.controller.get('original_display_prefs');
    assert.deepEqual(pending, orig, 'opening the panel changes nothing');
    assert.notStrictEqual(pending, orig,
      'and they are distinct objects — one reference would make every diff report clean');
  });
});
