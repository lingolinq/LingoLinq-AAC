import { module, test } from 'qunit';
import { gridLayoutState, defaultOrderFor } from 'frontend/utils/dashboard_sections';

/* GENTLE VIEW caseload row. SUPERSEDED FOR SUPPORTERS 2026-10-13 (approved spec change): a SUPPORTER
   (caseload + Speak, not an org manager) now leads with Caseload | Speak ONLY -- Extras leaves the
   lead row and packs lower. Org managers (vis.org) keep the morning's Caseload | Speak | Extras /
   Caseload | Extras row below My Organizations, and communicators are untouched.
   Original request (2026-10-12): "the My Caseload button needs to show top left on the page ... then
   speak mode, then extras should show to its right, in equal sizes"; the 2026-10-13 request reversed
   the "then extras" part for supporters ("the button to the right of the main button should be Speak,
   not Extras ... just the supporter accounts"). */
module('Unit | Utility | dashboard sections | Gentle caseload row', function() {
  test('a supporter gets Caseload and Speak as the first row, Extras dropped from it', function(assert) {
    var vis = { caseload: true, attention: true, rooms: true, boards: true, speak: true, extras: true };
    var state = gridLayoutState(vis, null, 'gentle');
    assert.strictEqual(state.areas[0], 'caseload speak', 'first row is Caseload | Speak, a half each, Caseload on the left');
    assert.strictEqual(state.columns, null, 'two-column grid, no six-column thirds');
    assert.strictEqual(state.areas[0].indexOf('extras'), -1, 'Extras is not in the lead row');
    assert.true(state.areas.some(function(r) { return r.split(' ').indexOf('extras') !== -1; }), 'Extras is still placed, lower down');
    assert.strictEqual(state.classes.indexOf('md-grid--fullspan-caseload'), -1, 'Caseload is not the full-width showcase');
    assert.notStrictEqual(state.classes.indexOf('md-grid--caseload-row'), -1, 'the row is flagged for the stylesheet');
    assert.strictEqual(state.classes.indexOf('md-grid--caseload-row-3'), -1, 'two cards, not the three-up thirds');
    assert.deepEqual([state.orderIndices.caseload, state.orderIndices.speak], [0, 1], 'small screens stack Caseload then Speak, first');
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

  test('Focused View: the supporter lead row is Caseload | Speak too (2026-10-13)', function(assert) {
    var vis = { caseload: true, boards: true, speak: true, extras: true };
    var state = gridLayoutState(vis, null, 'focused', 'caseload');
    // 2026-10-13 (approved): Focused now puts Speak beside the Caseload hero (its own
    // md-grid--caseload-beside row, dashboard-focused-caseload-beside-test); Extras moves to the
    // action row. This is still not the Gentle caseload-row class.
    assert.strictEqual(state.areas[0], 'caseload caseload caseload speak speak speak', 'Caseload and Speak share the first row, a half each');
    assert.strictEqual(state.classes.indexOf('md-grid--caseload-row'), -1, 'no Gentle caseload row (that class is Gentle-only)');
  });

  test('the Dashboard Design default order leads with Caseload then Speak, as the page does', function(assert) {
    var user = { get: function(path) {
      if (path === 'supporter_role') { return true; }
      if (path === 'preferences.dashboard_sections') { return {}; }
      return null;
    } };
    var order = defaultOrderFor(user, 'gentle', { caseload: true, speak: true, extras: true, boards: true });
    assert.deepEqual(order.slice(0, 2), ['caseload', 'speak'], 'editor seed matches the live grid');
    assert.notStrictEqual(order.indexOf('extras'), -1, 'Extras is still in the order');
    assert.true(order.indexOf('extras') > order.indexOf('speak'), 'Extras sits after Speak, out of the lead row');
  });
});
