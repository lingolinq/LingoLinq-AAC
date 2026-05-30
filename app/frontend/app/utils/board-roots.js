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

export default filterRootBoards;
