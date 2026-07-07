import RSVP from 'rsvp';
import LingoLinq from '../app';
import i18n from './i18n';
import modal from './modal';
import editManager from './edit_manager';
import { findExistingUserCopy } from './board-copy';

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

function saveHomeBoard(user, board, locale) {
  user.set('preferences.home_board', {
    id: board.get('id'),
    key: board.get('key'),
    locale: locale
  });
  return user.save();
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
        });
      }
      return editManager.copy_board(board, 'links_copy_as_home', user, false, lib).then(function(copiedBoard) {
        return saveHomeBoard(user, copiedBoard, locale).then(function() {
          if (onSuccess) { onSuccess(copiedBoard); }
          return copiedBoard;
        });
      }, function(err) {
        var msg = (typeof err === 'string' && err) ? err : i18n.t('pick_board_copy_failed', "We couldn't set up your board. Please try again.");
        onError(msg);
        return RSVP.reject(err);
      });
    }, function() {
      return editManager.copy_board(board, 'links_copy_as_home', user, false, lib).then(function(copiedBoard) {
        return saveHomeBoard(user, copiedBoard, locale).then(function() {
          if (onSuccess) { onSuccess(copiedBoard); }
          return copiedBoard;
        });
      }, function(err) {
        var msg = (typeof err === 'string' && err) ? err : i18n.t('pick_board_copy_failed', "We couldn't set up your board. Please try again.");
        onError(msg);
        return RSVP.reject(err);
      });
    });
  }, function() {
    onNotFound();
    return RSVP.reject('query failed');
  });
}

export default assignVocalFlair84AsHome;
