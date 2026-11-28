import RSVP from 'rsvp';
import { usable_copy } from './board_device_copy';

// What the sync does when refreshing a board fails (#1212, PR #1268).
//
// The sync re-downloads a changed board with `record.reload()` (services/persistence.js board_lookup). Under a slow
// server that failed: the sync cut it off after 5 s, though the adapter allows a server request 15 s
// (utils/persistence.js find, `error({error: 'timeout'})`), and a board that failed was skipped with its whole folder
// tree ("failed retrieval for syncing"), so one slow response left a branch missing offline.

// Longer than the adapter's own 15 s limit, so the adapter decides; shorter than the 30 s the sync allows a whole board
// lookup (time_promise's default).
export var BOARD_RELOAD_MS = 20000;

// How long a sync waits for the signed-in user's refresh, its first step (services/persistence.js sync, "reloading
// root user"). By the same rule: longer than the adapter's own limit, so a slow answer is not cut off by the sync.
// Was 5 s, which failed every sync started on a busy slow link ("failed to retrieve user details"; Android emulator,
// 2026-11-15). A real failure still fails the sync.
export var USER_RELOAD_MS = 20000;

// A failure that says nothing about the board itself: a timeout (the adapter's or the sync's), no connection, a server
// error or too many requests. Errors arrive as {error: 'timeout'} from the adapter, {error: 'promise timed out:...'}
// from time_promise, {fakeXHR: {status}, message, result} from the transport (utils/extras.js), or
// {offline: true, error: 'not online'} from the adapter while the device is offline (utils/persistence.js DSExtend
// findRecord). Anything else, including a refusal (400 "Not authorized"), a missing or deleted board (404), or an
// unknown shape, is not passing.
export function passing_failure(err) {
  if(!err || typeof err !== 'object') { return false; }
  if(err.error === 'timeout' || err.offline === true) { return true; }
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
  if(!sync_progress.device_boards) { sync_progress.device_boards = {}; sync_progress.device_boards_read_at = (new Date()).getTime(); }
  (rows || []).forEach(function(row) {
    var raw = row && row.data && row.data.raw ? row.data.raw : row;
    if(row && row.data && row.data.id) { sync_progress.device_boards[row.data.id] = true; }
    if(raw && raw.id) { sync_progress.device_boards[raw.id] = true; }
    if(raw && raw.key) { sync_progress.device_boards[raw.key] = true; }
  });
}

// False only when the sync read the device's boards, this one is not among them, and its record was not fetched by the
// adapter since then. The adapter stamps a record it fetched from the server (`retrieved`, models/base.js) and stores
// what it fetches (utils/persistence.js findRecord, store_eventually), so a board fetched after the list was read is
// being stored though the list does not have it. A stamp from before the list was read proves nothing (had that
// save landed, the row would be listed; a save can fail on a full device and the stamp stays for the session). A
// record pushed from a /tree answer carries no stamp. When the device's boards were not read (a lookup outside a
// full sync), there is nothing to judge by and the answer is as it was before.
//
// Measured in the installed Android app (2026-11-10, task log): with single-board requests failing, the sync without
// this check listed 97 boards as 'cached' with no error while the device held none; with it, the five boards it
// reached were reported as failed and it went no further. With a healthy server the check costs no extra request:
// the reload joins the fetch already under way.
export function known_on_device(sync_progress, record) {
  var known = sync_progress && sync_progress.device_boards;
  if(!known || !record || !record.get) { return true; }
  var fetched_at = record.get('retrieved');
  if(fetched_at && fetched_at >= (sync_progress.device_boards_read_at || 0)) { return true; }
  return !!(known[record.get('global_id')] || known[record.get('id')] || known[record.get('key')]);
}

