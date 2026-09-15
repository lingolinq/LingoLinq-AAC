import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { A } from '@ember/array';
import RSVP from 'rsvp';
import BoardDetailController from 'frontend/controllers/user/board-detail';
import word_suggestions from 'frontend/utils/word_suggestions';
import LingoLinq from 'frontend/app';

function svc(map) {
  return EmberObject.create({
    get: function(key) { return (map || {})[key] || null; },
    set: function() { return null; },
    addObserver: function() {}, removeObserver: function() {}
  });
}

/* A predicted word must keep its symbol when the user opens a SUB-BOARD.
   The memo was keyed on `lookup_ids.join(',')`, and lookup_ids carries
   `currentBoardState.id` plus the current `model.id` — both change on navigation. So drilling
   into a sub-board changed the key, missed the memo, and the word re-resolved from scratch;
   if the parent's button set was not loaded at that moment the symbol was simply lost.
   The board component of the key is NOT removable: the same word can legitimately resolve to
   different symbols on different board SETS, and replaying one set's symbol onto another is a
   confidently WRONG symbol — worse for a symbol-reliant user than a missing one. The key just
   has to be scoped to the SET rather than to the individual board within it. */
module('Unit | Controller | prediction symbol scope', function(hooks) {
  hooks.beforeEach(function() {
    this._o = {
      attach: word_suggestions.attach_image_for_label,
      sets: word_suggestions.button_sets_for_board_ids,
      store: LingoLinq.store,
      Image: window.Image
    };
    LingoLinq.store = { peekAll: function() { return A([]); }, peekRecord: function() { return null; } };
    word_suggestions.button_sets_for_board_ids = function() { return []; };
    const created = [];
    this.created = created;
    window.Image = function() { created.push(this); };
  });
  hooks.afterEach(function() {
    word_suggestions.attach_image_for_label = this._o.attach;
    word_suggestions.button_sets_for_board_ids = this._o.sets;
    LingoLinq.store = this._o.store;
    window.Image = this._o.Image;
  });

  function controller(rootId) {
    return BoardDetailController.create({
      app_state: svc(), persistence: svc(), router: svc(), appState: svc(),
      stashes: svc({ 'root_board_state.id': rootId }),
      _find_local_image_for_label: function() { return null; },
      _republish_suggestion_list: function() {}
    });
  }

  test('a symbol resolved on the parent carries into a sub-board of the same set', function(assert) {
    assert.expect(3);
    let calls = 0;
    word_suggestions.attach_image_for_label = function(word, ids, cb) {
      calls++;
      cb('https://example.test/you.png');
      return RSVP.resolve('https://example.test/you.png');
    };
    const c = controller('root-quickcore');

    // On the parent board of the set.
    c._suggestion_lookup_board_ids = function() { return ['root-quickcore', 'parent-board']; };
    const onParent = [{ word: 'you' }];
    c._decorate_suggestion_images(onParent);
    this.created[0].onload();
    assert.strictEqual(onParent[0].image, 'https://example.test/you.png', 'resolves on the parent');

    // Drill into a sub-board: same SET, different board ids.
    c._suggestion_lookup_board_ids = function() { return ['root-quickcore', 'sub-board-7']; };
    const onSub = [{ word: 'you' }];
    c._decorate_suggestion_images(onSub);
    assert.strictEqual(calls, 1, 'no second lookup — the resolution is reused within the set');
    assert.strictEqual(onSub[0].image, 'https://example.test/you.png',
      'and the symbol carries into the sub-board');
    c.destroy();
  });

  test('a different board SET still does not inherit the symbol', function(assert) {
    assert.expect(2);
    let calls = 0;
    word_suggestions.attach_image_for_label = function(word, ids, cb) {
      calls++;
      cb('https://example.test/you-a.png');
      return RSVP.resolve('https://example.test/you-a.png');
    };
    const a = controller('root-set-a');
    a._suggestion_lookup_board_ids = function() { return ['root-set-a', 'b1']; };
    const onA = [{ word: 'you' }];
    a._decorate_suggestion_images(onA);
    this.created[0].onload();
    assert.strictEqual(onA[0].image, 'https://example.test/you-a.png', 'set A resolves');

    const b = controller('root-set-b');
    b._suggestion_lookup_board_ids = function() { return ['root-set-b', 'b2']; };
    b._decorate_suggestion_images([{ word: 'you' }]);
    assert.strictEqual(calls, 2,
      'a different set re-resolves rather than replaying set A — the safety property holds');
    a.destroy(); b.destroy();
  });
});
