import i18n from './i18n';

// The one line that says how a running sync is doing (item 8, PR #1268). It used to read "12 / 40 boards", but
// the total is not a truth: it grows as the sync finds linked boards and can shrink (services/persistence.js
// update_sync_progress sums each user's visited and to_visit), so "/ 40" was wrong most of the time. The line now
// says what has happened: how many boards are saved so far (visited: the board's record is on the device; its
// pictures may still be arriving), and how many had a problem. The problem count is not subtracted: it also
// counts boards the sync could not fetch at all (deleted, unreachable), which were never visited. It counts every
// synced user's boards, supervisees included, since the sync does; a board shared by two synced users counts for
// each. Before the sync has counted anything it says it is starting.
export function sync_progress_line(progress) {
  if(!progress || typeof progress.visited !== 'number') {
    return i18n.t('initializing_lower', "initializing...");
  }
  var errored = progress.errored || 0;
  var saved = progress.visited;
  // Two keys rather than i18n.t's count form: in JS that form puts the number through String#sub (the HTML
  // wrapper), so "%{n}" never gets replaced (utils/i18n.js, the `count` branch); the template helper is fine.
  var line = saved === 1 ? i18n.t('sync_saved_so_far_one', "Saved so far: 1 board.")
                         : i18n.t('sync_saved_so_far', "Saved so far: %{n} boards.", { n: saved });
  if(errored > 0) {
    line = line + ' ' + i18n.t('sync_boards_with_problems', "%{n} with a problem.", { n: errored });
  }
  return line;
}

// The warning for folders a finished sync saved without their picture, by name (`names`: utils/sync_rollup.js
// overall.pictures_missing; Traci, 2026-11-18/19): offline they show the placeholder until a later sync saves the
// picture. Null for none. The sync drawer adds it to its result line; Sync Details shows it where the ready boards are
// not listed.
export function picture_warning(names) {
  if(!names || !names.length) { return null; }
  return names.length === 1 ? i18n.t('sync_picture_warning_one', "The picture for %{name} couldn't be saved. It shows a plain square until a later sync gets it.", { name: names[0] }) :
    i18n.t('sync_picture_warning_many', "Pictures for %{n} folders couldn't be saved: %{names}. They show a plain square until a later sync gets them.", { n: names.length, names: names.join(', ') });
}
