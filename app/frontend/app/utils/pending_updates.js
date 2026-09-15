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

  var normal_new = user.get('unread_messages.length') || 0;
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
