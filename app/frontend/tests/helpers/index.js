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
// setTimeout(0)). If the store is destroyed in teardown before that flush runs, the flush hits the
// destroyed store ("Attempted to call store.adapterFor(), but the store instance has already been
// destroyed") and QUnit charges that global failure to whichever test is running. So before the
// owner is torn down, wait (bounded) until no fetch is still queued. Reads Ember Data's private
// _fetchManager._pendingFetch: test-only. Returns true when a fetch was still queued at entry.
//
// What this does and does not see: a fetch queued during the test body is normally flushed before
// this hook runs (its setTimeout(0) was set before the ones QUnit uses to end the test and reach
// afterEach), so it catches only a fetch queued late (after the test signalled it was done). It is
// not a detector for tests that do not wait for their fetches. The detector is the slowed-flush probe
// described in commit 7b0848298, which found and fixed the 9 tests that did not wait.
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

// Tests that ended with an Ember Data fetch still queued. Each is logged inside its own test, which is
// where testem shows console output; the Ember shard jobs copy those lines into the job summary
// (.github/workflows/ci.yml). The QUnit.done list is only visible in a browser console run: testem
// does not print console output from outside a test. A queued fetch at teardown is timing-dependent,
// so this reports rather than fails: failing would make a required check flaky.
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
