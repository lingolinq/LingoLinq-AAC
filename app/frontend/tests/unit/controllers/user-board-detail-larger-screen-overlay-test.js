import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';

/*
 * "Larger screen recommended" vs category grouping.
 *
 * portrait_overlay_eligible (controllers/user/board-detail.js:4751) fires purely on the
 * LIVE-MEASURED cell size published by _sync_prediction_tile_size, which measures the
 * first `.md-board-detail-grid__cell` in the DOM. While grouping is active the grid is
 * packed into compact category columns (BoardDetailGrid#compactCategories), so that
 * measurement is of a packed category tile rather than a board button, and the <35px /
 * lopsided-aspect tests trip on any viewport width.
 *
 * This is the same failure the Board Collections drawer already had -- the drawer shrinks
 * the centre area, the measurement drops, the overlay false-fires -- and it is suppressed
 * the same way, in portrait_overlay_active rather than in the eligibility test, so the
 * measurement itself keeps reporting what it actually measured.
 *
 * The first test is the CONTROL: it proves the setup really does trigger the overlay, so
 * the suppression test below cannot pass for some unrelated reason.
 */
module('Unit | Controller | user/board-detail larger-screen overlay', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.controller = this.owner.factoryFor('controller:user/board-detail').create();
  });

  hooks.afterEach(function() {
    if(this.controller) {
      this.controller.destroy();
      this.controller = null;
    }
  });

  // A cell measured well under the 35px floor, on an account with the overlay flag on.
  // `grouping` drives the category preference the controller resolves through
  // board_category_settings -> categorize_enabled -> grouping_active.
  function tiny_cells(controller, grouping) {
    controller.set('app_state', EmberObject.create({
      feature_flags: { portrait_orientation_overlay: true, board_category_grouping: true },
      referenced_user: EmberObject.create({
        preferences: { board_category_grouping: { enabled: !!grouping } }
      })
    }));
    controller.set('model', EmberObject.create({ id: '1_1', key: 'someone/a-board' }));
    controller.set('board_collection_open', false);
    controller.set('edit_board_collection_open', false);
    controller.set('portrait_overlay_dismissed', false);
    controller.set('board_cell_width', 20);
    controller.set('board_cell_height', 20);
  }

  test('CONTROL: with grouping off, a 20px cell does recommend a larger screen', function(assert) {
    tiny_cells(this.controller, false);
    assert.false(this.controller.get('grouping_active'), 'grouping really is off');
    assert.true(this.controller.get('portrait_overlay_eligible'), 'a 20px cell is eligible');
    assert.true(this.controller.get('portrait_overlay_active'), 'and the overlay shows');
  });

  test('with categories on, the same 20px cell does NOT recommend a larger screen', function(assert) {
    tiny_cells(this.controller, true);
    assert.true(this.controller.get('grouping_active'), 'grouping really is on');
    // Eligibility is untouched on purpose: the measurement still reports what it measured.
    assert.true(this.controller.get('portrait_overlay_eligible'),
      'the measured cell is still small -- the suppression is not in the measurement');
    assert.false(this.controller.get('portrait_overlay_active'),
      'but the recommendation is suppressed while the board is packed into categories');
  });

  test('turning categories back off restores the recommendation', function(assert) {
    tiny_cells(this.controller, true);
    assert.false(this.controller.get('portrait_overlay_active'), 'suppressed while grouped');
    this.controller.set('app_state.referenced_user.preferences',
      { board_category_grouping: { enabled: false } });
    assert.false(this.controller.get('grouping_active'), 'grouping is off again');
    assert.true(this.controller.get('portrait_overlay_active'),
      'the suppression is not a one-way latch');
  });
});
