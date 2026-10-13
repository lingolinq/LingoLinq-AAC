import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import RSVP from 'rsvp';
import { setupTest } from '../../helpers';

/* AN ORG PAGE NEVER STARTS WITHOUT ITS PERMISSIONS WHEN THEY CAN BE FETCHED (2026-10-01).
 * organizations#index (the admin org list, api/organizations_controller.rb:828) returns orgs
 * WITHOUT permissions (lib/json_api/organization.rb:15 adds them only when asked), and
 * findRecord hands that stored record straight back. The parent route reloaded it in the
 * background, so child pages read `permissions.edit` before it existed: the Rooms page
 * (routes/organization/rooms.js) skipped loading the rooms, then showed "No rooms created" to
 * the admin once the permissions arrived.
 */
module('Unit | Route | organization permissions wait', function(hooks) {
  setupTest(hooks);

  function setup(context, online, reloadFails) {
    var reloads = 0;
    var org = EmberObject.create({
      id: '1_2',
      permissions: null,
      reload: function() {
        reloads++;
        if(reloadFails) { return RSVP.reject({ error: 'nope' }); }
        org.set('permissions', { view: true, edit: true });
        return RSVP.resolve(org);
      }
    });
    context.owner.unregister('service:store');
    context.owner.register('service:store', Service.extend({ findRecord: function() { return RSVP.resolve(org); } }));
    context.owner.unregister('service:persistence');
    context.owner.register('service:persistence', Service.extend({ online: online }));
    return { org: org, reloads: function() { return reloads; } };
  }

  test('online, an org without permissions is reloaded BEFORE the page gets it', async function(assert) {
    var t = setup(this, true, false);
    var model = await this.owner.lookup('route:organization').model({ id: '1_2' });
    assert.strictEqual(model, t.org);
    assert.true(model.get('permissions.edit'), 'the permissions are there when child pages read them');
    assert.strictEqual(t.reloads(), 1, 'one reload');
  });

  test('a failed reload still opens the page, as before', async function(assert) {
    var t = setup(this, true, true);
    var model = await this.owner.lookup('route:organization').model({ id: '1_2' });
    assert.strictEqual(model, t.org, 'the stored record is used');
  });

  test('offline: no reload, the stored record is used at once', async function(assert) {
    var t = setup(this, false, false);
    var model = await this.owner.lookup('route:organization').model({ id: '1_2' });
    assert.strictEqual(model, t.org);
    assert.strictEqual(t.reloads(), 0);
  });
});
