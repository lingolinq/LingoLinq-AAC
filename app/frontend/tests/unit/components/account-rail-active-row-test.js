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

  function rail(context, routeName, fallbackRoute) {
    // UNREGISTER FIRST — a bare `register` over an already-registered service is silently
    // ignored, which would leave every lookup `undefined` and make every assertion below pass
    // for the wrong reason. Same reason view-switcher-availability-test.js#stubAppState does it.
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({ currentRouteName: routeName }));
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({ current_route: fallbackRoute }));
    return context.owner.factoryFor('component:account-rail').create();
  }

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
});
