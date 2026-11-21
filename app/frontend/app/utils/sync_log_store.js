import RSVP from 'rsvp';
import capabilities from './capabilities';
import lingoLinqExtras from './extras';

// The sync log kept on the device (docs/task-management/2026-11-15_persist-sync-log.md, Traci 2026-11-15).
//
// `persistence.sync_log` (services/persistence.js) is the list Sync Details and the drawer read. Before this it lived
// only in memory, so a reload, an app restart or Android closing the Home Screen app emptied Sync Details. Now:
// - each writer passes its new list through record_sync_log, which keeps the newest SYNC_LOG_KEEP entries in memory
//   and saves copies to the `settings` store as `syncLog`, in the signed-in person's own device database;
// - restore_sync_log reads it back once the database is ready (services/persistence.js setup, beside lastSync);
// - sign-out clears the memory copy (services/app-state.js clear_user_state).
// The record carries its owner and is written and read only when the signed-in person owns the open database
// (log_owner): never for someone else's database, never for the signed-out one.

export var SYNC_LOG_KEEP = 5;
export var SYNC_LOG_KEY = 'syncLog';

// The device database is named "lingolinqStorage::<user name>===<key>" (utils/capabilities.js setup_database);
// "__" is the one a signed-out device opens (utils/_stashes.js db_settings).
export function log_owner(auth, db_name) {
  var match = String(db_name || '').match(/^lingolinqStorage::(.*)===/);
  var db_user = match && match[1];
  var user_name = auth && auth.user_name;
  if(!db_user || db_user === '__' || !user_name || user_name !== db_user) { return null; }
  return user_name;
}

function owner_for(persistence, deps) {
  var stashes = persistence && persistence.get && persistence.get('stashes');
  var auth = stashes && typeof stashes.get_object === 'function' ? stashes.get_object('auth_settings', true) : null;
  return log_owner(auth, deps.db_name);
}

function defaults(deps) {
  deps = deps || {};
  return { storage: deps.storage || lingoLinqExtras.storage, db_name: ('db_name' in deps) ? deps.db_name : capabilities.db_name };
}

// What is saved of an entry: what Sync Details and the drawer read. The rows Sync Details marks up for its table
// (components/sync-details.js `details`: idx, status flags, sorted_statuses, toggled) are left out.
export function entry_copy(entry) {
  var copy = {};
  ['user_id', 'reason', 'manual', 'issues', 'errored', 'canceled', 'storage_failed', 'confirmed', 'finished', 'summary', 'roots'].forEach(function(k) {
    if(entry[k] !== undefined) { copy[k] = entry[k]; }
  });
  copy.statuses = (Array.isArray(entry.statuses) ? entry.statuses : []).filter(function(s) { return s && typeof s === 'object'; }).map(function(s) {
    var row = {};
    ['id', 'key', 'status', 'error', 'content', 'warning', 'refused'].forEach(function(k) { if(s[k] !== undefined) { row[k] = s[k]; } }); // content: utils/sync_rollup.js content_error; warning: note_warning (saved without its picture); refused: the walk's refusal (services/persistence.js)
    return row;
  });
  return copy;
}

// Every writer's new list goes through here (services/persistence.js and utils/persistence.js, where they set
// `sync_log`). Returns the list to keep in memory: the same entries, newest SYNC_LOG_KEEP. Saves copies when the
// signed-in person owns the open database. The save goes straight to device storage, not through
// persistence.store(), which counts a failed write against the running sync (utils/storage_failures.js); a failed
// save leaves the log in memory as before.
export function record_sync_log(persistence, log, deps) {
  var kept = (log || []).slice(-SYNC_LOG_KEEP);
  if(!persistence || persistence.isDestroyed || persistence.isDestroying) { return kept; }
  deps = defaults(deps);
  var owner = owner_for(persistence, deps);
  if(owner && deps.storage && typeof deps.storage.store === 'function') {
    var record = { raw: { owner: owner, entries: kept.map(entry_copy) }, storageId: SYNC_LOG_KEY, id: SYNC_LOG_KEY };
    try {
      RSVP.resolve(deps.storage.store('settings', record, SYNC_LOG_KEY)).then(null, function() { });
    } catch(e) { /* storage unavailable: the log stays in memory */ }
  }
  return kept;
}

