import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';

/* THE SYNC DRAWER'S STATE (item 8, PR #1268): services/sync-notice.js follows the persistence service's
 * sync_status. 'syncing' opens the drawer; the first settled status after it becomes the result card, which
 * waits to be dismissed unless the sync simply succeeded.
 */
module('Unit | Service | sync-notice', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.persistence = this.owner.lookup('service:persistence');
    this.saved = { sync_status: this.persistence.get('sync_status'), sync_errors: this.persistence.get('sync_errors'), sync_status_error: this.persistence.get('sync_status_error'), root_sync_canceled: this.persistence.get('root_sync_canceled') };
    this.notice = this.owner.lookup('service:sync-notice');
  });

  hooks.afterEach(function() {
    restoreStubs();
    this.notice.dismiss();
    this.persistence.set('sync_status', this.saved.sync_status);
    this.persistence.set('sync_errors', this.saved.sync_errors);
    this.persistence.set('sync_status_error', this.saved.sync_status_error);
    this.persistence.set('root_sync_canceled', this.saved.root_sync_canceled);
  });

  // The sync writes its status first and the details after it (services/persistence.js: 'finished' then
  // sync_errors; 'failed' then sync_status_error), and observers run inside the first set. The card must
  // read the details as they are when it is looked at, not as they were when the status changed.
  test('the problem count is read after the status, in the order the sync writes them', function(assert) {
    this.persistence.set('sync_errors', 7);
    this.persistence.set('sync_status', 'syncing');
    this.persistence.set('sync_status', 'finished');
    this.persistence.set('sync_errors', 2);
    assert.strictEqual(this.notice.get('message'), 'Boards synced. 2 boards had a problem.');
  });

  test('the failure reason is read after the status, in the order the sync writes them', function(assert) {
    this.persistence.set('sync_status_error', 'an older reason');
    this.persistence.set('sync_status', 'syncing');
    this.persistence.set('sync_status', 'failed');
    this.persistence.set('sync_status_error', 'This device is out of storage.');
    assert.strictEqual(this.notice.get('detail'), 'This device is out of storage.');
  });

  test('a sync the user cancelled ends as failed but shows no card', function(assert) {
    this.persistence.set('sync_status', 'syncing');
    this.persistence.set('root_sync_canceled', true);
    this.persistence.set('sync_status', 'failed');
    assert.strictEqual(this.notice.get('status'), null);
  });

  test('a sync that starts opens the drawer; a clean end becomes a success card', function(assert) {
    assert.strictEqual(this.notice.get('status'), null);
    this.persistence.set('sync_status', 'syncing');
    assert.strictEqual(this.notice.get('status'), 'syncing');
    assert.true(this.notice.get('is_syncing'));
    this.persistence.set('sync_status', 'succeeded');
    assert.strictEqual(this.notice.get('status'), 'done');
    assert.strictEqual(this.notice.get('kind'), 'succeeded');
    assert.true(/synced and ready for offline use/.test(this.notice.get('message')));
  });

  test('a sync that finished with problems says how many, and waits to be dismissed', function(assert) {
    this.persistence.set('sync_status', 'syncing');
    this.persistence.set('sync_errors', 3);
    this.persistence.set('sync_status', 'finished');
    assert.strictEqual(this.notice.get('kind'), 'finished');
    assert.strictEqual(this.notice.get('message'), 'Boards synced. 3 boards had a problem.');
    this.notice.dismiss();
    assert.strictEqual(this.notice.get('status'), null);
  });

  // Pass 2 of the final review (2026-11-11): one board reads "1 board", not "1 problems".
  test('one board with a problem reads in the singular', function(assert) {
    this.persistence.set('sync_status', 'syncing');
    this.persistence.set('sync_errors', 1);
    this.persistence.set('sync_status', 'finished');
    assert.strictEqual(this.notice.get('message'), 'Boards synced. 1 board had a problem.');
  });

  test('a failed sync says so, with the reason when there is one', function(assert) {
    this.persistence.set('sync_status', 'syncing');
    this.persistence.set('sync_status_error', 'Must be online to sync');
    this.persistence.set('sync_status', 'failed');
    assert.strictEqual(this.notice.get('kind'), 'failed');
    assert.strictEqual(this.notice.get('detail'), 'Must be online to sync');
  });

  test('a settled status with no sync before it shows nothing; a new sync replaces an old card', function(assert) {
    this.persistence.set('sync_status', 'failed');
    assert.strictEqual(this.notice.get('status'), null, 'nothing was running');
    this.persistence.set('sync_status', 'syncing');
    this.persistence.set('sync_status', 'failed');
    assert.strictEqual(this.notice.get('kind'), 'failed');
    this.persistence.set('sync_status', 'syncing');
    assert.strictEqual(this.notice.get('status'), 'syncing', 'the card gave way to the new sync');
    assert.strictEqual(this.notice.get('kind'), null);
  });

  test('a sync of another user\'s open database shows nothing', function(assert) {
    stub(this.persistence, 'local_db_is_current_user', function() { return false; });
    this.persistence.set('sync_status', 'syncing');
    assert.strictEqual(this.notice.get('status'), null);
  });
});
