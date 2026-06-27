import {
  setupApplicationTest as upstreamSetupApplicationTest,
  setupRenderingTest as upstreamSetupRenderingTest,
  setupTest as upstreamSetupTest,
} from 'ember-qunit';
import { primePersistenceService } from './persistence-stub';

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

function setupTest(hooks, options) {
  // Booted app + stubbed persistence leave orphan RSVP/runLater work that
  // never settles; ember-qunit's afterEach settled() then hangs ~60s.
  upstreamSetupTest(hooks, { waitForSettled: false, ...options });

  hooks.beforeEach(function() {
    if (this.owner) {
      primePersistenceService(this.owner);
      this.owner.lookup('service:app-state');
      this.owner.lookup('service:content-grabbers');
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