// A board saved late in a sync was downloaded again by the same sync (docs/task-management/
// 2026-11-16_sync-late-copy-current.md). On a slow link a board's request outlives the adapter's 15 s limit, the sync
// parks the board (claim_board_retry below), and the late answer is still saved to the device with `retrieved` set to
// when it was stored (utils/board_download.js store_late_board). The retry, after the walk, found that copy past the
// freshness window (`fresh`, models/base.js: 5 minutes, or a later `appState.refresh_stamp`) and reloaded it by key
// (services/persistence.js board_lookup). Measured in desktop Chromium at 0.8 Mbps: 80.6 MB and 869 s, where the code
// before #1322 took 43 MB and 478 s.
//
// True when `row`, a device row, is a complete copy (it opens offline, with permissions and image urls) stored during
// this sync: stamped no earlier than the later of the sync's start (`started_at`, services/persistence.js sync) and its
// read of the device's boards (known_on_device's rule above: a stamp from before that read proves nothing). It says
// "stored during this sync", not "requested during it". When the server's revisions list names the board
// (`listed_revision`), the row must be that revision: it is judged on the row, since a lite record in memory may carry
// no revision.
export function copy_from_this_sync(sync_progress, row, listed_revision) {
  var start = sync_progress && sync_progress.started_at;
  if(!start || !usable_copy(row) || !row.permissions || !row.image_urls || !row.retrieved) { return false; }
  if(listed_revision && listed_revision != row.current_revision) { return false; }
  return row.retrieved >= Math.max(start, sync_progress.device_boards_read_at || 0);
}

// For a board this sync is trying again (a parked retry), the device row when copy_from_this_sync holds, or null. The
// row is read from the device, not judged from `record`: a record Modern view pushed from a /tree answer has no stamp
// and no image urls (utils/board_detail_cache.js), and store_late_board writes only the device. `find_row(record)`
// resolves the device's usable copy or rejects (services/persistence.js device_board_row).
export function stored_this_sync(sync_progress, id, record, find_row, listed_revision) {
  if(!sync_progress || !id || !(sync_progress.retried_lookups || {})[id]) { return RSVP.resolve(null); }
  return RSVP.resolve(find_row(record)).then(function(row) { return copy_from_this_sync(sync_progress, row, listed_revision) ? row : null; }, function() { return null; });
}

// A first sync has no stored copy to keep, so a board whose lookup failed was lost with its folders. When the failure
// is passing, the sync tries the board again later in the same sync, up to MAX_BOARD_RETRIES more times, after the
// waits in utils/board_retry.js (services/persistence.js nextBoard). Resolves the retry number (1 to
// MAX_BOARD_RETRIES), or 0 for none. The count is per board for the whole sync (`sync_progress.retried_lookups`), not
// per queue entry, so a board linked from two places or synced for a supervisee is still asked for at most
// MAX_BOARD_RETRIES + 1 times. The failed lookup cached in `sync_progress.key_lookups` (board_lookup) is dropped, or
// the retry would get the same rejection back. Three more tries since the Android sync fix (2026-11-14); was one.
export var MAX_BOARD_RETRIES = 3;
export function claim_board_retry(sync_progress, id, err) {
  if(!sync_progress || !id || !passing_failure(err)) { return 0; }
  sync_progress.retried_lookups = sync_progress.retried_lookups || {};
  var done = sync_progress.retried_lookups[id] || 0;
  if(done >= MAX_BOARD_RETRIES) { return 0; }
  sync_progress.retried_lookups[id] = done + 1;
  if(sync_progress.key_lookups) { delete sync_progress.key_lookups[id]; }
  return done + 1;
}

// Which boards the server really answered for in this sync (docs/task-management/2026-11-16_offline-boards-page.md,
// "Finding 1"). A reload can resolve from the device copy (the adapter's fallback on 5xx, status 0 or 401,
// utils/persistence.js findRecord) with the copy's old `retrieved` stamp; the adapter stamps a server answer when it
// arrives. So a record counts when it was stamped after `asked` (and not in the future: a device clock that was
// ahead); with no `asked` (a copy this sync stored from a server answer) it counts as is. The finished entry carries
// the list (`answered`, services/persistence.js), which the offline list reads (utils/offline_board_list.js).
export function note_answered(sync_progress, record, asked) {
  if(!sync_progress || !record || typeof record.get !== 'function') { return; }
  if(asked !== undefined) {
    var stamp = record.get('retrieved');
    if(!(stamp >= asked && stamp <= (new Date()).getTime())) { return; }
  }
  var into = sync_progress.answered = sync_progress.answered || {};
  [record.get('id'), record.get('key')].forEach(function(t) { if(t) { into[t] = true; } });
}

export function answered_refs(sync_progress) {
  return Object.keys((sync_progress && sync_progress.answered) || {});
}
