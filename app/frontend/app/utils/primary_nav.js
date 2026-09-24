/**
 * WHICH PILL OF THE PRIMARY NAV IS THE CURRENT PAGE -- stated once, for every consumer.
 *
 * The pill nav (components/user-pill-nav.hbs) is the HOME section's navigation, not the
 * app's: it is mounted once in templates/application.hbs and offers Home, Caseload,
 * Organizations, Boards, Extras and Updates. Three separate places need to agree about which
 * of those the user is standing on:
 *
 *   - controllers/application.js  which pill renders as active, and whether the nav renders
 *                                 at all (`showPillNav`)
 *   - components/account-rail.js  whether the rail's Home row is the current row, because a
 *                                 page inside this nav is a page inside Home
 *   - controllers/user.js         `homeNavContext`, which records the same arrival
 *
 * They used to hold three copies of the rule between them. The lesson the 2026-09-21 rail
 * work left behind -- "two lists that must move together will not, unless a test makes them"
 * (docs/task-management/learnings-archive/2026-09.md) -- applies exactly here, so the rule is
 * one function with one test rather than three readings of the same route names.
 *
 * THE GATES ARE PART OF THE RULE, not a caller's business. Two pills do not always render:
 * Organizations is gated on `has_management_responsibility` and Updates on the `updates_pill`
 * feature flag (user-pill-nav.hbs:19,53). Naming a pill that the nav will not draw is not a
 * harmless overshoot -- it would show a nav with nothing active AND, through the rail, assert
 * a current row for a section the user cannot see. Both cases are reachable today:
 * routes/organizations.js has NO permission guard (unlike routes/caseload.js:23-35, which
 * redirects), so a stale link reaches it with the pill hidden; and lib/feature_flags.rb:140
 * says `updates_pill` is forced on temporarily and is to be turned off before go-live.
 */

/* `nav=home` records WHICH MENU the user arrived through, in the URL rather than in transient
   state so a reload, a bookmark and the Back button all keep the answer
   (controllers/user/logs.js:23-31). One definition, because a second copy of a regex is a
   second thing to keep in step. */
export function hasHomeNavParam(url) {
  return /[?&]nav=home(&|$)/.test(url || '');
}

/* THE ROUTES REACHED FROM THE UPDATES PILL. `user.log` is here as well as `user.logs` because
   router.js:142 declares the detail page as a SIBLING (`path: '/logs/:log_id'`), so opening one
   update is a route change, not a descent -- and without it the nav would unmount on the most
   likely click the Updates page offers. */
function isUpdatesRoute(route) {
  return route === 'user.logs' || route === 'user.log';
}

/**
 * The pill name for a page, or null when the page is not in this nav.
 *
 * @param route  the route name (`router.currentRouteName`, or `app_state.current_route` while
 *               a transition is still in flight -- consult both, in that order, the way
 *               components/account-rail.js does).
 * @param url    `router.currentURL`. Only the Updates pill reads it.
 * @param options `canManageOrgs`, `canSeeRooms` and `updatesEnabled`, the gates above. All
 *               default to false, which is the safe direction: a caller that cannot answer
 *               gets no pill rather than a pill the nav will not render.
 */
export function pillForRoute(route, url, options) {
  var opts = options || {};
  if(route === 'index' || route === 'user.home') { return 'home'; }
  if(route === 'caseload') { return 'caseload'; }
  if(route === 'organizations') { return opts.canManageOrgs ? 'organizations' : null; }
  /* THE ROOMS PAGE IS IN THIS NAV for the person whose pill it is (requested 2026-09-23: the
     rooms page must keep the full left panel and the full nav, with Rooms active, and behave
     like the rest of the section rather than like a page you leave the section for).
     `/organizations/:id/rooms` is a child of the ORGANISATION route, so it also carries that
     section's own two-item strip; templates/organization.hbs stands that strip down on exactly
     this condition, so the page shows one nav and not two.
     GATED, like Organizations above, and on the other side of the same gate: a manager is
     offered Organizations and reaches rooms through it, so for them this page is an org
     sub-page and the org strip is the right nav. `canSeeRooms` comes from
     utils/rooms_nav#showsRoomsPill -- one reading of the user, shared with the nav that draws
     the pill. */
  if(route === 'organization.rooms') { return opts.canSeeRooms ? 'rooms' : null; }
  if(route === 'user.boards') { return 'boards'; }
  if(route === 'user.extras') { return 'extras'; }
  /* Updates is the logs page reached FROM this nav; the plain Logs row in the account rail is
     a different entry point to the same route and must not light the pill. */
  if(isUpdatesRoute(route) && hasHomeNavParam(url)) {
    return opts.updatesEnabled ? 'updates' : null;
  }
  return null;
}
