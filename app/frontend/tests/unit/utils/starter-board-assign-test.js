import { module, test } from 'qunit';
import RSVP from 'rsvp';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';
import LingoLinq from 'frontend/app';
import { assignStarterBoardAsHome, pickStarterBoard } from 'frontend/utils/assign-vocal-flair-home';
import { STARTER_BOARD_KEY, STARTER_BOARD_SLUG } from 'frontend/utils/starter_board';

/* THE STARTER BOARD IS VOCAL FLAIR 60 EVERYWHERE (Traci, 2026-11-11; PR #1268, proposals doc section 16).
 * Quick Assign (the board picker, setup, the tour picker) searched the catalog for 'Vocal Flair 84' while the
 * welcome card set up Vocal Flair 60. Both now use the one starter, looked up by its exact key first.
 */
module('Unit | Utility | starter board assignment', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.saved_store = LingoLinq.store;
    LingoLinq.store = this.owner.lookup('service:store');
  });

  hooks.afterEach(function() {
    restoreStubs();
    LingoLinq.store = this.saved_store;
  });

  test('the starter is Vocal Flair 60', function(assert) {
    assert.strictEqual(STARTER_BOARD_SLUG, 'vocal-flair-60');
    assert.strictEqual(STARTER_BOARD_KEY, 'lingolinq/vocal-flair-60');
  });

  test('Quick Assign looks the starter up by its key; when that key is not found it searches the catalog for it, never for Vocal Flair 84', async function(assert) {
    var looked_up = [];
    var queries = [];
    stub(LingoLinq.store, 'findRecord', function(type, key) { looked_up.push(key); return RSVP.reject({ error: 'Record not found' }); });
    stub(LingoLinq.store, 'query', function(type, params) { queries.push(params); return RSVP.reject('offline'); });
    var not_found = 0;
    var user = EmberObject.create({ user_name: 'aiden', save: function() { return RSVP.resolve(this); } });
    await assignStarterBoardAsHome(user, { onNotFound: function() { not_found++; } }).then(null, function() { });
    assert.deepEqual(looked_up, [STARTER_BOARD_KEY]);
    assert.strictEqual(queries.length, 1);
    assert.strictEqual(queries[0].q, 'Vocal Flair 60');
    assert.strictEqual(not_found, 1, 'a failed search reports not found');
  });

  test('the starter found by its key is used as is: no catalog search', async function(assert) {
    assert.expect(3);
    var board = EmberObject.create({ id: '1_9', key: 'aiden/vocal-flair-60' });
    var queries = 0;
    stub(LingoLinq.store, 'findRecord', function() { return RSVP.resolve(board); });
    stub(LingoLinq.store, 'query', function() { queries++; return RSVP.resolve([]); });
    var user = EmberObject.create({ user_name: 'aiden', preferences: {}, save: function() { return RSVP.resolve(this); } });
    var assigned = null;
    await assignStarterBoardAsHome(user, { onSuccess: function(home) { assigned = home; }, onNotFound: function() { assert.ok(false, 'found'); } });
    assert.strictEqual(queries, 0);
    assert.strictEqual(assigned, board);
    assert.strictEqual(user.get('preferences.home_board.key'), 'aiden/vocal-flair-60');
  });

  test('a lookup that fails for another reason (offline, a server error) does not search; it reports not found', async function(assert) {
    var queries = 0;
    stub(LingoLinq.store, 'findRecord', function() { return RSVP.reject({ error: 'offline', status: 0 }); });
    stub(LingoLinq.store, 'query', function() { queries++; return RSVP.resolve([EmberObject.create({ key: 'someone/vocal-flair-60' })]); });
    var not_found = 0;
    var user = EmberObject.create({ user_name: 'aiden', save: function() { return RSVP.resolve(this); } });
    await assignStarterBoardAsHome(user, { onNotFound: function() { not_found++; } }).then(null, function() { });
    assert.strictEqual(queries, 0, 'the search is for a missing key only');
    assert.strictEqual(not_found, 1);
  });

  test('from a catalog search, the starter root wins over its sub-boards and over other sets', function(assert) {
    var boards = [
      EmberObject.create({ key: 'lingolinq/vocal-flair-84' }),
      EmberObject.create({ key: 'lingolinq/vocal-flair-60-categories-food' }),
      EmberObject.create({ key: 'lingolinq/vocal-flair-60' })
    ];
    assert.strictEqual(pickStarterBoard(boards).get('key'), 'lingolinq/vocal-flair-60');
    assert.strictEqual(pickStarterBoard([boards[0]]).get('key'), 'lingolinq/vocal-flair-84', 'whatever the catalog returned, as before');
  });
});
