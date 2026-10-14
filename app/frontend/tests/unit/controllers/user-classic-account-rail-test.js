import { module, test } from 'qunit';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* WHERE THE BASIC-VIEW ACCOUNT RAIL RENDERS.
 *
 * `showClassicAccountRail` gates `<Dashboard::ClassicAccountRail>` in templates/user.hbs. It
 * shipped scoped to the three route names that render the account page itself, so the rail's
 * own eight destinations each dropped it: clicking Reports, Goals, Trainings, Recordings,
 * Profile, Settings, Subscription or Logs left the page with no navigation at all. Measured
 * before the fix, all eight (docs/task-management/2026-09-25_basic-account-rail-spa.md).
 *
 * THE MODERN SIDE IS THE MODEL, and its lesson is recorded at controllers/application.js:2278:
 * chrome gated on the one page it was built for "was not rendered on four of the six
 * destinations at all". Same defect, same shape, one view later.
 *
 * WHY THIS IS A UNIT TEST ON A COMPUTED rather than a rendering test: the failure is silent in
 * both directions. A missing route leaves a section page with no nav, and a route that should
 * not be here puts a 208px panel somewhere it does not belong -- neither throws, neither fails
 * a build, and neither shows up in a lint run. The computed reads two route sources and one
 * preference and nothing else, so stubbing those tests this rule rather than testing Ember.
 */
module('Unit | Controller | user showClassicAccountRail', function(hooks) {
  setupTest(hooks);

  /* `preferences.board_view_style` is read through utils/view_style#is_classic, which uses
     emberGet -- so a PLAIN OBJECT is a faithful stub here, and deliberately so: that module's
     own comment records that `currentUser` is assigned a plain object in several places and
     that answering "modern" for one was a real bug. */
  var BASIC = { preferences: { board_view_style: 'classic' } };
  var MODERN = { preferences: { board_view_style: 'modern' } };

  function ctrl(context, routeName, url, view_user) {
    // UNREGISTER FIRST -- a bare `register` over an already-registered service is silently
    // ignored, which would make every read `undefined` and pass for the wrong reason. Same
    // reason user-nav-context-test.js does it.
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({
      currentRouteName: routeName,
      currentURL: url
    }));
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      current_route: routeName,
      effective_view_user: view_user
    }));
    return context.owner.lookup('controller:user');
  }

  /* THE EIGHT ROWS THE PANEL ACTUALLY DRAWS, named one per line against the route each row
     links to in components/dashboard/classic-account-rail.hbs. A row whose destination is
     missing here is a row that navigates out of its own nav. */
  var ROW_DESTINATIONS = [
    ['user.stats', 'Reports'],
    ['user.goals', 'Goals'],
    ['user.lessons', 'Trainings'],
    ['user.recordings', 'Recordings'],
    ['user.edit', 'Profile'],
    ['user.preferences', 'Settings'],
    ['user.subscription', 'Subscription'],
    ['user.logs', 'Logs & Messages']
  ];

  test('every page the panel links to keeps the panel', function(assert) {
    assert.expect(8);
    ROW_DESTINATIONS.forEach((pair) => {
      assert.true(ctrl(this, pair[0], '/someone/thing', BASIC).get('showClassicAccountRail'),
        pair[1] + ' (' + pair[0] + ') keeps the rail it was reached from');
    });
  });

  /* THE SECTION'S DETAIL PAGES, which are the case with teeth for a route test: router.js
     declares `goal` with path '/goals/:goal_id' and `log` with '/logs/:log_id' as SIBLINGS of
     `goals` and `logs`, so the URL nests but the route NAME does not. An exact-match list that
     forgets them drops the rail on the most likely click each of those pages offers -- which is
     the same mechanism that cost Modern its rail on six pages (controllers/user.js:92-98). */
  test('the section detail pages keep it too', function(assert) {
    assert.expect(6);
    ['user.goal', 'user.log', 'user.badges', 'user.history', 'user.focus', 'user.supervision']
      .forEach((route) => {
        assert.true(ctrl(this, route, '/someone/thing', BASIC).get('showClassicAccountRail'),
          route + ' keeps the rail');
      });
  });

  /* THE ONE ASSERTION THAT FAILS IF `accountRailContext` IS REUSED WHOLE.
   *
   * That computed returns false on `?nav=home` so Modern can put the HOME pill nav on the logs
   * page instead (controllers/user.js:82). Basic has no pill nav to put there --
   * `showGlobalChrome` returns false for a classic user (controllers/application.js:2305) and
   * the in-page pill row was retired 2026-09-21 -- so inheriting that gate would leave this one
   * route with NO nav, which is the defect this whole change exists to remove.
   * The param is only ever produced off a Modern pill-nav arrival (components/log-item.js:24),
   * so in Basic it names an origin that cannot have happened. */
  test('a nav=home logs page still keeps the rail in Basic, because Basic has no pill nav to swap in', function(assert) {
    assert.expect(2);
    var c = ctrl(this, 'user.logs', '/someone/logs?type=note&nav=home', BASIC);
    assert.true(c.get('showClassicAccountRail'),
      'Basic keeps the rail: there is no second nav for this page to fall back to');
    assert.false(c.get('accountRailContext'),
      "...while Modern's own gate is unchanged and still yields to the pill nav");
  });

  test('Modern never gets the Basic rail', function(assert) {
    assert.expect(3);
    assert.false(ctrl(this, 'user.index', '/someone', MODERN).get('showClassicAccountRail'),
      'the account page in Modern is served by the app shell rail');
    assert.false(ctrl(this, 'user.goals', '/someone/goals', MODERN).get('showClassicAccountRail'),
      'and so is every other section page');
    assert.false(ctrl(this, 'user.goals', '/someone/goals', undefined).get('showClassicAccountRail'),
      'no resolvable view user is Modern, the default');
  });

  /* THE BOARD ROUTES ARE WHY THIS IS A LIST AND NOT A `startsWith('user.')` TEST: a rail across
     a communication board is not acceptable, and a prefix test would have included them
     silently. 'user.boards' starts with 'user.board', which is the other half of that trap. */
  test('boards and the board routes never get it', function(assert) {
    assert.expect(4);
    ['user.board-detail', 'user.board-detail.edit', 'user.board-alt', 'user.boards']
      .forEach((route) => {
        assert.false(ctrl(this, route, '/someone/thing', BASIC).get('showClassicAccountRail'),
          route + ' stays clear');
      });
  });

  /* The email-link landings carry no nav in either view, for the reason user-nav-context-test.js
     records at length: signed out the user fetch still succeeds, so a rail there would name a
     stranger's account in rows that all bounce to login. */
  test('the email-link landing pages carry no rail', function(assert) {
    assert.expect(2);
    ['user.password_reset', 'user.confirm_registration'].forEach((route) => {
      assert.false(ctrl(this, route, '/someone/thing', BASIC).get('showClassicAccountRail'),
        route + ' gets no rail');
    });
  });
});
