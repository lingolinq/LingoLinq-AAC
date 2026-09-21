import Component from '@ember/component';
import { action, computed } from '@ember/object';
import { inject as service } from '@ember/service';

/* THE ROUTES THAT ARE THE ACCOUNT PAGE. It is reachable under two names: `user.index` is the
   section's own index, and routes/user/account.js gives `user.account` the same template. A
   row that named only one of them would sit unhighlighted on the other, which is the state
   this file shipped in reversed -- see the note on `activeRow`.
   Stated ONCE and consumed twice: bound into that row's `@current-when` (which drives the
   highlight) and folded into ROW_FOR_ROUTE below (which drives `aria-current`), so the two
   cannot drift apart. */
const ACCOUNT_ROUTES = 'user.account user.index user.history';

/* THE ROUTES THAT ARE THE HOME PAGE. Like the account page it answers to two names: top-level
   `index` (path `/`) and `user.home` (path `/:user_id/home`), which routes/user/home.js renders
   through the SAME `index` template and controller. The rail's "Home Page" row had no active
   state at all until 2026-09-20, because until then the rail never rendered on the home page
   and the row could only ever be a way OUT of the section. Now the modern home page carries the
   rail too (components/dashboard/authenticated-view.hbs), so that row has to be able to light
   up like any other. Stated once, consumed twice — `@current-when` and ROW_FOR_ROUTE below. */
const HOME_ROUTES = 'index user.home';

/* THE ROUTES THAT ARE THE GOALS ROW and THE LOGS ROW (2026-09-21), added when the account
   pill row was retired and the section's DETAIL pages started rendering the rail.
   THE DETAIL ROUTES ARE SIBLINGS, NOT CHILDREN. router.js declares `goal` with path
   '/goals/:goal_id' alongside `goals`, so the URL nests but the route name does not -- which
   means <LinkTo @route="user.goals"> does NOT go active on `user.goal`. Naming the siblings
   here is what makes the row light up on the detail page.
   THESE TWO FEED ROW_FOR_ROUTE ONLY, not `@current-when`. That was tried first and does not
   work: `@current-when` resolves each route name against the LINK's own models, and these rows
   supply one (`user_name`) where `user.goal` / `user.log` need two, so the match silently
   fails. The Goals and Logs rows therefore take their `is-active` from `activeRow` instead --
   the same computed that sets their `aria-current`, so the highlight and the announcement
   cannot disagree. Setting one without the other tells a screen-reader user "Logs, current
   page" while a sighted user sees nothing lit: the inverse of the bug `activeRow` was written
   to fix, equally silent, and caught only by looking at the rendered page.
   Badges rides with Goals: they are goal badges (templates/user/badges.hbs links to
   `user.goal`), and the rail has no Badges row of its own. */
const GOALS_ROUTES = 'user.goals user.goal user.badges';
const LOGS_ROUTES = 'user.logs user.log';

/* Route name -> the rail row that route belongs to. Used ONLY for `aria-current`: <LinkTo>
   computes the visual highlight itself (see `@activeClass` in the template) but does not set
   `aria-current`, and a nav whose highlight a sighted user can see must say the same thing to
   a screen reader.
   The key set is the same one `accountRailContext` (controllers/user.js) uses to decide where
   the rail renders at all, which is the invariant worth keeping: a page that gets the rail has
   a row to highlight, and a page with no row does not get the rail. Adding a page means
   touching both. */
const ROW_FOR_ROUTE = {
  'user.edit': 'edit',
  'user.recordings': 'recordings',
  'user.stats': 'stats',
  'user.preferences': 'preferences',
  'user.subscription': 'subscription',
  'user.supervision': 'supervision'
};
/* DERIVED FROM THE ALIAS LISTS ABOVE, never written out again here: every route that lights a
   row through `@current-when` must claim the SAME row through `aria-current`, and deriving
   both from one constant is what stops them drifting.
   `user.lessons` and `user.focus` appear in NO list, deliberately. "Current Trainings" and the
   Focus Words report have no row in this rail, and Reports (`user.stats`) is usage statistics,
   not either of them -- pointing them at a row would make the nav say something untrue, which
   is worse than saying nothing. They resolve to null and light nothing. If the rail ever gains
   rows for them, add an alias list and update the test. */
ACCOUNT_ROUTES.split(' ').forEach(function(route) { ROW_FOR_ROUTE[route] = 'account'; });
HOME_ROUTES.split(' ').forEach(function(route) { ROW_FOR_ROUTE[route] = 'home'; });
GOALS_ROUTES.split(' ').forEach(function(route) { ROW_FOR_ROUTE[route] = 'goals'; });
LOGS_ROUTES.split(' ').forEach(function(route) { ROW_FOR_ROUTE[route] = 'logs'; });

