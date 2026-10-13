import { module, test } from 'qunit';
import Service from '@ember/service';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';

/* CATEGORY ORDER IS PER BOARD, so that each board can be arranged independently
 * (Traci, 2026-09-18).
 *
 * The controller owns the resolution: `board_category_settings` returns the board's own
 * entry when it has one and the account-wide hash otherwise, and the Categorize panel and
 * the move arrows both read it. The GRID used to resolve the order itself, reading
 * `preferences.board_category_grouping.order` (the ACCOUNT-WIDE value) directly, and no
 * template passed it one -- so a per-board order could never reach the rendered board.
 *
 * It now takes `@categoryOrder` the way it already takes `@categoryEnabled`, for the reason
 * the component's own comment gives: two places resolving the same setting is how the
 * panel ends up describing a board the grid is not drawing.
 *
 * HARNESS NOTE (inherited from board-categorization-default-test.js): `app_state` is SET ON
 * THE INSTANCE rather than registered as a service; registering it does not take here.
 */
module('Unit | Component | board-detail-grid category order', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.owner.register('service:modal', Service.extend({}));
    this.owner.register('service:persistence', Service.extend({}));
  });

  /* noun -> things, verb -> actions, pronoun -> people. Three categories is enough to tell
     two different orders apart, and matches the shape used in board-categories-test.js. */
  var ROWS = [
    [{ id: 1, part_of_speech: 'noun' }, { id: 2, part_of_speech: 'verb' }],
    [{ id: 3, part_of_speech: 'pronoun' }]
  ];

  var ACCOUNT_ORDER = ['things', 'actions', 'people'];
  var BOARD_ORDER = ['people', 'actions', 'things'];

  function grid(owner, attrs, account_order) {
    var g = owner.factoryFor('component:board-detail-grid').create(
      Object.assign({
        board: EmberObject.create({ key: 'user/a' }),
        orderedButtons: ROWS,
        /* The resolved per-board value, passed in exactly as board-detail.hbs passes it.
           Keeps grouping ON without depending on the preference hash. */
        categoryEnabled: true
      }, attrs || {})
    );
    g.set('app_state', EmberObject.create({
      feature_flags: { board_category_grouping: true },
      referenced_user: EmberObject.create({
        preferences: {
          board_category_grouping: { enabled: true, order: account_order || ACCOUNT_ORDER }
        }
      })
    }));
    return g;
  }

  function keys(g) {
    return (g.get('categoryGroups') || []).map(function(group) { return group.key; });
  }

  test('a passed per-board order decides the rendered arrangement', function(assert) {
    var g = grid(this.owner, { categoryOrder: BOARD_ORDER.slice() });
    assert.true(g.get('groupingEnabled'), 'positive control: the board is actually grouped');
    assert.deepEqual(keys(g), BOARD_ORDER,
      'the grid renders the board\'s own order, not the account-wide one');
  });

  test('the per-board order wins even though the account-wide order disagrees', function(assert) {
    var g = grid(this.owner, { categoryOrder: BOARD_ORDER.slice() });
    assert.notDeepEqual(keys(g), ACCOUNT_ORDER,
      'the account-wide order must not be what reaches the grid when a board order is passed');
  });

  test('with no order passed it still falls back to the account-wide order', function(assert) {
    /* demo/speak.hbs mounts this component without @categoryOrder, so the fallback has to
       keep working or that page loses its grouping order. */
    var g = grid(this.owner, {});
    assert.deepEqual(keys(g), ACCOUNT_ORDER,
      'no passed order means the account-wide value is used, as before');
  });

  test('an empty passed order falls back rather than rendering nothing', function(assert) {
    /* board_category_settings.order is undefined for a board whose entry predates ordering,
       and normalize_order([]) is the DEFAULT order -- so an absent value must not be treated
       as "no categories". */
    var g = grid(this.owner, { categoryOrder: [] });
    assert.deepEqual(keys(g), ACCOUNT_ORDER,
      'an empty order is absence, not an instruction to render no categories');
  });
});
