import RSVP from 'rsvp';
import LingoLinq from '../app';
import lingoLinqExtras from './extras';
import app_state from './app_state';

// Offline copies of boards a synced user can no longer view.
//
// The server's board_revisions endpoint (include_revoked=1) lists the board ids
// that exist but that user can no longer view. After a sync of the root user AND
// every supervisee has fully succeeded, a locally stored board the root user has
// lost access to (a verdict that counts supervisee access) and that no synced
// user lists as viewable is MARKED (raw.revoked = true on its local record). Nothing is ever deleted, and the mark is cleared again by the next
// successful sync that no longer reports the board, or by a re-download.
//
// Never acted on: a failed or timed-out revisions request, a response without
// the revoked list (an older server), a supervisee sync that failed, a canceled
// sync, or a sync that finished with board errors. While Speak Mode is on, new
// marks wait until it is turned off, so the board in use is never pulled away.
// A mark is not written over a board downloaded again, or shown as viewable by
// the server, after the verdict it came from was asked for.
//
// Marked boards are skipped by the sync traversal (they are not sync errors)
// and left out of find_recent and find_boards; a home or sidebar board is never
// marked. The board routes (routes/board.js, and the Basic and Modern views under
// routes/user/) block one only while offline and never in Speak Mode, nor a home
// or sidebar board of the signed-in, referenced or synced users; online, they ask
// the server, and a forced reload the server answered (legacy and Basic board
// pages) clears the mark. Any successful board_revisions response that lists a
// marked board as viewable clears it too, whatever else the sync ends with.

var INDEX_KEY = 'revokedBoards';
var deferred_marks = null;
// The decision guard (see decision_guard) the held-back marks were made under.
var deferred_guard = null;
var index_promise = null;
// Board id => the tick at which the server last showed this board as viewable.
var shown_at = {};
// Orders verdicts and server answers within this session (see superseded). A
// counter, not the clock: both often land in the same millisecond.
var clock = 0;

function tick() {
  clock += 1;
  return clock;
}

function progress_for(persist) {
  try {
    return (persist && typeof persist.get === 'function') ? persist.get('sync_progress') : null;
  } catch(e) {
    return null;
  }
}

function state_for(persist) {
  var progress = progress_for(persist);
  if(!progress) { return null; }
  progress.revocation = progress.revocation || {users: {}, expected: null, root: null, failed: false, local: null};
  return progress.revocation;
}

function in_speak_mode() {
  try {
    return !!(app_state && app_state.get && app_state.get('speak_mode'));
  } catch(e) {
    return false;
  }
}

function global_board_id(id) {
  return !!(id && typeof id === 'string' && id.match(/^\d+_\d+/));
}

// Accepts the wrapped include_revoked response or the older flat id => revision
// map. revoked_ids is null when the response did not carry a revoked list.
export function parse_revisions_response(res) {
  if(res && typeof res === 'object' && res.revisions && typeof res.revisions === 'object' && Array.isArray(res.revoked_ids)) {
    return {revisions: res.revisions, revoked_ids: res.revoked_ids.filter(global_board_id)};
  }
  return {revisions: res, revoked_ids: null};
}

// Storage calls can come back as a plain thenable (capabilities' mini_promise, as the
// sync test harness's storage stubs return) rather than an RSVP promise. A mini_promise
// does not adopt a promise returned from its callback, so a rejection chained on it went
// unhandled; RSVP.resolve adopts any thenable.
function stored(result) {
  return RSVP.resolve(result);
}

// A snapshot of the locally stored boards: only what a decision reads (id, key,
// mark, and the revision a later write is checked against), never the board
// content, since the sync keeps the snapshot until it finishes.
function local_boards() {
  return stored(lingoLinqExtras.storage.find_all('board')).then(function(list) {
    var res = [];
    (list || []).forEach(function(item) {
      var data = item && item.data;
      if(data && data.id && data.raw) {
        res.push({id: data.raw.id || data.id, key: data.raw.key || data.key, revoked: !!data.raw.revoked, revision: data.raw.current_revision});
      }
    });
    return res;
  }, function() {
    return null;
  });
}

