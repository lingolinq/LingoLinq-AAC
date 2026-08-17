import { setupTest } from 'frontend/tests/helpers';
import * as QUnit from 'qunit';

/*
 * Queued events must be DELIVERED when connectivity returns, not merely retained.
 *
 * persistence#on_connect propagates its `online` flag onto this service on every
 * change, but nothing acted on it. push_log's other triggers are all user
 * activity plus persistence#sync — and sync only runs on reconnect when
 * check_for_needs_sync decides one is warranted (auth_settings + auto_sync + a
 * CHANGED server sync_stamp). A user who worked offline, came back online and
 * then stopped using the app hit none of those, so their events stayed in
 * localStorage indefinitely.
 *
 * These drive the service's own `online` property, which is exactly what
 * persistence sets (utils/persistence.js:3967) — so the trigger under test is
 * the real one, not a stand-in.
 */
QUnit.module('Unit | stashes reconnect drain', function(hooks) {
  setupTest(hooks);

  // Count push_log calls without letting a real one run: the real method builds
  // an Ember Data record and saves it.
  var track = function(svc) {
    var calls = [];
    svc.push_log = function(only_if_convenient) { calls.push(only_if_convenient); };
    return calls;
  };

  var svc = function(owner, starting_online) {
    var s = owner.lookup('service:stashes');
    s.set('online', starting_online);
    s._was_online = starting_online;
    return s;
  };

  QUnit.test('drains when the connection comes back', function(assert) {
    const s = svc(this.owner, false);
    const calls = track(s);

    s.set('online', true);

    assert.strictEqual(calls.length, 1, 'coming back online must flush the queue by itself');
  });

  QUnit.test('flushes unconditionally, not "if convenient"', function(assert) {
    const s = svc(this.owner, false);
    const calls = track(s);

    s.set('online', true);

    // only_if_convenient must be falsy or push_log's own >50-events / >30-minutes
    // heuristics can silently suppress the very flush this exists to force.
    assert.notOk(calls[0], 'the reconnect flush must not be suppressible by the size/age heuristics');
  });

  QUnit.test('does NOT fire when already online (no edge)', function(assert) {
    const s = svc(this.owner, true);
    const calls = track(s);

    s.set('online', true);
    s.notifyPropertyChange('online');

    assert.strictEqual(calls.length, 0, 'persistence re-propagating a true must not re-enter push_log');
  });

  QUnit.test('does NOT fire on going offline', function(assert) {
    const s = svc(this.owner, true);
    const calls = track(s);

    s.set('online', false);

    assert.strictEqual(calls.length, 0, 'losing the connection is not a reason to push');
  });

  QUnit.test('does NOT fire on the boot seed', function(assert) {
    // init() records _was_online BEFORE setting online, so the seed is not an
    // edge. Modelled here as "no known previous state".
    const s = this.owner.lookup('service:stashes');
    s._was_online = undefined;
    const calls = track(s);

    s.set('online', true);

    assert.strictEqual(calls.length, 0, 'with no known previous state there is no edge — do nothing rather than guess');
  });

  QUnit.test('clears the timestamp-form error backoff so the drain is not swallowed', function(assert) {
    const s = svc(this.owner, false);
    track(s);
    // 4th+ failure stores a TIMESTAMP; wait_on_error then blocks push_log for
    // two minutes, and nothing retries after it expires.
    s.errored_at = s.current_timestamp();

    s.set('online', true);

    assert.strictEqual(s.errored_at, null,
      'a connectivity change retires the backoff, whose premise was a failing server');
  });

  QUnit.test('leaves the counter-form errored_at alone', function(assert) {
    const s = svc(this.owner, false);
    track(s);
    // First three failures store a COUNTER (1..3). Only values > 10 gate
    // wait_on_error, so clearing a counter would discard failure history for
    // no benefit.
    s.errored_at = 2;

    s.set('online', true);

    assert.strictEqual(s.errored_at, 2, 'the counter form does not gate wait_on_error and must survive');
  });
});
