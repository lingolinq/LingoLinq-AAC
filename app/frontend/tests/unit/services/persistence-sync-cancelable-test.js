import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';

/* CANCEL IS OFFERED WHILE THE DRAWER SAYS SYNCING (section 23 of docs/task-management/2026-11-10_offline-followup-proposals.md).
 * A person's sync queued behind someone else's (a supervisor syncing a communicator, which never writes sync_status)
 * holds the drawer on 'syncing' through follow_up_sync_pending, while Sync Details offered Cancel only on
 * `syncing` (sync_status). sync_cancelable covers both. */
module('Unit | Service | persistence sync_cancelable', function(hooks) {
  setupTest(hooks);

  test('a running sync, or a follow-up of yours waiting, can be cancelled', function(assert) {
    assert.expect(3);
    var p = this.owner.lookup('service:persistence');
    var saved = { sync_status: p.get('sync_status'), pending: p.get('follow_up_sync_pending') };
    try {
      p.set('sync_status', null);
      p.set('follow_up_sync_pending', false);
      assert.false(p.get('sync_cancelable'), 'nothing running');
      p.set('follow_up_sync_pending', true);
      assert.true(p.get('sync_cancelable'), 'yours is waiting behind another sync');
      p.set('follow_up_sync_pending', false);
      p.set('sync_status', 'syncing');
      assert.true(p.get('sync_cancelable'), 'yours is running');
    } finally {
      p.set('sync_status', saved.sync_status);
      p.set('follow_up_sync_pending', saved.pending);
    }
  });
});
