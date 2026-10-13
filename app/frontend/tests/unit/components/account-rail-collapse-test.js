import { module, test } from 'qunit';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* The Modern account rail collapses to its icons and short labels (requested 2026-09-28). Its
 * DEFAULT depends on the SCREEN (spec changed 2026-09-29 at Traci's request; it used to be
 * expanded on the home page and collapsed elsewhere): collapsed on every page at 1200px and
 * narrower, expanded on every page wider than that (`wideScreen`, set explicitly here). A choice
 * made with the toggle wins; home and away remember theirs separately, each under its own stash
 * key, and neither borrows Basic's `classic_rail_collapsed`.
 *
 * Pinned because every failure here is silent: a toggle that writes a constant collapses once and
 * never reopens, a computed on the wrong key ignores the user's choice, and a wrong page test
 * gives the home page the away default. None throws or fails a build. */
module('Unit | Component | account-rail collapse', function(hooks) {
  setupTest(hooks);

  function rail(context, routeName, stashed, wide) {
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
    component.set('wideScreen', !!wide);
    return { component: component, writes: writes };
  }

  var ROUTES = ['index', 'user.home', 'user.stats', 'user.index', 'user.logs', 'caseload', 'user.boards'];

  test('at 1200px and narrower every page, home included, starts collapsed', function(assert) {
    assert.expect(ROUTES.length);
    ROUTES.forEach(function(route) {
      assert.true(rail(this, route, {}, false).component.get('railCollapsed'), route);
    }, this);
  });

  test('wider than 1200px every page starts expanded', function(assert) {
    assert.expect(ROUTES.length);
    ROUTES.forEach(function(route) {
      assert.false(rail(this, route, {}, true).component.get('railCollapsed'), route);
    }, this);
  });

  test('the default follows the screen when it crosses 1200px', function(assert) {
    var r = rail(this, 'user.stats', {}, false);
    assert.true(r.component.get('railCollapsed'), 'narrow: collapsed');
    r.component.set('wideScreen', true);
    assert.false(r.component.get('railCollapsed'), 'widened past 1200px: expanded');
  });

  test('each context reads its own remembered choice', function(assert) {
    assert.true(rail(this, 'index', { modern_rail_collapsed: true }).component.get('railCollapsed'),
      'home honours a collapse made on home');
    assert.false(rail(this, 'user.stats', { modern_rail_collapsed_away: false }).component.get('railCollapsed'),
      'away honours an expand made away');
    assert.true(rail(this, 'user.stats', { modern_rail_collapsed: false }).component.get('railCollapsed'),
      'an expand on home does not open the rail away from home');
    assert.false(rail(this, 'index', { classic_rail_collapsed: true }, true).component.get('railCollapsed'),
      'a Basic-view collapse does not collapse the Modern rail');
    assert.false(rail(this, 'index', { modern_rail_collapsed: false }, false).component.get('railCollapsed'),
      'a choice made with the toggle beats the narrow default');
    assert.true(rail(this, 'user.stats', { modern_rail_collapsed_away: true }, true).component.get('railCollapsed'),
      'and the wide default');
  });

  test('toggling on the home page persists the inverse under the home key, both ways', function(assert) {
    var r = rail(this, 'index', {}, true);
    r.component.toggleRail();
    assert.true(r.component.get('railCollapsed'), 'collapses');
    r.component.toggleRail();
    assert.false(r.component.get('railCollapsed'), 'and reopens');
    assert.deepEqual(r.writes, [['modern_rail_collapsed', true], ['modern_rail_collapsed', false]]);
  });

  test('toggling away from home persists the inverse under the away key, both ways', function(assert) {
    var r = rail(this, 'user.stats', {}, false);
    r.component.toggleRail();
    assert.false(r.component.get('railCollapsed'), 'expands from the collapsed default');
    r.component.toggleRail();
    assert.true(r.component.get('railCollapsed'), 'and collapses again');
    assert.deepEqual(r.writes, [['modern_rail_collapsed_away', false], ['modern_rail_collapsed_away', true]]);
  });
});
