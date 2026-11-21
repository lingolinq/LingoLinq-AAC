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
import { library_board } from './board_device_copy';

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

// Whether this person's last clean sync saw a board without an error, and no later sync of theirs (finished or not)
// showed an error for it (by id or key). Only entries for `user_name` count (`user_id` is the synced person's user_name,
// services/persistence.js sync). A failed or cancelled sync logs only the boards it visited today; once the sync records
// its errors when it stops (the Sync Details rework), those hide the board here too.
// An error tagged `content` (the board was reached; a picture or sound did not save) is not a refusal: it neither hides
// the board nor counts against it.
function seen_by_last_sync(sync_log, user_name) {
  var mine = (sync_log || []).filter(function(e) { return e && e.user_id === user_name; });
  var found = last_result(mine);
  var ok = {};
  var failed = {};
  var mark = function(s, into) { if(s.id) { into[s.id] = true; } if(s.key) { into[s.key] = true; } };
  ((found && found.entry && found.entry.statuses) || []).forEach(function(s) { if(s) { mark(s, s.error && !s.content ? failed : ok); } });
  mine.slice(found ? mine.indexOf(found.entry) + 1 : mine.length).forEach(function(e) {
    (e.statuses || []).forEach(function(s) { if(s && s.error && !s.content) { mark(s, failed); } });
  });
  return function(raw) { return !!(ok[raw.id] || ok[raw.key]) && !failed[raw.id] && !failed[raw.key]; };
}

// On a device not marked "Trust this Device" (`opts.shared`), another owner's board cannot open offline
// (routes/user.js _device_owner), so only the boards that do are listed: those of the person whose device database
// this is (`opts.me`) and LingoLinq library boards (utils/board_device_copy.js library_board).
function opens_here(opts) {
  return function(raw) {
    if(!opts.shared) { return true; }
    var owner = typeof raw.key === 'string' ? raw.key.split('/')[0] : null;
    return (!!opts.me && owner === opts.me) || library_board(raw);
  };
}

// The rows to list, in order, from the device rows ({data: {id, raw}}) for `user` (the page's person). Pure, so the
// rules are tested without a database:
// - the sync's seeds found on the device, in seed order (home, sidebar, liked); Crisis Vocabulary in sidebar order
//   when the sidebar carries it, else last (Traci, 2026-11-16); another owner's liked board only if this person's
//   last clean sync saw it without an error (not one unshared since);
// - then the person's own boards that none of those reaches, as sets: a board is a folder when a followable link from
//   a listed board (or from another of these) reaches it; a set that is all a cycle is listed by its first board by
//   key, so no set is left out. Sorted by name.
// Revoked boards are never listed, and on a shared device only boards that open there (opens_here above).
export function pick_device_boards(rows, user, sync_log, opts) {
  opts = opts || {};
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
  var seen = seen_by_last_sync(sync_log, user_name);
  var opens = opens_here(opts);

  var picked = [];
  var listed = {};
  var take = function(raw) { if(raw && !listed[raw.id]) { listed[raw.id] = true; picked.push(raw); } };
  var crisis = null;
  offline_sync_seeds(user).forEach(function(seed) {
    var raw = find(seed);
    if(!raw || !opens(raw)) { return; }
    if(LIKED[seed.visit_source] && raw.user_name !== user_name && !seen(raw)) { return; }
    if(seed.visit_source === 'crisis vocabulary') { crisis = crisis || raw; return; }
    take(raw);
  });

  // The boards a board's followable links find on the device (nulls for those not there); the seed walk and the
  // grouping below both read links through this, so they cannot disagree.
  var next_of = function(raw) { return followable_links(raw).map(find); };
  var reached = {};
  var walk = function(start) {
    var queue = [start];
    while(queue.length) {
      next_of(queue.shift()).forEach(function(next) {
        if(next && !reached[next.id]) { reached[next.id] = true; queue.push(next); }
      });
    }
  };
  picked.forEach(walk);
  if(crisis) { walk(crisis); }

  // The person's own boards nothing listed reaches, as sets. The grouping sees every such board that opens here, own or
  // not: a link through another owner's board that opens makes an own board a folder; one that does not open (a device
  // not trusted, opens_here) reaches nothing, so the own boards behind it are listed.
  var rest = Object.keys(by_id).map(function(id) { return by_id[id]; }).filter(function(raw) {
    return !listed[raw.id] && !reached[raw.id] && (!crisis || raw.id !== crisis.id) && opens(raw);
  });
  var is_own = function(raw) { return typeof raw.key === 'string' && raw.key.indexOf(user_name + '/') === 0 && opens(raw); };
  entry_boards(rest, next_of, is_own)
    .sort(function(a, b) { return String(a.name || a.key).localeCompare(String(b.name || b.key)); }).forEach(take);
  take(crisis);
  return picked;
}

