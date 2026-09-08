import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';
import RSVP from 'rsvp';
import word_suggestions from 'frontend/utils/word_suggestions';
import LingoLinq from 'frontend/app';

/* `lookup` MEMOISES on a module-level singleton, and its key omits the inputs that decide WHOSE
   symbols get stamped.

   The key is the comparison at word_suggestions.js:514 -- last_finished_word, word_in_progress,
   second_to_last_word, last_shift, last_time_bucket, last_topic_context, last_locale. No
   `board_ids`, no `button_sets`, no user identity. The result array is parked on the singleton at
   :713, the symbol stamp at :807 mutates THAT ARRAY IN PLACE and asynchronously, and a key match
   at :850 returns it verbatim without consulting the new inputs. `last_result` is written in one
   place and read in one place and cleared nowhere -- not on a modelling switch, not on logout.

   So while modelling communicator A, a symbol from A's boards is stamped into the singleton; on
   switching to communicator B the DISPLAYED board does not change (toggle_mode resolves
   `preferred` to the supervisor's home board because keep_as_self nulled speakModeUser --
   services/app-state.js:1435, :2333), so `topic_context` and `locale` match, the memo hits, and
   A's symbol is handed to B. controllers/board/index.js:1673-1675 then writes it onto B's
   utterance button and speaks it. */
