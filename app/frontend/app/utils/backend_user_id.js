/**
 * Ember Data keys the session user as id 'self' (serializers/application.js).
 * The server treats a non-digit path as a username (User.find_by_path), so
 * 'self' 404s and contact ids like selfx{hash} fail Utterance#share_with.
 * Prefer global_id / _actual_id. See models/user.js global_id computed.
 */
export default function backend_user_id(user) {
  if (!user) { return null; }
  var read = (typeof user.get === 'function')
    ? function(key) { return user.get(key); }
    : function(key) { return user[key]; };
  var id = read('global_id');
  if (id && id !== 'self') { return id; }
  var actual = read('_actual_id');
  if (actual) { return actual; }
  id = read('id');
  if (id && id !== 'self') { return id; }
  return actual || id || null;
}

/* The backend id of a user record, or of an id string. The string 'self' is the live session user (`session_user`), as
 * the API reads it; any other string is already a backend id. */
export function backend_id_of(user_or_id, session_user) {
  if(user_or_id == null || user_or_id === '') { return null; }
  if(typeof user_or_id === 'string' || typeof user_or_id === 'number') {
    var id = String(user_or_id);
    if(id !== 'self') { return id; }
    var me = backend_user_id(session_user);
    return (me && me !== 'self') ? me : null;
  }
  return backend_user_id(user_or_id);
}

/* Whether two users (records or ids) are the same person. The session user can be held by a record keyed 'self'
 * (serializers/application.js) and by one keyed by the real id, so `id` comparisons misread the person themself as
 * someone else; this compares backend ids. Unknown on either side is never the same person. Section 21 of
 * docs/task-management/2026-11-10_offline-followup-proposals.md. */
export function same_person(a, b, session_user) {
  var x = backend_id_of(a, session_user);
  var y = backend_id_of(b, session_user);
  return !!(x && y && x === y);
}

/* After a save of `saved`, a caller that re-points app state's currentUser when it saved that same record must not
 * assign a DIFFERENT record of the same person (the one keyed 'self' vs the real id): that splits currentUser from
 * sessionUser. Reload the live record instead, so it carries the saved preferences. Returns true when it did. */
export function reload_live_user_if_other_record(saved, app_state) {
  var live = app_state && app_state.get && app_state.get('currentUser');
  if(!saved || !live || saved === live) { return false; }
  if(!same_person(saved, live, app_state.get('sessionUser'))) { return false; }
  if(live.reload) { live.reload().then(null, function() { }); }
  return true;
}