function finished_at(entry) {
  var t = entry && entry.finished ? new Date(entry.finished).getTime() : NaN;
  return isNaN(t) ? null : t;
}

// Stored entries first (they are older than anything this session wrote), then the ones in memory; the same sync
// (user and finish time) only once; `finished` a Date again (the SQLite store keeps JSON, utils/dbman.js); the newest
// SYNC_LOG_KEEP. Entries already in memory are kept as they are.
export function merge_logs(stored, memory) {
  var seen = {};
  var out = [];
  var add = function(entry, from_store) {
    if(!entry || typeof entry !== 'object') { return; }
    var t = finished_at(entry);
    if(from_store && t === null) { return; }
    var id = (entry.user_id || '') + '|' + t;
    if(t !== null && seen[id]) { return; }
    seen[id] = true;
    if(from_store) {
      entry = entry_copy(entry);
      entry.finished = new Date(t);
    }
    out.push(entry);
  };
  (Array.isArray(stored) ? stored : []).forEach(function(e) { add(e, true); });
  (Array.isArray(memory) ? memory : []).forEach(function(e) { add(e, false); });
  return out.slice(-SYNC_LOG_KEEP);
}

// Read the saved log back, once per app start: only when the signed-in person owns the open database (a try before
// that, while the database is not set up yet, does not use up the one read), and only a record with that owner.
// A missing record or a failed read changes nothing.
export function restore_sync_log(persistence, deps) {
  if(!persistence || persistence._sync_log_restored) { return RSVP.resolve(); }
  deps = defaults(deps);
  var owner = owner_for(persistence, deps);
  if(!owner || !deps.storage || typeof deps.storage.find !== 'function') { return RSVP.resolve(); }
  persistence._sync_log_restored = true;
  return RSVP.resolve(deps.storage.find('settings', SYNC_LOG_KEY)).then(function(res) {
    var raw = (res && res.raw) || res;
    if(!raw || raw.owner !== owner || persistence.isDestroyed || persistence.isDestroying) { return; }
    persistence.set('sync_log', merge_logs(raw.entries, persistence.get('sync_log')));
    persistence.set('sync_log_rand', Math.random());
  }, function() { });
}

// The result the grouped view shows: the newest sync that FINISHED (with or without problems) and has rows. A failed
// or cancelled sync stopped part way, so its rows are partial; the cards stay on the sync before it, marked earlier.
export function last_result(log) {
  var list = Array.isArray(log) ? log : [];
  for(var i = list.length - 1; i >= 0; i--) {
    var e = list[i];
    if(e && !e.errored && !e.canceled && e.statuses && e.statuses.length) {
      return { entry: e, from_earlier: i < list.length - 1 };
    }
  }
  return null;
}

// What Sync Details shows when no sync has finished (last_result is null), such as a new account whose first sync
// failed: the newest sync that stopped (failed or cancelled) and has rows, and whether a later one came after it
// (Traci, 2026-11-16; docs/task-management/2026-11-16_sync-details-no-percent.md). Its rows are only the boards it
// reached, so the view says "Saved before the sync stopped" and claims nothing ready. A sync whose board writes failed
// (`storage_failed`, services/persistence.js) saved nothing it lists, so it is never this result.
export function partial_result(log) {
  var list = Array.isArray(log) ? log : [];
  for(var i = list.length - 1; i >= 0; i--) {
    var e = list[i];
    if(e && (e.errored || e.canceled) && e.confirmed && !e.storage_failed && e.statuses && e.statuses.length) { // confirmed: written only by the two stop paths, whose rows went through confirmed_statuses (services/persistence.js sync, end_canceled_sync); an entry the old code wrote, or a finished sync whose writes failed, has none
      return { entry: e, from_earlier: i < list.length - 1 };
    }
  }
  return null;
}

// How the last sync ended, for Sync Details' status line when no sync has run since the app started (sync_status is
// null then): 'canceled', 'errored', 'issues', or null for a clean one (the usual line).
export function restored_lead_kind(log) {
  var list = Array.isArray(log) ? log : [];
  var last = list[list.length - 1];
  if(!last) { return null; }
  if(last.canceled) { return 'canceled'; }
  if(last.errored) { return 'errored'; }
  if(last.issues) { return 'issues'; }
  return null;
}