module('Unit | Utility | prediction memo is scoped to the speaking user', function(hooks) {
  /* lookup() calls appState.get('shift') unguarded (:434), so the app-state proxy has to resolve.
     setupTest is the repo wrapper (waitForSettled:false), not ember-qunit's -- see the note in
     prediction-symbol-pairing-test.js. */
  setupTest(hooks);

  const A_SYMBOL = 'https://example.test/student-a.png';
  const B_SYMBOL = 'https://example.test/student-b.png';

  hooks.beforeEach(function() {
    this._orig = {
      ngrams: word_suggestions.ngrams,
      fallback: word_suggestions.fallback_url,
      fix_image: LingoLinq.Buttonset.fix_image,
      load_set: LingoLinq.Buttonset.load_button_set,
      appState: word_suggestions._services.appState
    };
    /* The seven live key terms at :514, ALL of them. The suite's two existing reset blocks
       (tests/utils/word_suggestions-test.js:29-36, prediction-symbol-pairing-test.js:51-59) omit
       `last_shift` and `second_to_last_word`, so a stale value from a prior test would
       participate in the hit decision and make this order-dependent. */
    word_suggestions.last_finished_word = null;
    word_suggestions.last_result = null;
    word_suggestions.word_in_progress = null;
    word_suggestions.second_to_last_word = null;
    word_suggestions.last_shift = null;
    word_suggestions.last_time_bucket = null;
    word_suggestions.last_topic_context = null;
    word_suggestions.last_locale = null;
    word_suggestions.last_scope_key = null;
    word_suggestions.last_searched_sig = null;
    word_suggestions.fallback_url_result = null;
    word_suggestions.ngrams = { '': [['they', -1.0]] };
    word_suggestions.fallback_url = function() { return RSVP.resolve('/images/square.svg'); };

    /* fix_image's contract: it always leaves button.image truthy. Here it publishes whatever the
       fixture put on the button, so the stamp at :807 copies a per-board symbol. */
    LingoLinq.Buttonset.fix_image = function(button) {
      button.image = button.original_image;
      return RSVP.resolve();
    };

    this.loads = [];
    var loads = this.loads;
    /* One set per board id, each carrying a DIFFERENT symbol for the same word, so the delivered
       image identifies which board was searched. */
    LingoLinq.Buttonset.load_button_set = function(id) {
      loads.push(id);
      var button = {
        label: 'they', vocalization: 'they', image_id: 'i1', depth: 0,
        original_image: id === 'board-a' ? A_SYMBOL : B_SYMBOL
      };
      return RSVP.resolve({
        button: button,
        get: function(key) { return (key === 'id' || key === 'global_id') ? id : null; },
        redepth: function() { return [button]; }
      });
    };
  });

  hooks.afterEach(function() {
    word_suggestions.ngrams = this._orig.ngrams;
    word_suggestions.fallback_url = this._orig.fallback;
    LingoLinq.Buttonset.fix_image = this._orig.fix_image;
    LingoLinq.Buttonset.load_button_set = this._orig.load_set;
    word_suggestions._services.appState = this._orig.appState;
    word_suggestions.last_result = null;
    word_suggestions.last_finished_word = null;
    word_suggestions.word_in_progress = null;
    word_suggestions.last_topic_context = null;
    word_suggestions.last_locale = null;
  });

  /* `referenced_user` is the communicator being modelled; `scope_key_for` reads its global_id. */
  function speaking_as(global_id) {
    word_suggestions._services.appState = {
      get: function(key) {
        if(key === 'referenced_user.global_id') { return global_id; }
        if(key === 'shift') { return false; }
        return null;
      }
    };
  }

  function found(list) {
    return (list || []).find(function(w) { return (w.word || '').toLowerCase() === 'they'; });
  }

  /* The stamp is a microtask chain that lands after lookup resolves (:807 runs inside
     fix_image's continuation), so drain a couple of turns before reading it. */
  function settle(list) {
    return RSVP.resolve().then(function() {
      return RSVP.resolve().then(function() { return list; });
    });
  }

  test('a symbol stamped while modelling one communicator is not served to the next', function(assert) {
    assert.expect(2);
    const done = assert.async();

    speaking_as('student-a');
    word_suggestions.lookup({ word_in_progress: 'th', board_ids: ['board-a'] })
      .then(settle)
      .then(function(list) {
        var a_word = found(list) || {};
        assert.strictEqual(a_word.original_image, A_SYMBOL,
          'precondition: modelling A stamps A\'s symbol into the memoised array');

        /* The supervisor switches to communicator B. Same word, and the DISPLAYED board is
           unchanged across the switch, so every field in the memo key still matches. */
        speaking_as('student-b');
        return word_suggestions.lookup({ word_in_progress: 'th', board_ids: ['board-b'] });
      })
      .then(settle)
      .then(function(list) {
        /* Asserting B's symbol ARRIVED, not merely that A's did not: `notStrictEqual` alone
           passes vacuously when the word is missing entirely, which is the conjunction trap
           this suite has been bitten by before. */
        var b_word = found(list) || {};
        assert.strictEqual(b_word.original_image, B_SYMBOL,
          'the next communicator gets their OWN symbol, not the previous one\'s');
        done();
      }, function(e) { assert.ok(false, 'rejected: ' + e); assert.ok(false, 'rejected'); done(); });
  });

  /* FAIL-CLOSED, isolated. `scope_key_for` returns null when the id is absent or still the
     literal 'self' (models/user.js:55-65 documents that window), and logout via the SPA branch
     (services/session.js:757/:789 -> app-state.js:2106-2120) never clears this memo, so two
     DIFFERENT people can both key null in one page session. `null !== null` is false, so a naive
     `last_scope_key !== scope_key` treats two unknowns as the same person.

     The boards are held CONSTANT here on purpose. An earlier version of this test varied them
     too, and falsification proved it hollow: the searched-set term forced the recompute, so the
     fail-open mutation passed 4/4. Asserting the LOAD COUNT with identical boards isolates the
     scope term -- fail-open serves the memo (1 load), fail-closed recomputes (2). */
  test('two unidentified users do not share a memo slot', function(assert) {
    assert.expect(2);
    const done = assert.async();
    var loads = this.loads;

    speaking_as(null);
    word_suggestions.lookup({ word_in_progress: 'th', board_ids: ['board-a'] })
      .then(settle)
      .then(function() {
        assert.strictEqual(loads.length, 1, 'precondition: the first lookup walks the set');
        return word_suggestions.lookup({ word_in_progress: 'th', board_ids: ['board-a'] });
      })
      .then(settle)
      .then(function() {
        assert.strictEqual(loads.length, 2,
          'an unresolvable identity must force a recompute, not match another unknown');
        done();
      }, function(e) { assert.ok(false, 'rejected: ' + e); assert.ok(false, 'rejected'); done(); });
  });

  /* The scope term, isolated the same way: identical boards and word tuple, only the speaking
     user changes. Without a scope term in the key this is a memo hit (1 load). */
  test('a change of speaking user alone forces a recompute', function(assert) {
    assert.expect(2);
    const done = assert.async();
    var loads = this.loads;

    speaking_as('student-a');
    word_suggestions.lookup({ word_in_progress: 'th', board_ids: ['board-a'] })
      .then(settle)
      .then(function() {
        assert.strictEqual(loads.length, 1, 'precondition: the first lookup walks the set');
        speaking_as('student-b');
        return word_suggestions.lookup({ word_in_progress: 'th', board_ids: ['board-a'] });
      })
      .then(settle)
      .then(function() {
        assert.strictEqual(loads.length, 2,
          'the result belongs to a user, so a different user must not be served it');
        done();
      }, function(e) { assert.ok(false, 'rejected: ' + e); assert.ok(false, 'rejected'); done(); });
  });

  /* The OTHER term the key gained: which vocabulary was actually searched. Same user, different
     boards -- not a privacy leak, but the memo would otherwise hand back a symbol from a board
     this lookup did not search. Included so every term added to the key is falsifiable. */
  test('the same user searching different boards is not served the previous board\'s symbol', function(assert) {
    assert.expect(2);
    const done = assert.async();

    speaking_as('student-a');
    word_suggestions.lookup({ word_in_progress: 'th', board_ids: ['board-a'] })
      .then(settle)
      .then(function(list) {
        var a_word = found(list) || {};
        assert.strictEqual(a_word.original_image, A_SYMBOL, 'precondition: board A supplies its symbol');
        return word_suggestions.lookup({ word_in_progress: 'th', board_ids: ['board-b'] });
      })
      .then(settle)
      .then(function(list) {
        var b_word = found(list) || {};
        assert.strictEqual(b_word.original_image, B_SYMBOL,
          'changing the searched set forces a recompute for the same user');
        done();
      }, function(e) { assert.ok(false, 'rejected: ' + e); assert.ok(false, 'rejected'); done(); });
  });

  /* CONTROL. Without this, the weakest implementation that passes the test above is "never
     memoise", which would put a buttonset walk on every keystroke -- a different harm, not a
     fix. On a memo HIT the board_ids loop at :834-840 does not run at all (it sits inside the
     cache-miss branch that :849's else closes), so counting loads is a faithful hit detector. */
  test('an identical lookup for the SAME communicator still hits the memo', function(assert) {
    assert.expect(2);
    const done = assert.async();
    var loads = this.loads;

    speaking_as('student-a');
    word_suggestions.lookup({ word_in_progress: 'th', board_ids: ['board-a'] })
      .then(settle)
      .then(function() {
        assert.strictEqual(loads.length, 1, 'precondition: the first lookup walks the board set');
        return word_suggestions.lookup({ word_in_progress: 'th', board_ids: ['board-a'] });
      })
      .then(settle)
      .then(function() {
        assert.strictEqual(loads.length, 1,
          'nothing changed, so the second lookup is served from the memo without re-walking');
        done();
      }, function(e) { assert.ok(false, 'rejected: ' + e); assert.ok(false, 'rejected'); done(); });
  });
});
