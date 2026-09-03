import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';
import RSVP from 'rsvp';
import EmberObject from '@ember/object';
import { A } from '@ember/array';
import word_suggestions from 'frontend/utils/word_suggestions';
import LingoLinq from 'frontend/app';
import BoardDetailController from 'frontend/controllers/user/board-detail';

function svc() {
  return EmberObject.create({
    get: function() { return null; }, set: function() { return null; },
    addObserver: function() {}, removeObserver: function() {}
  });
}

/* A PREDICTED WORD MUST NEVER SHOW A WHITE SQUARE.

   `lookup()` stamps the VISIBLE placeholder (images/square.svg — an opaque teal circle and
   blue mountains) on every word with no symbol. It then walks the user's button sets looking
   for a real symbol to pair with each word.

   `LingoLinq.Buttonset.fix_image` always leaves `button.image` truthy: it stamps
   images/blank.gif whenever the matching store record has an empty `best_url`, or the server
   sent no url at all (models/buttonset.js:1226, board_downstream_button_set.rb:590).
   blank.gif is a 1x1 OPAQUE WHITE gif. The rail paints a prediction image full-bleed with
   `object-fit: contain` (app.scss:74432-74459), and every placeholder style in app.scss is
   keyed [src$="square.svg"], so blank.gif is styled by none of them and scales into a solid
   white square with no artwork.

   So the pairing step could REPLACE a good visible placeholder with an invisible white one —
   and, being a microtask that lands after lookup() has already resolved, it could also clobber
   a symbol that had resolved correctly a moment earlier. */
