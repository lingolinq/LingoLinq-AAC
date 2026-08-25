// Short-lived Mine-tab list snapshot for the boards page overlay gate.
//
// Distinct from board_detail_cache (speak-mode /tree JSON). This only stores
// compact list-tile attributes so /:user/boards can paint immediately after a
// hard refresh within TTL while a background store.query refreshes the list.

import { get as emberGet } from '@ember/object';

var TTL_MS = 10 * 60 * 1000;
var MAX_BOARDS = 500;
var KEY_PREFIX = 'll_boards_page_mine_v1:';

/* Foreground Mine-list load gate for board_detail_cache phase-4 deferral.
   Set while generate_or_append_to_list is fetching model.my_boards; cleared
   when the list reaches .done or errors. Module-level so prefetch can poll
   without depending on the Ember controller instance. */
var _mineListBusy = false;
/* True while the user.boards route is the visible route. Phase 3/4
   prefetch waits on this so catalog /tree and a duplicate owned-list
   fetch do not starve the boards page. */
var _boardsPageActive = false;

var SNAPSHOT_ATTRS = [
  'id',
  'key',
  'name',
  'user_name',
  'public',
  'copy_id',
  'image_url',
  'locale',
  'translated_locales',
  'grid',
  'home_board',
  'stars'
];

function _now() {
  return Date.now();
}

function _storage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch (e) { /* private mode / blocked */ }
  return null;
}

function _storage_key(userId) {
  if (!userId) { return null; }
  return KEY_PREFIX + String(userId);
}

function _attr(board, name) {
  if (!board) { return undefined; }
  if (typeof board.get === 'function') {
    return board.get(name);
  }
  return emberGet(board, name);
}

function serializeBoard(board) {
  if (!board) { return null; }
  var id = _attr(board, 'id');
  if (!id) { return null; }
  var out = { id: String(id) };
  for (var i = 0; i < SNAPSHOT_ATTRS.length; i++) {
    var key = SNAPSHOT_ATTRS[i];
    if (key === 'id') { continue; }
    var val = _attr(board, key);
    if (val !== undefined && val !== null) {
      out[key] = val;
    }
  }
  return out;
}

function write(userId, boards) {
  var storage = _storage();
  var key = _storage_key(userId);
  if (!storage || !key || !boards || !Array.isArray(boards)) { return false; }
  var serialized = [];
  var limit = Math.min(boards.length, MAX_BOARDS);
  for (var i = 0; i < limit; i++) {
    var row = serializeBoard(boards[i]);
    if (row) { serialized.push(row); }
  }
  try {
    storage.setItem(key, JSON.stringify({
      saved_at: _now(),
      user_id: String(userId),
      boards: serialized
    }));
    return true;
  } catch (e) {
    return false;
  }
}

function read(userId) {
  var storage = _storage();
  var key = _storage_key(userId);
  if (!storage || !key) { return null; }
  var raw = null;
  try {
    raw = storage.getItem(key);
  } catch (e) {
    return null;
  }
  if (!raw) { return null; }
  try {
    var parsed = JSON.parse(raw);
    if (!parsed || parsed.user_id !== String(userId)) { return null; }
    if (!parsed.saved_at || (_now() - parsed.saved_at) > TTL_MS) {
      try { storage.removeItem(key); } catch (e2) { /* ignore */ }
      return null;
    }
    if (!Array.isArray(parsed.boards)) { return null; }
    return parsed;
  } catch (e) {
    try { storage.removeItem(key); } catch (e2) { /* ignore */ }
    return null;
  }
}

function clear(userId) {
  var storage = _storage();
  var key = _storage_key(userId);
  if (!storage || !key) { return; }
  try { storage.removeItem(key); } catch (e) { /* ignore */ }
}

function clearAll() {
  _mineListBusy = false;
  _boardsPageActive = false;
  var storage = _storage();
  if (!storage) { return; }
  var toRemove = [];
  try {
    for (var i = 0; i < storage.length; i++) {
      var k = storage.key(i);
      if (k && k.indexOf(KEY_PREFIX) === 0) {
        toRemove.push(k);
      }
    }
  } catch (e) { return; }
  toRemove.forEach(function(k) {
    try { storage.removeItem(k); } catch (e2) { /* ignore */ }
  });
}

function hydrate(store, boards) {
  if (!store || !boards || !boards.length) { return []; }
  var records = [];
  for (var i = 0; i < boards.length; i++) {
    var board = boards[i];
    if (!board || !board.id) { continue; }
    var attrs = {};
    for (var j = 0; j < SNAPSHOT_ATTRS.length; j++) {
      var key = SNAPSHOT_ATTRS[j];
      if (key === 'id') { continue; }
      if (board[key] !== undefined) {
        attrs[key] = board[key];
      }
    }
    try {
      records.push(store.push({
        data: {
          id: String(board.id),
          type: 'board',
          attributes: attrs
        }
      }));
    } catch (e) { /* skip bad rows */ }
  }
  return records;
}

function isUsableList(list) {
  /* Array-shaped completed lists only — including length 0 (empty library)
     so a finished Mine fetch does not re-trigger the boards overlay. */
  return !!(list && list.done && !list.loading && !list.error && Array.isArray(list));
}

/* Overlay / hero gate: first Mine page is enough to paint. Empty
   completed lists (done) also count so a zero-board library does not
   keep “Preparing your workspace” up. */
function isPaintReady(list) {
  if (isUsableList(list)) { return true; }
  return !!(list && list.paint_ready && !list.loading && !list.error && Array.isArray(list) && list.length);
}

/* True when localStorage still holds an unexpired Mine snapshot for this
   user. Used to skip store.query on boards-page re-entry within TTL. */
function hasFreshSnapshot(userId) {
  return !!read(userId);
}

function setMineListBusy(busy) {
  _mineListBusy = !!busy;
}

function isMineListBusy() {
  return !!_mineListBusy;
}

function setBoardsPageActive(active) {
  _boardsPageActive = !!active;
}

function isBoardsPageActive() {
  return !!_boardsPageActive;
}

export default {
  TTL_MS: TTL_MS,
  MAX_BOARDS: MAX_BOARDS,
  KEY_PREFIX: KEY_PREFIX,
  SNAPSHOT_ATTRS: SNAPSHOT_ATTRS,
  serializeBoard: serializeBoard,
  write: write,
  read: read,
  clear: clear,
  clearAll: clearAll,
  hydrate: hydrate,
  isUsableList: isUsableList,
  isPaintReady: isPaintReady,
  hasFreshSnapshot: hasFreshSnapshot,
  setMineListBusy: setMineListBusy,
  isMineListBusy: isMineListBusy,
  setBoardsPageActive: setBoardsPageActive,
  isBoardsPageActive: isBoardsPageActive
};
