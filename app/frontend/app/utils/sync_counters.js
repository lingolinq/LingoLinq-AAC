// What one root sync asked for and got (item 0.1 of the sync proposal; design and review in
// docs/task-management/2026-11-20_sync-proposal-implementation.md, "Item 0.1"). Kept on the sync's log entry as
// `counters` (utils/sync_log_store.js entry_copy) for support, and read by Sync Details' summary line
// (utils/sync_summary.js).
//
// - begin(sync_id) when a root sync starts (services/persistence.js sync, where it creates sync_progress);
// - token(persistence) is that id only while that sync is the one running (sync_progress.sync_id), else null, so a
//   sync cleared without a log entry stops counting by itself;
// - request_started(token) gives a ticket; request_ended(ticket, {status, chars, failure}) counts only against the
//   sync that started it (a request a timed-out step left running may end in the next sync);
// - note_failure(token, kind), board_fetched(token) and media_saved(token, type, bytes) for what the request hooks
//   cannot see;
// - finish(sync_id) returns plain JSON and forgets the counter.
// Failure kinds are a closed list: no error text or url is ever kept (proxy errors carry urls, some urls a token).
// Nothing here may throw into a caller: the request hook runs on every request in the app (utils/extras.js).

export var FAILURE_KINDS = ['timeout', 'offline', 'limited', 'server', 'refused', 'storage', 'supervisee', 'other'];

var current = null;

function fresh(sync_id, now) {
  var failures = {};
  FAILURE_KINDS.forEach(function(k) { failures[k] = 0; });
  return { sync_id: sync_id, started: now, requests: 0, open: 0, peak: 0, received_chars: 0, failures: failures,
    boards: { fetched: 0 }, pictures: { saved: 0, bytes: 0 }, sounds: { saved: 0, bytes: 0 } };
}

function count(n) { return (typeof n === 'number' && isFinite(n) && n > 0) ? n : 0; }

// The kind of failure an HTTP status means, or null for a success.
export function failure_kind(status) {
  if(typeof status !== 'number') { return null; }
  if(status === 0) { return 'offline'; }
  if(status === 429) { return 'limited'; }
  if(status >= 500 && status < 600) { return 'server'; }
  if(status >= 400 && status < 500) { return 'refused'; }
  return null;
}

function add_failure(kind) {
  if(!current) { return; }
  current.failures[FAILURE_KINDS.indexOf(kind) >= 0 ? kind : 'other'] += 1;
}

export function begin(sync_id, now) {
  current = sync_id ? fresh(sync_id, typeof now === 'number' ? now : (new Date()).getTime()) : null;
}

export function token(persistence) {
  try {
    if(!current || !persistence || typeof persistence.get !== 'function') { return null; }
    return persistence.get('sync_progress.sync_id') === current.sync_id ? current.sync_id : null;
  } catch(e) { return null; }
}

function mine(id) { return !!(current && id && current.sync_id === id); }

export function request_started(tok) {
  try {
    if(!mine(tok)) { return null; }
    current.requests += 1;
    current.open += 1;
    current.peak = Math.max(current.peak, current.open);
    return { sync_id: tok };
  } catch(e) { return null; }
}

export function request_ended(ticket, result) {
  try {
    if(!ticket || !mine(ticket.sync_id)) { return; }
    current.open = Math.max(0, current.open - 1);
    result = result || {};
    current.received_chars += count(result.chars);
    var kind = result.failure || failure_kind(result.status);
    if(kind) { add_failure(kind); }
  } catch(e) { /* counting never breaks a request */ }
}

export function note_failure(tok, kind) {
  try { if(mine(tok)) { add_failure(kind); } } catch(e) { /* never throws */ }
}

// A board the server sent during the sync (a refresh it answered, or one of a batch; services/persistence.js). A
// board row marked "downloaded" is not enough: a board already loaded earlier in the session is marked so too.
export function board_fetched(tok) {
  try { if(mine(tok)) { current.boards.fetched += 1; } } catch(e) { /* never throws */ }
}

// A picture or sound the sync fetched and wrote to the device; `bytes` is what was fetched (decoded).
export function media_saved(tok, type, bytes) {
  try {
    if(!mine(tok)) { return; }
    var bucket = type === 'image' ? current.pictures : (type === 'sound' ? current.sounds : null);
    if(!bucket) { return; }
    bucket.saved += 1;
    bucket.bytes += count(bytes);
  } catch(e) { /* never throws */ }
}

// The counters for the log entry, or null when this sync was not counted. `storage_failures`: the writes that failed
// during the sync (utils/storage_failures.js), read by the caller.
export function finish(sync_id, opts) {
  try {
    if(!mine(sync_id)) { return null; }
    opts = opts || {};
    var c = current;
    current = null;
    var now = typeof opts.now === 'number' ? opts.now : (new Date()).getTime();
    c.failures.storage += count(opts.storage_failures);
    return {
      started: c.started, seconds: Math.max(0, Math.round((now - c.started) / 1000)),
      requests: c.requests, peak: c.peak, open_at_end: c.open, received_chars: c.received_chars,
      failures: c.failures, boards: c.boards, pictures: c.pictures, sounds: c.sounds
    };
  } catch(e) { current = null; return null; }
}

// The decoded size of a base64 data URI (the picture proxy's answer), padding excluded.
export function base64_bytes(data_uri) {
  if(typeof data_uri !== 'string') { return 0; }
  var b64 = data_uri.replace(/^[^,]*,/, '').replace(/\s/g, '');
  var pad = b64.endsWith('==') ? 2 : (b64.endsWith('=') ? 1 : 0);
  return Math.max(0, Math.floor(b64.length * 3 / 4) - pad);
}

// The request hook in utils/extras.js: watches one `$.realAjax` result with its own two-handler `.then`, so the caller's
// chain, arguments and results are untouched. A result without `.then` (some test stubs) is ignored.
export function watch_jquery_request(raw, persistence) {
  try {
    var ticket = request_started(token(persistence));
    if(!ticket || !raw || typeof raw.then !== 'function') { return; }
    raw.then(function(data, message, xhr) {
      var status = (data && typeof data === 'object' && data.error && typeof data.status === 'number' && !data.ok) ? data.status : ((xhr && xhr.status) || 200);
      request_ended(ticket, { status: status, chars: xhr && typeof xhr.responseText === 'string' ? xhr.responseText.length : 0 });
    }, function(xhr, text_status) {
      request_ended(ticket, text_status === 'timeout' ? { failure: 'timeout' } : { status: (xhr && typeof xhr.status === 'number') ? xhr.status : 0 });
    });
  } catch(e) { /* counting never breaks a request */ }
}

export function reset_for_tests() { current = null; }
