import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { A } from '@ember/array';
import RSVP from 'rsvp';
import word_suggestions from 'frontend/utils/word_suggestions';
import LingoLinq from 'frontend/app';

/* Mirrors what _exact_button_candidates_for_label actually consumes: it calls
   `bs.redepth(global_id || id)` and only considers buttons that carry an `image_id`. */
function buttonSet(id, buttons) {
  return EmberObject.create({
    redepth: function() { return buttons; },
    get: function(key) {
      if(key === 'id' || key === 'global_id') { return id; }
      if(key === 'buttons') { return buttons; }
      if(key === 'board_ids') { return []; }
      return null;
    }
  });
}

/* A predicted word must be able to borrow a symbol from ANY board already loaded — most
   importantly the PARENT, which a sub-board can never reach through its own button set
   because a set covers a board's DOWNSTREAM tree only.
   `lookup_board_ids` returns a fixed handful (home, current, sidebar, starred, root), so a
   board reached from the collection drawer can have none of its tree in scope. Fetching every
   board's set to fix that would put network calls on a keystroke-adjacent path — but sets
   already in memory cost nothing to search, and today they are ignored unless their id
   happens to be in that list. */
module('Unit | Utility | prediction symbol from any loaded board', function(hooks) {
  hooks.beforeEach(function() {
    this._o = {
      load: word_suggestions.load_vocabulary_button_sets,
      lookup: word_suggestions.lookup,
      store: LingoLinq.store,
      fix: LingoLinq.Buttonset && LingoLinq.Buttonset.fix_image
    };
    // No set is in SCOPE — this is the sub-board case.
    word_suggestions.load_vocabulary_button_sets = function() { return RSVP.resolve([]); };
    word_suggestions.lookup = function() { return RSVP.resolve([]); };
    if(LingoLinq.Buttonset) { LingoLinq.Buttonset.fix_image = function() { return RSVP.resolve(); }; }
  });
  hooks.afterEach(function() {
    word_suggestions.load_vocabulary_button_sets = this._o.load;
    word_suggestions.lookup = this._o.lookup;
    LingoLinq.store = this._o.store;
    if(LingoLinq.Buttonset && this._o.fix) { LingoLinq.Buttonset.fix_image = this._o.fix; }
  });

  test('an in-scope match that yields no symbol still falls through to other loaded boards', function(assert) {
    /* THE GAP. The widened search only ran when the in-scope sets produced ZERO candidates.
       But a common word legitimately appears on many boards, and a symbol-less duplicate --
       one whose image_id the server cannot resolve -- IS a candidate. So for a word like
       "you" the scoped walk found candidates, exhausted them on placeholders, and returned
       nothing, while the widened search never ran at all. A rarer word like "I" had no scoped
       candidates, fell straight through, and worked -- which is exactly the asymmetry seen in
       the app. Failing to RESOLVE must fall through the same way as failing to MATCH. */
    assert.expect(1);
    const done = assert.async();
    const inScope = buttonSet('bs-scoped', [
      { label: 'you', image_id: 'img-x', image: '/images/square.svg', depth: 0 }
    ]);
    const parent = buttonSet('bs-parent', [
      { label: 'you', image_id: 'img-1', image: 'https://example.test/you.png', depth: 1 }
    ]);
    word_suggestions.load_vocabulary_button_sets = function() { return RSVP.resolve([inScope]); };
    LingoLinq.store = {
      peekAll: function(type) { return type === 'buttonset' ? A([inScope, parent]) : A([]); },
      peekRecord: function() { return null; }
    };

    let delivered = null;
    word_suggestions.attach_image_for_label('you', ['sub-board-only'], function(url) {
      delivered = url;
    }, { appState: EmberObject.create({ get: function() { return null; } }) }).then(function() {
      assert.strictEqual(delivered, 'https://example.test/you.png',
        'a placeholder-only match in scope does not block the real symbol elsewhere');
      done();
    }, function() { assert.strictEqual(delivered, 'threw', 'lookup rejected'); done(); });
  });

  test('a symbol on a loaded but out-of-scope board is still found', function(assert) {
    assert.expect(1);
    const done = assert.async();
    // The parent board's set IS in memory (visited earlier, or prefetched) but its id is not
    // in lookup_board_ids for this sub-board.
    const parent = buttonSet('bs-parent', [
      { label: 'you', image_id: 'img-1', image: 'https://example.test/you.png', depth: 0 }
    ]);
    LingoLinq.store = {
      peekAll: function(type) { return type === 'buttonset' ? A([parent]) : A([]); },
      peekRecord: function() { return null; }
    };

    let delivered = null;
    word_suggestions.attach_image_for_label('you', ['sub-board-only'], function(url) {
      delivered = url;
    }, { appState: EmberObject.create({ get: function() { return null; } }) }).then(function() {
      assert.strictEqual(delivered, 'https://example.test/you.png',
        'the parent board\'s symbol is borrowed even though its board id is out of scope');
      done();
    }, function() {
      assert.strictEqual(delivered, 'https://example.test/you.png', 'lookup rejected');
      done();
    });
  });
});
