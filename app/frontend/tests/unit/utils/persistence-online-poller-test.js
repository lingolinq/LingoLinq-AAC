import * as QUnit from 'qunit';
import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';
import { isUtilOnlineCheckRunning } from 'frontend/utils/persistence';
import { stopOnlinePollers } from 'frontend/tests/helpers/jasmine';

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
    assert.expect(4);
    try {
      window.persistence = service;
      service._setupOnlineListeners();
      assert.ok(service._online_check_interval, 'the service records the handle of its online poller');

      // The harness registers this exact function as a global beforeEach hook. Only it is run here:
      // running every global hook would also drain the leak check's findings for this test.
      assert.true((QUnit.config.globalHooks.beforeEach || []).includes(stopOnlinePollers), 'registered as a global beforeEach hook');
      stopOnlinePollers();

      assert.strictEqual(service._online_check_interval, null, 'the service poller is stopped');
      assert.false(isUtilOnlineCheckRunning(), 'the module-level poller in utils/persistence is stopped');
    } finally {
      if (service._online_check_interval) { clearInterval(service._online_check_interval); }
      service._online_check_interval = null;
      service.set('online', savedOnline);
      window.persistence = savedWindowPersistence;
    }
  });

  // The harness stops the real poller, so the production path it drives is pinned here with its tick
  // captured and fired by hand. A token check that hit a network error marks persistence offline
  // (session.check_token) while the browser still reports online; the next tick puts it back online.
  // This records current production behaviour (2026-10-10 review); whether that recovery is intended
  // is an owner decision noted on PR #1110.
  test('a tick after a network-error token check puts persistence back online while the browser is online', function(assert) {
    const service = this.owner.lookup('service:persistence');
    const savedOnline = service.get('online');
    const savedSetInterval = window.setInterval;
    const savedOverride = navigator.online_override;
    let tick = null;
    assert.expect(2);
    try {
      window.setInterval = (fn, ms) => { if (ms === 30000) { tick = fn; return 0; } return savedSetInterval(fn, ms); };
      service._setupOnlineListeners();
      window.setInterval = savedSetInterval;
      assert.strictEqual(typeof tick, 'function', 'the 30 s poller tick was captured, not scheduled');

      navigator.online_override = true; // the browser reports online
      service.set('online', false); // what check_token does on a network error
      tick();
      assert.true(service.get('online'), 'the tick restored online');
    } finally {
      window.setInterval = savedSetInterval;
      if (service._online_check_interval) { clearInterval(service._online_check_interval); }
      service._online_check_interval = null;
      navigator.online_override = savedOverride;
      service.set('online', savedOnline);
    }
  });
});
