import { module, test } from 'qunit';
import { USER_RELOAD_MS, BOARD_RELOAD_MS } from 'frontend/utils/sync_board_fallback';
import { find_limits } from 'frontend/utils/board_download';

/* A SYNC STARTED ON A BUSY SLOW LINK MUST NOT FAIL ON ITS FIRST STEP (Android emulator, 2026-11-15).
 *
 * The sync refreshes the signed-in user first (services/persistence.js sync, `reloading root user`) and cut that
 * off at 5 s, shorter than the adapter's own limit, so a user record still arriving was failed by the sync, and the
 * whole sync with it ("failed to retrieve user details"). Measured: a sync started right after sign-in, while the
 * sign-in warm-up filled a 4 Mbps link, failed after 10 s with nothing synced. A real failure still fails the sync
 * (the #1229 tests in tests/utils/persistence-sync-test.js arm exactly that); this only stops cutting a slow answer. */
module('Unit | Utility | sync user reload limit', function() {
  test("the sync waits for the user longer than the adapter's own limit, so the adapter decides", function(assert) {
    assert.true(USER_RELOAD_MS > find_limits.caller_ms, 'longer than the adapter answers a find (' + find_limits.caller_ms + ' ms)');
  });

  test('and no longer than a board refresh may take', function(assert) {
    assert.true(USER_RELOAD_MS <= BOARD_RELOAD_MS, 'a stalled request still ends the sync in bounded time');
  });
});
