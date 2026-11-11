import i18n from './i18n';

// The one line that says how a running sync is doing (item 8, PR #1268). It used to read "12 / 40 boards", but
// the total is not a truth: it grows as the sync finds linked boards and can shrink (services/persistence.js
// update_sync_progress sums each user's visited and to_visit), so "/ 40" was wrong most of the time. The line now
// says what has happened: how many boards are saved so far (visited, less those that ended with an error), and
// how many had a problem. It counts every synced user's boards, supervisees included, since the sync does.
// Before the sync has counted anything it says it is starting.
export function sync_progress_line(progress) {
  if(!progress || typeof progress.visited !== 'number') {
    return i18n.t('initializing_lower', "initializing...");
  }
  var errored = progress.errored || 0;
  var saved = Math.max(0, progress.visited - errored);
  // Two keys rather than i18n.t's count form: in JS that form puts the number through String#sub (the HTML
  // wrapper), so "%{n}" never gets replaced (utils/i18n.js, the `count` branch); the template helper is fine.
  var line = saved === 1 ? i18n.t('sync_saved_so_far_one', "Saved so far: 1 board")
                         : i18n.t('sync_saved_so_far', "Saved so far: %{n} boards", { n: saved });
  if(errored > 0) {
    line = line + ' ' + i18n.t('sync_boards_with_problems', "%{n} with a problem.", { n: errored });
  }
  return line;
}
