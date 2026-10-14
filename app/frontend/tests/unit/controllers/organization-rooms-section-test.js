import { module, test } from 'qunit';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* `roomsSectionActive` puts `md-hero--org-rooms` on the org header (templates/organization.hbs) on
 * the rooms list AND a room's page, so Basic shows that header as Modern does there (requested
 * 2026-10-01: "on basic view, the rooms page headers should show like they do on modern view"):
 * Basic's still, meta-less org header (_classic-home.scss) excludes it. Unlike `roomsPageActive`
 * (the list only), the room page counts: `organization.room` is a sibling route of the list.
 */
module('Unit | Controller | organization roomsSectionActive', function(hooks) {
  setupTest(hooks);

  function controllerAt(context, routeName, fallbackRoute) {
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({ currentRouteName: routeName }));
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({ current_route: fallbackRoute }));
    return context.owner.factoryFor('controller:organization').create();
  }

  test('true on the rooms list and a room', function(assert) {
    assert.true(controllerAt(this, 'organization.rooms').get('roomsSectionActive'), 'list');
    assert.true(controllerAt(this, 'organization.room').get('roomsSectionActive'), 'a room');
    assert.true(controllerAt(this, undefined, 'organization.room').get('roomsSectionActive'), 'from the in-flight fallback');
  });

  test('false on the other org pages', function(assert) {
    assert.expect(4);
    ['organization.index', 'organization.people', 'organization.reports', 'organizations'].forEach(function(route) {
      assert.false(controllerAt(this, route).get('roomsSectionActive'), route);
    }, this);
  });
});
