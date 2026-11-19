import { last_result, partial_result } from './sync_log_store';

// Sync results grouped by the boards a person knows (Traci, 2026-11-14; mockups "Sync Status Mockups", the combined
// design). A sync saves the home board, the sidebar boards, the liked boards and Crisis Vocabulary, and each one's
// folders (utils/offline_sync_seeds.js). Its log lists every board on its own line, which reads as dozens of boards
// for one Core 60. These helpers put each folder under the board it was reached from, so Sync Details and the drawer
// can show one row per board with "47 of 56 folders saved".
//
// The walk (services/persistence.js sync_boards) records, for each board it visits or gives up on, which board it
// started from (note_board_root, into sync_progress.board_roots); the finished sync's log entry keeps that map as
// `roots`. A log from before this change has no map: each board is then its own group, as before.

// Where a board came from, as the walk names it (utils/offline_sync_seeds.js `visit_source`), in the order rows show.
var ROLE_ORDER = ['home board', 'sidebar board', 'starred board', 'suggested board', 'crisis vocabulary'];

// What the person sees for a board that did not fail. 'kept' is a device copy kept after a failed refresh.
var SAVED_STATUSES = { 'downloaded': true, 're-downloaded': true, 'cached': true, 'kept': true };

// Record which board `next` (a walk queue entry) was reached from. `info` is what is known of the board itself:
// {id, key, name} (the name only once the board loaded). A seed is its own root.
export function note_board_root(sync_progress, next, info) {
  if(!sync_progress || !next) { return; }
  info = info || {};
  var key = info.key || next.key || null;
  var id = info.id || next.id || null;
  var root = next.root || key || id;
  if(!root) { return; }
  sync_progress.board_roots = sync_progress.board_roots || {};
  var prior = sync_progress.board_roots[id] || sync_progress.board_roots[key] || {};
  var entry = { root: root, role: next.root_role || next.visit_source || null, name: info.name || prior.name || null, key: key, id: id };
  if(id) { sync_progress.board_roots[id] = entry; }
  if(key) { sync_progress.board_roots[key] = entry; }
}

// The queue entry for a folder of `parent` (the entry being walked): it carries the parent's root and role down.
export function root_for_link(parent) {
  if(!parent) { return {}; }
  return { root: parent.root || parent.key || parent.id, root_role: parent.root_role || parent.visit_source || null };
}

// A board's last word in the list: a board looked up more than once (a retry) keeps its latest row, and a failure
// the sync recorded for it wins over an earlier success only when nothing saved it later.
function final_rows(statuses) {
  var rows = {};
  var order = [];
  (statuses || []).forEach(function(s) {
    if(!s) { return; }
    var k = s.key || s.id;
    if(!k) { return; }
    if(!rows[k]) { order.push(k); rows[k] = {}; }
    var row = rows[k];
    if(s.error) { row.error = s.error; } else if(s.status) { row.status = s.status; if(SAVED_STATUSES[s.status]) { row.saved = true; } }
    row.key = s.key || row.key || null;
    row.id = s.id || row.id || null;
  });
  return order.map(function(k) { return rows[k]; });
}

function short_name(key) {
  var tail = String(key || '').split('/').pop() || '';
  return tail.replace(/[-_]+/g, ' ').replace(/^\s+|\s+$/g, '');
}

