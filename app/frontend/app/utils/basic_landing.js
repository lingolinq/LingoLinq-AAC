/**
 * WHERE A MODERN-ONLY PAGE SENDS YOU WHEN YOU SWITCH TO BASIC.
 *
 * Switching view normally re-renders the page in place -- same route, a different template
 * (components/view-switcher.js#_apply_view). That works because nearly every destination exists
 * in both views. The caseload does not: it is Modern's own page, and someone standing on
 * `/caseload` when they switched to Basic was left on a route their view has no template for.
 *
 * A MAP, NOT A BRANCH IN THE SWITCHER. What the Basic equivalent of a page is, is a fact about
 * the product rather than about the control that happens to ask. Keeping it here means the next
 * page to join is one line plus one case in tests/unit/utils/basic-landing-test.js, and the
 * switcher never grows a second reason to know about routes.
 *
 * NULL MEANS STAY PUT, and that is the safe default on purpose: a map that guessed would move
 * people off pages that were working perfectly well in both views.
 */

import { hasHomeNavParam } from './primary_nav';
import { is_classic } from './view_style';

/* `index_nav` NAMES A TAB ON THE BASIC HOME PAGE (components/dashboard/classic-view.hbs
   `ch-tabs`): 'main' (Actions), 'supervisees' (Communicators), 'boards', 'updates'.
   It has to be part of the landing rather than left to the destination, because arriving on the
   home page with no tab named opens the Actions tab, not the page the user was just on.
   It travels by the HANDOFF below, not by writing `preferences.device.last_index_nav`: only
   three tabs are ever saved (`set_index_nav`, authenticated-view.js), so Boards and Updates
   could not ride on the preference at all. The dashboard applies it through `set_index_nav`,
   the action a tab click sends, so every tab gets exactly its click behaviour -- Communicators
   is still saved, Updates still marks notifications read, Boards still collapses the rail. */
const LANDINGS = {
  // Requested 2026-09-24: "map caseload -> home page Communicators".
  // Requested 2026-09-30: one communicator's caseload (`?supervisee=<name>`) expands THAT
  // communicator's card. `open_supervisee_from` names the URL param that carries them.
  'caseload': { route: 'index', index_nav: 'supervisees', open_supervisee_from: 'supervisee' },
  // Requested 2026-09-28: "boards page -> basic view home page with boards active".
  'user.boards': { route: 'index', index_nav: 'boards' },
  // Requested 2026-09-30: "extras page -> the home page with the extras drawer expanded and
  // scrolled down to the Extras items". Basic's Extras are the Actions tab's drawer, so this
  // names the tab AND the drawer; the home page opens it through the Extras card's own action.
  'user.extras': { route: 'index', index_nav: 'main', open_extras: true },
  // Requested 2026-09-30: "basic access -> take the user to the search page". Basic Access has no
  // Basic navigation; the board search is the same page as the Extras drawer's "Search Boards".
  // `models` are the route's dynamic segments, in order (router.js `search`: /search/:l/:q).
  'offline_boards': { route: 'search', models: ['any', '_'] }
};

/* MODERN'S UPDATES, IN BASIC. Updates is not a route of its own but an ARRIVAL: `user.logs` (and
   a single update, `user.log`) reached from the pill nav, marked by `?nav=home` -- the same test
   the nav uses to light its Updates pill (utils/primary_nav.js). Reached from the account rail's
   Logs row, the same route is Basic's own Logs page, which Basic renders, so that one stays put.
   First mapped 2026-09-28 to the Basic home page's Updates tab ("updates page (logs) -> basic view
   home page with Updates active"). Revised 2026-09-30 ("we should be routing to the logs page but
   ensure that their messages are not marked as read"): `user.logs?nav=home` stays on the Logs page
   and drops the Updates marker and the messages filter (`?type=note&nav=home`,
   components/user-pill-nav.hbs), which makes it Basic's own Logs page. A single update
   (`user.log?nav=home`) matches it ("try to match it to the best of your ability"): it stays on
   that update's page and drops the marker; `nav` is its only param (controllers/user/log.js),
   changes nothing it renders, and that page marks nothing read.
   A landing with `query_params` and no `route` means "this page, these params". */
const LOGS_FROM_UPDATES = { query_params: { nav: null, type: null } };
const LOG_FROM_UPDATES = { query_params: { nav: null } };

/* IS THIS PAGE THE VIEWER'S OWN? By id or user_name: on a cold load the session record was fetched
   as findRecord('user', 'self') and its id is still 'self'. */
export function is_own_page(page_user, viewer) {
  if(!page_user || !viewer) { return false; }
  var get = function(u, k) { return u.get ? u.get(k) : u[k]; };
  return get(page_user, 'id') === get(viewer, 'id') || get(page_user, 'user_name') === get(viewer, 'user_name');
}

