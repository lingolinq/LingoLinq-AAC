import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import previewBoardCache from 'frontend/utils/preview_board_cache';

/* The dashboard Boards-card preview cache (utils/preview_board_cache) is module-scoped and survives
 * the component across navigation. On logout it MUST be cleared so a user's board names/urls do not
 * linger in memory on a shared device (FERPA/HIPAA/COPPA). app-state.js#clear_user_state clears it
 * alongside boardDetailCache (mirrors tests/unit/utils/loading-overlay-cache-test.js). */
module('Unit | Utility | preview board cache clear on logout', function(hooks) {
  setupTest(hooks);

  test('clear_user_state empties the preview board cache', function(assert) {
    previewBoardCache.reset();
    previewBoardCache.ensure('1_7').preview = [{ id: '1_1' }];
    assert.ok(previewBoardCache.get('1_7'), 'precondition: cache populated');

    var appState = this.owner.lookup('service:app-state');
    try { appState.clear_user_state(); } catch (e) { /* unrelated teardown in a bare test owner */ }

    assert.notOk(previewBoardCache.get('1_7'), 'clear_user_state empties the preview board cache');
  });

  test('get/ensure/reset behave as a per-user cache', function(assert) {
    previewBoardCache.reset();
    assert.strictEqual(previewBoardCache.get('1_9'), undefined, 'empty before use');
    var e = previewBoardCache.ensure('1_9');
    e.full = [1, 2];
    assert.strictEqual(previewBoardCache.get('1_9'), e, 'ensure returns the stored entry');
    assert.strictEqual(previewBoardCache.ensure('1_9'), e, 'ensure is idempotent');
    previewBoardCache.reset();
    assert.strictEqual(previewBoardCache.get('1_9'), undefined, 'reset clears');
  });
});
