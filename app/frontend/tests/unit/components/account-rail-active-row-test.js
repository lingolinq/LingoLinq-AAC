import { module, test } from 'qunit';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* The account rail moved out of templates/user/index.hbs and now renders on all ten pages of
 * the account section (templates/user.hbs, gated on `accountRailContext`). Its rows carried
 * LITERAL classes from when it only ever rendered on one page — the Account row's was
 * `is-active` with a hardcoded `aria-current="page"` — so after the move the nav said
 * "Account" on Goals, Logs, Reports, Settings and every other page in the section.
 *
 * `activeRow` is the fix's single source of truth for `aria-current` (the visual highlight is
 * <LinkTo>'s `@activeClass`, which the framework recomputes on every transition). It is
 * pinned here because the two failure modes are silent: a missing route key leaves the whole
 * nav with no current row, and a wrong one points at the wrong page — neither throws, neither
 * fails a build, and neither shows up in a lint run.
 *
 * `user.index` is the case with teeth: the account page answers to BOTH `user.index` and
 * `user.account` (routes/user/account.js sets templateName), so a map keyed only on
 * `user.account` would leave the section's own landing page with nothing highlighted.
 *
 * The router is stubbed rather than driven for real: `currentRouteName` is the only thing
 * read, and standing up a real router to set one string would test Ember, not this map.
 */
