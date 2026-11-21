import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { note_board_root, root_for_link, rollup, with_errors, summary_for, current_root_name, only_parked_left, note_board_done, confirmed_statuses, live_board_errors, content_error, note_board_written, note_warning, new_warnings } from 'frontend/utils/sync_rollup';
import { ready_title } from 'frontend/utils/sync_progress';

/* Sync results grouped by the boards a person knows (utils/sync_rollup.js): one row per home, sidebar or liked
 * board, with its folders underneath, instead of every folder on its own line (Traci, 2026-11-14). */
module('Unit | Utility | sync rollup', function() {
  // A walk: Core 60 (home) with three folders, one of which fails; a sidebar board with none.
  function walk() {
    var sp = {};
    var home = { id: '1_1', key: 'me/core', depth: 0, visit_source: 'home board' };
    note_board_root(sp, home, { id: '1_1', key: 'me/core', name: 'Quick Core 60' });
    ['feel', 'those', 'go'].forEach(function(slug, idx) {
      var link = Object.assign({ id: '1_' + (10 + idx), key: 'me/core-' + slug, depth: 1, visit_source: 'me/core' }, root_for_link(home));
      note_board_root(sp, link, { id: link.id, key: link.key, name: slug.charAt(0).toUpperCase() + slug.slice(1) });
    });
    var side = { key: 'me/keyboard', depth: 1, visit_source: 'sidebar board' };
    note_board_root(sp, side, { id: '1_20', key: 'me/keyboard', name: 'Keyboard' });
    var statuses = [
      { id: '1_20', key: 'me/keyboard', status: 'cached' },
      { id: '1_1', key: 'me/core', status: 'downloaded' },
      { id: '1_10', key: 'me/core-feel', status: 'downloaded' },
      { id: '1_11', key: 'me/core-those', status: 're-downloaded' },
      { id: '1_12', key: 'me/core-go', status: 'kept' },
      { id: '1_11', key: 'me/core-those', error: 'board me/core-those failed retrieval for syncing, linked from me/core' }
    ];
    return { sp: sp, statuses: statuses };
  }

  test('folders are grouped under the board they were reached from, home first', function(assert) {
    var w = walk();
    var r = rollup(w.statuses, w.sp.board_roots);
    assert.deepEqual(r.groups.map(function(g) { return g.name; }), ['Quick Core 60', 'Keyboard'], 'home before sidebar');
    var core = r.groups[0];
    assert.strictEqual(core.role, 'home board');
    assert.strictEqual(core.folder_count, 3);
    assert.deepEqual(core.folders_saved, ['Feel', 'Go'], 'saved folders, by name ("kept" is on the device)');
    assert.deepEqual(core.folders_missing, ['Those'], 'the folder that failed');
    assert.false(core.ready);
    assert.true(r.groups[1].ready, 'a board with no folders that saved is ready');
    assert.strictEqual(r.groups[1].folder_count, 0);
  });

  test('the overall count covers boards and folders', function(assert) {
    var w = walk();
    var o = rollup(w.statuses, w.sp.board_roots).overall;
    assert.deepEqual([o.saved, o.total, o.missing], [4, 5, 1]);
    assert.strictEqual(o.pct, 80);
  });

  test('a board looked up again keeps its last word, and a recorded failure is not hidden by an earlier status row', function(assert) {
    var sp = {};
    note_board_root(sp, { key: 'me/a', visit_source: 'sidebar board' }, { key: 'me/a', name: 'A' });
    var r = rollup([{ key: 'me/a', status: 're-downloaded' }, { key: 'me/a', error: 'failed retrieval' }], sp.board_roots);
    assert.true(r.groups[0].board_missing);
    var r2 = rollup([{ key: 'me/a', status: 'downloaded' }], sp.board_roots);
    assert.true(r2.groups[0].board_saved);
  });

  test('a log from before the map shows each board on its own, named from its key', function(assert) {
    var r = rollup([{ key: 'lingolinq/core-60-feel', status: 'downloaded' }], null);
    assert.strictEqual(r.groups.length, 1);
    assert.strictEqual(r.groups[0].name, 'core 60 feel');
    assert.true(r.groups[0].ready);
  });

  test('a folder of a folder is still under the top board', function(assert) {
    var sp = {};
    var home = { key: 'me/core', visit_source: 'home board' };
    note_board_root(sp, home, { key: 'me/core', name: 'Core' });
    var mid = Object.assign({ key: 'me/mid' }, root_for_link(home));
    note_board_root(sp, mid, { key: 'me/mid', name: 'Mid' });
    var deep = Object.assign({ key: 'me/deep' }, root_for_link(mid));
    note_board_root(sp, deep, { key: 'me/deep', name: 'Deep' });
    var r = rollup([{ key: 'me/core', status: 'cached' }, { key: 'me/mid', status: 'cached' }, { key: 'me/deep', status: 'downloaded' }], sp.board_roots);
    assert.strictEqual(r.groups.length, 1);
    assert.deepEqual(r.groups[0].folders_saved, ['Deep', 'Mid']);
  });

  test('errors kept during a sync are merged as the finished sync merges them', function(assert) {
    var rows = with_errors([{ key: 'me/a', status: 'downloaded' }], [{ board_key: 'me/b', board_id: '1_2', error: 'failed' }, { error: 'no board' }]);
    assert.deepEqual(rows, [{ key: 'me/a', status: 'downloaded' }, { id: '1_2', key: 'me/b', error: 'failed' }]);
  });

  test('the summary is the running sync while one runs, otherwise the last finished one', function(assert) {
    var w = walk();
    var p = EmberObject.create({ syncing: false, sync_progress: null, sync_log: [
      { statuses: [{ key: 'old/a', status: 'cached' }] },
      { statuses: w.statuses, roots: w.sp.board_roots }
    ] });
    assert.deepEqual(summary_for(p).groups.map(function(g) { return g.name; }), ['Quick Core 60', 'Keyboard'], 'the latest log entry');
    p.setProperties({ syncing: true, sync_progress: { board_statuses: [{ id: '1_1', key: 'me/core', status: 'downloaded' }], errors: [{ board_key: 'me/core-go', board_id: '1_12', error: 'failed' }], board_roots: w.sp.board_roots } });
    var running = summary_for(p);
    assert.strictEqual(running.groups.length, 1, 'only what the running sync has reached');
    assert.deepEqual(running.groups[0].folders_missing, ['Go'], 'with the failures it recorded');
    assert.strictEqual(summary_for(EmberObject.create({ sync_log: [] })), null, 'nothing before a first sync');
    assert.strictEqual(summary_for(null), null);
  });

  // docs/task-management/2026-11-16_sync-details-no-percent.md: Sync Details shows, with no finished sync, the newest
  // stopped one; it and a running sync are unfinished (no Ready labels, Traci 2026-11-16). The drawer never shows an
  // earlier or stopped sync.
  test('with no finished sync, the summary is the newest stopped one, unfinished', function(assert) {
    var w = walk();
    var p = EmberObject.create({ sync_log: [{ errored: true, statuses: w.statuses, roots: w.sp.board_roots, finished: new Date(1700000000000) }] });
    var s = summary_for(p);
    assert.true(s.unfinished);
    assert.true(s.stopped);
    assert.false(s.from_earlier);
    assert.deepEqual(s.groups.map(function(g) { return g.name; }), ['Quick Core 60', 'Keyboard']);
    assert.strictEqual(summary_for(p, { latest_only: true }), null, 'the drawer reports only a sync that finished');
  });

  test('a running sync is unfinished; a finished one is not', function(assert) {
    var w = walk();
    var running = EmberObject.create({ syncing: true, sync_progress: { board_statuses: w.statuses, board_roots: w.sp.board_roots }, sync_log: [] });
    assert.true(summary_for(running).unfinished);
    assert.notOk(summary_for(running).stopped);
    var done = EmberObject.create({ sync_log: [{ statuses: w.statuses, roots: w.sp.board_roots }] });
    assert.notOk(summary_for(done).unfinished);
    var stopped_later = EmberObject.create({ sync_log: [{ statuses: w.statuses, roots: w.sp.board_roots }, { errored: true, statuses: w.statuses, roots: w.sp.board_roots }] });
    assert.notOk(summary_for(stopped_later).unfinished, 'an earlier finished sync wins over a later stopped one');
    assert.true(summary_for(stopped_later).from_earlier);
  });

  // One wording for how many boards are ready, in the drawer and Sync Details (Traci, 2026-11-16).
  test('how many boards are ready offline, in words', function(assert) {
    var w = walk();
    assert.strictEqual(ready_title(rollup(w.statuses, w.sp.board_roots)), '1 of 2 boards are ready offline');
    var clean = w.statuses.filter(function(s) { return !s.error; });
    assert.strictEqual(ready_title(rollup(clean, w.sp.board_roots)), 'All your boards are ready offline');
    assert.strictEqual(ready_title(null), null);
  });

  test('the board being saved now is named by its top board', function(assert) {
    var w = walk();
    assert.strictEqual(current_root_name([{ id: '1_10', key: 'me/core-feel' }], w.sp.board_roots), 'Quick Core 60');
    assert.strictEqual(current_root_name([], w.sp.board_roots), null);
    assert.strictEqual(current_root_name([{ key: 'me/unknown' }], w.sp.board_roots), null);
  });

  test('waiting for a better connection only when parked boards are all that is left', function(assert) {
    assert.true(only_parked_left({ parked: 2, to_visit: 2 }));
    assert.false(only_parked_left({ parked: 2, to_visit: 5 }), 'other boards are still downloading');
    assert.false(only_parked_left({ parked: 0, to_visit: 0 }));
    assert.false(only_parked_left(null));
  });

  // docs/task-management/2026-11-16_sync-details-no-percent.md Part 2 (H): at a stop, a download row counts as saved
  // only when board_lookup finished it or the device database confirmed it; otherwise it is 'not_saved' (not an error).
  test('confirmed_statuses: unconfirmed downloads at a stop are not saved', function(assert) {
    var sp = { device_boards: { '1_3': true, 'me/kept-on-device': true } };
    note_board_done(sp, '1_1', 'me/done');
    var rows = confirmed_statuses([
      { id: '1_1', key: 'me/done', status: 're-downloaded' },
      { id: '1_2', key: 'me/parked', status: 're-downloaded' },
      { id: '1_3', key: 'me/batch', status: 'downloaded' },
      { id: '1_4', key: 'me/kept-on-device', status: 'downloaded' },
      { id: '1_5', key: 'me/in-flight', status: 'downloaded' },
      { id: '1_6', key: 'me/cached', status: 'cached' },
      { id: '1_7', key: 'me/kept', status: 'kept' },
      { id: '1_8', key: 'me/failed', error: 'board me/failed failed retrieval for syncing' }
    ], sp);
    assert.deepEqual(rows.map((r) => r.status || 'error:' + r.error.slice(0, 12)), ['re-downloaded', 'not_saved', 'downloaded', 'downloaded', 'not_saved', 'cached', 'kept', 'error:board me/fai']);
    assert.false(rows.some((r) => r.status === 'not_saved' && r.error), 'not an error');
    var grouped = rollup(rows, {});
    assert.strictEqual(grouped.overall.saved, 5, 'the two unconfirmed downloads and the failure are not counted as saved');
    assert.deepEqual(confirmed_statuses(null, sp), []);
    assert.strictEqual(confirmed_statuses([{ id: '9', key: 'x/y', status: 'downloaded' }], null)[0].status, 'not_saved', 'no progress: nothing is confirmed');
  });

  test('note_board_done marks by id and key, and ignores a missing progress', function(assert) {
    var sp = {};
    note_board_done(sp, '1_1', null);
    note_board_done(sp, null, 'me/k');
    note_board_done(null, '1_2', 'me/x');
    assert.deepEqual(confirmed_statuses([{ id: '1_1', status: 'downloaded' }, { key: 'me/k', status: 're-downloaded' }], sp).map((r) => r.status), ['downloaded', 're-downloaded']);
  });

  // Part 2 (A): the errors a stopped sync recorded are read from the live per-user arrays (the sync_progress.errors copy
  // is refreshed only at each walk step), every user's, plus any copy entry not among them, each once.
  test('live_board_errors: every user\'s live array, plus copy entries not already there, each once', function(assert) {
    var a = { board_id: '1_4', board_key: 'me/x', error: 'board me/x failed retrieval for syncing' };
    var b = { board_id: '1_5', board_key: 'kid/y', error: 'board kid/y failed retrieval for syncing' };
    var c = { board_id: '1_6', board_key: 'me/z', error: 'board me/z failed retrieval for syncing' };
    var sp = { progress_for: { u1: { board_errors: [a] }, u2: { board_errors: [b] } }, errors: [a, c] };
    assert.deepEqual(live_board_errors(sp), [a, b, c]);
    assert.deepEqual(live_board_errors({ errors: [c] }), [c], 'no live arrays: the copy');
    assert.deepEqual(live_board_errors(null), []);
  });

  // Part 2 unit T: a board that was reached but whose pictures or sounds did not all save ("failed to sync
  // completely") is tagged `content`, so PR #1328's offline list can tell it from a board the server refused.
  test('content_error: a board reached whose content did not all save is tagged content', function(assert) {
    var msg = 'board me/core failed to sync completely: button image failed to sync, http://example.com/p.png';
    assert.deepEqual(content_error(msg, '1_1', 'me/core'), { error: msg, board_id: '1_1', board_key: 'me/core', content: true });
  });

  // Part 3, unit F1: a board counts as saved once its WRITE succeeds (both persistence store copies call this).
  test('note_board_written: a written board, by id and key, from either shape', function(assert) {
    var sp = {};
    var root = { get: function(k) { return k === 'sync_progress' ? sp : null; } };
    note_board_written(root, 'board', { board: { id: '1_5', key: 'me/x' }, images: [] }); // the adapter's payload
    assert.deepEqual(sp.boards_done, { '1_5': true, 'me/x': true });
    assert.strictEqual(sp.device_boards, undefined, 'never creates the device map (it means "the device was read")');
    note_board_written(root, 'board', { id: '1_6', key: 'me/y' }); // the batch's raw board
    assert.true(sp.boards_done['1_6'] && sp.boards_done['me/y']);
    sp.device_boards = {};
    note_board_written(root, 'board', { id: '1_7', key: 'me/z' });
    assert.deepEqual(sp.device_boards, { '1_7': true, 'me/z': true }, 'adds to a map the sync read');
    note_board_written(root, 'image', { id: '1_8' });
    assert.false(!!sp.boards_done['1_8'], 'only boards');
    note_board_written({ get: function() { return null; } }, 'board', { id: '1_9' });
    note_board_written(null, 'board', { id: '1_9' });
    assert.false(!!sp.boards_done['1_9'], 'no sync running: nothing');
  });

  test('with_errors keeps the content tag, and adds none to other failures', function(assert) {
    var rows = with_errors([], [
      { board_id: '1_1', board_key: 'me/core', error: 'board me/core failed to sync completely', content: true },
      { board_id: '1_9', board_key: 'kid/feel', error: 'board kid/feel failed retrieval for syncing' }
    ]);
    assert.deepEqual(rows, [
      { id: '1_1', key: 'me/core', error: 'board me/core failed to sync completely', content: true },
      { id: '1_9', key: 'kid/feel', error: 'board kid/feel failed retrieval for syncing' }
    ]);
  });

  test('a board saved without its picture is still ready, and its group names it', function(assert) {
    var w = walk();
    w.statuses.push({ id: '1_20', key: 'me/keyboard', status: 'cached', warning: 'board me/keyboard saved without its picture: x' });
    var r = rollup(w.statuses, w.sp.board_roots);
    var kb = r.groups[1];
    assert.true(kb.ready, 'a warning is not a failure');
    assert.deepEqual(kb.pictures_missing, ['Keyboard']);
    assert.deepEqual(r.groups[0].pictures_missing, []);
    assert.strictEqual(r.overall.warned, 1);
    assert.deepEqual(r.overall.pictures_missing, ['Keyboard'], 'by name, for the warning');
    assert.strictEqual(r.overall.missing, 1, 'the missing count is unchanged');
    assert.strictEqual(rollup(walk().statuses, w.sp.board_roots).overall.warned, 0);
  });

  test('note_warning puts the warning on the board\'s latest row, never on a row of its own', function(assert) {
    var rows = [{ id: 'me/side', key: 'me/side', status: 'downloaded' }, { id: '1_2', key: 'me/side', status: 'cached' }, { key: 'me/other', status: 'cached' }];
    assert.true(note_warning(rows, { warning: 'w', board_id: 'me/side', board_key: 'me/side' }));
    assert.deepEqual(rows.map(function(r) { return r.warning; }), [undefined, 'w', undefined], 'the latest row of that board');
    assert.false(note_warning(rows, { warning: 'w', board_id: 'me/none', board_key: 'me/none' }), 'no row: nothing added');
    assert.strictEqual(rows.length, 3);
    var by_id = [{ id: '145', status: 'downloaded' }];
    assert.true(note_warning(by_id, { warning: 'w', board_id: '145' }), 'a board known by id');
    var errored = [{ key: 'me/x', error: 'e' }];
    assert.false(note_warning(errored, { warning: 'w', board_key: 'me/x' }), 'not on an error row');
  });

  test('an error wins over a warning for the same board', function(assert) {
    var w = walk();
    w.statuses.push({ id: '1_20', key: 'me/keyboard', status: 'cached', warning: 'w' }, { id: '1_20', key: 'me/keyboard', error: 'failed' });
    var r = rollup(w.statuses, w.sp.board_roots);
    assert.false(r.groups[1].ready);
    assert.deepEqual(r.groups[1].pictures_missing, []);
    assert.strictEqual(r.overall.warned, 0);
  });

  test('new_warnings: only boards the sync before, for the same person, did not warn about', function(assert) {
    var entry = function(user, rows) { return { user_id: user, statuses: rows }; };
    var kb = { key: 'me/kb', status: 'cached', warning: 'w' };
    var fun = { key: 'me/fun', status: 'cached', warning: 'w' };
    var plain = { key: 'me/kb', status: 'cached' };
    assert.deepEqual(new_warnings([entry('me', [kb])]), ['me/kb'], 'no sync before: new');
    assert.deepEqual(new_warnings([entry('me', [kb]), entry('me', [kb])]), [], 'the same warning again');
    assert.deepEqual(new_warnings([entry('me', [kb]), entry('me', [kb, fun])]), ['me/fun']);
    assert.deepEqual(new_warnings([entry('me', [plain]), entry('me', [kb])]), ['me/kb'], 'warned now, not before');
    assert.deepEqual(new_warnings([entry('me', [kb]), entry('me', []), entry('me', [kb])]), [], 'a sync with no rows (cancelled) is skipped');
    assert.deepEqual(new_warnings([entry('me', [kb]), Object.assign(entry('me', [plain]), { errored: true }), entry('me', [kb])]), [], 'a failed sync with partial rows is skipped');
    assert.deepEqual(new_warnings([entry('me', [kb]), Object.assign(entry('me', [plain]), { canceled: true }), entry('me', [kb])]), [], 'a cancelled sync with partial rows is skipped');
    assert.deepEqual(new_warnings([entry('you', [kb]), entry('me', [kb])]), ['me/kb'], 'another person\'s sync does not count');
    assert.deepEqual(new_warnings([entry('me', [plain])]), []);
    assert.deepEqual(new_warnings([]), []);
    assert.deepEqual(new_warnings(null), []);
    var you = { key: 'you/fun', status: 'cached' };
    assert.deepEqual(new_warnings([entry('me', [kb]), entry('me', [kb]), entry('you', [you])], 'me'), [], 'someone else\'s sync last: the signed-in person\'s own two are compared');
    assert.deepEqual(new_warnings([entry('me', [plain]), entry('me', [kb]), entry('you', [you])], 'me'), ['me/kb']);
    assert.deepEqual(new_warnings([entry('me', [kb]), entry('me', [kb]), Object.assign(entry('me', [plain]), { errored: true })], 'me'), [], 'their newest finished sync is the one before a failure, compared with the one before it');
    assert.deepEqual(new_warnings([entry('you', [kb])], 'me'), [], 'no sync of theirs');
  });
});
