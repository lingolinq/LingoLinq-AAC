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
});
