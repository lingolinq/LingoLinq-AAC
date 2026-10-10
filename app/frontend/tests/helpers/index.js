import {
  setupApplicationTest as upstreamSetupApplicationTest,
  setupRenderingTest as upstreamSetupRenderingTest,
  setupTest as upstreamSetupTest,
} from 'ember-qunit';
import { primeAllServices } from './persistence-stub';
import QUnit from 'qunit';

// This file exists to provide wrappers around ember-qunit's / ember-mocha's
// test setup functions. This way, you can easily extend the setup that is
// needed per test type.

function setupApplicationTest(hooks, options) {
  upstreamSetupApplicationTest(hooks, options);

  // Additional setup for application tests can be done here.
  //
  // For example, if you need an authenticated session for each
  // application test, you could do:
  //
  // hooks.beforeEach(async function () {
  //   await authenticateSession(); // ember-simple-auth
  // });
  //
  // This is also a good place to call test setup functions coming
  // from other addons:
  //
  // setupIntl(hooks); // ember-intl
  // setupMirage(hooks); // ember-cli-mirage
}

function setupRenderingTest(hooks, options) {
  upstreamSetupRenderingTest(hooks, options);

  // Additional setup for rendering tests can be done here.
}

// Ember Data queues a fetch and sends it a tick later (FetchManager.scheduleFetch flushes from a
// setTimeout(0)). A test that triggers a fetch and ends at once can have its store destroyed in
// teardown before that flush runs; the flush then hits the destroyed store ("Attempted to call
// store.adapterFor(), but the store instance has already been destroyed") and QUnit charges that
// global failure to whichever test is running: a wandering, timing-dependent failure. Found by
// slowing only that flush by 100 ms: 9 tests in 5 modules queued a fetch they did not wait for
// (task log 2026-10-05_ci-test-stalls.md). So before the owner is torn down, wait (bounded) until
// no fetch is still queued. Reads Ember Data's private _fetchManager._pendingFetch: test-only.
// Returns true when a fetch was still queued at entry: the test ended without waiting for it. The
// wait protects the NEXT test from the late flush; it does not make the offending test correct, so
// setupTest reports it (queuedFetchReport) instead of hiding it.
export async function waitForQueuedStoreFetches(owner, maxWaitMs = 500) {
  if (!owner || owner.isDestroyed || owner.isDestroying) { return false; }
  let store;
  try { store = owner.lookup('service:store'); } catch (e) { return false; }
  const fetchManager = store && !store.isDestroyed && store._fetchManager;
  const pending = () => fetchManager && fetchManager._pendingFetch && fetchManager._pendingFetch.size > 0;
  const wasPending = !!pending();
  const deadline = Date.now() + maxWaitMs;
  while (pending() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return wasPending;
}

// Tests that ended with an Ember Data fetch still queued (they did not await it). Each is logged when
// found and listed again when the run ends, so a new offender shows up in the CI log rather than being
// absorbed by the wait above. A queued fetch at teardown is timing-dependent (the flush is a
// setTimeout(0)), so this reports rather than fails: failing would make a required check flaky.
export const queuedFetchReport = [];
let queuedFetchSummaryRegistered = false;
function recordQueuedFetch() {
  const current = QUnit.config.current;
  const name = current ? `${current.module.name}: ${current.testName}` : '(unknown test)';
  queuedFetchReport.push(name);
  // eslint-disable-next-line no-console
  console.warn(`[queued-fetch] test ended with an Ember Data fetch still queued (await it): ${name}`);
  if (!queuedFetchSummaryRegistered) {
    queuedFetchSummaryRegistered = true;
    QUnit.done(function() {
      // eslint-disable-next-line no-console
      console.warn(`[queued-fetch] ${queuedFetchReport.length} test(s) ended with a queued fetch:\n  ${queuedFetchReport.join('\n  ')}`);
    });
  }
}

function setupTest(hooks, options) {
  // Booted app + stubbed persistence leave orphan RSVP/runLater work that
  // never settles; ember-qunit's afterEach settled() then hangs ~60s.
  upstreamSetupTest(hooks, { waitForSettled: false, ...options });

  hooks.beforeEach(function() {
    if (this.owner) {
      primeAllServices(this.owner);
    }
  });

  // Registered after ember-qunit's teardown hook, so it runs BEFORE it (QUnit runs afterEach hooks
  // in reverse order of registration).
  hooks.afterEach(async function() {
    if (await waitForQueuedStoreFetches(this.owner)) { recordQueuedFetch(); }
  });
}

export { setupApplicationTest, setupRenderingTest, setupTest };
export {
  persistenceTarget,
  primePersistenceService,
  stubPersistence,
  stubPersistenceAjax,
  stubPersistenceGet
} from './persistence-stub';
