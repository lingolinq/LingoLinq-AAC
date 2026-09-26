import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { hasHomeNavParam } from '../utils/primary_nav';
import { is_classic } from '../utils/view_style';
import { computed } from '@ember/object';

/* THE PAGES THAT MAKE UP THE ACCOUNT SECTION -- the one list, read by both navs.
 *
 * Deliberately a LIST, not a `startsWith('user.')` test: the board routes are
 * `user.board-detail` / `user.board-alt` and a 208px panel across a communication board is not
 * acceptable, so a prefix test would have included them silently. `user.boards` starts with
 * `user.board`, which is the other half of that trap. Any route not named here simply has no nav.
 *
 * `user.index` AND `user.account` both appear because both render templates/user/index.hbs
 * (routes/user/account.js sets `templateName`).
 *
 * THE SIX DETAIL PAGES ON THE LAST LINE are the case with teeth. This test is EXACT-MATCH while
 * `bareUserOutletLayout` below matches base-plus-children, and `user.goal` / `user.log` are
 * SIBLING routes of `user.goals` / `user.logs`, not children (router.js declares `goal` with path
 * '/goals/:goal_id', so the PATH nests but the ROUTE NAME does not). They were missing from this
 * list once already, and clicking a log entry swapped the left rail for a top pill bar
 * mid-section.
 *
 * ADDING A ROUTE HERE MEANS ADDING IT TO `ROW_FOR_ROUTE` in components/account-rail.js and in
 * components/dashboard/classic-account-rail.js -- a route in this list with no row there renders
 * a nav that never says where you are. `user.supervision` and `user.focus` are the standing
 * exceptions in the Basic rail, which has no row for either; see the note on that map.
 *
 * DELIBERATELY ABSENT: `user.password_reset` and `user.confirm_registration`. They are
 * single-task pages reached from an email, and signed out the user fetch still SUCCEEDS
 * (api/users_controller.rb exempts `show`; User grants 'view_existence' to everyone), so a nav
 * there would render rows naming a stranger's account that all bounce to login. Both carry their
 * own exit already and the global header in application.hbs renders signed out. Also absent:
 * `user.device`, which is declared in the router with no route, controller or template.
 *
 * EXTRACTED TO MODULE SCOPE 2026-09-25, when the Basic rail grew from the account page to the
 * whole section and became the second reader. It was one list with one reader; two readings of
 * the same route names is the drift utils/primary_nav.js:16 records as the lesson of the
 * 2026-09-21 rail work ("two lists that must move together will not, unless a test makes them").
 * `tests/unit/controllers/user-nav-context-test.js` is the test that makes them.
 *
 * EXPORTED for tests/unit/components/classic-account-rail-active-row-test.js, which asserts that
 * every route here resolves to a row in the Basic rail (or is one of the two exceptions named
 * above). The test importing the REAL list is the whole point: with its own copy it would pass
 * forever while the rail rendered unlit on a newly added page. Nothing in the app imports this --
 * the resolver uses the default export.
 */
export const ACCOUNT_SECTION_ROUTES = [
  'user.index', 'user.account', 'user.goals', 'user.logs', 'user.edit',
  'user.recordings', 'user.stats', 'user.preferences', 'user.subscription',
  'user.supervision',
  'user.goal', 'user.log', 'user.badges', 'user.history', 'user.lessons', 'user.focus'
];

function isAccountSectionRoute(route) {
  return ACCOUNT_SECTION_ROUTES.indexOf(route) !== -1;
}

