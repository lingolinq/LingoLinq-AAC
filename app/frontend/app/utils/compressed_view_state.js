/* Compressed View: whether it is on.
 *
 * ON means BOTH the `compressed_view` feature flag and the session user's own
 * `preferences.compressed_view` are exactly `true`. The flag gates the class as well as the
 * View-menu switch (components/view-switcher.js), so switching the flag off un-compresses
 * everyone without touching stored preferences. Anything but a real `true` is off: the server
 * coerces it (User#sanitize_dashboard_preferences!), and this is the client half of the same
 * rule. Applied to <body> by sync_density_scope in services/app-state.js.
 *
 * No per-device first-frame mirror (unlike utils/dashboard_layout_state.js): the only surfaces
 * that read the class are the app shell and the Modern home page, and neither renders until the
 * user record, which carries the preference, has loaded.
 */

export function compressedViewActive(flagOn, preference) {
  return flagOn === true && preference === true;
}
