import { module, test } from 'qunit';
import { basic_landing_for } from 'frontend/utils/basic_landing';

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

  /* `last_index_nav` is written straight to the user record, and `set_index_nav`
     (authenticated-view.js:1639) accepts only these three. A landing naming anything else would
     persist a value the tab reader cannot match, leaving the page on its default with a junk
     preference saved against the account. */
  test('every landing names a tab the dashboard will actually accept', function(assert) {
    var allowed = ['main', 'supervisees', 'supervisors'];
    var routes = ['caseload'];
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
    var shared = ['index', 'user.home', 'user.boards', 'user.extras', 'organizations',
      'user.stats', 'user.logs', 'organization.rooms', 'user.account'];
    assert.expect(shared.length + 2);
    shared.forEach(function(route) {
      assert.strictEqual(basic_landing_for(route), null, route + ' is rendered by both views');
    });
    assert.strictEqual(basic_landing_for(''), null, 'no route at all');
    assert.strictEqual(basic_landing_for(undefined), null, 'undefined, before a transition settles');
  });
});
