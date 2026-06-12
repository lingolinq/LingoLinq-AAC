import { get as emberGet } from '@ember/object';

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

/* Drop boards whose display `name` is an exact duplicate of an earlier
   entry — the FIRST occurrence wins (so when the input is popularity- or
   relevance-sorted, the kept representative is the most prominent one).
   Order is otherwise preserved. Empty / missing names are NOT deduped
   (a nameless board is unusual and there's no safe way to assert two such
   records are "the same"). Used to collapse the common case where several
   owners ship an identically-named board (e.g. multiple "CommuniKate Top
   Page" copies in a public search). */
export function dedupeByName(boards) {
  if (!boards || !boards.forEach || !boards.length) { return []; }
  var seen = Object.create(null);
  var out = [];
  boards.forEach(function(b) {
    if (!b) { return; }
    var name = emberGet(b, 'name') || '';
    if (!name) { out.push(b); return; }
    if (seen[name]) { return; }
    seen[name] = true;
    out.push(b);
  });
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
