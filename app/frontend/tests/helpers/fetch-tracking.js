import Store from 'ember-data/store';
import QUnit from 'qunit';

// Which test was current when each pending Ember Data fetch was queued. setupTest's teardown check
// (tests/helpers/index.js) uses it to tell a fetch queued while no test or another test was current
// (between tests) from one queued during the test that is ending. It cannot tell an EARLIER test's late
// callback that runs during this test from this test's own work (both are queued while this test is
// current), which is why that check only fails in timing-strict runs (tests/helpers/fetch-probe.js).
//
// Also the opt-in fetch probe (`?probeDelay=<ms>`, tests/helpers/fetch-probe.js): every flush is then
// delayed by that long, so a fetch queued near the end of a test is still pending when the teardown
// check looks. Both are patched on the FetchManager prototype, reached through the store's lazily
// assigned _fetchManager, so every store is covered.
const QUEUED_BY = '__queuedByTests';
let installed = false;

export function installFetchTracking(probeDelay) {
  if (installed) { return; }
  installed = true;
  Object.defineProperty(Store.prototype, '_fetchManager', {
    configurable: true,
    get() { return this.__trackedFetchManager; },
    set(manager) {
      const proto = manager && Object.getPrototypeOf(manager);
      if (proto && !proto.__fetchTrackingInstalled) {
        proto.__fetchTrackingInstalled = true;
        const schedule = proto.scheduleFetch;
        proto.scheduleFetch = function() {
          const current = QUnit.config.current;
          (this[QUEUED_BY] = this[QUEUED_BY] || new Set()).add(current ? current.testId : null);
          return schedule.apply(this, arguments);
        };
        const flush = proto.flushAllPendingFetches;
        proto.flushAllPendingFetches = function() {
          const self = this;
          const run = function() {
            flush.call(self);
            if (!self._pendingFetch || self._pendingFetch.size === 0) { self[QUEUED_BY] = null; }
          };
          if (probeDelay > 0) { setTimeout(run, probeDelay); } else { run(); }
        };
        if (probeDelay > 0) {
          // eslint-disable-next-line no-console
          console.warn(`[fetch-probe] every Ember Data fetch flush is delayed by ${probeDelay} ms`);
        }
      }
      this.__trackedFetchManager = manager;
    }
  });
}

// True when every fetch the manager still holds was queued while ANOTHER test (or no test) was current.
export function queuedOnlyByOtherTests(fetchManager, testId) {
  const by = fetchManager && fetchManager[QUEUED_BY];
  return !!by && by.size > 0 && !by.has(testId);
}

// Test-only: mark a manager's queued fetches as another test's, to exercise the attribution.
export function markQueuedByAnotherTest(fetchManager) {
  fetchManager[QUEUED_BY] = new Set(['another-test']);
}
