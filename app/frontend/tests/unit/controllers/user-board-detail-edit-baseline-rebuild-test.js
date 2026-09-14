import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';

/* `_build_from_raw` ends by calling `rebaseline_after_build()`. Capture is
 * required once per edit session: the build writes `translations` / `buttons`
 * / `translated_locales`, so those keys are dirty before the user touches
 * anything. A later same-session rebuild (Symbol Library → `processButtons`)
 * must not recapture: that folds an unsaved `model.name` into the baseline
 * and Exit to Home skips the prompt.
 *
 * Skip is per SESSION, not per board id. Discard, save, and edit-route exit
 * all rebuild the same board on this singleton controller; they call
 * `reset_edit_baseline` so the next edit-mode build recaptures. Speak-mode
 * builds must not pin a snapshot: `edit.js` setupController then
 * `processButtons` would skip.
 *
 * These drive `processButtons` → `_build_from_raw` so reverting `:1887` to
 * `capture_edit_baseline()` (or dropping the call) goes red. Stubbing
 * `rebaseline_after_build` and calling it directly cannot fail that way.
 */
module('Unit | Controller | user/board-detail rebuild must not fold a rename', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.controller = this.owner.factoryFor('controller:user/board-detail').create();
    this.controller.set('noUndo', true);
    this.controller.set('board_recolored', false);
    this.controller.set('borders_matched', false);
    this.controller.set('pending_display_prefs', null);
    this.controller.set('original_display_prefs', null);
    this.controller.set('app_state', EmberObject.create({
      referenced_user: EmberObject.create({
        preferences: EmberObject.create({ skin: null, preferred_symbols: null })
      }),
      label_locale: 'en',
      vocalization_locale: 'en'
    }));
    this.controller.set('stashes', EmberObject.create({ board_level: 10 }));
    this.controller._apply_focus_dim_to_ordered_buttons = function() {};
    this.controller._apply_shift_to_ordered_buttons = function() {};
    this.controller._preload_grid_images = function() {};
    this.controller.resolve_unknown_buttons = function() {};
    this.controller._make_ember_btn = function(btn) {
      return { id: btn.id, label: btn.label || '' };
    };
    this.controller._make_btn = function(btn) {
      return { id: btn.id, label: btn.label || '', empty: !btn.label };
    };
  });

  hooks.afterEach(function() {
    if(this.controller) { this.controller.destroy(); this.controller = null; }
  });

  function tracking_board(id) {
    var changed = {};
    var board = EmberObject.create({
      id: id,
      key: 'user/board-' + id,
      isDeleted: false,
      contextualized_buttons: function() { return []; }
    });
    board.changedAttributes = function() { return changed; };
    var orig_set = board.set.bind(board);
    board.set = function(key, value) {
      if(key === 'translations' || key === 'buttons' || key === 'locale' || key === 'translated_locales') {
        changed[key] = [changed[key] ? changed[key][0] : undefined, value];
      }
      return orig_set(key, value);
    };
    return { board: board, changed: changed };
  }

  function raw_for(id, translations) {
    return {
      id: id,
      key: 'user/board-' + id,
      translations: translations,
      buttons: [{ id: 1, label: 'hi' }],
      grid: { rows: 1, columns: 1, order: [[1]] }
    };
  }

  test('a rename is still a change after a same-board rebuild recapture', function(assert) {
    var tracked = tracking_board('board-1');
    this.controller.set('model', tracked.board);
    this.controller.set('edit_mode', true);
    this.controller._last_raw = raw_for('board-1', { '1': { en: 'hi' } });

    this.controller.processButtons();
    assert.false(this.controller.edit_session_has_changes(),
      'control: entry dirty keys alone are not a user change');

    tracked.changed.name = ['Old Name', 'New Name'];
    this.controller.processButtons();

    assert.true(this.controller.edit_session_has_changes(),
      'the rename must survive the rebuild that Symbol Library triggers');
  });

  test('a different board recaptures so leftover session state does not stick', function(assert) {
    var first = tracking_board('board-1');
    this.controller.set('model', first.board);
    this.controller.set('edit_mode', true);
    this.controller._last_raw = raw_for('board-1', { '1': { en: 'a' } });
    this.controller.processButtons();
    first.changed.name = ['A', 'Renamed A'];

    var second = tracking_board('board-2');
    this.controller.set('model', second.board);
    this.controller._last_raw = raw_for('board-2', { '1': { en: 'b' } });
    this.controller.processButtons();

    assert.false(this.controller.edit_session_has_changes(),
      'board 2 has only build-written dirt; a stale board-1 baseline would prompt forever');
  });

  test('speak-mode builds do not pin a baseline for the next edit session', function(assert) {
    var tracked = tracking_board('board-1');
    this.controller.set('model', tracked.board);
    this.controller.set('edit_mode', false);
    this.controller._last_raw = raw_for('board-1', { '1': { en: 'speak' } });
    this.controller.processButtons();

    assert.strictEqual(this.controller.get('_edit_dirty_baseline'), null,
      'speak-mode _build_from_raw must not capture; edit entry would then skip');
  });

  test('reset_edit_baseline lets the next same-board edit build recapture', function(assert) {
    var tracked = tracking_board('board-1');
    this.controller.set('model', tracked.board);
    this.controller.set('edit_mode', true);
    this.controller._last_raw = raw_for('board-1', { '1': { en: 'first' } });
    this.controller.processButtons();

    this.controller.reset_edit_baseline();
    delete tracked.changed.name;
    this.controller._last_raw = raw_for('board-1', { '1': { en: 'second' } });
    this.controller.processButtons();

    assert.false(this.controller.edit_session_has_changes(),
      'after discard/save reset, a new build with different translations is the new baseline, not a false prompt');
  });
});
