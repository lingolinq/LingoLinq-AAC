import RSVP from 'rsvp';
import capabilities from './capabilities';
import lingoLinqExtras from './extras';

// Whether another owner's liked board may be listed in "Boards on This Device", kept per person beyond the 5-entry
// sync log (docs/task-management/2026-11-23_offline-liked-board-verdicts.md). The sync log keeps 5 entries for every
// sync on the device (utils/sync_log_store.js), so stopped, cancelled and other people's syncs used to push out the
// sync that decided a board, and the board dropped off the offline list.
//
// A verdict per token (a row's id and key): `false` (refused), `true` (the server really answered) or 'weak' (a whole
// sync reached it with no answer behind it), with `n`, the deciding sync's sequence number (sync_seq below). Merging
// is order-independent: two decisive verdicts, the higher `n` wins (a tie: `false`); a decisive verdict beats 'weak'.
// Maps have no prototype, so any user name or board key is a safe key.

export var VERDICT_CAP = 3000; // tokens kept per person
export var BOARD_VERDICTS_KEY = 'boardVerdicts';

function dict() { return Object.create(null); }

// A sync that went through its whole walk: not cancelled, not stopped part way (the stop paths write `confirmed`,
// services/persistence.js), and either clean or failed only on device writes (a finished sync with a failed write is
// `errored` and `storage_failed`, #1336).
export function walked_whole(e) {
  return !!(e && !e.canceled && !e.confirmed && (!e.errored || e.storage_failed) && e.statuses && e.statuses.length);
}

function finished_ms(e) {
  var t = e && e.finished ? new Date(e.finished).getTime() : NaN;
  return isNaN(t) ? null : t;
}

// The order of a sync entry: its `seq` (set when it was written, sync_seq), else its finish time (an entry from before
// `seq`), else `fallback` (its place in the log; only tests build entries without a finish time).
export function entry_order(e, fallback) {
  if(e && typeof e.seq === 'number') { return e.seq; }
  var t = finished_ms(e);
  return t !== null ? t : (fallback || 0);
}

// The sequence number for a new entry: its finish time, or one more than the highest already known, whichever is
// higher. A device clock that goes back cannot make a later sync count as earlier.
export function sync_seq(entry, log, by_user) {
  var top = 0;
  (log || []).forEach(function(e) { if(e && e !== entry) { top = Math.max(top, entry_order(e, 0)); } });
  Object.keys(by_user || {}).forEach(function(u) { var m = by_user[u]; if(m && m.top) { top = Math.max(top, m.top); } });
  var t = finished_ms(entry);
  return Math.max(t !== null ? t : 0, top + 1);
}

// This entry's verdicts. Clean rows of the person's own boards are left out (the list only checks other owners'
// boards); refusal rows are always kept (a link's stated key can name a different owner than its id).
export function entry_verdicts(entry, fallback) {
  var out = dict();
  if(!entry || !Array.isArray(entry.statuses)) { return out; }
  var n = entry_order(entry, fallback);
  var own = typeof entry.user_id === 'string' ? entry.user_id + '/' : null;
  var tokens = function(s) { return [s.id, s.key].filter(function(t) { return typeof t === 'string' && t; }); };
  var rows = entry.statuses.filter(function(s) { return s && typeof s === 'object'; });
  rows.forEach(function(s) { if(s.refused) { tokens(s).forEach(function(t) { out[t] = { v: false, n: n }; }); } });
  if(!walked_whole(entry)) { return out; }
  var answered = dict();
  (Array.isArray(entry.answered) ? entry.answered : []).forEach(function(t) { answered[t] = true; });
  rows.forEach(function(s) {
    if(s.refused || (s.error && !s.content)) { return; }
    if(own && typeof s.key === 'string' && s.key.indexOf(own) === 0) { return; }
    var real = s.status !== 'kept' && tokens(s).some(function(t) { return answered[t]; });
    tokens(s).forEach(function(t) {
      var prior = out[t];
      if(prior && prior.v === false) { return; } // in one entry a refusal wins
      if(real) { out[t] = { v: true, n: n }; } else if(!prior) { out[t] = { v: 'weak', n: n }; }
    });
  });
  return out;
}

