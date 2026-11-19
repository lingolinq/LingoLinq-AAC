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
    var seen = [{ user_id: 'larry', statuses: [{ id: '4_1', key: 'therapist/feelings', status: 'cached' }] }];
    assert.deepEqual(keys(pick_device_boards(rows, user, seen)), ['therapist/feelings', 'lingolinq/crisis-vocabulary']);
    var refused = [{ user_id: 'larry', statuses: [{ id: '4_1', key: 'therapist/feelings', status: 'cached' }, { id: '4_1', key: 'therapist/feelings', error: 'Not authorized' }] }];
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

  // Part 3 (docs/task-management/2026-11-16_offline-boards-page.md): only this person's syncs count, and a later sync
  // that showed an error for the board hides it, finished or not.
  test('another owner\'s liked board: only this person\'s syncs count, and a later error hides it', function(assert) {
    var rows = [board('4_1', 'therapist/feelings'), CRISIS];
    var user = person({ stats: { starred_board_refs: [{ id: '4_1', key: 'therapist/feelings' }] } });
    var ok = function(who) { return { user_id: who, statuses: [{ id: '4_1', key: 'therapist/feelings', status: 'cached' }] }; };
    var err = function(who, extra) { return Object.assign({ user_id: who, statuses: [{ id: '4_1', key: 'therapist/feelings', error: 'board therapist/feelings failed retrieval for syncing' }] }, extra || {}); };
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
  // branch, utils/sync_rollup.js content_error): the server did not refuse it, so it does not hide the board. An older
  // untagged entry still hides it (the safe side).
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
    assert.deepEqual(keys(pick_device_boards(rows, user, [ok, { user_id: 'larry', errored: true, statuses: [content, { id: '4_1', key: 'therapist/feelings', error: 'Not authorized' }] }])), only,
      'a later refusal still hides it');
    assert.deepEqual(keys(pick_device_boards(rows, user, [ok, { user_id: 'larry', errored: true, statuses: [Object.assign({}, content, { content: undefined })] }])), only,
      'an older entry without the tag still hides it');
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
