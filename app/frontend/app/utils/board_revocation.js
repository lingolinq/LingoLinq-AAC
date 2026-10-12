import RSVP from 'rsvp';
import LingoLinq from '../app';
import lingoLinqExtras from './extras';
import app_state from './app_state';

// Offline copies of boards a synced user can no longer view.
//
// The server's board_revisions endpoint (include_revoked=1) lists the board ids
// that exist but that user can no longer view. After a sync of the root user AND
// every supervisee has fully succeeded, a locally stored board that every one of
// those users has lost access to is MARKED (raw.revoked = true on its local
// record). Nothing is ever deleted, and the mark is cleared again by the next
// successful sync that no longer reports the board, or by a re-download.
//
// Never acted on: a failed or timed-out revisions request, a response without
// the revoked list (an older server), a supervisee sync that failed, a canceled
// sync, or a sync that finished with board errors. While Speak Mode is on, new
// marks wait until it is turned off, so the board in use is never pulled away.
//
// Marked boards are skipped by the sync traversal (they are not sync errors),
// left out of find_recent and find_boards, and blocked by the board route.

var MAX_CHECK_IDS = 500;
var INDEX_KEY = 'revokedBoards';
var deferred_marks = null;
var index_promise = null;

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

// Local board ids sent as check_ids: boards already marked come first, so a
// marked board is always re-checked and can be cleared.
export function check_ids_for(local, marked_ids) {
  var res = [];
  var seen = {};
  var add = function(id) {
    if(global_board_id(id) && !seen[id] && res.length < MAX_CHECK_IDS) {
      seen[id] = true;
      res.push(id);
    }
  };
  (marked_ids || []).forEach(add);
  (local || []).forEach(function(rec) { add(rec.id); });
  return res;
}

function local_boards() {
  return lingoLinqExtras.storage.find_all('board').then(function(list) {
    var res = [];
    (list || []).forEach(function(item) {
      var data = item && item.data;
      if(data && data.id && data.raw) {
        res.push({id: data.raw.id || data.id, key: data.raw.key || data.key, revoked: !!data.raw.revoked, data: data});
      }
    });
    return res;
  }, function() {
    return null;
  });
}

