import { module, test } from 'qunit';
import RSVP from 'rsvp';
import EmberObject from '@ember/object';
import $ from 'jquery';
import { setupTest } from '../../helpers';
import LingoLinq from 'frontend/app';
import capabilities from 'frontend/utils/capabilities';
import extras from 'frontend/utils/extras';

/* THE AJAX LAYER'S DEAD-SESSION LOGOUT (utils/extras.js, the failure handler of $.ajax). A request that
 * comes back 400 with `invalid_token` ends the session with a login prompt, once, and never in Speak Mode
 * (Scot's review of #1141, 2026-10-15: this branch had no test). Driven through the real $.ajax wrapper
 * with $.realAjax stubbed, and the real session service with only force_logout replaced; the replacement
 * sets the two flags _tear_down_dead_session sets (services/session.js), which is what the de-dupe reads.
 *
 * STALE FAILURE (same review, item 3): a request sent with the old token can fail AFTER the person has
 * signed back in. That failure is about a session that is already over and must not end the new one, so
 * the branch also asks services/session.js#_checked_token_is_current about the token the request carried. */
module('Unit | Utility | extras dead-session logout', function(hooks) {
  setupTest(hooks);

  var original_real, original_app_state, had_session, original_session, original_token;
  var svc, logouts, logout_tokens, speak_mode, pending;
  hooks.beforeEach(function() {
    original_real = $.realAjax;
    original_app_state = extras.get_app_state;
    had_session = Object.prototype.hasOwnProperty.call(LingoLinq, 'session');
    original_session = LingoLinq.session;
    original_token = capabilities.access_token;
    svc = this.owner.lookup('service:session');
    logouts = 0;
    logout_tokens = [];
    // What _tear_down_dead_session does to the state these checks read (services/session.js).
    svc.force_logout = function(message, failedToken) {
      logouts++;
      logout_tokens.push(failedToken);
      svc.set('invalid_token', true);
      svc.set('isAuthenticated', false);
      svc.set('access_token', null);
      capabilities.access_token = null;
    };
    svc.set('isAuthenticated', true);
    svc.set('invalid_token', false);
    svc.set('access_token', 'token-one');
    capabilities.access_token = 'token-one';
    LingoLinq.session = svc;
    speak_mode = false;
    extras.get_app_state = function() { return EmberObject.create({ speak_mode: speak_mode }); };
    pending = [];
    // Each request is answered later, by `fail(n, body)`, so a test can change the session in between.
    $.realAjax = function(opts) {
      return new RSVP.Promise(function(resolve, reject) { pending.push({ opts: opts, reject: reject }); });
    };
  });
  hooks.afterEach(function() {
    $.realAjax = original_real;
    extras.get_app_state = original_app_state;
    capabilities.access_token = original_token;
    if (had_session) { LingoLinq.session = original_session; } else { delete LingoLinq.session; }
  });

  function send() { return $.ajax('/api/v1/users/self', { type: 'GET' }).then(null, function() { }); }
  function fail(n, body) {
    pending[n].reject({ status: 400, readyState: 4, responseJSON: body, responseText: JSON.stringify(body) });
  }
  var DEAD = { error: 'Token needs refresh', invalid_token: true };

  test('a dead-session 400 logs out once', async function(assert) {
    var req = send();
    fail(0, DEAD);
    await req;
    assert.strictEqual(pending[0].opts.headers['Authorization'], 'Bearer token-one', 'sent with the session token');
    assert.strictEqual(logouts, 1);
    assert.deepEqual(logout_tokens, ['token-one'], 'and is told which token failed (services/session.js keeps another tab\'s login)');
  });

  test('not in Speak Mode', async function(assert) {
    speak_mode = true;
    var req = send();
    fail(0, DEAD);
    await req;
    assert.strictEqual(logouts, 0, 'a communicator is never thrown to a login screen mid-sentence');
  });

  test('not for a "Not authorized" 400', async function(assert) {
    var req = send();
    fail(0, { error: 'Not authorized', unauthorized: true });
    await req;
    assert.strictEqual(logouts, 0, 'a permission denial keeps the session');
  });

  test('a second failure from the same dead session does not log out again', async function(assert) {
    // The teardown clears this tab's token, so the stale-token check would also stop the second logout;
    // held at "current" here so this pins the de-dupe itself (it is what covers a request sent without a token).
    svc._checked_token_is_current = function() { return true; };
    var a = send();
    var b = send();
    fail(0, DEAD);
    await a;
    fail(1, DEAD);
    await b;
    assert.strictEqual(logouts, 1);
  });

  /* The de-dupe is `logout_under_way`, NOT `invalid_token` alone: sync's check_token(false) sets that flag
     on a dead token without logging out (services/session.js), and keying on it skipped every logout after. */
  test('still logs out when invalid_token is set but the session was never torn down', async function(assert) {
    svc.set('invalid_token', true);
    var req = send();
    fail(0, DEAD);
    await req;
    assert.strictEqual(logouts, 1);
  });

  test('a failure for the old token does not end the session signed in since', async function(assert) {
    var stale = send();
    // Signed back in with a new token while that request was in flight.
    svc.set('access_token', 'token-two');
    capabilities.access_token = 'token-two';
    fail(0, DEAD);
    await stale;
    assert.strictEqual(pending[0].opts.headers['Authorization'], 'Bearer token-one');
    assert.strictEqual(logouts, 0, 'the new session stays signed in');
    var current = send();
    fail(1, DEAD);
    await current;
    assert.strictEqual(logouts, 1, "a failure for the new session's own token still logs out");
  });
});
