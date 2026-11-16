// The identity an API request runs as (Codex review of #1322, P1 and P2; docs/task-management/
// 2026-11-14_android-sync-slow-problems.md, "Codex review of #1322").
//
// request_token is the one definition of the access token a request sends: utils/extras.js ajax uses it for the
// Authorization header. request_identity adds the user the request acts as (the X-As-User-Id header, from the
// session's as_user_id). A board download is shared, and its late answer stored, only under the same identity
// (utils/board_download.js join_download and store_late_board), so an answer fetched with one person's credentials
// never reaches a request made under another's.

function usable(token) {
  return (token && token !== 'none' && token !== '') ? token : null;
}

// capabilities first, then the session, then the stashed sign-in: right after sign-in capabilities.access_token can
// still be empty while the session already has the token (the "race after login").
export function request_token(capabilities, session, stashes) {
  var token = usable(capabilities && capabilities.access_token);
  // The session's token is taken as it is, 'none' included, exactly as utils/extras.js did before this was shared.
  if(!token && session && typeof session.get === 'function' && session.get('access_token')) {
    token = session.get('access_token');
  }
  if(!token && stashes && typeof stashes.get_object === 'function') {
    var auth = stashes.get_object('auth_settings', true);
    token = usable(auth && auth.access_token);
  }
  return token;
}

export function request_identity(capabilities, session, stashes) {
  var as_user = (session && typeof session.get === 'function' && session.get('as_user_id')) || '';
  return (request_token(capabilities, session, stashes) || '') + '|' + as_user;
}
