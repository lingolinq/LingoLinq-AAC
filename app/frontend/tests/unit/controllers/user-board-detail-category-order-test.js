import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';
import { DEFAULT_CATEGORY_ORDER } from 'frontend/utils/board_categories';

/*
 * Category ORDER is resolved per board: the panel renders `category_order_list`, which
 * reads `board_category_settings` (the board's own entry when it has one, the account
 * default otherwise), and `_save_category_grouping` writes `order` into that board's slot.
 *
 * `move_category` read the ACCOUNT-WIDE order instead, and wrote the permuted result to
 * the per-board slot. Because no UI path ever changes the account-wide order
 * (_save_category_grouping always rewrites it as `normalizeCategoryOrder(all.order)`),
 * every move recomputed from the SAME unchanging list, so each one discarded the move
 * before it. The panel showed one sequence and the arrows permuted another.
 *
 * Unreachable while `category_ordering_available` is false, which is why it survived. These
 * tests pin the resolution so flipping that flag does not ship the defect.
 */
module('Unit | Controller | user/board-detail category order', function(hooks) {
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

  /* Same shape as user-board-detail-category-per-user-test.js: `grouping` is the whole
     stored hash and the board on screen is always `user/a`. */
  function on_board(controller, grouping) {
    var user = EmberObject.create({
      preferences: { board_category_grouping: grouping }
    });
    user.save = function() { return { then: function() { return this; } }; };
    controller.set('app_state', EmberObject.create({
      feature_flags: { board_category_grouping: true },
      referenced_user: user
    }));
    controller.set('model', EmberObject.create({ id: '1_1', key: 'user/a' }));
    return user;
  }

  function stored_order(user) {
    var all = user.get('preferences.board_category_grouping') || {};
    return ((all.boards || {})['user/a'] || {}).order;
  }

  test('a move permutes the order the panel is displaying, not the account default', function(assert) {
    /* The board carries its own order, already one swap away from the default. That is the
       state the account-wide read cannot see. */
    var board_order = DEFAULT_CATEGORY_ORDER.slice();
    var swapped = board_order[0];
    board_order[0] = board_order[1];
    board_order[1] = swapped;

    var user = on_board(this.controller, {
      enabled: true,
      order: DEFAULT_CATEGORY_ORDER.slice(),
      boards: { 'user/a': { order: board_order.slice() } }
    });

    /* Move the category sitting THIRD on this board down one place. Against the board's own
       order that swaps positions 3 and 4; against the account default it would swap two
       different categories and drop the board's first-two swap entirely. */
    this.controller.send('move_category', board_order[2], 'down');

    var expected = board_order.slice();
    var moved = expected[2];
    expected[2] = expected[3];
    expected[3] = moved;

    assert.deepEqual(stored_order(user), expected,
      'the swap is computed against the board\'s own order');
    assert.deepEqual(stored_order(user).slice(0, 2), board_order.slice(0, 2),
      'the board\'s existing first-two swap survives the move');
  });

  test('successive moves accumulate instead of each one resetting to the default', function(assert) {
    var user = on_board(this.controller, {
      enabled: true,
      order: DEFAULT_CATEGORY_ORDER.slice(),
      boards: { 'user/a': { order: DEFAULT_CATEGORY_ORDER.slice() } }
    });

    var first = DEFAULT_CATEGORY_ORDER[0];
    var second = DEFAULT_CATEGORY_ORDER[1];

    /* Two moves on DIFFERENT categories. Reading the account-wide order each time makes the
       second recompute from the default, so the first move vanishes. */
    this.controller.send('move_category', first, 'down');
    this.controller.send('move_category', DEFAULT_CATEGORY_ORDER[3], 'down');

    var after = stored_order(user);
    assert.strictEqual(after.indexOf(first), 1,
      'the first move is still in place after the second');
    assert.strictEqual(after.indexOf(second), 0,
      'and the category it displaced has not snapped back');
  });

  test('a board with no entry of its own still moves against the account default', function(assert) {
    /* The fallback path must not change: board_category_settings returns the account-wide
       hash when the board has no entry, so this behaves exactly as it did before. */
    var user = on_board(this.controller, {
      enabled: true,
      order: DEFAULT_CATEGORY_ORDER.slice()
    });

    this.controller.send('move_category', DEFAULT_CATEGORY_ORDER[0], 'down');

    var expected = DEFAULT_CATEGORY_ORDER.slice();
    var moved = expected[0];
    expected[0] = expected[1];
    expected[1] = moved;

    assert.deepEqual(stored_order(user), expected,
      'no per-board order means the account default is the list to permute');
  });
});
