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
});
