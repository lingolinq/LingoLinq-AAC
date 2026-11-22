import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';
import EmberObject from '@ember/object';
import { pick_device_boards, device_board_list, own_device_db_user, followable_links } from 'frontend/utils/offline_board_list';

/* "Boards on This Device" (docs/task-management/2026-11-16_offline-boards-page.md): offline, the boards page lists
 * every board the person can open from the device: the sync's seeds (home, sidebar, liked, Crisis Vocabulary) and
 * their own other boards, each set by its top board, folders inside. Device rows are {data: {id, raw}}. */
module('Unit | Utility | offline board list', function(hooks) {
  setupTest(hooks);

  // A board whose buttons open `links` (ids), all on the grid unless a test says otherwise.
  function board(id, key, links, extra) {
    var buttons = (links || []).map(function(to, i) { return { id: i + 1, load_board: { id: to } }; });
    var order = [buttons.map(function(b) { return b.id; })];
    return { data: { id: id, raw: Object.assign({ id: id, key: key, name: key.split('/')[1], user_name: key.split('/')[0], buttons: buttons, grid: { order: order } }, extra || {}) } };
  }
  function person(extra) {
    return EmberObject.create(Object.assign({ user_name: 'larry', preferences: {}, stats: {} }, extra || {}));
  }
  var keys = function(rows) { return rows.map(function(r) { return r.key; }); };
  var CRISIS = board('9_99', 'lingolinq/crisis-vocabulary');

  test('the home board, not its folders; sidebar, liked; Crisis Vocabulary last', function(assert) {
    var rows = [
      board('1_1', 'larry/home', ['1_2']), board('1_2', 'larry/home-folder'),
      board('2_1', 'lingolinq/yes-no'), board('3_1', 'larry/liked-own'), CRISIS,
    ];
    var user = person({ preferences: { home_board: { id: '1_1', key: 'larry/home' }, sidebar_boards: [{ key: 'lingolinq/yes-no' }] },
      stats: { starred_board_refs: [{ id: '3_1', key: 'larry/liked-own' }] } });
    assert.deepEqual(keys(pick_device_boards(rows, user, [])), ['larry/home', 'lingolinq/yes-no', 'larry/liked-own', 'lingolinq/crisis-vocabulary']);
  });

  test('another owner\'s liked board only when a sync saw it and none refused it', function(assert) {
    var rows = [board('4_1', 'therapist/feelings'), CRISIS];
    var user = person({ stats: { starred_board_refs: [{ id: '4_1', key: 'therapist/feelings' }] } });
    assert.deepEqual(keys(pick_device_boards(rows, user, [])), ['lingolinq/crisis-vocabulary'], 'no sync log: not offered');
    var seen = [{ user_id: 'larry', statuses: [{ id: '4_1', key: 'therapist/feelings', status: 'cached' }] }];
    assert.deepEqual(keys(pick_device_boards(rows, user, seen)), ['therapist/feelings', 'lingolinq/crisis-vocabulary']);
    var refused = [{ user_id: 'larry', statuses: [{ id: '4_1', key: 'therapist/feelings', status: 'cached' }, { id: '4_1', key: 'therapist/feelings', error: 'Not authorized', refused: true }] }];
    assert.deepEqual(keys(pick_device_boards(rows, user, refused)), ['lingolinq/crisis-vocabulary'], 'refused since: not offered');
  });

  test('a seed is listed even when another listed board links to it', function(assert) {
    var rows = [board('1_1', 'larry/home', ['2_1']), board('2_1', 'lingolinq/yes-no'), CRISIS];
    var user = person({ preferences: { home_board: { id: '1_1', key: 'larry/home' }, sidebar_boards: [{ key: 'lingolinq/yes-no' }] } });
    assert.deepEqual(keys(pick_device_boards(rows, user, [])), ['larry/home', 'lingolinq/yes-no', 'lingolinq/crisis-vocabulary']);
  });

  test('own boards no seed reaches are listed by set; a cycle is still listed once', function(assert) {
    var rows = [
      board('5_1', 'larry/beta-set', ['5_2']), board('5_2', 'larry/beta-folder'),
      board('6_1', 'larry/alpha-a', ['6_2']), board('6_2', 'larry/alpha-b', ['6_1']),
      board('7_1', 'other/not-mine'), CRISIS,
    ];
    assert.deepEqual(keys(pick_device_boards(rows, person(), [])), ['larry/alpha-a', 'larry/beta-set', 'lingolinq/crisis-vocabulary'],
      'sets by name; the folder inside its set; the two-board loop once; someone else\'s unlisted board left out');
  });

  // Review rounds 3 and 4 (red team, Low): nothing outside reaches a loop of own boards, so the set is listed by its
  // first loop member by key. A folder hanging off the loop is inside it, even when its key sorts first.
  test('a loop with a folder hanging off it: one entry for the set, the folder not listed twice', function(assert) {
    var rows = [
      board('8_1', 'larry/main', ['8_2']), board('8_2', 'larry/food', ['8_1', '8_3']), board('8_3', 'larry/a-leaf'), CRISIS,
    ];
    assert.deepEqual(keys(pick_device_boards(rows, person(), [])), ['larry/food', 'lingolinq/crisis-vocabulary']);
  });

  // A loop below another loop: only the top loop is an entry; the lower loop's boards are folders inside it.
  test('a loop below a loop: one entry, at the top loop', function(assert) {
    var rows = [
      board('8_1', 'larry/z-top-a', ['8_2', '8_3']), board('8_2', 'larry/z-top-b', ['8_1']),
      board('8_3', 'larry/b-low-a', ['8_4']), board('8_4', 'larry/b-low-b', ['8_3']), CRISIS,
    ];
    assert.deepEqual(keys(pick_device_boards(rows, person(), [])), ['larry/z-top-a', 'lingolinq/crisis-vocabulary']);
  });

  // Every own board stays reachable from the list: a plain set, a loop and a board below both each show up once.
  test('loops and sets together: each set once, no own board left out', function(assert) {
    var rows = [
      board('5_1', 'larry/set', ['5_2', '5_9']), board('5_2', 'larry/set-folder'),
      board('6_1', 'larry/loop-a', ['6_2']), board('6_2', 'larry/loop-b', ['6_1', '5_9']),
      board('5_9', 'larry/shared-folder'), board('7_1', 'larry/alone'), CRISIS,
    ];
    assert.deepEqual(keys(pick_device_boards(rows, person(), [])),
      ['larry/alone', 'larry/loop-a', 'larry/set', 'lingolinq/crisis-vocabulary']);
  });

  test('a loop of three boards is listed once, by its first board by key', function(assert) {
    var rows = [board('8_1', 'larry/c', ['8_2']), board('8_2', 'larry/a', ['8_3']), board('8_3', 'larry/b', ['8_1']), CRISIS];
    assert.deepEqual(keys(pick_device_boards(rows, person(), [])), ['larry/a', 'lingolinq/crisis-vocabulary']);
  });

  // Links may name a board by key only, or carry an id the device does not have with a key it does.
  test('the loop with a folder off it, linked by key only or by a stale id', function(assert) {
    var linked = function(id, key, refs) {
      return board(id, key, [], { buttons: refs.map(function(ref, i) { return { id: i + 1, load_board: ref }; }),
        grid: { order: [refs.map(function(ref, i) { return i + 1; })] } });
    };
    var by_key = [
      linked('8_1', 'larry/main', [{ key: 'larry/food' }]),
      linked('8_2', 'larry/food', [{ key: 'larry/main' }, { key: 'larry/a-leaf' }]), board('8_3', 'larry/a-leaf'), CRISIS,
    ];
    assert.deepEqual(keys(pick_device_boards(by_key, person(), [])), ['larry/food', 'lingolinq/crisis-vocabulary'], 'by key only');
    var stale = [
      linked('8_1', 'larry/main', [{ id: '0_404', key: 'larry/food' }]),
      linked('8_2', 'larry/food', [{ id: '0_405', key: 'larry/main' }, { id: '0_406', key: 'larry/a-leaf' }]), board('8_3', 'larry/a-leaf'), CRISIS,
    ];
    assert.deepEqual(keys(pick_device_boards(stale, person(), [])), ['larry/food', 'lingolinq/crisis-vocabulary'], 'stale ids');
  });

  test('an own board linked only through a hidden button is its own entry', function(assert) {
    var rows = [board('8_1', 'larry/a', [], { buttons: [{ id: 1, load_board: { id: '8_2' }, hidden: true }], grid: { order: [[1]] } }),
      board('8_2', 'larry/b'), CRISIS];
    assert.deepEqual(keys(pick_device_boards(rows, person(), [])), ['larry/a', 'larry/b', 'lingolinq/crisis-vocabulary']);
  });

  // Another owner's board in a loop with an own board is never listed for it, on a trusted or a shared device, and a
  // refused liked board stays refused.
  test('another owner\'s board in a loop with an own board: the own board is listed, not the other', function(assert) {
    var rows = [board('8_1', 'larry/root', ['4_1']), board('4_1', 'aaron/unshared', ['8_1']), board('9_99', 'lingolinq/crisis-vocabulary', [], { public: true })];
    var user = person({ stats: { starred_board_refs: [{ id: '4_1', key: 'aaron/unshared' }] } });
    var refused = [{ user_id: 'larry', statuses: [{ id: '4_1', key: 'aaron/unshared', error: 'Not authorized', refused: true }] }];
    assert.deepEqual(keys(pick_device_boards(rows, user, refused)), ['larry/root', 'lingolinq/crisis-vocabulary'], 'trusted device');
    assert.deepEqual(keys(pick_device_boards(rows, user, refused, { shared: true, me: 'larry' })), ['larry/root', 'lingolinq/crisis-vocabulary'], 'shared device');
  });

  test('an own loop below another owner\'s board is a folder of the set above it', function(assert) {
    var rows = [board('8_1', 'larry/root', ['4_1']), board('4_1', 'other/x', ['8_2']),
      board('8_2', 'larry/l1', ['8_3']), board('8_3', 'larry/l2', ['8_2']), CRISIS];
    assert.deepEqual(keys(pick_device_boards(rows, person(), [])), ['larry/root', 'lingolinq/crisis-vocabulary']);
  });

  // Final review (both reviewers, 2026-11-20): on a device not marked "Trust this Device", another owner's board does
  // not open (routes/user.js _device_owner), so a link through it reaches nothing; the own boards behind it are listed.
  test('a shared device: own boards behind another owner\'s board are listed, since that board does not open', function(assert) {
    var shared = { shared: true, me: 'larry' };
    var leaf = [board('8_1', 'larry/root', ['4_1']), board('4_1', 'aaron/x', ['8_2']), board('8_2', 'larry/leaf')];
    assert.deepEqual(keys(pick_device_boards(leaf, person(), [], shared)), ['larry/leaf', 'larry/root'], 'a board below it');
    var loop = [board('8_1', 'larry/root', ['4_1']), board('4_1', 'other/x', ['8_2']),
      board('8_2', 'larry/l1', ['8_3']), board('8_3', 'larry/l2', ['8_2'])];
    assert.deepEqual(keys(pick_device_boards(loop, person(), [], shared)), ['larry/l1', 'larry/root'], 'a loop below it');
    assert.deepEqual(keys(pick_device_boards(loop, person(), [])), ['larry/root'], 'trusted: it opens, so the loop is a folder');
  });

  // #1336 (2026-11-21): only a refusal hides another owner's liked board; a finished sync whose only failure was a
  // device write still counts as the sync that saw it (#1336 marks it errored and storage_failed).
  test('another owner\'s liked board: a sync whose only failure was a device write still saw it', function(assert) {
    var rows = [board('4_1', 'therapist/feelings'), CRISIS];
    var user = person({ stats: { starred_board_refs: [{ id: '4_1', key: 'therapist/feelings' }] } });
    var before_the_like = { user_id: 'larry', statuses: [{ id: '5_5', key: 'larry/other', status: 'cached' }] };
    var write_failed = { user_id: 'larry', issues: false, errored: true, storage_failed: true, statuses: [{ id: '4_1', key: 'therapist/feelings', status: 'downloaded' }] };
    assert.deepEqual(keys(pick_device_boards(rows, user, [before_the_like, write_failed])), ['therapist/feelings', 'lingolinq/crisis-vocabulary']);
    var stopped = { user_id: 'larry', errored: true, statuses: [{ id: '4_1', key: 'therapist/feelings', status: 'downloaded' }] };
    assert.deepEqual(keys(pick_device_boards(rows, user, [before_the_like, stopped])), ['lingolinq/crisis-vocabulary'],
      'a sync stopped by an error is not the one that saw it');
  });

  test('another owner\'s liked board: a bad connection or an unknown error does not hide it', function(assert) {
    var rows = [board('4_1', 'therapist/feelings'), CRISIS];
    var user = person({ stats: { starred_board_refs: [{ id: '4_1', key: 'therapist/feelings' }] } });
    var ok = { user_id: 'larry', statuses: [{ id: '4_1', key: 'therapist/feelings', status: 'cached' }] };
    var timeout = { id: '4_1', key: 'therapist/feelings', error: 'board therapist/feelings failed retrieval for syncing, linked from larry/home' };
    var both = ['therapist/feelings', 'lingolinq/crisis-vocabulary'];
    assert.deepEqual(keys(pick_device_boards(rows, user, [ok, { user_id: 'larry', errored: true, statuses: [timeout] }])), both, 'a later stopped sync');
    assert.deepEqual(keys(pick_device_boards(rows, user, [{ user_id: 'larry', statuses: [{ id: '4_1', key: 'therapist/feelings', status: 'cached' }, timeout] }])), both,
      'the same finished sync');
  });

  // Final review of the refused-only change (2026-11-21): which syncs decide, and what an untagged error does.
  test('another owner\'s liked board: stopped and cancelled syncs never decide; untagged errors fall back to an older whole sync', function(assert) {
    var rows = [board('4_1', 'therapist/feelings'), CRISIS];
    var user = person({ stats: { starred_board_refs: [{ id: '4_1', key: 'therapist/feelings' }] } });
    var row = function(extra) { return Object.assign({ id: '4_1', key: 'therapist/feelings' }, extra); };
    var whole = function(statuses, extra) { return Object.assign({ user_id: 'larry', issues: false, statuses: statuses }, extra || {}); };
    var refused = row({ error: 'Not authorized', refused: true });
    var untagged = row({ error: 'board therapist/feelings failed retrieval for syncing' });
    var other = { id: '5_5', key: 'larry/other', status: 'cached' };
    var only = ['lingolinq/crisis-vocabulary'];
    var both = ['therapist/feelings', 'lingolinq/crisis-vocabulary'];
    var stopped_write_failed = { user_id: 'larry', errored: true, storage_failed: true, confirmed: true };
    assert.deepEqual(keys(pick_device_boards(rows, user, [whole([refused]), Object.assign({ statuses: [row({ status: 're-downloaded' })] }, stopped_write_failed)])), only,
      'a stop with a failed write is not the sync that saw it (its row was logged before the reload)');
    assert.deepEqual(keys(pick_device_boards(rows, user, [whole([row({ status: 'cached' })]), Object.assign({ statuses: [other] }, stopped_write_failed)])), both,
      'a stop with a failed write that did not reach it leaves the earlier whole sync in charge');
    assert.deepEqual(keys(pick_device_boards(rows, user, [whole([refused]), { user_id: 'larry', canceled: true, statuses: [row({ status: 're-downloaded' })] }])), only,
      'a cancel (an entry from before #1336, no `confirmed`) is not the sync that saw it');
    assert.deepEqual(keys(pick_device_boards(rows, user, [whole([row({ status: 'cached' })]), whole([])])), both, 'an entry with no rows decides nothing');
    assert.deepEqual(keys(pick_device_boards(rows, user, [whole([refused]), whole([untagged])])), only, 'refused, then only an untagged error: still hidden');
    assert.deepEqual(keys(pick_device_boards(rows, user, [whole([untagged])])), only, 'only an untagged error ever: not seen');
    assert.deepEqual(keys(pick_device_boards(rows, user, [whole([row({ status: 'cached' })]), whole([untagged])])), both, 'seen, then only an untagged error: listed');
    assert.deepEqual(keys(pick_device_boards(rows, user, [whole([row({ status: 're-downloaded' }), refused]), whole([untagged])])), only,
      'in the older sync a refusal wins over its clean row');
  });

  // Finding 1 (2026-11-21): rows in the shape the sync logs a liked seed (seeds carry only a key, so the row's id is the
  // key too: services/persistence.js `id = next.id || next.key`). A finished entry lists the boards the server really
  // answered (`answered`, utils/sync_board_fallback.js). A refusal still in the log hides the board until a real answer
  // comes after it; a row with no answer behind it ('kept' after a timeout, a reload served from the device copy, an
  // entry from before `answered`) lists it only when no refusal is in the log.
  test('another owner\'s liked board, real row shape: a refusal holds until the server really answers again', function(assert) {
    var K = 'therapist/feelings';
    var rows = [board('4_1', K), CRISIS];
    var user = person({ stats: { starred_board_refs: [{ key: K }] } });
    var row = function(extra) { return Object.assign({ id: K, key: K }, extra); };
    var whole = function(statuses, answered) { return { user_id: 'larry', issues: false, statuses: statuses, answered: answered ? [K] : undefined }; };
    var seen = whole([row({ status: 're-downloaded' })], true);
    var refused = whole([row({ status: 're-downloaded', error: 'board ' + K + ' failed retrieval for syncing', refused: true })]);
    var only = ['lingolinq/crisis-vocabulary'];
    var both = [K, 'lingolinq/crisis-vocabulary'];
    assert.deepEqual(keys(pick_device_boards(rows, user, [seen])), both, 'seen');
    assert.deepEqual(keys(pick_device_boards(rows, user, [seen, refused, whole([row({ status: 'kept' })])])), only, 'refused, then a timeout (kept)');
    assert.deepEqual(keys(pick_device_boards(rows, user, [seen, refused, whole([row({ status: 're-downloaded' })])])), only, 'refused, then a reload served from the device copy');
    assert.deepEqual(keys(pick_device_boards(rows, user, [seen, refused, whole([row({ status: 'kept', error: 'board ' + K + ' failed to sync completely', content: true })])])), only,
      'refused, then kept with a picture that did not save');
    assert.deepEqual(keys(pick_device_boards(rows, user, [seen, refused, whole([row({ status: 're-downloaded' })], true)])), both, 'refused, then the server answered again (shared again)');
    assert.deepEqual(keys(pick_device_boards(rows, user, [seen, { user_id: 'larry', canceled: true, confirmed: true, statuses: [row({ error: 'x', refused: true })] }, whole([row({ status: 'kept' })])])), only,
      'a refusal in a cancel between two whole syncs still counts');
    assert.deepEqual(keys(pick_device_boards(rows, user, [seen, { user_id: 'larry', errored: true, confirmed: true, statuses: [row({ error: 'x', refused: true })] }])), only,
      'a refusal in a stop after the last whole sync');
    assert.deepEqual(keys(pick_device_boards(rows, user, [whole([row({ status: 'kept' })]), whole([row({ status: 'kept' })]), whole([row({ status: 'kept' })])])), both,
      'only timeouts, no refusal: listed (slow links, a new like)');
    assert.deepEqual(keys(pick_device_boards(rows, user, [refused, seen, whole([row({ error: 'x' })])])), both, 'refused, answered, then untagged: listed');
    assert.deepEqual(keys(pick_device_boards(rows, user, [seen, refused, whole([row({ error: 'x' })])])), only, 'answered, refused, then untagged: hidden');
    assert.deepEqual(keys(pick_device_boards(rows, user, [whole([row({ status: 're-downloaded' }), row({ error: 'x', refused: true })], true)])), only,
      'in one sync, a refusal wins over an answered clean row');
  });

  // Finding 5 (2026-11-21): the walk from the listed boards does not pass through a board that does not open on this
  // device (another owner's, on a device not trusted), so an own board behind it is listed, not counted as a folder.
  test('a shared device: an own board reached from home only through another owner\'s board is listed', function(assert) {
    var rows = [board('1_1', 'larry/home', ['4_1']), board('4_1', 'aaron/x', ['8_2']), board('8_2', 'larry/leaf'), board('9_99', 'lingolinq/crisis-vocabulary', [], { public: true })];
    var user = person({ preferences: { home_board: { id: '1_1', key: 'larry/home' } } });
    assert.deepEqual(keys(pick_device_boards(rows, user, [], { shared: true, me: 'larry' })), ['larry/home', 'larry/leaf', 'lingolinq/crisis-vocabulary'], 'shared');
    assert.deepEqual(keys(pick_device_boards(rows, user, [])), ['larry/home', 'lingolinq/crisis-vocabulary'], 'trusted: it opens, so the leaf is a folder');
  });

  // Property check over random link graphs (seeded, so a failure repeats): only own boards are listed, each once; every
  // own board is listed or opens from a listed one; no listed board opens from another listed board.
  test('random link graphs: every own board reachable from the list, no entry inside another', function(assert) {
    var seed = 20261120;
    var failures = [];
    // Park-Miller: the product stays below 2^53, so every step is exact (a larger multiplier loses the low bits).
    var rand = function(n) { seed = (seed * 48271) % 2147483647; return seed % n; };
    var listed_total = 0;
    var rounds_with_a_loop = 0;
    for(var round = 0; round < 200; round++) {
      var count = 2 + rand(7);
      var links = {};
      var rows = [];
      for(var i = 0; i < count; i++) {
        var to = [];
        for(var j = 0; j < count; j++) { if(j !== i && rand(4) === 0) { to.push('8_' + j); } }
        links['8_' + i] = to;
        rows.push(board('8_' + i, (rand(4) === 0 ? 'other' : 'larry') + '/b' + i, to));
      }
      var listed = pick_device_boards(rows, person(), []).map(function(r) { return r.id; });
      listed_total += listed.length;
      if(Object.keys(links).some(function(a) { return links[a].some(function(b) { return links[b].indexOf(a) !== -1; }); })) { rounds_with_a_loop++; }
      var opens_from = function(start) {
        var seen = {};
        var queue = [start];
        while(queue.length) { links[queue.shift()].forEach(function(id) { if(!seen[id]) { seen[id] = true; queue.push(id); } }); }
        return seen;
      };
      var covered = {};
      var problems = [];
      var at = 'round ' + round + ' ' + JSON.stringify(links) + ': ';
      listed.forEach(function(id) {
        covered[id] = true;
        var below = opens_from(id);
        Object.keys(below).forEach(function(b) { covered[b] = true; });
        listed.forEach(function(other) { if(other !== id && below[other]) { problems.push(other + ' inside ' + id); } });
      });
      rows.forEach(function(row) {
        var raw = row.data.raw;
        if(raw.user_name === 'larry' && !covered[raw.id]) { problems.push(raw.key + ' unreachable'); }
        if(raw.user_name !== 'larry' && listed.indexOf(raw.id) !== -1) { problems.push(raw.key + ' listed'); }
      });
      if(listed.length !== Object.keys(covered).filter(function(id) { return listed.indexOf(id) !== -1; }).length) { problems.push('listed twice'); }
      problems.forEach(function(p) { failures.push(at + p); });
    }
    assert.deepEqual(failures.slice(0, 3), [], '200 random graphs');
    assert.ok(listed_total > 200, 'the graphs list own boards (' + listed_total + ')');
    assert.ok(rounds_with_a_loop > 20, 'the graphs include loops (' + rounds_with_a_loop + ')');
  });

  test('a board reached only through a hidden, disabled or off-grid button is its own entry', function(assert) {
    var rows = [board('8_1', 'larry/home', [], { buttons: [
      { id: 1, load_board: { id: '8_2' }, hidden: true },
      { id: 2, load_board: { id: '8_3' }, link_disabled: true },
      { id: 3, load_board: { id: '8_4' } },
    ], grid: { order: [[1, 2]] } }), board('8_2', 'larry/hidden-link'), board('8_3', 'larry/disabled-link'), board('8_4', 'larry/off-grid'), CRISIS];
    var user = person({ preferences: { home_board: { id: '8_1', key: 'larry/home' } } });
    assert.deepEqual(keys(pick_device_boards(rows, user, [])).sort(), ['larry/disabled-link', 'larry/hidden-link', 'larry/home', 'larry/off-grid', 'lingolinq/crisis-vocabulary']);
    assert.deepEqual(followable_links(rows[0].data.raw), [], 'none of those links can be followed');
  });

  test('revoked boards are never listed; a seed is found by key when it has no id', function(assert) {
    var rows = [board('1_1', 'larry/home'), board('1_9', 'larry/old', [], { revoked: true }), CRISIS];
    var user = person({ preferences: { home_board: { key: 'larry/home', id: null } } });
    assert.deepEqual(keys(pick_device_boards(rows, user, [])), ['larry/home', 'lingolinq/crisis-vocabulary']);
  });

  test('as store records: one in memory under its id is kept; a database that throws gives an empty list', async function(assert) {
    var store = this.owner.lookup('service:store');
    var mem = store.push({ data: { id: '9902_1', type: 'board', attributes: { key: 'larry/kept', name: 'In memory' } } });
    var list = await device_board_list(store, person(), { storage: { find_all: function() { return Promise.resolve([board('9902_1', 'larry/kept')]); } } });
    assert.strictEqual(list[0], mem);
    assert.strictEqual(mem.get('name'), 'In memory');
    assert.true(list.done);
    var failed = await device_board_list(store, person(), { storage: { find_all: function() { throw new Error('The database connection is closing.'); } } });
    assert.strictEqual(failed.length, 0);
    assert.true(failed.done);
  });

  test('the device database counts only when it is the signed-in person\'s', function(assert) {
    assert.strictEqual(own_device_db_user('lingolinqStorage::larry===abc', { user_name: 'larry' }), 'larry');
    assert.strictEqual(own_device_db_user('lingolinqStorage::larry===abc', { user_name: 'sam' }), null, 'another person\'s database');
    assert.strictEqual(own_device_db_user('lingolinqStorage::larry===abc', null), null, 'signed out');
    assert.strictEqual(own_device_db_user(null, { user_name: 'larry' }), null, 'no database open: unknown is no');
  });

  // Part 3 (docs/task-management/2026-11-16_offline-boards-page.md): only this person's syncs count, and a later sync
  // that refused the board (`refused`, #1336) hides it, finished or not.
  test('another owner\'s liked board: only this person\'s syncs count, and a later refusal hides it', function(assert) {
    var rows = [board('4_1', 'therapist/feelings'), CRISIS];
    var user = person({ stats: { starred_board_refs: [{ id: '4_1', key: 'therapist/feelings' }] } });
    var ok = function(who) { return { user_id: who, statuses: [{ id: '4_1', key: 'therapist/feelings', status: 'cached' }] }; };
    var err = function(who, extra) { return Object.assign({ user_id: who, statuses: [{ id: '4_1', key: 'therapist/feelings', error: 'board therapist/feelings failed retrieval for syncing', refused: true }] }, extra || {}); };
    var only = ['lingolinq/crisis-vocabulary'];
    var both = ['therapist/feelings', 'lingolinq/crisis-vocabulary'];
    assert.deepEqual(keys(pick_device_boards(rows, user, [ok('sam')])), only, 'someone else\'s sync saw it: not offered');
    assert.deepEqual(keys(pick_device_boards(rows, user, [ok('larry'), err('sam')])), both, 'someone else\'s sync failing on it does not hide it');
    assert.deepEqual(keys(pick_device_boards(rows, user, [ok('larry'), err('larry', { errored: true })])), only, 'a later failed sync showed an error for it');
    assert.deepEqual(keys(pick_device_boards(rows, user, [ok('larry'), err('larry', { canceled: true })])), only, 'a later cancelled sync showed an error for it');
    assert.deepEqual(keys(pick_device_boards(rows, user, [ok('larry'), { user_id: 'larry', errored: true, statuses: [{ id: '5_5', key: 'larry/other', status: 'cached' }] }])), both,
      'a later failed sync that did not reach it leaves it listed');
  });

  // A board the sync reached whose pictures or sounds did not all save carries `content` on its error (the Sync Details
  // branch, utils/sync_rollup.js content_error): the server did not refuse it, so it does not hide the board. Only a
  // `refused` row hides (#1336); an untagged error does not.
  test('another owner\'s liked board: a picture that did not save does not hide it', function(assert) {
    var rows = [board('4_1', 'therapist/feelings'), CRISIS];
    var user = person({ stats: { starred_board_refs: [{ id: '4_1', key: 'therapist/feelings' }] } });
    var content = { id: '4_1', key: 'therapist/feelings', error: 'board therapist/feelings failed to sync completely: button image failed to sync', content: true };
    var ok = { user_id: 'larry', statuses: [{ id: '4_1', key: 'therapist/feelings', status: 'cached' }] };
    var only = ['lingolinq/crisis-vocabulary'];
    var both = ['therapist/feelings', 'lingolinq/crisis-vocabulary'];
    assert.deepEqual(keys(pick_device_boards(rows, user, [{ user_id: 'larry', statuses: [{ id: '4_1', key: 'therapist/feelings', status: 'downloaded' }, content] }])), both,
      'the last clean sync reached it, with a picture that did not save');
    assert.deepEqual(keys(pick_device_boards(rows, user, [ok, { user_id: 'larry', errored: true, statuses: [content] }])), both, 'a later sync: only a picture did not save');
    assert.deepEqual(keys(pick_device_boards(rows, user, [ok, { user_id: 'larry', errored: true, statuses: [content, { id: '4_1', key: 'therapist/feelings', error: 'Not authorized', refused: true }] }])), only,
      'a later refusal still hides it');
    assert.deepEqual(keys(pick_device_boards(rows, user, [ok, { user_id: 'larry', errored: true, statuses: [Object.assign({}, content, { content: undefined })] }])), both,
      'an untagged error no longer hides it (only `refused` does, #1336)');
  });

  // On a device not marked "Trust this Device", another owner's private board cannot open offline (routes/user.js
  // _device_owner), so it is not listed; the person's own boards and LingoLinq library boards are.
  test('a shared device lists only what opens there: own boards and public LingoLinq library boards', function(assert) {
    var LIB = board('2_1', 'lingolinq/yes-no', [], { public: true });
    var DRAFT = board('2_2', 'lingolinq/draft', [], { public: false });
    var CRISIS_PUBLIC = board('9_99', 'lingolinq/crisis-vocabulary', [], { public: true });
    var rows = [board('1_1', 'larry/home'), LIB, DRAFT, board('4_1', 'therapist/feelings'), board('3_1', 'larry/mine'), CRISIS_PUBLIC];
    var user = person({ preferences: { home_board: { id: '1_1', key: 'larry/home' }, sidebar_boards: [{ key: 'lingolinq/yes-no' }, { key: 'lingolinq/draft' }] },
      stats: { starred_board_refs: [{ id: '4_1', key: 'therapist/feelings' }] } });
    var log = [{ user_id: 'larry', statuses: [{ id: '4_1', key: 'therapist/feelings', status: 'cached' }] }];
    assert.deepEqual(keys(pick_device_boards(rows, user, log, { shared: true, me: 'larry' })),
      ['larry/home', 'lingolinq/yes-no', 'larry/mine', 'lingolinq/crisis-vocabulary'], 'shared: no therapist board, no private library draft');
    assert.deepEqual(keys(pick_device_boards(rows, user, log, { shared: false, me: 'larry' })),
      ['larry/home', 'lingolinq/yes-no', 'lingolinq/draft', 'therapist/feelings', 'larry/mine', 'lingolinq/crisis-vocabulary'], 'trusted: all of them');
  });

  test('a shared device, on a page for someone else (a supervisee): their boards do not open there, library boards do', function(assert) {
    var rows = [board('1_1', 'sam/home'), board('2_1', 'lingolinq/yes-no', [], { public: true }), board('3_1', 'sam/mine')];
    var sam = person({ user_name: 'sam', preferences: { home_board: { id: '1_1', key: 'sam/home' }, sidebar_boards: [{ key: 'lingolinq/yes-no' }] } });
    assert.deepEqual(keys(pick_device_boards(rows, sam, [], { shared: true, me: 'larry' })), ['lingolinq/yes-no']);
    assert.deepEqual(keys(pick_device_boards(rows, sam, [], { shared: false, me: 'larry' })), ['sam/home', 'lingolinq/yes-no', 'sam/mine']);
  });

  test('device_board_list passes the shared-device rule on', async function(assert) {
    var store = this.owner.lookup('service:store');
    var rows = [board('9903_1', 'larry/home'), board('9903_2', 'therapist/feelings')];
    var user = person({ preferences: { home_board: { id: '9903_1', key: 'larry/home' } }, stats: { starred_board_refs: [{ id: '9903_2', key: 'therapist/feelings' }] } });
    var log = [{ user_id: 'larry', statuses: [{ id: '9903_2', key: 'therapist/feelings', status: 'cached' }] }];
    var storage = { find_all: function() { return Promise.resolve(rows); } };
    var shared = await device_board_list(store, user, { storage: storage, sync_log: log, shared: true, me: 'larry' });
    assert.deepEqual(shared.map(function(r) { return r.get('key'); }), ['larry/home']);
    var trusted = await device_board_list(store, user, { storage: storage, sync_log: log, shared: false, me: 'larry' });
    assert.deepEqual(trusted.map(function(r) { return r.get('key'); }), ['larry/home', 'therapist/feelings']);
  });
});
