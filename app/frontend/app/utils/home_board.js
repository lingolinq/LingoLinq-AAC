import RSVP from 'rsvp';

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
export function saveHomeBoard(user, board, locale) {
  if(!user || !user.save || !board || !board.get) {
    return RSVP.reject({error: 'home_board_not_saved', reason: 'missing user or board'});
  }
  var expected_id = board.get('id');
  var expected_key = board.get('key');
  user.set('preferences.home_board', {
    id: expected_id,
    key: expected_key,
    locale: locale
  });
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

export default saveHomeBoard;