export default Controller.extend({
  app_state: service('app-state'),
  router: service('router'),
  /* BASIC VIEW GETS A `ch-` RAIL ACROSS THE WHOLE ACCOUNT SECTION (2026-09-25, requested).
     Modern mounts `AccountRail` in the app shell (templates/application.hbs); Basic has no app
     shell, so the account section had no nav of its own in that view at all -- the page rendered
     full width with no way to its eight sibling pages.
     READ THROUGH `utils/view_style#is_classic`, not `preferences.board_view_style` directly:
     that module is the single reader for this preference and resolves against
     `effective_view_user`, so a supervisor modelling for someone gets the shell that person's
     view calls for. Same call, same reasoning, as controllers/organizations.js.

     IT SHIPPED SCOPED TO THE ACCOUNT PAGE (the three route names that render
     templates/user/index.hbs) and that was the defect: the rail links to eight pages and every
     one of them dropped it, measured all eight in the browser. Modern had the identical bug for
     the identical reason and records it at controllers/application.js:2278 -- "the rail was not
     rendered on four of the six destinations at all".

     IT DOES NOT TAKE `homeNavContext`, and that asymmetry with `accountRailContext` below is the
     point rather than an oversight. That gate exists so Modern can put the HOME pill nav on
     `/logs?nav=home` INSTEAD of the rail. Basic has no pill nav to put there: `showGlobalChrome`
     returns false for a classic user (controllers/application.js:2309) and the in-page pill row
     was retired 2026-09-21. Taking the gate here would leave that one route with no nav at all.
     The param is a declared query param on controllers/user/logs.js:32, so it survives a
     bookmark, a shared link, the Back button and a Modern-to-Basic view switch made while
     standing on that URL -- a Basic user really can arrive there, which is what makes this
     load-bearing rather than theoretical.
     Pinned by tests/unit/controllers/user-classic-account-rail-test.js. */
  showClassicAccountRail: computed(
    'app_state.effective_view_user.preferences.board_view_style',
    'router.currentRouteName',
    'app_state.current_route',
    function() {
      if(!is_classic(this.get('app_state.effective_view_user'))) { return false; }
      var route = this.get('router.currentRouteName') || this.get('app_state.current_route') || '';
      return isAccountSectionRoute(route);
    }),
  /**
   * Full dashboard or board-alt: render only {{outlet}} (no md-user-layout / User menu).
   * Uses router + URL so user.extras always matches even if current_route leaf name differs.
   */
  /**
   * ORIGIN-AWARE NAV. True only on the logs page, and only when the user arrived there via
   * the home page's Updates pill — which announces itself with `nav=home` in the URL.
   *
   * templates/user.hbs uses this to render the HOME pill-nav (with Updates active) in place
   * of the account nav for that one case. The account nav is right for someone working
   * through Account / Profile / Settings / Logs; it is wrong for someone who clicked Updates
   * on their dashboard, because it drops them out of the menu they were using.
   *
   * READ FROM THE URL, not from a transient flag set on click. A flag would be lost on
   * reload, on the back button and on a bookmarked link, so the nav would silently change
   * under the user for reasons they could not see. The URL is the origin, so it survives all
   * three. `router.currentURL` is the same source `bareUserOutletLayout` below reads, and for
   * the same reason: it is the one value that is always in step with what is on screen.
   *
   * Gated on the route as well as the param so a stray `nav=home` on some other user.* page
   * cannot swap that page's nav.
   */
  /**
   * The ACCOUNT page renders its own left rail (templates/user/index.hbs,
   * `.md-acct-rail`) carrying the same destinations this nav offers plus the four quick
   * links. Showing the pill row as well put two menus on the page, and the top one looked
   * enough like the home dashboard's nav that it read as "you are on the home page"
   * (reported 2026-09-14). One menu, on the left, where the page's own navigation lives.
   *
   * `user.index` and `user.account` are the same page — the route is reachable under both
   * names, which is why the pill row below already tests for both when marking Account
   * active.
   */
  accountRailContext: computed(
    'router.currentRouteName',
    'app_state.current_route',
    'homeNavContext',
    function() {
      /* ORIGIN WINS OVER ROUTE. Someone who clicked Updates in the HOME pill-nav is still
         navigating the home page's menu; they land on the logs page, but the account rail is
         not the nav they were using and swapping it in under them is the disorientation this
         whole pair of computeds exists to prevent. `homeNavContext` below is that origin,
         read from `?nav=home` in the URL.
         Exactly one page can be reached both ways -- user.logs, as Updates from a pill-nav
         and as Logs from the rail -- so this is the only route the check can affect. It must
         come FIRST: without it `user.logs` matches the list below, the rail renders, and
         templates/user.hbs never reaches its `{{else if this.homeNavContext}}` branch, which
         is what left the pill-nav unreachable.
         The reverse case needs nothing: arriving from the rail's Logs row carries no `nav`
         param, so this is false, the rail renders, and its Logs row lights up through
         `activeRow` (components/account-rail.js). */
      if(this.get('homeNavContext')) { return false; }
      var route = this.get('router.currentRouteName') || this.get('app_state.current_route') || '';
      /* THE LIST LIVES AT MODULE SCOPE (`ACCOUNT_SECTION_ROUTES`, top of this file), where the
         reasoning for every name and every deliberate absence is recorded. It moved there
         2026-09-25 when `showClassicAccountRail` became its second reader; this computed is
         unchanged in behaviour -- the same names, still behind the `homeNavContext` gate above,
         which is the ONE thing the Basic reader does not share. */
      return isAccountSectionRoute(route);
    }
  ),

  homeNavContext: computed(
    'router.currentRouteName',
    'router.currentURL',
    'app_state.current_route',
    function() {
      var route = this.get('router.currentRouteName') || this.get('app_state.current_route') || '';
      if(route !== 'user.logs') { return false; }
      /* The regex itself lives in utils/primary_nav.js: the pill nav and the account rail read
         the same param, and three copies of one pattern is three things to keep in step. This
         computed keeps its OWN route test (`user.logs` only) -- widening it to the log DETAIL
         page would change which pages `accountRailContext` suppresses, which is not this
         change's business. */
      return hasHomeNavParam(this.get('router.currentURL'));
    }
  ),

  bareUserOutletLayout: computed(
    'router.currentRouteName',
    'router.currentURL',
    'model.user_name',
    'app_state.current_route',
    function() {
      /* Bare if EITHER the route we are on OR the route we are heading to is bare.
         `router.currentRouteName` only advances on routeDidChange, i.e. at the END of a
         transition, while `app_state.current_route` is set from `transition.to_route` on
         routeWillChange, i.e. at the START (routes/application.js:110 ->
         services/app-state.js:749). Consulting only the former made this layout lag the
         whole transition.

         The OR is what makes it correct in both directions, and neither half alone is:
           account -> board  currentRouteName is still the account route, so without
                             `current_route` the board's loading state rendered underneath
                             the account pill nav -- the reported flash.
           board -> account  `current_route` is already the account route, so without
                             `currentRouteName` the pill nav would appear OVER the board
                             that is still rendered, which is the same flash mirrored.
         Being bare during a transition between the two is the safe answer: the pill nav
         belongs to the settled account-style page, not to either loading state. */
      var _this = this;
      /* Matched on the route's BASE plus any child, rather than on a list of exact leaf
         names, so a new child route under any of these is covered without editing a list
         (`user.board-detail.edit` already is).

         `indexOf(base + '.')` rather than a bare prefix test: 'user.boards' starts with
         'user.board', so a prefix test would make Boards match board-alt/board-detail.

         The `_loading` strip is DEFENSIVE, not load-bearing. Ember names a loading substate
         with an underscore (`user.board-detail_loading`), and that name did reach here until
         services/app-state.js#global_transition started ignoring substate transitions
         outright -- see the comment there. It is kept because this computed reads two
         different route sources and only one of them is covered by that guard. */
      var BARE_ROUTE_BASES = ['user.board-alt', 'user.board-detail', 'user.home',
                              'user.extras', 'user.boards', 'user.stats'];
      var is_bare_route = function(name) {
        var n = (name || '').replace(/_loading$/, '');
        return BARE_ROUTE_BASES.some(function(base) {
          return n === base || n.indexOf(base + '.') === 0;
        });
      };
      if (is_bare_route(_this.get('router.currentRouteName')) ||
          is_bare_route(_this.get('app_state.current_route'))) {
        return true;
      }
      var un = _this.get('model.user_name');
      if (!un) {
        return false;
      }
      var url = _this.get('router.currentURL') || '';
      if (url.indexOf('/' + un + '/home') !== -1 || url.indexOf('/' + un + '/extras') !== -1) {
        return true;
      }
      return false;
    }
  )
});
