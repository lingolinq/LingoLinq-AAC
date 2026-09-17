/* Board view style: Basic vs Modern, per-device mirror.
 *
 * The AUTHORITATIVE value is the user preference `board_view_style`. This localStorage copy
 * exists only so a page can render the right chrome on the FIRST frame, before the user
 * record has hydrated. Same problem, same shape and same reasoning as
 * utils/dashboard_layout_state.js and utils/boards_layout_state.js — read those headers too;
 * this is their third sibling.
 *
 * WHY IT IS NEEDED AT ALL. The view style governs which SHELL a page renders, and it is read
 * two ways that are both too late on a cold load:
 *   - `body.ll-view-basic` / `.ll-view-modern`, applied from an observer on the user record,
 *     i.e. after first paint; and
 *   - template/route gates gets on `board_view_style`, which read the same un-hydrated
 *     preference and resolve to the 'modern' default.
 * Either way a Basic user would watch the Modern shell paint and then swap. That is the
 * same flash already reported for the Gentle/Focused axis on 2026-09-14. With this mirror
 * the first frame is correct.
 *
 * THE STORED VALUES ARE 'classic' AND 'modern', not 'basic'. Those are the values the
 * PREFERENCE itself holds (app/models/user.rb, server-permitted, 'modern' default) and they
 * are persisted user data — the 2026-09-16 rename changed only the user-facing LABELS
 * ("Classic View" -> "Basic View"). Renaming the stored value would strand every existing
 * account. Read utils/view_style.js for why every reader should go through a helper rather
 * than touching the key.
 *
 * CLEARING ON SIGN-OUT IS LOAD-BEARING, not tidy-up: it cannot be keyed by user id, because
 * at read time nobody knows yet who is signed in. On a shared school or clinic device the
 * next person to sign in may have no `board_view_style` of their own, and without the clear
 * they would inherit the previous user's shell for their whole session.
 *
 * localStorage can throw (Safari private mode, sandboxed iframes), so every access is
 * guarded and the read falls back to null — "unknown", which callers treat as "use the
 * preference", never as a style in its own right.
 */

export const VIEW_STYLE_KEY = 'll_board_view_style';
export const CLASSIC = 'classic';
export const MODERN = 'modern';

/* null when nothing is stored or storage is unavailable — deliberately NOT 'modern', so a
   caller can tell "no opinion" from "modern" and fall through to its own default. */
export function readStoredViewStyle() {
  try {
    var stored = window.localStorage && window.localStorage[VIEW_STYLE_KEY];
    return (stored === CLASSIC || stored === MODERN) ? stored : null;
  } catch (e) {
    return null;
  }
}

/* Only a KNOWN variant is written. An absent or unrecognised style leaves whatever is
   stored alone rather than overwriting it with a guess — the same rule the dashboard-layout
   mirror follows, and the reason a half-hydrated user record cannot wipe a good value. */
export function writeStoredViewStyle(style) {
  if(style !== CLASSIC && style !== MODERN) { return; }
  try {
    if(window.localStorage) { window.localStorage[VIEW_STYLE_KEY] = style; }
  } catch (e) { /* storage unavailable — the preference is still authoritative */ }
}

export function clearStoredViewStyle() {
  try {
    if(window.localStorage) { window.localStorage.removeItem(VIEW_STYLE_KEY); }
  } catch (e) { /* nothing to do */ }
}
