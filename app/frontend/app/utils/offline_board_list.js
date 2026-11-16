// The boards page's Mine list while offline: the boards saved on this device (docs/task-management/
// 2026-11-16_offline-boards-page.md). Online the server answers that list (controllers/user/index.js
// generate_or_append_to_list); offline the page had no source at all once its 10-minute snapshot was gone
// (utils/boards_page_list_cache.js), and showed "You don't have any boards yet" after a sync.
import RSVP from 'rsvp';
import capabilities from './capabilities';
import stashes from './_stashes';
import lingoLinqExtras from './extras';
import { is_revoked_raw } from './board_revocation';

// The person whose device database is open, only when it is the signed-in person's (capabilities.setup_database
// names it from auth_settings at app start; an SPA sign-out can leave the previous person's open). Unknown is no:
// unlike services/persistence.js local_db_is_current_user, this read must never guess.
export function own_device_db_user(db_name, auth) {
  var match = (db_name || '').match(/^lingolinqStorage::(.*)===/);
  if(!match || !auth || !auth.user_name || match[1] !== auth.user_name) { return null; }
  return auth.user_name;
}

export function current_device_db_user() {
  return own_device_db_user(capabilities.db_name, stashes.get_object('auth_settings', true));
}

// A list the boards page treats as finished (boardsPageListCache.isUsableList), marked `from_device` so the
// server list replaces it once online (controllers/user/index.js generate_or_append_to_list).
function device_list(records) {
  records.done = true;
  records.paint_ready = true;
  records.from_device = true;
  return records;
}

// The boards on the device whose key starts with `<user_name>/` (the user's own boards and shallow-clone copies;
// the server's Mine list is the same owner, app/controllers/api/boards_controller.rb:94-124), not revoked, as store
// records. A record already in memory under the board's id is kept, so an older device copy never overwrites it. (A
// board fetched by key is a separate record under its key, serializers/application.js:85-94: pushing by id leaves it
// alone, and listing it would hide its folders, which the page groups by id.) The read runs inside the promise chain,
// so a database that throws (a closing IndexedDB connection) gives an empty list, not an exception. `storage` is
// passed in by tests.
export function own_device_boards(store, user_name, storage) {
  if(!store || !user_name) { return RSVP.resolve(device_list([])); }
  var prefix = user_name + '/';
  var source = storage || lingoLinqExtras.storage;
  return RSVP.resolve().then(function() { return source.find_all('board'); }).then(function(rows) {
    var records = [];
    (rows || []).forEach(function(row) {
      var data = row && (row.data || row);
      var raw = data && data.raw;
      if(!raw || !raw.id || typeof raw.key !== 'string' || raw.key.indexOf(prefix) !== 0 || is_revoked_raw(raw)) { return; }
      var existing = store.peekRecord('board', raw.id);
      records.push(existing || store.push({ data: { id: raw.id, type: 'board', attributes: raw } }));
    });
    return device_list(records);
  }, function() {
    return device_list([]);
  });
}