// The groups for `statuses` (rows of {id, key, status, error}) with `roots` (sync_progress.board_roots or a log
// entry's `roots`). Each group: {key, name, role, board_saved, board_missing, folders_saved: [names],
// folders_missing: [names], folder_count, saved_count, ready}. And overall: {saved, total, pct, missing}.
export function rollup(statuses, roots) {
  roots = roots || {};
  var groups = {};
  var order = [];
  final_rows(statuses).forEach(function(row) {
    var info = roots[row.id] || roots[row.key] || null;
    var root = (info && info.root) || row.key || row.id;
    var root_info = roots[root] || (info && info.root === root ? info : null) || {};
    if(!groups[root]) {
      order.push(root);
      groups[root] = { key: root, name: root_info.name || short_name(root), role: root_info.role || (info && info.role) || null,
        board_saved: false, board_missing: false, folders_saved: [], folders_missing: [] };
    }
    var g = groups[root];
    var ok = !!row.saved && !row.error;
    var is_root = (row.key && row.key === root) || (row.id && (row.id === root || row.id === root_info.id));
    if(is_root) {
      if(ok) { g.board_saved = true; } else { g.board_missing = true; }
      if(info && info.name) { g.name = info.name; }
    } else {
      var name = (info && info.name) || short_name(row.key || row.id);
      if(ok) { g.folders_saved.push(name); } else { g.folders_missing.push(name); }
    }
  });
  var list = order.map(function(k) {
    var g = groups[k];
    g.folders_saved.sort(function(a, b) { return a.localeCompare(b); });
    g.folders_missing.sort(function(a, b) { return a.localeCompare(b); });
    g.folder_count = g.folders_saved.length + g.folders_missing.length;
    g.saved_count = g.folders_saved.length;
    g.ready = !g.board_missing && g.folders_missing.length === 0;
    return g;
  });
  list.sort(function(a, b) {
    var ra = ROLE_ORDER.indexOf(a.role), rb = ROLE_ORDER.indexOf(b.role);
    ra = ra < 0 ? ROLE_ORDER.length : ra; rb = rb < 0 ? ROLE_ORDER.length : rb;
    if(ra !== rb) { return ra - rb; }
    return order.indexOf(a.key) - order.indexOf(b.key);
  });
  var total = 0, saved = 0, missing = 0;
  list.forEach(function(g) {
    total += g.folder_count + 1;
    saved += g.saved_count + (g.board_missing ? 0 : 1);
    missing += g.folders_missing.length + (g.board_missing ? 1 : 0);
  });
  return { groups: list, overall: { saved: saved, total: total, missing: missing, pct: total ? Math.floor(100 * saved / total) : 100 } };
}

// A board written to the device during this sync (note_board_written below). At a stop, only such a download, or one
// the device database already held (sync_progress.device_boards, utils/sync_board_fallback.js note_device_boards),
// counts as saved (docs/task-management/2026-11-16_sync-details-no-percent.md Parts 2 and 3).
export function note_board_done(sync_progress, id, key) {
  if(!sync_progress) { return; }
  sync_progress.boards_done = sync_progress.boards_done || {};
  if(id) { sync_progress.boards_done[id] = true; }
  if(key) { sync_progress.boards_done[key] = true; }
}

// A board whose WRITE to the device succeeded while a sync runs (both persistence store copies call this on their
// success line: services/persistence.js and utils/persistence.js `store`). The adapter's save is only queued when a
// fetch answers (store_eventually), so this, not the fetch, is what makes a board saved at a stop. Reads the caller's
// `obj` (`obj[store] || obj`: the adapter's {board: ...} payload or a raw board), never the record handed to the
// device database, which rewrites its id (utils/dbman.js). Adds to `device_boards` only when the sync already read the
// device (creating that map means "the device was read", utils/sync_board_fallback.js known_on_device).
export function note_board_written(root, store, obj) {
  if(store !== 'board' || !root || typeof root.get !== 'function' || !obj) { return; }
  var sync_progress = root.get('sync_progress');
  if(!sync_progress) { return; }
  var raw = obj[store] || obj;
  note_board_done(sync_progress, raw.id, raw.key);
  if(sync_progress.device_boards) {
    if(raw.id) { sync_progress.device_boards[raw.id] = true; }
    if(raw.key) { sync_progress.device_boards[raw.key] = true; }
  }
}

var UNCONFIRMED_UNTIL_DONE = { 'downloaded': true, 're-downloaded': true };

// A stopped sync's rows: a download recorded before it finished (board_lookup records 're-downloaded' before the
// reload; the batch step 'downloaded' before its store) and never confirmed reads 'not_saved': not an error, so it is
// neither counted as saved (rollup) nor taken as a refusal. A board waiting for a retry, or still loading, when the sync
// stopped is not on the device. Other rows are unchanged; a finished sync does not use this (its walk resolved them all).
export function confirmed_statuses(statuses, sync_progress) {
  var done = (sync_progress && sync_progress.boards_done) || {};
  var device = (sync_progress && sync_progress.device_boards) || {};
  var ok = function(s) { return !!((s.id && (done[s.id] || device[s.id])) || (s.key && (done[s.key] || device[s.key]))); };
  return (statuses || []).map(function(s) {
    if(!s || s.error || !UNCONFIRMED_UNTIL_DONE[s.status] || ok(s)) { return s; }
    return Object.assign({}, s, { status: 'not_saved' });
  });
}