function better(a, b) { // the verdict that stands of two for one token
  if(!a) { return b; }
  if(!b) { return a; }
  var da = a.v !== 'weak', db = b.v !== 'weak';
  if(da && db) { return a.n > b.n ? a : (b.n > a.n ? b : (a.v === false ? a : b)); }
  if(da) { return a; }
  if(db) { return b; }
  return a.n >= b.n ? a : b;
}

// One person's verdicts: `{ top, t }`, `t` token -> verdict, `top` the highest sequence number folded in.
function person(m) {
  var out = { top: 0, t: dict() };
  if(m && typeof m === 'object') {
    out.top = typeof m.top === 'number' ? m.top : 0;
    var t = m.t && typeof m.t === 'object' ? m.t : {};
    Object.keys(t).forEach(function(k) {
      var x = t[k];
      if(x && (x.v === true || x.v === false || x.v === 'weak') && typeof x.n === 'number') { out.t[k] = { v: x.v, n: x.n }; }
    });
  }
  return out;
}

function cap(p) {
  var keys = Object.keys(p.t);
  if(keys.length <= VERDICT_CAP) { return p; }
  // Drop weak verdicts first, then the oldest; on a tie keep refusals, then keys (a liked board is logged under its key).
  keys.sort(function(a, b) {
    var x = p.t[a], y = p.t[b];
    var wx = x.v === 'weak' ? 0 : 1, wy = y.v === 'weak' ? 0 : 1;
    if(wx !== wy) { return wx - wy; }
    if(x.n !== y.n) { return x.n - y.n; }
    var fx = x.v === false ? 1 : 0, fy = y.v === false ? 1 : 0;
    if(fx !== fy) { return fx - fy; } // on a tie an answer goes before a refusal, so the refusal still hides the board
    return (a.indexOf('/') === -1 ? 0 : 1) - (b.indexOf('/') === -1 ? 0 : 1);
  });
  keys.slice(0, keys.length - VERDICT_CAP).forEach(function(k) { delete p.t[k]; });
  return p;
}

export function merge_verdicts(a, b) {
  var pa = person(a && a.t ? a : (a ? { t: a } : null)), pb = person(b && b.t ? b : (b ? { t: b } : null));
  var out = { top: Math.max(pa.top, pb.top), t: dict() };
  [pa.t, pb.t].forEach(function(t) { Object.keys(t).forEach(function(k) { out.t[k] = better(out.t[k], t[k]); }); });
  Object.keys(out.t).forEach(function(k) { out.top = Math.max(out.top, out.t[k].n); });
  return cap(out);
}

// Folds one entry into the per-person map (user_id -> person), returning a new map with no prototype.
export function fold_entry(by_user, entry, fallback) {
  var out = merge_people(by_user, null);
  if(!entry || typeof entry.user_id !== 'string') { return out; }
  var v = entry_verdicts(entry, fallback);
  if(!Object.keys(v).length) { return out; }
  out[entry.user_id] = merge_verdicts(out[entry.user_id], { top: entry_order(entry, fallback), t: v });
  return out;
}

export function merge_people(a, b) {
  var out = dict();
  [a, b].forEach(function(m) {
    if(!m || typeof m !== 'object') { return; }
    Object.keys(m).forEach(function(u) { out[u] = out[u] ? merge_verdicts(out[u], m[u]) : merge_verdicts(m[u], null); });
  });
  return out;
}

// Whether the board (raw: id, key) may be listed: per board, the decisive verdict with the highest `n` across its id
// and key decides (a tie: `false`); with none, a 'weak' one lists it; else it was never seen.
export function board_seen(p, raw) {
  var t = p && p.t ? p.t : p;
  if(!t || !raw) { return false; }
  var best = null, weak = false;
  [raw.id, raw.key].forEach(function(k) {
    var x = typeof k === 'string' && Object.prototype.hasOwnProperty.call(t, k) ? t[k] : null;
    if(!x) { return; }
    if(x.v === 'weak') { weak = true; return; }
    if(!best || x.n > best.n || (x.n === best.n && x.v === false)) { best = x; }
  });
  return best ? best.v === true : weak;
}

// The person's verdicts as the list reads them: the kept map with their log entries folded in.
export function person_verdicts(by_user, sync_log, user_name) {
  var start = by_user && by_user[user_name] ? { [user_name]: by_user[user_name] } : null;
  var folded = merge_people(start, null);
  (sync_log || []).forEach(function(e, i) { if(e && e.user_id === user_name) { folded = fold_entry(folded, e, i + 1); } });
  return folded[user_name] || null;
}

