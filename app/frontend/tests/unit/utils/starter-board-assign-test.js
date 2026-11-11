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

  test('Quick Assign looks the starter up by its key, then searches the catalog for it, never for Vocal Flair 84', async function(assert) {
    var looked_up = [];
    var queries = [];
    stub(LingoLinq.store, 'findRecord', function(type, key) { looked_up.push(key); return RSVP.reject('not here'); });
    stub(LingoLinq.store, 'query', function(type, params) { queries.push(params); return RSVP.reject('offline'); });
    var not_found = 0;
    var user = EmberObject.create({ user_name: 'aiden', save: function() { return RSVP.resolve(this); } });
    await assignStarterBoardAsHome(user, { onNotFound: function() { not_found++; } }).then(null, function() { });
    assert.deepEqual(looked_up, [STARTER_BOARD_KEY]);
    assert.strictEqual(queries.length, 1);
    assert.strictEqual(queries[0].q, 'Vocal Flair 60');
    assert.strictEqual(not_found, 1, 'a failed search reports not found');
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
