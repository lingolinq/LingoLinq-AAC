import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import utterance from 'frontend/utils/utterance';

/*
 * utterance keeps the app-state, persistence and stashes services that `setup` gave it. Tearing
 * that app instance down leaves DESTROYED services there for whatever runs next (app_state's
 * toggle_mode -> utterance.clear read and wrote them). A destroyed service must count as absent,
 * on the instance fields and in the static registry alike.
 */
module('Unit | Utility | utterance service slots', function(hooks) {
  const KEYS = ['appState', 'persistence', 'stashes'];
  const STATIC = { appState: 'get_app_state', persistence: 'get_persistence', stashes: 'get_stashes' };

  hooks.beforeEach(function() {
    this.saved = {};
    KEYS.forEach((key) => { this.saved[key] = utterance[`_${key}_service`]; });
    this.savedServices = Object.assign({}, utterance._services);
  });

  hooks.afterEach(function() {
    KEYS.forEach((key) => { utterance[key] = this.saved[key]; });
    utterance._services = this.savedServices;
  });

  test('a destroyed service on the instance is not handed out', function(assert) {
    assert.expect(6);
    KEYS.forEach((key) => {
      const service = EmberObject.create();
      utterance[key] = service;
      assert.strictEqual(utterance[key], service, `${key}: a live service is returned as stored`);
      service.destroy(); // sets isDestroying at once
      assert.notStrictEqual(utterance[key], service, `${key}: once destroyed, it is no longer returned`);
    });
  });

  test('a destroyed service in the static registry is not handed out', function(assert) {
    assert.expect(3);
    KEYS.forEach((key) => {
      const service = EmberObject.create();
      utterance._services[key] = service;
      service.destroy();
      assert.notStrictEqual(utterance[STATIC[key]](), service, `${STATIC[key]}() skips a destroyed service`);
    });
  });
});
