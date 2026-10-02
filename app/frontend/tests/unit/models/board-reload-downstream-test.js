import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';
import LingoLinq from 'frontend/app';

/* reload_including_all_downstream MUST NOT THROW for a board that is not in the store
 * (2026-10-02). After a board-set copy finishes, utils/edit_manager.js (done_callback) saves the
 * home board and then calls this with the affected board ids. The not-in-store branch called
 * `this.persistence.find` inside a plain `function` callback, where `this` is undefined, so it
 * threw "Cannot read properties of undefined (reading 'persistence')". That throw happened inside
 * progress_tracker's try, which reported the copy as errored: the home board was already saved,
 * but the copy promise rejected and the Basic "Set as Home Board for X" button never moved on.
 * Introduced by 48a055d55 (service-injection migration).
 */
module('Unit | Model | board reload_including_all_downstream', function(hooks) {
  setupTest(hooks);

  test('looks up a board that is not in the store, without throwing', async function(assert) {
    var found = [];
    var original = LingoLinq.store.peekAll;
    LingoLinq.store.peekAll = function() { return []; };
    try {
      var board = EmberObject.create({
        id: '1_1',
        appState: EmberObject.create({ board_reloads: null }),
        persistence: { find: function(type, id) { found.push(id); return Promise.resolve(); } }
      });
      var fn = this.owner.lookup('service:store').createRecord('board').reload_including_all_downstream;
      fn.call(board, ['1_1', '1_99999999']);
      assert.deepEqual(found, ['1_1', '1_99999999'], 'every affected board not in the store is looked up');
    } finally {
      LingoLinq.store.peekAll = original;
    }
  });
});
