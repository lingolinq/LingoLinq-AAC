import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* MODERN ORG PAGES GET THE ORG TABS AND A SIDE MENU (2026-11-08, requested: "modern view needs the
 * Admin/Managers/Supervisors/Communicators/Evals/Symbols top menu along with their own side menu on
 * the organization page"). Until then both were Basic-only: the six tabs sat inside
 * `{{#if this.isClassic}}` (templates/organization.hbs) and `showGlobalChrome` kept every
 * `organization.*` page except a rooms-only supervisor's Rooms list out of the app shell, so Modern
 * had no rail there at all. */

function viewer(style, extra) {
  return EmberObject.create(Object.assign({ user_name: 'manager', preferences: { board_view_style: style } }, extra || {}));
}

module('Unit | Controller | organization org tabs in both views', function(hooks) {
  setupTest(hooks);

  function controllerAt(context, routeName, style, permissions, userExtra) {
    var user = viewer(style, userExtra || { has_management_responsibility: true });
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({ currentRouteName: routeName }));
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({ current_route: routeName, currentUser: user, effective_view_user: user }));
    var controller = context.owner.factoryFor('controller:organization').create();
    controller.set('model', { id: '1_1', permissions: permissions });
    return controller;
  }

  test('an org editor gets the six tabs in Modern, with Modern\'s classes, and no back strip', function(assert) {
    var c = controllerAt(this, 'organization.index', 'modern', { view: true, edit: true });
    assert.true(c.get('showOrgTabs'), 'the tabs render');
    assert.false(c.get('showBackStrip'), 'the "< Home | <section>" strip does not');
    assert.strictEqual(c.get('orgTabClass'), 'md-pillnav__pill', 'Modern pill class on each tab');
    assert.true(c.get('orgTabsNavClass').split(' ').includes('md-pillnav'), 'Modern pill nav class on the strip');
  });

  test('Basic is unchanged: tabs for an editor, ch- classes, never the back strip', function(assert) {
    var editor = controllerAt(this, 'organization.index', 'classic', { view: true, edit: true });
    assert.true(editor.get('showOrgTabs'));
    assert.strictEqual(editor.get('orgTabClass'), 'ch-tab');
    assert.strictEqual(editor.get('orgTabsNavClass'), 'ch-tabs ch-tabs--primary');
    var viewOnly = controllerAt(this, 'organization.index', 'classic', { view: true });
    assert.false(viewOnly.get('showOrgTabs'), 'no tabs for a view-only visitor');
    assert.false(viewOnly.get('showBackStrip'), 'and no Modern strip in Basic either');
  });

  /* Modern draws them in the app shell's nav slot, where the home pill nav sits (requested
     2026-11-08), so the org page itself draws them only in Basic; and in Modern they wear the
     primary nav's `--primary` hooks so they collapse at the same width, to the same place. */
  test('Basic draws the tabs in the page; Modern leaves them to the app shell, as its primary nav', function(assert) {
    var basic = controllerAt(this, 'organization.index', 'classic', { view: true, edit: true });
    assert.true(basic.get('showInPageOrgTabs'), 'Basic: in the page');
    assert.strictEqual(basic.get('orgTabsDropdownClass'), '', 'Basic: no Modern dropdown hook');
    var modern = controllerAt(this, 'organization.index', 'modern', { view: true, edit: true });
    assert.false(modern.get('showInPageOrgTabs'), 'Modern: not in the page');
    assert.true(modern.get('orgTabsNavClass').split(' ').includes('md-pillnav--primary'), 'Modern strip is the primary nav');
    assert.strictEqual(modern.get('orgTabsDropdownClass'), 'md-pillnav-dropdown--primary', 'and so is its dropdown');
  });

  test('a view-only visitor in Modern keeps the back strip and gets no tabs', function(assert) {
    var c = controllerAt(this, 'organization.index', 'modern', { view: true });
    assert.false(c.get('showOrgTabs'));
    assert.true(c.get('showBackStrip'));
  });

  test('where the app shell already drew its pill nav, Modern draws neither', function(assert) {
    /* A rooms-only supervisor (rooms in an org, no management responsibility) on the Rooms list: the
       app shell mounts the full pill nav there (utils/primary_nav, `rooms`). Edit permission is set
       anyway, so the only thing that can hide the tabs is the app shell's nav being present. */
    var c = controllerAt(this, 'organization.rooms', 'modern', { view: true, edit: true },
      { has_management_responsibility: false, supervised_units: [{ organization_id: '1_1', name: 'Room A' }] });
    assert.false(c.get('showSectionPillNav'), 'precondition: the app shell draws its nav here');
    assert.false(c.get('showOrgTabs'), 'no second nav under the app shell\'s');
    assert.false(c.get('showBackStrip'));
  });
});

module('Unit | Controller | application org pages get the Modern rail', function(hooks) {
  setupTest(hooks);

  function appAt(context, routeName, style, orgModel) {
    var user = viewer(style, { has_management_responsibility: true, supervised_units: [] });
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({ currentRouteName: routeName, currentURL: '/x' }));
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      current_route: routeName, currentUser: user, sessionUser: user, effective_view_user: user,
      speak_mode: false, feature_flags: {}
    }));
    if(orgModel) { context.owner.lookup('controller:organization').set('model', orgModel); }
    return context.owner.lookup('controller:application');
  }

  test('every organization.* page is chrome in Modern', function(assert) {
    assert.expect(5);
    ['organization.index', 'organization.people', 'organization.rooms', 'organization.room', 'organization.settings'].forEach(function(route) {
      assert.true(appAt(this, route, 'modern').get('showGlobalChrome'), route);
    }, this);
  });

  test('but never in Basic, which mounts its own rail', function(assert) {
    assert.false(appAt(this, 'organization.index', 'classic').get('showGlobalChrome'));
  });

  test('the rail is handed the org on an org page', function(assert) {
    var org = { id: '1_1', permissions: { edit: true } };
    assert.strictEqual(appAt(this, 'organization.people', 'modern', org).get('globalChromeOrg'), org);
  });

  test('and no org anywhere else, even with one still loaded', function(assert) {
    var org = { id: '1_1', permissions: { edit: true } };
    assert.strictEqual(appAt(this, 'user.stats', 'modern', org).get('globalChromeOrg'), null);
  });

  test('the pill nav does not come with it for a manager', function(assert) {
    assert.false(appAt(this, 'organization.index', 'modern').get('showPillNav'));
  });

  test('an org editor\'s org page puts the org tabs in the nav slot', function(assert) {
    var app = appAt(this, 'organization.index', 'modern', { id: '1_1', permissions: { view: true, edit: true } });
    assert.true(app.get('showOrgNav'), 'the org tabs take the slot');
    assert.true(app.get('showNavbar'), 'so the slot renders, and the shell clears it');
  });

  test('a view-only visitor\'s org page leaves the slot empty', function(assert) {
    var app = appAt(this, 'organization.index', 'modern', { id: '1_1', permissions: { view: true } });
    assert.false(app.get('showOrgNav'));
    assert.false(app.get('showNavbar'));
  });
});
