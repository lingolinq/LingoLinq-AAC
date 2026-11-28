import { module, test } from 'qunit';
import { basicDashboardSections } from 'frontend/utils/basic_dashboard_sections';

/* The Basic dashboard's <=550px section menu offers the sections the tab strip shows
 * (utils/basic_dashboard_sections.js; the strip's gates are in components/dashboard/classic-view.hbs).
 * Pinned here so a modeling-only user can never start seeing Communicators or Updates in the menu
 * while the strip hides them (senior-dev review 2026-11-10). */
module('Unit | Utility | basic dashboard sections', function() {
  function ids(opts) { return basicDashboardSections(opts).map(function(s) { return s.id; }); }

  test('someone with a caseload sees all four', function(assert) {
    assert.deepEqual(ids({ modelingOnly: false, showCommunicators: true }), ['main', 'supervisees', 'boards', 'updates']);
  });

  test('without a caseload, no Communicators', function(assert) {
    assert.deepEqual(ids({ modelingOnly: false, showCommunicators: false }), ['main', 'boards', 'updates']);
  });

  test('modeling-only: no Communicators and no Updates, even with a caseload', function(assert) {
    assert.deepEqual(ids({ modelingOnly: true, showCommunicators: true }), ['main', 'boards']);
  });

  test('Updates carries the pending count, as the strip\'s badge does', function(assert) {
    var updates = basicDashboardSections({ pendingUpdates: 5 }).find(function(s) { return s.id === 'updates'; });
    assert.strictEqual(updates.label, 'Updates (5)');
    var none = basicDashboardSections({ pendingUpdates: 0 }).find(function(s) { return s.id === 'updates'; });
    assert.strictEqual(none.label, 'Updates');
  });
});
