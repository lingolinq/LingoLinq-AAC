import { module, test } from 'qunit';
import { gridLayoutState, defaultOrderFor } from 'frontend/utils/dashboard_sections';

/* GENTLE VIEW: MY CASELOAD, SPEAK MODE AND EXTRAS SHARE THE TOP ROW (requested 2026-10-12: "the My
   Caseload button needs to show top left on the page ... then speak mode, then extras should show to
   its right, in equal sizes"). Decided the same day: the row leads the page for every user with a
   caseload, org managers included (above My Organizations), and the three stack at 900px and below. */
function rowCells(state, key) {
  return state.areas.filter(function(r) { return r.split(' ').indexOf(key) !== -1; })[0].split(' ');
}

module('Unit | Utility | dashboard sections | Gentle caseload row', function() {
  test('a supervisor gets Caseload, Speak and Extras as the first row, a third each', function(assert) {
    var vis = { caseload: true, attention: true, rooms: true, boards: true, speak: true, extras: true };
    var state = gridLayoutState(vis, null, 'gentle');
    assert.strictEqual(state.areas[0], 'caseload caseload speak speak extras extras', 'first row, equal thirds, Caseload on the left');
    assert.strictEqual(state.columns, 'repeat(6, 1fr)', 'six columns, so a third is two whole tracks');
    assert.deepEqual(rowCells(state, 'boards'), ['boards', 'boards', 'boards', 'boards', 'boards', 'boards'], 'Boards still spans the full row');
    assert.true(state.areas.slice(0, -1).every(function(r) { return r.split(' ').length === 6; }), 'every content row is six wide');
    assert.strictEqual(state.classes.indexOf('md-grid--fullspan-caseload'), -1, 'Caseload is no longer the full-width showcase');
    assert.notStrictEqual(state.classes.indexOf('md-grid--caseload-row'), -1, 'the row is flagged for the stylesheet');
    assert.notStrictEqual(state.classes.indexOf('md-grid--caseload-row-3'), -1, 'with its count, for the 901-950px thirds');
    assert.deepEqual([state.orderIndices.caseload, state.orderIndices.speak, state.orderIndices.extras], [0, 1, 2], 'small screens stack them in the same order, first');
  });

  // Updated later on 2026-10-12 (approved): "for an admin user, move caseload and extras buttons below
  // organizations div" reversed the morning's "above My Organizations".
  test('an org manager gets the row directly BELOW My Organizations', function(assert) {
    var vis = { org: true, caseload: true, attention: true, rooms: true, boards: true, speak: true, extras: true };
    var state = gridLayoutState(vis, null, 'gentle');
    assert.strictEqual(state.areas[0], 'org_mgmt org_mgmt org_mgmt org_mgmt org_mgmt org_mgmt', 'My Organizations leads');
    assert.strictEqual(state.areas[1], 'caseload caseload speak speak extras extras', 'the row follows it');
  });

  test('an admin gets the row directly BELOW My Organizations (requested 2026-10-12, later the same day)', function(assert) {
    // An admin has no Speak (dashboard-admin-no-speak-test), so their row is Caseload | Extras.
    var vis = { org: true, caseload: true, attention: true, rooms: true, extras: true };
    var state = gridLayoutState(vis, null, 'gentle');
    assert.deepEqual(state.areas.slice(0, 2), ['org_mgmt org_mgmt', 'caseload extras'], 'My Organizations, then Caseload and Extras');
    var user = { get: function(path) {
      if (path === 'supporter_role') { return true; }
      if (path === 'organizations') { return [{ type: 'manager', restricted: false }]; }
      if (path === 'preferences.dashboard_sections') { return {}; }
      return null;
    } };
    var order = defaultOrderFor(user, 'gentle', vis);
    assert.deepEqual(order.slice(0, 3), ['org', 'caseload', 'extras'], 'the Dashboard Design default agrees');
  });

  test('with Extras hidden, Caseload and Speak split the row in half', function(assert) {
    var state = gridLayoutState({ caseload: true, boards: true, speak: true }, null, 'gentle');
    assert.strictEqual(state.areas[0], 'caseload speak', 'a half each on the two-column grid');
    assert.strictEqual(state.columns, null, 'no six-column grid is needed');
    assert.notStrictEqual(state.classes.indexOf('md-grid--caseload-row'), -1, 'still the caseload row');
    assert.strictEqual(state.classes.indexOf('md-grid--caseload-row-3'), -1, 'of two cards');
  });

  test('a communicator is unchanged', function(assert) {
    var state = gridLayoutState({ speak: true, extras: true, boards: true }, null, 'gentle');
    assert.strictEqual(state.areas[0], 'speak extras', 'Speak and Extras pair as before');
    assert.strictEqual(state.columns, null, 'two columns from the stylesheet');
    assert.strictEqual(state.classes.indexOf('md-grid--caseload-row'), -1, 'no caseload row');
  });

  test('Focused View is unchanged', function(assert) {
    var vis = { caseload: true, boards: true, speak: true, extras: true };
    var state = gridLayoutState(vis, null, 'focused', 'caseload');
    // Updated later on 2026-10-12 (approved): Focused now puts Extras beside the Caseload hero (its own
    // md-grid--caseload-beside row, dashboard-focused-caseload-beside-test), still not the Gentle row.
    assert.strictEqual(state.areas[0], 'caseload caseload caseload extras extras extras', 'Caseload and Extras share the first row, a half each');
    assert.strictEqual(state.classes.indexOf('md-grid--caseload-row'), -1, 'no Gentle caseload row');
  });

  test('the Dashboard Design default order puts the three first, as the page does', function(assert) {
    var user = { get: function(path) {
      if (path === 'supporter_role') { return true; }
      if (path === 'preferences.dashboard_sections') { return {}; }
      return null;
    } };
    var order = defaultOrderFor(user, 'gentle', { caseload: true, speak: true, extras: true, boards: true });
    assert.deepEqual(order.slice(0, 3), ['caseload', 'speak', 'extras'], 'editor seed matches the live grid');
  });
});
