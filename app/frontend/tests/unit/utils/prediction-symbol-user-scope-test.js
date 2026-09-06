import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { A } from '@ember/array';
import RSVP from 'rsvp';
import word_suggestions from 'frontend/utils/word_suggestions';
import LingoLinq from 'frontend/app';

/* Mirrors what _exact_button_candidates_for_label consumes: `bs.redepth(global_id || id)`,
   and only buttons carrying an `image_id`. `global_id` is kept separate from `id` because a
   key-loaded set's record id is the board KEY, with the real id on `_actual_id`
   (models/buttonset.js:27-32, serializers/application.js:99-109). */
function buttonSet(opts) {
  return EmberObject.create({
    redepth: function() { return opts.buttons; },
    /* Buttonset.load_button_set calls this on the set it finds resident, before handing it back
       (models/buttonset.js:1289). Reached only once the admission rule at word_suggestions.js:1333
       is narrowed -- no test reaches it today; see the fetch-path test below. */
    load_buttons: function() { return RSVP.resolve(); },
    get: function(key) {
      if(key === 'id') { return opts.id; }
      if(key === 'global_id') { return opts.global_id || opts.id; }
      if(key === 'key') { return opts.key || null; }
      if(key === 'board_ids') { return opts.board_ids || []; }
      if(key === 'buttons') { return opts.buttons; }
      return null;
    }
  });
}

/* An appState stub answering the two user shapes the scoping decision depends on.
   `user_id` is the RECORD id -- which for the session user is the literal string 'self'
   (serializers/application.js:52-60 pins it and parks the real id on `_actual_id`), which is
   why models/user.js:67 says "Compare with this, not `id`". `user_global_id` is the real
   backend id. Both are modelled so a fix keyed on the wrong one cannot pass. */
function speaking_for(supervisor_id, user_id, user_global_id, boards) {
  /* `boards` is optional and additive: the three tests above pass nothing and every key below
     answers exactly as it did before. It exists so one test can model what `lookup_board_ids`
     actually reads -- the two users' HOME BOARDS -- which is the difference between asserting
     that scope is recorded correctly and asserting that the right boards are searched at all. */
  var opts = boards || {};
  var user_obj = function(home_board_id) {
    if(!home_board_id) { return null; }
    return EmberObject.create({
      get: function(key) {
        if(key === 'preferences.home_board.id') { return home_board_id; }
        if(key === 'preferences.sidebar_boards') { return []; }
        if(key === 'preferences.sync_starred_boards') { return false; }
        return null;
      }
    });
  };
  var current = user_obj(opts.supervisor_home);
  var referenced = user_obj(opts.communicator_home);
  return EmberObject.create({
    get: function(key) {
      if(key === 'referenced_user.id') { return user_id; }
      if(key === 'referenced_user.global_id') { return user_global_id; }
      if(key === 'currentUser.id') { return supervisor_id; }
      if(key === 'currentUser') { return current; }
      if(key === 'referenced_user') { return referenced; }
      if(key === 'currentUser.preferences.home_board.id') { return opts.supervisor_home || null; }
      if(key === 'referenced_user.preferences.home_board.id') { return opts.communicator_home || null; }
      if(key === 'currentBoardState.id') { return opts.current_board || null; }
      return null;
    }
  });
}

function store_of(sets, by_id) {
  return {
    peekAll: function(type) { return type === 'buttonset' ? A(sets) : A([]); },
    peekRecord: function(type, id) {
      if(type !== 'buttonset') { return null; }
      return (by_id || {})[id] || null;
    }
  };
}

const A_SYMBOL = 'https://example.test/student-a-mom.png';
const B_SYMBOL = 'https://example.test/student-b-mom.png';
const X_SYMBOL = 'https://example.test/user-x-mom.png';
const Y_SYMBOL = 'https://example.test/user-y-mom.png';