function load_index() {
  if(!index_promise) {
    index_promise = stored(lingoLinqExtras.storage.find('settings', INDEX_KEY)).then(function(rec) {
      var ids = {};
      ((rec && rec.raw && rec.raw.ids) || []).forEach(function(id) { ids[id] = true; });
      return ids;
    }, function() {
      return {};
    });
  }
  return index_promise;
}

function save_index(ids) {
  var list = Object.keys(ids);
  index_promise = RSVP.resolve(ids);
  return stored(lingoLinqExtras.storage.store('settings', {raw: {ids: list}, storageId: INDEX_KEY, id: INDEX_KEY})).then(null, function() { });
}

// Fetches board_revisions for one synced user and records what it says about
// revoked boards. Resolves with the flat id => revision map the sync code has
// always used; a rejection is passed through untouched.
export function fetch_revisions(persist, user, request) {
  var user_id = user.get('id');
  var state = state_for(persist);
  var progress = progress_for(persist);
  if(state && progress && progress.root_user == user_id && !state.root) {
    state.root = user_id;
    // Anything the server says about a board after this moment postdates the
    // root user's verdict (see decision_guard).
    state.decided_at = tick();
    state.expected = [user_id].concat((user.get('supervisees') || []).map(function(s) { return s && s.id; }).filter(function(id) { return !!id; }));
  }
  var prep = RSVP.resolve(null);
  if(state) {
    state.local = state.local || local_boards().then(function(list) {
      return {list: list};
    });
    prep = state.local;
  }
  // The request does not wait for the local scan; the scan never rejects. A
  // request that throws rejects, as it did when it ran inside a then().
  var response = new RSVP.Promise(function(resolve) {
    resolve(request({type: 'GET', data: {include_revoked: '1'}}));
  });
  return RSVP.all([prep, response]).then(function(results) {
    var local = results[0];
    var parsed = parse_revisions_response(results[1]);
    // Only the wrapped response comes from a server that checks permissions, so
    // only it is evidence that a listed board is viewable.
    var cleared = (parsed.revoked_ids && local && local.list) ? clear_viewable(local.list, parsed.revisions) : RSVP.resolve(false);
    if(state) {
      if(parsed.revoked_ids && local && local.list) {
        var lookup = {};
        var keys = {};
        parsed.revoked_ids.forEach(function(id) { lookup[id] = true; });
        local.list.forEach(function(rec) {
          if(lookup[rec.id] && rec.key) {
            lookup[rec.key] = true;
            keys[rec.id] = rec.key;
          }
        });
        var viewable = {};
        Object.keys(parsed.revisions).forEach(function(ref) { viewable[ref] = true; });
        state.users[user_id] = {revoked: parsed.revoked_ids, lookup: lookup, keys: keys, viewable: viewable};
      } else {
        state.failed = true;
      }
    }
    return cleared.then(function() { return parsed.revisions; }, function() { return parsed.revisions; });
  }, function(err) {
    if(state) { state.failed = true; }
    return RSVP.reject(err);
  });
}

// True when the sync traversal should pass over this board for this user: the
// server already said the user cannot view it, so looking it up would only
// produce a "Not authorized" sync error.
//
// A home or sidebar board is never skipped: the board route keeps showing it (see
// protected_board_refs), so the sync still tries it and, if it loads, its subtree.
// Skipping any other board only skips what is reachable through it alone; a child
// that another path reaches is visited from that path.
var ROOT_SOURCES = {'home board': true, 'sidebar board': true};
export function skip_board(persist, user_id, next) {
  var state = state_for(persist);
  var entry = state && state.users[user_id];
  if(!entry || !next) { return false; }
  if(ROOT_SOURCES[next.visit_source]) { return false; }
  return !!((next.id && entry.lookup[next.id]) || (next.key && entry.lookup[next.key]));
}

// Called when a supervisee's sync failed (the failure is otherwise swallowed).
export function note_failure(persist) {
  var state = state_for(persist);
  if(state) { state.failed = true; }
}

// The ids the root user has lost access to that no synced user lists as
// viewable (by id or key), or null when the sync does not qualify (anything
// short of a full, error-free sync of every synced user). The root user's
// verdict already counts supervisee access (board_caching
// update_available_boards). Each user's revoked list covers only that user's
// own synced tree, so a board missing from a supervisee's response is no
// evidence either way.
export function settled_revocations(progress, root_user_id, errors) {
  var decision = settled_decision(progress, root_user_id, errors);
  return decision ? decision.ids : null;
}

