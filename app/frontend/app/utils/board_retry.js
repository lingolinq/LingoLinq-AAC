// Retrying a board the sync could not get (Android sync fix, 2026-11-14;
// docs/task-management/2026-11-14_android-sync-slow-problems.md, "Final plan", U2).
//
// A board whose lookup fails for a passing reason (utils/sync_board_fallback.js passing_failure) is parked instead of
// its thread sleeping: the thread walks on to other boards. When a walk has nothing else to do, ONE of its threads
// waits, with its slot in the sync's thread limit given back (services/persistence.js add_thread), then puts the
// parked boards back on the walk. How many retries a board gets is counted per sync in
// utils/sync_board_fallback.js claim_board_retry; this module holds the waits and the one waiting thread.
//
// The sync calls `schedule` through schedule_sync_board_step, which shortens every wait under sync_testing.

// The waits before the first, second and third retry, before jitter.
export var BOARD_RETRY_DELAYS_MS = [10000, 30000, 90000];

// The wait before retry number `attempt` (1-based), within 20% either way so boards that failed together do not all
// come back at once. `random` is passed in by tests; Math.random otherwise.
export function retry_delay(attempt, random) {
  var steps = BOARD_RETRY_DELAYS_MS;
  var base = steps[Math.max(0, Math.min(attempt, steps.length) - 1)];
  var r = (random || Math.random)();
  return Math.round(base * (0.8 + 0.4 * r));
}

// One walk's parked boards and its one waiting thread. `schedule(fn, ms)` runs fn later.
export function create_parking(schedule) {
  var parked = [];
  var waiter = null;
  return {
    park: function(item, attempt) { parked.push({ item: item, attempt: attempt }); },
    // Parked boards are still to do: the progress count includes them.
    size: function() { return parked.length; },
    // A thread whose walk has nothing else to do. Returns false when there is nothing parked or another thread
    // already waits: the caller then ends that thread. Otherwise this thread waits: release() gives its slot back
    // now, and after the wait for the earliest retry, resume(items) gets every parked board back, in order.
    wait: function(delay_for, release, resume) {
      if(!parked.length || waiter) { return false; }
      var earliest = Math.min.apply(null, parked.map(function(p) { return p.attempt; }));
      var mine = {};
      mine.fire = function() {
        if(waiter !== mine) { return; } // woken already (cancel): this timer is stale
        waiter = null;
        var back = parked.splice(0);
        resume(back.map(function(p) { return p.item; }));
      };
      waiter = mine;
      release();
      schedule(mine.fire, delay_for(earliest));
      return true;
    },
    // End the wait now (the sync was cancelled): the waiting thread resumes at once and sees the cancel.
    wake: function() {
      if(waiter) { waiter.fire(); }
    }
  };
}

// Cancel wakes every walk's waiting thread (services/persistence.js cancel_sync).
export function register_parking(sync_progress, parking) {
  if(!sync_progress) { return; }
  sync_progress.retry_wakers = sync_progress.retry_wakers || [];
  sync_progress.retry_wakers.push(parking.wake);
}

export function wake_parked(sync_progress) {
  ((sync_progress && sync_progress.retry_wakers) || []).forEach(function(wake) { wake(); });
}
