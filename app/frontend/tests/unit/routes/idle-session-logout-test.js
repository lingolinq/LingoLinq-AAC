import { module, test } from 'qunit';
import { setupTest } from '../../helpers';

/* AN IDLE SESSION MUST LAND ON LOGIN, NOT ON "FAILED TO LOAD".
 *
 * After the inactivity window `Device#clean_old_keys` marks a browser key `needs_refresh`
 * (app/models/device.rb:285-297); `valid_token?` then returns false (:412) and every request
 * answers 400 with `{error: "Token needs refresh", invalid_token: true}`
 * (app/controllers/application_controller.rb:157-162). No browser refresh path exists — the only
 * endpoint is integration-only (config/routes.rb:86) — so a clean logout is the intended end.
 *
 * `invalid_token` IS THE DISCRIMINATOR, not the message text. `allowed?` answers EVERY permission
 * denial with 400 and `unauthorized: true` (application_controller.rb:282) and the message
 * "Not authorized", at 238 call sites. Matching on message strings would log a healthy user out
 * for opening an org page or a shared utterance they lack rights to; `invalid_token` is set only
 * by the token check (device.rb:350). The negative case below is what pins that apart.
 */
module('Unit | idle session lands on login, not the error page', function(hooks) {
  setupTest(hooks);

  function session(context) { return context.owner.lookup('service:session'); }

  module('dead_session_response: is this response a dead session?', function() {
    test('400 + invalid_token is a dead session', function(assert) {
      assert.true(session(this).dead_session_response(
        { status: 400, responseJSON: { error: 'Token needs refresh', invalid_token: true } }
      ));
    });

    /* THE BRACKET, and the reason this predicate reads `invalid_token` rather than the message:
       a permission denial is the same status with the same shape and must NOT end the session. */
    test('400 + unauthorized (a permission denial) is NOT', function(assert) {
      assert.false(session(this).dead_session_response(
        { status: 400, responseJSON: { error: 'Not authorized', unauthorized: true, permission: 'view' } }
      ), 'a supervisor refused a record keeps their session');
      assert.false(session(this).dead_session_response(
        { status: 400, responseJSON: { error: 'Board not found' } }
      ), 'an ordinary 400');
      assert.false(session(this).dead_session_response(
        { status: 500, responseJSON: { invalid_token: true } }
      ), 'a 500 is not a dead session');
      assert.false(session(this).dead_session_response({ status: 0 }), 'an offline blip');
      assert.false(session(this).dead_session_response(null), 'nothing at all');
    });
  });

  /* The classifier feeds the OTHER logout site, app-state.js:585's find_user handler, which
     already calls force_logout but could never match the shape the ajax layer actually rejects
     with: `err.status` and `err.result.status` are both undefined there (`result` is a string),
     so the `status != 400` guard at session.js:652 returned false for the very error it names. */
  module('is_logout_worthy_auth_error understands the ajax layer\'s own shape', function() {
    test('the {fakeXHR, result} shape utils/extras.js rejects with', function(assert) {
      assert.true(session(this).is_logout_worthy_auth_error(
        { fakeXHR: { status: 400, responseJSON: { error: 'Token needs refresh', invalid_token: true } },
          message: 'Bad Request', result: 'Token needs refresh' }
      ));
    });

    test('still false for a permission denial in that same shape', function(assert) {
      assert.false(session(this).is_logout_worthy_auth_error(
        { fakeXHR: { status: 400, responseJSON: { error: 'Not authorized', unauthorized: true } },
          result: 'Not authorized' }
      ), 'permission denial must not be logout-worthy via the fakeXHR path');
    });

    /* The shapes it already handled stay handled — these mirror tests/utils/session-test.js:783-788
       and are here so a rewrite of this predicate cannot quietly drop them. */
    test('the previously-handled shapes are unaffected', function(assert) {
      var s = session(this);
      assert.true(s.is_logout_worthy_auth_error({ status: 400, error: 'Token needs refresh' }));
      assert.true(s.is_logout_worthy_auth_error({ invalid_token: true }));
      assert.false(s.is_logout_worthy_auth_error({ error: 'timeout' }));
      assert.false(s.is_logout_worthy_auth_error({ status: 500, error: 'boom' }));
    });
  });

  /* "HAS THE LOGOUT BEGUN?" is a different question from "is the token dead?". Sync's
     check_token(false) (services/persistence.js:2224) sets `invalid_token` on a dead token WITHOUT
     tearing the session down (session.js check_token, allow_invalidate false). utils/extras.js keyed
     its force_logout de-dupe on `invalid_token`, so after that sync check every dead 400 skipped the
     logout. Reproduced live (2026-10-10): after the sync check, /:user/boards and /:user/logs kept
     auth with no login prompt while every request failed (the boards list showing its own inline
     "Failed to load"). Each case below is a state one of the flags' writers produces. */
  module('logout_under_way: has the teardown actually happened?', function() {
    function flags(context, invalid_token, isAuthenticated) {
      var s = session(context);
      s.set('invalid_token', invalid_token);
      s.set('isAuthenticated', isAuthenticated);
      return s.logout_under_way();
    }

    test('torn down (_tear_down_dead_session): yes', function(assert) {
      assert.true(flags(this, true, false));
    });

    test('flagged by a sync token check but never torn down: NO, so the logout still fires', function(assert) {
      assert.false(flags(this, true, true));
    });

    test('a healthy signed-in session or an anonymous visitor: no', function(assert) {
      assert.false(flags(this, false, true), 'signed in');
      assert.false(flags(this, false, false), 'anonymous');
    });
  });
});
