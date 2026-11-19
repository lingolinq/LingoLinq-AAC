import { last_result } from './sync_log_store';

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
    if(s.warning) { row.warning = s.warning; } // saved without its picture (note_warning)
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
// folders_missing: [names], folder_count, saved_count, ready, pictures_missing: [names of its boards saved without
// their picture]}. And overall: {saved, total, pct, missing, warned}. A warning does not make a board missing; a
// board that failed is missing, whatever warning it also has.
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
        board_saved: false, board_missing: false, folders_saved: [], folders_missing: [], pictures_missing: [] };
    }
    var g = groups[root];
    var ok = !!row.saved && !row.error;
    var is_root = (row.key && row.key === root) || (row.id && (row.id === root || row.id === root_info.id));
    if(is_root) {
      if(ok) { g.board_saved = true; } else { g.board_missing = true; }
      if(info && info.name) { g.name = info.name; }
      if(ok && row.warning) { g.pictures_missing.push(g.name); }
    } else {
      var name = (info && info.name) || short_name(row.key || row.id);
      if(ok) { g.folders_saved.push(name); } else { g.folders_missing.push(name); }
      if(ok && row.warning) { g.pictures_missing.push(name); }
    }
  });
  var list = order.map(function(k) {
    var g = groups[k];
    g.folders_saved.sort(function(a, b) { return a.localeCompare(b); });
    g.folders_missing.sort(function(a, b) { return a.localeCompare(b); });
    g.pictures_missing.sort(function(a, b) { return a.localeCompare(b); });
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
  var total = 0, saved = 0, missing = 0, warned = 0;
  list.forEach(function(g) {
    warned += g.pictures_missing.length;
    total += g.folder_count + 1;
    saved += g.saved_count + (g.board_missing ? 0 : 1);
    missing += g.folders_missing.length + (g.board_missing ? 1 : 0);
  });
  return { groups: list, overall: { saved: saved, total: total, missing: missing, warned: warned, pct: total ? Math.floor(100 * saved / total) : 100 } };
}

// A board saved without its picture (utils/board_content_retry.js content_warning): the warning goes on the board's
// latest status row, so it is kept and shown as that board's. A row is never added for it (a row with only a warning
// would read as a board that did not save), so a board with no row yet gets no warning.
export function note_warning(statuses, warning) {
  if(!statuses || !warning) { return false; }
  for(var i = statuses.length - 1; i >= 0; i--) {
    var s = statuses[i];
    if(s && !s.error && ((warning.board_key && s.key === warning.board_key) || (warning.board_id && (s.id === warning.board_id || s.key === warning.board_id)))) {
      s.warning = warning.warning;
      return true;
    }
  }
  return false;
}

function warned_keys(entry) {
  var keys = {};
  final_rows((entry && entry.statuses) || []).forEach(function(row) {
    if(row.saved && !row.error && row.warning) { keys[row.key || row.id] = true; }
  });
  return keys;
}

// The boards of the newest finished sync in `log` saved without their picture that the finished sync before it, for
// the same person, did not warn about (services/sync-notice.js keeps a success card with a new warning until it is dismissed;
// the same warning again goes away on its own, as any success, Traci 2026-11-18).
export function new_warnings(log) {
  log = log || [];
  var latest = log[log.length - 1];
  if(!latest) { return []; }
  var prev = null;
  for(var i = log.length - 2; i >= 0; i--) {
    if(log[i] && log[i].user_id === latest.user_id && !log[i].errored && !log[i].canceled && (log[i].statuses || []).length) { prev = log[i]; break; } // a finished sync, as last_result (utils/sync_log_store.js): a failed or cancelled one stopped part way
  }
  var before = warned_keys(prev);
  return Object.keys(warned_keys(latest)).filter(function(k) { return !before[k]; });
}

// A board's errors as the sync keeps them while it runs (sync_progress.progress_for[*].board_errors), merged into its
// status rows the way the finished sync does (services/persistence.js sync, before its log entry).
export function with_errors(statuses, errors) {
  var rows = (statuses || []).slice();
  (errors || []).forEach(function(error) {
    if(error && (error.board_key || error.board_id)) {
      rows.push({ id: error.board_id || error.board_key, key: error.board_key || error.board_id, error: error.error });
    }
  });
  return rows;
}

// The summary Sync Details and the sync drawer show: the running sync while one runs (its rows so far, with the
// failures it has recorded), otherwise a finished sync on this device. Sync Details takes the newest one with rows
// (utils/sync_log_store.js last_result), so a cancelled sync does not empty it, and marks it `from_earlier` when a
// later sync had no rows. The drawer reports the sync that just ended, so it passes `latest_only`. Null when there is
// nothing to group.
export function summary_for(persistence, opts) {
  if(!persistence || typeof persistence.get !== 'function') { return null; }
  if(persistence.get('syncing') && persistence.get('sync_progress')) {
    return rollup(with_errors(persistence.get('sync_progress.board_statuses'), persistence.get('sync_progress.errors')), persistence.get('sync_progress.board_roots'));
  }
  var log = persistence.get('sync_log') || [];
  var found = last_result(log);
  if(!found || (found.from_earlier && opts && opts.latest_only)) { return null; }
  var summary = rollup(found.entry.statuses, found.entry.roots);
  summary.from_earlier = found.from_earlier;
  summary.finished = found.entry.finished || null;
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
