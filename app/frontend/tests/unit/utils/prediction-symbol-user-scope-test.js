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
function speaking_for(supervisor_id, user_id, user_global_id) {
  return EmberObject.create({
    get: function(key) {
      if(key === 'referenced_user.id') { return user_id; }
      if(key === 'referenced_user.global_id') { return user_global_id; }
      if(key === 'currentUser.id') { return supervisor_id; }
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
      load_set: LingoLinq.Buttonset && LingoLinq.Buttonset.load_button_set
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
});
