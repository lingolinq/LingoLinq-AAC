import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { waitUntil } from '@ember/test-helpers';
import { setupTest } from '../../helpers';
import { setupRestoreOnTeardown } from '../../helpers/restore-on-teardown';
import Utils from 'frontend/utils/misc';

/* ALL ORGANIZATIONS LOADS AFTER A RELOAD (2026-10-02). On a fresh load of /organizations the route's
 * setupController runs refresh_lists before the signed-in user's organizations have arrived, so
 * has_admin_access is still false, refresh_orgs skips the fetch, and an admin sees "None found"
 * until they leave and come back. The list must be fetched once admin access is known.
 *
 * Each test waits on its own result (`orgs.data`), never `settled()`: settled() waits for every
 * run-loop timer in the app, and one earlier test can leave a 15-minute stashes flush timer
 * (learnings-archive/2026-09.md, #1073). Both tests then hit the 15s timeout in CI, and the
 * `Utils.all_pages` stub, restored only in `finally`, stayed installed and failed every later
 * all_pages test. The stub is now also restored in afterEach, which runs after a timeout.
 */
module('Unit | Controller | organizations list load', function(hooks) {
  setupTest(hooks);
  var trackRestore = setupRestoreOnTeardown(hooks);

  test('fetches the org list when admin access arrives after setup', async function(assert) {
    assert.expect(3);
    var user = EmberObject.create({ organizations: [] });
    this.owner.unregister('service:app-state');
    this.owner.register('service:app-state', Service.extend({ currentUser: user }));
    var calls = 0;
    var original = Utils.all_pages;
    var restore = trackRestore(function() { Utils.all_pages = original; });
    Utils.all_pages = function() { calls++; return Promise.resolve([EmberObject.create({ name: 'Riverbend' })]); };
    try {
      var c = this.owner.lookup('controller:organizations');
      c.refresh_lists();
      assert.strictEqual(calls, 0, 'no fetch while the user has no admin org yet');
      user.set('organizations', [{ id: '1_1', type: 'manager', admin: true, full_manager: true }]);
      await waitUntil(function() { return c.get('orgs.data') !== undefined; }, { timeout: 3000 });
      assert.strictEqual(calls, 1, 'the list is fetched once admin access is known');
      assert.strictEqual((c.get('orgs.data') || []).length, 1, 'the fetched orgs are shown');
    } finally {
      restore();
    }
  });

  test('does not fetch twice when admin access is already known at setup', async function(assert) {
    assert.expect(1);
    var user = EmberObject.create({ organizations: [{ id: '1_1', type: 'manager', admin: true, full_manager: true }] });
    this.owner.unregister('service:app-state');
    this.owner.register('service:app-state', Service.extend({ currentUser: user }));
    var calls = 0;
    var original = Utils.all_pages;
    var restore = trackRestore(function() { Utils.all_pages = original; });
    Utils.all_pages = function() { calls++; return Promise.resolve([]); };
    try {
      var c = this.owner.lookup('controller:organizations');
      c.refresh_lists();
      await waitUntil(function() { return c.get('orgs.data') !== undefined; }, { timeout: 3000 });
      assert.strictEqual(calls, 1);
    } finally {
      restore();
    }
  });
});
