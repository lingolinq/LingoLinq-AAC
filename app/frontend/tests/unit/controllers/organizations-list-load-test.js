import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { settled } from '@ember/test-helpers';
import { setupTest } from '../../helpers';
import Utils from 'frontend/utils/misc';

/* ALL ORGANIZATIONS LOADS AFTER A RELOAD (2026-10-02). On a fresh load of /organizations the route's
 * setupController runs refresh_lists before the signed-in user's organizations have arrived, so
 * has_admin_access is still false, refresh_orgs skips the fetch, and an admin sees "None found"
 * until they leave and come back. The list must be fetched once admin access is known.
 */
module('Unit | Controller | organizations list load', function(hooks) {
  setupTest(hooks);

  test('fetches the org list when admin access arrives after setup', async function(assert) {
    assert.expect(3);
    var user = EmberObject.create({ organizations: [] });
    this.owner.unregister('service:app-state');
    this.owner.register('service:app-state', Service.extend({ currentUser: user }));
    var calls = 0;
    var original = Utils.all_pages;
    Utils.all_pages = function() { calls++; return Promise.resolve([EmberObject.create({ name: 'Riverbend' })]); };
    try {
      var c = this.owner.lookup('controller:organizations');
      c.refresh_lists();
      assert.strictEqual(calls, 0, 'no fetch while the user has no admin org yet');
      user.set('organizations', [{ id: '1_1', type: 'manager', admin: true, full_manager: true }]);
      await settled();
      await Promise.resolve();
      assert.strictEqual(calls, 1, 'the list is fetched once admin access is known');
      assert.strictEqual((c.get('orgs.data') || []).length, 1, 'the fetched orgs are shown');
    } finally {
      Utils.all_pages = original;
    }
  });

  test('does not fetch twice when admin access is already known at setup', async function(assert) {
    assert.expect(1);
    var user = EmberObject.create({ organizations: [{ id: '1_1', type: 'manager', admin: true, full_manager: true }] });
    this.owner.unregister('service:app-state');
    this.owner.register('service:app-state', Service.extend({ currentUser: user }));
    var calls = 0;
    var original = Utils.all_pages;
    Utils.all_pages = function() { calls++; return Promise.resolve([]); };
    try {
      var c = this.owner.lookup('controller:organizations');
      c.refresh_lists();
      await settled();
      assert.strictEqual(calls, 1);
    } finally {
      Utils.all_pages = original;
    }
  });
});
