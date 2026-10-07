import {
  setupApplicationTest as upstreamSetupApplicationTest,
  setupRenderingTest as upstreamSetupRenderingTest,
  setupTest as upstreamSetupTest,
} from 'ember-qunit';
import { primeAllServices } from './persistence-stub';

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
export async function waitForQueuedStoreFetches(owner, maxWaitMs = 500) {
  if (!owner || owner.isDestroyed || owner.isDestroying) { return; }
  let store;
  try { store = owner.lookup('service:store'); } catch (e) { return; }
  const fetchManager = store && !store.isDestroyed && store._fetchManager;
  const pending = () => fetchManager && fetchManager._pendingFetch && fetchManager._pendingFetch.size > 0;
  const deadline = Date.now() + maxWaitMs;
  while (pending() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
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
    await waitForQueuedStoreFetches(this.owner);
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
