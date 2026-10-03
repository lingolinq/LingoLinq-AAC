import { module, test } from 'qunit';
import { availableHomeSections, layoutPresentation, HOME_SECTIONS } from 'frontend/utils/dashboard_sections';

/* My Account and Reports were retired from the modern home grid on 2026-09-20 by setting their
 * registry `available()` to false, rather than by deleting their entries.
 *
 * The entries are KEPT on purpose: their keys still appear in `AREA`, in four DEFAULT_ORDER
 * arrays and in `FOCUSED_ACTION_KEYS`, and a key that is present in the order but absent from
 * `vis` is exactly the shape the layout engine already handles for a user-hidden card. Deleting
 * them would have meant matching surgery on all of those.
 *
 * That choice is what makes the Edit Dashboard modal update itself — `display-style` builds its
 * checkbox list and its live-preview clone from `availableHomeSections`, the same function
 * `layoutPresentation` uses for the real grid — so this file pins BOTH ends: the card is gone
 * from the rendered dashboard AND from the customiser's available content. A future edit that
 * re-adds either card to one surface but not the other fails here.
 */
module('Unit | Utility | dashboard sections: retired cards', function() {
  // A user object shaped like the registry's `available(user)` callbacks expect. Plain object
  // with `get`, because the registry only ever reads through that.
  function stubUser(props) {
    var p = props || {};
    return { get: function(k) { return p[k]; } };
  }

  var RETIRED = ['account', 'reports'];

  test('retired cards are absent from availableHomeSections for every user shape', function(assert) {
    assert.expect(6);
    var shapes = {
      'a plain communicator': stubUser({}),
      'a supporter': stubUser({ supporter_role: true, supervisees: [], supervised_units: [] }),
      'an org manager': stubUser({ supporter_role: true, organizations: [], supervised_units: [] })
    };
    Object.keys(shapes).forEach((label) => {
      var keys = availableHomeSections(shapes[label]).map((s) => s.key);
      RETIRED.forEach((k) => {
        assert.strictEqual(keys.indexOf(k), -1, k + ' is not offered to ' + label);
      });
    });
  });

  // layoutPresentation().vis is what BOTH the real grid (via cardHideStyle) and the modal's
  // preview read, so this is the assertion that the card cannot render.
  test('retired cards are absent from layoutPresentation vis in both layouts', function(assert) {
    assert.expect(4);
    ['gentle', 'focused'].forEach((layout) => {
      var vis = layoutPresentation(stubUser({}), layout).vis;
      RETIRED.forEach((k) => {
        assert.notOk(vis[k], k + ' is not visible in ' + layout + ' view');
      });
    });
  });

  // The entries must SURVIVE, or the order arrays and AREA map would reference keys the
  // registry no longer knows about — the exact breakage the `available: false` approach avoids.
  test('the registry entries are kept so the order arrays stay coherent', function(assert) {
    assert.expect(2);
    RETIRED.forEach((k) => {
      assert.true(HOME_SECTIONS.some((s) => s.key === k),
        k + ' still has a registry entry (retired, not deleted)');
    });
  });

  /* Boards became communicator-only on 2026-09-20: an SLP/supporter's home is their caseload
   * and an org manager's is their organization. Unlike `account`/`reports` above this is a
   * CONDITIONAL retirement, so it needs the role matrix rather than a flat absence check —
   * and the communicator case is the one that must keep working.
   */
  test('Boards is hidden for supporters and org managers, kept for communicators', function(assert) {
    assert.expect(5);
    var has = function(user) {
      return availableHomeSections(user).map((s) => s.key).indexOf('boards') !== -1;
    };
    assert.true(has(stubUser({})), 'a plain communicator keeps the Boards card');
    assert.false(has(stubUser({ supporter_role: true })), 'an SLP/supporter does not');
    assert.false(has(stubUser({ organizations: [{ type: 'manager' }] })),
      'an org manager does not');
    // A restricted manager org is not org management (hasOrgManagement excludes it), so such a
    // user is still a plain communicator here.
    assert.true(has(stubUser({ organizations: [{ type: 'manager', restricted: true }] })),
      'a RESTRICTED manager org does not count as org management');
    // Defensive: `available(user)` is called with no user during early render.
    assert.true(has(null), 'an unknown user keeps the card rather than losing it mid-hydration');
  });

  // Guard the neighbours: Create a Board sits between the two retired keys in the registry and
  // in every default order, so an off-by-one deletion would take it out silently.
  test('Create a Board and Edit Dashboard are untouched', function(assert) {
    assert.expect(2);
    var keys = availableHomeSections(stubUser({})).map((s) => s.key);
    assert.notStrictEqual(keys.indexOf('createboard'), -1, 'Create a Board still available');
    assert.notStrictEqual(keys.indexOf('editdashboard'), -1, 'Edit Dashboard still available');
  });
});