// settled_revocations with what applying it needs: when the root user's verdict
// was asked for, and the local snapshot the verdict was matched against.
export function settled_decision(progress, root_user_id, errors) {
  var state = progress && progress.revocation;
  if(!state || state.failed || progress.canceled || (errors && errors.length > 0)) { return null; }
  if(!state.root || state.root != root_user_id || !state.expected || state.expected.length === 0) { return null; }
  var entries = [];
  for(var idx = 0; idx < state.expected.length; idx++) {
    var entry = state.users[state.expected[idx]];
    if(!entry) { return null; }
    entries.push(entry);
  }
  var root = state.users[state.root];
  var ids = root.revoked.filter(function(id) {
    var key = root.keys[id];
    return !entries.some(function(e) { return e.viewable[id] || (key && e.viewable[key]); });
  });
  return {ids: ids, at: state.decided_at, local: state.local};
}

// What a settled decision's marks are checked against when they are written:
// the time the verdict was asked for, and each board's revision in the
// snapshot the verdict was matched against. null without a decision.
function decision_guard(decision) {
  if(!decision) { return RSVP.resolve(null); }
  return RSVP.resolve(decision.local).then(function(local) {
    var revisions = {};
    ((local && local.list) || []).forEach(function(rec) { revisions[rec.id] = rec.revision; });
    return {at: decision.at, revisions: revisions};
  }, function() {
    return {at: decision.at, revisions: {}};
  });
}

// True when something newer than the decision happened to the board: the
// server showed it as viewable, or a download changed its revision.
function superseded(id, raw, guard) {
  if(!guard) { return false; }
  if(shown_at[id] && guard.at && shown_at[id] > guard.at) { return true; }
  return Object.prototype.hasOwnProperty.call(guard.revisions, id) && raw.current_revision !== guard.revisions[id];
}

// Sets or clears the mark on the CURRENT stored record. rec may be a snapshot
// taken earlier in the sync (state.local is read once and reused across
// supervisees), so the record is re-read here and only raw.revoked changes:
// writing the snapshot back would undo a board downloaded in the meantime. A
// mark made under a decision guard is not written over anything newer than
// that decision (superseded).
function write_mark(rec, revoked, guard) {
  return stored(lingoLinqExtras.storage.find('board', rec.id)).then(function(current) {
    if(!current || !current.raw) { return false; }
    if(revoked && superseded(rec.id, current.raw, guard)) { return false; }
    var raw = Object.assign({}, current.raw);
    if(revoked) {
      raw.revoked = true;
    } else {
      delete raw.revoked;
    }
    var record = Object.assign({}, current, {raw: raw});
    return stored(lingoLinqExtras.storage.store('board', record)).then(function() { return true; }, function() { return false; });
  }, function() { return false; });
}

// A successful board_revisions response is evidence enough to clear: any
// marked board it lists as viewable (by id or key) is unmarked straight away,
// even when the rest of the sync fails.
function clear_viewable(list, revisions) {
  if(!revisions || typeof revisions !== 'object') { return RSVP.resolve(false); }
  var at = tick();
  (list || []).forEach(function(rec) {
    if((rec.id && revisions[rec.id]) || (rec.key && revisions[rec.key])) { shown_at[rec.id] = at; }
  });
  var clear = (list || []).filter(function(rec) {
    return rec.revoked && ((rec.id && revisions[rec.id]) || (rec.key && revisions[rec.key]));
  });
  if(deferred_marks) {
    deferred_marks = deferred_marks.filter(function(id) {
      return !(revisions[id] || (list || []).some(function(rec) { return rec.id == id && rec.key && revisions[rec.key]; }));
    });
  }
  if(clear.length === 0) { return RSVP.resolve(false); }
  clear.forEach(function(rec) { rec.revoked = false; });
  return load_index().then(function(index) {
    var next = Object.assign({}, index);
    return RSVP.all(clear.map(function(rec) {
      delete next[rec.id];
      return write_mark(rec, false);
    })).then(function() { return save_index(next); }).then(function() { return true; });
  }).then(null, function() { return false; });
}

