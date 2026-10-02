import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';
import EmberObject from '@ember/object';
import * as QUnit from 'qunit';

/*
 * A SITE ADMIN WHO MANAGES NO ORG (2026-10-02): the rail gives them System Settings in the place
 * the Rooms row takes for a rooms-only supervisor (utils/admin_nav). Organizations and Rooms keep
 * that place for anyone who has them, so the Admin row never shows beside either.
 */
QUnit.module('Integration | Component | dashboard/classic-rail admin slot', function(hooks) {
  setupRenderingTest(hooks);

  function setUser(owner, attrs) {
    owner.unregister('service:app-state');
    owner.register('service:app-state', Service.extend({
      currentUser: EmberObject.create(Object.assign({ user_name: 'admin1', supervisors: [], organizations: [], managed_orgs: [],
        supervised_units: [], preferences: { home_board: { key: 'admin1/core' }, logging: false } }, attrs)),
      feature_flags: {}
    }));
  }

  hooks.beforeEach(function() {
    this.owner.setupRouter();
    this.owner.unregister('service:stashes');
    this.owner.register('service:stashes', Service.extend({ classic_rail_collapsed: false, persist: function() {}, get: function() { return null; } }));
  });

  QUnit.test('a site admin with no org and no rooms gets System Settings', async function(assert) {
    setUser(this.owner, { admin: true });
    await render(hbs`<Dashboard::ClassicRail />`);
    assert.dom('.ch-rail__list a[href="/system-settings/emails"]').exists({ count: 1 });
    assert.dom('.ch-rail__list a[href="/system-settings/emails"] .ch-row__short').hasText('Admin');
  });

  QUnit.test('an admin who manages an org keeps Organizations, not Admin', async function(assert) {
    setUser(this.owner, { admin: true, has_management_responsibility: true });
    await render(hbs`<Dashboard::ClassicRail />`);
    assert.dom('.ch-rail__list a[href="/organizations"]').exists();
    assert.dom('.ch-rail__list a[href="/system-settings/emails"]').doesNotExist();
  });

  QUnit.test('an admin who supervises rooms keeps Rooms, not Admin', async function(assert) {
    setUser(this.owner, { admin: true, supervised_units: [{ id: '1_3', name: 'Blue Room', organization_id: '1_1' }] });
    await render(hbs`<Dashboard::ClassicRail />`);
    assert.dom('.ch-rail__list a[href="/organizations/1_1/rooms"]').exists();
    assert.dom('.ch-rail__list a[href="/system-settings/emails"]').doesNotExist();
  });

  QUnit.test('a user who is not an admin gets no Admin row', async function(assert) {
    setUser(this.owner, {});
    await render(hbs`<Dashboard::ClassicRail />`);
    assert.dom('.ch-rail__list a[href="/system-settings/emails"]').doesNotExist();
  });
});
