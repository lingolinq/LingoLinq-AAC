import RSVP from 'rsvp';
import LingoLinq from '../app';

/* Resolve the current user's already-owned copy of `board`, or null when there
   isn't one we can POSITIVELY confirm.

   A copy keeps the original's slug under the user's namespace (the signup
   provisioner makes exactly `username/<slug>`), so we look that key up — but we
   reuse it ONLY when its parent lineage confirms it is a copy of THIS board, via
   `parent_board_id` (matches the original's id) or `parent_board_key` (matches
   the original's key). App-made copies always set `parent_board_id` server-side
   (see models/board.js copy params + the /show serializer), so a real copy
   confirms here.

   We deliberately do NOT fall back to trusting the bare `username/<slug>` key
   convention when no parent info is present: a different, unrelated board the
   user happens to own at that same slug (e.g. a copy of a same-named board from
   a different source) would otherwise be silently reused — misrouting the user's
   HOME board to the wrong board. For AAC users that's a correctness/safety bug,
   so an unconfirmed match resolves to null and the caller copies a fresh copy
   instead (a harmless duplicate at worst, never the wrong board). A rejected
   lookup (e.g. 404 — no such owned board) also resolves to null. */
export function findExistingUserCopy(board, user) {
  var origKey = (board && board.get && board.get('key')) || '';
  var userName = user && user.get && user.get('user_name');
  if (!origKey || !userName || origKey.indexOf('/') === -1) { return RSVP.resolve(null); }
  var slug = origKey.split('/').pop();
  var expectedKey = userName + '/' + slug;
  // The picked board is already the user's own board — nothing to copy.
  if (origKey === expectedKey) { return RSVP.resolve(board); }
  var origId = board.get('id');
  // reload:true forces a /show so parent_board_id/parent_board_key are
  // AUTHORITATIVE — a board cached as a list partial may omit them, which would
  // make a real copy look unconfirmed and trigger a needless duplicate. The /show
  // serializer always includes parent_board_id (null when the board isn't a copy).
  // Wrap in RSVP.Promise + .catch so a 404/reject always resolves to null; a bare
  // .then(success, reject) can fail to run the pick flow when the adapter rejects.
  return new RSVP.Promise(function(resolve) {
    LingoLinq.store.findRecord('board', expectedKey, { reload: true }).then(function(found) {
      if (!found) { resolve(null); return; }
      var parentId = found.get('parent_board_id');
      var parentKey = found.get('parent_board_key');
      // Positive lineage match only — never blind-trust the slug.
      if ((parentId && origId && parentId === origId) ||
          (parentKey && origKey && parentKey === origKey)) {
        resolve(found);
      } else {
        resolve(null);
      }
    }).catch(function() {
      resolve(null);
    });
  });
}

export default findExistingUserCopy;
