import RSVP from 'rsvp';

/* SAVE ONE SMALL PREFERENCE CHANGE WITHOUT WRITING BACK THE REST (Scot's review of #1141, 2026-10-15;
   issue #1134). `user.save()` sends the whole record, so a device holding an old copy of the account
   writes its stale values back over every preference: AI consent a parent or SLP has since turned off,
   or a tour finished on another device. This saves the record as usual and also names the keys this
   save changed; serializers/user.js sends them as `preference_keys`, and the server applies only those
   (app/models/user.rb, User.listed_preference_keys). A key is a top-level preference name, or
   'progress.<attr>' for one progress entry. The list rides on this save's adapterOptions, so it never
   carries over to a later save of the same record. */
export function save_listed_preferences(user, keys) {
  return user.save({ adapterOptions: { preference_keys: (keys || []).slice() } });
}

/* OFFLINE (review of this change, 2026-10-22). Offline, a save is stored as the record's local copy
   (services/persistence.js#updateRecord, through serializers/user.js, so the copy carries
   `preference_keys`) and replayed by sync_changed with a plain `record.save()`, which would send every
   key after all. And a later offline save of the same user overwrites that copy. So:
   - `queued_preference_keys(existing, keys)` is the list the new local copy keeps. `existing` is the copy
     already waiting (or null). Nothing waiting: this save's keys. A WHOLE save waiting: none (null), so
     the replay stays whole and that save's changes are not cut down. A listed save waiting: both lists.
   - `replay_save_options(object)` is what sync_changed passes to `record.save()` for a stored copy. */
export function queued_preference_keys(existing, keys) {
  var prior = existing && (existing.user || existing);
  if (!prior || !prior.changed) { return (keys || []).slice(); }
  if (!Array.isArray(prior.preference_keys)) { return null; }
  var all = prior.preference_keys.slice();
  (keys || []).forEach(function(k) { if (all.indexOf(k) === -1) { all.push(k); } });
  return all;
}

export function replay_save_options(object) {
  var keys = object && object.preference_keys;
  return Array.isArray(keys) ? { adapterOptions: { preference_keys: keys.slice() } } : undefined;
}

// Before an offline save of a user stores its local copy: set the copy's list per
// queued_preference_keys. The copy already waiting is read by its storage id (storage.find_all, the
// id index), NOT through persistence.find or storage.find: for the session user that id is 'self';
// persistence.find redirects 'self' to the real id (settings/selfUserId), and dbman.find looks a
// non-numeric user key up by user name, so both read a different row (adversary review, 2026-10-22).
// A lookup that fails keeps the replay whole, as before this change.
export function keep_queued_keys(modelName, record) {
  var raw = record && record[modelName];
  if (modelName !== 'user' || !raw || !Array.isArray(raw.preference_keys)) { return RSVP.resolve(); }
  var storage = window.lingoLinqExtras && window.lingoLinqExtras.storage;
  var waiting = (storage && raw.id) ? RSVP.resolve(storage.find_all('user', [raw.id])).then(function(list) {
    var item = (list || [])[0];
    var row = item ? (item.data || item) : null;
    return { existing: row ? (row.raw || row) : null };
  }, function() {
    return { failed: true };
  }) : RSVP.resolve({ failed: true });
  return waiting.then(function(res) {
    var keys = res.failed ? null : queued_preference_keys(res.existing, raw.preference_keys);
    if (keys) { raw.preference_keys = keys; } else { delete raw.preference_keys; }
  });
}
