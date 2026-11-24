import i18n from './i18n';

// Sync Details' plain-language line about the sync its cards describe (item 0.1; Traci 2026-11-20 and 2026-11-21,
// docs/task-management/2026-11-15_offline-sync-research-proposal.md 12.6): how long it took, what it downloaded and
// what could not be saved, from that sync's log entry (utils/sync_counters.js `counters`, kept by
// utils/sync_log_store.js entry_copy) and its rows (utils/sync_rollup.js summary_for). Only what the entry holds is
// said: an entry from an older build has no counters, so it gets only the pictures its rows say could not be saved
// (a row marked "downloaded" is not proof of a download: a board loaded earlier in the session is marked so too). No
// percentages (Traci 2026-11-16).

export function size_label(bytes) {
  var n = (typeof bytes === 'number' && isFinite(bytes) && bytes > 0) ? bytes : 0;
  if(n >= 1000000000) { return i18n.t('size_gb', "%{n} GB", { n: (Math.round(n / 100000000) / 10).toString() }); }
  if(n >= 10000000) { return i18n.t('size_mb', "%{n} MB", { n: Math.round(n / 1000000).toString() }); }
  if(n >= 1000000) { return i18n.t('size_mb', "%{n} MB", { n: (Math.round(n / 100000) / 10).toString() }); }
  return i18n.t('size_kb', "%{n} KB", { n: Math.max(1, Math.round(n / 1000)).toString() });
}

function duration(seconds, stopped) {
  var minutes = Math.round(seconds / 60);
  if(seconds < 60) {
    return stopped ? i18n.t('sync_stopped_under_minute', "Stopped after less than a minute") : i18n.t('sync_took_under_minute', "Took less than a minute");
  }
  if(minutes < 60) {
    if(minutes === 1) { return stopped ? i18n.t('sync_stopped_one_minute', "Stopped after 1 minute") : i18n.t('sync_took_one_minute', "Took 1 minute"); }
    return stopped ? i18n.t('sync_stopped_n_minutes', "Stopped after %{n} minutes", { n: minutes }) : i18n.t('sync_took_n_minutes', "Took %{n} minutes", { n: minutes });
  }
  var hours = Math.floor(minutes / 60);
  var rest = minutes % 60;
  return stopped ? i18n.t('sync_stopped_hours_minutes', "Stopped after %{h} h %{m} min", { h: hours, m: rest }) : i18n.t('sync_took_hours_minutes', "Took %{h} h %{m} min", { h: hours, m: rest });
}

function boards_phrase(n) { return n === 1 ? i18n.t('sync_one_board_lower', "1 board") : i18n.t('sync_n_boards_lower', "%{n} boards", { n: n }); }
function pictures_phrase(n) { return n === 1 ? i18n.t('sync_one_picture_lower', "1 picture") : i18n.t('sync_n_pictures_lower', "%{n} pictures", { n: n }); }

// The parts of the line, in order, or [] when there is nothing to say. `summary` is summary_for's result; its
// `entry` is the log entry the cards come from (none while a sync runs).
export function summary_parts(summary) {
  if(!summary || !summary.entry || (summary.unfinished && !summary.stopped)) { return []; }
  var entry = summary.entry;
  var c = (entry.counters && typeof entry.counters === 'object') ? entry.counters : null;
  var parts = [];
  if(c && typeof c.seconds === 'number') { parts.push(duration(c.seconds, !!summary.stopped)); }
  var boards = (c && c.boards && c.boards.fetched) || 0;
  var pictures = (c && c.pictures && c.pictures.saved) || 0;
  var sounds = (c && c.sounds && c.sounds.saved) || 0;
  var bytes = ((c && c.pictures && c.pictures.bytes) || 0) + ((c && c.sounds && c.sounds.bytes) || 0);
  if(boards > 0 && pictures > 0) {
    parts.push(i18n.t('sync_boards_and_pictures_downloaded', "%{boards} and %{pictures} downloaded (%{size})", { boards: boards_phrase(boards), pictures: pictures_phrase(pictures), size: size_label(bytes) }));
  } else if(pictures > 0) {
    parts.push(i18n.t('sync_pictures_downloaded', "%{pictures} downloaded (%{size})", { pictures: pictures_phrase(pictures), size: size_label(bytes) }));
  } else if(boards > 0) {
    parts.push(i18n.t('sync_boards_downloaded', "%{boards} downloaded", { boards: boards_phrase(boards) }));
  } else if(c && !summary.stopped) {
    parts.push(i18n.t('sync_nothing_new', "Nothing new to download"));
  }
  if(sounds > 0) {
    parts.push(sounds === 1 ? i18n.t('sync_one_sound_downloaded', "1 sound downloaded") : i18n.t('sync_n_sounds_downloaded', "%{n} sounds downloaded", { n: sounds }));
  }
  var missing = (summary.overall && summary.overall.pictures_missing) ? summary.overall.pictures_missing.length : 0;
  if(missing > 0) {
    parts.push(missing === 1 ? i18n.t('sync_one_picture_not_saved', "1 picture couldn't be saved") : i18n.t('sync_n_pictures_not_saved', "%{n} pictures couldn't be saved", { n: missing }));
  }
  var supervisees = (c && c.failures && c.failures.supervisee) || 0;
  if(supervisees > 0) {
    parts.push(supervisees === 1 ? i18n.t('sync_one_communicator_failed', "1 communicator's boards couldn't sync") : i18n.t('sync_n_communicators_failed', "Boards for %{n} communicators couldn't sync", { n: supervisees }));
  }
  return parts;
}

export function summary_text(summary) {
  var parts = summary_parts(summary);
  return parts.length ? parts.join(' · ') : null;
}

// Technical details (for support): every counter of one log entry, as label and value lines. Empty for an entry
// without counters.
export function counter_lines(entry) {
  var c = entry && entry.counters;
  if(!c || typeof c !== 'object') { return []; }
  var failures = c.failures || {};
  var failed = Object.keys(failures).filter(function(k) { return failures[k] > 0; }).map(function(k) { return k + ' ' + failures[k]; }).join(', ');
  var none = i18n.t('sync_counter_none', "none"); // on its own line: the generator does not see an i18n.t inside another
  return [
    i18n.t('sync_counter_started', "Started: %{at}", { at: typeof c.started === 'number' ? (new Date(c.started)).toISOString() : '-' }),
    i18n.t('sync_counter_seconds', "Seconds: %{n}", { n: c.seconds }),
    i18n.t('sync_counter_requests', "Requests: %{n} (at most %{peak} at once, %{open} still open at the end)", { n: c.requests, peak: c.peak, open: c.open_at_end }),
    i18n.t('sync_counter_received', "Text received from the server (characters): %{n}", { n: c.received_chars }),
    i18n.t('sync_counter_boards', "Boards the server sent: %{n}", { n: (c.boards || {}).fetched || 0 }),
    i18n.t('sync_counter_pictures', "Pictures saved: %{n} (%{bytes} bytes)", { n: (c.pictures || {}).saved || 0, bytes: (c.pictures || {}).bytes || 0 }),
    i18n.t('sync_counter_sounds', "Sounds saved: %{n} (%{bytes} bytes)", { n: (c.sounds || {}).saved || 0, bytes: (c.sounds || {}).bytes || 0 }),
    i18n.t('sync_counter_failures', "Failures: %{list}", { list: failed || none })
  ];
}
