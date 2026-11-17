// A picture the sync keeps for offline use but nobody needs to communicate: the person's profile picture, their
// supervisors' and contacts' pictures, a tag's button picture (services/persistence.js sync_user, sync_contacts,
// sync_tags).
// It never fails the sync (docs/task-management/2026-11-16_sync-status-first-sync.md): a new account's first sync on
// a phone failed "promise timed out: sync user data" because its default avatar, reached only through the image proxy,
// outlasted the step's 30 s, and the boards it had saved were reported as a failed sync.
//
// Within `ms` (15 s by default: with the user reload's own 5 s it stays inside "sync user data"'s 30 s) the picture is
// saved; a failure or no answer resolves `{}` and the picture is tried again on the next sync. A full device still
// fails (`quota_maxed`), as before: the sync reports that storage is full.
import RSVP from 'rsvp';

export var OPTIONAL_PICTURE_MS = 15000;

export function optional_picture(download, time_promise, ms) {
  return time_promise(download, 'saving a picture', ms || OPTIONAL_PICTURE_MS).then(null, function(err) {
    if(err && err.quota_maxed) { return RSVP.reject(err); }
    return RSVP.resolve({});
  });
}

// A wait for pictures queued during a step (sync_tags: one picture per tag, after a walk of tag lookups that have no
// limit of their own) is `ms`, cut short so it ends `margin` before the step's own limit (30 s, `time_promise`), however
// late in the step it starts. At least 1 ms: `time_promise` reads 0 as its 30 s default.
export function picture_ms_left(started, ms, step_ms, margin) {
  var left = (step_ms || 30000) - (margin || 5000) - (Date.now() - started);
  return Math.max(1, Math.min(ms || OPTIONAL_PICTURE_MS, left));
}