var by_key_order = function(a, b) { return String(a.key).localeCompare(String(b.key)); };

// The boards to list as sets, from `boards` (those nothing listed reaches) and `next_of(raw)` (the boards a board's
// followable links find; nulls allowed). Boards that open each other (a loop) form one group: an iterative Tarjan, so a
// long chain cannot overflow the stack, reading each board's links once. A group is an entry when it holds an own
// board (`is_own`) and no group above it does; it is listed by its first own board by key. So every own board is in an
// entry's set or below one, and no entry is inside another entry's set. Only own boards are ever returned.
export function entry_boards(boards, next_of, is_own) {
  var node = {};
  boards.forEach(function(raw) { node[raw.id] = { raw: raw, index: -1, low: 0, on_stack: false, group: null }; });
  var edges = {};
  boards.forEach(function(raw) {
    edges[raw.id] = (next_of(raw) || []).filter(function(next) { return next && node[next.id] && next.id !== raw.id; })
      .map(function(next) { return next.id; });
  });

  var groups = []; // Tarjan finishes a group only after every group below it
  var stack = [];
  var counter = 0;
  boards.forEach(function(start) {
    if(node[start.id].index !== -1) { return; }
    var frames = [{ id: start.id, i: 0 }];
    node[start.id].index = node[start.id].low = counter++;
    stack.push(start.id);
    node[start.id].on_stack = true;
    while(frames.length) {
      var frame = frames[frames.length - 1];
      var v = node[frame.id];
      var out = edges[frame.id];
      if(frame.i < out.length) {
        var w_id = out[frame.i++];
        var w = node[w_id];
        if(w.index === -1) {
          w.index = w.low = counter++;
          stack.push(w_id);
          w.on_stack = true;
          frames.push({ id: w_id, i: 0 });
        } else if(w.on_stack) {
          v.low = Math.min(v.low, w.index);
        }
        continue;
      }
      frames.pop();
      if(frames.length) {
        var parent = node[frames[frames.length - 1].id];
        parent.low = Math.min(parent.low, v.low);
      }
      if(v.low === v.index) {
        var group = { members: [], own_above: false };
        var m_id;
        do {
          m_id = stack.pop();
          node[m_id].on_stack = false;
          node[m_id].group = group;
          group.members.push(node[m_id].raw);
        } while(m_id !== frame.id);
        groups.push(group);
      }
    }
  });

  var entries = [];
  groups.reverse().forEach(function(group) { // top groups first, so all a group's parents are decided before it
    var own = group.members.filter(is_own);
    if(own.length && !group.own_above) { entries.push(own.sort(by_key_order)[0]); }
    if(!own.length && !group.own_above) { return; }
    group.members.forEach(function(raw) {
      edges[raw.id].forEach(function(id) { if(node[id].group !== group) { node[id].group.own_above = true; } });
    });
  });
  return entries;
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
// persistence's sync_log; `opts.shared` and `opts.me` are the shared-device rule (opens_here).
export function device_board_list(store, user, opts) {
  opts = opts || {};
  if(!store || !user || typeof user.get !== 'function' || !user.get('user_name')) { return RSVP.resolve(device_list([])); }
  var source = opts.storage || lingoLinqExtras.storage;
  return RSVP.resolve().then(function() { return source.find_all('board'); }).then(function(rows) {
    return device_list(pick_device_boards(rows, user, opts.sync_log, { shared: opts.shared, me: opts.me }).map(function(raw) {
      return store.peekRecord('board', raw.id) || store.push({ data: { id: raw.id, type: 'board', attributes: raw } });
    }));
  }, function() {
    var none = device_list([]);
    none.read_failed = true; // the pages keep an earlier list over this one
    return none;
  });
}