/**
 * THE ACCOUNT SECTION'S LEFT NAV, as a fixed full-height panel.
 *
 * Extracted from templates/user/index.hbs (2026-09-18) so every page in the section carries
 * it, not just the account page. It renders from templates/user.hbs, which wraps every
 * `user.*` route, gated on `accountRailContext` in controllers/user.js -- that computed is
 * the single place deciding WHICH pages get the rail, so adding or removing a page is one
 * edit there rather than a template change here.
 *
 * Takes `@user` because the rows link by `user_name` and two of them are gated on that
 * user's permissions and preferences. Nothing else is passed: the panel has no per-page
 * state, which is what lets one instance serve every route.
 *
 * WHY A CLASSIC COMPONENT. `.md-acct-rail` styling assumes the <nav> IS the panel, and a
 * Glimmer component would wrap it in an extra element unless every rule moved. `tagName: ''`
 * keeps the template's own <nav> as the outer element, so no CSS changed in the extraction.
 */
export default Component.extend({
  tagName: '',

  router: service('router'),
  app_state: service('app-state'),

  /* Bound into the Account and Home Page rows' `@current-when` so each alias list lives in
     one place. */
  accountCurrentWhen: ACCOUNT_ROUTES,
  homeCurrentWhen: HOME_ROUTES,

  /* WHICH ROW THE CURRENT PAGE IS. Null on a route with no row of its own.
     THE BUG THIS FIXES: every row carried a literal class, and the Account row's was
     `is-active` with a hardcoded `aria-current="page"`. Once the rail moved out of
     templates/user/index.hbs and started rendering on all ten pages (2026-09-18), that made
     Account the highlighted row on Goals, Logs, Reports, Settings and the rest -- the nav
     told the user they were somewhere they were not.
     Read the same pair of sources, in the same order, as `accountRailContext` in
     controllers/user.js: `router.currentRouteName` is authoritative and `app_state.current_route`
     is the fallback that is populated during a transition. Reading only one of them would leave
     the highlight a frame behind the page on some navigations. */
  activeRow: computed('router.currentRouteName', 'app_state.current_route', function() {
    var route = this.get('router.currentRouteName') || this.get('app_state.current_route') || '';
    return ROW_FOR_ROUTE[route] || null;
  }),

  /* SCROLL AFFORDANCES. Moved wholesale from controllers/user/index.js; see the notes there
     in git history. The panel is fixed and full-height, so on a short viewport its rows
     overflow -- a mouse user spins a wheel and a keyboard user tabs, but someone driving this
     with eye gaze or a switch can only activate what is on screen.
     Disabled at the ends rather than removed, and the pair only ever renders or vanishes
     together: a button that disappears mid-scroll moves the target out from under someone
     dwelling on it (same reasoning as components/speak-menu.js). */
  rail_scrollable: false,
  rail_at_top: true,
  rail_at_bottom: false,

  updateRailScroll() {
    if(this.isDestroyed || this.isDestroying) { return; }
    var rail = document.querySelector('.md-acct-rail');
    if(!rail) { this.teardownRailScroll(); return; }
    var scrollable = rail.scrollHeight > (rail.clientHeight + 1);
    this.set('rail_scrollable', scrollable);
    if(!scrollable) { return; }
    this.set('rail_at_top', rail.scrollTop <= 1);
    this.set('rail_at_bottom', (rail.scrollTop + rail.clientHeight) >= (rail.scrollHeight - 1));
  },

  teardownRailScroll() {
    if(this._railScrollHandler) {
      window.removeEventListener('resize', this._railScrollHandler);
      if(this._railEl) { this._railEl.removeEventListener('scroll', this._railScrollHandler); }
      this._railScrollHandler = null;
      this._railEl = null;
    }
  },

  /* Double rAF: the rows are not in the DOM until Ember has rendered, and `scrollHeight` is
     not meaningful until layout has run. rAF rather than runLater because @ember/runloop is
     lint-banned in new code (ember/no-runloop). */
  railMounted: action(function() {
    this.teardownRailScroll();
    var _this = this;
    this._railScrollHandler = function() { _this.updateRailScroll(); };
    window.addEventListener('resize', this._railScrollHandler);
    window.requestAnimationFrame(function() {
      window.requestAnimationFrame(function() {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        var rail = document.querySelector('.md-acct-rail');
        if(rail && _this._railScrollHandler) {
          _this._railEl = rail;
          rail.addEventListener('scroll', _this._railScrollHandler);
        }
        _this.updateRailScroll();
      });
    });
  }),

  /* A PAGE, not a nudge: 80% of the visible height, so successive activations always leave a
     row of overlap and nothing is skipped between presses. */
  scrollRail: action(function(direction) {
    var rail = document.querySelector('.md-acct-rail');
    if(!rail) { return; }
    var step = Math.max(80, Math.round(rail.clientHeight * 0.8));
    rail.scrollBy({ top: direction === 'up' ? -step : step, behavior: 'smooth' });
  }),

  /* Unlike the controller this came from, a component DOES get torn down -- on every route
     change out of the section. Without this the resize listener would outlive it. */
  willDestroyElement() {
    this._super(...arguments);
    this.teardownRailScroll();
  }
});
