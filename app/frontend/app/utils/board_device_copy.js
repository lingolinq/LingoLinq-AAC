import RSVP from 'rsvp';
import { is_protected_board, route_refuses_local } from './board_revocation';

// The copy of a board the Modern board page falls back on when the server gives no usable answer
// (#1213): the row saved on the device by sync, or the copy held in memory from this session.

// How long a page with a device copy waits for the server. A request that hangs is retried at 8,
// 20 and 20 seconds (utils/extras.js), and the route makes up to three, so without a deadline a
// communicator on a bad connection would wait minutes for a board already on the device.
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

// Did the server say no, on any attempt of this navigation? `failures` are persistence.ajax rejections.
// The home and sidebar boards keep their copy, so the communicator keeps a voice. Unlike the Basic view
// Speak Mode is no exception, because the Modern page turns it on for everyone. Anything but a denial
// or a 404 is not an answer about this board.
export function server_refused(failures, raw, appState) {
  var board = { get: function(attr) { return raw[attr]; } };
  if(is_protected_board(board, appState)) { return false; }
  return failures.some(function(err) {
    return board_missing(err) || route_refuses_local(err, appState, board, { ignore_speak_mode: true });
  });
}
