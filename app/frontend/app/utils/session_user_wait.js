import RSVP from 'rsvp';
import { later as runLater, cancel as runCancel } from '@ember/runloop';

// Wait, briefly, for the signed-in user record that the app is ALREADY fetching.
//
// WHY THIS EXISTS. A route hook that needs `preferences.*` to decide where to send the
// user runs too early to read `appState.currentUser`: that is assigned inside
// `find_user`'s async `.then()` (services/app-state.js:471, :521, :544), reached from
// `setup_controller` via routes/application.js:92 `setupController`, and Ember runs every
// route's beforeModel/model/afterModel BEFORE any setupController.
//
// But the record is NOT unobtainable at that point, which is the thing that makes this
// helper possible rather than a deadlock. `global_transition` runs on `routeWillChange`,
// which fires before any `beforeModel` — `applyToState` eagerly reads `newRouteInfo.route`
// (ember-source shared-chunks/router-*.js, `let route = newRouteInfo.route`), which
// instantiates `route:application` and runs the `init()` that registers the listener, and
// only afterwards does `notifyExistingHandlers` fire `routeWillChange`. `global_transition`
// then calls `refresh_session_user()` when there is a session but no user yet
// (services/app-state.js:742-744), and that function RETURNS its
// `findRecord('user','self')` promise (:2218-2220).
//
// So a fetch is already in flight. This helper waits on that one. It deliberately does
// NOT start a request of its own, poll, observe, or cache anything.
//
// CONTRACT — it ALWAYS resolves, and never rejects:
//   - with the user record, if the in-flight fetch settles first;
//   - with `null` at the timeout, or on rejection, or when nothing is in flight.
// The caller applies its own default on `null`. A rejection propagating out of a
// `beforeModel` would abort the transition, and in production nothing would recover the
// boot skeleton: the 12s safety timer exists only in the dev index.html, while the
// Rails-served boards/index.html.erb has none and relies on app-state.js:625-628 (the end
// of setup_controller) to remove it.
export const DEFAULT_WAIT_MS = 1200;

export function wait_for_session_user(appState, opts) {
  var options = opts || {};
  var timeout = options.timeout || DEFAULT_WAIT_MS;
  // The timer pair is injectable ONLY so a test can observe that the pending timeout is
  // cancelled. Asserting that via the global runloop (`_hasScheduledTimers`) does not
  // work — the framework has its own timers in flight, so it reports true regardless and
  // the assertion fails whether or not this code is correct. Production always uses the
  // runloop functions below.
  var later_fn = options.later || runLater;
  var cancel_fn = options.cancel || runCancel;
  // `opts.promise` lets the caller wait for a DIFFERENT record than the account holder's.
  // routes/board.js uses it in speak mode, where the preference that matters belongs to
  // the communicator, not the signed-in supporter.
  var promise = options.promise || (appState && appState.get && appState.get('session_user_promise'));
  if(!promise || typeof promise.then !== 'function') { return RSVP.resolve(null); }

  return new RSVP.Promise(function(resolve) {
    // No `this` in here on purpose — inside an RSVP executor `this` is not the caller
    // (CLAUDE.md, and the lingolinq/no-this-in-promise-executor rule).
    var settled = false;
    // runLater, NOT setTimeout. A native timer is invisible to Ember's `settled()`, so it
    // fires after test teardown and resolves against a destroyed world — the documented
    // rule-10 flake shape. A runloop timer is waited on instead, which is why cancelling
    // it below is required rather than tidy.
    var timer = later_fn(function() {
      if(settled) { return; }
      settled = true;
      resolve(null);
    }, timeout);

    var finish = function(user) {
      if(settled) { return; }
      settled = true;
      cancel_fn(timer);
      resolve(user || null);
    };
    promise.then(finish, function() { finish(null); });
  });
}

export default wait_for_session_user;
