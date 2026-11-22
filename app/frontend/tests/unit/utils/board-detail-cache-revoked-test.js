import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import boardDetailCache from 'frontend/utils/board_detail_cache';
import boardRevocation from 'frontend/utils/board_revocation';

/* THE MEMORY CACHE DROPS A BOARD THE SYNC MARKS REVOKED (item 9C, PR #1268).
 *
 * boardDetailCache keeps a board's JSON in memory for 5 minutes and serves it with no server round trip while
 * online. When a sync finds the person can no longer view a board, it marks the stored copy
 * (utils/board_revocation.js apply_revocations); the memory copy stayed, so the board could still open for up to
 * 5 minutes. The cache now listens for marks and drops those boards.
 */
module('Unit | Utility | board detail cache drops revoked boards', function(hooks) {
  setupTest(hooks);
  hooks.afterEach(function() { boardDetailCache.clear(); });

  function raw(id, key) { return { id: id, key: key, buttons: [], grid: { rows: 1, columns: 1, order: [[null]] } }; }

  test('a board the sync marks revoked leaves the memory cache; others stay', function(assert) {
    boardDetailCache.set(raw('1_2', 'owner/gone'));
    boardDetailCache.set(raw('1_3', 'owner/kept'));
    assert.ok(boardDetailCache.get('owner/gone'), 'in memory before');
    boardRevocation.notify_marked(['1_2']);
    assert.notOk(boardDetailCache.get('owner/gone'), 'dropped by key');
    assert.notOk(boardDetailCache.get('1_2'), 'dropped by id');
    assert.ok(boardDetailCache.get('owner/kept'), 'the other board stays');
  });

  test('the cache listens while it holds anything, and stops when cleared', function(assert) {
    boardDetailCache.set(raw('1_4', 'owner/four'));
    assert.true(boardRevocation.has_marked_listener(boardDetailCache.on_boards_revoked), 'registered');
    boardDetailCache.clear();
    assert.false(boardRevocation.has_marked_listener(boardDetailCache.on_boards_revoked), 'gone with the cache, so a test\'s cleanup drops it');
    boardDetailCache.set(raw('1_5', 'owner/five'));
    assert.true(boardRevocation.has_marked_listener(boardDetailCache.on_boards_revoked), 'back on the next store');
  });
});
