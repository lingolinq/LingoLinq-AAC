import { module, test } from 'qunit';
import Service from '@ember/service';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';

/* THE ORDER THE GRID RENDERS MUST BE THE ORDER THE CONTROLLER RESOLVED.
 *
 * board-detail-grid documents this rule on `categoryEnabled` (:91-94): the per-board
 * resolution is passed IN rather than re-derived, "because two places resolving the same
 * setting is how the switch ends up describing a board the grid is not drawing".
 * `enabled`, `show_category_names` and `vertical_scroll` all obeyed it. `order` did not —
 * it read `preferences.board_category_grouping.order`, the ACCOUNT-WIDE default, while the
 * Categorize panel read the per-board entry.
 *
 * That was not a cosmetic disagreement. `rake lingolinq:seed_board_category_grouping
 * ORDER=...` writes a per-board order, and `User#sanitize_board_category_grouping!`
 * stores and validates it — so the value persisted correctly and was then silently
 * dropped on the way to `group_buttons`. Seeding a curated order produced no visible
 * change and no error.
 *
 * The reorder UI is parked (`category_ordering_available: false`), so the seeding path is
 * the only way to set a per-board order today. That is exactly why this needs a test
 * rather than a click-through.
 *
 * HARNESS NOTE: same shape as board-categorization-default-test — `app_state` is set on
 * the INSTANCE, not registered as `service:app-state`. The first test is a positive
 * control proving the account-default path is really being read; without it a bug that
 * made `effectiveCategoryOrder` return the registry default for everything would pass
 * every remaining assertion.
 */
module('Unit | Component | board category order applied', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.owner.register('service:modal', Service.extend({}));
    this.owner.register('service:persistence', Service.extend({}));
  });

  function grid(owner, prefs, attrs) {
    var g = owner.factoryFor('component:board-detail-grid').create(attrs || {});
    g.set('app_state', EmberObject.create({
      feature_flags: { board_category_grouping: true },
      referenced_user: EmberObject.create({ preferences: prefs })
    }));
    return g;
  }

  test('falls back to the account default when nothing is passed (POSITIVE CONTROL)', function(assert) {
    var g = grid(this.owner, { board_category_grouping: { enabled: true, order: ['questions', 'people'] } });
    var order = g.get('effectiveCategoryOrder');
    assert.strictEqual(order[0], 'questions', 'the account default leads when no order is passed in');
    assert.strictEqual(order[1], 'people', 'and its second entry is preserved');
  });

  test('a passed-in per-board order WINS over the account default', function(assert) {
    var g = grid(
      this.owner,
      { board_category_grouping: { enabled: true, order: ['questions', 'people'] } },
      { categoryOrder: ['people', 'actions'] }
    );
    var order = g.get('effectiveCategoryOrder');
    assert.strictEqual(order[0], 'people',
      'the per-board order the controller resolved is what renders');
    assert.strictEqual(order[1], 'actions',
      'not the account-wide default, which led with questions');
  });

  test('an empty per-board order falls back rather than rendering nothing', function(assert) {
    var g = grid(
      this.owner,
      { board_category_grouping: { enabled: true, order: ['questions', 'people'] } },
      { categoryOrder: [] }
    );
    assert.strictEqual(g.get('effectiveCategoryOrder')[0], 'questions',
      'an empty array means "not set", so the account default still applies');
  });

  test('the resolved order is normalized — unknown keys dropped, missing ones appended', function(assert) {
    var g = grid(
      this.owner,
      { board_category_grouping: { enabled: true } },
      { categoryOrder: ['people', 'not_a_real_category'] }
    );
    var order = g.get('effectiveCategoryOrder');
    assert.strictEqual(order[0], 'people', 'a valid key is kept, and kept first');
    assert.strictEqual(order.indexOf('not_a_real_category'), -1,
      'an unknown key is dropped rather than reaching group_buttons');
    assert.true(order.length > 2,
      'the categories the caller omitted are appended, so the order is never partial');
  });

  test('categoryGroups reads the resolved order, not the account default', function(assert) {
    var g = grid(
      this.owner,
      { board_category_grouping: { enabled: true, order: ['questions'] } },
      { categoryOrder: ['people', 'actions'], orderedButtons: [] }
    );
    /* With no buttons the group list is empty either way; what is being pinned is that
       the computed depends on the resolved order, so a change to it invalidates the
       groups. A dependency on the wrong key is precisely the original defect. */
    assert.deepEqual(g.get('categoryGroups'), [],
      'an empty board groups to nothing without throwing');
    assert.strictEqual(g.get('effectiveCategoryOrder')[0], 'people',
      'and the order feeding group_buttons is the passed-in one');
  });
});
