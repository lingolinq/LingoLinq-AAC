import RSVP from 'rsvp';
import i18n from './i18n';

/* Setting a user's home board, CONFIRMED against what the server stored.
 *
 * A 200 on the user PUT does not mean the home board was accepted. The server
 * validates the reference and can store nothing at all, twice over
 * (app/models/user.rb#process_home_board):
 *
 *   - the referenced board no longer exists -> it DELETES the preference and
 *     returns true (~line 2921), so the response is a clean 200;
 *   - the board exists but is neither viewable by the user nor shareable by the
 *     updater -> no branch assigns it, and the write is skipped just as quietly.
 *
 * Both were reported as success by every caller, which is how a supporter could
 * watch the flow finish, land on the boards page, and find no home board set.
 *
 * The response carries the truth: lib/json_api/user.rb writes the authoritative
 * `preferences.home_board` into the payload, `preferences` is an `attr('raw')`
 * on the user model, and the adapter applies the server payload to the record on
 * save (utils/persistence.js#updateRecord -> `_super`). So the check is simply
 * to read the value back off the saved record.
 *
 * Rejects with `{error: 'home_board_not_saved'}` so callers surface a failure
 * instead of a false success. */
export function saveHomeBoard(user, board, locale, options) {
  if(!user || !user.save || !board || !board.get) {
    return RSVP.reject({error: 'home_board_not_saved', reason: 'missing user or board'});
  }
  options = options || {};
  var expected_id = board.get('id');
  var expected_key = board.get('key');
  var prefs = {
    id: expected_id,
    key: expected_key
  };
  /* Only sent when the caller has one. An explicit `locale: undefined` would
     change the payload for callers that never set it (edit_manager's copy
     flows), and this function is meant to be adoptable without altering what
     the server receives. Same for `level`, which the board-copy flows carry and
     the picker flows do not; the 0 < level < 10 bound is the copy flow's own. */
  if(locale) { prefs.locale = locale; }
  if(options.level && options.level > 0 && options.level < 10) { prefs.level = options.level; }
  user.set('preferences.home_board', prefs);
  return user.save().then(function(saved) {
    var record = saved && saved.get ? saved : user;
    var stored = record.get('preferences.home_board');
    /* id OR key: the server re-serializes from its own record, so either
       matching proves it kept OUR board rather than dropping the write. */
    if(stored && ((expected_id && stored.id === expected_id) || (expected_key && stored.key === expected_key))) {
      return record;
    }
    return RSVP.reject({
      error: 'home_board_not_saved',
      expected_id: expected_id,
      expected_key: expected_key,
      stored: stored || null
    });
  });
}

/* What a person is told once a board has become their home board (#1034).
 *
 * The earlier message said the board was "saved for offline use". Nothing had been saved: the step before it only
 * loads the board's pictures into the browser's memory (utils/board_preview_warmer.js#preload_board_images, which
 * always resolves), and a board is on the device only after a sync has saved it. So the message says what is
 * true, and the caller starts that sync (sync_after_home_change). */
export function home_board_set_message() {
  return i18n.t('home_board_set_kept_after_sync', "This is now your home board. It will be kept on this device for offline use after the next sync.");
}

/* Starts the sync that saves a newly chosen home board on the device, when one can run now: online, with
 * automatic syncing on (the same condition as the other home-board flows, for example
 * controllers/board-picker.js#_afterHomeBoardAssigned). A failed or refused sync is the sync's own business
 * (its status and notices report it); it never fails the home-board change. Always resolves. */
export function sync_after_home_change(persistence) {
  if(!persistence || !persistence.get || !persistence.get('online') || !persistence.get('auto_sync')) { return RSVP.resolve(false); }
  // Never into a database that is not the signed-in person's (an in-app sign-out and sign-in while the home board was
  // saving), as check_for_needs_sync refuses (services/persistence.js local_db_is_current_user).
  if(typeof persistence.local_db_is_current_user === 'function' && !persistence.local_db_is_current_user()) { return RSVP.resolve(false); }
  return RSVP.resolve(persistence.sync('self', null, null, 'home_board_changed')).then(function() { return true; }, function() { return true; });
}

export default saveHomeBoard;
