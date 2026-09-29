import { module, test } from 'qunit';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* The Modern account rail collapses to its icons and short labels (requested 2026-09-28), and
 * its DEFAULT depends on the page: expanded on the home page, collapsed everywhere else
 * (requested the same day). The two are remembered separately, each under its own stash key, so
 * expanding the rail on Reports does not change what the home page does, and neither borrows
 * Basic's `classic_rail_collapsed`.
 *
 * Pinned because every failure here is silent: a toggle that writes a constant collapses once and
 * never reopens, a computed on the wrong key ignores the user's choice, and a wrong page test
 * gives the home page the away default. None throws or fails a build. */
module('Unit | Component | account-rail collapse', function(hooks) {
  setupTest(hooks);

  function rail(context, routeName, stashed) {
    var store = Object.assign({}, stashed);
    var writes = [];
    context.owner.unregister('service:stashes');
    context.owner.register('service:stashes', Service.extend({
      get(key) { return store[key]; },
      persist(key, value) { writes.push([key, value]); store[key] = value; this.notifyPropertyChange(key); }
    }));
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({ currentRouteName: routeName }));
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({}));
    var component = context.owner.factoryFor('component:account-rail').create();
    return { component: component, writes: writes };
  }

  test('the home page starts expanded, under both of its route names', function(assert) {
    assert.false(rail(this, 'index', {}).component.get('railCollapsed'), 'index');
    assert.false(rail(this, 'user.home', {}).component.get('railCollapsed'), 'user.home');
  });

  test('every other page starts collapsed', function(assert) {
    assert.expect(5);
    ['user.stats', 'user.index', 'user.logs', 'caseload', 'user.boards'].forEach(function(route) {
      assert.true(rail(this, route, {}).component.get('railCollapsed'), route);
    }, this);
  });

  test('each context reads its own remembered choice', function(assert) {
    assert.true(rail(this, 'index', { modern_rail_collapsed: true }).component.get('railCollapsed'),
      'home honours a collapse made on home');
    assert.false(rail(this, 'user.stats', { modern_rail_collapsed_away: false }).component.get('railCollapsed'),
      'away honours an expand made away');
    assert.true(rail(this, 'user.stats', { modern_rail_collapsed: false }).component.get('railCollapsed'),
      'an expand on home does not open the rail away from home');
    assert.false(rail(this, 'index', { classic_rail_collapsed: true }).component.get('railCollapsed'),
      'a Basic-view collapse does not collapse the Modern rail');
  });

  test('toggling on the home page persists the inverse under the home key, both ways', function(assert) {
    var r = rail(this, 'index', {});
    r.component.toggleRail();
    assert.true(r.component.get('railCollapsed'), 'collapses');
    r.component.toggleRail();
    assert.false(r.component.get('railCollapsed'), 'and reopens');
    assert.deepEqual(r.writes, [['modern_rail_collapsed', true], ['modern_rail_collapsed', false]]);
  });

  test('toggling away from home persists the inverse under the away key, both ways', function(assert) {
    var r = rail(this, 'user.stats', {});
    r.component.toggleRail();
    assert.false(r.component.get('railCollapsed'), 'expands from the collapsed default');
    r.component.toggleRail();
    assert.true(r.component.get('railCollapsed'), 'and collapses again');
    assert.deepEqual(r.writes, [['modern_rail_collapsed_away', false], ['modern_rail_collapsed_away', true]]);
  });
});
