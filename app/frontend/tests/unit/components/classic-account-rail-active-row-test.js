import { module, test } from 'qunit';
import Service from '@ember/service';
import { setupTest } from '../../helpers';
import { ACCOUNT_SECTION_ROUTES } from 'frontend/controllers/user';

/* EVERY PAGE THAT GETS THE BASIC RAIL HAS A ROW FOR ITSELF -- or is a stated exception.
 *
 * `activeRow` (components/dashboard/classic-account-rail.js) maps the current route to the row
 * that should read as current. It drives `aria-current` for every row, and `is-active` for the
 * two whose detail routes are router SIBLINGS rather than children (Goals and Logs), so a
 * missing entry is both an unlit nav and a screen reader that never says where it is.
 *
 * THE LIST IS IMPORTED, NOT COPIED. `ACCOUNT_SECTION_ROUTES` is the real list
 * `showClassicAccountRail` gates on (controllers/user.js), so adding a route there without
 * adding a row here turns this red. A test with its own copy of the route names would pass
 * forever while the rail rendered unlit on a new page -- which is the exact failure Modern hit
 * on four pages at once (components/account-rail.js records it), and the reason its own map is
 * pinned the same way.
 *
 * THE MAP ITSELF IS MODULE-PRIVATE, so this asserts through `activeRow` on a real component
 * instance rather than importing the map -- the same approach
 * tests/unit/components/account-rail-active-row-test.js takes for the Modern rail.
 */
module('Unit | Component | classic-account-rail activeRow', function(hooks) {
  setupTest(hooks);

  function rail(context, routeName) {
    // UNREGISTER FIRST -- a bare `register` over an already-registered service is silently
    // ignored, which would leave every lookup undefined and pass for the wrong reason.
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({ currentRouteName: routeName }));
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({ current_route: routeName }));
    /* `stashes` is stubbed because the component INJECTS it for its collapse state; `activeRow`
       does not read it, but the instance cannot be created without it resolving. `persist` is
       present so a stray call cannot throw rather than fail informatively. */
    context.owner.unregister('service:stashes');
    context.owner.register('service:stashes', Service.extend({
      classic_rail_collapsed: false,
      persist: function() { }
    }));
    return context.owner.factoryFor('component:dashboard/classic-account-rail').create();
  }

  /* THE TWO ROUTES WITH NO ROW, and why each is deliberate rather than forgotten.
     Modern makes the same call for the same reason (components/account-rail.js): "pointing them
     at a row would make the nav say something untrue, which is worse than saying nothing".
       user.supervision -- the panel the user asked for has no Supervision row (the requested
                           list was summary, reports, goals, trainings, recordings, profile,
                           preferences, billing, logs & messages).
       user.focus       -- the Focus Words report is not Reports, not Goals, and not Trainings.
     THIS SET IS ASSERTED TO BE EXACTLY null BELOW, so it cannot grow quietly: a third route
     added to the exceptions has to be added here too, which is the moment to ask whether it
     needs a row instead. */
  var NO_ROW = ['user.supervision', 'user.focus'];

  test('every railed route resolves to a row, except the two stated exceptions', function(assert) {
    assert.expect(ACCOUNT_SECTION_ROUTES.length);
    /* ONE assertion per route, not a branch around two: `qunit/no-conditional-assertions`
       forbids an assert inside an `if`, and rightly -- a branch that silently never runs takes
       its assertion with it. The expectation is computed, then asserted unconditionally, so
       both halves of the invariant are enforced by the same line: a route in NO_ROW that starts
       lighting a row fails just as loudly as a railed route that stops. */
    ACCOUNT_SECTION_ROUTES.forEach((route) => {
      var row = rail(this, route).get('activeRow');
      var expected = NO_ROW.indexOf(route) === -1;
      assert.strictEqual(!!row, expected, expected ?
        route + ' lights a row (got ' + row + ')' :
        route + ' lights nothing, deliberately -- see NO_ROW (got ' + row + ')');
    });
  });

  /* THE ALIASES, named individually because each one is a page that would otherwise sit on an
     unlit nav, and because the reason differs per row:
       user.account / user.index / user.history -> the account page answers to three names
       user.goal / user.badges                  -> siblings of user.goals in router.js
       user.log                                 -> sibling of user.logs */
  test('the alias routes light the row their page belongs to', function(assert) {
    assert.expect(8);
    var expected = {
      'user.index': 'account', 'user.account': 'account', 'user.history': 'account',
      'user.goals': 'goals', 'user.goal': 'goals', 'user.badges': 'goals',
      'user.logs': 'logs', 'user.log': 'logs'
    };
    Object.keys(expected).forEach((route) => {
      assert.strictEqual(rail(this, route).get('activeRow'), expected[route],
        route + ' -> ' + expected[route]);
    });
  });

  // A route outside the section lights nothing rather than guessing.
  test('a route outside the section lights nothing', function(assert) {
    assert.expect(2);
    assert.strictEqual(rail(this, 'user.board-detail').get('activeRow'), null, 'no row on a board');
    assert.strictEqual(rail(this, 'index').get('activeRow'), null, 'no row on the app home page');
  });
});
