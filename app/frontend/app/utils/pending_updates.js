/* The "you have things waiting" signal behind the Updates affordances.
 *
 * ONE DEFINITION, TWO CALLERS. It started as a computed on
 * components/dashboard/authenticated-view.js, read only by classic view's Updates tab. The
 * modern pill-nav now shows the same counter (2026-09-14), and a second copy of this
 * arithmetic would have been free to drift from the first — the two would disagree about
 * what "3" means on the very next change to either.
 *
 * Takes the user OBJECT rather than reading a service, so it stays a pure function of its
 * argument and can be unit-tested without booting app-state. Callers pass
 * `appState.currentUser` and declare their own dependent keys.
 *
 * Returns, deliberately, one of three shapes — the callers' templates already branch on them:
 *   {count: n}  there are n unread things, and a number is worth showing
 *   true        something IMPORTANT is pending but has no count (a pending org invite, a
 *               supervision request, a board share) — show a marker, not a number
 *   null        nothing waiting
 */
export function pendingUpdates(user) {
  if (!user || typeof user.get !== 'function') { return null; }

  var important = user.get('pending_org') ||
                  user.get('pending_supervision_org') ||
                  (user.get('pending_board_shares') || []).length > 0 ||
                  user.get('unread_messages');

  /* `unread_messages` is a COUNT, not a collection — `attr('number')` on models/user.js,
     emitted as `user.settings['unread_messages'] || 0` by lib/json_api/user.rb. Reading
     `.length` off it was always `undefined`, so unread messages contributed nothing here:
     a user with 4 messages and no unread notifications fell through to the `important`
     branch and rendered a bare "!" instead of "4", and with notifications in play the
     badge under-reported by the whole message count. The navbar's own badge
     (app-navbar-authenticated-inner.hbs) renders `unread_messages` directly, so the two
     badges on the same screen disagreed. */
  var normal_new = user.get('unread_messages') || 0;
  var unread_notifications = (user.get('parsed_notifications') || []).filter(function(n) {
    return n.unread;
  }).length;
  normal_new = normal_new + (unread_notifications || 0);

  /* `read_notifications` is the user's own "I have seen these" marker, so a count is
     suppressed once it is set even if the individual items are still flagged unread. */
  if (normal_new && !user.get('read_notifications')) {
    return {count: normal_new};
  } else if (important) {
    return true;
  }
  return null;
}

/* Clear the notification half of the signal above.
 *
 * WHY THIS EXISTS. `read_notifications` is the only thing that retires a counted badge, and
 * until now the ONLY writer was `set_index_nav('updates')` on
 * components/dashboard/authenticated-view.js — reachable exclusively from the Classic
 * view's Updates tab. The Card-view Updates pills route to the notes log instead, which
 * renders no notifications and marks nothing read, so the server kept re-emitting
 * `read_notifications: false` and the badge sat there permanently with no way for the user
 * to dismiss it short of switching to Classic.
 *
 * Mirrors what `set_index_nav('updates')` does, so the two entry points cannot drift: set
 * the flag, save, swallow the failure. A failed save is deliberately silent — the badge is
 * an ambient hint, not an action the user asked to confirm, and the value re-syncs on the
 * next user reload.
 */
export function markUpdatesRead(user) {
  if (!user || typeof user.set !== 'function') { return false; }
  if (user.get('read_notifications')) { return false; }
  user.set('read_notifications', true);
  if (user.save) { user.save().then(null, function() { }); }
  return true;
}

/* The dependent keys every caller's computed must declare. Exported so a caller cannot
   watch a subset by accident and end up with a badge that fails to update. */
export const PENDING_UPDATE_KEYS = [
  'pending_org',
  'pending_supervision_org',
  'pending_board_shares',
  'unread_messages',
  'parsed_notifications',
  'read_notifications'
];

export default pendingUpdates;
