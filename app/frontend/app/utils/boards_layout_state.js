/* Boards-page arrangement: side-by-side vs top-down, per-device mirror.
 *
 * The AUTHORITATIVE value is the user preference `boards_layout` (see
 * User#sanitize_boards_layout_preference!). This localStorage copy exists only so the
 * page can paint the right arrangement on the FIRST frame, before the user record has
 * hydrated — which is also why it cannot be keyed by user id: at read time nobody knows
 * yet who is signed in.
 *
 * That makes clearing it on sign-out load-bearing rather than tidy-up. On a shared
 * school/clinic device the next person to sign in has no `boards_layout` preference of
 * their own, so the resolver falls through to this mirror and they inherit the previous
 * user's arrangement for their whole session. `clearStoredLayout()` is called from
 * app-state's sign-out reset alongside boardsPageListCache.clearAll(), for the same
 * reason and at the same point.
 *
 * Lives here rather than in components/boards-layout-toggle.js so the key is defined
 * ONCE: app-state has to be able to clear it, and services do not import components.
 * localStorage can throw (Safari private mode, sandboxed iframes), so every access is
 * guarded and the read falls back to the default.
 */

export const BOARDS_LAYOUT_KEY = 'll_boards_layout';
export const SIDE_BY_SIDE = 'side-by-side';
export const TOP_DOWN = 'top-down';

/* Test seam. Unit tests supply a stand-in storage object here instead of replacing the
   page-global window.localStorage: other page-level code reads that global on its own
   timers (capabilities' 2s auth-sync tick calls localStorage.getItem), so a stub without
   getItem installed on window made that tick throw into whichever test was running.
   Always null in the app. Call storage() only inside the try blocks below, because
   reading window.localStorage can itself throw (sandboxed iframes). */
var storageOverride = null;
function storage() { return storageOverride || window.localStorage; }
export function setStorageForTesting(store) { storageOverride = store || null; }

export function readStoredLayout() {
  try {
    var s = storage();
    var stored = s && s[BOARDS_LAYOUT_KEY];
    return stored === TOP_DOWN ? TOP_DOWN : SIDE_BY_SIDE;
  } catch (e) {
    return SIDE_BY_SIDE;
  }
}

export function writeStoredLayout(mode) {
  try {
    var s = storage();
    if (s) { s[BOARDS_LAYOUT_KEY] = mode; }
  } catch (e) { /* preference simply does not persist; the toggle still works this session */ }
}

export function clearStoredLayout() {
  try {
    var s = storage();
    if (s) { s.removeItem(BOARDS_LAYOUT_KEY); }
  } catch (e) { /* nothing to clear if storage is unavailable */ }
}
