import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import evaluation from 'frontend/utils/eval';
import speecher from 'frontend/utils/speecher';

/*
 * evaluation and speecher keep the services an app registered with them. When that app is torn
 * down they would hand out DESTROYED services (found by the leak check in CI shard order:
 * session.invalidate -> evaluation.purge_for_logout read a dead app-state; speecher.load_beep read
 * a dead persistence). A destroyed service must count as absent.
 */
module('Unit | Utility | eval and speecher service slots', function(hooks) {
  hooks.beforeEach(function() {
    this.savedEval = Object.assign({}, evaluation._services);
    this.savedSpeecher = Object.assign({}, speecher._services);
  });
  hooks.afterEach(function() {
    evaluation._services = this.savedEval;
    speecher._services = this.savedSpeecher;
  });

  test('evaluation skips destroyed services', function(assert) {
    assert.expect(3);
    ['appState', 'persistence', 'stashes'].forEach((key) => {
      const service = EmberObject.create();
      evaluation._services[key] = service;
      service.destroy(); // sets isDestroying at once
      assert.notStrictEqual(evaluation[key], service, `evaluation.${key} skips a destroyed service`);
    });
  });

  test('speecher skips destroyed services', function(assert) {
    assert.expect(3);
    [['app_state', 'get_app_state'], ['persistence', 'get_persistence'], ['stashes', 'get_stashes']].forEach(([slot, getter]) => {
      const service = EmberObject.create();
      speecher._services[slot] = service;
      service.destroy();
      assert.notStrictEqual(speecher[getter](), service, `speecher.${getter}() skips a destroyed service`);
    });
  });
});
