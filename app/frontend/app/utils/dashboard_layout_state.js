/* Dashboard layout: gentle vs focused, per-device mirror.
 *
 * The AUTHORITATIVE value is the user preference `dashboard_layout`. This localStorage copy
 * exists only so a page can render the right chrome on the FIRST frame, before the user
 * record has hydrated. Same problem, same shape and same reasoning as
 * utils/boards_layout_state.js — read that file's header too; this one is its twin.
 *
 * WHY IT IS NEEDED AT ALL. Focused hides several Gentle-only elements, and it used to do it
 * two ways, both of which happen too late on a cold load:
 *   - `body.ll-layout-focused .foo { display: none }`, where the class is applied from an
 *     observer on the user record, i.e. after first paint; and
 *   - a template gate on `effectiveLayout`, which reads the same un-hydrated preference.
 * Either way a Focused user watched the Gentle header paint and then disappear on reload
 * (reported 2026-09-14). With this mirror the gate is correct on frame one.
 *
 * CLEARING ON SIGN-OUT IS LOAD-BEARING, not tidy-up: it cannot be keyed by user id, because
 * at read time nobody knows yet who is signed in. On a shared school or clinic device the
 * next person to sign in may have no `dashboard_layout` of their own, and without the clear
 * they would inherit the previous user's layout for their whole session.
 *
 * localStorage can throw (Safari private mode, sandboxed iframes), so every access is
 * guarded and the read falls back to null — "unknown", which callers treat as "use the
 * preference", never as a layout in its own right.
 */

export const DASHBOARD_LAYOUT_KEY = 'll_dashboard_layout';
export const GENTLE = 'gentle';
export const FOCUSED = 'focused';

/* null when nothing is stored or storage is unavailable — deliberately NOT 'gentle', so a
   caller can tell "no opinion" from "gentle" and fall through to its own default. */
export function readStoredDashboardLayout() {
  try {
    var stored = window.localStorage && window.localStorage[DASHBOARD_LAYOUT_KEY];
    return (stored === FOCUSED || stored === GENTLE) ? stored : null;
  } catch (e) {
    return null;
  }
}

export function writeStoredDashboardLayout(layout) {
  try {
    if (window.localStorage && (layout === FOCUSED || layout === GENTLE)) {
      window.localStorage[DASHBOARD_LAYOUT_KEY] = layout;
    }
  } catch (e) { /* the mirror simply does not persist; the preference still governs */ }
}

export function clearStoredDashboardLayout() {
  try {
    if (window.localStorage) { window.localStorage.removeItem(DASHBOARD_LAYOUT_KEY); }
  } catch (e) { /* nothing to clear if storage is unavailable */ }
}
