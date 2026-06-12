import { get as emberGet } from '@ember/object';
import { BRAND_FAMILIES } from './board-brands';

/* Owner slugs to prefer when deduping same-name public boards — signed-in
   user first, then the canonical lingolinq publisher. */
export function boardsPagePreferUserNames(appState) {
  var names = [];
  var currentName = appState && appState.get && appState.get('currentUser.user_name');
  if (currentName) { names.push(String(currentName).toLowerCase()); }
  names.push('lingolinq');
  return names;
}

/* Filter a list of board records down to "root" tiles — the visible
   boards the user owns, excluding sub-board copies that came along
   inside a copied board set. Mirrors the BOARDS-chip count on the
   boards page (myBoardsRoots in controllers/user/index.js): a library
   of 419 raw records can collapse to 14 visible roots.

   A board is filtered out as a copy when:
     - its id is shaped `<copyId>-<userId>` and points at a "shallow
       root" already in the list (a personalized clone), OR
     - copy_id is set and points at a different id (regular copy).

   Everything else is treated as a root tile. */
export function filterRootBoards(boards, userId) {
  if (!boards || !boards.forEach || !boards.length) { return []; }
  var shallowRootKeys = Object.create(null);
  boards.forEach(function(b) {
    if (!b) { return; }
    var bidRaw = emberGet(b, 'id');
    if (bidRaw == null || bidRaw === '') { return; }
    var bid = String(bidRaw);
    var copyId = emberGet(b, 'copy_id');
    if (bid.match(/-/) && (!copyId || copyId == bid || copyId == bid.split(/-/)[0])) {
      var uid = bid.split(/-/)[1];
      if (uid == userId) {
        shallowRootKeys[copyId || bid.split(/-/)[0]] = true;
      }
    }
  });
  var roots = [];
  boards.forEach(function(b) {
    if (!b) { return; }
    var bidRaw = emberGet(b, 'id');
    if (bidRaw == null || bidRaw === '') { return; }
    var bid = String(bidRaw);
    var copyId = emberGet(b, 'copy_id');
    if (bid.match(/-/) && bid.split(/-/)[1] == userId && copyId && shallowRootKeys[copyId]) {
      return;
    }
    if (copyId && copyId != bid) {
      return;
    }
    roots.push(b);
  });
  return roots;
}

/* Owner slug from a board record — prefers the `<owner>/` prefix of
   `key`, falls back to `user_name`. Lowercased for comparisons. */
export function boardOwnerName(board) {
  if (!board) { return ''; }
  var key = emberGet(board, 'key') || '';
  var slash = key.indexOf('/');
  if (slash >= 0) { return key.substring(0, slash).toLowerCase(); }
  return (emberGet(board, 'user_name') || '').toLowerCase();
}

function _preferRank(owner, preferUserNames) {
  if (!owner || !preferUserNames || !preferUserNames.length) { return -1; }
  for (var i = 0; i < preferUserNames.length; i++) {
    if (preferUserNames[i] && owner === preferUserNames[i]) { return i; }
  }
  return -1;
}

function _pickBestByName(group, preferUserNames) {
  if (!group || !group.length) { return null; }
  if (group.length === 1) { return group[0]; }
  var best = group[0];
  var bestRank = _preferRank(boardOwnerName(best), preferUserNames);
  var bestIndex = 0;
  for (var i = 1; i < group.length; i++) {
    var candidate = group[i];
    var rank = _preferRank(boardOwnerName(candidate), preferUserNames);
    if (rank >= 0 && (bestRank < 0 || rank < bestRank)) {
      best = candidate;
      bestRank = rank;
      bestIndex = i;
      continue;
    }
    if (rank === bestRank && rank < 0 && i < bestIndex) {
      best = candidate;
      bestIndex = i;
    }
  }
  return best;
}

/* Drop boards whose display `name` is a duplicate — one row per distinct
   name, compared case-insensitively (so "CommuniKate alcohol" and
   "CommuniKate Alcohol" collapse). Empty / missing names are NOT deduped.

   When `options.preferUserNames` is set (lowercase owner slugs), the
   kept representative within each name group is the board whose owner
   matches the earliest entry in that list; otherwise the first board
   in input order wins (popularity / relevance sort). */
