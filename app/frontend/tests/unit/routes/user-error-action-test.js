import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import modal from 'frontend/utils/modal';

/* THE `:user_id` ROUTE MUST LET ITS ERRORS REACH THE ERROR PAGE.
 *
 * Its error action answered 404, 400 and 403 with `this.router.transitionTo('error')` and
 * `return false`. There is no transitionable `error` route (router.js has none; Ember's
 * auto-generated one needs an `:error` segment), so that transition rendered nothing, and the
 * `return false` marked the error handled, so Ember's substate never rendered either. Measured
 * live (2026-10-10): opening another user's page that the API refuses left the route on `user`
 * with no error page. A supporter refused a communicator's page saw a navigation that did
 * nothing. Bubbling (`return true`) lets the application route's action clear board state and
 * Ember render templates/error.hbs.
 *
 * EXCEPT WHILE THE SESSION IS ENDING: then the force-logout dialog is the page, and in-flight
 * requests answer 400 as anonymous, which must not replace it with "Failed to load". Held back
 * only while that dialog is OPEN (2026-10-11, approved): after an in-app logout it is closed but
 * `logout_under_way()` stays true until the next sign-in, and a signed-out visitor still needs the
 * error page.
 */
module('Unit | routes/user error action', function(hooks) {
  setupTest(hooks);

  var originalIsOpen = modal.is_open;
  hooks.afterEach(function() { modal.is_open = originalIsOpen; });

  function errorAction(context, flags) {
    modal.is_open = function(template) { return !!flags.dialog_open && template === 'force-logout'; };
    var session = context.owner.lookup('service:session');
    session.set('invalid_token', !!flags.invalid_token);
    session.set('isAuthenticated', flags.isAuthenticated !== false);
    var route = context.owner.lookup('route:user');
    var transitions = [];
    route.router = { transitionTo: function(name) { transitions.push(name); } };
    return function(error) {
      return { bubbled: route.actions.error.call(route, error, null), transitions: transitions };
    };
  }
  var denial = { fakeXHR: { status: 400, responseJSON: { error: 'Not authorized', unauthorized: true } },
                 message: 'Bad Request', result: 'Not authorized' };

  test('a permission denial on a healthy session bubbles to the error page', function(assert) {
    var res = errorAction(this, {})(denial);
    assert.true(res.bubbled, 'bubbles, so Ember renders templates/error.hbs');
    assert.deepEqual(res.transitions, [], 'no transition to a route that does not exist');
  });

  test('a 403 bubbles too', function(assert) {
    var res = errorAction(this, {})({ fakeXHR: { status: 403 }, result: 'Forbidden' });
    assert.true(res.bubbled);
  });

  test('a 404 bubbles too', function(assert) {
    var res = errorAction(this, {})({ fakeXHR: { status: 404 }, result: 'Not found' });
    assert.true(res.bubbled);
    assert.deepEqual(res.transitions, []);
  });

  test('a reserved path (already redirected by the model hook) is still swallowed', function(assert) {
    var res = errorAction(this, {})({ status: 404, reserved_path: true });
    assert.false(res.bubbled);
  });

  test('an anonymous 400 landing after the logout teardown does not replace the dialog', function(assert) {
    var res = errorAction(this, { invalid_token: true, isAuthenticated: false, dialog_open: true })(denial);
    assert.false(res.bubbled);
    assert.deepEqual(res.transitions, []);
  });

  test('after an in-app logout (dialog closed, flag still set) errors reach the error page again', function(assert) {
    var res = errorAction(this, { invalid_token: true, isAuthenticated: false, dialog_open: false })({ fakeXHR: { status: 404 }, result: 'Not found' });
    assert.true(res.bubbled);
  });

  test('a dead-session response itself does not render the error page', function(assert) {
    var res = errorAction(this, {})({ fakeXHR: { status: 400, responseJSON: { error: 'Token needs refresh', invalid_token: true } },
                                      result: 'Token needs refresh' });
    assert.false(res.bubbled);
  });

  test('other errors still bubble, as before', function(assert) {
    var res = errorAction(this, {})({ fakeXHR: { status: 500 }, result: 'boom' });
    assert.true(res.bubbled);
  });
});
