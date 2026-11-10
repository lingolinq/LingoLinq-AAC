import { module, test } from 'qunit';
import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';
import i18n from 'frontend/utils/i18n';

/* WHICH ORG ROWS THE MODERN LEFT MENU SHOWS, and in what order (components/account-rail-org-rows.hbs).
 * Added 2026-11-09 (red-team review: the row gates lived only in the template, untested). Each row's
 * gate is the one its page and Basic's rail use: Admin Actions for the site-admin org's managers,
 * Billing for `manage_subscription`, Organizations for anyone with management responsibility,
 * Telemetry for an editor who is a site admin or in the telemetry beta; Reports, Rooms, Settings and
 * Trainings for every org editor (the rows are rendered only for editors). Alphabetical, as asked. */
module('Integration | Component | account-rail-org-rows', function(hooks) {
  setupRenderingTest(hooks);

  function stubAppState(context, sessionUser, flags) {
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      sessionUser: sessionUser, effective_view_user: sessionUser, feature_flags: flags || {}
    }));
  }
  function rows(element) {
    return Array.from(element.querySelectorAll('.md-acct-rail__label')).map(function(e) { return e.textContent.trim(); });
  }
  var t = function(key, text) { return i18n.t(key, text); };
  var EVERY_EDITOR = [t('reports', "Reports"), t('rooms', "Rooms"), t('settings', "Settings"), t('trainings', "Trainings")];

  test('an org manager gets Organizations and the editor rows, alphabetical', async function(assert) {
    this.owner.setupRouter();
    stubAppState(this, { user_name: 'mgr' });
    this.set('org', { id: '1_5', permissions: { view: true, edit: true } });
    await render(hbs`<AccountRailOrgRows @org={{this.org}} @canManageOrgs={{true}} />`);
    assert.deepEqual(rows(this.element), [t('organizations', "Organizations")].concat(EVERY_EDITOR));
  });

  test('an editor without management responsibility does not get Organizations', async function(assert) {
    this.owner.setupRouter();
    stubAppState(this, { user_name: 'ed' });
    this.set('org', { id: '1_5', permissions: { view: true, edit: true } });
    await render(hbs`<AccountRailOrgRows @org={{this.org}} @canManageOrgs={{false}} />`);
    assert.deepEqual(rows(this.element), EVERY_EDITOR);
  });

  test('a site admin on the admin org gets every row, alphabetical', async function(assert) {
    this.owner.setupRouter();
    stubAppState(this, { user_name: 'admin', permissions: { admin_support_actions: true } });
    this.set('org', { id: '1_1', admin: true, permissions: { view: true, edit: true, manage: true, manage_subscription: true } });
    await render(hbs`<AccountRailOrgRows @org={{this.org}} @canManageOrgs={{true}} />`);
    assert.deepEqual(rows(this.element), [
      t('admin_actions', "Admin Actions"), t('subscription_details', "Billing Details"), t('organizations', "Organizations"),
      t('reports', "Reports"), t('rooms', "Rooms"), t('settings', "Settings"), t('telemetry', "Telemetry"), t('trainings', "Trainings")
    ]);
  });

  test('the telemetry beta adds Telemetry for an editor who is not a site admin', async function(assert) {
    this.owner.setupRouter();
    stubAppState(this, { user_name: 'beta' }, { telemetry_admin_panel: true });
    this.set('org', { id: '1_5', permissions: { view: true, edit: true } });
    await render(hbs`<AccountRailOrgRows @org={{this.org}} @canManageOrgs={{false}} />`);
    assert.deepEqual(rows(this.element), [t('reports', "Reports"), t('rooms', "Rooms"), t('settings', "Settings"), t('telemetry', "Telemetry"), t('trainings', "Trainings")]);
  });

  test('the active row is lit and announced, and only that one', async function(assert) {
    this.owner.setupRouter();
    stubAppState(this, { user_name: 'mgr' });
    this.set('org', { id: '1_5', permissions: { view: true, edit: true } });
    await render(hbs`<AccountRailOrgRows @org={{this.org}} @canManageOrgs={{true}} @activeRow="rooms" />`);
    assert.dom('.md-acct-rail__row.is-active').exists({ count: 1 });
    assert.dom('.md-acct-rail__row.is-active .md-acct-rail__label').hasText(t('rooms', "Rooms"));
    assert.dom('.md-acct-rail__row[aria-current="page"]').exists({ count: 1 });
  });
});