/* `owner` (optional): `{ own, user_name }` for the page on screen. SOMEONE ELSE'S BOARDS LIBRARY
   lands on that user's account page, which lists the same boards (templates/user/index.hbs) -- not
   the viewer's own home page's Boards tab, which lists THEIR boards (requested 2026-10-01: switching
   view on another user's page "you still stay on that user's board", so an SLP can show a
   communicator what their view would look like). Without an owner the landing is as it was. */
export function basic_landing_for(route, url, owner) {
  if(!route) { return null; }
  if(route === 'user.boards' && owner && owner.own === false && owner.user_name) {
    return { route: 'user.index', models: [owner.user_name] };
  }
  if(route === 'user.logs' && hasHomeNavParam(url)) { return LOGS_FROM_UPDATES; }
  if(route === 'user.log' && hasHomeNavParam(url)) { return LOG_FROM_UPDATES; }
  var landing = LANDINGS[route] || null;
  var name = landing && landing.open_supervisee_from && url_param(url, landing.open_supervisee_from);
  // A copy, so the shared map entry never carries one arrival's name into the next.
  if(name) { landing = Object.assign({}, landing, { open_supervisee: name }); }
  return landing;
}

function url_param(url, key) {
  var query = String(url || '').split('?')[1];
  if(!query) { return null; }
  return new URLSearchParams(query.split('#')[0]).get(key) || null;
}

/* A route sees its query params on the transition, not in a URL; this writes them as the query
   string `basic_landing_for` reads, so a route and the View menu decide from the same text. */
export function query_string_for(transition) {
  var qp = (transition && transition.to && transition.to.queryParams) || {};
  var pairs = Object.keys(qp).filter(function(k) { return qp[k] != null && qp[k] !== ''; }).map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(qp[k]);
  });
  return pairs.length ? '?' + pairs.join('&') : '';
}

/* THE HANDOFF, both halves in one place. The switcher leaves the tab in app state before it
   transitions (components/view-switcher.js#_apply_view) and the Basic home page takes it when
   it renders (components/dashboard/classic-view.js). TAKEN ONCE: a value left behind would
   reopen that tab on some later, ordinary visit to the home page.
   A PENDING HANDOFF ALSO MARKS THE ARRIVAL AS NOT A LOGIN ENTRY (routes/index.js#beforeModel).
   `index` treats an arrival with no `transition.from` as a boot, which resumes the last
   remembered page and can start a communicator's speak mode. A landing made during the first
   page load has no `from` either, so it was resumed away and the next page's landing
   overwrote the tab. The handoff is taken only when the Basic home page renders, so it is
   still pending when `user.home` (which inherits index's hooks) runs. */
export function hand_off_index_nav(appState, nav, landing) {
  appState.set('pending_index_nav', nav || null);
  // The Extras drawer rides with the tab (the Extras landing above), taken once the same way.
  appState.set('pending_open_extras', !!(landing && landing.open_extras) || null);
  // And the communicator whose card to expand (the caseload landing above).
  appState.set('pending_open_supervisee', (landing && landing.open_supervisee) || null);
}

export function take_pending_index_nav(appState) {
  var nav = appState.get('pending_index_nav') || null;
  if(nav) { appState.set('pending_index_nav', null); }
  return nav;
}

/* ARRIVING ON A MODERN-ONLY PAGE IN BASIC (2026-09-30). The View menu is not the only way onto
   these pages: the navbar's "My Boards", the org page's "Go to My Caseload", a bookmark or Back
   all reach them, and Basic has no template for them, so the viewer got the Modern page with
   neither view's navigation. The page's route calls this once its model is known and, for a
   Basic viewer, goes to the same landing the View menu would. Returns true when it redirected,
   so the route can stop its own transition.
   `viewer` IS THE COLD-LOAD FALLBACK. On a first page load the route runs before
   `currentUser` is assigned (utils/session_user_wait.js), so `effective_view_user` is empty and
   the view cannot be read from it; the route passes the signed-in account's record it already
   has (or has waited for) instead. */
export function is_basic_viewer(appState, viewer) {
  return is_classic(appState.get('effective_view_user') || viewer);
}

export function send_basic_viewer_to_landing(appState, router, route, viewer, url) {
  if(!is_basic_viewer(appState, viewer)) { return false; }
  var landing = basic_landing_for(route, url);
  // A params-only landing is applied by its own page (routes/user/logs.js), not by a transition.
  if(!landing || !landing.route) { return false; }
  if(landing.index_nav) { hand_off_index_nav(appState, landing.index_nav, landing); }
  router.transitionTo(landing.route, ...(landing.models || []));
  return true;
}

export function take_pending_open_supervisee(appState) {
  var name = appState.get('pending_open_supervisee') || null;
  if(name) { appState.set('pending_open_supervisee', null); }
  return name;
}

export function take_pending_open_extras(appState) {
  var open = !!appState.get('pending_open_extras');
  if(open) { appState.set('pending_open_extras', null); }
  return open;
}

export default basic_landing_for;
