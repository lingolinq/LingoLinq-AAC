import { module, test } from 'qunit';
import { BOARD_RETRY_DELAYS_MS, retry_delay, create_parking } from 'frontend/utils/board_retry';
import { claim_board_retry, passing_failure } from 'frontend/utils/sync_board_fallback';

/* RETRYING A BOARD THE SYNC COULD NOT GET (Android sync fix, 2026-11-14;
 * docs/task-management/2026-11-14_android-sync-slow-problems.md, "Final plan", U2).
 *
 * A board whose lookup failed for a passing reason used to be tried once more after 10 s, with its thread asleep
 * for those 10 s, then reported as "failed retrieval for syncing" with its folders. Now it is parked: the thread
 * walks on, and when a walk has nothing else to do, ONE thread waits (its slot given back) and puts the parked
 * boards back, up to three more tries with growing waits. Cancel wakes that thread at once. The walk itself is in
 * services/persistence.js sync_boards; these cover the rules with the scheduler passed in. */
module('Unit | Utility | board retry', function() {
  function fake_scheduler() {
    var steps = [];
    var schedule = function(fn, ms) { steps.push({ fn: fn, ms: ms }); };
    schedule.steps = steps;
    schedule.run = function(idx) { steps[idx].fn(); };
    return schedule;
  }
  function slots() {
    var s = { count: 1 };
    s.release = function() { s.count--; };
    s.reacquire = function() { s.count++; };
    return s;
  }

  test('three more tries, with growing waits', function(assert) {
    assert.deepEqual(BOARD_RETRY_DELAYS_MS, [10000, 30000, 90000]);
  });

  test('each wait is within 20% of its step', function(assert) {
    assert.strictEqual(retry_delay(1, function() { return 0; }), 8000, 'first retry, lowest');
    assert.strictEqual(retry_delay(1, function() { return 1; }), 12000, 'first retry, highest');
    assert.strictEqual(retry_delay(3, function() { return 0.5; }), 90000, 'third retry, middle');
    assert.strictEqual(retry_delay(9, function() { return 0.5; }), 90000, 'past the last step, the last wait');
  });

  test('a board is claimed for three more tries in one sync, then not', function(assert) {
    var sp = { key_lookups: { b1: 'a failed lookup' } };
    var err = { error: 'timeout' };
    assert.strictEqual(claim_board_retry(sp, 'b1', err), 1, 'first retry');
    assert.false('b1' in sp.key_lookups, 'the failed lookup is dropped, so the retry asks again');
    assert.strictEqual(claim_board_retry(sp, 'b1', err), 2);
    assert.strictEqual(claim_board_retry(sp, 'b1', err), 3);
    assert.strictEqual(claim_board_retry(sp, 'b1', err), 0, 'no fourth retry: four requests in all');
    assert.strictEqual(claim_board_retry(sp, 'b2', err), 1, 'counted per board');
  });

  test('a refusal or a missing board is never retried', function(assert) {
    var sp = {};
    assert.strictEqual(claim_board_retry(sp, 'b1', { error: 'Not authorized' }), 0);
    assert.strictEqual(claim_board_retry(sp, 'b1', { fakeXHR: { status: 404 } }), 0);
  });

  test('"not online" from the adapter is a passing failure', function(assert) {
    assert.true(passing_failure({ offline: true, error: 'not online' }));
    assert.false(passing_failure({ error: 'not online' }), 'only the adapter shape, which marks it offline');
  });

  test('a thread with nothing parked does not wait', function(assert) {
    var schedule = fake_scheduler();
    var parking = create_parking(schedule);
    var s = slots();
    assert.false(parking.wait(retry_delay, s.release, function() { }));
    assert.strictEqual(schedule.steps.length, 0);
    assert.strictEqual(s.count, 1, 'the slot is kept');
  });

  test('one thread waits, with its slot given back, then the parked boards come back', function(assert) {
    var schedule = fake_scheduler();
    var parking = create_parking(schedule);
    var s = slots();
    var back = null;
    parking.park('A', 1);
    parking.park('B', 2);
    assert.strictEqual(parking.size(), 2, 'parked boards still count as to do');
    assert.true(parking.wait(function(attempt) { return attempt * 1000; }, s.release, function(boards) { s.reacquire(); back = boards; }), 'this thread waits');
    assert.strictEqual(s.count, 0, 'its slot is given back while it waits');
    assert.false(parking.wait(function() { return 1; }, s.release, function() { }), 'a second thread does not wait as well');
    assert.strictEqual(schedule.steps.length, 1, 'one wait');
    assert.strictEqual(schedule.steps[0].ms, 1000, 'as long as the earliest retry needs');
    schedule.run(0);
    assert.deepEqual(back, ['A', 'B'], 'the parked boards come back, in order');
    assert.strictEqual(s.count, 1, 'the slot is taken again');
    assert.strictEqual(parking.size(), 0);
  });

  test('cancel wakes the waiting thread at once, and its old timer then does nothing', function(assert) {
    var schedule = fake_scheduler();
    var parking = create_parking(schedule);
    var woken = 0;
    parking.park('A', 3);
    parking.wait(function() { return 90000; }, function() { }, function() { woken++; });
    parking.wake();
    assert.strictEqual(woken, 1, 'woken without waiting 90 s');
    parking.park('C', 1);
    var second = 0;
    parking.wait(function() { return 10000; }, function() { }, function() { second++; });
    schedule.run(0); // the first wait's timer, still pending
    assert.strictEqual(woken, 1, 'the first wait does not run twice');
    assert.strictEqual(second, 0, 'and does not wake the second wait early');
    schedule.run(1);
    assert.strictEqual(second, 1);
  });

  test('wake with nobody waiting does nothing', function(assert) {
    var parking = create_parking(fake_scheduler());
    parking.park('A', 1);
    parking.wake();
    assert.strictEqual(parking.size(), 1, 'the board stays parked for the next waiter');
  });
});
