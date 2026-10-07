import * as QUnit from 'qunit';
import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';
import { isUtilOnlineCheckRunning } from 'frontend/utils/persistence';

/*
 * Persistence has two connectivity pollers that run every 30 s of wall-clock time and rewrite its
 * `online` flag to match the browser. A tick landing inside a test that had put persistence offline
 * flipped it back online (the wandering "condition failed for more than 5500ms" flake). The test
 * harness stops both before every test; this proves the handles exist and the harness clears them.
 */
module('Unit | Utility | persistence online pollers', function(hooks) {
  setupTest(hooks);

  test('both pollers are stopped by the harness before every test', function(assert) {
    const service = this.owner.lookup('service:persistence');
    const savedWindowPersistence = window.persistence;
    const savedOnline = service.get('online');
    assert.expect(3);
    try {
      window.persistence = service;
      service._setupOnlineListeners();
      assert.ok(service._online_check_interval, 'the service records the handle of its online poller');

      // Run the global QUnit beforeEach hooks, as the harness does before each case.
      const fakeAssert = { ok() {} };
      (QUnit.config.globalHooks.beforeEach || []).forEach((hook) => hook.call({}, fakeAssert));

      assert.strictEqual(service._online_check_interval, null, 'the service poller is stopped');
      assert.false(isUtilOnlineCheckRunning(), 'the module-level poller in utils/persistence is stopped');
    } finally {
      if (service._online_check_interval) { clearInterval(service._online_check_interval); }
      service._online_check_interval = null;
      service.set('online', savedOnline);
      window.persistence = savedWindowPersistence;
    }
  });
});
