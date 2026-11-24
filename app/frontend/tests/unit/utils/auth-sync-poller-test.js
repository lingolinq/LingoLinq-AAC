import * as QUnit from 'qunit';
import { module, test } from 'qunit';
import capabilities from 'frontend/utils/capabilities';
import { stopAuthSyncPoller } from 'frontend/tests/helpers/jasmine';

/*
 * capabilities re-reads the access token every 2 s of wall-clock time (`_auth_sync_interval`). Left
 * running after its app was torn down, it read a destroyed stashes service during later tests. The
 * harness stops it before every test; this proves the global hook clears it.
 */
module('Unit | Utility | capabilities auth-sync poller', function() {
  test('the harness stops the auth-sync poller before every test', function(assert) {
    assert.expect(3);
    const handle = setInterval(function() {}, 100000);
    const realClearInterval = window.clearInterval;
    const cleared = [];
    try {
      capabilities._auth_sync_interval = handle;
      assert.true((QUnit.config.globalHooks.beforeEach || []).includes(stopAuthSyncPoller), 'registered as a global beforeEach hook');
      window.clearInterval = function(id) { cleared.push(id); return realClearInterval.apply(this, arguments); };
      stopAuthSyncPoller(); // only this hook: running them all would also drain the leak check's findings
      window.clearInterval = realClearInterval;
      assert.true(cleared.includes(handle), 'the poller timer itself is stopped');
      assert.strictEqual(capabilities._auth_sync_interval, null, 'the poller handle is cleared');
    } finally {
      window.clearInterval = realClearInterval;
      clearInterval(handle);
    }
  });
});