// The board route loaded this board from the server: clear its mark, if any.
export function clear_mark(id) {
  if(!global_board_id(id)) { return RSVP.resolve(false); }
  shown_at[id] = tick();
  if(deferred_marks) {
    deferred_marks = deferred_marks.filter(function(d) { return d != id; });
  }
  return load_index().then(function(index) {
    if(!index[id]) { return false; }
    return stored(lingoLinqExtras.storage.find('board', id)).then(function(rec) {
      if(!rec || !rec.raw) { return false; }
      return clear_viewable([{id: rec.raw.id || rec.id, key: rec.raw.key, revoked: !!rec.raw.revoked}], {[id]: true});
    }, function() { return false; });
  }, function() { return false; });
}

// A home or sidebar board (protected_board_refs) is never blocked, so it is
// never marked either: a mark would only drop it from find_recent.
function spared(refs, rec) {
  return !!(refs[rec.id] || (rec.key && refs[rec.key]));
}

// Brings the local marks in line with a settled decision: boards in revoked_ids
// are marked (deferred while Speak Mode is on), every other marked board, and
// any home or sidebar board, is cleared. With a decision (settled_decision),
// a mark is not written over anything newer than it (superseded).
export function apply_revocations(revoked_ids, decision) {
  var lookup = {};
  (revoked_ids || []).forEach(function(id) { lookup[id] = true; });
  return RSVP.all([local_boards(), load_index(), decision_guard(decision)]).then(function(res) {
    var list = res[0];
    var index = Object.assign({}, res[1]);
    var guard = res[2];
    if(!list) { return null; }
    var refs = protected_board_refs(app_state);
    var writes = [];
    var to_mark = [];
    list.forEach(function(rec) {
      var revoke = lookup[rec.id] && !spared(refs, rec);
      if(rec.revoked && !revoke) {
        writes.push(write_mark(rec, false));
        delete index[rec.id];
      } else if(!rec.revoked && revoke) {
        to_mark.push(rec.id);
      } else if(rec.revoked) {
        index[rec.id] = true;
      }
    });
    Object.keys(index).forEach(function(id) {
      if(!lookup[id]) { delete index[id]; }
    });
    if(in_speak_mode()) {
      deferred_marks = to_mark;
      deferred_guard = guard;
      return RSVP.all(writes).then(function() { return save_index(index); });
    }
    deferred_marks = null;
    deferred_guard = null;
    list.forEach(function(rec) {
      if(to_mark.indexOf(rec.id) !== -1) {
        writes.push(write_mark(rec, true, guard).then(function(ok) {
          if(ok) { index[rec.id] = true; }
        }));
      }
    });
    return RSVP.all(writes).then(function() { return save_index(index); });
  });
}

// Root completion hook: snapshot the settled decision now (sync_progress is
// cleared right after) and apply it in the background.
export function finish_sync(persist, root_user_id, errors) {
  var decision = settled_decision(progress_for(persist), root_user_id, errors);
  if(decision) {
    settle(decision).then(null, function() { });
  }
  return decision ? decision.ids : null;
}

// Applies a settled decision.
export function settle(decision) {
  return apply_revocations(decision.ids, decision);
}

export function has_deferred() {
  return !!(deferred_marks && deferred_marks.length > 0);
}

// Applies marks held back while Speak Mode was on.
export function flush_deferred() {
  if(!has_deferred() || in_speak_mode()) { return RSVP.resolve(false); }
  var ids = deferred_marks;
  var guard = deferred_guard;
  deferred_marks = null;
  deferred_guard = null;
  return RSVP.all([local_boards(), load_index()]).then(function(res) {
    var list = res[0] || [];
    var index = Object.assign({}, res[1]);
    var refs = protected_board_refs(app_state);
    var writes = [];
    list.forEach(function(rec) {
      if(!rec.revoked && ids.indexOf(rec.id) !== -1 && !spared(refs, rec)) {
        writes.push(write_mark(rec, true, guard).then(function(ok) {
          if(ok) { index[rec.id] = true; }
        }));
      }
    });
    return RSVP.all(writes).then(function() { return save_index(index); }).then(function() { return true; });
  });
}

export function is_revoked_raw(raw) {
  return !!(raw && raw.revoked);
}

