import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';

/* `_suggestion_memo_scope` keys the resolved-symbol memo. The memo stores a RESOLVED url and
 * replays it for the same key, and it is cleared only in `clear_sentence` -- so anything the
 * key fails to distinguish gets one communicator's symbol replayed onto another's word. The
 * controller's own comment calls a confidently wrong symbol "worse for a symbol-reliant user
 * than a missing one", which is precisely what that produces.
 *
 * The scope resolved to the board ROOT, with `currentUser.preferences.home_board.id` as the
 * fallback. Under modelling `currentUser` stays the SUPERVISOR (services/app-state.js:4059 --
 * `referenced_user` is the communicator, `currentUser` is not), so modelling for one
 * communicator and then another produced the SAME key by both paths:
 *   - shared root: two communicators can hold the same board record, and `set_as_home` writes
 *     a reference with no copy, so that is a one-click flow rather than a corner case;
 *   - fallback:    the supervisor's own home board, identical for every communicator.
 *
 * Test 2 is the one that matters and test 3 is what stops a hollow fix: making the scope
 * unique per CALL would satisfy test 2 while destroying the memo, so stability under an
 * unchanged communicator is asserted explicitly.
 */
module('Unit | Controller | user/board-detail modelling symbol scope', function(hooks) {
  setupTest(hooks);

  /* The session user's record id is pinned to the literal string 'self'
     (serializers/application.js) and `models/user.js:67` says outright to compare on
     `global_id`, not `id`. So a stub handing two DISTINCT `id` values does not model
     production at all: production hands 'self' both times. Every case below therefore uses
     the real shape -- id 'self', identity in global_id -- and `self_id: false` is available
     for the already-resolved case. */
  function appStateFor(opts) {
    opts = opts || {};
    var ref = null;
    if(opts.global_id || opts.id) {
      ref = EmberObject.create({
        id: opts.self_id === false ? opts.global_id : 'self',
        global_id: opts.global_id
      });
    }
    return EmberObject.create({
      referenced_user: ref,
      currentUser: EmberObject.create({
        id: 'self',
        global_id: 'supervisor-1',
        preferences: opts.no_home ? {} : { home_board: { id: opts.home || 'supervisor-home' } }
      })
    });
  }

  hooks.beforeEach(function() {
    this.controller = this.owner.factoryFor('controller:user/board-detail').create();
  });

  hooks.afterEach(function() {
    if(this.controller) { this.controller.destroy(); this.controller = null; }
  });

  test('a shared board root still separates two communicators', function(assert) {
    var stashes = EmberObject.create({ root_board_state: { id: 'board-shared' } });
    this.controller.set('stashes', stashes);

    this.controller.set('app_state', appStateFor({ global_id: 'user-A' }));
    var a = this.controller._suggestion_memo_scope(['b1']);

    this.controller.set('app_state', appStateFor({ global_id: 'user-B' }));
    var b = this.controller._suggestion_memo_scope(['b1']);

    assert.notEqual(a, b, 'same board root, different communicator -> different memo scope');
  });

  test('the supervisor home-board fallback separates two communicators', function(assert) {
    /* No root in stashes, so the scope falls back to the supervisor's home board -- which is
       the same value whoever is being modelled for. */
    this.controller.set('stashes', EmberObject.create({}));

    this.controller.set('app_state', appStateFor({ global_id: 'user-A' }));
    var a = this.controller._suggestion_memo_scope(['b1']);

    this.controller.set('app_state', appStateFor({ global_id: 'user-B' }));
    var b = this.controller._suggestion_memo_scope(['b1']);

    assert.notEqual(a, b, 'supervisor fallback, different communicator -> different memo scope');
  });

  test('the scope is stable while the communicator does not change', function(assert) {
    /* Guards the weakest passing implementation: a scope made unique per call would satisfy
       the two tests above and silently disable the memo, re-resolving every symbol forever. */
    var stashes = EmberObject.create({ root_board_state: { id: 'board-shared' } });
    this.controller.set('stashes', stashes);
    this.controller.set('app_state', appStateFor({ global_id: 'user-A' }));

    var first = this.controller._suggestion_memo_scope(['b1']);
    var second = this.controller._suggestion_memo_scope(['b1']);

    assert.strictEqual(first, second, 'same communicator and root -> identical memo scope');
  });

  test('two communicators are separated even though both record ids are "self"', function(assert) {
    /* THE CASE THE FIRST ATTEMPT MISSED. Keying on `referenced_user.id` looks right and is
       inert, because that id is the constant 'self' for the session user -- so both
       communicators produced the identical key and the replay survived the "fix".
       `utils/word_suggestions.js:1485` already solved this; the fix reuses it rather than
       reinventing it a second time. */
    var stashes = EmberObject.create({ root_board_state: { id: 'board-shared' } });
    this.controller.set('stashes', stashes);

    this.controller.set('app_state', appStateFor({ global_id: 'user-A' }));
    var a = this.controller._suggestion_memo_scope(['b1']);

    this.controller.set('app_state', appStateFor({ global_id: 'user-B' }));
    var b = this.controller._suggestion_memo_scope(['b1']);

    assert.notEqual(a, b, 'global_id separates them even with id pinned to "self"');
    assert.strictEqual(a.indexOf('self'), -1, 'the constant "self" is never used as the segment');
  });

  test('with no root and no home board, the board-id list is still the scope', function(assert) {
    /* Guards the `(lookup_ids || []).join(',')` fallback, which every other case skips because
       it supplies a home board. Without this, deleting that branch leaves the suite green while
       collapsing every board set into one scope -- the cross-SET replay the method exists to
       prevent. */
    this.controller.set('stashes', EmberObject.create({}));
    this.controller.set('app_state', appStateFor({ global_id: 'user-A', no_home: true }));

    var one = this.controller._suggestion_memo_scope(['b1']);
    var two = this.controller._suggestion_memo_scope(['b2']);

    assert.notEqual(one, two, 'distinct board-id lists still produce distinct scopes');
    assert.ok(one.indexOf('b1') !== -1, 'the id list is still carried in the scope');
  });

  test('different board roots stay separate, as before', function(assert) {
    /* Pre-existing behaviour this change must not cost: the same word can legitimately resolve
       to different symbols on different board SETS. */
    this.controller.set('app_state', appStateFor({ global_id: 'user-A' }));

    this.controller.set('stashes', EmberObject.create({ root_board_state: { id: 'root-1' } }));
    var one = this.controller._suggestion_memo_scope(['b1']);

    this.controller.set('stashes', EmberObject.create({ root_board_state: { id: 'root-2' } }));
    var two = this.controller._suggestion_memo_scope(['b1']);

    assert.notEqual(one, two, 'different roots -> different memo scope');
  });
});
