import { module, test } from 'qunit';
import { availableHomeSections, sectionsForLayout, layoutPresentation } from 'frontend/utils/dashboard_sections';

/* AN ADMIN'S HOME PAGE HAS NO SPEAK MODE BUTTON (requested 2026-10-12: "on an admin user, hide the
   speak button on the home page"). "Admin" is the registry's own role name for an org manager
   (`hero_for: 'admin'` resolves through hasOrgManagement), so the gate is that function. */
module('Unit | Utility | dashboard sections | admin has no Speak', function() {
  function stubUser(props) { return { get: function(k) { return props[k]; } }; }
  var admin = stubUser({ organizations: [{ type: 'manager', restricted: false }] });
  var adminSupervisor = stubUser({ supporter_role: true, supervisees: [], supervised_units: [], organizations: [{ type: 'manager', restricted: false }] });
  var supervisor = stubUser({ supporter_role: true, supervisees: [], supervised_units: [] });
  var restrictedMember = stubUser({ organizations: [{ type: 'manager', restricted: true }] });
  var keys = function(user) { return availableHomeSections(user).map(function(s) { return s.key; }); };

  test('Speak is not available to an admin, with or without a caseload', function(assert) {
    assert.strictEqual(keys(admin).indexOf('speak'), -1, 'admin');
    assert.strictEqual(keys(adminSupervisor).indexOf('speak'), -1, 'admin who also supervises');
  });

  test('so neither layout places it, and Dashboard Design does not offer it', function(assert) {
    assert.expect(6);
    ['gentle', 'focused'].forEach(function(layout) {
      var pres = layoutPresentation(adminSupervisor, layout, {});
      assert.notOk(pres.vis.speak, layout + ': not visible, so its cards get display:none');
      assert.notOk(pres.grid.areasValue.includes('speak'), layout + ': no grid area');
      assert.strictEqual(sectionsForLayout(adminSupervisor, layout).map(function(s) { return s.key; }).indexOf('speak'), -1, layout + ': no checkbox');
    });
  });

  test('everyone else keeps Speak', function(assert) {
    assert.notStrictEqual(keys(supervisor).indexOf('speak'), -1, 'a supervisor');
    assert.notStrictEqual(keys(stubUser({})).indexOf('speak'), -1, 'a communicator');
    assert.notStrictEqual(keys(restrictedMember).indexOf('speak'), -1, 'a restricted org role is not an admin');
  });
});