module('Unit | Utility | prediction symbol pairing', function(hooks) {
  /* lookup() calls appState.get('shift') unguarded (word_suggestions.js:434), so the app-state
     proxy has to be resolved — a bare unit module gets "appState.get is not a function".
     setupTest comes from tests/helpers, NOT ember-qunit: the repo wrapper passes
     waitForSettled:false, without which a booted app with stubbed persistence leaves orphan
     RSVP work and afterEach hangs. */
  setupTest(hooks);

  hooks.beforeEach(function() {
    this._orig = {
      ngrams: word_suggestions.ngrams,
      fallback: word_suggestions.fallback_url,
      fix_image: LingoLinq.Buttonset.fix_image,
      sets: word_suggestions.button_sets_for_board_ids,
      load_set: LingoLinq.Buttonset.load_button_set,
      attach: word_suggestions.attach_image_for_label
    };
    /* lookup() short-circuits on its own memo state; the suite's other lookup tests clear the
       same set of fields before every call (tests/utils/word_suggestions-test.js:29-36). */
    word_suggestions.last_finished_word = null;
    word_suggestions.last_result = null;
    word_suggestions.word_in_progress = null;
    word_suggestions.last_time_bucket = null;
    word_suggestions.last_topic_context = null;
    word_suggestions.last_locale = null;
    word_suggestions.fallback_url_result = null;
    word_suggestions.ngrams = { '': [['they', -1.0]] };
    word_suggestions.fallback_url = function() { return RSVP.resolve('/images/square.svg'); };
  });
  hooks.afterEach(function() {
    word_suggestions.ngrams = this._orig.ngrams;
    word_suggestions.fallback_url = this._orig.fallback;
    LingoLinq.Buttonset.fix_image = this._orig.fix_image;
    word_suggestions.button_sets_for_board_ids = this._orig.sets;
    LingoLinq.Buttonset.load_button_set = this._orig.load_set;
    word_suggestions.attach_image_for_label = this._orig.attach;
  });

  // A set whose matching button carries an image_id but whose image cannot be resolved — the
  // shape that makes fix_image fall through to blank.gif.
  function set_with_symbolless_button(depth) {
    var button = { label: 'they', vocalization: 'they', image_id: 'i1', depth: depth };
    return {
      button: button,
      get: function(key) { return key === 'id' || key === 'global_id' ? '1_99' : null; },
      redepth: function() { return [button]; }
    };
  }

  function found(list) {
    return (list || []).find(function(w) { return (w.word || '').toLowerCase() === 'they'; });
  }

  test('a button with no resolvable symbol never replaces the placeholder with a white one', function(assert) {
    assert.expect(2);
    const done = assert.async();
    LingoLinq.Buttonset.fix_image = function(button) {
      button.image = '/images/blank.gif';
      return RSVP.resolve();
    };

    word_suggestions.lookup({ word_in_progress: 'th', button_sets: [set_with_symbolless_button(0)] })
      .then(function(list) {
        // fix_image's continuation is a microtask that lands AFTER lookup resolves, so let it run.
        return RSVP.resolve().then(function() { return RSVP.resolve().then(function() { return list; }); });
      })
      .then(function(list) {
        const word = found(list) || {};
        assert.notStrictEqual(word.image, '/images/blank.gif',
          'a 1x1 opaque white gif must never become a predicted word\'s symbol, got: ' + word.image);
        assert.strictEqual(word.image, '/images/square.svg',
          'the visible placeholder stays put');
        done();
      });
  });

  /* "The placeholder shows on every word, even ones that exist on the parent board."
     A buttonset spans its root board's whole downstream tree, so the symbol IS in the payload.
     But `redepth` matches on the buttons' GLOBAL board id, while a set loaded by board key has
     that KEY as its record id (serializers/application.js:100-108 parks the real id on
     `_actual_id`). lookup_board_ids pushes sidebar board keys, so those sets were redepthed from
     an id no button carries — returning [], and contributing zero symbols for every board in them.
     Uses a REAL buttonset record and the REAL redepth: a stubbed redepth keyed on the id it is
     handed would assert the conclusion by construction. */
  test('a button set loaded by board key still pairs a symbol from its sub-board', function(assert) {
    assert.expect(2);
    const store = this.owner.lookup('service:store');
    const bs = store.createRecord('buttonset', {
      id: 'example/keyboard',
      _actual_id: '1_99',
      buttons: [
        // root board of the set, linking down to a sub-board
        { label: 'people', board_id: '1_99', linked_board_id: '1_77' },
        // the symbol we are after lives on the SUB-board
        { label: 'they', board_id: '1_77', image_id: 'i1' }
      ]
    });

    assert.strictEqual(bs.get('global_id'), '1_99',
      'the record id is the key; global_id resolves the real one');
    const best = word_suggestions._best_exact_button_for_label('they', [bs]) || {};
    assert.strictEqual(best.label, 'they',
      'the sub-board symbol is found rather than the whole set being skipped');
  });

  /* "On the parent board the predictions show; in a sub-board the images are lost."
     The symbol search is board-INDEPENDENT — every redepth roots at the button SET, never at
     the current board — so a word that resolves through the sets resolves the same everywhere.
     What differs per board is `_find_local_image_for_label`, which reads the CURRENT board's
     rendered buttons and so MASKS a broken set lookup while the word happens to be on screen.
     Step into a sub-board and the mask is gone.
     The broken part: only the SHALLOWEST match was ever tried. `image_id` is just a promise of
     a symbol — the server sends `image: nil` when it cannot resolve one — so one symbol-less
     duplicate near the top of the tree permanently shadowed the real symbol below it. */
  test('a symbol-less duplicate does not shadow a real symbol deeper in the tree', function(assert) {
    assert.expect(2);
    const done = assert.async();
    const store = this.owner.lookup('service:store');
    const bs = store.createRecord('buttonset', {
      id: '1_99',
      buttons: [
        // Shallow duplicate: carries an image_id, but nothing resolves it to a url.
        { label: 'feel', board_id: '1_99', image_id: 'unresolvable', linked_board_id: '1_77' },
        // The real symbol, one board deeper.
        { label: 'feel', board_id: '1_77', image_id: 'i2', image: 'data:image/png;base64,GOOD' }
      ]
    });
    word_suggestions.button_sets_for_board_ids = function() { return [bs]; };
    LingoLinq.Buttonset.fix_image = function(button) {
      if(!button.image) { button.image = '/images/blank.gif'; }
      return RSVP.resolve();
    };

    var delivered = null;
    word_suggestions.attach_image_for_label('feel', ['1_99'], function(url) { delivered = url; }, {})
      .then(function(url) {
        assert.strictEqual(delivered, 'data:image/png;base64,GOOD',
          'the deeper real symbol is delivered rather than abandoned, got: ' + delivered);
        assert.strictEqual(url, 'data:image/png;base64,GOOD',
          'and returned, so callers reading the return value get a symbol not a placeholder');
        done();
      });
  });

  /* The reason a word whose symbol is on the PARENT board still showed the placeholder in a
     sub-board. button_sets_for_board_ids admits a record on `root_url` alone — "this set
     exists", not "this set is usable". Treating that as coverage marked its own id satisfied,
     so it never appeared in `missing`, load_button_set was never called, and redepth over its
     empty button array returned [] forever. The word could then only ever resolve from the
     board currently on screen. */
  test('a button set that exists but has no buttons is loaded, not treated as covered', function(assert) {
    assert.expect(2);
    const done = assert.async();
    const requested = [];
    const shell_only = EmberObject.create({
      id: '1_99', key: 'example/core', root_url: 'https://example.test/set.json', buttons: []
    });
    word_suggestions.button_sets_for_board_ids = function() { return [shell_only]; };
    LingoLinq.Buttonset.load_button_set = function(id) {
      requested.push(id);
      return RSVP.resolve(shell_only);
    };

    word_suggestions.load_vocabulary_button_sets(null, null, ['1_99']).then(function() {
      assert.strictEqual(requested.length, 1,
        'the empty set must be fetched rather than counted as already warm, got ' + requested.length + ' fetches');
      assert.strictEqual(requested[0], '1_99',
        'and fetched by the id that was asked for');
      done();
    });
  });

  /* THE LONG-TERM ONE. A miss is remembered against a signature of the warm button sets, so a
     word with genuinely no symbol is asked for once rather than on every keystroke. That
     signature used to be the COUNT of sets — but a set is admitted on `root_url` alone, so it
     goes from "zero buttons" to "fully loaded" WITHOUT the count changing. A miss recorded
     while the buttons were still downloading was therefore never retried, even though the
     symbol had just arrived, and the word stayed bare for the rest of the session. Which words
     that hit was pure timing, which is why the symptom looked arbitrary. */
  test('a miss recorded before the buttons arrived is retried once they do', function(assert) {
    assert.expect(2);
    const asked = [];
    const shell = EmberObject.create({ id: '1_99', root_url: 'https://example.test/s.json', buttons: [] });
    const loaded = EmberObject.create({
      id: '1_99', root_url: 'https://example.test/s.json',
      buttons: [{ label: 'you', board_id: '1_99', image_id: 'i1' }]
    });
    word_suggestions.attach_image_for_label = function(word) {
      asked.push(word);
      return RSVP.resolve(null); // a miss: the callback never fires
    };
    const c = BoardDetailController.create({
      app_state: svc(), stashes: svc(), persistence: svc(), router: svc(), appState: svc(),
      _suggestion_lookup_board_ids: function() { return ['1_99']; },
      _find_local_image_for_label: function() { return null; },
      _republish_suggestion_list: function() {}
    });

    // First pass: the set exists but has no buttons yet.
    word_suggestions.button_sets_for_board_ids = function() { return [shell]; };
    c._decorate_suggestion_images([{ word: 'you', image: '/images/square.svg' }]);
    assert.strictEqual(asked.length, 1, 'asked once while the set was still empty');

    // The buttons arrive. Same number of sets — only the DATA changed.
    word_suggestions.button_sets_for_board_ids = function() { return [loaded]; };
    c._decorate_suggestion_images([{ word: 'you', image: '/images/square.svg' }]);
    assert.strictEqual(asked.length, 2,
      'and asked again once the buttons landed, rather than latching the miss for the session');
    c.destroy();
  });

  /* The other half of "the placeholder is showing on words that DO have symbols": the button is
     found, but fix_image throws its url away. peekAll('image') surfaces records that are in the
     store without being materialized, whose best_url is '' — and that empty string was being
     assigned straight over the server-supplied url, then stamped to blank.gif. */
  test('an unmaterialized image record does not throw away the symbol the server supplied', function(assert) {
    assert.expect(2);
    var button = { label: 'they', image_id: 'i1', image: 'data:image/png;base64,AAAA' };
    var in_flight = EmberObject.create({ id: 'i1', best_url: '', license: null, hc: false });

    LingoLinq.Buttonset.fix_image(button, A([in_flight]));

    assert.notStrictEqual(button.image, '/images/blank.gif',
      'an in-flight image record must not turn a real symbol into the white placeholder, got: ' + button.image);
    assert.strictEqual(button.image, 'data:image/png;base64,AAAA',
      'the url the server already supplied is kept');
  });

  test('and the word gives back its depth claim, so a deeper real symbol can still win', function(assert) {
    assert.expect(1);
    const done = assert.async();
    LingoLinq.Buttonset.fix_image = function(button) {
      button.image = '/images/blank.gif';
      return RSVP.resolve();
    };

    /* The depth claim is staked BEFORE fix_image resolves, to de-dupe in-flight work. If it is
       not given back when the button turns out to have no symbol, `button.depth < word.depth`
       rejects every deeper button afterwards — so the word stays bare even though its symbol
       exists further down the tree, which is exactly the "search all sub-boards" requirement. */
    word_suggestions.lookup({ word_in_progress: 'th', button_sets: [set_with_symbolless_button(0)] })
      .then(function(list) {
        return RSVP.resolve().then(function() { return RSVP.resolve().then(function() { return list; }); });
      })
      .then(function(list) {
        const word = found(list) || {};
        assert.notStrictEqual(word.depth, 0,
          'the symbol-less button must not keep the depth claim, got: ' + word.depth);
        done();
      });
  });
});