function load_index() {
  if(!index_promise) {
    index_promise = lingoLinqExtras.storage.find('settings', INDEX_KEY).then(function(rec) {
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
  return lingoLinqExtras.storage.store('settings', {raw: {ids: list}, storageId: INDEX_KEY, id: INDEX_KEY}).then(null, function() { });
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
    state.expected = [user_id].concat((user.get('supervisees') || []).map(function(s) { return s && s.id; }).filter(function(id) { return !!id; }));
  }
  var prep = RSVP.resolve(null);
  if(state) {
    state.local = state.local || RSVP.all([local_boards(), load_index()]).then(function(res) {
      return {list: res[0], check_ids: check_ids_for(res[0], Object.keys(res[1] || {}))};
    });
    prep = state.local;
  }
  return prep.then(function(local) {
    var check_ids = (local && local.check_ids) || [];
    return request({type: 'GET', data: {include_revoked: '1', check_ids: check_ids.join(',')}}).then(function(res) {
      var parsed = parse_revisions_response(res);
      if(state) {
        if(parsed.revoked_ids && local && local.list) {
          var lookup = {};
          parsed.revoked_ids.forEach(function(id) { lookup[id] = true; });
          local.list.forEach(function(rec) {
            if(lookup[rec.id] && rec.key) { lookup[rec.key] = true; }
          });
          state.users[user_id] = {revoked: parsed.revoked_ids, lookup: lookup};
        } else {
          state.failed = true;
        }
      }
      return parsed.revisions;
    }, function(err) {
      if(state) { state.failed = true; }
      return RSVP.reject(err);
    });
  });
}

// True when the sync traversal should pass over this board for this user: the
// server already said the user cannot view it, so looking it up would only
// produce a "Not authorized" sync error.
export function skip_board(persist, user_id, next) {
  var state = state_for(persist);
  var entry = state && state.users[user_id];
  if(!entry || !next) { return false; }
  return !!((next.id && entry.lookup[next.id]) || (next.key && entry.lookup[next.key]));
}

// Called when a supervisee's sync failed (the failure is otherwise swallowed).
export function note_failure(persist) {
  var state = state_for(persist);
  if(state) { state.failed = true; }
}

// The ids every synced user has lost access to, or null when the sync does not
// qualify (anything short of a full, error-free sync of every synced user).
export function settled_revocations(progress, root_user_id, errors) {
  var state = progress && progress.revocation;
  if(!state || state.failed || progress.canceled || (errors && errors.length > 0)) { return null; }
  if(!state.root || state.root != root_user_id || !state.expected || state.expected.length === 0) { return null; }
  var lists = [];
  for(var idx = 0; idx < state.expected.length; idx++) {
    var entry = state.users[state.expected[idx]];
    if(!entry) { return null; }
    lists.push(entry.revoked);
  }
  return lists[0].filter(function(id) {
    return lists.every(function(list) { return list.indexOf(id) !== -1; });
  });
}

function write_mark(rec, revoked) {
  var raw = Object.assign({}, rec.data.raw);
  if(revoked) {
    raw.revoked = true;
  } else {
    delete raw.revoked;
  }
  var record = Object.assign({}, rec.data, {raw: raw});
  return lingoLinqExtras.storage.store('board', record).then(function() { return true; }, function() { return false; });
}

// Brings the local marks in line with a settled decision: boards in revoked_ids
// are marked (deferred while Speak Mode is on), every other marked board is
// cleared.
export function apply_revocations(revoked_ids) {
  var lookup = {};
  (revoked_ids || []).forEach(function(id) { lookup[id] = true; });
  return RSVP.all([local_boards(), load_index()]).then(function(res) {
    var list = res[0];
    var index = Object.assign({}, res[1]);
    if(!list) { return null; }
    var writes = [];
    var to_mark = [];
    list.forEach(function(rec) {
      if(rec.revoked && !lookup[rec.id]) {
        writes.push(write_mark(rec, false));
        delete index[rec.id];
      } else if(!rec.revoked && lookup[rec.id]) {
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
      return RSVP.all(writes).then(function() { return save_index(index); });
    }
    deferred_marks = null;
    list.forEach(function(rec) {
      if(to_mark.indexOf(rec.id) !== -1) {
        writes.push(write_mark(rec, true).then(function(ok) {
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
  var ids = settled_revocations(progress_for(persist), root_user_id, errors);
  if(ids) {
    apply_revocations(ids).then(null, function() { });
  }
  return ids;
}

export function has_deferred() {
  return !!(deferred_marks && deferred_marks.length > 0);
}

// Applies marks held back while Speak Mode was on.
export function flush_deferred() {
  if(!has_deferred() || in_speak_mode()) { return RSVP.resolve(false); }
  var ids = deferred_marks;
  deferred_marks = null;
  return RSVP.all([local_boards(), load_index()]).then(function(res) {
    var list = res[0] || [];
    var index = Object.assign({}, res[1]);
    var writes = [];
    list.forEach(function(rec) {
      if(!rec.revoked && ids.indexOf(rec.id) !== -1) {
        writes.push(write_mark(rec, true).then(function(ok) {
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
    return lingoLinqExtras.storage.find('board', id).then(function(rec) {
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

// Board route: a marked board is blocked, except the board already on screen.
export function blocks_route(board, appState) {
  var id = board && typeof board.get === 'function' ? board.get('id') : null;
  var current = appState && typeof appState.get === 'function' ? appState.get('currentBoardState.id') : null;
  if(!id || (current && current == id)) { return RSVP.resolve(false); }
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

// The board route may refuse its local copy only when the denial speaks for
// every synced user: the signed-in user is acting as themselves and syncs no
// supervisees (a supervisee might still be able to view the board). Anything
// less certain keeps today's fallback to the local copy.
export function route_refuses_local(err, appState) {
  if(!real_denial(err)) { return false; }
  var as_user = LingoLinq.session && typeof LingoLinq.session.get === 'function' && LingoLinq.session.get('as_user_id');
  var session_user = appState && typeof appState.get === 'function' ? appState.get('sessionUser') : null;
  if(as_user || !session_user) { return false; }
  var supervisees = appState.get('sessionUser.supervisees');
  return !(supervisees && supervisees.length > 0);
}

// Test hook: forget module state between tests.
export function reset_for_tests() {
  deferred_marks = null;
  index_promise = null;
}

export default {
  parse_revisions_response: parse_revisions_response,
  check_ids_for: check_ids_for,
  fetch_revisions: fetch_revisions,
  skip_board: skip_board,
  note_failure: note_failure,
  settled_revocations: settled_revocations,
  apply_revocations: apply_revocations,
  finish_sync: finish_sync,
  has_deferred: has_deferred,
  flush_deferred: flush_deferred,
  is_revoked_raw: is_revoked_raw,
  is_revoked: is_revoked,
  without_revoked: without_revoked,
  blocks_route: blocks_route,
  denial_body: denial_body,
  real_denial: real_denial,
  route_refuses_local: route_refuses_local,
  reset_for_tests: reset_for_tests
};
