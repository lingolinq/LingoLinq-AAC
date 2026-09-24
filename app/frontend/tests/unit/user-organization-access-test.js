import { module, test } from 'qunit';
import { setupTest } from '../helpers';

/* WHICH ROW THE BASIC RAIL OFFERS: Organizations, or Rooms.
 *
 * The two are mutually exclusive and `has_management_responsibility` is what picks between
 * them, so these pin its boundaries rather than a nav template's.
 *
 *   MANAGER      -> Organizations. `/organizations/:id/people` is theirs to use.
 *   SUPERVISOR   -> Rooms. That page wraps its entire contents in `permissions.edit`
 *                   (templates/organization/people.hbs:1), so an Organizations row would
 *                   land them on "No information available" -- which is exactly what was
 *                   observed when the gate was briefly widened to include supervisors.
 *
 * The widened `has_organization_access` that briefly existed is gone; it reported true for
 * supervisors and sent them to a page they cannot open.
 */
module('Unit | Model | user organization access', function(hooks) {
  setupTest(hooks);

  function withOrgs(owner, orgs) {
    return owner.lookup('service:store').createRecord('user', { organizations: orgs });
  }

  test('a manager has management responsibility, so the rail offers Organizations', function(assert) {
    var u = withOrgs(this.owner, [{ type: 'manager', id: '1_1', name: 'Org' }]);
    assert.true(u.get('has_management_responsibility'));
    assert.strictEqual((u.get('managed_orgs') || []).length, 1);
  });

  /* THE CASE THAT DROVE THE PAIRING. */
  test('a supervisor has none, so the rail offers Rooms instead', function(assert) {
    var u = withOrgs(this.owner, [{ type: 'supervisor', id: '1_2', name: 'District' }]);
    assert.false(u.get('has_management_responsibility'),
      'supervising an org is not managing it');
    assert.strictEqual((u.get('managed_orgs') || []).length, 0);
  });

  test('someone with no org relationship has none', function(assert) {
    assert.false(withOrgs(this.owner, []).get('has_management_responsibility'));
  });

  test('a missing organizations list does not throw', function(assert) {
    assert.false(withOrgs(this.owner, null).get('has_management_responsibility'));
  });

  /* `restricted` is how a limited manager is kept out of `managed_orgs`; the rail follows it. */
  test('a restricted manager does not count as managing', function(assert) {
    var u = withOrgs(this.owner, [{ type: 'manager', id: '1_1', name: 'Org', restricted: true }]);
    assert.false(u.get('has_management_responsibility'));
  });

  test('an unrestricted manager alongside a restricted one still counts', function(assert) {
    var u = withOrgs(this.owner, [
      { type: 'manager', id: '1_1', name: 'A', restricted: true },
      { type: 'manager', id: '1_2', name: 'B' }
    ]);
    assert.true(u.get('has_management_responsibility'));
  });

  /* `type: 'user'` means an org manages THIS PERSON -- the sponsored-user relationship, not
     any kind of management right. */
  test('being a managed user of an org confers nothing', function(assert) {
    var u = withOrgs(this.owner, [{ type: 'user', id: '1_3', name: 'District', sponsored: true }]);
    assert.false(u.get('has_management_responsibility'));
    assert.true(u.get('is_managed'), 'precondition: they ARE managed by that org');
  });
});
