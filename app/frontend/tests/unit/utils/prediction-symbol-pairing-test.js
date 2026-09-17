import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';
import RSVP from 'rsvp';
import EmberObject from '@ember/object';
import { A } from '@ember/array';
import word_suggestions from 'frontend/utils/word_suggestions';
import LingoLinq from 'frontend/app';
import BoardDetailController from 'frontend/controllers/user/board-detail';
import editManager from 'frontend/utils/edit_manager';

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

  /* In-grid :suggestion slots are painted with the guessed word as their label.
     Matching them in _find_local_image_for_label would skip the real vocabulary
     button for the same word (or return nothing), so a word like "can" showed
     its PCS on the rail and as a chip but as text-only in the slot. */
  test('local image lookup skips in-grid prediction slots', function(assert) {
    assert.expect(2);
    const c = BoardDetailController.create({
      app_state: svc(), stashes: svc(), persistence: svc(), router: svc(), appState: svc()
    });
    c.set('ordered_buttons', [[
      { id: 's1', label: 'can', suggestion_slot: true },
      { id: 'c1', label: 'can', image_url: 'https://example.test/can.png' }
    ]]);
    assert.strictEqual(c._find_local_image_for_label('can'), 'https://example.test/can.png');
    c.set('ordered_buttons', [[{ id: 's1', label: 'need', suggestion_slot: true }]]);
    assert.strictEqual(c._find_local_image_for_label('need'), null);
    c.destroy();
  });

  test('a rail-resolved symbol is copied onto the matching in-grid slot', function(assert) {
    assert.expect(3);
    const c = BoardDetailController.create({
      app_state: svc(), stashes: svc(), persistence: svc(), router: svc(), appState: svc()
    });
    c.set('ordered_buttons', [[
      { id: 's1', label: 'can', suggestion_slot: true, text_symbol: true },
      { id: 'c1', label: 'can', image_url: 'https://example.test/can.png' },
      { id: 's2', label: 'need', suggestion_slot: true, text_symbol: true }
    ]]);
    assert.true(c._apply_suggestion_image_to_slots('can', 'https://example.test/can.png'));
    var flat = [].concat.apply([], c.get('ordered_buttons'));
    var can_slot = flat.find(function(b) { return b.id === 's1'; });
    var need_slot = flat.find(function(b) { return b.id === 's2'; });
    assert.strictEqual(can_slot.image_url, 'https://example.test/can.png');
    assert.strictEqual(need_slot.image_url, undefined,
      'only the slot offering the same word gets the picture');
    c.destroy();
  });

  /* Same :suggestion cell, new word. The grid keys cards by button id, so
     Glimmer keeps the <img>. If we only write a new image_url when one is
     already resolved, the previous word's PCS stays on screen (the "we"
     people on a slot that now reads "need"). */
  test('a slot drops the previous picture when its word changes and the new one is not ready', function(assert) {
    assert.expect(2);
    const c = BoardDetailController.create({
      app_state: svc(), stashes: svc(), persistence: svc(), router: svc(), appState: svc()
    });
    var we = {
      id: 's1', label: 'we', suggestion_slot: true,
      image_url: 'https://example.test/we.png',
      suggestion_image_word: 'we', text_symbol: false
    };
    var next = c._paint_suggestion_slot(we, 'need', null);
    assert.strictEqual(next.label, 'need');
    assert.notStrictEqual(next.image_url, 'https://example.test/we.png',
      'stale PCS must not stay on the new word, got: ' + next.image_url);
    c.destroy();
  });

  test('a slot keeps its picture when the same word is painted again without a new url', function(assert) {
    assert.expect(1);
    const c = BoardDetailController.create({
      app_state: svc(), stashes: svc(), persistence: svc(), router: svc(), appState: svc()
    });
    var can = {
      id: 's1', label: 'can', suggestion_slot: true,
      image_url: 'https://example.test/can.png',
      suggestion_image_word: 'can', text_symbol: false
    };
    var next = c._paint_suggestion_slot(can, 'can', null);
    assert.strictEqual(next.image_url, 'https://example.test/can.png');
    c.destroy();
  });

  test('a slot swaps to the new picture when the word and url both change', function(assert) {
    assert.expect(3);
    const c = BoardDetailController.create({
      app_state: svc(), stashes: svc(), persistence: svc(), router: svc(), appState: svc()
    });
    var we = {
      id: 's1', label: 'we', suggestion_slot: true,
      image_url: 'https://example.test/we.png',
      suggestion_image_word: 'we', text_symbol: false
    };
    var next = c._paint_suggestion_slot(we, 'need', 'https://example.test/need.png');
    assert.strictEqual(next.label, 'need');
    assert.strictEqual(next.image_url, 'https://example.test/need.png');
    assert.strictEqual(next.suggestion_image_word, 'need');
    c.destroy();
  });

  /* "you" is on the board and shows its PCS when tapped, but the in-grid
     slot stayed blank. Two gaps: the rail item already had the url before
     the slot's label became "you", and the display copy can lack image_url
     while raw.image_urls still has the symbol the grid click uses. */
  test('a slot picks up a rail-resolved picture after its label becomes that word', function(assert) {
    assert.expect(1);
    const c = BoardDetailController.create({
      app_state: svc(), stashes: svc(), persistence: svc(), router: svc(), appState: svc()
    });
    c.set('ordered_buttons', [[{
      id: 's1', label: 'you', suggestion_slot: true, text_symbol: true
    }]]);
    c.set('suggestions', { ready: true, list: [
      { word: 'you', image: 'https://example.test/you.png' }
    ]});
    c._repaint_slots_from_suggestion_list();
    var slot = c.get('ordered_buttons')[0][0];
    assert.strictEqual(slot.image_url, 'https://example.test/you.png');
    c.destroy();
  });

  test('local image lookup reads the board image_urls map when the display copy has no url', function(assert) {
    assert.expect(1);
    const c = BoardDetailController.create({
      app_state: svc(), stashes: svc(), persistence: svc(), router: svc(), appState: svc()
    });
    c.set('ordered_buttons', [[
      { id: 's1', label: 'you', suggestion_slot: true },
      { id: 'y1', label: 'you' }
    ]]);
    c._last_raw = {
      buttons: [{ id: 'y1', label: 'you', image_id: 'img-you' }],
      image_urls: { 'img-you': 'https://example.test/you.png' }
    };
    assert.strictEqual(c._find_local_image_for_label('you'), 'https://example.test/you.png');
    c.destroy();
  });

  test('suggestion image cache uses a speak-bar chip already shown for that word', function(assert) {
    assert.expect(1);
    const c = BoardDetailController.create({
      app_state: svc(), stashes: svc(), persistence: svc(), router: svc(), appState: svc()
    });
    c._suggestion_lookup_board_ids = function() { return []; };
    c._find_local_image_for_label = function() { return null; };
    c.set('sentence_parts', [
      { label: 'you', image_url: 'https://example.test/you.png' }
    ]);
    assert.strictEqual(c._cached_image_for_label('you'), 'https://example.test/you.png');
    c.destroy();
  });

  test('decorate paints from the chip cache without walking button sets', function(assert) {
    assert.expect(2);
    var asked = 0;
    word_suggestions.attach_image_for_label = function() {
      asked += 1;
      return RSVP.resolve(null);
    };
    const c = BoardDetailController.create({
      app_state: svc(), stashes: svc(), persistence: svc(), router: svc(), appState: svc()
    });
    c._suggestion_lookup_board_ids = function() { return []; };
    c._find_local_image_for_label = function() { return null; };
    c._resolved_label_images = { 'l:you': 'https://example.test/you.png' };
    var list = [{ word: 'you' }];
    c._decorate_suggestion_images(list);
    assert.strictEqual(list[0].image, 'https://example.test/you.png');
    assert.strictEqual(asked, 0, 'must not start attach_image when the chip cache already has the PCS');
    c.destroy();
  });

  /* A tapped board button is stored as b:<id>, not l:<word>
     (_chip_image_key). The "to" prediction stayed on square.svg while the
     speak-bar chip already showed the PCS, because cache lookup only read l:. */
  test('suggestion image cache finds a tapped board-button chip by its word', function(assert) {
    assert.expect(1);
    const c = BoardDetailController.create({
      app_state: svc(), stashes: svc(), persistence: svc(), router: svc(), appState: svc()
    });
    c._suggestion_lookup_board_ids = function() { return []; };
    c._find_local_image_for_label = function() { return null; };
    c._apply_sentence_chip_image(
      { id: '846', label: 'to', raw_index: 0 },
      'https://example.test/to.svg'
    );
    c.set('sentence_parts', []);
    assert.strictEqual(c._cached_image_for_label('to'), 'https://example.test/to.svg');
    c.destroy();
  });

  test('a late chip image replaces square.svg on the matching prediction', function(assert) {
    assert.expect(1);
    const c = BoardDetailController.create({
      app_state: svc(), stashes: svc(), persistence: svc(), router: svc(), appState: svc()
    });
    c._suggestion_lookup_board_ids = function() { return []; };
    c._find_local_image_for_label = function() { return null; };
    c.set('suggestions', { ready: true, list: [{ word: 'to', image: '/images/square.svg' }] });
    c._apply_sentence_chip_image(
      { id: '846', label: 'to', raw_index: 0 },
      'https://example.test/to.svg'
    );
    assert.strictEqual(c.get('suggestions.list')[0].image, 'https://example.test/to.svg');
    c.destroy();
  });

  /* lookup() stamps square.svg on every suggestion. update_suggestion_button
     then hid .symbol imgs when resolve_word_image was null. Board-detail
     cards use those classes, so a later refresh hid the PCS Ember had just
     paired for on-board words (want, like, to) and left a white square. */
  test('a board-detail slot keeps its picture when lookup only has the placeholder', function(assert) {
    assert.expect(2);
    var boardEl = document.createElement('div');
    boardEl.className = 'board';
    boardEl.setAttribute('data-id', '1_1');
    var btnEl = document.createElement('div');
    btnEl.className = 'button md-board-detail-symbol-card';
    btnEl.setAttribute('data-id', 's1');
    var img = document.createElement('img');
    img.className = 'symbol';
    img.src = 'https://example.test/to.svg';
    btnEl.appendChild(img);
    var lbl = document.createElement('span');
    lbl.className = 'md-board-detail-symbol-card__label';
    lbl.innerText = 'to';
    btnEl.appendChild(lbl);
    boardEl.appendChild(btnEl);
    document.body.appendChild(boardEl);

    var c = BoardDetailController.create({
      app_state: EmberObject.create({ speak_mode: true }),
      stashes: svc(), persistence: svc(), router: svc(),
      appState: EmberObject.create({ speak_mode: true })
    });
    var prev = editManager.controller;
    editManager.controller = c;
    var board = LingoLinq.store.createRecord('board', { id: '1_1' });
    board.set('appState', EmberObject.create({ speak_mode: true }));
    board._sync_ordered_button_suggestion = function() {};
    board.update_suggestion_button({ id: 's1' }, {
      word: 'to',
      image: '/images/square.svg'
    });
    assert.notStrictEqual(img.style.display, 'none',
      'placeholder lookup must not hide the Ember-paired PCS');
    assert.notStrictEqual((img.getAttribute('src') || img.src || '').indexOf('to.svg'), -1);
    editManager.controller = prev;
    document.body.removeChild(boardEl);
    board.unloadRecord();
    c.destroy();
  });

  test('suggestion image cache reads a spoken button_list image for that word', function(assert) {
    assert.expect(1);
    const c = BoardDetailController.create({
      app_state: EmberObject.create({
        button_list: [{ label: 'to', image: 'https://example.test/to.svg' }]
      }),
      stashes: svc(), persistence: svc(), router: svc(), appState: svc()
    });
    c._suggestion_lookup_board_ids = function() { return []; };
    c._find_local_image_for_label = function() { return null; };
    c.set('sentence_parts', []);
    assert.strictEqual(c._cached_image_for_label('to'), 'https://example.test/to.svg');
    c.destroy();
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

/* Placement: 'Best fit for the screen' (auto) was removed — it varied placement by viewport,
   which read as the setting doing nothing — and replaced by 'Below speak bar', a horizontal
   panel under the speak bar spanning the board buttons' width. */
module('Unit | Controller | prediction placement', function(hooks) {
  setupTest(hooks);

  /* current_grid and prediction_suggestions are computeds on the controller, so they cannot be
     overridden at create() — Ember asserts. Override them at extend() instead. */
  function controller(pos, cols, list) {
    return BoardDetailController.extend({
      current_grid: EmberObject.create({ columns: cols || 8, rows: 5 }),
      prediction_suggestions: list || []
    }).create({
      app_state: EmberObject.create({
        referenced_user: EmberObject.create({ preferences: { word_suggestion_position: pos } })
      }),
      stashes: svc(), persistence: svc(), router: svc(), appState: svc()
    });
  }

  test('below_bar is offered and auto is gone', function(assert) {
    assert.expect(3);
    const c = controller('side_rail');
    const ids = (c.get('word_prediction_position_options') || []).map(function(o) { return o.id; });
    assert.notStrictEqual(ids.indexOf('below_bar'), -1, 'the new placement is selectable');
    assert.strictEqual(ids.indexOf('auto'), -1, 'the removed placement is not');
    assert.strictEqual(ids.length, 3, 'three placements: speak bar, below bar, side rail');
    c.destroy();
  });

  test('each placement pins its own shell class', function(assert) {
    assert.expect(3);
    ['speak_bar|md-shell--wordpred-speak-bar',
     'below_bar|md-shell--wordpred-below-bar',
     'side_rail|md-shell--wordpred-side-rail'].forEach(function(pair) {
      const parts = pair.split('|');
      const c = controller(parts[0]);
      assert.strictEqual(c.get('word_suggestion_position_class'), parts[1], parts[0] + ' pins its class');
      c.destroy();
    });
  });

  test('a stored auto falls back to the default rather than an option that no longer exists', function(assert) {
    assert.expect(2);
    const c = controller('auto');
    assert.strictEqual(c.get('word_suggestion_position_value'), 'side_rail',
      'the dropdown shows a placement that still exists');
    assert.strictEqual(c.get('word_suggestion_position_class'), 'md-shell--wordpred-side-rail',
      'and the layout agrees with it');
    c.destroy();
  });

  test('the below-bar empty state reserves width for its message', function(assert) {
    assert.expect(3);
    /* Ghosts sit to the RIGHT of the glyph + copy in this panel (the rail stacks them below
       instead), so two columns are given back to the message. Floored at 1 so a narrow board
       still shows the affordance rather than an empty bar. */
    const wide = controller('below_bar', 8);
    assert.strictEqual(wide.get('prediction_below_ghost_slots').length, 6,
      'an 8-column board shows 6 ghosts, leaving 2 columns for the message');
    wide.destroy();
    const narrow = controller('below_bar', 2);
    assert.strictEqual(narrow.get('prediction_below_ghost_slots').length, 1,
      'a 2-column board still shows one ghost rather than none');
    narrow.destroy();
    const huge = controller('below_bar', 20);
    assert.strictEqual(huge.get('prediction_below_ghost_slots').length, 6,
      'and never exceeds the 8-column cap the tiles use');
    huge.destroy();
  });

  test('the below-bar panel is capped to the board COLUMN count, not its rows', function(assert) {
    assert.expect(2);
    const eight = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(function(w) { return { word: w }; });
    const c = controller('below_bar', 4, eight);
    assert.strictEqual(c.get('prediction_below_suggestions').length, 4,
      'a 4-column board shows 4 tiles — the panel has a fixed height, so a second row would be clipped');
    c.set('current_grid', EmberObject.create({ columns: 12, rows: 5 }));
    assert.strictEqual(c.get('prediction_below_suggestions').length, 8,
      'and never more than the server cap of 8');
    c.destroy();
  });
});
