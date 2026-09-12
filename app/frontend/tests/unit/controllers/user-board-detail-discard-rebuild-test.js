import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import persistence from 'frontend/utils/persistence';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';

/*
 * Cancelling an edit must never leave the communicator with a blank board.
 *
 * THE DEFECT. `_discard_edit_changes` (controllers/user/board-detail.js:4663) sets
 * `ordered_buttons` to null and then refetches. Only the ajax SUCCESS handler, and only
 * inside `if(merged)`, ever rebuilds. So on an ajax reject, on a falsy `merged`, on either
 * handler's isDestroyed return, and on `_build_from_raw`'s own early returns, the board
 * stays null forever. A communicator who cancels an edit while offline watches their entire
 * vocabulary disappear with no message and no error.
 *
 * THE FIX UNDER TEST. `rollbackAttributes()` has already restored the committed server
 * state, so the board can be rebuilt from LOCAL state immediately — the network round trip
 * becomes a pure refresh whose failure is harmless. This mirrors the instinct already
 * recorded a few hundred lines away at `:2714-2718`: "leave the stale render in place
 * rather than blanking the grid."
 *
 * WHY TEST 3 EXISTS — it guards a defect that adversarial review found in the FIX, not in
 * the bug. `app/transforms/raw.js` is a pure IDENTITY transform, so Ember Data stores the
 * REFERENCE for `buttons: attr('raw')` (models/board.js:906). Syncing
 * `_last_raw.buttons = model.get('buttons')` would therefore alias `_last_raw` to the
 * store's committed `_data` array. `paint_button:9457-9470` mutates those objects IN PLACE,
 * so from the NEXT edit session on, paint would write straight into the committed baseline,
 * the record would never dirty, and `rollbackAttributes()` would silently become a no-op —
 * the user's discarded paint would become permanent. A hand-written `rollbackAttributes`
 * fake cannot reproduce that, so test 3 asserts the structural property directly: the sync
 * must be a COPY.
 *
 * WEAKEST PASSING STATES, enumerated (rule #0.14.2):
 *  - test 1 alone passes if the reject handler merely restores the captured pre-null value —
 *    which resurrects the edits the user just cancelled. Test 2 kills that.
 *  - tests 1+2 pass on a bare `processButtons()` in the reject handler, which rebuilds from
 *    `_last_raw` whose buttons paint has already mutated in place — resurrecting discarded
 *    PAINT rather than discarded labels. Test 2's colour assertion kills that, and it can
 *    only do so because `_make_btn` below PRESERVES `background_color`; the existing harness
 *    in user-board-detail-edit-baseline-rebuild-test.js drops it, which would have made that
 *    assertion vacuously true for every implementation.
 *  - tests 1+2 pass while still aliasing the store array. Test 3 kills that.
 */
