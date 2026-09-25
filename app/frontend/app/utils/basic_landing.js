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

/* `index_nav` NAMES A TAB ON THE BASIC HOME PAGE, and only three values exist:
   `set_index_nav` (components/dashboard/authenticated-view.js:1639) persists 'main',
   'supervisees' and 'supervisors' and silently drops anything else. 'supervisees' is the
   Communicators tab (components/dashboard/classic-view.hbs:431).
   It has to be part of the landing rather than left to the destination, because the Basic home
   page opens on whatever `preferences.device.last_index_nav` says (authenticated-view.js:805) --
   arriving without setting it would land on the Actions tab, not on the people the caseload was
   showing a moment earlier. */
const LANDINGS = {
  // Requested 2026-09-24: "map caseload -> home page Communicators".
  'caseload': { route: 'index', index_nav: 'supervisees' }
};

export function basic_landing_for(route) {
  if(!route) { return null; }
  return LANDINGS[route] || null;
}

export default basic_landing_for;