// Whether a locally stored board carries the mark. The index keeps this cheap:
// only a board listed there costs a record read.
export function is_revoked(id) {
  if(!global_board_id(id)) { return RSVP.resolve(false); }
  return load_index().then(function(index) {
    if(!index[id]) { return false; }
    return stored(lingoLinqExtras.storage.find('board', id)).then(function(rec) {
      return is_revoked_raw(rec && rec.raw);
    }, function() {
      return false;
    });
  }, function() {
    return false;
  });
}

// find_boards filter: drops ids of marked boards.
export function without_revoked(ids) {
  var list = ids || [];
  return RSVP.all(list.map(function(id) { return is_revoked(id); })).then(function(flags) {
    return list.filter(function(id, idx) { return !flags[idx]; });
  }, function() {
    return list;
  });
}

// Home and sidebar boards of the signed-in, current, referenced and Speak Mode
// users, and the home boards of synced supervisees: never blocked, so a
// communicator is never left without their own boards.
export function protected_board_refs(appState) {
  var refs = {};
  if(!appState || typeof appState.get !== 'function') { return refs; }
  var add = function(ref) {
    if(ref && (typeof ref === 'string' || typeof ref === 'number')) { refs[ref] = true; }
  };
  ['sessionUser', 'currentUser', 'referenced_user', 'speakModeUser'].forEach(function(name) {
    var home = appState.get(name + '.preferences.home_board');
    if(home) { add(home.id); add(home.key); }
    (appState.get(name + '.preferences.sidebar_boards') || []).forEach(function(b) {
      if(b) { add(b.id); add(b.key); }
    });
    (appState.get(name + '.supervisees') || []).forEach(function(sup) {
      if(sup) { add(sup.home_board_key); }
    });
  });
  return refs;
}

// Whether a marked board is blocked: only while offline, never in Speak Mode,
// never the board already on screen, and never a protected home or sidebar
// board. Online, the route asks the server instead. The board routes call it
// through blocks_view_route, which adds the session guards.
export function blocks_route(board, appState, online) {
  if(online) { return RSVP.resolve(false); }
  var id = board && typeof board.get === 'function' ? board.get('id') : null;
  var key = board && typeof board.get === 'function' ? board.get('key') : null;
  if(!id || !appState || typeof appState.get !== 'function') { return RSVP.resolve(false); }
  if(appState.get('speak_mode')) { return RSVP.resolve(false); }
  var current = appState.get('currentBoardState.id');
  if(current && current == id) { return RSVP.resolve(false); }
  var refs = protected_board_refs(appState);
  if(refs[id] || (key && refs[key])) { return RSVP.resolve(false); }
  return is_revoked(id);
}

// The server's "Not authorized" body, wherever the transport left it.
export function denial_body(err) {
  if(!err || typeof err !== 'object') { return null; }
  var candidates = [err, err.error, err.result, err.fakeXHR && err.fakeXHR.responseJSON, err.errors && err.errors[0], err.payload];
  for(var idx = 0; idx < candidates.length; idx++) {
    var c = candidates[idx];
    if(c && typeof c === 'object' && c.unauthorized === true) { return c; }
  }
  return null;
}

// A real, current refusal to show this board to this user: a 400 "Not
// authorized" for the view permission. Valet, device-scope and scope-limited
// refusals, token problems, timeouts and server errors are not.
export function real_denial(err) {
  var body = denial_body(err);
  if(!body) { return false; }
  var status_400 = (err.fakeXHR && err.fakeXHR.status == 400) || body.status == 400;
  if(!status_400 || body.error !== 'Not authorized' || body.permission !== 'view') { return false; }
  return !(body.valet_blocked || body.device_scopes_none || body.scope_limited || body.invalid_token);
}

// The board route may refuse its local copy only when the signed-in user is
// acting as themselves: the server's denial for that user already counts
// supervisee access (board_caching update_available_boards). Anything less
// certain keeps today's fallback to the local copy.
export function route_refuses_local(err, appState, board) {
  if(!real_denial(err)) { return false; }
  // A home or sidebar board keeps its local copy, as blocks_route spares it.
  var id = board && typeof board.get === 'function' ? board.get('id') : null;
  var key = board && typeof board.get === 'function' ? board.get('key') : null;
  var refs = protected_board_refs(appState);
  if((id && refs[id]) || (key && refs[key])) { return false; }
  // Speak Mode keeps the local copy, as before: the communicator keeps a voice.
  if(appState && typeof appState.get === 'function' && appState.get('speak_mode')) { return false; }
  return acting_as_self(appState);
}

