import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { isSiteAdmin, showsAdminSlot, canViewOrgTelemetry, canViewAdminActions } from 'frontend/utils/admin_nav';
import { showsRoomsPill } from 'frontend/utils/rooms_nav';

/* THE ADMIN SLOT is the third alternative in the one slot that holds Organizations or Rooms
 * (utils/rooms_nav), so at most one of the three is ever drawn for a person.
 */
module('Unit | Utility | admin_nav', function() {
  var user = function(attrs) { return EmberObject.create(attrs || {}); };
  var room = { id: 'r1', name: 'Birch', organization_id: '1_5' };

  test('a site admin who manages no org and supervises no rooms gets the Admin slot', function(assert) {
    assert.expect(3);
    assert.true(showsAdminSlot(user({ admin: true })), 'the admin setting');
    assert.true(showsAdminSlot(user({ is_admin: true })), 'is_admin');
    assert.true(showsAdminSlot(user({ permissions: { admin_support_actions: true } })), 'admin_support_actions');
  });

  test('Organizations and Rooms keep the slot when the admin has them', function(assert) {
    assert.expect(3);
    assert.false(showsAdminSlot(user({ admin: true, has_management_responsibility: true })), 'a manager keeps Organizations');
    var supervisor = user({ admin: true, supervised_units: [room] });
    assert.true(showsRoomsPill(supervisor), 'a rooms supervisor gets Rooms');
    assert.false(showsAdminSlot(supervisor), 'and not Admin beside it');
  });

  test('nobody else gets it', function(assert) {
    assert.expect(4);
    assert.false(showsAdminSlot(null), 'no user');
    assert.false(showsAdminSlot(user({})), 'a plain user');
    assert.false(showsAdminSlot(user({ permissions: { admin_support_actions: false, edit: true } })), 'other permissions');
    assert.false(isSiteAdmin(user({ admin: false, is_admin: false })), 'flags set false');
  });

  /* The org Telemetry link is offered to exactly who the server serves the page to
     (api/telemetry_controller.rb): an org editor who is a site admin or in the telemetry beta. */
  test('Telemetry: org editors who are site admins or in the telemetry beta', function(assert) {
    assert.expect(5);
    var editable = { permissions: { view: true, edit: true } };
    assert.true(canViewOrgTelemetry(editable, user({ admin: true }), {}), 'site admin editor');
    assert.true(canViewOrgTelemetry(editable, user({}), { telemetry_admin_panel: true }), 'editor in the beta');
    assert.false(canViewOrgTelemetry(editable, user({}), {}), 'an editor alone');
    assert.false(canViewOrgTelemetry({ permissions: { view: true } }, user({ admin: true }), { telemetry_admin_panel: true }), 'no edit on the org');
    assert.false(canViewOrgTelemetry(null, user({ admin: true }), {}), 'no org');
  });

  test('Admin Actions: the site-admin org, with manage', function(assert) {
    assert.expect(3);
    assert.true(canViewAdminActions({ admin: true, permissions: { manage: true } }));
    assert.false(canViewAdminActions({ admin: false, permissions: { manage: true } }), 'another org');
    assert.false(canViewAdminActions({ admin: true, permissions: { edit: true } }), 'without manage');
  });
});
