import RSVP from 'rsvp';
import LingoLinq from '../app';
import persistence from './persistence';
import editManager from './edit_manager';
import i18n from './i18n';
import { saveHomeBoard } from './home_board';

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
  // The lookup MUST reach the server: `parent_board_id`/`parent_board_key` are
  // only authoritative from a /show, and — more importantly — a board that no
  // longer exists server-side must fail here rather than resolve from cache.
  //
  // `{reload: true}` alone does NOT do that. The app replaces Ember Data's
  // adapter with its own offline-first one (utils/persistence.js#findRecord):
  // `start_with_local` is hard-coded true and `check_remote()` runs ONLY when
  // nothing was found in the local db, so ED's reload flag never reaches the
  // network. A board deleted on the server (or on another device) therefore kept
  // resolving out of IndexedDB, this function reported a copy that wasn't there,
  // and the caller skipped copying and "assigned" a phantom board — which the
  // server then silently discarded (app/models/user.rb#process_home_board).
  //
  // `persistence.force_reload` is that adapter's own opt-out, keyed
  // `<modelName>_<id>` and checked before the local lookup — the same switch
  // models/base.js#reload flips. Restored afterwards, and only if still ours, so
  // an overlapping lookup's key is never clobbered.
  var force_key = 'board_' + expectedKey;
  var prior_force_reload = persistence.force_reload;
  var restore_force_reload = function() {
    if(persistence.force_reload === force_key) {
      persistence.force_reload = prior_force_reload;
    }
  };
  persistence.force_reload = force_key;
  // Wrap in RSVP.Promise + .catch so a 404/reject always resolves to null; a bare
  // .then(success, reject) can fail to run the pick flow when the adapter rejects.
  return new RSVP.Promise(function(resolve) {
    LingoLinq.store.findRecord('board', expectedKey, { reload: true }).then(function(found) {
      restore_force_reload();
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
      restore_force_reload();
      resolve(null);
    });
  });
}

export default findExistingUserCopy;

/* MAKE `board` THE USER'S HOME BOARD, as the board picker's "Pick this Board" does (moved here
   from components/board-preview-overlay.js#pick_for_home on 2026-09-30 so the Basic board page's
   "Set as Home Board" can do exactly the same). Reuses the user's own confirmed copy when there is
   one (findExistingUserCopy, above) and sets it through utils/home_board so the save is confirmed
   against what the server stored; otherwise copies the board and its links and sets the COPY
   (`links_copy_as_home`). Resolves with the home board; rejects with a display string.
   The symbol library for a copy is the user's preferred set, gated by extras access (mirrors
   set-as-home.js#updateSelectedUser); it falls back to 'original'. */
export function copy_or_reuse_as_home(board, user, locale) {
  var lib = user.get('preferences.preferred_symbols') || 'original';
  if (['pcs', 'symbolstix', 'lessonpix'].indexOf(lib) !== -1) {
    if (!user.get('extras_enabled') && !user.get('subscription.extras_enabled')) {
      lib = 'original';
    }
  }
  var copy = function() {
    return editManager.copy_board(board, 'links_copy_as_home', user, false, lib).then(null, function(err) {
      // copy_board rejects with an already-localized string or an internal-code object; only a
      // string is shown as it is.
      return RSVP.reject((typeof err === 'string' && err) ? err : i18n.t('pick_board_copy_failed', "We couldn't set up your board. Please try again."));
    });
  };
  return findExistingUserCopy(board, user).then(function(existing) {
    if (!existing) { return copy(); }
    return saveHomeBoard(user, existing, locale).then(function() { return existing; }, function() {
      return RSVP.reject(i18n.t('set_as_home_failed', "Home board update failed unexpectedly"));
    });
  }, function() {
    // The lookup itself failed: copy, so the user is never blocked (a duplicate beats a dead end).
    return copy();
  });
}
