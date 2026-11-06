import { route_refuses_local } from './board_revocation';

// The copy of a board the Modern board page falls back on when the server gives no usable answer
// (#1213): the row saved on the device by sync, or the copy held in memory from this session.

// How long a page with a device copy waits for the server. A request that hangs is retried at 8,
// 20 and 20 seconds (utils/extras.js), and the route makes up to three, so without a deadline a
// communicator on a bad connection would wait minutes for a board already on the device.
export var DEVICE_COPY_WAIT_MS = 8000;

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

// Did the server say no, on any attempt of this navigation? `failures` are persistence.ajax
// rejections; the status is on fakeXHR. A denial follows the Basic view's rule
// (board_revocation.js#route_refuses_local), so Speak Mode and the home and sidebar boards keep
// their copy. A 404 means the board is gone. Anything else is not an answer about this board.
export function server_refused(failures, raw, appState) {
  var board = { get: function(attr) { return raw[attr]; } };
  return failures.some(function(err) {
    if(err && err.fakeXHR && err.fakeXHR.status === 404) { return true; }
    return route_refuses_local(err, appState, board);
  });
}
