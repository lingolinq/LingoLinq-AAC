import { module, test } from 'qunit';
import boardsPageListCache from 'frontend/utils/boards_page_list_cache';

module('Unit | Utility | boards-page-list-cache', function(hooks) {
  hooks.beforeEach(function() {
    boardsPageListCache.clearAll();
  });

  hooks.afterEach(function() {
    boardsPageListCache.clearAll();
  });

  test('write/read round-trips compact board attrs for matching user', function(assert) {
    var boards = [
      { id: '1_10', key: 'alice/home', name: 'Home', user_name: 'alice', public: false, copy_id: '1_1', image_url: 'https://example.com/a.png', locale: 'en', stars: 2 },
      { id: '1_11', key: 'alice/food', name: 'Food', user_name: 'alice', public: true }
    ];
    assert.ok(boardsPageListCache.write('1_99', boards), 'write succeeds');
    var snapshot = boardsPageListCache.read('1_99');
    assert.ok(snapshot, 'read returns snapshot');
    assert.equal(snapshot.user_id, '1_99');
    assert.equal(snapshot.boards.length, 2);
    assert.equal(snapshot.boards[0].key, 'alice/home');
    assert.equal(snapshot.boards[0].image_url, 'https://example.com/a.png');
    assert.equal(snapshot.boards[1].name, 'Food');
    assert.strictEqual(snapshot.boards[0].buttons, undefined, 'does not persist buttons');
  });

  test('read returns null for wrong user or expired TTL', function(assert) {
    boardsPageListCache.write('1_1', [{ id: '1_2', key: 'u/b', name: 'B' }]);
    assert.strictEqual(boardsPageListCache.read('1_2'), null, 'wrong user id misses');

    var key = boardsPageListCache.KEY_PREFIX + '1_1';
    var stale = {
      saved_at: Date.now() - boardsPageListCache.TTL_MS - 1000,
      user_id: '1_1',
      boards: [{ id: '1_2', key: 'u/b', name: 'B' }]
    };
    window.localStorage.setItem(key, JSON.stringify(stale));
    assert.strictEqual(boardsPageListCache.read('1_1'), null, 'expired snapshot is dropped');
    assert.strictEqual(window.localStorage.getItem(key), null, 'expired key removed');
  });

  test('write caps at MAX_BOARDS', function(assert) {
    var many = [];
    for (var i = 0; i < boardsPageListCache.MAX_BOARDS + 25; i++) {
      many.push({ id: '1_' + i, key: 'u/b' + i, name: 'Board ' + i });
    }
    boardsPageListCache.write('1_50', many);
    var snapshot = boardsPageListCache.read('1_50');
    assert.equal(snapshot.boards.length, boardsPageListCache.MAX_BOARDS);
  });

  /* Board double. The `get` shim is REQUIRED, not ceremony: the family matcher in
     board-brands reads a board's key ONLY through `board.get('key')`, so a plain object
     looks like a non-brand board, classifies as top-level, and the sub-board case
     silently never exercises. Observed passing for exactly that wrong reason. */
  function boardDouble(attrs) {
    return Object.assign({}, attrs, { get: function(k) { return this[k]; } });
  }

  test('MAX_BOARDS counts top-level boards only — sub-boards ride along free', function(assert) {
    /* `quick-core-60` matches the Quick Core root_re; `quick-core-60-animals` is a
       descriptive-suffix SUB-board page. Only the roots may consume the budget. */
    var list = [];
    for (var i = 0; i < boardsPageListCache.MAX_BOARDS; i++) {
      list.push(boardDouble({ id: '1_r' + i, key: 'u/quick-core-60', name: 'Quick Core 60' }));
    }
    var subCount = 40;
    for (var j = 0; j < subCount; j++) {
      list.push(boardDouble({ id: '1_s' + j, key: 'u/quick-core-60-animals', name: 'Animals' }));
    }
    // one more ROOT, past the budget — must be excluded
    list.push(boardDouble({ id: '1_overflow', key: 'u/quick-core-60', name: 'Quick Core 60' }));

    boardsPageListCache.write('1_51', list);
    var boards = boardsPageListCache.read('1_51').boards;
    var ids = boards.map(function(b) { return b.id; });

    assert.strictEqual(boards.length, boardsPageListCache.MAX_BOARDS + subCount,
      'every sub-board is stored on top of a full top-level budget');
    assert.notOk(ids.indexOf('1_overflow') >= 0,
      'a top-level board past MAX_BOARDS is still excluded');
    assert.ok(ids.indexOf('1_s' + (subCount - 1)) >= 0,
      'the last sub-board survives even though the top budget is exhausted');
  });

  test('MAX_SNAPSHOT_ROWS still bounds an extreme sub-board tail', function(assert) {
    var huge = [];
    for (var i = 0; i < boardsPageListCache.MAX_SNAPSHOT_ROWS + 500; i++) {
      huge.push(boardDouble({ id: '1_h' + i, key: 'u/quick-core-60-animals', name: 'Animals' }));
    }
    boardsPageListCache.write('1_53', huge);
    assert.strictEqual(boardsPageListCache.read('1_53').boards.length,
      boardsPageListCache.MAX_SNAPSHOT_ROWS,
      'free-riding sub-boards are still capped by the absolute row backstop');
  });

  test('parent_board_key survives the snapshot round trip', function(assert) {
    /* Renamed copy: its own key does NOT match the Sequoia root_re, so brand-root
       classification depends entirely on the parent key being carried through. */
    boardsPageListCache.write('1_52', [boardDouble({
      id: '1_5111',
      key: 'u/sequoia-15-changed-with-a-really-long-name',
      name: 'Sequoia 15 - changed with a really long name',
      parent_board_key: 'lingolinq/sequoia-15'
    })]);
    var row = boardsPageListCache.read('1_52').boards[0];
    assert.strictEqual(row.parent_board_key, 'lingolinq/sequoia-15');
    assert.ok(boardsPageListCache.SNAPSHOT_ATTRS.indexOf('parent_board_key') >= 0,
      'hydrate() rebuilds the attribute too — it reads the same list');
  });

  test('isUsableList requires an array with done', function(assert) {
    assert.notOk(boardsPageListCache.isUsableList(null));
    assert.notOk(boardsPageListCache.isUsableList({ loading: true }));
    assert.notOk(boardsPageListCache.isUsableList({ error: true }));
    var partial = [{ id: '1_1' }];
    assert.notOk(boardsPageListCache.isUsableList(partial), 'length without done is not usable');
    partial.done = true;
    assert.ok(boardsPageListCache.isUsableList(partial));
    var empty = [];
    empty.done = true;
    assert.ok(boardsPageListCache.isUsableList(empty), 'empty completed Mine list is usable');
  });

  test('write persists empty completed Mine lists', function(assert) {
    assert.ok(boardsPageListCache.write('1_9', []));
    var snapshot = boardsPageListCache.read('1_9');
    assert.ok(snapshot);
    assert.deepEqual(snapshot.boards, []);
  });

  test('hydrate pushes board records into the store', function(assert) {
    var pushed = [];
    var store = {
      push: function(payload) {
        pushed.push(payload);
        return { id: payload.data.id, get: function(k) { return payload.data.attributes[k] || payload.data.id; } };
      }
    };
    var records = boardsPageListCache.hydrate(store, [
      { id: '1_7', key: 'u/home', name: 'Home', public: false },
      { id: null, key: 'bad' }
    ]);
    assert.equal(records.length, 1);
    assert.equal(pushed.length, 1);
    assert.equal(pushed[0].data.type, 'board');
    assert.equal(pushed[0].data.attributes.key, 'u/home');
  });

  test('clearAll removes all boards-page mine keys', function(assert) {
    boardsPageListCache.write('1_1', [{ id: '1_2', key: 'a/b', name: 'A' }]);
    boardsPageListCache.write('1_3', [{ id: '1_4', key: 'c/d', name: 'C' }]);
    window.localStorage.setItem('unrelated_key', 'keep');
    boardsPageListCache.clearAll();
    assert.strictEqual(boardsPageListCache.read('1_1'), null);
    assert.strictEqual(boardsPageListCache.read('1_3'), null);
    assert.equal(window.localStorage.getItem('unrelated_key'), 'keep');
    window.localStorage.removeItem('unrelated_key');
  });

  test('hasFreshSnapshot tracks unexpired Mine snapshots', function(assert) {
    assert.notOk(boardsPageListCache.hasFreshSnapshot('1_77'));
    boardsPageListCache.write('1_77', [{ id: '1_8', key: 'u/b', name: 'B' }]);
    assert.ok(boardsPageListCache.hasFreshSnapshot('1_77'));
    boardsPageListCache.clear('1_77');
    assert.notOk(boardsPageListCache.hasFreshSnapshot('1_77'));
  });

  test('setMineListBusy / isMineListBusy gate for catalog prefetch deferral', function(assert) {
    boardsPageListCache.setMineListBusy(false);
    assert.notOk(boardsPageListCache.isMineListBusy());
    boardsPageListCache.setMineListBusy(true);
    assert.ok(boardsPageListCache.isMineListBusy());
    boardsPageListCache.clearAll();
    assert.notOk(boardsPageListCache.isMineListBusy(), 'clearAll clears busy flag');
  });

  test('setBoardsPageActive / isBoardsPageActive gate for phase 3/4 pause', function(assert) {
    boardsPageListCache.setBoardsPageActive(false);
    assert.notOk(boardsPageListCache.isBoardsPageActive());
    boardsPageListCache.setBoardsPageActive(true);
    assert.ok(boardsPageListCache.isBoardsPageActive());
    boardsPageListCache.clearAll();
    assert.notOk(boardsPageListCache.isBoardsPageActive(), 'clearAll clears boards-page flag');
  });

  test('isPaintReady accepts first-page paint_ready or completed lists', function(assert) {
    assert.notOk(boardsPageListCache.isPaintReady(null));
    assert.notOk(boardsPageListCache.isPaintReady({ loading: true }));
    var firstPage = [{ id: '1_1' }];
    assert.notOk(boardsPageListCache.isPaintReady(firstPage), 'array without paint_ready is not ready');
    firstPage.paint_ready = true;
    assert.ok(boardsPageListCache.isPaintReady(firstPage), 'first page with paint_ready is ready');
    var emptyDone = [];
    emptyDone.done = true;
    assert.ok(boardsPageListCache.isPaintReady(emptyDone), 'empty completed list is ready');
    var emptyPaint = [];
    emptyPaint.paint_ready = true;
    assert.notOk(boardsPageListCache.isPaintReady(emptyPaint), 'empty first page without done is not ready');
  });
});
