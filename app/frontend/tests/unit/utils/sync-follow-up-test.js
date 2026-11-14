import { module, test } from 'qunit';
import { reason_is_automatic, merge_follow_up } from 'frontend/utils/sync_follow_up';

/* How requests made while a sync runs merge into one follow-up per person (utils/sync_follow_up.js; section 19 of
 * docs/task-management/2026-11-10_offline-followup-proposals.md). */
module('Unit | Utility | sync_follow_up', function() {
  test('only the stamp check and the 48-hour check are automatic', function(assert) {
    assert.true(reason_is_automatic('sync_stamp_changed:a:b'));
    assert.true(reason_is_automatic('long_time_since_sync:1:2'));
    assert.false(reason_is_automatic('home_board_changed'));
    assert.false(reason_is_automatic(null));
  });

  test('the Sync button reason stays once any request had it', function(assert) {
    var entry = merge_follow_up({}, null, null);
    merge_follow_up(entry, null, 'sidebar_update');
    assert.strictEqual(entry.reason, 'manual_sync');
    var other = merge_follow_up({}, null, 'home_board_changed');
    merge_follow_up(other, null, 'sidebar_update');
    assert.strictEqual(other.reason, 'sidebar_update');
  });

  test('force keeps the strongest value', function(assert) {
    var entry = merge_follow_up({}, true, 'home_board_changed');
    merge_follow_up(entry, 'all_reload', 'home_board_changed');
    merge_follow_up(entry, null, 'home_board_changed');
    assert.strictEqual(entry.force, 'all_reload');
    assert.strictEqual(merge_follow_up({}, null, 'sidebar_update').force, null);
  });

  test('the automatic-sync check applies only when every merged request needed it', function(assert) {
    var entry = merge_follow_up({}, null, 'home_board_changed');
    assert.true(entry.needs_auto_sync);
    merge_follow_up(entry, null, 'push_to_cloud');
    assert.false(entry.needs_auto_sync);
    assert.false(merge_follow_up({}, null, null).needs_auto_sync);
  });

  test('a copied home board is re-checked like a picked one (models/user.js starts it only with automatic sync on)', function(assert) {
    assert.true(merge_follow_up({}, null, 'home_board_copied').needs_auto_sync);
  });
});
