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
  'caseload': { route: 'index', index_nav: 'supervisees' },
  // Requested 2026-09-28: "boards page -> basic view home page with boards active".
  'user.boards': { route: 'index', index_nav: 'boards' }
};

/* Requested 2026-09-28: "updates page (logs) -> basic view home page with Updates active".
   Updates is not a route of its own but an ARRIVAL: `user.logs` (and a single update,
   `user.log`) reached from the pill nav, marked by `?nav=home` -- the same test the nav uses to
   light its Updates pill (utils/primary_nav.js). Reached from the account rail's Logs row, the
   same route is Basic's own Logs page, which Basic renders, so that one stays put. */
const UPDATES_LANDING = { route: 'index', index_nav: 'updates' };

export function basic_landing_for(route, url) {
  if(!route) { return null; }
  if((route === 'user.logs' || route === 'user.log') && hasHomeNavParam(url)) { return UPDATES_LANDING; }
  return LANDINGS[route] || null;
}

/* THE HANDOFF, both halves in one place. The switcher leaves the tab in app state before it
   transitions (components/view-switcher.js#_apply_view) and the Basic home page takes it when
   it renders (components/dashboard/classic-view.js). TAKEN ONCE: a value left behind would
   reopen that tab on some later, ordinary visit to the home page. */
export function hand_off_index_nav(appState, nav) {
  appState.set('pending_index_nav', nav || null);
}

export function take_pending_index_nav(appState) {
  var nav = appState.get('pending_index_nav') || null;
  if(nav) { appState.set('pending_index_nav', null); }
  return nav;
}

export default basic_landing_for;
