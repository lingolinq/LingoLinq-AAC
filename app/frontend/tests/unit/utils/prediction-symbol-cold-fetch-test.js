import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { A } from '@ember/array';
import RSVP from 'rsvp';
import word_suggestions from 'frontend/utils/word_suggestions';
import LingoLinq from 'frontend/app';

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

function speaking_user(global_id) {
  return EmberObject.create({
    get: function(key) {
      if(key === 'referenced_user.global_id') { return global_id; }
      return null;
    }
  });
}

const SYMBOL = 'https://example.test/mom.png';

/* THE COLD PATH: the lookup that TRIGGERS a fetch must be able to use what it fetched.
   `load_vocabulary_button_sets` asks `load_button_set` for every board id it could not cover
   from memory, then returns `warmed.concat(loaded || [])`. The intent is plain. But it awaits
   them with `RSVP.all_wait`, which resolves with NO VALUE (utils/misc.js:147-173 -- both
   `resolve()` calls are bare), so `loaded` is always `undefined`, the concat adds nothing, and
   the function returns only the sets that were ALREADY resident. The board it just fetched --
   the whole reason the fetch happened -- is absent from its own result. */
module('Unit | Utility | prediction symbols from a freshly fetched board', function(hooks) {
  hooks.beforeEach(function() {
    this._o = {
      lookup: word_suggestions.lookup,
      store: LingoLinq.store,
      fix: LingoLinq.Buttonset && LingoLinq.Buttonset.fix_image,
      load_set: LingoLinq.Buttonset && LingoLinq.Buttonset.load_button_set
    };
    word_suggestions._reset_scoped_sets();
    /* Kill the generic-word tail so a delivered url can only have come from a button set. */
    word_suggestions.lookup = function() { return RSVP.resolve([]); };
    if(LingoLinq.Buttonset) { LingoLinq.Buttonset.fix_image = function() { return RSVP.resolve(); }; }
  });
  hooks.afterEach(function() {
    word_suggestions._reset_scoped_sets();
    word_suggestions.lookup = this._o.lookup;
    LingoLinq.store = this._o.store;
    if(LingoLinq.Buttonset && this._o.fix) { LingoLinq.Buttonset.fix_image = this._o.fix; }
    if(LingoLinq.Buttonset && this._o.load_set) { LingoLinq.Buttonset.load_button_set = this._o.load_set; }
  });

  /* Nothing resident; the requested board must be fetched. The fetch SUCCEEDS and the set
     carries the symbol, so there is no reason for the caller to come away empty. */
  function cold_fetch_of(fetched) {
    LingoLinq.store = {
      peekAll: function(type) { return type === 'buttonset' ? A([]) : A([]); },
      peekRecord: function() { return null; }
    };
    LingoLinq.Buttonset.load_button_set = function() {
      /* The real loader puts the record in the store as well as resolving it. */
      LingoLinq.store = {
        peekAll: function(type) { return type === 'buttonset' ? A([fetched]) : A([]); },
        peekRecord: function(type, id) {
          return (type === 'buttonset' && id === 'target-board') ? fetched : null;
        }
      };
      return RSVP.resolve(fetched);
    };
  }

  test('the loader returns the set it just fetched', function(assert) {
    assert.expect(1);
    const done = assert.async();
    const fetched = buttonSet('target-board', [
      { label: 'mom', image_id: 'img-1', image: SYMBOL, depth: 0 }
    ]);
    cold_fetch_of(fetched);

    word_suggestions.load_vocabulary_button_sets(speaking_user('u1'), null, ['target-board'])
      .then(function(sets) {
        assert.deepEqual((sets || []).map(function(s) { return s.get('id'); }), ['target-board'],
          'a board fetched to satisfy this call is part of what the call returns');
        done();
      }, function(e) { assert.ok(false, 'loader rejected: ' + e); done(); });
  });

  test('a symbol on a freshly fetched board is paired with the word that triggered the fetch', function(assert) {
    assert.expect(1);
    const done = assert.async();
    const fetched = buttonSet('target-board', [
      { label: 'mom', image_id: 'img-1', image: SYMBOL, depth: 0 }
    ]);
    cold_fetch_of(fetched);

    let delivered = null;
    word_suggestions.attach_image_for_label('mom', ['target-board'], function(url) {
      delivered = url;
    }, { appState: speaking_user('u1') }).then(function() {
      assert.strictEqual(delivered, SYMBOL,
        'the word that caused the fetch gets the symbol the fetch returned');
      done();
    }, function(e) { assert.ok(false, 'lookup rejected: ' + e); done(); });
  });

  /* THE ARM THAT PINS THE CONCAT. Without this, the weakest passing implementation of the two
     tests above is `return RSVP.resolve(loaded)` -- discarding `warmed` altogether -- because
     `warmed` is empty in both. The existing prediction-symbol tests cannot catch that either:
     with everything already resident they satisfy `covered` and take the EARLY return, never
     reaching the async branch at all.
     Order is asserted, not just membership: _exact_button_candidates_for_label sorts by depth
     only (:1499) and Array#sort is stable, so array order is the tie-break between two
     equal-depth matches -- i.e. it decides which symbol the user sees. */
  test('the loader returns the resident sets AND the fetched one, resident first', function(assert) {
    assert.expect(1);
    const done = assert.async();
    const warm = buttonSet('warm-board', [
      { label: 'mom', image_id: 'img-w', image: 'https://example.test/warm.png', depth: 0 }
    ]);
    const fetched = buttonSet('target-board', [
      { label: 'mom', image_id: 'img-1', image: SYMBOL, depth: 0 }
    ]);
    /* `warm-board` is resident and carries buttons, so it is `covered` and is NOT re-fetched;
       `target-board` is missing, so the loader takes the async branch for it alone. */
    LingoLinq.store = {
      peekAll: function(type) { return type === 'buttonset' ? A([warm]) : A([]); },
      peekRecord: function(type, id) {
        return (type === 'buttonset' && id === 'warm-board') ? warm : null;
      }
    };
    LingoLinq.Buttonset.load_button_set = function() {
      LingoLinq.store = {
        peekAll: function(type) { return type === 'buttonset' ? A([warm, fetched]) : A([]); },
        peekRecord: function(type, id) {
          if(type !== 'buttonset') { return null; }
          return id === 'warm-board' ? warm : (id === 'target-board' ? fetched : null);
        }
      };
      return RSVP.resolve(fetched);
    };

    word_suggestions.load_vocabulary_button_sets(speaking_user('u1'), null, ['warm-board', 'target-board'])
      .then(function(sets) {
        assert.deepEqual((sets || []).map(function(s) { return s.get('id'); }),
          ['warm-board', 'target-board'],
          'both the already-warm set and the freshly fetched one come back, in request order');
        done();
      }, function(e) { assert.ok(false, 'loader rejected: ' + e); done(); });
  });

  /* Pins the premise the fix's comment asserts: load_button_set genuinely rejects for ids
     matching /^b/ or /^i/ (models/buttonset.js:1261-1263), which real board KEYS beginning
     with "b" do, and lookup_board_ids pushes keys (:1358). So the per-promise error handler is
     load-bearing. The loader must neither reject nor leak a null into its result. */
  test('one failed fetch neither rejects the loader nor leaks a null into the result', function(assert) {
    assert.expect(1);
    const done = assert.async();
    const fetched = buttonSet('target-board', [
      { label: 'mom', image_id: 'img-1', image: SYMBOL, depth: 0 }
    ]);
    LingoLinq.store = {
      peekAll: function(type) { return type === 'buttonset' ? A([]) : A([]); },
      peekRecord: function() { return null; }
    };
    LingoLinq.Buttonset.load_button_set = function(id) {
      if(id === 'bad-board') { return RSVP.reject(); }
      LingoLinq.store = {
        peekAll: function(type) { return type === 'buttonset' ? A([fetched]) : A([]); },
        peekRecord: function(type, bid) {
          return (type === 'buttonset' && bid === 'target-board') ? fetched : null;
        }
      };
      return RSVP.resolve(fetched);
    };

    word_suggestions.load_vocabulary_button_sets(speaking_user('u1'), null, ['bad-board', 'target-board'])
      .then(function(sets) {
        assert.deepEqual((sets || []).map(function(s) { return s.get('id'); }), ['target-board'],
          'the successful fetch survives and the failed one contributes nothing');
        done();
      }, function(e) { assert.ok(false, 'loader rejected on a single failed fetch: ' + e); done(); });
  });
});
