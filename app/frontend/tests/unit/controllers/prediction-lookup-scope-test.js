import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import BoardDetailController from 'frontend/controllers/user/board-detail';

function svc() {
  return EmberObject.create({
    get: function() { return null; }, set: function() { return null; },
    addObserver: function() {}, removeObserver: function() {}
  });
}

/* Symbols must be findable on the board TREE the user is navigating, not just on the board
   they are standing on.
   A button set covers its board's DOWNSTREAM tree, so the set of the tree's ROOT covers every
   board below it — parent, siblings and all. But `root_board_state`, which lookup_board_ids
   relies on for that, is only ever set when transitioning to `board.index` from setup or
   home-boards (app-state.js:694-696). Board-detail is a different route, so that flag never
   fires here and the tree root was absent from the lookup entirely: a predicted word whose
   symbol lives on the parent had nothing to find it in.
   board-detail keeps its own ancestor stack for back navigation, oldest-first
   (`_push_nav_history`), so its first entry IS the tree root. Adding that one id makes the
   whole tree searchable for the cost of a single (cached-after-first) button-set load. */
module('Unit | Controller | prediction lookup scope', function() {
  function controller(history) {
    return BoardDetailController.create({
      app_state: EmberObject.create({ board_detail_nav_history: history }),
      stashes: svc(), persistence: svc(), router: svc(), appState: svc()
    });
  }

  test('the lookup includes the ROOT of the board-detail nav history', function(assert) {
    assert.expect(2);
    const c = controller([
      { user_name: 'kiddo', boardname: 'quick-core-40', title: 'Quick Core 40' },
      { user_name: 'kiddo', boardname: 'body-parts', title: 'Body Parts' }
    ]);
    const ids = c._suggestion_lookup_board_ids();
    assert.notStrictEqual(ids.indexOf('kiddo/quick-core-40'), -1,
      `the tree root is in scope, got ${JSON.stringify(ids)}`);
    assert.strictEqual(ids.indexOf('kiddo/body-parts'), -1,
      'only the ROOT is added — its set already covers everything below it');
    c.destroy();
  });

  test('an empty or malformed history adds nothing', function(assert) {
    assert.expect(2);
    const empty = controller([]);
    assert.strictEqual((empty._suggestion_lookup_board_ids() || []).length, 0,
      'no history, no extra ids');
    empty.destroy();

    const bad = controller([{ title: 'no keys here' }]);
    assert.strictEqual((bad._suggestion_lookup_board_ids() || []).length, 0,
      'an entry without user_name/boardname is skipped rather than pushing "undefined/undefined"');
    bad.destroy();
  });
});
