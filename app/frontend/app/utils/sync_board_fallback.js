import RSVP from 'rsvp';

// What the sync does when refreshing a board fails (#1212, PR #1268).
//
// The sync re-downloads a changed board with `record.reload()` (services/persistence.js board_lookup). Under a slow
// server that failed: the sync cut it off after 5 s, though the adapter allows a server request 15 s
// (utils/persistence.js find, `error({error: 'timeout'})`), and a board that failed was skipped with its whole folder
// tree ("failed retrieval for syncing"), so one slow response left a branch missing offline.

// Longer than the adapter's own 15 s limit, so the adapter decides; shorter than the 30 s the sync allows a whole board
// lookup (time_promise's default).
export var BOARD_RELOAD_MS = 20000;

// A failure that says nothing about the board itself: a timeout (the adapter's or the sync's), no connection, a server
// error or too many requests. Errors arrive as {error: 'timeout'} from the adapter, {error: 'promise timed out:...'}
// from time_promise, or {fakeXHR: {status}, message, result} from the transport (utils/extras.js). Anything else,
// including a refusal (400 "Not authorized"), a missing or deleted board (404), or an unknown shape, is not passing.
export function passing_failure(err) {
  if(!err || typeof err !== 'object') { return false; }
  if(err.error === 'timeout') { return true; }
  if(typeof err.error === 'string' && err.error.indexOf('promise timed out') === 0) { return true; }
  var xhr = err.fakeXHR;
  if(!xhr || typeof xhr.status !== 'number') { return false; }
  return xhr.status === 0 || xhr.status === 429 || (xhr.status >= 500 && xhr.status < 600);
}

// When the refresh failed for a passing reason and the device holds a complete copy (permissions and image_urls, the
// test the sync's cached paths use), keep that copy so the sync goes on into its folders, and record it as 'kept'
// rather than 're-downloaded'. Otherwise fail as before.
export function keep_stored_board(record, err, board_statuses, id) {
  if(passing_failure(err) && record && record.get && record.get('permissions') && record.get('image_urls')) {
    record.set('button_set_needs_reload', false); // no second request to a server that just failed
    for(var idx = (board_statuses || []).length - 1; idx >= 0; idx--) {
      if(board_statuses[idx].id == id) { board_statuses[idx].status = 'kept'; break; }
    }
    return RSVP.resolve(record);
  }
  return RSVP.reject(err);
}

// A first sync has no stored copy to keep, so a board whose lookup failed was lost with its folders. When the failure
// is passing, the sync tries the board once more, later in the same sync (services/persistence.js nextBoard). The
// claim is per board for the whole sync (`sync_progress.retried_lookups`), not per queue entry, so a board linked
// from two places or synced for a supervisee is still asked for at most twice. The failed lookup cached in
// `sync_progress.key_lookups` (board_lookup) is dropped, or the retry would get the same rejection back.
export function claim_board_retry(sync_progress, id, err) {
  if(!sync_progress || !id || !passing_failure(err)) { return false; }
  sync_progress.retried_lookups = sync_progress.retried_lookups || {};
  if(sync_progress.retried_lookups[id]) { return false; }
  sync_progress.retried_lookups[id] = true;
  if(sync_progress.key_lookups) { delete sync_progress.key_lookups[id]; }
  return true;
}

// How long the sync waits before that second try, so the server's load can drop.
export var BOARD_RETRY_DELAY_MS = 10000;
