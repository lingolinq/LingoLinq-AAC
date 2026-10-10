/* A USER-INITIATED RELOAD IS NOT AN APP LAUNCH.
   `routes/index.js` treats an arrival with no `transition.from` as a login / app-boot entry and
   acts on it: `setupController`'s `jump_to_speak` (:189 -> :247 -> :249) opens speak mode for a
   premium communicator, because `preferences.auto_open_speak_mode` -- labelled "On Launch" in
   templates/user/preferences.hbs:24 and defaulted to true for every authenticated user
   (app/models/user.rb:2009) -- says that is what a launch should do.
   A full-page reload is indistinguishable from that boot: `location.reload()` destroys every bit
   of in-memory state, so the existing suppression marker `pending_index_nav`
   (utils/basic_landing.js:119) cannot survive it. The result was that the rail's "Reload" link
   reloaded the page and then re-landed the user somewhere else.
   WHY A MARKER THE LINK WRITES, rather than reading the navigation type. The browser reports
   `performance.getEntriesByType('navigation')[0].type === 'reload'` for ANY reload, and this app
   reloads itself from 22 places -- after sign-in on installed builds (components/login-form.js:880,
   :884) and on session override / force logout (services/session.js:621, :630) among them. Those
   ARE launches and must keep behaving like one, so the navigation type cannot tell us what we
   need. Only the control the user actually clicked knows.
   SCOPE: written by the Basic home rail's Reload only. The org/account rail
   (components/dashboard/classic-rail.js:259) reloads pages that never enter `index` or
   `user.home`, so a marker written there would never be read -- it would sit in sessionStorage and
   suppress the next genuine landing instead, including one belonging to a different person on a
   shared clinic device. */
var KEY = 'll_user_initiated_reload';

/* Latched in memory as well as in storage because `beforeModel` runs TWICE on one boot from `/`:
   `index.beforeModel` -> `index.afterModel` -> `_land_on_default` (routes/index.js:83) ->
   `replaceWith('user.home')` -> the SAME inherited `beforeModel` again. A marker removed on first
   read would leave the second pass recomputing a login entry and undoing the suppression. */
var latched_url = null;

function current_url() {
  try {
    return (window.location && window.location.href) || null;
  } catch(e) {
    return null;
  }
}

/* Records the page the user asked to reload. The URL is stored WITH the flag so a marker that is
   never consumed -- a cancelled reload, or a reload of a page that does not enter `index` --
   cannot suppress a landing for some other page later in the tab's life. */
export function mark_user_reload() {
  var url = current_url();
  if(!url) { return; }
  try {
    if(window.sessionStorage) { sessionStorage.setItem(KEY, url); }
  } catch(e) { /* sessionStorage unavailable (private window, blocked site data) */ }
}

/* True when THIS page load is the reload the user asked for. Matching on the URL is what makes the
   marker self-invalidating, so there is no one-shot removal to get wrong. */
export function is_user_reload() {
  var url = current_url();
  if(!url) { return false; }
  if(latched_url && latched_url === url) { return true; }
  var stored = null;
  try {
    stored = window.sessionStorage ? sessionStorage.getItem(KEY) : null;
  } catch(e) {
    return false;
  }
  if(stored && stored === url) {
    latched_url = url;
    return true;
  }
  return false;
}

/* Teardown. Called from app-state's `clear_user_state` beside the `ll_auto_open_home_tour` removal
   (services/app-state.js:2237), which exists for the same shared-device reason: this key is not
   keyed by user id, so it must not outlive the session that wrote it. */
export function clear_user_reload() {
  latched_url = null;
  try {
    if(window.sessionStorage) { sessionStorage.removeItem(KEY); }
  } catch(e) { /* sessionStorage unavailable */ }
}

export { KEY as RELOAD_INTENT_KEY };
