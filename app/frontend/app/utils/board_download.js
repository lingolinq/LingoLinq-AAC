import RSVP from 'rsvp';

// Board downloads through the Ember Data adapter (utils/persistence.js, DSExtend findRecord).
// Android sync fix, 2026-11-14: docs/task-management/2026-11-14_android-sync-slow-problems.md ("Final plan").
//
// A board can be 1 to 2 MB (pictures inline). On a phone link shared with a sync, the old limits failed them: the
// transport's 8 s first try was cut off and restarted from zero (utils/extras.js), the adapter answered "timeout"
// at 15 s, and the answer that then arrived was thrown away. Now:
// - the caller is still answered by caller_ms, every model as before. A slow board rejects with {error: 'timeout'},
//   which never falls back to the device copy, so the sync's own rules decide (utils/sync_board_fallback.js). This
//   limit must stay BELOW board_transport_ms: if the transport failed first, its status-0 failure would take the
//   device fallback and a refresh would resolve with the OLD copy (review rounds 1 and 2, High);
// - a board's download is ONE long attempt (board_transport_options) that keeps going after that answer;
// - a second request for a board still downloading joins that download (join_download);
// - an answer that arrives after its caller was answered is stored, unless the device holds something newer
//   (store_late_board).

// One object, so tests can scale the limits instead of waiting for them.
export var find_limits = { caller_ms: 15000, board_transport_ms: 60000 };

// What RESTAdapter.findRecord sends with no snapshot (node_modules/@ember-data/adapter/dist/rest.js findRecord:
// `{data: buildQuery(undefined)}`, which is `{}`), plus the limit. `attempt: 3` makes it the only attempt: the
// $.ajax wrapper retries a GET while attempt <= 2 (utils/extras.js).
export function board_transport_options() {
  return { data: {}, timeout: find_limits.board_transport_ms, attempt: 3 };
}

var downloads = {};

// The download running for `key` under `identity`, or a new one from start(). Forgotten once it settles, success or
// failure, so a later request starts afresh. `identity` is the request's token and acting user
// (utils/request_identity.js): a request under another identity never joins, since the running download carries the
// credentials it started with (Codex review of #1322, P1). join_download(key, start) is the same with no identity.
export function join_download(key, identity, start) {
  if(typeof identity === 'function') { start = identity; identity = ''; }
  var slot = key + '#' + (identity || '');
  var entry = downloads[slot];
  if(entry) {
    entry.waiting++;
    return entry.promise;
  }
  entry = { waiting: 1, key: key };
  var forget = function() { if(downloads[slot] === entry) { delete downloads[slot]; } };
  entry.promise = new RSVP.Promise(function(resolve) { resolve(start()); }).then(function(res) {
    forget();
    return res;
  }, function(err) {
    forget();
    throw err;
  });
  downloads[slot] = entry;
  return entry.promise;
}

// The identities downloads of `key` are running under now. Read by tests (the identity must be the credentials the
// request sends).
export function identities_of(key) {
  var list = [];
  for(var slot in downloads) {
    if(downloads[slot].key === key) { list.push(slot.substring(key.length + 1)); }
  }
  return list;
}

// How many requests are waiting on downloads of `key`, under any identity (0 when none runs). Read by tests.
export function waiting_on(key) {
  var n = 0;
  for(var slot in downloads) {
    if(downloads[slot].key === key) { n = n + downloads[slot].waiting; }
  }
  return n;
}

// The adapter's database and session for store_late_board.
export function late_deps(db, token) {
  return {
    find: function(id) { return db.find('board', id, true); },
    store: function(obj) { return db.store_eventually('board', obj); },
    token: token,
    now: function() { return (new Date()).getTime(); }
  };
}

var LATE_DROPPED_KEYS = ['images', 'sounds', 'image', 'sound']; // what the serializer strips from a board answer in time (serializers/application.js)
var late_seen = typeof WeakSet === 'function' ? new WeakSet() : null;

function time_of(value) {
  var t = Date.parse(value || '');
  return isNaN(t) ? null : t;
}

// Store a board answer that arrived after its caller was told "timeout". `started` is {at, token} from when the
// request was sent, `token` being the request's identity (utils/request_identity.js) and `deps.token()` the identity
// now. Resolves true when stored. Not stored:
// - when the session changed since (sign-out, another person signed in, acting as another user);
// - over a device copy with an offline edit waiting to be sent (`changed`), a revoked mark
//   (utils/board_revocation.js), a copy fetched after this request started, or a newer copy by the server's
//   `updated` (a save made after this request);
// - twice for one answer (several requests may have waited on one download).
export function store_late_board(payload, id, started, deps) {
  if(!payload || !payload.board) { return RSVP.resolve(false); }
  if(late_seen && late_seen.has(payload)) { return RSVP.resolve(false); }
  // The session check comes before the answer is claimed, so a caller whose session no longer matches does not use it
  // up for one whose session does (Codex review of #1322, P2).
  if(deps.token() !== started.token) { return RSVP.resolve(false); }
  if(late_seen) { late_seen.add(payload); }
  return RSVP.resolve().then(function() { return deps.find(id); }).then(function(row) { return row; }, function() { return null; }).then(function(row) {
    var raw = row && row.board;
    if(raw) {
      if(raw.changed || raw.revoked) { return false; }
      if(raw.retrieved && raw.retrieved >= started.at) { return false; }
      var ours = time_of(payload.board.updated);
      var theirs = time_of(raw.updated);
      if(ours !== null && theirs !== null && theirs > ours) { return false; }
    }
    if(deps.token() !== started.token) { return false; }
    LATE_DROPPED_KEYS.forEach(function(key) { delete payload[key]; });
    delete payload.board.local_result;
    payload.board.retrieved = deps.now();
    return RSVP.resolve(deps.store(payload)).then(function() { return true; }, function() { return false; });
  });
}