/* The widened symbol pass (word_suggestions.js:1459-1477) searches every buttonset resident in
   the Ember store. The store accumulates across communicators inside ONE supervisor login --
   unloadAll runs only on logout (services/session.js:761, :793), never on a speak-as or
   modelling switch. A url it returns is written onto the utterance button
   (utils/utterance.js:589 -> utils/button.js:1694), persisted to working_vocalization
   (utils/utterance.js:314), and logged to the server against the communicator being spoken as
   (services/stashes.js:801-805). So an unscoped result is not a display artifact: it is stored
   against the wrong person. */
module('Unit | Utility | prediction symbols are scoped to the speaking user', function(hooks) {
  hooks.beforeEach(function() {
    this._o = {
      lookup: word_suggestions.lookup,
      store: LingoLinq.store,
      fix: LingoLinq.Buttonset && LingoLinq.Buttonset.fix_image,
      load_set: LingoLinq.Buttonset && LingoLinq.Buttonset.load_button_set,
      /* Global memo (models/buttonset.js:1257-1259, :1416-1420). One test below clears it to run
         the real loader; without this it would stay cleared for every test that runs after it in
         the same page -- an unrestored global mutation is how results become order-dependent. */
      pending: LingoLinq.Buttonset && LingoLinq.Buttonset.pending_promises
    };
    /* The map is module-local, so it would otherwise carry stamps between tests in one run --
       the order-dependent failure shape CLAUDE.md rule #0.10 is about. */
    word_suggestions._reset_scoped_sets();
    /* Kill the generic-word tail so a delivered url can only have come from a button set. */
    word_suggestions.lookup = function() { return RSVP.resolve([]); };
    if(LingoLinq.Buttonset) {
      /* Leave button.image exactly as the fixture set it. */
      LingoLinq.Buttonset.fix_image = function() { return RSVP.resolve(); };
      /* Nothing is fetchable by default: the sub-board case, so only the WIDENED pass can
         supply a symbol. NOTE load_vocabulary_button_sets is deliberately NOT stubbed -- it is
         where scope is recorded, so stubbing it would bypass the thing under test. */
      LingoLinq.Buttonset.load_button_set = function() { return RSVP.reject(); };
    }
  });
  hooks.afterEach(function() {
    word_suggestions._reset_scoped_sets();
    word_suggestions.lookup = this._o.lookup;
    LingoLinq.store = this._o.store;
    if(LingoLinq.Buttonset && this._o.fix) { LingoLinq.Buttonset.fix_image = this._o.fix; }
    if(LingoLinq.Buttonset && this._o.load_set) { LingoLinq.Buttonset.load_button_set = this._o.load_set; }
    if(LingoLinq.Buttonset) { LingoLinq.Buttonset.pending_promises = this._o.pending; }
  });

  test('a set that was in scope for a DIFFERENT communicator never supplies a symbol', function(assert) {
    assert.expect(2);
    const done = assert.async();

    /* Student A's board. DEPTH 0, so it wins the shallowest-first sort
       (word_suggestions.js:1436) and is the first candidate the walk resolves -- it can only
       lose by being excluded, never by being outranked. */
    const student_a_set = buttonSet({
      id: 'studenta/home', global_id: 'a-board', key: 'studenta/home',
      board_ids: ['a-board'],
      buttons: [{ label: 'mom', image_id: 'img-a', image: A_SYMBOL, depth: 0 }]
    });
    /* Student B's own board -- out of scope for the sub-board being typed on, which is the
       case the widened pass exists for. DEEPER, so it is delivered only if A is excluded. */
    const student_b_set = buttonSet({
      id: 'b-board', global_id: 'b-board', key: 'studentb/home',
      board_ids: ['b-board'],
      buttons: [{ label: 'mom', image_id: 'img-b', image: B_SYMBOL, depth: 4 }]
    });
    LingoLinq.store = store_of([student_a_set, student_b_set],
      { 'studenta/home': student_a_set, 'b-board': student_b_set });

    /* ONE supervisor, TWO communicators -- so a fix keyed on `currentUser` puts both students
       in a single bucket and still leaks. Under modelling `currentUser` IS the supervisor:
       app-state.js:2325-2332 nulls speakModeUser, so the currentUser := speakModeUser branch
       at :2601 never fires, while the log is attributed to the communicator
       (stashes.js:801-805). */
    const as_student_a = speaking_for('supervisor-1', 'a-user', 'a-user');
    const as_student_b = speaking_for('supervisor-1', 'b-user', 'b-user');

    RSVP.all_wait([
      word_suggestions.load_vocabulary_button_sets(as_student_a, null, ['studenta/home']),
      word_suggestions.load_vocabulary_button_sets(as_student_b, null, ['b-board'])
    ]).then(function() {
      let delivered = null;
      return word_suggestions.attach_image_for_label('mom', ['b-sub-board'], function(url) {
        delivered = url;
      }, { appState: as_student_b }).then(function() {
        assert.notStrictEqual(delivered, A_SYMBOL,
          'another communicator\'s symbol must never be paired onto this user\'s word');
        assert.strictEqual(delivered, B_SYMBOL,
          'this communicator\'s own out-of-scope board still supplies the symbol');
        done();
      });
    }, function(e) {
      assert.ok(false, 'setup rejected: ' + e);
      assert.ok(false, 'setup rejected');
      done();
    });
  });

  /* Two DIFFERENT people, both loaded as `findRecord('user','self')`, therefore both carrying
     the record id 'self' (serializers/application.js:52-60). This is the logout/login-in-one-
     SPA-session case (services/session.js:735-800). A fix keyed on `referenced_user.id` puts
     them in the SAME bucket and leaks X's vocabulary into Y's utterance; only `global_id`
     separates them. */
  test('two session users are separated even though both record ids are the string self', function(assert) {
    assert.expect(2);
    const done = assert.async();

    const user_x_set = buttonSet({
      id: 'x-board', global_id: 'x-board', key: 'userx/home', board_ids: ['x-board'],
      buttons: [{ label: 'mom', image_id: 'img-x', image: X_SYMBOL, depth: 0 }]
    });
    const user_y_set = buttonSet({
      id: 'y-board', global_id: 'y-board', key: 'usery/home', board_ids: ['y-board'],
      buttons: [{ label: 'mom', image_id: 'img-y', image: Y_SYMBOL, depth: 4 }]
    });
    LingoLinq.store = store_of([user_x_set, user_y_set],
      { 'x-board': user_x_set, 'y-board': user_y_set });

    const as_x = speaking_for(null, 'self', 'user-x');
    const as_y = speaking_for(null, 'self', 'user-y');

    RSVP.all_wait([
      word_suggestions.load_vocabulary_button_sets(as_x, null, ['x-board']),
      word_suggestions.load_vocabulary_button_sets(as_y, null, ['y-board'])
    ]).then(function() {
      let delivered = null;
      return word_suggestions.attach_image_for_label('mom', ['y-sub-board'], function(url) {
        delivered = url;
      }, { appState: as_y }).then(function() {
        assert.notStrictEqual(delivered, X_SYMBOL,
          'the previous session user\'s symbol must not survive into this one');
        assert.strictEqual(delivered, Y_SYMBOL,
          'this user\'s own out-of-scope board still supplies the symbol');
        done();
      });
    }, function(e) {
      assert.ok(false, 'setup rejected: ' + e);
      assert.ok(false, 'setup rejected');
      done();
    });
  });

  /* load_vocabulary_button_sets has TWO returns: the early RSVP.resolve(warmed) when nothing
     needs fetching (:1400-1402) and the async one after load_button_set (:1414). Tests 1 and 2
     both take the EARLY path, so without this a fix that records on the early return only
     would pass while silently disabling the widened pass for every lookup that had to fetch.
     Forced down the async branch by asking for one id that IS covered by a resident set and
     one that is not, so `missing` is non-empty.

     NOTE the async branch returns `warmed`, NOT the freshly fetched sets: RSVP.all_wait
     resolves with NO value (utils/misc.js:157-161 -- `resolve()`), so the `loaded` parameter
     at :1405 is always undefined and `warmed.concat(loaded || [])` adds nothing. That is a
     pre-existing defect in the loader, unrelated to scoping and deliberately not fixed here;
     it is why this asserts the RESIDENT set is recorded rather than the fetched one. */
  test('a set recorded on the FETCH path is scoped too', function(assert) {
    assert.expect(1);
    const done = assert.async();

    const resident_set = buttonSet({
      id: 'r-board', global_id: 'r-board', key: 'userr/home', board_ids: ['r-board'],
      buttons: [{ label: 'mom', image_id: 'img-r', image: Y_SYMBOL, depth: 2 }]
    });
    LingoLinq.store = store_of([resident_set], { 'r-board': resident_set });

    const as_r = speaking_for(null, 'self', 'user-r');
    /* 'r-board' is covered by the resident set; 'absent-board' is not, so `missing` is
       non-empty and the loader takes the async return. */
    word_suggestions.load_vocabulary_button_sets(as_r, null, ['r-board', 'absent-board']).then(function() {
      let delivered = null;
      return word_suggestions.attach_image_for_label('mom', ['other-sub-board'], function(url) {
        delivered = url;
      }, { appState: as_r }).then(function() {
        assert.strictEqual(delivered, Y_SYMBOL,
          'a set recorded while the loader was on its fetch path is still searchable later');
        done();
      });
    }, function(e) {
      assert.ok(false, 'setup rejected: ' + e);
      done();
    });
  });

  /* ------------------------------------------------------------------------------------
     A SHARED BOARD RECORD is the remaining way into the scope stamp.

     Every test above gives each communicator a `board_ids` list containing only their own
     root, so the scoped pass never sees the other's set. That is not the general case. A
     button set's `board_ids` is every `board_id` appearing in its buttons
     (models/buttonset.js:40-49), i.e. its ENTIRE downstream tree, and the admission test at
     word_suggestions.js:1333 admits a set whose tree merely CONTAINS a looked-up id. One board
     record reachable from two communicators -- a shared library board, or one student's home
     board sitting inside another's tree -- therefore admits the whole foreign set.

     KNOWN BROKEN — the three tests in this section are test.todo, so the suite stays green and
     each flips to a failure the moment someone fixes it. Deferred unit: the admission rule at
     :1333 (see the working log's "STILL OPEN" list).

     It does not stop at that one lookup. `load_vocabulary_button_sets` stamps whatever the
     scoped pass returned (:1504 on the early return, :1541 on the fetch path), so a set
     admitted this way is written into THIS user's bucket (record_scoped_sets, :1464-1474) and
     stays there for the rest of the session -- `_reset_scoped_sets` runs only from app-state
     reset/clear_user_state. Every later lookup, on boards sharing nothing at all, can then
     serve that vocabulary through the widened pass. The scoped pass is UPSTREAM of the scope
     stamp, so a leak here defeats the scoping the widened pass was given. */
  const SHARED_BOARD = 'shared-core';

  /* Two communicators under one supervisor whose trees both reach SHARED_BOARD. Student A's
     button is DEPTH 0 and student B's is DEPTH 4, so A wins the shallowest-first sort
     (word_suggestions.js:1515) whenever it is present: A can only lose by being
     excluded, never by being outranked. */
  function shared_board_sets() {
    return {
      a: buttonSet({
        id: 'studenta/home', global_id: 'a-board', key: 'studenta/home',
        board_ids: ['a-board', SHARED_BOARD],
        buttons: [{ label: 'mom', image_id: 'img-a', image: A_SYMBOL, depth: 0 }]
      }),
      b: buttonSet({
        id: 'b-board', global_id: 'b-board', key: 'studentb/home',
        board_ids: ['b-board', SHARED_BOARD],
        buttons: [{ label: 'mom', image_id: 'img-b', image: B_SYMBOL, depth: 4 }]
      })
    };
  }

  test.todo('a board shared with another communicator does not admit their set into the scoped pass', function(assert) {
    assert.expect(2);
    const done = assert.async();

    const sets = shared_board_sets();
    LingoLinq.store = store_of([sets.a, sets.b],
      { 'studenta/home': sets.a, 'b-board': sets.b });
    const as_student_b = speaking_for('supervisor-1', 'b-user', 'b-user');

    /* The ids student B's own session produces while sitting on the shared board: the board
       they are looking at, and their own root. Neither one names student A's set.
       The SHARED board is listed FIRST deliberately: it is the leak vector, and with it at
       index 0 the test cannot be satisfied by an implementation that stops after the first id
       -- such an implementation returns nothing here and fails the B_SYMBOL assertion. */
    let delivered = null;
    word_suggestions.attach_image_for_label('mom', [SHARED_BOARD, 'b-board'], function(url) {
      delivered = url;
    }, { appState: as_student_b }).then(function() {
      assert.notStrictEqual(delivered, A_SYMBOL,
        'the other communicator\'s set must not be admitted just because its tree contains the shared board');
      assert.strictEqual(delivered, B_SYMBOL,
        'this communicator\'s own set still supplies the symbol for the shared board');
      done();
    }, function(e) {
      assert.ok(false, 'lookup rejected: ' + e);
      assert.ok(false, 'lookup rejected');
      done();
    });
  });

  /* The stamp half of the same defect, and the reason fixing only the matcher is not enough:
     the poisoned bucket outlives the board that poisoned it. This lookup names a board NEITHER
     set covers, so the scoped pass returns nothing and only the widened pass can answer -- and
     the widened pass returns exactly what was stamped (loaded_button_sets_beyond, :1593-1619).
     `load_button_set` is stubbed to reject in beforeEach, so nothing can be fetched to cover it. */
  test.todo('a set admitted through a shared board is not stamped into this user\'s scope', function(assert) {
    assert.expect(2);
    const done = assert.async();

    const sets = shared_board_sets();
    LingoLinq.store = store_of([sets.a, sets.b],
      { 'studenta/home': sets.a, 'b-board': sets.b });
    const as_student_b = speaking_for('supervisor-1', 'b-user', 'b-user');

    let delivered = null;
    word_suggestions.load_vocabulary_button_sets(as_student_b, null, ['b-board', SHARED_BOARD]).then(function() {
      return word_suggestions.attach_image_for_label('mom', ['b-only-board'], function(url) {
        delivered = url;
      }, { appState: as_student_b }).then(function() {
        assert.notStrictEqual(delivered, A_SYMBOL,
          'a set admitted through a shared board must not stay searchable on unrelated boards');
        assert.strictEqual(delivered, B_SYMBOL,
          'this communicator\'s own set is still stamped and still reachable through the widened pass');
        done();
      });
    }).then(null, function(e) {
      /* At the END of the chain, not as .then's sibling argument: a sibling handler sees only the
         OUTER promise, so a rejection from attach_image_for_label would never fire it, done()
         would never run, and the test would die by timeout and be charged to another test. */
      assert.ok(false, 'lookup rejected: ' + e);
      assert.ok(false, 'lookup rejected');
      done();
    });
  });

  /* MUST STAY GREEN. The narrowest fix -- admitting a set only when its RECORD id or `key`
     matches -- breaks this, and it is the common case on the classic board route: the
     serializer pins a set requested by board path to the KEY it was requested with and parks
     the backend id on `_actual_id` (serializers/application.js:99-109), while the ids the
     lookup supplies are the numeric global ones. So for a key-loaded set neither `id` nor
     `key` equals the looked-up id and only `global_id` does. Asserted directly on the scoped
     pass rather than through a symbol, because it is an admission rule, not a match rule. */
  test('a key-loaded set is still admitted for its own global board id', function(assert) {
    const own = buttonSet({
      id: 'studenta/home', global_id: 'a-board', key: 'studenta/home',
      board_ids: ['a-board', 'a-sub-board'],
      buttons: [{ label: 'mom', image_id: 'img-a', image: A_SYMBOL, depth: 0 }]
    });
    /* peekRecord is keyed on the RECORD id, so a numeric lookup misses it -- exactly as it
       does in the app. */
    LingoLinq.store = store_of([own], { 'studenta/home': own });

    const found = word_suggestions.button_sets_for_board_ids(['a-board']);
    assert.deepEqual(found.map(function(bs) { return bs.get('id'); }), ['studenta/home'],
      'the set for the board the user is on is admitted even though its record id is the key');
  });

  /* MUST STAY GREEN. Two guards inside the same admission block, both from production bugs:
     `bs &&` at :1333 (peekAll surfaces empty/unmaterialized records during prefetch and
     word-prediction warming) and the buttons/root_url test at :1340 (a record that exists but
     carries nothing covers nothing). A rewrite of the block is the thing most likely to drop
     them, and no other test pins them at this level -- prediction-symbol-pairing-test.js
     stubs this function out rather than exercising it. */
  test('a record with no buttons and no root_url is not admitted, and a hole in peekAll does not throw', function(assert) {
    const empty = buttonSet({
      id: 'e-board', global_id: 'e-board', key: 'usere/home', board_ids: [], buttons: []
    });
    LingoLinq.store = store_of([undefined, empty], { 'e-board': empty });

    assert.deepEqual(word_suggestions.button_sets_for_board_ids(['e-board']), [],
      'a record with nothing in it is not offered to the matcher');
  });
  /* The FETCH path, which the two tests above structurally cannot reach.

     PROSPECTIVE, and deliberately so: TODAY this test is red for the same reason as the two
     above -- the synchronous matcher at :1333 admits A's set into `warmed`, which marks
     `shared-core` covered at :1499, so `missing` is empty, `load_vocabulary_button_sets` takes
     its early return at :1504 and the loader is never called. It becomes the DISCRIMINATOR the
     moment :1333 is narrowed: verified by experiment -- an own-identity fix at :1333 turns the
     two tests above green and leaves this one red. That is exactly why it is here.

     The two above give student B a `board_ids` list that already contains the shared board, so
     B's own set marks it covered at :1499 and the fetch path is unreachable from them.

     That hides the more common shape: a board inside ANOTHER communicator's
     tree but not inside this one's. There `missing` is non-empty and the id goes to
     `LingoLinq.Buttonset.load_button_set` (:1528) -- whose own admission rule
     (models/buttonset.js:1276) is the SAME tree-membership test, which returns the foreign set
     straight from the store with no network call (:1289). It is then concat'd at :1532 and
     stamped into this user's bucket at :1541.

     So a fix applied only to the synchronous matcher at :1333 is a NO-OP here: narrowing
     `warmed` narrows `covered`, which pushes exactly the leaked ids into `missing` and hands
     them to a loader that re-admits the same set one microtask later. This test is the one that
     can tell those two outcomes apart, and it is asserted on the RESOLVED SETS rather than on a
     delivered url so it cannot be satisfied by a change to the matcher or the image walk.

     The real `load_button_set` runs here, deliberately -- the beforeEach stub that rejects would
     make the re-admission unreachable, which is precisely the insulation being removed. */
  test.todo('a set reached through the FETCH path is not admitted for another communicator either', function(assert) {
    assert.expect(2);
    const done = assert.async();

    const student_a_set = buttonSet({
      id: 'studenta/home', global_id: 'a-board', key: 'studenta/home',
      board_ids: ['a-board', SHARED_BOARD],
      buttons: [{ label: 'mom', image_id: 'img-a', image: A_SYMBOL, depth: 0 }]
    });
    /* The difference from the tests above, and the whole point: B's tree does NOT contain the
       shared board, so nothing of B's can cover it and it must land in `missing`. */
    const student_b_set = buttonSet({
      id: 'b-board', global_id: 'b-board', key: 'studentb/home',
      board_ids: ['b-board'],
      buttons: [{ label: 'mom', image_id: 'img-b', image: B_SYMBOL, depth: 4 }]
    });
    LingoLinq.store = store_of([student_a_set, student_b_set],
      { 'studenta/home': student_a_set, 'b-board': student_b_set });

    /* Let the real loader run, and clear its memo so a sibling test cannot answer for it
       (models/buttonset.js:1257-1259; the local-hit return at :1289 never populates it, but the
       fetch chain assigned at :1356 and memoised at :1416 does -- `generate` is only that
       chain's 404 fallback at :1409, not the memo writer). */
    LingoLinq.Buttonset.load_button_set = this._o.load_set;
    LingoLinq.Buttonset.pending_promises = {};

    const as_student_b = speaking_for('supervisor-1', 'b-user', 'b-user');

    word_suggestions.load_vocabulary_button_sets(as_student_b, null, ['b-board', SHARED_BOARD]).then(function(sets) {
      const ids = (sets || []).map(function(bs) { return bs && bs.get && bs.get('id'); });
      assert.strictEqual(ids.indexOf('studenta/home'), -1,
        'the other communicator\'s set must not be re-admitted through the fetch path either (got: ' + ids.join(',') + ')');
      assert.notStrictEqual(ids.indexOf('b-board'), -1,
        'this communicator\'s own set is still returned');
      done();
    }, function(e) {
      assert.ok(false, 'loader rejected: ' + e);
      assert.ok(false, 'loader rejected');
      done();
    });
  });

  /* MUST STAY GREEN. Two properties of the admission block that no other test pins, both of
     which a rewrite into "match the set's own identity" is liable to lose.

     THE `key === id` CLAUSE IS LOAD-BEARING, and not merely a duplicate of the `id` match.
     `lib/json_api/button_set.rb:12-13` sends `id` as the board's `shallow_id` and `key` as its
     `shallow_key`, so a set fetched NUMERICALLY has a `key` that differs from its record `id`
     and from its `global_id`. `lookup_board_ids:1405-1406` pushes `preferences.sidebar_boards[]`
     into the lookup list BY KEY. For that pair `peekRecord(key)` misses, `id === key` misses and
     `global_id === key` misses -- `key === id` is the only clause that admits a user's own
     sidebar set.

     AND IDS AFTER THE FIRST ARE SEARCHED. The lookup list is a list, not a preference order;
     `'nothing-here'` sits at index 0 so an implementation that stops after one id returns
     nothing and fails.

     Deliberately NOT folded into the key-loaded test above, even though the fixtures are
     similar: that test's whole job is to fail when a fix compares `id`/`key` only, and adding a
     `peekRecord` hit or a key-form id to its lookup list would let exactly that fix pass it. */
  test('a set is admitted by its key, and ids after the first are searched', function(assert) {
    const sidebar = buttonSet({
      id: 'n-board', global_id: 'n-board', key: 'usern/home',
      board_ids: ['n-board'],
      buttons: [{ label: 'mom', image_id: 'img-n', image: Y_SYMBOL, depth: 0 }]
    });
    /* Empty peekRecord map: the only route in is the key clause. */
    LingoLinq.store = store_of([sidebar], {});

    assert.deepEqual(
      word_suggestions.button_sets_for_board_ids(['nothing-here', 'usern/home'])
        .map(function(bs) { return bs.get('id'); }),
      ['n-board'],
      'a sidebar board named by KEY still finds its set');
  });

  /* MUST STAY GREEN. The dedup at :1339 collapses the several routes by which one record can be
     admitted for one lookup list -- here `peekRecord('n-board')` and `key === 'usern/home'`.
     Duplicates are invisible to every assertion above but not to the app: the image walk is
     capped at MAX_IMAGE_CANDIDATES (:1654), so a duplicated set can spend the cap on copies of
     one symbol-less button and starve a good match deeper in the tree -- the exact failure the
     comment at :1643-1653 describes fixing. */
  test('one record admitted by two routes is returned once', function(assert) {
    const sidebar = buttonSet({
      id: 'n-board', global_id: 'n-board', key: 'usern/home',
      board_ids: ['n-board'],
      buttons: [{ label: 'mom', image_id: 'img-n', image: Y_SYMBOL, depth: 0 }]
    });
    LingoLinq.store = store_of([sidebar], { 'n-board': sidebar });

    assert.deepEqual(
      word_suggestions.button_sets_for_board_ids(['n-board', 'usern/home'])
        .map(function(bs) { return bs.get('id'); }),
      ['n-board'],
      'the same record admitted by record id and by key is not returned twice');
  });

  /* THE END-TO-END PROOF that the `referenced_user` change is worth shipping.

     Every other test in this file asserts on the SCOPE RECORD -- which sets are remembered for
     whom. This one asserts on what a communicator actually SEES, and it is the only test that
     exercises `lookup_board_ids` through the full symbol path rather than around it.

     The setup is the ordinary supervisor workflow, not a contrived one: the supervisor opened
     their own board earlier in the session (so their set is resident -- nothing evicts it,
     `unloadAll` runs only on logout, services/session.js:761/:793), then used "Model for" on a
     communicator. Under "Model for" `currentUser` stays the SUPERVISOR
     (services/app-state.js:2333 nulls `speakModeUser`) while `referenced_user` is the
     communicator.

     The supervisor's "more" is at DEPTH 0 and the communicator's at DEPTH 4, which is the
     realistic shape -- a word on your own home board outranks the same word two levels down
     someone else's tree, and `_exact_button_candidates_for_label` sorts by depth alone. Depth is
     not even required pre-fix: `currentUser.preferences.home_board.id` was the FIRST id pushed,
     so the supervisor's set sat at index 0 and won every depth TIE as well (the sort is stable).

     Where the harm actually lands, stated precisely because it is easy to overstate: the url is
     written onto the communicator's utterance button (utils/utterance.js:589), rendered in their
     sentence box, and survives in `working_vocalization` across app restarts. It IS also logged
     (services/stashes.js:801-805) -- but that copy is inert on read-back, because
     `LogSession.extra_data_public_transform` (app/models/log_session.rb:2105-2147) rebuilds each
     event from a whitelist with no `image` key, so it surfaces in no report or API response. The
     observable harm is the sentence box, not the log.

     Before the fix this delivers the SUPERVISOR's symbol. After it, the supervisor's board is
     never looked up, their set is never admitted, and the communicator's own symbol is used. */
  test('a supervisor modelling for a communicator does not lend them their own symbol', function(assert) {
    assert.expect(2);
    const done = assert.async();

    const supervisor_set = buttonSet({
      id: 'sup-home', global_id: 'sup-home', key: 'supervisor/home',
      board_ids: ['sup-home'],
      buttons: [{ label: 'more', image_id: 'img-sup', image: A_SYMBOL, depth: 0 }]
    });
    const communicator_set = buttonSet({
      id: 'b-home', global_id: 'b-home', key: 'studentb/home',
      board_ids: ['b-home'],
      buttons: [{ label: 'more', image_id: 'img-b', image: B_SYMBOL, depth: 4 }]
    });
    LingoLinq.store = store_of([supervisor_set, communicator_set],
      { 'sup-home': supervisor_set, 'b-home': communicator_set });

    const modelling_for_b = speaking_for('supervisor-1', 'b-user', 'b-user', {
      supervisor_home: 'sup-home',
      communicator_home: 'b-home',
      current_board: 'b-home'
    });

    /* No explicit board_ids: the lookup list is whatever `lookup_board_ids` derives, which is
       the thing under test. */
    let delivered = null;
    word_suggestions.attach_image_for_label('more', [], function(url) {
      delivered = url;
    }, { appState: modelling_for_b }).then(function() {
      assert.notStrictEqual(delivered, A_SYMBOL,
        'the supervisor\'s own symbol must not be paired onto the communicator\'s word');
      assert.strictEqual(delivered, B_SYMBOL,
        'the communicator\'s own board still supplies the symbol');
      done();
    }).then(null, function(e) {
      assert.ok(false, 'lookup rejected: ' + e);
      assert.ok(false, 'lookup rejected');
      done();
    });
  });

});
