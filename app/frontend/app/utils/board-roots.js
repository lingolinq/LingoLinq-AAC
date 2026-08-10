import { get as emberGet } from '@ember/object';
import { isBrandSetRoot } from './board-brands';

/** Cap live boards-page filter results (also used in i18n truncation hint). */
export var BOARDS_PAGE_SEARCH_LIMIT = 50;

/* Owner slugs to prefer when deduping same-name public boards — signed-in
   user first, then the canonical lingolinq publisher. Gated behind the
   `boards_page_owner_dedup` feature flag (beta opt-in). */
export function boardsPagePreferUserNames(appState) {
  if (!appState || !appState.get || !appState.get('feature_flags.boards_page_owner_dedup')) {
    return [];
  }
  var names = [];
  var currentName = appState.get('currentUser.user_name');
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

function _dedupeChildRows(children) {
  var seen = Object.create(null);
  var out = [];
  (children || []).forEach(function(child) {
    if (!child || !child.board) { return; }
    var id = emberGet(child.board, 'id');
    if (id == null || id === '') { out.push(child); return; }
    var sid = String(id);
    if (seen[sid]) { return; }
    seen[sid] = true;
    out.push(child);
  });
  return out;
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
  var outputOrder = [];
  boards.forEach(function(b) {
    if (!b) { return; }
    var name = emberGet(b, 'name') || '';
    if (!name) {
      outputOrder.push({ kind: 'single', board: b });
      return;
    }
    var groupKey = name.toLowerCase();
    if (!groups[groupKey]) {
      groups[groupKey] = [];
      outputOrder.push({ kind: 'group', key: groupKey });
    }
    groups[groupKey].push(b);
  });
  var out = [];
  outputOrder.forEach(function(item) {
    if (item.kind === 'single') {
      out.push(item.board);
    } else {
      out.push(_pickBestByName(groups[item.key], preferUserNames));
    }
  });
  return out;
}

/* True when a board is a brand-set ROOT tile (not a sub-board page).
   Non-brand boards pass through as roots. Delegates to the ONE definition
   in board-brands so the boards page and the Board Collection panel cannot
   drift — this used to be a second copy of the same loop, and it carried the
   same rename bug (a renamed copy of a brand root read as a sub-board and
   disappeared from its owner's list). Do NOT use server `root: true` for
   public originals. */
export function isBrandSetRootBoard(board) {
  return isBrandSetRoot(board);
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
   `children` from every row in the name group on the winning board. */
export function dedupeBoardRows(rows, options) {
  if (!rows || !rows.forEach || !rows.length) { return []; }
  var preferUserNames = (options && options.preferUserNames) || [];
  if (preferUserNames.length) {
    preferUserNames = preferUserNames.map(function(n) {
      return (n || '').toLowerCase();
    }).filter(function(n) { return !!n; });
  }
  var orphans = [];
  var regular = [];
  rows.forEach(function(row) {
    if (!row || !row.board) { return; }
    /* Synthetic orphan clusters use createRecord boards with no id;
       keep them out of name dedup so they are not dropped or merged. */
    if (row.orphan) {
      orphans.push(row);
      return;
    }
    regular.push(row);
  });
  var groups = Object.create(null);
  var groupOrder = [];
  var unnamed = [];
  regular.forEach(function(row) {
    var name = emberGet(row.board, 'name') || '';
    if (!name) { unnamed.push(row); return; }
    var groupKey = name.toLowerCase();
    if (!groups[groupKey]) {
      groups[groupKey] = [];
      groupOrder.push(groupKey);
    }
    groups[groupKey].push(row);
  });
  var out = [];
  groupOrder.forEach(function(groupKey) {
    var groupRows = groups[groupKey];
    var boards = groupRows.map(function(r) { return r.board; });
    var winner = _pickBestByName(boards, preferUserNames);
    if (!winner) { return; }
    var winnerId = String(emberGet(winner, 'id'));
    var winnerRow = null;
    var mergedChildren = [];
    groupRows.forEach(function(row) {
      if (String(emberGet(row.board, 'id')) === winnerId) {
        winnerRow = row;
      }
      (row.children || []).forEach(function(child) {
        mergedChildren.push(child);
      });
    });
    var resultRow = {
      board: winner,
      children: _dedupeChildRows(mergedChildren)
    };
    if (winnerRow && winnerRow.orphan) { resultRow.orphan = true; }
    if (winnerRow && winnerRow.id != null) { resultRow.id = winnerRow.id; }
    out.push(resultRow);
  });
  unnamed.forEach(function(row) { out.push(row); });
  orphans.forEach(function(row) { out.push(row); });
  return out;
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