export function dedupeByName(boards, options) {
  if (!boards || !boards.forEach || !boards.length) { return []; }
  var preferUserNames = (options && options.preferUserNames) || [];
  if (preferUserNames.length) {
    preferUserNames = preferUserNames.map(function(n) {
      return (n || '').toLowerCase();
    }).filter(function(n) { return !!n; });
  }
  var groups = Object.create(null);
  var groupOrder = [];
  var unnamed = [];
  boards.forEach(function(b) {
    if (!b) { return; }
    var name = emberGet(b, 'name') || '';
    if (!name) { unnamed.push(b); return; }
    var groupKey = name.toLowerCase();
    if (!groups[groupKey]) {
      groups[groupKey] = [];
      groupOrder.push(groupKey);
    }
    groups[groupKey].push(b);
  });
  var out = [];
  groupOrder.forEach(function(groupKey) {
    out.push(_pickBestByName(groups[groupKey], preferUserNames));
  });
  unnamed.forEach(function(b) { out.push(b); });
  return out;
}

/* True when a board is a brand-set ROOT tile (not a sub-board page).
   Non-brand boards pass through as roots. Uses the same `root_re`
   patterns as board-collection / board-brands — do NOT use server
   `root: true` for public originals. */
export function isBrandSetRootBoard(board) {
  if (!board) { return true; }
  var key = emberGet(board, 'key') || '';
  for (var i = 0; i < BRAND_FAMILIES.length; i++) {
    var family = BRAND_FAMILIES[i];
    if (!family.test(board)) { continue; }
    return !!(family.root_re && family.root_re.test(key));
  }
  return true;
}

/* Keep only brand-set root tiles from a flat board list. */
export function filterBrandSetRootBoards(boards) {
  if (!boards || !boards.forEach || !boards.length) { return []; }
  var out = [];
  boards.forEach(function(b) {
    if (b && isBrandSetRootBoard(b)) { out.push(b); }
  });
  return out;
}

/* Boards-page default grid: owned copy-set roots, then drop brand-set
   sub-board pages (CommuniKate topic pages, Quick Core prefix boards,
   etc.) using the same key-based `root_re` rules as board-collection. */
export function filterBoardsPageTopLevelRoots(boards, userId) {
  return filterBrandSetRootBoards(filterRootBoards(boards || [], userId));
}

/* Dedupe `{ board, children }[]` rows by top-level board name, keeping
   `children` on the surviving row. */
export function dedupeBoardRows(rows, options) {
  if (!rows || !rows.forEach || !rows.length) { return []; }
  var boards = [];
  rows.forEach(function(row) {
    if (row && row.board) { boards.push(row.board); }
  });
  var deduped = dedupeByName(boards, options);
  var keepIds = Object.create(null);
  deduped.forEach(function(b) {
    var id = emberGet(b, 'id');
    if (id != null && id !== '') { keepIds[String(id)] = true; }
  });
  return rows.filter(function(row) {
    if (!row || !row.board) { return false; }
    var id = emberGet(row.board, 'id');
    return id != null && id !== '' && keepIds[String(id)];
  });
}

/* Natural (numeric-aware) sort by display name — embedded numbers compare
   as numbers, not as strings, so "Quick Core 84" sorts before "Quick Core
   112" (plain lexicographic would put 112 first because '1' < '8').
   `sensitivity: 'base'` makes it case-insensitive. Returns a new array. */
export function sortByNameNatural(boards) {
  if (!boards || !boards.slice || !boards.length) { return boards ? boards.slice() : []; }
  return boards.slice().sort(function(a, b) {
    var an = (emberGet(a, 'name') || '').toString();
    var bn = (emberGet(b, 'name') || '').toString();
    return an.localeCompare(bn, undefined, { numeric: true, sensitivity: 'base' });
  });
}

export default filterRootBoards;
