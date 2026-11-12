// The download queue behind persistence.store_url (services/persistence.js, and the copy in utils/persistence.js).
// A queued download tagged with a sync id that is no longer the running sync (cancelled, ended, or replaced by a newer
// sync) is resolved without downloading. The worker used to resolve one such item and stop: the queue froze, and the
// cancelled sync's board walk, which waits on its board's downloads before it reads the cancel, never ended. Section 22
// of docs/task-management/2026-11-10_offline-followup-proposals.md.

// `sync_progress` is the persistence service's sync_progress object (or null). An untagged item is never stale. An item
// tagged `true` belongs to whatever sync runs, as queue_sync_action reads that value.
export function is_stale_item(item, sync_progress) {
  if(!item || !item.sync_id) { return false; }
  if(!sync_progress || sync_progress.canceled) { return true; }
  return item.sync_id !== true && sync_progress.sync_id != null && item.sync_id !== sync_progress.sync_id;
}

// Resolves and removes stale items at the head of the queue, in a loop: a cancel can leave thousands of them, and one
// call per item ran out of stack. Returns how many items are left.
export function drop_stale_head(queue, sync_progress) {
  if(!queue) { return 0; }
  while(queue.length && is_stale_item(queue[0], sync_progress)) {
    queue.shift().defer.resolve({});
  }
  return queue.length;
}
