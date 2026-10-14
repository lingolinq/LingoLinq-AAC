/* Boards-page folders panel: expanded/collapsed persistence.
 *
 * ONE implementation of "is the folders panel open", read by both sides that need it:
 *   - components/available-boards-section.js owns the live UI state (`foldersExpanded`)
 *     and writes the preference when the USER toggles it.
 *   - controllers/user/index.js#board_list needs the same answer, because foldered
 *     boards are held out of the main grid only while the panel is presenting them.
 *
 * Both READ their initial value from here so they already agree on first paint. That
 * matters: syncing the component's value onto the controller during render invalidates
 * `board_list` mid-render, and Ember drops the whole component's output — a blank
 * boards page, reproduced whenever the stored preference differed from the controller's
 * default. Agreeing up front removes the need for any render-time write; the component's
 * observer then only has to carry LATER changes, which happen outside render.
 *
 * localStorage can throw (Safari Private mode, sandboxed iframes), so every access is
 * guarded and falls back to the same default the component declares.
 */

import EmberObject from '@ember/object';

export const FOLDERS_EXPANDED_KEY = 'ub-boards-folders-expanded';
export const FOLDERS_EXPANDED_DEFAULT = false;

export function readFoldersExpanded() {
  try {
    var stored = localStorage.getItem(FOLDERS_EXPANDED_KEY);
    if (stored === 'true') { return true; }
    if (stored === 'false') { return false; }
  } catch (e) { /* localStorage unavailable — fall through to the default */ }
  return FOLDERS_EXPANDED_DEFAULT;
}

export function writeFoldersExpanded(expanded) {
  try {
    localStorage.setItem(FOLDERS_EXPANDED_KEY, expanded ? 'true' : 'false');
  } catch (e) { /* localStorage unavailable; in-memory state still updates */ }
}

/* Cleared on sign-out (app-state's reset, alongside boardsPageListCache.clearAll and
   clearStoredLayout) so a shared school/clinic device does not hand the next person to
   sign in the previous user's panel state. This key is per-DEVICE by necessity — both
   readers seed from it before the user record hydrates, so it cannot be keyed by user id
   at read time — which is exactly why dropping it at sign-out is the boundary. */
export function clearFoldersExpanded() {
  try {
    localStorage.removeItem(FOLDERS_EXPANDED_KEY);
  } catch (e) { /* nothing to clear if storage is unavailable */ }
}

/* SIDE-BY-SIDE MEANS OPEN (requested 2026-10-11). Above 1200px the boards page puts folders and
 * boards in two columns and hides the expand caret (app.scss, the folders chevron rule, and the
 * split rule's `max-width: 1200px` fallback -- the same boundary as this query; move them
 * together). A collapsed panel there was an empty column with no New folder / Tag a board
 * buttons and nothing on screen to open it with, so in side-by-side the panel is always open.
 *
 * ONE tracked flag, read by BOTH sides (the component's `foldersOpen` and the controller's
 * `mineFoldersPanelOpen`), so they cannot disagree about whether foldered boards are held out of
 * the main grid -- the drift the removed auto-expand caused (components/available-boards-section.js,
 * the "NO AUTOMATIC EXPAND/COLLAPSE" note). The stored preference is NOT changed by the layout: it
 * stays the user's choice for the stacked layout, written only by their own toggle. The flag
 * changes on a matchMedia event, never during render. */
export const SIDE_BY_SIDE_QUERY = '(min-width: 1201px)';

export const foldersLayout = EmberObject.create({ sideBySide: false });

(function trackSideBySide() {
  if (typeof window === 'undefined' || !window.matchMedia) { return; }
  var mql = window.matchMedia(SIDE_BY_SIDE_QUERY);
  foldersLayout.set('sideBySide', !!mql.matches);
  var update = function(e) { foldersLayout.set('sideBySide', !!e.matches); };
  if (mql.addEventListener) { mql.addEventListener('change', update); } else if (mql.addListener) { mql.addListener(update); }
})();
