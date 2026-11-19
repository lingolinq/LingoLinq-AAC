import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { note_board_root, root_for_link, rollup, with_errors, summary_for, current_root_name, only_parked_left, note_warning, new_warnings } from 'frontend/utils/sync_rollup';

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

  test('a board saved without its picture is still ready, and its group names it', function(assert) {
    var w = walk();
    w.statuses.push({ id: '1_20', key: 'me/keyboard', status: 'cached', warning: 'board me/keyboard saved without its picture: x' });
    var r = rollup(w.statuses, w.sp.board_roots);
    var kb = r.groups[1];
    assert.true(kb.ready, 'a warning is not a failure');
    assert.deepEqual(kb.pictures_missing, ['Keyboard']);
    assert.deepEqual(r.groups[0].pictures_missing, []);
    assert.strictEqual(r.overall.warned, 1);
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
  });
});
