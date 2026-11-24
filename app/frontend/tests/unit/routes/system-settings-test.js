import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* THE ORGANIZATION LIST LOADS FOR THE USER THE ROUTE JUST LOADED (2026-11-09). The controller used
 * to load it once, when it was created, from `app_state.currentUser` -- which on a direct load or a
 * refresh of /system-settings is not hydrated yet, so the Organization select stayed empty (measured
 * on develop: 0 options on a direct load, 7 after in-app navigation). `beforeModel` already fetches
 * the user; `setupController` now hands that user to `loadOrganizations` on every visit. */
module('Unit | Route | system-settings', function(hooks) {
  setupTest(hooks);

  test('setupController loads the org list for the user beforeModel loaded', async function(assert) {
    var user = EmberObject.create({ admin: true, permissions: {}, organizations: [{ id: '1_5', name: 'Org', type: 'manager' }] });
    this.owner.unregister('service:session');
    this.owner.register('service:session', Service.extend({ isAuthenticated: true, access_token: 'x' }));
    this.owner.unregister('service:store');
    this.owner.register('service:store', Service.extend({ findRecord() { return RSVP.resolve(user); } }));
    var route = this.owner.lookup('route:system-settings');
    await route.beforeModel();
    var calls = [];
    var controller = { loadOrganizations(u) { calls.push(u); }, set() {} };
    route.setupController(controller, undefined);
    assert.strictEqual(calls.length, 1, 'loaded once on entry');
    assert.strictEqual(calls[0], user, 'for the user beforeModel loaded, not whatever app_state holds');
  });
});
