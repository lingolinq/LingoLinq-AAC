import { module, test } from 'qunit';
import { basic_landing_for, hand_off_index_nav, take_pending_index_nav } from 'frontend/utils/basic_landing';

/* WHERE A MODERN-ONLY PAGE SENDS YOU WHEN YOU SWITCH TO BASIC.
 *
 * Switching view re-renders most pages in place -- same route, different template
 * (components/view-switcher.js#_apply_view). That only works where BOTH views have the page.
 * The caseload is Modern's alone: Basic has no `/caseload` route template, so someone standing
 * there when they switch was left on a page their view does not render.
 *
 * ONE MAP, TESTED, rather than a branch inside the switcher: the answer is a fact about the
 * product ("what is the Basic equivalent of this page"), the switcher is the only caller today,
 * and more pages are expected to join it -- so the next entry is a line here plus a case below,
 * not another `if` in a component action.
 */
module('Unit | Utility | basic_landing', function() {
  /* Requested 2026-09-24: "map caseload -> home page Communicators". The Basic home page's
     Communicators tab is `supervisees` (components/dashboard/classic-view.hbs:431), and the tab
     it opens on is read from `preferences.device.last_index_nav`
     (components/dashboard/authenticated-view.js:805-824) -- so the landing has to name BOTH the
     route and the tab, or the user arrives on the home page's default Actions tab instead. */
  test('the caseload lands on the Basic home page, Communicators tab', function(assert) {
    assert.expect(2);
    var landing = basic_landing_for('caseload');
    assert.strictEqual(landing.route, 'index', 'the Basic home page');
    assert.strictEqual(landing.index_nav, 'supervisees',
      'and the tab that shows the same people the caseload did');
  });

  /* Requested 2026-09-28: "boards page -> basic view home page with boards active". */
  test('the Boards page lands on the Basic home page, Boards tab', function(assert) {
    assert.expect(2);
    var landing = basic_landing_for('user.boards');
    assert.strictEqual(landing.route, 'index');
    assert.strictEqual(landing.index_nav, 'boards');
  });

  /* Requested 2026-09-28: "updates page (logs) -> basic view home page with Updates active".
     UPDATES IS AN ARRIVAL, NOT A ROUTE: it is `user.logs` reached from the pill nav, told apart
     by `?nav=home` (utils/primary_nav.js#hasHomeNavParam). The same route opened from the
     account rail's Logs row is Basic's own Logs page, which Basic renders, so it stays put. */
  /* CHANGED 2026-09-30, approved by Traci ("we should be routing to the logs page but ensure that
     their messages are not marked as read"): Modern's Updates page (`user.logs?nav=home`) used to
     land on the Basic home page's Updates tab. It now stays on the Logs page and drops the
     Updates marker and the messages filter, so the page is Basic's own Logs page. A single update
     (`user.log?nav=home`) still lands on the Updates tab. */
  test('the Updates page stays on Logs, unfiltered; a single update lands on the Updates tab; plain Logs stays put', function(assert) {
    assert.expect(5);
    var landing = basic_landing_for('user.logs', '/ada/logs?nav=home');
    assert.notOk(landing.route, 'no route change');
    assert.deepEqual(landing.query_params, { nav: null, type: null }, 'the marker and the filter dropped');
    assert.strictEqual(basic_landing_for('user.log', '/ada/logs/1_2?nav=home').index_nav, 'updates',
      'an update opened from the Updates page');
    assert.strictEqual(basic_landing_for('user.logs', '/ada/logs'), null, 'the rail Logs row');
    assert.strictEqual(basic_landing_for('user.logs'), null, 'no URL known');
  });

  /* The tab is applied through `set_index_nav` (authenticated-view.js), the action a tab click
     sends, so a landing must name a tab the Basic home page actually has
     (components/dashboard/classic-view.hbs `ch-tabs`). Anything else would leave the page on its
     default with nothing active. */
  test('every landing names a tab the dashboard will actually accept', function(assert) {
    var allowed = ['main', 'supervisees', 'supervisors', 'boards', 'updates'];
    var routes = ['caseload', 'user.boards'];
    assert.expect(routes.length);
    routes.forEach(function(route) {
      var landing = basic_landing_for(route);
      /* `indexOf` over the allowed list plus the undefined case, computed BEFORE the assert:
         a `||` inside the assertion collapses two distinct failures into one unreadable
         message, which is what `qunit/no-assert-logical-expression` is there to stop. */
      var names_a_real_tab = landing.index_nav === undefined ? true :
        allowed.indexOf(landing.index_nav) !== -1;
      assert.true(names_a_real_tab,
        route + ' -> ' + landing.index_nav + ' is a tab set_index_nav persists');
    });
  });

  /* THE DEFAULT HAS TO BE "STAY PUT". Every other page in the app renders in both views, so a
     map that guessed a destination would move people off pages that were working. Null is what
     tells the switcher to do what it has always done: re-render in place. */
  test('a page both views render answers null, so the switch stays put', function(assert) {
    /* `user.extras` left this list on 2026-09-30, approved by Traci: switching to Basic on the
       Extras page now lands on the home page with the Extras drawer open
       (tests/unit/utils/basic-landing-extras-test.js), so it no longer stays put. */
    var shared = ['index', 'user.home', 'organizations',
      'user.stats', 'user.logs', 'organization.rooms', 'user.account'];
    assert.expect(shared.length + 2);
    shared.forEach(function(route) {
      assert.strictEqual(basic_landing_for(route), null, route + ' is rendered by both views');
    });
    assert.strictEqual(basic_landing_for(''), null, 'no route at all');
    assert.strictEqual(basic_landing_for(undefined), null, 'undefined, before a transition settles');
  });

  /* THE HANDOFF. The Basic home page opens on `index_nav_state` or the saved
     `last_index_nav`, and only three tabs are ever saved -- Boards and Updates never are -- so
     the tab rides to the new page in app state, once. It must be consumed exactly once, or a
     later ordinary visit to the home page would reopen a tab nobody asked for. */
  test('a handed-off tab is taken once, then gone', function(assert) {
    var state = { pending_index_nav: null, set(k, v) { this[k] = v; }, get(k) { return this[k]; } };
    hand_off_index_nav(state, 'boards');
    assert.strictEqual(take_pending_index_nav(state), 'boards');
    assert.strictEqual(take_pending_index_nav(state), null, 'the second read finds nothing');
  });
});
