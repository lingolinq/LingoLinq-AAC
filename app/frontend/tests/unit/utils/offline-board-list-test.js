import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';
import { own_device_boards, own_device_db_user } from 'frontend/utils/offline_board_list';

/* The boards page's Mine list offline (docs/task-management/2026-11-16_offline-boards-page.md): the person's own
 * boards saved on this device. Device rows are {data: {id, raw}} (lingoLinqExtras.storage.find_all). */
module('Unit | Utility | offline board list', function(hooks) {
  setupTest(hooks);

  function row(id, key, extra) {
    return { data: { id: id, raw: Object.assign({ id: id, key: key, name: key }, extra || {}) } };
  }
  function storage(rows) {
    return { find_all: function() { return Promise.resolve(rows); } };
  }

  test('own boards and shallow-clone copies, not other people\'s, not revoked', async function(assert) {
    var store = this.owner.lookup('service:store');
    var list = await own_device_boards(store, 'larry', storage([
      row('9901_1', 'larry/home'), row('9901_2', 'larry/my:lingolinq:core-60'), row('9901_3', 'other/y'),
      row('9901_4', 'larry/old', { revoked: true }), row('9901_5', 'larryb/home'),
    ]));
    assert.deepEqual(list.map((b) => b.get('key')), ['larry/home', 'larry/my:lingolinq:core-60']);
    assert.true(list.done, 'a finished list (the page shows it at once)');
    assert.true(list.from_device, 'marked, so the server list replaces it online');
  });

  test('a board already in memory under its id is kept, not overwritten by the device copy', async function(assert) {
    var store = this.owner.lookup('service:store');
    var mem = store.push({ data: { id: '9902_1', type: 'board', attributes: { key: 'larry/kept', name: 'In memory' } } });
    var list = await own_device_boards(store, 'larry', storage([row('9902_1', 'larry/kept', { name: 'Older device copy' })]));
    assert.strictEqual(list[0], mem);
    assert.strictEqual(mem.get('name'), 'In memory');
  });

  test('a board in memory under its key (fetched by key) is left alone, and the list holds the id record', async function(assert) {
    var store = this.owner.lookup('service:store');
    var by_key = store.push({ data: { id: 'larry/bykey', type: 'board', attributes: { key: 'larry/bykey', name: 'Fetched by key' } } });
    var list = await own_device_boards(store, 'larry', storage([row('9902_2', 'larry/bykey', { name: 'Device copy' })]));
    assert.strictEqual(list[0].get('id'), '9902_2', 'the page groups folders by id');
    assert.strictEqual(by_key.get('name'), 'Fetched by key', 'unchanged');
  });

  test('a device database that throws as it is read gives an empty list, not an exception', async function(assert) {
    var store = this.owner.lookup('service:store');
    var list = await own_device_boards(store, 'larry', { find_all: function() { throw new Error('The database connection is closing.'); } });
    assert.strictEqual(list.length, 0);
    assert.true(list.done);
  });

  test('no user name, or a failed read, is an empty finished list', async function(assert) {
    var store = this.owner.lookup('service:store');
    assert.strictEqual((await own_device_boards(store, null, storage([row('9903_1', 'larry/a')]))).length, 0);
    var failed = await own_device_boards(store, 'larry', { find_all: function() { return Promise.reject(new Error('db')); } });
    assert.strictEqual(failed.length, 0);
    assert.true(failed.done);
  });

  test('the device database counts only when it is the signed-in person\'s', function(assert) {
    assert.strictEqual(own_device_db_user('lingolinqStorage::larry===abc', { user_name: 'larry' }), 'larry');
    assert.strictEqual(own_device_db_user('lingolinqStorage::larry===abc', { user_name: 'sam' }), null, 'another person\'s database');
    assert.strictEqual(own_device_db_user('lingolinqStorage::larry===abc', null), null, 'signed out');
    assert.strictEqual(own_device_db_user(null, { user_name: 'larry' }), null, 'no database open: unknown is no');
  });
});
