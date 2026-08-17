// "Whose account is this page?" — for the supporter-facing context pill.
//
// A supporter (SLP, teacher, parent-supporter) spends much of their session on
// pages that belong to a communicator they supervise. Those pages look identical
// to their own, so the pill names the account they're actually in.
//
// The answer is already on the loaded user record — no extra request:
//
//   permissions.user_id  global id of the viewer the permissions were computed
//                        FOR (the session user). Differs from the record's own
//                        id exactly when this is someone else's page.
//   permissions.supervise / .model / .edit
//                        present only when the viewer holds a supervisory link
//                        (app/models/user.rb:61-66). A stranger on a public
//                        profile gets only view_existence / view_detailed, and
//                        must NOT be told they are supervising.
//
// Verified against the dev database 2026-08-09:
//   stranger  -> ["user_id","view_existence","view_detailed"]  => null
//   self      -> user_id == id                                  => null
//   supporter -> supervise/model/edit true, user_id = supporter => context
//
// Callers hand in the record; this module never goes looking for one. Today that
// is app-state's `page_user` (every `/:user_id/...` page) and `setup_user` (the
// standalone board-picker). The classic `/*key` board route has no page owner to
// hand in and is deliberately not covered.

function get(obj, key) {
  if(!obj) { return null; }
  return obj.get ? obj.get(key) : obj[key];
}

export function supervising_context_for(user) {
  if(!user) { return null; }
  var id = get(user, 'id');
  var viewer_id = get(user, 'permissions.user_id');
  // No viewer scoping (public/anonymous payload) or our own account — say nothing.
  if(!id || !viewer_id || id === viewer_id) { return null; }
  var supervisory = get(user, 'permissions.edit') ||
                    get(user, 'permissions.supervise') ||
                    get(user, 'permissions.model');
  if(!supervisory) { return null; }
  return {
    id: id,
    user_name: get(user, 'user_name'),
    // Prefer the human name; fall back to the handle so the pill is never blank.
    display_name: get(user, 'name') || get(user, 'user_name')
  };
}

export default { supervising_context_for: supervising_context_for };