module('Unit | Controller | user/board-detail discard rebuilds instead of blanking', function(hooks) {
  setupTest(hooks);

  var PRE_EDIT_BUTTONS = function() {
    return [{ id: 'b1', label: 'want', background_color: '#ffffff' },
            { id: 'b2', label: 'more', background_color: '#ffffff' }];
  };

  hooks.beforeEach(function() {
    this.controller = this.owner.factoryFor('controller:user/board-detail').create();
    this.controller.set('noUndo', true);
    this.controller.set('board_recolored', false);
    this.controller.set('borders_matched', false);
    this.controller.set('_edit_dirty_baseline', { translations: '{}' });
    this.controller._edit_baseline_token = '1_99';
    this.controller.set('user', EmberObject.create({ user_name: 'ada' }));
    this.controller.set('boardname', 'home');
    this.controller.set('stashes', EmberObject.create({ persist: function() {}, board_level: 10 }));
    this.controller.set('router', EmberObject.create({ transitionTo: function() {} }));

    var pref_user = EmberObject.create({
      id: 'u1',
      preferences: EmberObject.create({ skin: null, preferred_symbols: null, device: EmberObject.create({}) }),
      save: function() { return RSVP.resolve(this); }
    });
    this.controller.set('app_state', EmberObject.create({
      currentUser: pref_user, referenced_user: pref_user,
      label_locale: 'en', vocalization_locale: 'en'
    }));

    /* The record. `rollbackAttributes` restores the committed server values, which is what
       the real ED implementation does for the `attr('raw')` buttons/grid
       (models/board.js:906-907) once _build_from_raw has `set()` them. */
    var committed = PRE_EDIT_BUTTONS();
    this.committed = committed;
    this.model = EmberObject.create({
      id: '1_99',
      key: 'ada/home',
      grid: { rows: 1, columns: 2, order: [['b1', 'b2']] },
      buttons: [{ id: 'b1', label: 'EDITED', background_color: '#ff0000' },
                { id: 'b2', label: 'more', background_color: '#ffffff' }],
      rollbackAttributes: function() { this.set('buttons', committed); }
    });
    this.controller.set('model', this.model);

    /* `_last_raw` as an edit session leaves it: paint has mutated the button objects IN
       PLACE (paint_button:9457-9470), so a naive rebuild from it resurrects the paint. */
    this.controller._last_raw = {
      id: '1_99',
      key: 'ada/home',
      grid: { rows: 1, columns: 2, order: [['b1', 'b2']] },
      buttons: [{ id: 'b1', label: 'EDITED', background_color: '#ff0000' },
                { id: 'b2', label: 'more', background_color: '#ffffff' }]
    };

    this.controller._apply_focus_dim_to_ordered_buttons = function() {};
    this.controller._apply_shift_to_ordered_buttons = function() {};
    this.controller._preload_grid_images = function() {};
    this.controller.resolve_unknown_buttons = function() {};
    this.controller._make_ember_btn = function(btn) {
      return { id: btn.id, label: btn.label || '', ember: true, background_color: btn.background_color };
    };
    /* PRESERVES background_color — deliberately unlike the stub in
       user-board-detail-edit-baseline-rebuild-test.js, which drops it and would make test
       2's colour assertion vacuously true for every implementation. */
    this.controller._make_btn = function(btn) {
      return { id: btn.id, label: btn.label || '', empty: !btn.label,
               background_color: btn.background_color };
    };

    // The board the user was looking at while editing.
    this.controller.set('ordered_buttons', [[{ id: 'b1', label: 'EDITED', background_color: '#ff0000' }]]);

    stub(persistence, 'ajax', function() { return RSVP.reject(); });
  });

  hooks.afterEach(function() {
    restoreStubs();
    if(this.controller) { this.controller.destroy(); this.controller = null; }
  });

  var cells = function(ob) {
    var out = [];
    (ob || []).forEach(function(row) { (row || []).forEach(function(c) { if(c) { out.push(c); } }); });
    return out;
  };

  test('the board is rebuilt even though the refetch fails', function(assert) {
    this.controller._discard_edit_changes();

    // Synchronous on purpose: the rebuild must not depend on the network settling.
    var ob = this.controller.get('ordered_buttons');
    assert.ok(Array.isArray(ob), 'ordered_buttons is an array, not null');
    assert.ok(cells(ob).length > 0, 'the board still has buttons after a failed discard refetch');
  });

  test('the rebuilt board shows neither the discarded label nor the discarded paint', function(assert) {
    this.controller._discard_edit_changes();

    var list = cells(this.controller.get('ordered_buttons'));
    assert.ok(list.length > 0, 'precondition: something was rebuilt');
    assert.notOk(list.some(function(c) { return c.label === 'EDITED'; }),
      'the cancelled label edit is gone');
    assert.notOk(list.some(function(c) { return c.background_color === '#ff0000'; }),
      'the cancelled paint is gone');
  });

  test('the raw snapshot is a COPY of the COMMITTED data, never that same array', function(assert) {
    this.controller._discard_edit_changes();

    var raw_buttons = (this.controller._last_raw || {}).buttons;
    assert.ok(raw_buttons, 'precondition: _last_raw still holds buttons');

    /* The invariant is specifically about the COMMITTED array — the one
       `rollbackAttributes()` restores, i.e. Ember Data's `_data`. It is NOT about the
       record's current attribute value: `_build_from_raw:1877` legitimately does
       `board.set('buttons', raw.buttons)` on every build, so the live attribute aliasing
       `_last_raw` is normal operation, and asserting against that would fail the correct
       fix. What must never happen is `_last_raw` aliasing the COMMITTED array: paint
       mutates button objects in place (:9457-9470), so that would write into the baseline,
       leave the record permanently clean, and turn every future rollbackAttributes() into
       a silent no-op. */
    assert.notStrictEqual(raw_buttons, this.committed,
      '_last_raw.buttons must not be the committed array itself');

    this.committed[0].background_color = '#00ff00';
    assert.notEqual(raw_buttons[0].background_color, '#00ff00',
      'mutating the committed array must not reach _last_raw');
  });
});
