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

// A clock that only moves forward (a device clock set back cannot hold parked boards).
function monotonic_now() {
  if(typeof performance !== 'undefined' && performance && typeof performance.now === 'function') { return performance.now(); }
  return (new Date()).getTime();
}

// One walk's parked boards and its one waiting thread. `schedule(fn, ms)` runs fn later; `now()` is the clock
// (monotonic unless a test passes one).
//
// Each parked board keeps its own wait, counted from when it was parked: delay_for(attempt) for its retry number
// (Codex re-review of #1322: a board on its third retry, about 90 s, was brought back by a newer board's first wait of
// about 10 s). A wait's timer is armed for the earliest due board and re-armed when a board parked during the wait is
// due sooner. When it fires, every board due by then comes back together, overdue ones included (one per wait would
// give up the download slot once per board).
export function create_parking(schedule, now) {
  var clock = now || monotonic_now;
  var parked = [];
  var waiter = null;
  var due_of = function(p, delay_for) {
    if(p.due === null && delay_for) { p.due = p.at + delay_for(p.attempt); }
    return p.due;
  };
  var earliest = function(delay_for) {
    return Math.min.apply(null, parked.map(function(p) { return due_of(p, delay_for); }));
  };
  // The boards due by `by`, taken out of the parked list, in the order they were parked.
  var take_due = function(by, delay_for) {
    var back = [];
    parked = parked.filter(function(p) {
      if(due_of(p, delay_for) <= by) { back.push(p.item); return false; }
      return true;
    });
    return back;
  };
  var arm = function(mine, at) {
    mine.target = at;
    mine.seq = (mine.seq || 0) + 1;
    var seq = mine.seq;
    schedule(function() {
      if(waiter !== mine || mine.seq !== seq) { return; } // woken already, or re-armed: this timer is stale
      mine.fire(false);
    }, Math.max(0, at - clock()));
  };
  return {
    park: function(item, attempt) {
      var p = { item: item, attempt: attempt, at: clock(), due: null };
      parked.push(p);
      // Parked while a thread waits: its own wait counts, so the timer is re-armed when it is due sooner.
      if(waiter && waiter.delay_for && due_of(p, waiter.delay_for) < waiter.target) { arm(waiter, p.due); }
    },
    // Parked boards are still to do: the progress count includes them.
    size: function() { return parked.length; },
    // A thread whose walk has nothing else to do. Returns false when there is nothing parked or another thread
    // already waits: the caller then ends that thread. When boards are already due, they come back at once and the
    // thread keeps its slot: resume(items, true). Otherwise this thread waits: release() gives its slot back now,
    // and when the earliest board is due, resume(items, false) gets back every board due by then, in order.
    wait: function(delay_for, release, resume) {
      if(!parked.length || waiter) { return false; }
      if(earliest(delay_for) <= clock()) {
        resume(take_due(clock(), delay_for), true);
        return true;
      }
      var mine = { delay_for: delay_for };
      mine.fire = function(all) {
        if(waiter !== mine) { return; }
        waiter = null;
        var back = all ? take_due(Infinity, delay_for) : take_due(Math.max(clock(), mine.target), delay_for);
        resume(back, false);
      };
      waiter = mine;
      release();
      arm(mine, earliest(delay_for));
      return true;
    },
    // End the wait now (the sync was cancelled, or Try now): the waiting thread resumes at once with every parked
    // board, and sees the cancel.
    wake: function() {
      if(waiter) { waiter.fire(true); }
    }
  };
}

// A resumed thread starts again only through the download limit (services/persistence.js add_thread), so several
// walks' waiting threads cannot resume above it at once (Codex re-review of #1322). `is_full()` says whether the
// limit is reached; `go()` takes the slot and starts.
export function when_slot_free(is_full, schedule, go) {
  if(is_full()) {
    schedule(function() { when_slot_free(is_full, schedule, go); }, 1000);
  } else {
    go();
  }
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
