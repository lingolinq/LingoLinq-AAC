import { module, test } from 'qunit';
import { remaining_wait, DEVICE_COPY_WAIT_MS, DEVICE_COPY_WAIT_FLOOR_MS, SERVER_SILENT_MEMORY_MS } from 'frontend/utils/board_device_copy';

/* ONE WAIT FOR A HUNG NETWORK, NOT TWO (item 9, PR #1268).
 *
 * On a cold board launch with a hung network the owner lookup waited 8 s for the server (routes/user.js
 * owner_wait_ms) and then the board request waited 8 s more (routes/user/board-detail.js device_copy_wait) before
 * the device copy opened: 16 s. The owner lookup now notes when the server gave no answer, and the board request
 * that follows keeps only what is left of the 8 s, never less than 3 s. The note is forgotten after 20 s, so a
 * later navigation gets the full wait again.
 */
module('Unit | Utility | board device copy wait', function() {
  test('the limits are the ones the design promises', function(assert) {
    assert.strictEqual(DEVICE_COPY_WAIT_MS, 8000);
    assert.strictEqual(DEVICE_COPY_WAIT_FLOOR_MS, 3000);
    assert.strictEqual(SERVER_SILENT_MEMORY_MS, 20000);
  });

  test('with no note the full wait applies', function(assert) {
    assert.strictEqual(remaining_wait(null, 100000), DEVICE_COPY_WAIT_MS);
    assert.strictEqual(remaining_wait(undefined, 100000), DEVICE_COPY_WAIT_MS);
  });

  test('a note from a moment ago leaves what is left of the wait', function(assert) {
    assert.strictEqual(remaining_wait(100000, 102000), 6000, '2 s used');
    assert.strictEqual(remaining_wait(100000, 104500), 3500, '4.5 s used');
  });

  test('a note that used the whole wait leaves the floor, never less', function(assert) {
    assert.strictEqual(remaining_wait(100000, 108000), DEVICE_COPY_WAIT_FLOOR_MS, 'all 8 s used');
    assert.strictEqual(remaining_wait(100000, 112000), DEVICE_COPY_WAIT_FLOOR_MS, 'more than 8 s used');
  });

  test('a note older than the memory is forgotten', function(assert) {
    assert.strictEqual(remaining_wait(100000, 120001), DEVICE_COPY_WAIT_MS);
    assert.strictEqual(remaining_wait(100000, 99000), DEVICE_COPY_WAIT_MS, 'a clock that went backwards');
  });
});
