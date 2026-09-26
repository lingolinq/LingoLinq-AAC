/* THE DISPLAY COPY OF A BADGE, for anywhere a badge has to live inside a JSON payload.
 *
 * WHY THIS EXISTS. The dashboard decorates each entry of `user.supervisees` with the best next
 * badge so the caseload and classic home cards can render it. `supervisees` is `attr('raw')`
 * (app/models/user.js:183) -- plain JSON that services/persistence.js:706 hands to local storage
 * BY REFERENCE, where app/utils/dbman.js:158 runs it through `capabilities.encrypt`, which is
 * `JSON.stringify` (app/utils/capabilities.js:694). Writing a live Ember Data Badge record there
 * put the Ember Data Store inside that payload -- `store.notifications.store` closes a circle --
 * so every write of the user record threw "Converting circular structure to JSON" and the record
 * silently never reached local storage. Measured on the home page, twice per load, at
 * `$.supervisees.0.current_badge.store`.
 *
 * AN ALLOWLIST, NOT A CLEANUP. Copying the record and deleting the properties we happen to know
 * about is the version of this that looks right and is not: on Ember Data 5.3 the attributes are
 * prototype getters (so a copy carries none of the display data) and a record's internals are not
 * limited to any list we could write down. Naming the four fields the consumers read is the only
 * form that cannot leak a new internal property in a future Ember Data.
 *
 * THE FOUR FIELDS are everything the two consumers of this value read, verified rather than
 * guessed: `BadgeProgress` reads `id` (badge-progress.js:113), `name` (badge-progress.hbs:45),
 * `image_url` (badge-progress.hbs:38) and `progress` (badge-progress.js:49, which multiplies the
 * raw float by 100 itself); `BadgeEarned` reads `id` (badge-earned.js) and `image_url`
 * (badge-earned.hbs:5). Not `earned`: the templates choose between the two components by which
 * field is set (classic-view.hbs:615,620), not by reading it.
 *
 * NOT FOR `caseload.js`'s `selectedBadge`. That one is a live record on a controller property,
 * never inside a raw payload, and its panel needs record-only computeds (`progress_style`,
 * `time_left`, `completion_explanation`, and a `badge.get('user_name')` at caseload.js:505).
 * Snapshotting it would empty that panel.
 */
const FIELDS = ['id', 'name', 'image_url', 'progress'];

/* Returns null, not `{}`, when there is no badge: both templates gate on
   `{{#if supervisee.current_badge}}` and an empty object would render an empty badge tile. */
export function badge_snapshot(badge) {
  if(!badge) { return null; }
  /* `get` when the value is still a record, plain property access once it is already a snapshot,
     so re-snapshotting an entry that was decorated on an earlier pass is not a special case. */
  var read = (typeof badge.get === 'function') ?
    function(key) { return badge.get(key); } :
    function(key) { return badge[key]; };
  var snapshot = {};
  FIELDS.forEach(function(key) {
    snapshot[key] = read(key);
  });
  return snapshot;
}
