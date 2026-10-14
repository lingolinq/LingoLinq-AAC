import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';
import { settled } from '@ember/test-helpers';
import EmberObject from '@ember/object';

/* THE PAGE A USER LEAVES IS NOT THE PAGE THEY ARE ON (found 2026-10-12, verifying "if they logged off on
   their caseload page, it logs them back in to their caseload page"). The route `didTransition` action
   (routes/application.js) runs before the router service reports the NEW route: measured live on the
   Caseload pill, finish_global_transition saw `user.home` while the URL was already /caseload, so the
   saved resume point was always one page behind. The record has to read the router once it settles. */
module('Unit | Service | app-state | records the page the user lands on', function(hooks) {
  setupTest(hooks);

  test('finish_global_transition saves the route the router reports once the transition settles', async function(assert) {
    assert.expect(2);
    var appState = this.owner.lookup('service:app-state');
    var router = EmberObject.create({ currentRouteName: 'user.home', currentURL: '/slp_test/home' });
    Object.defineProperty(appState, 'router', { value: router, configurable: true });
    appState.set('sessionUser', EmberObject.create({ user_name: 'slp_test' }));
    var session = this.owner.lookup('service:session');
    var wasAuthed = session.get('isAuthenticated');
    session.set('isAuthenticated', true);
    var key = 'll_last_location_slp_test';
    try {
      localStorage.removeItem(key);
      appState.finish_global_transition();
      // What Ember does right after the didTransition action: the router service moves to the new page.
      router.setProperties({ currentRouteName: 'caseload', currentURL: '/caseload' });
      await new Promise(function(resolve) { setTimeout(resolve, 50); });
      await settled();
      var saved = JSON.parse(localStorage.getItem(key) || 'null');
      assert.strictEqual(saved ? saved.route : null, 'caseload', 'the page the user landed on, not the one they left');
      assert.strictEqual(saved ? saved.url : null, '/caseload', 'with its URL');
    } finally {
      localStorage.removeItem(key);
      session.set('isAuthenticated', wasAuthed);
    }
  });
});
