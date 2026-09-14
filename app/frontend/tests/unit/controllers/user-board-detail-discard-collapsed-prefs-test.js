import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import persistence from 'frontend/utils/persistence';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';

/* `_discard_edit_changes` always sends `close_display_preferences`. Collapsing
 * More Settings (`toggle_display_settings`) sets `display_prefs_open` false
 * and deliberately keeps `pending_display_prefs`. Closing only when the
 * panel flag was true left the live pref applied and `pending` set, so
 * later toolbar `set_display_pref` took the `if (pending)` branch and
 * never persisted.
 *
 * It also calls `reset_edit_baseline` before the post-discard rebuild.
 * Same-board skip in `rebaseline_after_build` would otherwise keep the
 * first-open snapshot on this singleton controller.
 *
 * This runs the REAL discard body. Stubbing `_discard_edit_changes` (as
 * cancel-edit-clean-test does) cannot fail for this bug.
 */
module('Unit | Controller | user/board-detail discard from a collapsed prefs panel', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.controller = this.owner.factoryFor('controller:user/board-detail').create();
    this.controller.set('noUndo', true);
    this.controller.set('board_recolored', false);
    this.controller.set('borders_matched', false);
    this.controller.set('_edit_dirty_baseline', { translations: '{}' });
    this.controller._edit_baseline_token = '1_99';
    this.controller.set('user', EmberObject.create({ user_name: 'ada' }));
    this.controller.set('boardname', 'home');
    this.controller.set('stashes', EmberObject.create({ persist: function() {} }));
    this.controller.set('router', EmberObject.create({ transitionTo: function() {} }));

    this.pref_user = EmberObject.create({
      id: 'u1',
      preferences: EmberObject.create({
        device: EmberObject.create({
          button_text: 'large',
          button_spacing: 'medium'
        })
      }),
      save: function() { return RSVP.resolve(this); }
    });
    this.controller.set('app_state', EmberObject.create({
      currentUser: this.pref_user,
      referenced_user: this.pref_user
    }));

    this.controller.set('model', EmberObject.create({
      rollbackAttributes: function() {}
    }));

    /* Discard reloads the board via persistence.ajax. RSVP.reject()
     * schedules the failure callback after this test's afterEach
     * destroys the controller. The production callbacks must no-op
     * when isDestroyed (board-detail.js _discard_edit_changes). */
    stub(persistence, 'ajax', function() { return RSVP.reject(); });

    this.scheduled = 0;
    this.controller._schedule_display_pref_save = () => { this.scheduled++; };
  });

  hooks.afterEach(function() {
    restoreStubs();
    if(this.controller) { this.controller.destroy(); this.controller = null; }
  });

  test('discard reverts collapsed pending prefs and lets the toolbar persist again', function(assert) {
    this.controller.set('display_prefs_open', false);
    this.controller.set('original_display_prefs', { button_text: 'medium', button_spacing: 'medium' });
    this.controller.set('pending_display_prefs', { button_text: 'large', button_spacing: 'medium' });

    this.controller._discard_edit_changes();

    assert.strictEqual(this.controller.get('pending_display_prefs'), null,
      'pending must be cleared or later toolbar edits never save');
    assert.strictEqual(this.controller.get('original_display_prefs'), null,
      'original is cleared with pending');
    assert.strictEqual(this.pref_user.get('preferences.device.button_text'), 'medium',
      'the live preview is reverted to the entry value');

    this.controller.send('set_display_pref', 'button_spacing', 'large');
    assert.strictEqual(this.scheduled, 1,
      'a toolbar pref change after discard must reach the debounced save');
  });

  test('discard clears the edit dirty baseline so the next session can recapture', function(assert) {
    this.controller.set('display_prefs_open', false);
    this.controller.set('original_display_prefs', null);
    this.controller.set('pending_display_prefs', null);

    this.controller._discard_edit_changes();

    assert.strictEqual(this.controller.get('_edit_dirty_baseline'), null,
      'stale first-open values must not survive discard on this singleton');
    assert.strictEqual(this.controller._edit_baseline_token, null,
      'same-board skip key must be cleared with the snapshot');
  });
});
