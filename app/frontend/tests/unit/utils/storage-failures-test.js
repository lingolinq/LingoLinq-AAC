import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import { note_failed_write, end_sync_if_storage_failed } from 'frontend/utils/storage_failures';

/* A STORAGE FAILURE ENDS THE SYNC AS FAILED, FOR THE SIGNED-IN PERSON ONLY (final review of #1268). The helper set
 * the device-wide status without the #1230 gate every other status write applies, so a root sync for someone else
 * with one failed write published "Sync failed" as the signed-in person's result.
 */
module('Unit | Utility | storage failures', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.persistence = this.owner.lookup('service:persistence');
    this.saved = { sync_status: this.persistence.get('sync_status'), sync_status_error: this.persistence.get('sync_status_error'), failed_writes: this.persistence.failed_writes, failed_writes_quota: this.persistence.failed_writes_quota };
    this.persistence.failed_writes = 0;
    this.persistence.failed_writes_quota = null;
  });

  hooks.afterEach(function() {
    this.persistence.set('sync_status', this.saved.sync_status);
    this.persistence.set('sync_status_error', this.saved.sync_status_error);
    this.persistence.failed_writes = this.saved.failed_writes;
    this.persistence.failed_writes_quota = this.saved.failed_writes_quota;
  });

  test('no failed write: nothing happens', function(assert) {
    assert.false(end_sync_if_storage_failed(this.persistence, 0, true));
    assert.strictEqual(this.persistence.get('sync_status'), this.saved.sync_status);
  });

  test('a failed write ends the signed-in person\'s own sync as failed, with the reason', function(assert) {
    note_failed_write(this.persistence, { quota: true });
    var message = end_sync_if_storage_failed(this.persistence, 0, true);
    assert.ok(message);
    assert.strictEqual(this.persistence.get('sync_status'), 'failed');
    assert.strictEqual(this.persistence.get('sync_status_error'), message);
  });

  test('a failed write in a root sync for someone else gives the caller the reason without touching the device-wide status', function(assert) {
    this.persistence.set('sync_status', 'succeeded');
    this.persistence.set('sync_status_error', null);
    note_failed_write(this.persistence, { quota: true });
    var message = end_sync_if_storage_failed(this.persistence, 0, false);
    assert.ok(message, 'the caller still hears why');
    assert.strictEqual(this.persistence.get('sync_status'), 'succeeded');
    assert.strictEqual(this.persistence.get('sync_status_error'), null);
  });
});
