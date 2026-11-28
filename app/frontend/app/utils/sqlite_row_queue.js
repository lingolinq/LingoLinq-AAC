// One SQLite write at a time per row (issue #1221).
//
// A write is a SELECT then an INSERT or UPDATE, and a removal is a lookup then a DELETE. The SQLite bridges
// run statements one at a time but queue each on its own (the mobile shell's www/sqlite_bridge.js and
// utils/capacitor_sqlite_shim.js), so two writes of one record could both see no row and both insert it,
// and a removal could look before a pending insert and miss it. The table has no unique key on ref_id to
// stop either. Work for the same row runs in the order asked; different rows still interleave.
//
// `run(finished)` must call `finished` once its last statement has answered. If the bridge never answers,
// the row is freed after `watchdog_ms` so later writes of it are not held until the app restarts.
var waiting = {};

export function one_at_a_time(row, run, watchdog_ms) {
  if(waiting[row]) {
    waiting[row].push(run);
    return;
  }
  waiting[row] = [];
  var go = function(next_run) {
    var freed = false;
    var timer = null;
    var finished = function() {
      if(freed) { return; }
      freed = true;
      if(timer) { clearTimeout(timer); }
      var list = waiting[row];
      if(list && list.length) {
        go(list.shift());
      } else {
        delete waiting[row];
      }
    };
    if(watchdog_ms) {
      timer = setTimeout(function() {
        console.error('LINGOLINQ: sqlite write for ' + row + ' unanswered after ' + watchdog_ms + 'ms; freeing the row');
        finished();
      }, watchdog_ms);
    }
    try {
      next_run(finished);
    } catch(e) {
      finished();
      throw e;
    }
  };
  go(run);
}

export default { one_at_a_time: one_at_a_time };
