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
