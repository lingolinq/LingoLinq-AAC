/* Which user's home board a board-picking surface is talking about.

   Every picker in the app is either choosing for YOU or, when a supporter
   arrives via `?user_id=X`, for a communicator. `appState.setup_user` is the
   one that is set only in the second case, so "setup_user, else currentUser"
   is the standing rule for the subject of a pick — it is what
   `board-preview-overlay#pick_for_home` uses to decide whose `preferences.
   home_board` a pick actually writes.

   Surfaces that MARK the already-chosen board must resolve the subject the
   same way, or the badge points at the supporter's own home board while the
   pick would set the communicator's. Extracted here so the picker and the
   board collection cannot drift apart on that. */

/** The subject's home board key (`<owner>/<slug>`), or '' when none is set.
 *  Returns a falsy string rather than null so template comparisons against a
 *  real board key can never accidentally match.
 *  @param {Object} appState the `app-state` service (or the app_state util)
 *  @returns {String}
 */
export function subjectHomeBoardKey(appState) {
  if(!appState) { return ''; }
  var setup_user = appState.get('setup_user');
  /* `setup_user` is briefly a placeholder while the record resolves
     (controllers/board-picker.js sets `other_user = {loading: true}` and
     nulls setup_user), so require a real id before trusting it. */
  if(setup_user && setup_user.get && setup_user.get('id')) {
    return setup_user.get('preferences.home_board.key') || '';
  }
  return appState.get('currentUser.preferences.home_board.key') || '';
}

/** Dependent keys for a computed() that reads subjectHomeBoardKey. */
export const SUBJECT_HOME_BOARD_DEPS = [
  'appState.currentUser.preferences.home_board.key',
  'appState.setup_user.preferences.home_board.key',
  'appState.setup_user.id'
];

export default subjectHomeBoardKey;
