import {
  setupApplicationTest as upstreamSetupApplicationTest,
  setupRenderingTest as upstreamSetupRenderingTest,
  setupTest as upstreamSetupTest,
} from 'ember-qunit';
import { primeAllServices } from './persistence-stub';
import QUnit from 'qunit';
import { fetchProbeDelay } from './fetch-probe';

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
// What this sees: whatever is still queued when this hook starts. After a SYNCHRONOUS plain QUnit test
// that is any fetch it did not wait for (QUnit goes from the test body to its hooks in a microtask,
// before the setTimeout(0) flush), unless an async afterEach of its module runs first (hooks registered
// after setupTest run before this one, and an async hook lets the flush happen). After an async test or a jasmine-style it() (which ends through
// assert.async, then a setTimeout), a fetch queued during the body is normally flushed already, so
// only a fetch queued after the test signalled it was done is seen. It therefore does not find every
// test that skips waiting; the opt-in fetch probe does (`?probeDelay=`, tests/test-helper.js; it found
// and fixed 9, commit 7b0848298). setupTest fails the test on a hit (owner decision, PR #1118); the
// wait still runs first, so the late flush does not reach a destroyed store in the next test.
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

// Tests that ended with an Ember Data fetch still queued: setupTest fails each one and logs it here as
// well, during its own test, so testem prints the line with that test's result and the Ember shard jobs
// copy it into the job summary (.github/workflows/ci.yml). The QUnit.done list is only visible in a
// browser console run: testem prints console output with the next test result, and after the last one
// there is none.
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
  hooks.afterEach(async function(assert) {
    // Under the opt-in fetch probe every flush is delayed, so wait past that delay too: the flush must
    // still run before teardown (the hit is decided at entry either way).
    if (await waitForQueuedStoreFetches(this.owner, 500 + fetchProbeDelay())) {
      recordQueuedFetch();
      assert.pushResult({ result: false, actual: 'an Ember Data fetch still queued', expected: 'no fetch queued at teardown', message: 'an Ember Data fetch was still queued when this test ended: await it (or the state it sets) before the test ends. It can also be late work from an EARLIER test landing here; reproduce deterministically with `ember test --query "probeDelay=1500" --filter <module>` (tests/test-helper.js)' });
    }
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
