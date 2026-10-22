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
export function copy_or_reuse_as_home(board, user, locale, opts) {
  var isCancelled = opts && typeof opts.isCancelled === 'function' ? opts.isCancelled : null;
  if (isCancelled && !can_cancel_home_copy(board, user)) { isCancelled = null; }
  /* WHO STARTED IT (adversary review of #1141, 2026-10-15). An SPA logout (auth_spa_transition) does not
     stop the copy job, and the next person can sign in before it ends; the home save and the clean-up
     would then run with their session. A cancellable copy therefore also counts as cancelled once a
     different person (or nobody) is signed in, and the rejection says who started it, so
     discard_cancelled_copy can refuse to delete anything for someone else. */
  var startedFor = signed_in_user_id();
  if (isCancelled) {
    var asked = isCancelled;
    isCancelled = function() { return asked() || signed_in_user_changed(startedFor); };
  }
  var lib = user.get('preferences.preferred_symbols') || 'original';
  if (['pcs', 'symbolstix', 'lessonpix'].indexOf(lib) !== -1) {
    if (!user.get('extras_enabled') && !user.get('subscription.extras_enabled')) {
      lib = 'original';
    }
  }
  var copyFailed = function(err) {
    // copy_board rejects with an already-localized string or an internal-code object; only a
    // string is shown as it is.
    return RSVP.reject((typeof err === 'string' && err) ? err : i18n.t('pick_board_copy_failed', "We couldn't set up your board. Please try again."));
  };
  var copy = function() {
    if (!isCancelled) {
      return editManager.copy_board(board, 'links_copy_as_home', user, false, lib).then(null, copyFailed);
    }
    /* CANCELLABLE (the Boards page's Set Home Board dialog, 2026-10-11). The same call, plus a
       `skip_home` check that copy_board makes at the moment it would save the home board
       (edit_manager.js, the `as_home` branch of done_callback), so the save keeps its original
       timing. That timing matters: copy_board also reloads the user ~100ms after the job ends, and
       a home save made any later can be overwritten by that reload. The server job never sets the
       home board (User#copy_board_links), so skipping that one save keeps it unchanged. `skipped`
       records what copy_board actually decided, so a Cancel pressed after the save never deletes
       a board that is already the home board. */
    var skipped = false;
    var skipHome = function() { if (isCancelled()) { skipped = true; } return skipped; };
    return editManager.copy_board(board, 'links_copy_as_home', user, false, lib, undefined, undefined, { skip_home: skipHome }).then(function(made) {
      if (skipped) {
        return RSVP.reject({ cancelled: true, board: made, new_board_ids: (made && made.get('new_board_ids')) || (made ? [made.get('id')] : []), session_user_id: startedFor });
      }
      return made;
    }, copyFailed);
  };
  return findExistingUserCopy(board, user).then(function(existing) {
    if (!existing) { return copy(); }
    // Theirs already: a cancel here changes nothing and deletes nothing.
    if (isCancelled && isCancelled()) { return RSVP.reject({ cancelled: true, session_user_id: startedFor }); }
    return saveHomeBoard(user, existing, locale).then(function() { return existing; }, function() {
      return RSVP.reject(i18n.t('set_as_home_failed', "Home board update failed unexpectedly"));
    });
  }, function() {
    // The lookup itself failed: copy, so the user is never blocked (a duplicate beats a dead end).
    return copy();
  });
}

/* Whether a home-board copy can be cancelled. Not for an organization's home board: copy_board
   sets that one on the SERVER in a single user save (edit_manager.js, the org branch of
   `links_copy_as_home`), so there is no later step a cancel could skip. */
export function can_cancel_home_copy(board, user) {
  var keys = (user && user.get && user.get('org_board_keys')) || [];
  var key = board && board.get && board.get('key');
  return !(key && keys.indexOf(key) !== -1);
}

