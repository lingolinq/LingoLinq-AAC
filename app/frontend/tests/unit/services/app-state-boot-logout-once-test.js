import { module, test } from 'qunit';
import { logout_already_under_way } from 'frontend/services/app-state';

/* AT BOOT, A DEAD SESSION LOGS OUT ONCE (final review, 2026-10-13). With an expired token, the ajax layer
 * (utils/extras.js) calls session.force_logout for the failed user lookup, and the same rejection then reached
 * app-state's find_user handler, which called force_logout again: the dialog reopened and the teardown ran a
 * second time, when it cleared the shared stored login whoever owned it. find_user's handler now skips the call
 * when a logout is already under way (services/app-state.js, find_user's reject branch). This pins the check it
 * uses; the call site is one line beside it. */
module('Unit | Service | app-state boot logout once', function() {
  test('a logout already under way is not started again', function(assert) {
    assert.true(logout_already_under_way({ logout_under_way: function() { return true; } }));
    assert.false(logout_already_under_way({ logout_under_way: function() { return false; } }), 'none yet: log out');
    assert.false(logout_already_under_way({}), 'an older session object: log out as before');
    assert.false(logout_already_under_way(null));
  });
});
