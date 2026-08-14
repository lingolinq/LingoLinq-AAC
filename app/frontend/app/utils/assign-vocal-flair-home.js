import RSVP from 'rsvp';
import LingoLinq from '../app';
import i18n from './i18n';
import modal from './modal';
import editManager from './edit_manager';
import { findExistingUserCopy } from './board-copy';
import { saveHomeBoard } from './home_board';

function pickVocalFlair84(list) {
  var pick = function(re) {
    for (var i = 0; i < list.length; i++) {
      if (re.test((list[i].get('key') || ''))) { return list[i]; }
    }
    return null;
  };
  return pick(/(^|\/)vocal-flair-84$/) || pick(/vocal-flair-84/) || list[0];
}

function copyLibraryForUser(user) {
  var lib = user.get('preferences.preferred_symbols') || 'original';
  if (['pcs', 'symbolstix', 'lessonpix'].indexOf(lib) !== -1) {
    if (!user.get('extras_enabled') && !user.get('subscription.extras_enabled')) {
      lib = 'original';
    }
  }
  return lib;
}

/* `saveHomeBoard` rejects when the server accepted the request but stored no
   home board (utils/home_board.js), which reads differently to the user than a
   copy that failed outright. */
function errorMessageFor(err) {
  if (err && err.error === 'home_board_not_saved') {
    return i18n.t('set_as_home_failed', "Home board update failed unexpectedly");
  }
  return (typeof err === 'string' && err) ? err : i18n.t('pick_board_copy_failed', "We couldn't set up your board. Please try again.");
}

function copyBoardAndSaveHome(board, user, lib, locale, onSuccess, onError) {
  /* Held in the closure because `saveHomeBoard` resolves with the USER record,
     not the board — reading its resolution value would hand onSuccess the wrong
     object. */
  var copied = null;
  return editManager.copy_board(board, 'links_copy_as_home', user, false, lib).then(function(copiedBoard) {
    copied = copiedBoard;
    return saveHomeBoard(user, copiedBoard, locale);
  }).catch(function(err) {
    /* `.catch` covers the COPY and the ASSIGNMENT — the old shape only had a
       reject handler on copy_board, so a copy the server accepted whose
       home-board assignment it then discarded resolved as a success.
       It deliberately does NOT cover onSuccess (below): that callback drives
       navigation and UI in its callers, and inside this guarded region a throw
       there reported "We couldn't set up your board" for a board that had in
       fact been copied and assigned. */
    onError(errorMessageFor(err));
    return RSVP.reject(err);
  }).then(function() {
    if (onSuccess) { onSuccess(copied); }
    return copied;
  });
}

/* Find the public Vocal Flair 84 catalog board and set the user's owned copy
   (reusing the signup sync copy when present) as home board. */
export function assignVocalFlair84AsHome(user, options) {
  options = options || {};
  if (!user || !user.save) {
    modal.error(i18n.t('set_as_home_failed', "Home board update failed unexpectedly"));
    return RSVP.reject('no user');
  }

  var locale = options.locale;
  var onSuccess = options.onSuccess;
  var onError = options.onError || function() {
    modal.error(i18n.t('set_as_home_failed', "Home board update failed unexpectedly"));
  };
  var onNotFound = options.onNotFound || function() {
    modal.error(i18n.t('home_board_assign_not_found', "We couldn't find the recommended home board. Please pick one below."));
  };

  return LingoLinq.store.query('board', { q: 'Vocal Flair 84', public: true, per_page: 10 }).then(function(results) {
    var list = (results && results.slice) ? results.slice() : (results || []);
    var board = pickVocalFlair84(list);
    if (!board) {
      onNotFound();
      return RSVP.reject('not found');
    }

    var lib = copyLibraryForUser(user);
    return findExistingUserCopy(board, user).then(function(existing) {
      if (existing) {
        return saveHomeBoard(user, existing, locale).then(function() {
          if (onSuccess) { onSuccess(existing); }
          return existing;
        }, function(err) {
          /* Was unhandled: the rejection travelled up to the caller's bare
             `.catch`, which only cleared the in-flight flag — the button reset
             itself and nothing told the user anything had gone wrong. */
          onError(errorMessageFor(err));
          return RSVP.reject(err);
        });
      }
      return copyBoardAndSaveHome(board, user, lib, locale, onSuccess, onError);
    }, function() {
      return copyBoardAndSaveHome(board, user, lib, locale, onSuccess, onError);
    });
  }, function() {
    onNotFound();
    return RSVP.reject('query failed');
  });
}

export default assignVocalFlair84AsHome;
