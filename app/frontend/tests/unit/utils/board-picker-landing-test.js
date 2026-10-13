import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { open_picked_board, after_pick_for_other, mark_basic_try, basic_try_for, clear_basic_try } from 'frontend/utils/board_picker_landing';

/* Requested 2026-09-30: in Basic, "Try this Board" and "Pick this Board" in the board picker open
 * the board on the Basic board page (`board-alt`, through the view-aware `board` route) in normal
 * mode, not on the Modern board page; picking for a communicator opens their new home board rather
 * than their Modern boards list. Modern is unchanged. A "Try" in Basic also leaves a marker naming
 * the board and the user it would be for, which the Basic board page's "Set as Home Board" reads.
 */
module('Unit | Utility | board_picker_landing', function() {
  function router() {
    var calls = [];
    return { calls: calls, transitionTo: function() { calls.push(Array.prototype.slice.call(arguments)); return Promise.resolve(); } };
  }
  function viewer(style) { return EmberObject.create({ preferences: { board_view_style: style } }); }
  function appState() { return { set(k, v) { this[k] = v; }, get(k) { return this[k]; } }; }

  test('Basic opens a picked or tried board through the view-aware board route', function(assert) {
    var r = router();
    open_picked_board(r, 'example/core-60', viewer('classic'));
    assert.deepEqual(r.calls, [['board', 'example/core-60']], 'the board route, which lands Basic on board-alt');
  });

  test('Modern opens it on the Modern board page, as before', function(assert) {
    var r = router();
    open_picked_board(r, 'example/core-60', viewer('modern'));
    assert.deepEqual(r.calls, [['user.board-detail', 'example', 'core-60']], 'board-detail, speak (use) mode');
  });

  test("picking for a communicator: Basic opens their new home board, Modern their boards list", function(assert) {
    var basic = router();
    after_pick_for_other(basic, 'aiden_parker/core-60', 'aiden_parker', viewer('classic'));
    assert.deepEqual(basic.calls, [['board', 'aiden_parker/core-60']], 'Basic: the new home board on board-alt');
    var modern = router();
    after_pick_for_other(modern, 'aiden_parker/core-60', 'aiden_parker', viewer('modern'));
    assert.deepEqual(modern.calls, [['user.boards', 'aiden_parker']], 'Modern: unchanged');
  });

  test('a Basic try records the board and the user it would be for, readable only on that board', function(assert) {
    var s = appState();
    var aiden = EmberObject.create({ id: '1_7', user_name: 'aiden_parker' });
    mark_basic_try(s, 'public/core-60', aiden);
    assert.deepEqual(basic_try_for(s, 'public/core-60'), { key: 'public/core-60', user_id: '1_7', user_name: 'aiden_parker' }, 'on the tried board');
    assert.strictEqual(basic_try_for(s, 'public/other'), null, 'not on any other board');
    clear_basic_try(s);
    assert.strictEqual(basic_try_for(s, 'public/core-60'), null, 'gone once cleared');
  });
});
