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

/* The widened pass is scoped to the speaking user, so these fixtures must name one. Only
   `referenced_user.global_id` is answered: the record id of a session user is pinned to the
   literal 'self' (serializers/application.js:52-60), so `id` is not a usable key and a fix
   reading it must not pass -- see prediction-symbol-user-scope-test.js. */
function speaking_user(global_id) {
  return EmberObject.create({
    get: function(key) {
      if(key === 'referenced_user.global_id') { return global_id; }
      return null;
    }
  });
}

/* A predicted word must be able to borrow a symbol from a board already loaded -- most
   importantly the PARENT, which a sub-board can never reach through its own button set
   because a set covers a board's DOWNSTREAM tree only.
   `lookup_board_ids` returns a fixed handful (home, current, sidebar, starred, root), so a
   board reached from the collection drawer can have none of its tree in scope. Fetching every
   board's set to fix that would put network calls on a keystroke-adjacent path -- but a set
   that has ALREADY BEEN IN SCOPE for this user costs nothing to search.
   "Already been in scope", not merely "already in memory": the store accumulates button sets
   across every communicator opened since login, so an unscoped search hands one user's symbol
   to another and stores it against them (see prediction-symbol-user-scope-test.js). Each test
   below therefore puts the borrowed-from board in scope FIRST -- which is what visiting it
   does -- before looking up from somewhere else. A board that was only ever PREFETCHED in the
   background, never visited, is deliberately not searchable. */
module('Unit | Utility | prediction symbol from any loaded board', function(hooks) {
  hooks.beforeEach(function() {
    this._o = {
      load: word_suggestions.load_vocabulary_button_sets,
      lookup: word_suggestions.lookup,
      store: LingoLinq.store,
      fix: LingoLinq.Buttonset && LingoLinq.Buttonset.fix_image
    };
    word_suggestions._reset_scoped_sets();
    word_suggestions.lookup = function() { return RSVP.resolve([]); };
    if(LingoLinq.Buttonset) { LingoLinq.Buttonset.fix_image = function() { return RSVP.resolve(); }; }
  });
  hooks.afterEach(function() {
    word_suggestions._reset_scoped_sets();
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
    LingoLinq.store = {
      peekAll: function(type) { return type === 'buttonset' ? A([inScope, parent]) : A([]); },
      peekRecord: function(type, id) {
        if(type !== 'buttonset') { return null; }
        return id === 'bs-parent' ? parent : (id === 'bs-scoped' ? inScope : null);
      }
    };
    const appState = speaking_user('u1');

    /* The parent board was visited earlier in this session, which is what puts its set in
       scope for this user. Calls the REAL loader (the stub below replaces it afterwards). */
    this._o.load(appState, null, ['bs-parent']).then(() => {
      word_suggestions.load_vocabulary_button_sets = function() { return RSVP.resolve([inScope]); };
      let delivered = null;
      return word_suggestions.attach_image_for_label('you', ['sub-board-only'], function(url) {
        delivered = url;
      }, { appState: appState }).then(function() {
        assert.strictEqual(delivered, 'https://example.test/you.png',
          'a placeholder-only match in scope does not block the real symbol elsewhere');
        done();
      });
    }, function(e) { assert.ok(false, 'setup rejected: ' + e); done(); });
  });

  test('a symbol on a loaded but out-of-scope board is still found', function(assert) {
    assert.expect(1);
    const done = assert.async();
    /* The parent board's set IS in memory and WAS in scope earlier in this session, but its
       id is not in lookup_board_ids for this sub-board. */
    const parent = buttonSet('bs-parent', [
      { label: 'you', image_id: 'img-1', image: 'https://example.test/you.png', depth: 0 }
    ]);
    LingoLinq.store = {
      peekAll: function(type) { return type === 'buttonset' ? A([parent]) : A([]); },
      peekRecord: function(type, id) {
        return (type === 'buttonset' && id === 'bs-parent') ? parent : null;
      }
    };
    const appState = speaking_user('u1');

    this._o.load(appState, null, ['bs-parent']).then(() => {
      word_suggestions.load_vocabulary_button_sets = function() { return RSVP.resolve([]); };
      let delivered = null;
      return word_suggestions.attach_image_for_label('you', ['sub-board-only'], function(url) {
        delivered = url;
      }, { appState: appState }).then(function() {
        assert.strictEqual(delivered, 'https://example.test/you.png',
          'the parent board\'s symbol is borrowed even though its board id is out of scope');
        done();
      });
    }, function(e) { assert.ok(false, 'setup rejected: ' + e); done(); });
  });
});
