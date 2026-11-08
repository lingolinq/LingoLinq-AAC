import i18n from './i18n';
import capabilities from './capabilities';

// Writes to this device's storage that failed (PR #1268).
//
// persistence.store never rejects a failed write (its callers fire and forget; see the test "should not
// reject (but log an error) on a failed storage attempt"), so on a device out of storage a sync saved
// nothing and still reported success. persistence.store counts each failed write here, and the sync
// compares the count from its start with the count at its end: any failure means the boards are not all
// on the device, so the sync ends as failed and says why.

// Called by persistence.store for each write that failed. `error` is dbman's answer: `quota` is true when
// the device was out of storage (dbman.store_internal).
export function note_failed_write(root, error) {
  if(!root) { return; }
  root.failed_writes = (root.failed_writes || 0) + 1;
  if(error && error.quota) { root.failed_writes_quota = root.failed_writes; }
}

export function failed_write_count(root) {
  return (root && root.failed_writes) || 0;
}

// Whether a write failed since `before` (a count from failed_write_count).
export function writes_failed_since(root, before) {
  return failed_write_count(root) > (before || 0);
}

// At the end of a sync: when a write failed since `before`, the sync ends as failed and says why, and
// returns true. The boards are not all on the device, so it must not look ready offline.
export function end_sync_if_storage_failed(persistence, before) {
  if(!writes_failed_since(persistence, before)) { return false; }
  persistence.set('sync_status', 'failed');
  if(persistence.stashes && persistence.stashes.persist) { persistence.stashes.persist('last_sync_status', 'failed'); }
  persistence.set('sync_status_error', storage_failure_message(persistence, before));
  return true;
}

// What to tell the person: out of storage when any failure since `before` was, otherwise a general one.
// With no database at all every write fails, and restarting the app is what helps (the sync's failure
// handler gives the same advice).
export function storage_failure_message(root, before) {
  if(!capabilities.db) {
    return i18n.t('device_storage_unavailable', "This device can't save boards right now. Try restarting the app.");
  }
  if(root && (root.failed_writes_quota || 0) > (before || 0)) {
    return i18n.t('device_storage_full', "This device is out of storage, so boards could not be saved for offline use. Free up some space, then sync again.");
  }
  return i18n.t('device_storage_write_failed', "This device could not save boards for offline use. Try syncing again.");
}
