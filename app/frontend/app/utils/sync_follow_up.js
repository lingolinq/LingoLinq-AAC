// A root sync requested while another runs is queued as one follow-up per person and started when the running sync
// ends (services/persistence.js, the last reopen; section 19 of
// docs/task-management/2026-11-10_offline-followup-proposals.md). These helpers decide how requests merge.

// Only check_for_needs_sync starts a sync with these reasons (services/persistence.js check_for_needs_sync). They never
// queue: the next stamp check catches anything they would have caught.
export function reason_is_automatic(reason) {
  return /^(long_time_since_sync|sync_stamp_changed):/.test(reason || '');
}

// Callers that start these syncs only while automatic sync is on (controllers/board-picker.js, components/trial-bar.js,
// components/tour-board-picker.js, controllers/setup.js, controllers/application.js, models/user.js,
// components/add-to-sidebar.js, utils/home_board.js). A follow-up made only of them re-checks it before it starts.
var AUTO_SYNC_GATED = ['home_board_changed', 'home_board_symbols_changed', 'sidebar_update'];

// 'all_reload' reloads every board (services/persistence.js, "force == 'all_reload'"), so it outranks true.
function stronger_force(a, b) {
  if(a === 'all_reload' || b === 'all_reload') { return 'all_reload'; }
  return (a || b) ? true : null;
}

// Merges one request into its person's pending entry (a new entry when there is none). The Sync button's reason,
// 'manual_sync', is kept once any request had it: the base sync resets the storage-permission check and refreshes
// every cache only for that reason.
export function merge_follow_up(entry, force, sync_reason) {
  var reason = sync_reason || 'manual_sync';
  var gated = AUTO_SYNC_GATED.indexOf(reason) !== -1;
  if(!entry.reason) {
    entry.reason = reason;
    entry.force = stronger_force(null, force);
    entry.needs_auto_sync = gated;
    return entry;
  }
  entry.reason = entry.reason === 'manual_sync' ? 'manual_sync' : reason;
  entry.force = stronger_force(entry.force, force);
  entry.needs_auto_sync = entry.needs_auto_sync && gated;
  return entry;
}