// The errors a stopped sync recorded: every user's live array (sync_progress.progress_for[*].board_errors; the walk
// pushes there), then any entry of the sync_progress.errors copy not already among them (update_sync_progress refreshes
// that copy only at each walk step, so it can miss the last errors, and a test or older caller may set only it). Each
// once.
export function live_board_errors(sync_progress) {
  var list = [];
  var seen = {};
  var add = function(e) {
    if(!e) { return; }
    var k = [e.board_id, e.board_key, e.error].join('|');
    if(seen[k]) { return; }
    seen[k] = true;
    list.push(e);
  };
  var per_user = (sync_progress && sync_progress.progress_for) || {};
  Object.keys(per_user).forEach(function(u) { ((per_user[u] && per_user[u].board_errors) || []).forEach(add); });
  ((sync_progress && sync_progress.errors) || []).forEach(add);
  return list;
}

// The error for a board the walk reached whose pictures or sounds did not all save ("failed to sync completely",
// services/persistence.js sync_boards). Tagged `content`: the board itself was not refused, so PR #1328's offline list
// does not hide another owner's liked board on it (docs/task-management/2026-11-16_sync-details-no-percent.md Part 2, T).
export function content_error(msg, id, key) {
  return { error: msg, board_id: id, board_key: key, content: true };
}

// A board's errors as the sync keeps them while it runs (sync_progress.progress_for[*].board_errors), merged into its
// status rows the way the finished sync does (services/persistence.js sync, before its log entry). A content error's
// tag is kept; other rows get no `content` key.
export function with_errors(statuses, errors) {
  var rows = (statuses || []).slice();
  (errors || []).forEach(function(error) {
    if(error && (error.board_key || error.board_id)) {
      var row = { id: error.board_id || error.board_key, key: error.board_key || error.board_id, error: error.error };
      if(error.content) { row.content = true; }
      rows.push(row);
    }
  });
  return rows;
}

// The summary Sync Details and the sync drawer show: the running sync while one runs (its rows so far, with the
// failures it has recorded), otherwise a finished sync on this device. Sync Details takes the newest one with rows
// (utils/sync_log_store.js last_result), so a cancelled sync does not empty it, and marks it `from_earlier` when a
// later sync had no rows. With no finished sync at all it takes the newest stopped one (partial_result), marked
// `stopped`. A running or stopped summary is `unfinished`: its rows are only the boards reached so far, so nothing in
// it may be called ready (Traci, 2026-11-16). The drawer reports the sync that just ended, so it passes `latest_only`
// and never gets an earlier or stopped one. Null when there is nothing to group.
export function summary_for(persistence, opts) {
  if(!persistence || typeof persistence.get !== 'function') { return null; }
  if(persistence.get('syncing') && persistence.get('sync_progress')) {
    var running = rollup(with_errors(persistence.get('sync_progress.board_statuses'), persistence.get('sync_progress.errors')), persistence.get('sync_progress.board_roots'));
    running.unfinished = true;
    return running;
  }
  var latest_only = !!(opts && opts.latest_only);
  var log = persistence.get('sync_log') || [];
  var found = last_result(log);
  var stopped = false;
  if(!found && !latest_only) {
    found = partial_result(log);
    stopped = !!found;
  }
  if(!found || (found.from_earlier && latest_only)) { return null; }
  var summary = rollup(found.entry.statuses, found.entry.roots);
  summary.from_earlier = found.from_earlier;
  summary.finished = found.entry.finished || null;
  if(stopped) { summary.unfinished = true; summary.stopped = true; }
  return summary;
}

// The name of the board the sync is working under right now: the top board of the last row it wrote. Null before
// the first row, or when that board's name is not known yet.
export function current_root_name(statuses, roots) {
  var rows = statuses || [];
  var last = rows[rows.length - 1];
  if(!last || !roots) { return null; }
  var info = roots[last.id] || roots[last.key];
  if(!info) { return null; }
  var top = roots[info.root] || info;
  return top.name || null;
}

// True while a sync has nothing left to do but boards waiting to be tried again (utils/board_retry.js): the drawer's
// "Waiting for a better connection".
export function only_parked_left(sync_progress) {
  if(!sync_progress) { return false; }
  var parked = sync_progress.parked || 0;
  return parked > 0 && (sync_progress.to_visit || 0) <= parked;
}
