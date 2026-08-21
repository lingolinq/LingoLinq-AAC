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
