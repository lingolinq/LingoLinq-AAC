import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';
import EmberObject from '@ember/object';
import * as QUnit from 'qunit';

/*
 * THE BASIC RAIL FOR SOMEONE WITH ROOMS ACCESS ONLY (requested 2026-10-01): on the org pages they
 * can open (the rooms list and a room), someone who cannot edit the org gets "a mix of the home page
 * menu and the org mode menu": Home Page, Organizations (only for someone who manages an org),
 * Basic Access, Create a New Board, Home Board, then Rooms, lit. Org mode alone gave them Home Page
 * and Rooms, collapsed, which changed the menu and moved the page on arrival from home; so this mix
 * follows their own collapsed choice. Org editors keep the org menu, collapsed by default.
 */
QUnit.module('Integration | Component | dashboard/classic-rail rooms only', function(hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function() {
    this.owner.setupRouter();
    this.owner.unregister('service:stashes');
    this.owner.register('service:stashes', Service.extend({ classic_rail_collapsed: false, persist: function() {}, get: function() { return null; } }));
    this.owner.unregister('service:app-state');
    this.owner.register('service:app-state', Service.extend({
      currentUser: EmberObject.create({ user_name: 'slp', supervisors: [], organizations: [], managed_orgs: [],
        supervised_units: [{ id: '1_3', name: 'Blue Room', organization_id: '1_1' }],
        preferences: { home_board: { key: 'slp/core' }, logging: false } }),
      feature_flags: { emergency_boards: true, lessons: true }
    }));
  });

  function titles(element) {
    return [...element.querySelectorAll('.ch-rail__list .ch-row__title')].map(function(t) { return t.textContent.trim(); });
  }

  QUnit.test('rooms only: the home rows they use, then this org\'s Rooms, expanded', async function(assert) {
    this.set('org', { id: '1_1', permissions: { view: true } });
    await render(hbs`<Dashboard::ClassicRail @org={{this.org}} />`);
    assert.deepEqual(titles(this.element), ['Home Page', 'Basic Access', 'Create a New Board', 'Home Board', 'Rooms'], 'the rows, in order');
    var rooms = [...this.element.querySelectorAll('.ch-rail__list a')].filter(function(a) { return a.getAttribute('href') === '/organizations/1_1/rooms'; });
    assert.strictEqual(rooms.length, 1, 'one Rooms row, to this org');
    assert.dom('.ch-rail').doesNotHaveClass('ch-rail--collapsed', 'their own collapsed choice, not collapsed by default');
  });

  QUnit.test('rooms only, for someone who also manages an org: Organizations comes second', async function(assert) {
    this.owner.lookup('service:app-state').set('currentUser.has_management_responsibility', true);
    this.set('org', { id: '1_1', permissions: { view: true } });
    await render(hbs`<Dashboard::ClassicRail @org={{this.org}} />`);
    assert.deepEqual(titles(this.element), ['Home Page', 'Organizations', 'Basic Access', 'Create a New Board', 'Home Board', 'Rooms']);
  });

  /* ON A ROOM'S OWN PAGE TOO. The row's `@current-when` could not light it there: a LinkTo checks its
     own models against the route, and `organization.room` also needs a room id, which the row (the
     org's id only) cannot supply. The router is not transitioned here, so the route comes from
     `app_state.current_route`, the fallback the rail reads after `router.currentRouteName`. */
  QUnit.test('Rooms is lit on a room\'s page, in both org menus', async function(assert) {
    this.owner.lookup('service:app-state').set('current_route', 'organization.room');
    this.set('org', { id: '1_1', permissions: { view: true } });
    await render(hbs`<Dashboard::ClassicRail @org={{this.org}} />`);
    assert.dom('.ch-rail a[href="/organizations/1_1/rooms"]').hasClass('is-active', 'rooms only');
    this.set('org', { id: '1_1', permissions: { view: true, edit: true } });
    assert.dom('.ch-rail a[href="/organizations/1_1/rooms"]').hasClass('is-active', 'editor');
  });

  QUnit.test('an org editor keeps the org menu, collapsed by default', async function(assert) {
    this.set('org', { id: '1_1', permissions: { view: true, edit: true } });
    await render(hbs`<Dashboard::ClassicRail @org={{this.org}} />`);
    assert.deepEqual(titles(this.element), ['Home Page', 'Reports', 'Rooms', 'Trainings', 'Settings']);
    assert.dom('.ch-rail').hasClass('ch-rail--collapsed');
  });
});
