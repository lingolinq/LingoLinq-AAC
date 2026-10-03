import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';
import EmberObject from '@ember/object';
import * as QUnit from 'qunit';

/*
 * The Basic rail in ORG MODE (components/dashboard/classic-rail.hbs, `@org`) on the organisation
 * pages (2026-10-01; adversarial review M1, approved by Traci: "make sure view-only users are hidden
 * from admin links"). Reports, Trainings and Settings are admin sections and showed to anyone; on
 * develop they sat behind `permissions.edit`. Rooms stays for everyone: a room supervisor uses it.
 */
QUnit.module('Integration | Component | dashboard/classic-rail org admin rows', function(hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function() {
    this.owner.setupRouter();
    this.owner.unregister('service:stashes');
    this.owner.register('service:stashes', Service.extend({ classic_rail_collapsed: false, persist: function() {}, get: function() { return null; } }));
    this.owner.unregister('service:app-state');
    this.owner.register('service:app-state', Service.extend({
      currentUser: EmberObject.create({ user_name: 'example', supervisors: [], organizations: [], supervised_units: [], preferences: {} }),
      feature_flags: { lessons: true }
    }));
  });

  function hrefs(element) {
    return [...element.querySelectorAll('.ch-rail__list a')].map(function(a) { return a.getAttribute('href'); });
  }

  QUnit.test('an org editor sees Reports, Rooms, Trainings and Settings', async function(assert) {
    this.set('org', { id: '1_1', permissions: { view: true, edit: true } });
    await render(hbs`<Dashboard::ClassicRail @org={{this.org}} />`);
    var h = hrefs(this.element);
    assert.deepEqual(['/organizations/1_1/reports', '/organizations/1_1/rooms', '/organizations/1_1/lessons', '/organizations/1_1/settings'].filter(function(p) { return h.indexOf(p) === -1; }), [],
      'every org row is present');
  });

  QUnit.test('a view-only visitor sees Rooms and none of the admin rows', async function(assert) {
    this.set('org', { id: '1_1', permissions: { view: true } });
    await render(hbs`<Dashboard::ClassicRail @org={{this.org}} />`);
    var h = hrefs(this.element);
    assert.notStrictEqual(h.indexOf('/organizations/1_1/rooms'), -1, 'Rooms');
    assert.deepEqual(['/organizations/1_1/reports', '/organizations/1_1/lessons', '/organizations/1_1/settings'].filter(function(p) { return h.indexOf(p) !== -1; }), [],
      'none of the admin rows');
  });

  /* ADMIN ACTIONS (2026-10-02, requested: "adding a menu for admin actions in basic"). The page
     (templates/organization/extras.hbs) renders only for the SITE-admin organisation and only for
     someone with `manage` on it, so the row carries that same gate. */
  QUnit.test('the site-admin org shows Admin Actions to someone who can manage it', async function(assert) {
    this.set('org', { id: '1_1', admin: true, permissions: { view: true, edit: true, manage: true } });
    await render(hbs`<Dashboard::ClassicRail @org={{this.org}} />`);
    assert.notStrictEqual(hrefs(this.element).indexOf('/organizations/1_1/extras'), -1, 'Admin Actions');
  });

  QUnit.test('Admin Actions is hidden without manage, and on every ordinary org', async function(assert) {
    this.set('org', { id: '1_1', admin: true, permissions: { view: true, edit: true } });
    await render(hbs`<Dashboard::ClassicRail @org={{this.org}} />`);
    assert.strictEqual(hrefs(this.element).indexOf('/organizations/1_1/extras'), -1, 'admin org, edit but no manage');
    this.set('org', { id: '1_2', admin: false, permissions: { view: true, edit: true, manage: true } });
    await render(hbs`<Dashboard::ClassicRail @org={{this.org}} />`);
    assert.strictEqual(hrefs(this.element).indexOf('/organizations/1_2/extras'), -1, 'ordinary org, even with manage');
  });

  /* BILLING (2026-10-02, reported: "for an admin user, there's no way to route to the licensing
     crediting page"). organization.subscription (Billing Details: purchased licenses, premium
     supervisors, eval accounts, premium symbols, expiry) is gated on `manage_subscription`, which
     is also how the org page linked to it until the Basic redesign dropped the button. */
  QUnit.test('Billing shows to someone who can manage the subscription, on any org', async function(assert) {
    this.set('org', { id: '1_2', admin: false, permissions: { view: true, edit: true, manage: true, manage_subscription: true } });
    await render(hbs`<Dashboard::ClassicRail @org={{this.org}} />`);
    assert.notStrictEqual(hrefs(this.element).indexOf('/organizations/1_2/subscription'), -1, 'Billing');
  });

  QUnit.test('Billing is hidden without manage_subscription', async function(assert) {
    this.set('org', { id: '1_2', admin: false, permissions: { view: true, edit: true, manage: true } });
    await render(hbs`<Dashboard::ClassicRail @org={{this.org}} />`);
    assert.strictEqual(hrefs(this.element).indexOf('/organizations/1_2/subscription'), -1, 'no Billing');
  });
});
