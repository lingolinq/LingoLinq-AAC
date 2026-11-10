import { module, test } from 'qunit';
import Service from '@ember/service';
import i18n from 'frontend/utils/i18n';
import { setupTest } from '../../helpers';

/* THE MODERN RAIL'S ORG MODE (2026-11-08, requested: Modern org pages need "their own side menu").
 * Given an org it can edit, the rail swaps its account rows for the org's (account-rail-org-rows.hbs)
 * and names itself as Basic's org rail does. Given an org it cannot edit, or none, it is the
 * account rail exactly as before. */
module('Unit | Component | account-rail org mode', function(hooks) {
  setupTest(hooks);

  function rail(context, routeName, org) {
    context.owner.unregister('service:stashes');
    context.owner.register('service:stashes', Service.extend({ get() { return undefined; }, persist() {} }));
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({ currentRouteName: routeName }));
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({}));
    return context.owner.factoryFor('component:account-rail').create({ org: org });
  }
  var EDITOR = { id: '1_1', permissions: { view: true, edit: true } };
  var VIEWER = { id: '1_1', permissions: { view: true } };

  /* Named "Organization Navigation", title case (requested 2026-11-09; was Basic's sentence-case
     `classic_org_rail_aria`). */
  test('an org editor gets the org menu, named "Organization Navigation"', function(assert) {
    var c = rail(this, 'organization.index', EDITOR);
    assert.true(c.get('orgNav'));
    assert.strictEqual(c.get('menuName'), i18n.t('org_navigation', "Organization Navigation"));
  });

  test('anyone else, and every non-org page, keeps the account rail', function(assert) {
    assert.false(rail(this, 'organization.index', VIEWER).get('orgNav'), 'view-only on an org page');
    assert.false(rail(this, 'user.stats', null).get('orgNav'), 'no org');
    assert.strictEqual(rail(this, 'user.stats', null).get('menuName'), i18n.t('account_menu', "Account menu"));
  });

  test('the org row lights for its page, Rooms on a room\'s page too, and nothing on the tab pages', function(assert) {
    assert.strictEqual(rail(this, 'organization.reports', EDITOR).get('orgRow'), 'reports');
    assert.strictEqual(rail(this, 'organization.rooms', EDITOR).get('orgRow'), 'rooms');
    assert.strictEqual(rail(this, 'organization.room', EDITOR).get('orgRow'), 'rooms', 'a room\'s page is a sibling route');
    assert.strictEqual(rail(this, 'organization.people', EDITOR).get('orgRow'), null, 'people sections are the tabs');
    assert.strictEqual(rail(this, 'organization.index', EDITOR).get('orgRow'), null, 'Admin is a tab');
  });

  test('the narrow-screen trigger names the org row, else the org menu', function(assert) {
    var reports = rail(this, 'organization.reports', EDITOR);
    var menu = i18n.t('org_navigation', "Organization Navigation");
    assert.strictEqual(reports.get('activeLabel'), i18n.t('reports', "Reports"));
    assert.strictEqual(reports.get('menuTriggerLabel'), i18n.t('reports', "Reports") + ', ' + menu);
    var people = rail(this, 'organization.people', EDITOR);
    assert.strictEqual(people.get('activeLabel'), menu);
    assert.strictEqual(people.get('menuTriggerLabel'), menu, 'said once');
  });
});
