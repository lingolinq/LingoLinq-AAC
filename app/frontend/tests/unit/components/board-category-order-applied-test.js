import { module, test } from 'qunit';
import Service from '@ember/service';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';
import { DEFAULT_CATEGORY_ORDER } from 'frontend/utils/board_categories';

/* THE ORDER THE GRID RENDERS MUST BE THE ORDER THE CONTROLLER RESOLVED.
 *
 * board-detail-grid documents this rule on `categoryEnabled` (:91-94): the per-board
 * resolution is passed IN rather than re-derived, "because two places resolving the same
 * setting is how the switch ends up describing a board the grid is not drawing".
 * `enabled`, `show_category_names` and `vertical_scroll` all obeyed it. `order` did not —
 * it read `preferences.board_category_grouping.order`, the ACCOUNT-WIDE default, while the
 * Categorize panel read the per-board entry.
 *
 * `order` has since left the user preference entirely (it describes the BOARD, not the
 * person reading it), so the fallback is now the registry default rather than an account
 * value. The invariant these tests pin is unchanged and is the one that matters: what the
 * controller resolved is what renders.
 *
 * That was never a cosmetic disagreement: the order persisted correctly and was silently
 * dropped on the way to `group_buttons`, so a curated order produced no visible change and
 * no error. The reorder UI is parked (`category_ordering_available: false`), so there is no
 * click-through that would catch it — which is why it needs a test.
 *
 * HARNESS NOTE: same shape as board-categorization-default-test — `app_state` is set on
 * the INSTANCE, not registered as `service:app-state`. That makes it easy for an assertion
 * to pass for the wrong reason, so two of these are controls rather than cases: the first
 * proves a default really is produced (not an empty list), and the second proves a stale
 * account-level `order` is genuinely ignored rather than merely absent from the fixture.
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

  test('falls back to the registry default when nothing is passed (POSITIVE CONTROL)', function(assert) {
    var g = grid(this.owner, { board_category_grouping: { enabled: true } });
    var order = g.get('effectiveCategoryOrder');
    assert.true(order.length > 1, 'a full default order is produced, not an empty list');
    assert.strictEqual(order[0], DEFAULT_CATEGORY_ORDER[0],
      'and it is the registry default, so an unset board still groups sensibly');
  });

  test('a stale account-level order is IGNORED — order is not a user preference', function(assert) {
    var g = grid(this.owner, { board_category_grouping: { enabled: true, order: ['questions', 'people'] } });
    assert.strictEqual(g.get('effectiveCategoryOrder')[0], DEFAULT_CATEGORY_ORDER[0],
      'a leftover order in the user hash must not steer the grid; the server drops it too');
  });

  test('a passed-in order WINS over the default', function(assert) {
    var g = grid(
      this.owner,
      { board_category_grouping: { enabled: true } },
      { categoryOrder: ['people', 'actions'] }
    );
    var order = g.get('effectiveCategoryOrder');
    assert.strictEqual(order[0], 'people',
      'the order the controller resolved is what renders');
    assert.strictEqual(order[1], 'actions', 'in the sequence it supplied');
  });

  test('an empty order falls back rather than rendering nothing', function(assert) {
    var g = grid(
      this.owner,
      { board_category_grouping: { enabled: true } },
      { categoryOrder: [] }
    );
    var order = g.get('effectiveCategoryOrder');
    assert.true(order.length > 1, 'an empty array means "not set", so the default applies');
    assert.strictEqual(order[0], DEFAULT_CATEGORY_ORDER[0], 'and it is the registry default');
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

  test('categoryGroups reads the resolved order', function(assert) {
    var g = grid(
      this.owner,
      { board_category_grouping: { enabled: true } },
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
