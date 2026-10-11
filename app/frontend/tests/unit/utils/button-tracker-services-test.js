import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import buttonTracker from 'frontend/utils/raw_events';

/*
 * buttonTracker keeps the app-state, persistence and stashes services in module-level slots. A
 * test that boots an app instance fills them, and tearing that instance down leaves DESTROYED
 * services there for every later test. The getters must treat a destroyed service as absent and
 * fall back to the globals, as editManager's slots already do.
 */
module('Unit | Utility | raw-events service slots', function(hooks) {
  hooks.beforeEach(function() {
    this.saved = Object.assign({}, buttonTracker._services);
  });

  hooks.afterEach(function() {
    buttonTracker.appState = this.saved.appState;
    buttonTracker.persistence = this.saved.persistence;
    buttonTracker.stashes = this.saved.stashes;
  });

  test('a destroyed service in a slot is not handed out', function(assert) {
    assert.expect(6);
    ['appState', 'persistence', 'stashes'].forEach(function(key) {
      var service = EmberObject.create();
      buttonTracker[key] = service;
      assert.strictEqual(buttonTracker[key], service, key + ': a live service is returned as stored');
      service.destroy(); // sets isDestroying at once; isDestroyed follows at the end of the run loop
      assert.notStrictEqual(buttonTracker[key], service, key + ': once destroyed, it is no longer returned');
    });
  });
});
