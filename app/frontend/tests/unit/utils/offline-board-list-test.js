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

  test('another owner\'s liked board only when the last clean sync saw it without an error', function(assert) {
    var rows = [board('4_1', 'therapist/feelings'), CRISIS];
    var user = person({ stats: { starred_board_refs: [{ id: '4_1', key: 'therapist/feelings' }] } });
    assert.deepEqual(keys(pick_device_boards(rows, user, [])), ['lingolinq/crisis-vocabulary'], 'no sync log: not offered');
    var seen = [{ statuses: [{ id: '4_1', key: 'therapist/feelings', status: 'cached' }] }];
    assert.deepEqual(keys(pick_device_boards(rows, user, seen)), ['therapist/feelings', 'lingolinq/crisis-vocabulary']);
    var refused = [{ statuses: [{ id: '4_1', key: 'therapist/feelings', status: 'cached' }, { id: '4_1', key: 'therapist/feelings', error: 'Not authorized' }] }];
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
});