module('Unit | Component | account-rail activeRow', function(hooks) {
  setupTest(hooks);

  /* `currentURL` is the fourth argument because ONE row's answer depends on more than the
     route name: `user.logs` is the Logs row when it was reached from the rail and the HOME
     row when it was reached from the pill nav's Updates, and the only thing that tells the
     two apart is `?nav=home` in the URL (controllers/user/logs.js:32 declares the param).
     Every call that omits it leaves `currentURL` undefined, which is the rail arrival — so
     the assertions written before this argument existed still describe the case they were
     written for. */
  /* THE TWO GATED PILLS have to be stubbed, or the rule under test cannot name them: the
     Organizations pill is gated on `has_management_responsibility` and Updates on the
     `updates_pill` flag (components/user-pill-nav.hbs:19,53), and `pillForRoute` applies the
     same gates so it can never claim a pill the nav will not draw. Both default to ABSENT
     here, which is also the safe direction in the app. */
  function rail(context, routeName, fallbackRoute, currentURL, appState) {
    var state = appState || {};
    // UNREGISTER FIRST — a bare `register` over an already-registered service is silently
    // ignored, which would leave every lookup `undefined` and make every assertion below pass
    // for the wrong reason. Same reason view-switcher-availability-test.js#stubAppState does it.
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({ currentRouteName: routeName, currentURL: currentURL }));
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      current_route: fallbackRoute,
      currentUser: state.currentUser,
      feature_flags: state.feature_flags
    }));
    return context.owner.factoryFor('component:account-rail').create();
  }

  // A user who can see every pill the nav has.
  var FULL_NAV = {
    currentUser: { has_management_responsibility: true },
    feature_flags: { updates_pill: true }
  };

  test('each section route maps to its own row', function(assert) {
    assert.expect(9);
    var expected = {
      'user.account': 'account',
      'user.goals': 'goals',
      'user.logs': 'logs',
      'user.edit': 'edit',
      'user.recordings': 'recordings',
      'user.stats': 'stats',
      'user.preferences': 'preferences',
      'user.subscription': 'subscription',
      'user.supervision': 'supervision'
    };
    Object.keys(expected).forEach((route) => {
      assert.strictEqual(rail(this, route).get('activeRow'), expected[route],
        route + ' highlights its own row');
    });
  });

  // The regression this file exists for: before the fix EVERY page answered 'account'.
  test('a page that is not the account page does not highlight Account', function(assert) {
    assert.notStrictEqual(rail(this, 'user.goals').get('activeRow'), 'account',
      'Goals must not leave the Account row lit');
  });

  /* The rail renders on the modern home page as of 2026-09-20
   * (components/dashboard/authenticated-view.hbs), so its "Home Page" row has to light up
   * there. Both names matter: the home page is served by top-level `index` AND by `user.home`,
   * which routes/user/home.js renders through the same index template and controller. A map
   * keyed on only one would leave the row dark on half the URLs that show the same page.
   */
  test('both home-page routes highlight the Home Page row', function(assert) {
    assert.expect(2);
    assert.strictEqual(rail(this, 'index').get('activeRow'), 'home',
      'the top-level index route is the home page');
    assert.strictEqual(rail(this, 'user.home').get('activeRow'), 'home',
      'and so is user.home');
  });

  // Home and Account are the two rows with multi-route aliases; a mix-up between the two maps
  // would be invisible on one of them.
  test('home and account do not claim each other', function(assert) {
    assert.expect(2);
    assert.notStrictEqual(rail(this, 'index').get('activeRow'), 'account',
      'the home page must not light the Account row');
    assert.notStrictEqual(rail(this, 'user.account').get('activeRow'), 'home',
      'the account page must not light the Home Page row');
  });

  test('the section index counts as the account page', function(assert) {
    assert.strictEqual(rail(this, 'user.index').get('activeRow'), 'account',
      'user.index and user.account are the same page');
  });

  test('falls back to app-state while the router has not settled', function(assert) {
    assert.strictEqual(rail(this, null, 'user.stats').get('activeRow'), 'stats',
      'app_state.current_route covers the in-transition frame');
  });

  test('a route outside the section has no current row', function(assert) {
    assert.strictEqual(rail(this, 'user.board-detail').get('activeRow'), null,
      'no row is claimed for a page the rail does not link to');
  });

  /* THE SIX PAGES THAT GAINED THE RAIL when the account pill nav was retired (2026-09-21).
   * `account-rail.js` states the invariant this pins: "a page that gets the rail has a row to
   * highlight, and a page with no row does not get the rail. Adding a page means touching
   * both." Widening `accountRailContext` without widening ROW_FOR_ROUTE would leave a NEW
   * primary nav with no lit row and no `aria-current` on all six -- silent, per this file's
   * own header.
   * The mappings are to the LIST page each detail page belongs to: a single log entry is Logs,
   * a single goal is Goals. Badges answer Goals because they are goal badges (badges.hbs links
   * to `user.goal`, goals.hbs links to badges), and History is the ACCOUNT's edit history,
   * reached only from the account page's support actions. */
  test('the detail pages light the section row they belong to', function(assert) {
    assert.expect(4);
    var expected = {
      'user.log': 'logs',
      'user.goal': 'goals',
      'user.badges': 'goals',
      'user.history': 'account'
    };
    Object.keys(expected).forEach((route) => {
      assert.strictEqual(rail(this, route).get('activeRow'), expected[route],
        route + ' lights the ' + expected[route] + ' row');
    });
  });

  /* NO HONEST ROW, SO NO ROW -- pinned as a decision, not left as an oversight. `user.lessons`
   * is "Current Trainings" and `user.focus` is the Focus Words report; the rail has no row for
   * either, and Reports (`user.stats`) is usage statistics, not these. A nav that highlights
   * the wrong row is worse than one that highlights none, so these stay null until the rail
   * gains rows of their own. If a row is ever added, update ROW_FOR_ROUTE and this test. */
  test('pages with no matching row stay unlit rather than lighting a wrong one', function(assert) {
    assert.expect(2);
    assert.strictEqual(rail(this, 'user.lessons').get('activeRow'), null,
      'Trainings has no rail row, so nothing is claimed');
    assert.strictEqual(rail(this, 'user.focus').get('activeRow'), null,
      'the Focus Words report has no rail row, so nothing is claimed');
  });

  /* ARIA AND THE HIGHLIGHT MUST NAME THE SAME ROUTES, and this pins the defect that got past
   * the first pass on 2026-09-21. ROW_FOR_ROUTE was widened so `user.log` set `aria-current`
   * on Logs, but the highlight came from <LinkTo>'s `@activeClass`, which does not go active on
   * a SIBLING route -- `user.log` is not a child of `user.logs`. The rendered result told a
   * screen-reader user "Logs, current page" while a sighted user saw nothing lit: the inverse
   * of the bug this file was created for, equally silent, and invisible to every assertion
   * above because each one only ever read `activeRow`.
   * `@current-when` was tried as the fix and does NOT work for these two: it resolves each
   * route name against the LINK's own models, and the rows pass one (`user_name`) where
   * `user.goal` / `user.log` need two. So Goals and Logs now take `is-active` from `activeRow`,
   * the same computed behind their `aria-current` -- which is what makes them agree BY
   * CONSTRUCTION. This test pins that every route those two rows answer for resolves to the
   * row, so neither half can be widened without the other.
   * Verified in a real browser as well (scripts/account-rail-pages-qa.mjs); a unit test cannot
   * see a LinkTo's rendered class. */
  test('each multi-route row claims every route it answers for', function(assert) {
    var expected = {
      'user.goals': 'goals', 'user.goal': 'goals', 'user.badges': 'goals',
      'user.logs': 'logs', 'user.log': 'logs',
      'user.account': 'account', 'user.index': 'account', 'user.history': 'account',
      'index': 'home', 'user.home': 'home'
    };
    assert.expect(Object.keys(expected).length);
    Object.keys(expected).forEach((route) => {
      assert.strictEqual(rail(this, route).get('activeRow'), expected[route],
        route + ' resolves to the ' + expected[route] + ' row');
    });
  });

  /* THE PILL NAV IS THE HOME SECTION'S NAV (requested 2026-09-21), which makes every
   * destination it offers part of the Home row's territory rather than a page of its own in
   * this rail. The request states it for one case: "if you select Updates, it shouldn't
   * highlight the Logs item on the left panel because it was navigated from the pillnav menu."
   *
   * THE SAME PAGE, TWO ANSWERS. `user.logs` is reached BOTH ways -- as Logs from the rail and
   * as Updates from the pill -- and it is the only route that is, so `?nav=home` is the whole
   * difference between the two rows. Before this change the rail lit Logs on both arrivals
   * (measured in the browser: scripts/home-section-nav-qa.mjs reported `lit=Logs` on
   * /USER/logs?type=note&nav=home), which told the user they had left the menu they were
   * navigating with.
   */
  test('Updates reached from the pill nav lights Home, not Logs', function(assert) {
    assert.expect(2);
    var arrival = rail(this, 'user.logs', null, '/marcus_williams_slp/logs?type=note&nav=home', FULL_NAV);
    assert.strictEqual(arrival.get('activeRow'), 'home',
      'arriving from the pill nav keeps the user in the Home section');
    assert.notStrictEqual(arrival.get('activeRow'), 'logs',
      'the Logs row must not light for an arrival the rail did not make');
  });

  /* THE OTHER HALF, and the reason the rule is keyed on the URL rather than on the route:
   * the rail's own Logs row passes no query (components/account-rail.hbs:66), so the same
   * route must still answer Logs. A fix that returned 'home' for every `user.logs` would pass
   * the test above and break the row it was protecting. */
  test('Logs reached from the rail still lights Logs', function(assert) {
    assert.expect(1);
    assert.strictEqual(rail(this, 'user.logs', null, '/marcus_williams_slp/logs').get('activeRow'), 'logs',
      'no nav=home means the rail is where the user came from');
  });

  /* THE GATE, NOT JUST THE PARAM. `updates_pill` is documented as temporary and due off before
     production (lib/feature_flags.rb:140). With it off there is no Updates pill to have
     arrived from, so a stale `?nav=home` link must fall back to the Logs row rather than
     lighting Home for a nav that renders nothing. Sharing one rule with the pill is what makes
     this true without a second check. */
  test('with the Updates pill switched off the logs page is the Logs row again', function(assert) {
    assert.expect(1);
    assert.strictEqual(
      rail(this, 'user.logs', null, '/marcus_williams_slp/logs?type=note&nav=home').get('activeRow'),
      'logs',
      'no Updates pill, no Home-section arrival');
  });

  /* THE SAME GATE ON THE OTHER PILL. routes/organizations.js has no permission guard, so a
     user without management responsibility can land on /organizations with no Organizations
     pill rendered. Lighting Home there would assert a section the nav is not showing. */
  test('Organizations without the pill lights nothing', function(assert) {
    assert.expect(2);
    assert.strictEqual(rail(this, 'organizations').get('activeRow'), null,
      'no pill for this user, so no Home-section claim');
    assert.strictEqual(rail(this, 'organizations', null, null, FULL_NAV).get('activeRow'), 'home',
      'a manager, who does get the pill, is in the Home section');
  });

  /* THE FOUR DESTINATIONS THE PILL NAV OFFERS that are not the home page itself. They had NO
   * row at all until now -- measured `lit=null` on Caseload, Boards and Extras -- because
   * ROW_FOR_ROUTE only ever knew `user.*` account routes. Under the rule above they are Home
   * section pages, so the Home row is the honest answer: it is the row whose sub-nav the user
   * is standing in. This is what makes the rail stop going dark on four of the six
   * destinations it renders on. */
  test('the pill nav destinations light the Home row', function(assert) {
    var expected = {
      'caseload': 'home',
      'organizations': 'home',
      'user.boards': 'home',
      'user.extras': 'home'
    };
    assert.expect(Object.keys(expected).length);
    Object.keys(expected).forEach((route) => {
      assert.strictEqual(rail(this, route, null, null, FULL_NAV).get('activeRow'), expected[route],
        route + ' is a Home-section destination');
    });
  });

  /* THE RULE MUST NOT REACH THE ACCOUNT SECTION. If the pill-nav test were written loosely --
   * say, any route not in ROW_FOR_ROUTE -- every account page would answer Home and the rail
   * would light the wrong row on all ten of them, which is the 2026-09-18 regression this
   * whole file exists for, reintroduced from the other end. */
  test('account pages are untouched by the Home-section rule', function(assert) {
    assert.expect(3);
    assert.strictEqual(rail(this, 'user.stats', null, '/marcus_williams_slp/stats').get('activeRow'), 'stats',
      'Reports is an account page, not a Home-section destination');
    assert.strictEqual(rail(this, 'user.preferences', null, '/marcus_williams_slp/preferences').get('activeRow'), 'preferences',
      'Settings is an account page');
    assert.strictEqual(rail(this, 'user.goal', null, '/marcus_williams_slp/goals/1_1').get('activeRow'), 'goals',
      'a goal detail page is still the Goals row');
  });
});