/* The yes/no board is a two-choice board. Word prediction on it offers OTHER words, which
   defeats the only thing it exists to do — and for someone using it to give a binary answer,
   extra choices are worse than no help at all. The override is board-level and beats the
   user's preference, but must not TOUCH that preference: prediction has to come back by
   itself on the next board. */
module('Unit | Controller | prediction suppressed on yes/no', function(hooks) {
  setupTest(hooks);

  function controller(key, pref) {
    return BoardDetailController.create({
      app_state: EmberObject.create({
        referenced_user: EmberObject.create({ preferences: { word_suggestions: pref } })
      }),
      stashes: svc(), persistence: svc(), router: svc(), appState: svc(),
      model: EmberObject.create({ key: key })
    });
  }

  test('prediction is suppressed on the yes/no board even with the preference on', function(assert) {
    assert.expect(2);
    const c = controller('someone/yesno', true);
    assert.true(c.get('is_yes_no_board'),
      'matched on the key slug, so a user copy counts too');
    assert.false(c.get('show_word_suggestions'),
      'no predictions on a two-choice board');
    c.destroy();
  });

  test('and the underlying preference is untouched, so it returns on the next board', function(assert) {
    assert.expect(2);
    const yes_no = controller('someone/yesno', true);
    assert.true(yes_no.get('word_suggestions_enabled'),
      'the Board Settings toggle still reflects what the user actually chose');
    yes_no.destroy();

    const other = controller('someone/core-24', true);
    assert.true(other.get('show_word_suggestions'),
      'prediction comes back by itself on any other board');
    other.destroy();
  });
});