// ---- saved on the device: settings/boardVerdicts {owner, verdicts}, for the owner of the open database only ----

function owner_of(persistence, db_name) {
  var stashes = persistence && persistence.get && persistence.get('stashes');
  var auth = stashes && typeof stashes.get_object === 'function' ? stashes.get_object('auth_settings', true) : null;
  var match = String(db_name || '').match(/^lingolinqStorage::(.*)===/);
  var db_user = match && match[1];
  var user_name = auth && auth.user_name;
  if(!db_user || db_user === '__' || !user_name || user_name !== db_user) { return null; }
  return user_name;
}

function defaults(deps) {
  deps = deps || {};
  return { storage: deps.storage || lingoLinqExtras.storage, db_name: ('db_name' in deps) ? deps.db_name : capabilities.db_name };
}

function no_record(err) { return !!(err && typeof err.error === 'string' && err.error.indexOf('no record') === 0); } // utils/dbman.js

function read_stored(storage, owner) {
  return RSVP.resolve(storage.find('settings', BOARD_VERDICTS_KEY)).then(function(res) {
    var raw = (res && res.raw) || res;
    return raw && raw.owner === owner ? merge_people(raw.verdicts, null) : dict();
  }, function(err) {
    return no_record(err) ? dict() : RSVP.reject(err);
  });
}

// Read the saved verdicts and merge them with this session's (order does not matter). Called from persistence setup
// beside restore_sync_log, in the same tick, so it is in before the dashboard's first device read.
export function restore_board_verdicts(persistence, deps) {
  deps = defaults(deps);
  var owner = owner_of(persistence, deps.db_name);
  if(!owner || !deps.storage || typeof deps.storage.find !== 'function') { return RSVP.resolve(); }
  return read_stored(deps.storage, owner).then(function(stored) {
    if(!persistence.isDestroyed && !persistence.isDestroying) {
      persistence.set('board_verdicts', merge_people(stored, persistence.get('board_verdicts')));
    }
  }, function() { });
}

// Fold a new log entry in and save: read the stored record, merge, write. Memory then holds the merged record (so a
// later sequence number is above the stored ones). A verdict not yet stored (a failed or skipped save, or one folded
// at restore: `_board_verdicts_unsaved`) is saved by the next sync even if that sync has no verdicts of its own.
// Nothing is written while nothing is unsaved.
export function record_board_verdicts(persistence, entry, log, deps) {
  if(!persistence || persistence.isDestroyed || persistence.isDestroying || !entry) { return RSVP.resolve(); }
  var mine = persistence.get('board_verdicts');
  if(typeof entry.seq !== 'number') { entry.seq = sync_seq(entry, log, mine); }
  if(Object.keys(entry_verdicts(entry)).length) {
    persistence.set('board_verdicts', fold_entry(mine, entry));
    persistence._board_verdicts_unsaved = true;
  }
  if(!persistence._board_verdicts_unsaved) { return RSVP.resolve(); }
  deps = defaults(deps);
  var owner = owner_of(persistence, deps.db_name);
  if(!owner || !deps.storage || typeof deps.storage.find !== 'function' || typeof deps.storage.store !== 'function') { return RSVP.resolve(); }
  var folded = persistence.get('board_verdicts');
  var saving = null, merged = null;
  // This person's map in memory, or null once they have signed out (services/app-state.js clear_user_state clears it) or
  // someone else has signed in: then nothing is read from or put back into memory.
  var live = function() { var m = persistence.get('board_verdicts'); return m && owner_of(persistence, deps.db_name) === owner ? m : null; };
  return read_stored(deps.storage, owner).then(function(stored) {
    saving = live(); // with what was folded while the read ran
    merged = merge_people(merge_people(stored, folded), saving);
    var record = { raw: { owner: owner, verdicts: merged }, storageId: BOARD_VERDICTS_KEY, id: BOARD_VERDICTS_KEY };
    return RSVP.resolve(deps.storage.store('settings', record, BOARD_VERDICTS_KEY));
  }).then(function() {
    var now = persistence.isDestroyed || persistence.isDestroying ? null : live();
    if(!now) { return; }
    persistence.set('board_verdicts', merge_people(merged, now));
    if(now === saving) { persistence._board_verdicts_unsaved = false; } // a fold during the write stays unsaved
  }, function() { });
}