// The signed-in user is loaded and is acting as themselves. Before the session
// user loads, protected_board_refs cannot see their home and sidebar boards;
// while acting as another user, neither a mark nor a denial speaks for the
// person whose boards are on screen.
function acting_as_self(appState) {
  var as_user = LingoLinq.session && typeof LingoLinq.session.get === 'function' && LingoLinq.session.get('as_user_id');
  var session_user = appState && typeof appState.get === 'function' ? appState.get('sessionUser') : null;
  return !(as_user || !session_user);
}

// blocks_route for every board route (routes/board.js and the Basic and Modern
// views under routes/user/), with the guards route_refuses_local applies: never
// while acting as another user, and never before the session user is loaded.
export function blocks_view_route(board, appState, online) {
  if(online || !acting_as_self(appState)) { return RSVP.resolve(false); }
  return blocks_route(board, appState, online);
}

// The unavailable-board record a blocked board route resolves with: its error
// renders as the standard unavailable-board panel in templates/board.hbs, the
// template routes/board.js and the Basic view (routes/user/board-alt.js) share.
// No id: a second fixed 'bad' id in one session would collide in the store, and
// an id-less record is already not a valid_id board. One record per route is
// reused for every blocked visit, so repeated visits do not pile up records.
export function unavailable_record(route, key) {
  var res = route.get('revoked_placeholder');
  if(!res || res.get('isDestroyed') || res.get('isDestroying')) {
    res = LingoLinq.store.createRecord('board', {key: key});
    route.set('revoked_placeholder', res);
  } else {
    res.set('key', key);
    res.set('retrying', undefined);
  }
  res.set('lookup_key', key);
  res.set('error', {error: 'Not authorized', unauthorized: true, revoked: true});
  route.set('error_record', res);
  return res;
}

// A board page's online reload: reload(force_fetch), then clear the board's
// mark when the server itself answered. reload(true) also resolves with the
// LOCAL copy on a 5xx, a dropped connection, a 401 or an invalid token
// (services/persistence.js, the find error handler). Only a genuine server
// response stamps `retrieved` with the time it arrived, so only a record
// retrieved after the reload started is evidence the board is viewable.
export function reload_from_server(model, force_fetch) {
  var started = (new Date()).getTime();
  return model.reload(force_fetch).then(function(loaded) {
    if(force_fetch && loaded && typeof loaded.get === 'function' && loaded.get('retrieved') >= started) {
      var done = function() { return loaded; };
      return clear_mark(loaded.get('id')).then(done, done);
    }
    return loaded;
  });
}

// After that reload failed: fall back to the local copy, unless the server
// refused this board (route_refuses_local). Offline, timeouts, server errors
// and ambiguous refusals keep the fallback.
export function local_copy_unless_denied(model, err, appState) {
  if(route_refuses_local(err, appState, model)) {
    return RSVP.reject(denial_body(err));
  }
  return model.reload(false);
}

// Test hook: forget module state between tests.
export function reset_for_tests() {
  deferred_marks = null;
  deferred_guard = null;
  shown_at = {};
  index_promise = null;
}

export default {
  parse_revisions_response: parse_revisions_response,
  fetch_revisions: fetch_revisions,
  skip_board: skip_board,
  note_failure: note_failure,
  settled_revocations: settled_revocations,
  settled_decision: settled_decision,
  settle: settle,
  apply_revocations: apply_revocations,
  finish_sync: finish_sync,
  has_deferred: has_deferred,
  flush_deferred: flush_deferred,
  is_revoked_raw: is_revoked_raw,
  is_revoked: is_revoked,
  without_revoked: without_revoked,
  blocks_route: blocks_route,
  blocks_view_route: blocks_view_route,
  protected_board_refs: protected_board_refs,
  clear_mark: clear_mark,
  denial_body: denial_body,
  real_denial: real_denial,
  route_refuses_local: route_refuses_local,
  unavailable_record: unavailable_record,
  reload_from_server: reload_from_server,
  local_copy_unless_denied: local_copy_unless_denied,
  reset_for_tests: reset_for_tests
};
