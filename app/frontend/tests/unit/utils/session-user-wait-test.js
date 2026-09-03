import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import { setupTest } from '../../helpers';
import { wait_for_session_user } from 'frontend/utils/session_user_wait';

/* The cold-boot wait for the signed-in user record.
 *
 * `routes/board.js#beforeModel` has to know `preferences.board_view_style` to pick the
 * board shell, but `appState.currentUser` is null that early. It is NOT unobtainable,
 * though: `global_transition` runs on `routeWillChange` — which fires BEFORE any
 * `beforeModel`, because `applyToState` eagerly instantiates `route:application`
 * (ember-source router chunk, `let route = newRouteInfo.route`) and that registers the
 * listener — and it calls `refresh_session_user()`, which RETURNS the
 * `findRecord('user','self')` promise (services/app-state.js:742-744, :2218-2220).
 *
 * So the record is already in flight. This helper waits on that existing promise rather
 * than starting a second request, polling, or caching anything.
 *
 * The contract that matters, and the reason each test exists:
 *   - it ALWAYS resolves, never rejects. Production has no boot-overlay safety timer
 *     (the 12s rescue lives only in the dev index.html; the Rails-served
 *     boards/index.html.erb has none), so a rejected or hanging promise here strands the
 *     user on the skeleton with nothing to remove it.
 *   - it resolves at a timeout if the record does not arrive, so a slow or dead network
 *     costs a bounded delay and then today's default.
 *   - it CANCELS its timer when the record arrives first. An uncancelled `runLater`
 *     keeps `settled()` waiting and stalls every test that touches this path; a native
 *     `setTimeout` would be worse still, being invisible to `settled()` and firing after
 *     teardown — the CLAUDE.md rule-10 flake shape exactly.
 */
module('Unit | Utility | session_user_wait', function(hooks) {
  setupTest(hooks);

  function appStateWith(promise, currentUser) {
    return EmberObject.create({
      session_user_promise: promise,
      currentUser: currentUser || null
    });
  }

  test('resolves with the record when the in-flight promise settles first', async function(assert) {
    var user = EmberObject.create({ user_name: 'bethany' });
    var res = await wait_for_session_user(appStateWith(RSVP.resolve(user)), { timeout: 50 });
    assert.strictEqual(res, user, 'hands back the record the app was already fetching');
  });

  test('resolves with null at the timeout when the record never arrives', async function(assert) {
    // A promise that never settles — a dead network, not a rejection.
    var never = new RSVP.Promise(function() {});
    var res = await wait_for_session_user(appStateWith(never), { timeout: 20 });
    assert.strictEqual(res, null, 'bounded wait, then the caller applies its default');
  });

  test('RESOLVES (never rejects) when the fetch rejects', async function(assert) {
    var rejected = RSVP.reject(new Error('offline'));
    var settled = false;
    var res = await wait_for_session_user(appStateWith(rejected), { timeout: 50 })
      .then(function(v) { settled = true; return v; });
    assert.true(settled, 'a rejection must not propagate out of beforeModel');
    assert.strictEqual(res, null, 'and reports "no record" rather than throwing');
  });

  test('resolves immediately with null when there is no in-flight promise', async function(assert) {
    var res = await wait_for_session_user(appStateWith(null), { timeout: 50 });
    assert.strictEqual(res, null, 'nothing to wait for');
  });

  /* An uncancelled timer keeps the runloop busy, so `settled()` waits out the whole
     timeout for every test that touches this path — a missing cancel shows up as a
     HANGING suite rather than a failing assertion, which is the kind of red run
     CLAUDE.md rule 10 says costs a session to diagnose.

     Asserted through injected timer functions rather than the global runloop:
     `_hasScheduledTimers()` reports the framework's own pending timers too, so it is
     true whether or not this code cancels, and an assertion on it fails either way. */
  test('cancels its timeout when the record arrives first', async function(assert) {
    var user = EmberObject.create({ user_name: 'bethany' });
    var handle = { token: 'timeout-handle' };
    var cancelled = [];
    var res = await wait_for_session_user(appStateWith(RSVP.resolve(user)), {
      timeout: 30000,
      later: function() { return handle; },
      cancel: function(h) { cancelled.push(h); }
    });
    assert.strictEqual(res, user, 'resolved from the record, not the timer');
    assert.deepEqual(cancelled, [handle], 'the pending timeout was cancelled, with its own handle');
  });

  test('does not cancel anything when the timeout is what resolves it', async function(assert) {
    var never = new RSVP.Promise(function() {});
    var cancelled = [];
    var fire;
    var res = await wait_for_session_user(appStateWith(never), {
      timeout: 5,
      later: function(fn) { fire = fn; setTimeout(fn, 0); return { token: 'h' }; },
      cancel: function(h) { cancelled.push(h); }
    });
    assert.strictEqual(res, null, 'the timeout supplied the answer');
    assert.deepEqual(cancelled, [], 'nothing to cancel on the timeout path');
    assert.ok(fire, 'the timeout callback was the one registered');
  });
});
