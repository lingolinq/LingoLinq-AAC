// The boards page while offline: "Boards on This Device" (docs/task-management/2026-11-16_offline-boards-page.md).
// Online, the page lists boards from the server; offline it had nothing to show once its 10-minute snapshot expired
// (utils/boards_page_list_cache.js), and said "You don't have any boards yet" though a sync had saved the boards.
// Offline it now lists every board a person can open from the device: what the sync saves for them (their home,
// sidebar and liked boards and Crisis Vocabulary, utils/offline_sync_seeds.js) and their own other boards, each
// with its folders inside it.
import RSVP from 'rsvp';
import capabilities from './capabilities';
import stashes from './_stashes';
import lingoLinqExtras from './extras';
import { is_revoked_raw } from './board_revocation';
import { offline_sync_seeds } from './offline_sync_seeds';
import { last_result } from './sync_log_store';

// The person whose device database is open, only when it is the signed-in person's (capabilities.setup_database
// names it from auth_settings at app start; an SPA sign-out can leave the previous person's open). Unknown is no:
// unlike services/persistence.js local_db_is_current_user, this read must never guess.
export function own_device_db_user(db_name, auth) {
  var match = (db_name || '').match(/^lingolinqStorage::(.*)===/);
  if(!match || !auth || !auth.user_name || match[1] !== auth.user_name) { return null; }
  return auth.user_name;
}

export function current_device_db_user() {
  return own_device_db_user(capabilities.db_name, stashes.get_object('auth_settings', true));
}

// The boards a board's buttons open that a person can actually follow: on the grid, not hidden, link not disabled.
export function followable_links(raw) {
  var on_grid = {};
  ((raw && raw.grid && raw.grid.order) || []).forEach(function(row) {
    (row || []).forEach(function(id) { if(id !== null && id !== undefined) { on_grid[String(id)] = true; } });
  });
  var links = [];
  ((raw && raw.buttons) || []).forEach(function(b) {
    if(!b || !b.load_board || b.hidden || b.link_disabled || !on_grid[String(b.id)]) { return; }
    links.push({ id: b.load_board.id, key: b.load_board.key });
  });
  return links;
}

var LIKED = { 'starred board': true, 'suggested board': true };

// Whether the last clean sync saw a board without an error (its log entry's statuses, by id or key).
function seen_by_last_sync(sync_log) {
  var found = last_result(sync_log || []);
  var ok = {};
  var failed = {};
  ((found && found.entry && found.entry.statuses) || []).forEach(function(s) {
    var mark = s.error ? failed : ok;
    if(s.id) { mark[s.id] = true; }
    if(s.key) { mark[s.key] = true; }
  });
  return function(raw) { return !!(ok[raw.id] || ok[raw.key]) && !failed[raw.id] && !failed[raw.key]; };
}

// The rows to list, in order, from the device rows ({data: {id, raw}}) for `user` (the page's person). Pure, so the
// rules are tested without a database:
// - the sync's seeds found on the device, in seed order (home, sidebar, liked), Crisis Vocabulary last; another
//   owner's liked board only if the last clean sync saw it without an error (not one unshared since);
// - then the person's own boards that none of those reaches, as sets: a board is a folder when a followable link from
//   a listed board (or from another of these) reaches it; a set that is all a cycle is listed by its first board by
//   key, so no set is left out. Sorted by name.
// Revoked boards are never listed.
export function pick_device_boards(rows, user, sync_log) {
  var by_id = {};
  var by_key = {};
  (rows || []).forEach(function(row) {
    var data = row && (row.data || row);
    var raw = data && data.raw;
    if(!raw || !raw.id || is_revoked_raw(raw)) { return; }
    by_id[raw.id] = raw;
    if(raw.key) { by_key[raw.key] = raw; }
  });
  var find = function(ref) { return (ref && ((ref.id && by_id[ref.id]) || (ref.key && by_key[ref.key]))) || null; };
  var user_name = user.get('user_name');
  var seen = seen_by_last_sync(sync_log);

  var picked = [];
  var listed = {};
  var take = function(raw) { if(raw && !listed[raw.id]) { listed[raw.id] = true; picked.push(raw); } };
  var crisis = null;
  offline_sync_seeds(user).forEach(function(seed) {
    var raw = find(seed);
    if(!raw) { return; }
    if(LIKED[seed.visit_source] && raw.user_name !== user_name && !seen(raw)) { return; }
    if(seed.visit_source === 'crisis vocabulary') { crisis = crisis || raw; return; }
    take(raw);
  });

  var reached = {};
  var walk = function(start) {
    var queue = [start];
    while(queue.length) {
      followable_links(queue.shift()).forEach(function(link) {
        var next = find(link);
        if(next && !reached[next.id]) { reached[next.id] = true; queue.push(next); }
      });
    }
  };
  picked.forEach(walk);
  if(crisis) { walk(crisis); }

  var own = Object.keys(by_id).map(function(id) { return by_id[id]; }).filter(function(raw) {
    return !listed[raw.id] && !reached[raw.id] && (!crisis || raw.id !== crisis.id) &&
      typeof raw.key === 'string' && raw.key.indexOf(user_name + '/') === 0;
  });
  var linked_from_own = {};
  own.forEach(function(raw) {
    followable_links(raw).forEach(function(link) {
      var next = find(link);
      if(next && next.id !== raw.id) { linked_from_own[next.id] = true; }
    });
  });
  var roots = own.filter(function(raw) { return !linked_from_own[raw.id]; });
  roots.forEach(walk);
  own.slice().sort(function(a, b) { return String(a.key).localeCompare(String(b.key)); }).forEach(function(raw) {
    if(roots.indexOf(raw) === -1 && !reached[raw.id]) { roots.push(raw); reached[raw.id] = true; walk(raw); }
  });
  roots.sort(function(a, b) { return String(a.name || a.key).localeCompare(String(b.name || b.key)); }).forEach(take);
  take(crisis);
  return picked;
}

// A list the page treats as finished, marked as from the device.
function device_list(records) {
  records.done = true;
  records.from_device = true;
  return records;
}

// The listed boards as store records. A record already in memory under the board's id is kept, so an older device
// copy never overwrites it. The read runs inside the promise chain, so a database that throws (a closing IndexedDB
// connection) gives an empty list, not an exception. `opts.storage` is passed in by tests; `opts.sync_log` is
// persistence's sync_log.
export function device_board_list(store, user, opts) {
  opts = opts || {};
  if(!store || !user || typeof user.get !== 'function' || !user.get('user_name')) { return RSVP.resolve(device_list([])); }
  var source = opts.storage || lingoLinqExtras.storage;
  return RSVP.resolve().then(function() { return source.find_all('board'); }).then(function(rows) {
    return device_list(pick_device_boards(rows, user, opts.sync_log).map(function(raw) {
      return store.peekRecord('board', raw.id) || store.push({ data: { id: raw.id, type: 'board', attributes: raw } });
    }));
  }, function() {
    return device_list([]);
  });
}
