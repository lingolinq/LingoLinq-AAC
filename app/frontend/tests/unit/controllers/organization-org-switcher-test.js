import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* THE ORG SWITCHER IS NOT ON A ROOM'S OWN PAGE (requested 2026-10-01: "there shouldn't be an
 * organizational dropdown there since the user has already selected a specific room for a specific
 * org"). It still shows, with more than one org to choose between, on the other org pages.
 */
module('Unit | Controller | organization showOrgSwitcher', function(hooks) {
  setupTest(hooks);

  function controllerAt(context, routeName) {
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({ currentRouteName: routeName }));
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      currentUser: EmberObject.create({ organizations: [], supervised_units: [
        { id: 'u1', name: 'Blue', organization_id: '1_1' }, { id: 'u2', name: 'Green', organization_id: '1_2' }] })
    }));
    var c = context.owner.factoryFor('controller:organization').create();
    c.set('model', EmberObject.create({ id: '1_1' }));
    return c;
  }

  test('shown on the rooms list with two orgs to choose between', function(assert) {
    assert.true(controllerAt(this, 'organization.rooms').get('showOrgSwitcher'));
  });

  test('not on a room\'s own page', function(assert) {
    assert.false(controllerAt(this, 'organization.room').get('showOrgSwitcher'));
  });
});