/* REMOVE WHAT A CANCELLED COPY MADE (the choice made 2026-10-11: delete it rather than leave a
   half-wanted copy in My Boards). Deletes, one at a time, only boards that are ALL of: listed in the
   copy job's `new_board_ids`, owned by this user, created after the copy started (one minute of
   leeway for clock skew between this device and the server), and not their home board. Anything
   that fails a check, or cannot be loaded, is left alone. Deleting follows
   components/confirm-delete-board.js: load the record, deleteRecord, save. Resolves either way.
   It also FOLLOWS LINKS from each board it deletes, under the same checks: the job reports
   `new_board_ids` from the source's stored downstream list (User#copy_board_links), which can be
   stale, while the copy itself follows the real links. Seen 2026-10-11: one copied board was missing
   from the report and was left behind until this walked the links to it.
   LINEAGE (Scot's review of #1141, 2026-10-14): a board is removed, and its links followed, only when
   THIS copy made it (made_by_copy, below). Owner, age and home alone let the walk reach a recent board
   of their own that a copy still linked to.
   `startedFor` is the rejection's `session_user_id`: once someone else is signed in, nothing more is
   deleted (see copy_or_reuse_as_home). */
export function discard_cancelled_copy(ids, user, startedAt, root, startedFor) {
  // The copy's root: the record when the caller has it, else the first id the job reports
  // (User#copy_board_links puts the new root first).
  var rootId = record_id(root) || (ids || [])[0];
  var userName = user && user.get && user.get('user_name');
  var homeKey = user && user.get && user.get('preferences.home_board.key');
  // The cutoff is the cancelled copy's own `created` (server time) when it is known, so this device's
  // clock cannot shift it either way (adversary review, 2026-10-13); otherwise when the copy started here.
  var rootCreated = root && root.get && root.get('created');
  var from = rootCreated || startedAt;
  var since = from ? new Date(from).getTime() - 60000 : null;
  var queue = (ids || []).slice();
  var seen = {};
  queue.forEach(function(id) { seen[id] = true; });
  var next = function() {
    var id = queue.shift();
    if (!id || signed_in_user_changed(startedFor)) { return RSVP.resolve(); }
    return LingoLinq.store.findRecord('board', id).then(function(b) {
      var created = b && b.get('created');
      var ours = b && userName && b.get('user_name') === userName && b.get('key') !== homeKey &&
                 since !== null && created && new Date(created).getTime() >= since && made_by_copy(b, rootId);
      if (!ours) { return null; }
      (b.get('buttons') || []).forEach(function(btn) {
        var link = btn && (btn.load_board || (btn.get && btn.get('load_board')));
        if (link && link.id && !seen[link.id]) { seen[link.id] = true; queue.push(link.id); }
      });
      b.deleteRecord();
      return b.save();
    }).then(next, next);
  };
  return next();
}

/* Did the copy whose root is `rootId` make board `b`? Every board the copy job makes carries the root's
   id as its copy_id (app/services/board_set_copier.rb: the phase-1 copies and the relink phase's private
   copies both pass `copy_id: @starting_new.global_id`). The root's own copy_id is its id, which the API
   leaves out (lib/json_api/board.rb, `copy_id` is omitted when it equals the board's id), so the root is
   matched by id. A board created during the copy from one of the new boards inherits the same copy_id
   (app/models/board.rb, `source_id`), so it counts as part of the copy too. */
export function made_by_copy(b, rootId) {
  if (!b || !rootId) { return false; }
  return record_id(b) === rootId || b.get('copy_id') === rootId;
}

/* The signed-in user's id (services/session.js sets `user_id` on sign-in and clears it on logout), or
   null. `changed` only once there was someone to compare with: a copy started before the session had
   loaded is not guarded. */
export function signed_in_user_id() {
  var s = LingoLinq.session;
  return (s && (typeof s.get === 'function' ? s.get('user_id') : s.user_id)) || null;
}
function signed_in_user_changed(startedFor) {
  return !!startedFor && signed_in_user_id() !== startedFor;
}

function record_id(record) {
  return record ? (record.id || (record.get && record.get('id'))) : null;
}
