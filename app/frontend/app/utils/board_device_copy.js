import RSVP from 'rsvp';
import i18n from './i18n';
import modal from './modal';
import { opens_in_view_route } from './board_view';
import { is_protected_board, route_refuses_local } from './board_revocation';

// The copy of a board the Modern board page falls back on when the server gives no usable answer
// (#1213): the row saved on the device by sync, or the copy held in memory from this session.

// How long one bounded request waits. A request that hangs is otherwise tried at 8, 20 and 20 seconds
// (utils/extras.js), and the route makes up to three, so a communicator on a bad connection would wait
// minutes for a board already on the device.
export var DEVICE_COPY_WAIT_MS = 8000;
// How long reading that copy may take before the page gives up on it.
export var DEVICE_READ_WAIT_MS = 5000;

export function usable_copy(raw) {
  return !!(raw && raw.id && raw.key && Array.isArray(raw.buttons));
}

export function newest_copy(a, b) {
  if(!usable_copy(a)) { return usable_copy(b) ? b : null; }
  if(!usable_copy(b)) { return a; }
  return (b.updated || '') > (a.updated || '') ? b : a;
}

// The newest copy available, as a private object the caller may change, or null.
export function read_device_copy(persistence, board_key, memory_raw) {
  var memory = memory_raw ? JSON.parse(JSON.stringify(memory_raw)) : null;
  return persistence.find('board', board_key).then(function(row) {
    return newest_copy(row, memory);
  }, function() {
    return newest_copy(null, memory);
  });
}

// Offline, is this board on the device? A key with no owner (obf/, integrations/) has its own loader.
// Read before leaving the board on screen: the loading page clears it as soon as a transition starts.
export function board_saved_here(persistence, board_cache, key) {
  if(persistence.get('online') !== false || !key || !opens_in_view_route(key)) { return RSVP.resolve(true); }
  if(usable_copy(board_cache.peek(key))) { return RSVP.resolve(true); }
  var read = persistence.find('board', key).then(usable_copy, function() { return false; });
  return within(read, DEVICE_READ_WAIT_MS).then(function(saved) { return !!saved; });
}

export function warn_board_not_saved() {
  modal.warning(i18n.t('board_not_saved_here', "That board isn't saved on this device yet."));
}

// Offline with no board to show: the user's boards, never a dead end (#1209). Called from a route's
// afterModel, so the transition is replaced before the board page appears.
export function leave_unsaved_board(router, persistence, session) {
  var user_name = session.get('user_name');
  if(persistence.get('online') !== false || !session.get('access_token') || !user_name) { return false; }
  router.replaceWith('user.boards', user_name);
  modal.warning(i18n.t('board_not_saved_pick_another', "That board isn't saved on this device yet. Choose one that is."));
  return true;
}

// Settles with `promise`, or with null after `ms`, so a stuck database cannot hold a page.
export function within(promise, ms) {
  return new RSVP.Promise(function(resolve) {
    var timer = setTimeout(function() { resolve(null); }, ms);
    var done = function(result) { clearTimeout(timer); resolve(result); };
    promise.then(done, function() { done(null); });
  });
}

// The API's own "not found", at the HTTP status or in a 200 body. A proxy's bare 404 is not an answer
// about this board.
function board_missing(err) {
  var body = (err && err.fakeXHR && err.fakeXHR.responseJSON) || (err && err.result) || {};
  var status = (err && err.fakeXHR && err.fakeXHR.status === 404) ? 404 : body.status;
  return status === 404 && !!body.error;
}

// The server says this session is over, at the HTTP status or in a 200 body.
export function session_ended(err, session) {
  if(!err) { return false; }
  return session.dead_session_response(err.fakeXHR) || !!(err.result && err.result.invalid_token);
}

function board_ref(board_key, board_id) {
  return { get: function(attr) { return attr === 'key' ? board_key : (attr === 'id' ? board_id : null); } };
}

// The home and sidebar boards keep their copy whatever the server says.
export function board_kept_on_refusal(board_key, board_id, appState) {
  return is_protected_board(board_ref(board_key, board_id), appState);
}

// Did the server say no, on any attempt of this navigation? `failures` are persistence.ajax rejections.
// The home and sidebar boards keep their copy, so the communicator keeps a voice. Unlike the Basic view
// Speak Mode is no exception, because the Modern page turns it on for everyone. Anything but a denial
// or a 404 is not an answer about this board.
export function server_refused(failures, board_key, board_id, appState) {
  if(board_kept_on_refusal(board_key, board_id, appState)) { return false; }
  var board = board_ref(board_key, board_id);
  return failures.some(function(err) {
    return board_missing(err) || route_refuses_local(err, appState, board, { ignore_speak_mode: true });
  });
}
