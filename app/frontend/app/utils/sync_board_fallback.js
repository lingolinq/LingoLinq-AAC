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

// When the refresh failed for a passing reason and the device holds a copy of the board, keep that copy so the sync
// goes on into its folders, and record it as 'kept' rather than 're-downloaded'. Otherwise fail as before, with the
// original error, so the one retry below still applies.
//
// "The device holds a copy" is asked of the device, not of the record: a record can be complete in memory with no row
// stored (Modern view pushes the boards of a /tree answer into the store without saving them,
// utils/board_detail_cache.js), and such a board would not open offline after a restart. `find_row(record)` resolves
// when the device has a copy that can be opened and rejects when it does not (services/persistence.js board_lookup).
export function keep_stored_board(record, err, board_statuses, id, find_row) {
  if(!(passing_failure(err) && record && record.get && record.get('permissions') && record.get('image_urls') && find_row)) {
    return RSVP.reject(err);
  }
  return find_row(record).then(function() {
    record.set('button_set_needs_reload', false); // no second request to a server that just failed
    for(var idx = (board_statuses || []).length - 1; idx >= 0; idx--) {
      if(board_statuses[idx].id == id) { board_statuses[idx].status = 'kept'; break; }
    }
    return record;
  }, function() {
    return RSVP.reject(err);
  });
}

// Which boards the device database holds, as far as this sync knows. board_lookup answers 'cached' (no download) for a
// record whose revision is current, and a record can be current in memory with no row stored (the same /tree push as
// above), so 'cached' also asks this. The sync notes the rows it read at its start (sync_boards, find_all) and each
// row its batch download stores. A board that is not noted is downloaded, which stores it; a row written some other
// way in the meantime costs one extra download, nothing more.
export function note_device_boards(sync_progress, rows) {
  if(!sync_progress) { return; }
  sync_progress.device_boards = sync_progress.device_boards || {};
  (rows || []).forEach(function(row) {
    var raw = row && row.data && row.data.raw ? row.data.raw : row;
    if(row && row.data && row.data.id) { sync_progress.device_boards[row.data.id] = true; }
    if(raw && raw.id) { sync_progress.device_boards[raw.id] = true; }
    if(raw && raw.key) { sync_progress.device_boards[raw.key] = true; }
  });
}

// False only when the sync read the device's boards and this one is not among them. When they were not read (a lookup
// outside a full sync), there is nothing to judge by and the answer is as it was before.
export function known_on_device(sync_progress, record) {
  var known = sync_progress && sync_progress.device_boards;
  if(!known || !record || !record.get) { return true; }
  return !!(known[record.get('global_id')] || known[record.get('id')] || known[record.get('key')]);
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
