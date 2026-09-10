import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import RSVP from 'rsvp';
import modal from 'frontend/utils/modal';
import { settled } from '@ember/test-helpers';

/* "Discard Edits" (templates/user/board-detail.hbs:1510 -> `cancel_edit`) always opened
 * the "Discard Changes?" confirmation, even on a board the user had not touched.
 *
 * Its sibling escape, `exit_to_home_from_edit`, was fixed to skip the prompt on a clean
 * session; this path was left behind. So the two exits from edit mode disagreed about
 * whether an untouched session needs confirming.
 *
 * Both branches run the SAME rollback, extracted to `_discard_edit_changes`. These tests
 * stub that method: what is under test is WHICH path runs, not what the rollback does —
 * the rollback is unchanged, and exercising it here would mean stubbing the model,
 * router, stashes and a network fetch, which would test the stubs.
 */
module('Unit | Controller | user/board-detail cancel_edit on a clean session', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.controller = this.owner.factoryFor('controller:user/board-detail').create();

    this.discards = 0;
    this.controller._discard_edit_changes = () => { this.discards++; };

    this.modal_opens = [];
    this.original_modal_open = modal.open;
    modal.open = (template) => {
      this.modal_opens.push(template);
      // Resolve as "discard" so the confirmed path runs its rollback too — that is what
      // lets the dirty case assert the rollback still happens after confirming, rather
      // than only that a dialog appeared.
      return RSVP.resolve('discard');
    };

    // Baseline: a session with nothing changed. Each dirty case flips ONE signal, so the
    // verdict can only come from the signal that case sets.
    this.controller.set('noUndo', true);
    this.controller.set('board_recolored', false);
    this.controller.set('borders_matched', false);
    this.controller.set('_edit_dirty_baseline', {});
    this.controller.set('model', null);
  });

  hooks.afterEach(function() {
    modal.open = this.original_modal_open;
    if(this.controller) { this.controller.destroy(); this.controller = null; }
  });

  test('a clean session discards immediately, with no confirmation', async function(assert) {
    this.controller.send('cancel_edit');
    await settled();
    assert.deepEqual(this.modal_opens, [], 'no dialog for a board the user never changed');
    assert.strictEqual(this.discards, 1, 'the rollback still ran exactly once');
  });

  test('an edited session still confirms before discarding', async function(assert) {
    // The control for the test above. Without it, a `cancel_edit` that simply never
    // opened a dialog would pass the clean case while silently destroying real work.
    this.controller.set('noUndo', false);
    this.controller.send('cancel_edit');
    await settled();
    assert.deepEqual(this.modal_opens, ['confirm-discard-changes'], 'the user is asked');
    assert.strictEqual(this.discards, 1, 'and the rollback runs once they confirm');
  });

  test('a pending display pref counts as edited here too', async function(assert) {
    // The two exits must agree. This is the state the display-prefs term was added for;
    // asserting it through cancel_edit proves the gate consults the shared check rather
    // than re-deriving a narrower one of its own.
    this.controller.set('original_display_prefs', { text_size: 'medium' });
    this.controller.set('pending_display_prefs', { text_size: 'large' });
    this.controller.send('cancel_edit');
    await settled();
    assert.deepEqual(this.modal_opens, ['confirm-discard-changes'],
      'a pending pref is unsaved work, so it is confirmed');
  });

  test('declining the confirmation discards nothing', async function(assert) {
    modal.open = (template) => {
      this.modal_opens.push(template);
      return RSVP.resolve(undefined);   // dialog dismissed
    };
    this.controller.set('noUndo', false);
    this.controller.send('cancel_edit');
    await settled();
    assert.deepEqual(this.modal_opens, ['confirm-discard-changes'], 'asked');
    assert.strictEqual(this.discards, 0, 'and the edits survive a dismissed dialog');
  });
});
