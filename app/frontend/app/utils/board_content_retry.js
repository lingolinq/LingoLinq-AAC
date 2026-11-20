// A board's picture or sound cut off by a dropped link (docs/task-management/2026-11-17_sync-picture-after-link-drop.md).
//
// The sync walk (services/persistence.js sync_boards, nextBoard) saved the board and queued its pictures and sounds;
// one still downloading when the link went made the board a board error ("failed to sync completely"), never tried
// again though the link came back. Now, when every failed save of a board failed for a passing reason
// (utils/sync_board_fallback.js passing_failure), only those saves are parked, through the walk's board parking
// (utils/board_retry.js: about 10, 30, then 90 s), and tried again; the board itself is not walked or downloaded again.
// After MAX_BOARD_RETRIES more tries, or when any failure is not passing (a picture that does not exist), the board is
// reported as before.
//
// An optional save (`item.optional`: a liked or sidebar folder's icon, services/persistence.js) never fails its board
// (Traci, 2026-11-18): it is tried again like the others while it fails for a passing reason, and when it cannot be
// saved the board is saved with a warning instead (`warning` on its status row, utils/sync_rollup.js note_warning);
// offline the icon shows the placeholder. It neither blocks the retry of the board's other saves nor words its error.
import RSVP from 'rsvp';
import { passing_failure, MAX_BOARD_RETRIES } from './sync_board_fallback';

// What passing_failure reads from a failed request, and nothing else: the request itself is not kept (the proxy's
// error body repeats the picture's URL, and a protected picture's URL carries a token).
export function failure_cause(err) {
  var cause = {};
  if(err && typeof err === 'object') {
    if(err.offline === true) { cause.offline = true; }
    if(err.fakeXHR && typeof err.fakeXHR.status === 'number') { cause.fakeXHR = { status: err.fakeXHR.status }; }
  }
  return cause;
}

// A failed save of the board's content: the message the board error shows, whether its cause passes, and what to save
// again (`item`: url, type, keep_big).
export function content_failure(message, err, item) {
  return { error: message, passing: passing_failure(err), item: Object.assign({ message: message }, item) };
}

// Waits for every save, unlike RSVP.all_wait outside tests (utils/misc.js), which rejects at the first failure while
// the board's other saves still run in the queue: a board parked then would queue them a second time. Resolves when
// all saved; otherwise pushes every failure onto `failures` and rejects with the first, in the order they failed.
export function settle_content(promises, failures) {
  return new RSVP.Promise(function(resolve, reject) {
    var left = promises.length;
    if(!left) { resolve(); return; }
    var settled = function() {
      left--;
      if(left > 0) { return; }
      if(failures.length) { reject(failures[0]); } else { resolve(); }
    };
    promises.forEach(function(promise) {
      RSVP.resolve(promise).then(settled, function(err) { failures.push(err); settled(); });
    });
  });
}

// The retry number for this board's failed content, or 0 when it is reported now: every failure is a content
// failure with a passing cause, and the board has a retry left. Counted per board for the sync in
// `sync_progress.retried_content`, apart from its lookup retries (`retried_lookups`), so neither uses up the other.
export function claim_content_retry(failures, sync_progress, id) {
  if(!sync_progress || !id || !failures.length) { return 0; }
  if(!failures.every(function(f) { return f && f.passing === true && f.item; })) { return 0; }
  sync_progress.retried_content = sync_progress.retried_content || {};
  var done = sync_progress.retried_content[id] || 0;
  if(done >= MAX_BOARD_RETRIES) { return 0; }
  sync_progress.retried_content[id] = done + 1;
  return done + 1;
}

// The walk's entry for a board's parked content: the board's place in the walk, only the saves to try again, and
// what the walk records when they save (`board`: its id and full_set_revision, services/persistence.js
// full_set_revisions).
export function content_entry(next, failures, board) {
  return Object.assign({}, next, { content_retry: failures.map(function(f) { return f.item; }), content_board: board || null });
}

// A parked entry that holds a saved board's content, not a board still to get (the drawer words the two apart).
export function is_content_entry(item) {
  return !!(item && item.content_retry);
}

// What to do with a board's failed saves (`failures`, in the order they failed): `park` (the items to try again, with
// `retry` their retry number), `warn` (optional failures to report as warnings now) and `fail` (the failure that
// words the board error, or null). An optional save already on the device by now (`on_device(item)`: a picture
// several boards share, saved by another) is no failure. The board is complete when neither park nor fail is set.
export function judge_content(failures, sync_progress, id, on_device) {
  var optional = failures.filter(function(f) { return f && f.item && f.item.optional && !(on_device && on_device(f.item)); });
  var required = failures.filter(function(f) { return !(f && f.item && f.item.optional); });
  var res = { park: [], retry: 0, warn: [], fail: null };
  if(required.length && !required.every(function(f) { return f && f.passing === true && f.item; })) {
    res.fail = required[0];
    res.warn = optional;
    return res;
  }
  var again = required.concat(optional.filter(function(f) { return f.passing === true; }));
  var retry = again.length ? claim_content_retry(again, sync_progress, id) : 0;
  if(retry) {
    res.park = again;
    res.retry = retry;
    res.warn = optional.filter(function(f) { return f.passing !== true; });
  } else {
    res.fail = required[0] || null;
    res.warn = optional;
  }
  return res;
}

// The warning for a board saved without its picture, worded as its error would be.
export function content_warning(entry, err) {
  var msg = "board " + (entry.key || entry.id) + " saved without its picture";
  if(typeof err == 'string') {
    msg = msg + ": " + err;
  } else if(err && err.error) {
    msg = msg + ": " + err.error;
  }
  if(entry.visit_source) {
    msg = msg + ", linked from " + entry.visit_source;
  }
  return { warning: msg, board_id: entry.id || entry.key, board_key: entry.key };
}

// The board error, worded as the walk words it (services/persistence.js, the board's content failure).
export function content_error(entry, err) {
  var msg = "board " + (entry.key || entry.id) + " failed to sync completely";
  if(typeof err == 'string') {
    msg = msg + ": " + err;
  } else if(err && err.error) {
    msg = msg + ": " + err.error;
  }
  if(entry.visit_source) {
    msg = msg + ", linked from " + entry.visit_source;
  }
  return { error: msg, board_id: entry.id || entry.key, board_key: entry.key }; // as the walk: its id is next.id || next.key
}

// A parked entry back on the walk: save its content again; park it again while its failures pass and a retry is
// left, or report the board (judge_content). `ctx`: sync_progress, store(item), saved(board) (the board is complete),
// park(entry, retry), fail(board_error), warn(warning), on_device(item) (optional), then() (the walk goes on: called
// once, whatever happens here).
export function retry_content(entry, ctx) {
  var failures = [];
  var saves = entry.content_retry.map(function(item) {
    return RSVP.resolve().then(function() { return ctx.store(item); }).then(null, function(err) {
      return RSVP.reject(content_failure(item.message, err, item));
    });
  });
  return settle_content(saves, failures).then(function() {
    if(entry.content_board) { ctx.saved(entry.content_board); }
  }, function() {
    var judged = judge_content(failures, ctx.sync_progress, entry.id || entry.key, ctx.on_device);
    judged.warn.forEach(function(f) { ctx.warn(content_warning(entry, f)); });
    if(judged.fail) {
      ctx.fail(content_error(entry, judged.fail));
    } else if(judged.retry) {
      ctx.park(content_entry(entry, judged.park, entry.content_board), judged.retry);
    } else if(entry.content_board) {
      ctx.saved(entry.content_board);
    }
  }).finally(function() {
    ctx.then();
  });
}
