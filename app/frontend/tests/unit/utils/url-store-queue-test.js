import { module, test } from 'qunit';
import RSVP from 'rsvp';
import { is_stale_item, drop_stale_head } from 'frontend/utils/url_store_queue';

/* THE DOWNLOAD QUEUE AFTER A CANCEL (section 22 of docs/task-management/2026-11-10_offline-followup-proposals.md).
 * A queued download that belongs to a sync that is no longer the running one is resolved without downloading. The
 * worker used to resolve one such item and stop, which froze the queue and left the cancelled sync's board walk
 * waiting forever; resolving them one call per item ran out of stack at a few thousand. */
module('Unit | Utility | url_store_queue', function() {
  function item(sync_id) { return { url: 'u', sync_id: sync_id, defer: RSVP.defer() }; }

  test('an untagged item is never stale', function(assert) {
    assert.false(is_stale_item(item(undefined), null));
    assert.false(is_stale_item(item(undefined), { sync_id: 'A', canceled: true }));
  });

  test('an item of the running sync is not stale', function(assert) {
    assert.false(is_stale_item(item('A'), { sync_id: 'A' }));
  });

  test('an item of a cancelled, ended, or older sync is stale', function(assert) {
    assert.true(is_stale_item(item('A'), { sync_id: 'A', canceled: true }), 'cancelled');
    assert.true(is_stale_item(item('A'), null), 'no sync running');
    assert.true(is_stale_item(item('A'), { sync_id: 'B' }), 'a newer sync is running');
  });

  test('an item tagged true belongs to whatever sync runs, as queue_sync_action reads it', function(assert) {
    assert.false(is_stale_item(item(true), { sync_id: 'B' }));
    assert.true(is_stale_item(item(true), { sync_id: 'B', canceled: true }));
  });

  test('stale items at the head are resolved and removed, up to the first live one', async function(assert) {
    var queue = [item('A'), item('A'), item(undefined), item('A')];
    var heads = queue.slice();
    assert.strictEqual(drop_stale_head(queue, { sync_id: 'B' }), 2, 'returns what is left');
    assert.strictEqual(queue.length, 2, 'stops at the untagged item');
    assert.strictEqual(queue[0], heads[2]);
    var results = await RSVP.all([heads[0].defer.promise, heads[1].defer.promise]);
    assert.deepEqual(results, [{}, {}]);
  });

  test('no queue leaves nothing', function(assert) {
    assert.strictEqual(drop_stale_head(undefined, null), 0);
  });

  test('ten thousand stale items drain without running out of stack', function(assert) {
    var queue = [];
    for(var i = 0; i < 10000; i++) { queue.push(item('A')); }
    drop_stale_head(queue, { sync_id: 'A', canceled: true });
    assert.strictEqual(queue.length, 0);
  });
});
