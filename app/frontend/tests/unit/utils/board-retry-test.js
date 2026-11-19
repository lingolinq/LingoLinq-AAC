import { module, test } from 'qunit';
import { BOARD_RETRY_DELAYS_MS, retry_delay, create_parking, when_slot_free } from 'frontend/utils/board_retry';
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

  // Rewritten with Traci's approval (2026-11-16): the rule changed with the Codex re-review of #1322. Each parked board
  // now keeps its own wait, so B (second retry, 2 s) no longer comes back with A (first retry, 1 s).
  test('one thread waits, with its slot given back, then the parked boards come back', function(assert) {
    var schedule = fake_scheduler();
    var c = { t: 0 };
    var parking = create_parking(schedule, function() { return c.t; });
    var s = slots();
    var back = null;
    var by_attempt = function(attempt) { return attempt * 1000; };
    var resume = function(boards) { s.reacquire(); back = boards; };
    parking.park('A', 1);
    parking.park('B', 2);
    assert.strictEqual(parking.size(), 2, 'parked boards still count as to do');
    assert.true(parking.wait(by_attempt, s.release, resume), 'this thread waits');
    assert.strictEqual(s.count, 0, 'its slot is given back while it waits');
    assert.false(parking.wait(function() { return 1; }, s.release, function() { }), 'a second thread does not wait as well');
    assert.strictEqual(schedule.steps.length, 1, 'one wait');
    assert.strictEqual(schedule.steps[0].ms, 1000, 'as long as the earliest retry needs');
    c.t = 1000;
    schedule.run(0);
    assert.deepEqual(back, ['A'], 'the board whose wait is over comes back');
    assert.strictEqual(s.count, 1, 'the slot is taken again');
    assert.strictEqual(parking.size(), 1, 'B keeps its own longer wait');
    assert.true(parking.wait(by_attempt, s.release, resume), 'the thread waits again for B');
    assert.strictEqual(schedule.steps[1].ms, 1000, 'the rest of its 2 s');
    c.t = 2000;
    schedule.run(1);
    assert.deepEqual(back, ['B']);
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

  // Codex re-review of #1322 (P2), and the review of the first fix: each parked board keeps its own wait, counted from
  // when it was parked. The clock is passed in, so every wait is exact.
  function clock_at(start) {
    var c = { t: start || 0 };
    c.now = function() { return c.t; };
    return c;
  }
  var WAITS = { 1: 10000, 2: 30000, 3: 90000 };
  function delay_for(attempt) { return WAITS[attempt]; }

  test('a board on a later retry keeps its own longer wait', function(assert) {
    var schedule = fake_scheduler();
    var c = clock_at(0);
    var parking = create_parking(schedule, c.now);
    var back = [];
    parking.park('A', 1);
    parking.park('B', 3);
    assert.true(parking.wait(delay_for, function() { }, function(boards) { back.push(boards); }));
    assert.strictEqual(schedule.steps[0].ms, 10000, 'armed for the earliest board');
    c.t = 10000;
    schedule.run(0);
    assert.deepEqual(back, [['A']], 'only the board whose wait is over comes back');
    assert.strictEqual(parking.size(), 1, 'the other stays parked');
    assert.true(parking.wait(delay_for, function() { }, function(boards) { back.push(boards); }));
    assert.strictEqual(schedule.steps[1].ms, 80000, 'then the rest of its own 90 s wait');
    c.t = 90000;
    schedule.run(1);
    assert.deepEqual(back, [['A'], ['B']]);
  });

  test('a wait counts from when the board was parked, not from when a thread started waiting', function(assert) {
    var schedule = fake_scheduler();
    var c = clock_at(0);
    var parking = create_parking(schedule, c.now);
    parking.park('A', 1);
    c.t = 6000; // the walk had other boards to do first
    parking.wait(delay_for, function() { }, function() { });
    assert.strictEqual(schedule.steps[0].ms, 4000, '10 s from the park, 6 s of it already gone');
  });

  test('a board parked during a wait gets its own wait: sooner re-arms the timer, later waits its turn', function(assert) {
    var schedule = fake_scheduler();
    var c = clock_at(0);
    var parking = create_parking(schedule, c.now);
    var back = [];
    parking.park('A', 3); // due at 90 s
    parking.wait(delay_for, function() { }, function(boards) { back.push(boards); });
    c.t = 1000;
    parking.park('B', 1); // due at 11 s: sooner than the pending wait
    assert.strictEqual(schedule.steps.length, 2, 're-armed');
    assert.strictEqual(schedule.steps[1].ms, 10000);
    c.t = 11000;
    schedule.run(1);
    assert.deepEqual(back, [['B']], 'B after its own 10 s, A still waiting for its 90 s');
    schedule.run(0); // the first timer, superseded
    assert.deepEqual(back, [['B']], 'the superseded timer does nothing');
    assert.strictEqual(parking.size(), 1);
  });

  // The timer runs on Ember's runLater (Date.now) while due times use the monotonic clock, so a wall clock moved
  // forward between the first arm and the re-arm can fire the superseded timer FIRST. It must still do nothing.
  test('a superseded timer that fires before the newer one brings nothing back early', function(assert) {
    var schedule = fake_scheduler();
    var c = clock_at(0);
    var parking = create_parking(schedule, c.now);
    var back = [];
    parking.park('A', 3); // due at 90 s
    parking.wait(delay_for, function() { }, function(boards) { back.push(boards); });
    c.t = 1000;
    parking.park('B', 1); // due at 11 s: re-arms the timer
    assert.strictEqual(schedule.steps.length, 2, 're-armed');
    c.t = 5000;
    schedule.run(0); // the superseded timer fires early (wall clock moved forward)
    assert.deepEqual(back, [], 'B is not back before its own 10 s');
    assert.strictEqual(parking.size(), 2, 'both boards still parked');
    c.t = 11000;
    schedule.run(1);
    assert.deepEqual(back, [['B']], 'B comes back when its wait is over');
  });

  test('boards already due come back together, and the thread keeps its download slot', function(assert) {
    var schedule = fake_scheduler();
    var c = clock_at(0);
    var parking = create_parking(schedule, c.now);
    var released = 0;
    var back = null;
    var kept = null;
    ['A', 'B', 'C'].forEach(function(b) { parking.park(b, 1); });
    c.t = 15000; // all three are overdue
    assert.true(parking.wait(delay_for, function() { released++; }, function(boards, kept_slot) { back = boards; kept = kept_slot; }));
    assert.deepEqual(back, ['A', 'B', 'C'], 'all at once, in order');
    assert.true(kept, 'the thread keeps its slot');
    assert.strictEqual(released, 0, 'no slot given back');
    assert.strictEqual(schedule.steps.length, 0, 'no timer');
  });

  test('cancel still brings back every parked board at once', function(assert) {
    var parking = create_parking(fake_scheduler(), clock_at(0).now);
    var back = null;
    parking.park('A', 1);
    parking.park('B', 3);
    parking.wait(delay_for, function() { }, function(boards) { back = boards; });
    parking.wake();
    assert.deepEqual(back, ['A', 'B']);
  });

  // Codex re-review of #1322 (P2): a resumed thread took a download slot directly, so several walks' waiters could
  // resume above the limit on concurrent downloads.
  test('a resumed thread waits for a free download slot', function(assert) {
    var schedule = fake_scheduler();
    var full = true;
    var started = 0;
    when_slot_free(function() { return full; }, schedule, function() { started++; });
    assert.strictEqual(started, 0, 'not while the limit is reached');
    assert.strictEqual(schedule.steps.length, 1, 'it checks again later');
    full = false;
    schedule.run(0);
    assert.strictEqual(started, 1, 'started once a slot is free');
  });

  test('wake with nobody waiting does nothing', function(assert) {
    var parking = create_parking(fake_scheduler());
    parking.park('A', 1);
    parking.wake();
    assert.strictEqual(parking.size(), 1, 'the board stays parked for the next waiter');
  });
});
