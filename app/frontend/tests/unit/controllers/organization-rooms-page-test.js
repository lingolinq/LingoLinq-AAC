import { module, test } from 'qunit';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* `roomsPageActive` drives `md-shell--org-rooms` on the org shell (templates/organization.hbs),
 * which is the hook for the Basic + Focused Rooms page's top spacing (requested 2026-09-28,
 * _classic-home.scss). A route-derived class rather than a `:has()` on the page's content,
 * because the rooms template has no root element and its content differs between the manager
 * and supervisor branches and while loading -- a content hook would let the page jump.
 *
 * Exact match, like `adminTabActive`: the org sub-pages are siblings, so a prefix test would
 * trim the spacing on every one of them. The router is stubbed; only the route name is read. */
module('Unit | Controller | organization roomsPageActive', function(hooks) {
  setupTest(hooks);

  function controllerAt(context, routeName, fallbackRoute) {
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({ currentRouteName: routeName }));
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({ current_route: fallbackRoute }));
    return context.owner.factoryFor('controller:organization').create();
  }

  test('true on the rooms list', function(assert) {
    assert.true(controllerAt(this, 'organization.rooms').get('roomsPageActive'));
  });

  test('true from the in-flight fallback while the router has not caught up', function(assert) {
    assert.true(controllerAt(this, undefined, 'organization.rooms').get('roomsPageActive'));
  });

  test('false on the other org pages', function(assert) {
    assert.expect(4);
    ['organization.index', 'organization.people', 'organization.room', 'organizations'].forEach(function(route) {
      assert.false(controllerAt(this, route).get('roomsPageActive'), route);
    }, this);
  });

  /* THE ADMIN TABS ARE NOT FOR A VIEW-ONLY VISITOR ON THE ROOMS PAGE (requested 2026-09-28).
     `permissions.edit` is what separates a manager or assistant from someone who can only view
     the org (a supervisor, a public viewer, a manager with org access off:
     app/models/organization.rb add_permissions). The tabs lead to admin sections that visitor
     cannot use, so on the Rooms list they go; elsewhere, and for anyone who can edit, they stay. */
  function withOrg(context, routeName, permissions) {
    var controller = controllerAt(context, routeName);
    controller.set('model', { id: '1_1', permissions: permissions });
    return controller;
  }

  test('the Basic org tabs hide on the Rooms list for a view-only visitor', function(assert) {
    assert.false(withOrg(this, 'organization.rooms', { view: true }).get('showBasicOrgTabs'));
    assert.false(withOrg(this, 'organization.rooms', { view: true, edit: false }).get('showBasicOrgTabs'),
      'an explicit false as well as an absent key');
  });

  /* CHANGED 2026-10-01, approved by Traci ("make sure view-only users are hidden from admin
     links"): a view-only visitor used to keep the tabs on every org page except the Rooms list.
     On develop the org nav's admin links sat behind `permissions.edit` on EVERY org page, so this
     restores that gate (adversarial review M1). */
  test('and stay for anyone who can edit; a view-only visitor never gets them', function(assert) {
    assert.true(withOrg(this, 'organization.rooms', { view: true, edit: true }).get('showBasicOrgTabs'),
      'an editor on the Rooms list');
    assert.true(withOrg(this, 'organization.index', { view: true, edit: true }).get('showBasicOrgTabs'),
      'an editor elsewhere');
    assert.false(withOrg(this, 'organization.index', { view: true }).get('showBasicOrgTabs'),
      'a view-only visitor on the org page');
    assert.false(withOrg(this, 'organization.room', { view: true }).get('showBasicOrgTabs'),
      'a view-only visitor on a room');
  });
});
