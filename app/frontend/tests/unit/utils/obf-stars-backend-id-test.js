import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import obf from 'frontend/utils/obf';
import LingoLinq from 'frontend/app';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';

/* LIKED BOARDS BY YOUR REAL ID (section 24 of docs/task-management/2026-11-10_offline-followup-proposals.md). The
 * session user may be held only by the record keyed 'self' (serializers/application.js), so `peekRecord('user',
 * '<real id>')` finds nothing; a `stars-<real id>` board must still resolve to the session user. Someone else's id
 * that finds no record still renders "User Information Not Available". */
module('Unit | Utility | obf stars board backend ids', function(hooks) {
  var peeked;
  hooks.beforeEach(function() {
    peeked = [];
    var me_net = EmberObject.create({ id: 'self', global_id: '1_3', user_name: 'example', stats: { starred_board_refs: [] }, preferences: {} });
    stub(obf, 'get_app_state', function() { return EmberObject.create({ sessionUser: me_net }); });
    stub(LingoLinq, 'store', {
      peekRecord: function(type, id) { peeked.push(id); return null; },
      push: function() { return EmberObject.create({}); }
    });
  });
  hooks.afterEach(function() { restoreStubs(); });

  test('stars-<your real id> is your own liked boards while only the record keyed self is loaded', function(assert) {
    var board = obf.lookup('stars-1_3');
    assert.deepEqual(peeked, ['1_3'], 'looked the id up first, as before');
    assert.true(board.get('name').includes('example'), 'named for the session user');
  });

  test('stars-<a different id> with no loaded record is not resolved to you', function(assert) {
    var board;
    try { board = obf.lookup('stars-1_7'); } catch(e) { board = null; }
    // Before and after this change an unresolved other user is not you; the board, if it renders, never names you.
    assert.false(!!(board && board.get('name').indexOf('example') !== -1));
  });
});
