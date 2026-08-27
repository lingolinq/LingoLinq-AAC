import { module, test } from 'qunit';
import {
  BOARD_CATEGORIES,
  DEFAULT_CATEGORY_ORDER,
  assign_columns,
  category_for_button,
  qwerty_positions,
  normalize_order,
  group_buttons,
  pack_category_tiles
} from 'frontend/utils/board_categories';

/**
 * Fitzgerald category grouping registry (flag: board_category_grouping).
 *
 * Asserts against the REAL exports, and deliberately needs no `setupTest`:
 * nothing here touches the container, and an unused harness is what made
 * eu-ai-parental-consent the suite's worst flake.
 */
module('Unit | Utility | board_categories', function() {
  // These three sweep the whole registry. Each collects mismatches and makes ONE
  // assertion rather than asserting inside the loop: a single deepEqual against []
  // names every offender at once instead of failing on the first, and keeps the
  // file clear of qunit/require-expect (which would otherwise be new lint debt).
  test('every category maps its declared types back to itself', function(assert) {
    var wrong = [];
    BOARD_CATEGORIES.forEach(function(cat) {
      cat.types.forEach(function(type) {
        var got = category_for_button({ part_of_speech: type });
        if(got !== cat.key) { wrong.push(type + ' -> ' + got + ' (expected ' + cat.key + ')'); }
      });
    });
    assert.deepEqual(wrong, [], 'every declared type resolves to its own category');
  });

  test('no part of speech is claimed by two categories', function(assert) {
    var seen = {};
    var clashes = [];
    BOARD_CATEGORIES.forEach(function(cat) {
      cat.types.forEach(function(type) {
        if(seen[type]) { clashes.push(type + ' in both ' + seen[type] + ' and ' + cat.key); }
        seen[type] = cat.key;
      });
    });
    assert.deepEqual(clashes, [], 'each part of speech belongs to exactly one category');
  });

  test('every category points at a --fitzgerald-* custom property, not a raw colour', function(assert) {
    var raw = [];
    BOARD_CATEGORIES.forEach(function(cat) {
      if(!/^--fitzgerald-/.test(cat.fillVar)) { raw.push(cat.key + '.fillVar=' + cat.fillVar); }
      if(!/^--fitzgerald-/.test(cat.textVar)) { raw.push(cat.key + '.textVar=' + cat.textVar); }
    });
    assert.deepEqual(raw, [], 'colours come from the shared Fitzgerald custom properties');
  });

  test('a button falls back through painted then suggested part of speech', function(assert) {
    assert.strictEqual(category_for_button({ part_of_speech: 'verb' }), 'actions');
    assert.strictEqual(category_for_button({ painted_part_of_speech: 'verb' }), 'actions');
    assert.strictEqual(category_for_button({ suggested_part_of_speech: 'verb' }), 'actions');
    // Explicit wins over painted — same precedence the grid's colour class uses.
    assert.strictEqual(
      category_for_button({ part_of_speech: 'noun', painted_part_of_speech: 'verb' }),
      'things'
    );
  });

  test('a special-action button is a control regardless of its part of speech', function(assert) {
    assert.strictEqual(category_for_button({ vocalization: ':clear' }), 'controls');
    assert.strictEqual(category_for_button({ vocalization: ':speak', part_of_speech: 'verb' }), 'controls');
    // A normal word starting with a letter is never a control.
    assert.strictEqual(category_for_button({ vocalization: 'clear', part_of_speech: 'verb' }), 'actions');
  });

  /*
   * Colour beats part_of_speech. check_for_parts_of_speech (utils/button.js:821)
   * only resolves part_of_speech in EDIT mode and only for buttons with no colour
   * yet, so in speak mode -- the only mode grouping renders in -- part_of_speech is
   * frequently a stale default 'noun'. Grouping by it filed pronouns, verbs,
   * prepositions and social words into Things while each button visibly rendered
   * its correct Fitzgerald colour. These pin the precedence that fixed it.
   */
  test('a curated background colour wins over a stale part_of_speech', function(assert) {
    // '#ffa' is the legacy three-digit pronoun yellow; '#FFFFAA' the six-digit form.
    assert.strictEqual(
      category_for_button({ background_color: '#ffa', part_of_speech: 'noun' }),
      'people',
      'yellow button files under People even though the data says noun'
    );
    assert.strictEqual(
      category_for_button({ background_color: '#CCFFAA', part_of_speech: 'noun' }),
      'actions',
      'green button files under Actions'
    );
  });

  test('social pink is not mistaken for preposition rose', function(assert) {
    // The LEGACY palette collapses both into one pink with types
    // ['preposition','social'], which would file every hello/goodbye under Places.
    // board_detail_keyed_colors separates them and must win.
    assert.strictEqual(category_for_button({ background_color: '#FFAACC' }), 'social');
    assert.strictEqual(category_for_button({ background_color: '#FFCCDD' }), 'places');
  });

  test('three- and six-digit hex forms of the same colour agree', function(assert) {
    var pairs = [['#ffa', '#FFFFAA'], ['#cfa', '#CCFFAA'], ['#fca', '#FFCCAA'], ['#acf', '#AACCFF']];
    var mismatched = [];
    pairs.forEach(function(p) {
      var short = category_for_button({ background_color: p[0] });
      var long = category_for_button({ background_color: p[1] });
      if(short !== long) { mismatched.push(p[0] + '=' + short + ' vs ' + p[1] + '=' + long); }
    });
    assert.deepEqual(mismatched, [], 'shorthand hex expands onto the same category');
  });

  /*
   * Buttons do NOT reliably store hex. edit_manager.js:2184 writes
   * tinycolor(...).toRgbString(), so 'rgb(255, 255, 170)' is a normal stored
   * value. Treating only hex as a colour dropped those to the part_of_speech
   * path and scattered correctly-coloured buttons across the wrong categories.
   */
  test('rgb() colours are categorised, not just hex', function(assert) {
    assert.strictEqual(
      category_for_button({ background_color: 'rgb(255, 255, 170)', part_of_speech: 'noun' }),
      'people',
      'rgb pronoun yellow files under People despite a noun part_of_speech'
    );
    assert.strictEqual(
      category_for_button({ background_color: 'rgb(204, 255, 170)' }),
      'actions',
      'rgb verb green files under Actions'
    );
  });

  test('spacing and case variations of the same colour agree', function(assert) {
    var forms = ['#FFFFAA', '#ffffaa', '#ffa', 'rgb(255,255,170)', 'rgb(255, 255, 170)'];
    var got = forms.map(function(f) { return category_for_button({ background_color: f }); });
    var unique = got.filter(function(v, i) { return got.indexOf(v) === i; });
    assert.deepEqual(unique, ['people'], 'every spelling of pronoun yellow lands in People');
  });

  /*
   * Nearest-wins, not exact equality. Exact matching broke in two real ways: the
   * "Colored Soft" preference reassigns the --fitzgerald-* properties to
   * desaturated variants (so the palette no longer equals what buttons store),
   * and hand-authored or imported boards carry colours a few units off.
   */
  test('a near-miss red still files under No\'s and Don\'ts', function(assert) {
    // #FFAAAA is the canonical negation red; these are close variants.
    assert.strictEqual(category_for_button({ background_color: '#FFA8A8' }), 'no_not');
    assert.strictEqual(category_for_button({ background_color: '#FCA5A5' }), 'no_not');
    assert.strictEqual(category_for_button({ background_color: 'rgb(250, 165, 165)' }), 'no_not');
  });

  test('desaturated (Colored Soft) variants still reach the right category', function(assert) {
    // Roughly what -25% saturation does to the vivid palette entries.
    assert.strictEqual(category_for_button({ background_color: '#F2B5B5' }), 'no_not', 'soft red');
    assert.strictEqual(category_for_button({ background_color: '#D6F0BE' }), 'actions', 'soft green');
    assert.strictEqual(category_for_button({ background_color: '#F5F5C4' }), 'people', 'soft yellow');
  });

  /*
   * Real values measured off a live quick-core-60 board. "no" is a deeper red
   * than the palette's #FFAAAA (82 units away) and was falling outside an earlier
   * 70-unit ceiling, dropping through to its stale part_of_speech ('noun') and
   * landing in Things.
   */
  test('the deeper red a real board uses for "no" files under No\'s and Don\'ts', function(assert) {
    assert.strictEqual(category_for_button({ background_color: 'rgb(255, 112, 112)' }), 'no_not', '"no"');
    assert.strictEqual(category_for_button({ background_color: 'rgb(255, 170, 170)' }), 'no_not', '"not"');
    // The stale part_of_speech that caused the original mis-filing must not win.
    assert.strictEqual(
      category_for_button({ background_color: 'rgb(255, 112, 112)', part_of_speech: 'noun' }),
      'no_not'
    );
  });

  test('nearest-match does not drag an unrelated colour into a category', function(assert) {
    // A saturated teal is far from every Fitzgerald entry, so it must fall
    // through to part_of_speech rather than being forced into the least-far one.
    assert.strictEqual(
      category_for_button({ background_color: '#00806B', part_of_speech: 'question' }),
      'questions',
      'falls through to part_of_speech'
    );
    assert.strictEqual(category_for_button({ background_color: '#00806B' }), 'extra');
  });

  test('adjacent palette colours are still told apart', function(assert) {
    // negation red vs noun orange are the closest pair (~34 apart); an exact hit
    // on either must not drift into the other now that matching is fuzzy.
    assert.strictEqual(category_for_button({ background_color: '#FFAAAA' }), 'no_not');
    assert.strictEqual(category_for_button({ background_color: '#FFCCAA' }), 'things');
    assert.strictEqual(category_for_button({ background_color: '#FFAACC' }), 'social');
    assert.strictEqual(category_for_button({ background_color: '#FFCCDD' }), 'places');
  });

  test('part_of_speech is still used when the button carries no colour', function(assert) {
    assert.strictEqual(category_for_button({ part_of_speech: 'question' }), 'questions');
    assert.strictEqual(category_for_button({ background_color: 'not-a-colour', part_of_speech: 'question' }), 'questions');
  });

  test('a special action still wins over a colour', function(assert) {
    assert.strictEqual(
      category_for_button({ vocalization: ':clear', background_color: '#ffa' }),
      'controls'
    );
  });

  // Question-starting auxiliaries. The rule only ever DOWNGRADES an Actions verdict, so
  // these check both that it fires where it should and that it cannot reach anything else.
  test('a question-starting auxiliary painted verb-green files under Questions', function(assert) {
    var wrong = [];
    ['do', 'is', 'can', 'will'].forEach(function(word) {
      var got = category_for_button({ label: word, background_color: '#CCFFAA' });
      if(got !== 'questions') { wrong.push(word + ' -> ' + got); }
    });
    assert.deepEqual(wrong, [], 'every question-starter painted verb-green lands in Questions');
  });

  test('the same auxiliaries painted question-purple need no help from the rule', function(assert) {
    // What vocal-flair-112 actually ships: rgb(226, 207, 255), 3.88 from the palette
    // purple. The colour rule already claims these; the label rule is the net beneath it.
    var wrong = [];
    ['do', 'is', 'can', 'will'].forEach(function(word) {
      var got = category_for_button({ label: word, background_color: 'rgb(226, 207, 255)' });
      if(got !== 'questions') { wrong.push(word + ' -> ' + got); }
    });
    assert.deepEqual(wrong, [], 'the colour rule alone already files all four in Questions');
  });

  test('a question-starter falls back to Questions on part_of_speech alone', function(assert) {
    assert.strictEqual(category_for_button({ label: 'can', part_of_speech: 'verb' }), 'questions');
    assert.strictEqual(category_for_button({ label: 'will', part_of_speech: 'verb' }), 'questions');
  });

  test('the rule cannot drag a noun "can" or "will" out of its own category', function(assert) {
    // "can" is also a container and "will" is also a document. Only an ACTIONS verdict is
    // eligible, so a button its author coloured or typed as something else is untouched.
    assert.strictEqual(category_for_button({ label: 'can', background_color: '#FFCCAA' }), 'things');
    assert.strictEqual(category_for_button({ label: 'will', background_color: '#AACCFF' }), 'describe');
    assert.strictEqual(category_for_button({ label: 'can', part_of_speech: 'noun' }), 'things');
  });

  test('an ordinary verb is not swept up by the question-starter rule', function(assert) {
    assert.strictEqual(category_for_button({ label: 'want', background_color: '#CCFFAA' }), 'actions');
    assert.strictEqual(category_for_button({ label: 'doing', background_color: '#CCFFAA' }), 'actions');
    assert.strictEqual(category_for_button({ background_color: '#CCFFAA' }), 'actions');
  });

  test('the question-starter rule reads the AUTHORED label, and normalises it', function(assert) {
    // Same reasoning as the Yes rule: a translated board rewrites `label` but not
    // `base_label`, so the category must not move when the board is translated.
    assert.strictEqual(
      category_for_button({ base_label: 'can', label: 'puede', background_color: '#CCFFAA' }),
      'questions'
    );
    assert.strictEqual(category_for_button({ label: ' Do? ', background_color: '#CCFFAA' }), 'questions');
  });

  test('an unclassifiable button lands in extra rather than disappearing', function(assert) {
    assert.strictEqual(category_for_button({}), 'extra');
    assert.strictEqual(category_for_button(null), 'extra');
    assert.strictEqual(category_for_button({ part_of_speech: 'not_a_real_type' }), 'extra');
  });

  test('normalize_order drops unknown keys and appends missing ones', function(assert) {
    var out = normalize_order(['actions', 'nope', 'people']);
    assert.strictEqual(out[0], 'actions', 'stored order is honoured first');
    assert.strictEqual(out[1], 'people');
    assert.strictEqual(out.indexOf('nope'), -1, 'unknown key dropped');
    assert.strictEqual(out.length, DEFAULT_CATEGORY_ORDER.length, 'every category present exactly once');
  });

  test('normalize_order tolerates junk and never returns empty', function(assert) {
    assert.deepEqual(normalize_order(null), DEFAULT_CATEGORY_ORDER);
    assert.deepEqual(normalize_order([]), DEFAULT_CATEGORY_ORDER);
    assert.deepEqual(normalize_order('not-an-array'), DEFAULT_CATEGORY_ORDER);
    assert.deepEqual(normalize_order(['people', 'people']), normalize_order(['people']), 'duplicates collapse');
  });

  test('group_buttons honours the requested category order', function(assert) {
    var rows = [
      [{ id: 1, part_of_speech: 'noun' }, { id: 2, part_of_speech: 'verb' }],
      [{ id: 3, part_of_speech: 'pronoun' }]
    ];
    var groups = group_buttons(rows, ['actions', 'people', 'things']);
    assert.deepEqual(groups.map(function(g) { return g.key; }), ['actions', 'people', 'things']);
    assert.strictEqual(groups[0].buttons[0].id, 2);
    assert.strictEqual(groups[1].buttons[0].id, 3);
    assert.strictEqual(groups[2].buttons[0].id, 1);
  });

  /* PER-BUTTON OVERRIDES. `category_for_button` is a classifier -- colour, then part of
   * speech, then a handful of label rules -- so it is a good guess and sometimes a wrong
   * one. These let the BOARD's author correct it for individual buttons, and they are the
   * half of a curated layout that ordering alone cannot express.
   *
   * Keyed by button ID, deliberately: the id is what `grid.order[row][col]` already
   * references, so it is structurally stable across a copy (the cloner carries `buttons`
   * and `grid` together and renumbering would break the board). A label key would not
   * survive translation.
   */
  test('group_buttons: an override beats the classifier', function(assert) {
    var rows = [[{ id: 1, part_of_speech: 'noun' }, { id: 2, part_of_speech: 'verb' }]];
    var groups = group_buttons(rows, ['people', 'actions', 'things'], { '1': 'people' });
    var people = groups.filter(function(g) { return g.key === 'people'; })[0];
    var things = groups.filter(function(g) { return g.key === 'things'; })[0];
    assert.strictEqual(people.buttons[0].id, 1, 'the noun was forced into people');
    assert.strictEqual(things, undefined, 'and things is now empty, so it is omitted');
  });

  test('group_buttons: override keys are read as strings, ids may be numbers', function(assert) {
    var rows = [[{ id: 7, part_of_speech: 'noun' }]];
    // JSON object keys are always strings; btn.id is a number. The lookup must bridge that.
    var groups = group_buttons(rows, ['people', 'things'], { '7': 'people' });
    assert.strictEqual(groups[0].key, 'people');
    assert.strictEqual(groups[0].buttons[0].id, 7);
  });

  test('group_buttons: an override naming an unrendered category is ignored', function(assert) {
    var rows = [[{ id: 1, part_of_speech: 'noun' }]];
    /* `order` is normalized, so every registry key ends up rendered -- the case that bites
       is an override naming a key that is not in the registry at all. It must fall through
       to the classifier rather than dropping the button into a bucket nothing draws. */
    var groups = group_buttons(rows, ['things'], { '1': 'not_a_real_category' });
    var things = groups.filter(function(g) { return g.key === 'things'; })[0];
    assert.strictEqual(things.buttons[0].id, 1, 'the button is still classified normally');
  });

  test('group_buttons: no overrides argument behaves exactly as before', function(assert) {
    var rows = [[{ id: 1, part_of_speech: 'noun' }, { id: 2, part_of_speech: 'verb' }]];
    var a = group_buttons(rows, ['actions', 'things']);
    var b = group_buttons(rows, ['actions', 'things'], null);
    var c = group_buttons(rows, ['actions', 'things'], {});
    assert.deepEqual(a.map(function(g) { return g.key; }), b.map(function(g) { return g.key; }));
    assert.deepEqual(a.map(function(g) { return g.key; }), c.map(function(g) { return g.key; }));
    assert.strictEqual(a[0].buttons[0].id, 2, 'verb still lands in actions');
  });

  /* The keyboard case, and the reason the override is checked BEFORE the QWERTY pass.
     `qwerty_positions` claims a run of letters once ~70% of the alphabet is present, which
     is a heuristic an author must be able to correct: vocal-flair-112 carries both the KEY
     `a` and the WORD "a". Pulling a key out leaves a gap in a positional layout -- the
     author's call to make. */
  test('group_buttons: an override pulls a button OUT of the detected keyboard', function(assert) {
    var letters = 'qwertyuiopasdfghjklzxcvbnm'.split('');
    var rows = [letters.map(function(ch, i) { return { id: i + 1, label: ch }; })];
    var plain = group_buttons(rows, ['keyboard', 'words']);
    var kb = plain.filter(function(g) { return g.key === 'keyboard'; })[0];
    assert.ok(kb, 'PRECONDITION: a keyboard category exists');
    assert.true(kb.buttons.length > 20, 'PRECONDITION: the keyboard was detected');

    var forced = group_buttons(rows, ['keyboard', 'words'], { '1': 'words' });
    var kb2 = forced.filter(function(g) { return g.key === 'keyboard'; })[0];
    var words = forced.filter(function(g) { return g.key === 'words'; })[0];
    assert.strictEqual(kb2.buttons.length, kb.buttons.length - 1, 'the key left the keyboard');
    assert.strictEqual(words.buttons[0].id, 1, 'and landed where the author put it');
    assert.notOk(words.buttons[0].kb_row, 'its stale keyboard position was cleared');
  });

  test('group_buttons omits empty categories and drops empty cells', function(assert) {
    var rows = [[{ id: 1, part_of_speech: 'verb' }, { id: 2, empty: true }, null]];
    var groups = group_buttons(rows, DEFAULT_CATEGORY_ORDER);
    assert.strictEqual(groups.length, 1, 'only the non-empty category renders');
    assert.strictEqual(groups[0].key, 'actions');
    assert.strictEqual(groups[0].count, 1, 'empty placeholder cell is not counted');
  });

  test('group_buttons loses no real button', function(assert) {
    var rows = [[
      { id: 1, part_of_speech: 'verb' },
      { id: 2 },
      { id: 3, vocalization: ':clear' },
      { id: 4, part_of_speech: 'wat' }
    ]];
    var total = group_buttons(rows, DEFAULT_CATEGORY_ORDER).reduce(function(sum, g) {
      return sum + g.buttons.length;
    }, 0);
    assert.strictEqual(total, 4, 'all four buttons are still reachable somewhere');
  });

  /*
   * Grouping must never be a way to lose vocabulary. The ONLY things it may skip
   * are null cells and `empty: true` placeholders -- the blank slots in the grid
   * matrix, which are not buttons. Anything else staying reachable is the point:
   * a button an AAC user cannot find is, to them, a button that was deleted.
   */
  test('hidden, unlabelled and folder buttons are all still rendered', function(assert) {
    var rows = [[
      { id: 'hidden', part_of_speech: 'verb', hidden: true },
      { id: 'display_hidden', part_of_speech: 'verb', display_as_hidden: true },
      { id: 'nolabel', part_of_speech: 'verb' },
      { id: 'folder', load_board: { id: 'b1' }, part_of_speech: 'noun' },
      { id: 'filtered', part_of_speech: 'verb', _filtered_out: true }
    ]];
    var ids = group_buttons(rows, DEFAULT_CATEGORY_ORDER).reduce(function(acc, g) {
      return acc.concat(g.buttons.map(function(b) { return b.id; }));
    }, []).sort();
    assert.deepEqual(
      ids,
      ['display_hidden', 'filtered', 'folder', 'hidden', 'nolabel'],
      'none of these are silently dropped'
    );
  });

  test('only null and empty placeholder cells are skipped', function(assert) {
    var rows = [[
      null,
      { id: 'real', part_of_speech: 'verb' },
      { id: 'placeholder', empty: true },
      undefined
    ]];
    var groups = group_buttons(rows, DEFAULT_CATEGORY_ORDER);
    var ids = groups.reduce(function(acc, g) {
      return acc.concat(g.buttons.map(function(b) { return b.id; }));
    }, []);
    assert.deepEqual(ids, ['real'], 'exactly the one real button survives');
  });

  /*
   * Column assignment is the piece that decides how the grouped board looks, so
   * it is asserted here rather than checked by eye. CSS multi-column balances but
   * never exposes which panels landed where, which is why nothing could be told
   * to stretch and the bottom edge stayed ragged.
   */
  // A keyboard folder is its own category, not Connectors. It has no part of speech,
  // so before this rule it was filed by COLOUR — and keyboard buttons are grey, which
  // is nearest to Connectors. Detection is by board KEY suffix, matching
  // models/board.js VARIANT_ROOT_SUFFIXES, so it survives a translated label.
  test('a word-prediction slot is its own category, not a control and not Connectors', function(assert) {
    /* `:suggestion` is the marker models/board.js finds prediction slots by
       (refresh_suggestions / update_suggestion_button). It has to be checked BEFORE the
       generic special-action rule, which claims every `:`-prefixed vocalization. */
    assert.strictEqual(category_for_button({ vocalization: ':suggestion', label: 'give' }), 'predictions',
      'a prediction slot');
    assert.strictEqual(category_for_button({ vocalization: ':suggestion', label: 'need' }), 'predictions',
      'and the label it happens to be showing makes no difference');
    /* The colour on the core boards is grey, which is nearest to Connectors — the rule has
       to beat that too, or three cells in the middle of the function words change under the
       user while everything around them stays put. */
    assert.strictEqual(category_for_button({ vocalization: ':suggestion', background_color: '#cccccc' }), 'predictions',
      'even tinted the grey that files a button under Connectors');
    assert.strictEqual(category_for_button({ vocalization: ':clear' }), 'controls',
      'an ordinary special action is still a control');
    assert.strictEqual(category_for_button({ vocalization: ':backspace' }), 'controls',
      'and so is backspace');
  });

  test('category_for_button files a keyboard folder under keyboard, not words', function(assert) {
    assert.strictEqual(category_for_button({ load_board: { key: 'someone/vocal-flair-84-keyboard' } }), 'keyboard',
      'a -keyboard sub-board key');
    assert.strictEqual(category_for_button({ load_board: { key: 'keyboard' } }), 'keyboard',
      'a bare "keyboard" key');
    assert.strictEqual(category_for_button({ load_board: { key: 'x/w-keyboard' } }), 'keyboard',
      'the w-keyboard variant');
    /* A COPIED board set is the common case, not an edge one, and copying renames the
       sub-board: board keys are disambiguated with a trailing `_<n>`
       (generate_unique_key, app/models/concerns/processable.rb:147-150). Anchored on
       `keyboard$` alone this missed, the folder fell through to the colour rule, and grey
       filed it under Connectors — reported on the real dev board
       `marcus_williams_slp/vocal-flair-112-keyboard_1`. */
    assert.strictEqual(category_for_button({ load_board: { key: 'someone/vocal-flair-112-keyboard_1' } }), 'keyboard',
      'a copied set, whose sub-board key carries the _1 suffix');
    assert.strictEqual(category_for_button({ load_board: { key: 'x/w-keyboard_12' } }), 'keyboard',
      'a copied w-keyboard variant');
  });

  test('the keyboard rule beats the colour rule that used to claim it', function(assert) {
    // Grey is nearest to Connectors; the keyboard rule runs first, so grey no longer wins.
    assert.strictEqual(category_for_button({ load_board: { key: 'u/board-keyboard' }, background_color: '#e0e0e0' }),
      'keyboard', 'grey keyboard folder is still keyboard');
  });

  test('a folder that merely MENTIONS keyboard is not miscategorised', function(assert) {
    // Suffix-anchored: "keyboard-help" or "my-keyboards" are not keyboards.
    assert.notStrictEqual(category_for_button({ load_board: { key: 'u/keyboard-help' } }), 'keyboard');
    assert.notStrictEqual(category_for_button({ load_board: { key: 'u/my-keyboards' } }), 'keyboard');
    /* The copy suffix is digits only, so this stays a suffix rule and not a substring one. */
    assert.notStrictEqual(category_for_button({ load_board: { key: 'u/keyboard_notes' } }), 'keyboard');
  });

  // QWERTY keys can only be recognised with the WHOLE board in view: a vocabulary board
  // legitimately contains the single-letter word "a", and one button labelled "q" is not
  // a keyboard. Detection is therefore board-level, and gated on most of a run being
  // present.
  // A full keyboard as a board carries them: the three rows of ten from QWERTY_LAYOUT.
  var kb_board = function() {
    var mk = function(l) { return { id: 'b-' + l, label: l }; };
    return [
      'qwertyuiop'.split('').map(mk),
      ['.'].concat('asdfghjkl'.split('')).map(mk),
      ['[shift]'].concat('zxcvbnm'.split('')).concat(['[ space ]', '?']).map(mk)
    ];
  };
  var find_btn = function(rows, label) {
    var hit = null;
    rows.forEach(function(r) { r.forEach(function(b) { if(b.label === label) { hit = b; } }); });
    return hit;
  };

  test('qwerty_positions lays the keyboard out three rows of ten', function(assert) {
    var rows = kb_board();
    var pos = qwerty_positions(rows);
    var at = function(l) { return pos.get(find_btn(rows, l)); };
    assert.deepEqual(at('q'), { row: 1, col: 1 }, 'q opens row 1');
    assert.deepEqual(at('p'), { row: 1, col: 10 }, 'p closes row 1');
    assert.deepEqual(at('.'), { row: 2, col: 1 }, 'the period opens row 2');
    assert.deepEqual(at('a'), { row: 2, col: 2 }, 'a follows it');
    assert.deepEqual(at('l'), { row: 2, col: 10 }, 'l closes row 2');
    assert.deepEqual(at('[shift]'), { row: 3, col: 1 }, 'bracketed shift is matched and opens row 3');
    assert.deepEqual(at('z'), { row: 3, col: 2 }, 'z follows shift');
    assert.deepEqual(at('m'), { row: 3, col: 8 }, 'm ends the letters');
    assert.deepEqual(at('[ space ]'), { row: 3, col: 9 }, 'spaced brackets still match space');
    assert.deepEqual(at('?'), { row: 3, col: 10 }, '? closes the keyboard');
    assert.strictEqual(pos.size, 30, 'all thirty keys placed');
  });

  /* The real vocal-flair-112 grid, rows 6-8 — the keyboard block sits at columns 4-13
     and the Connectors words run down the left. Both "a" buttons live on ROW 7: the
     grey conjunction at column 2 and the white key at column 5, two cells apart. */
  // A FULL keyboard board carries a number row above the letters and a colon beside space.
  // The layout table is a superset of both boards, so these check that the extra rows and
  // the alternative slot reach the board that HAS them without disturbing the one that
  // does not (covered by the three-rows-of-ten test above, which still passes unchanged).
  var full_kb_board = function() {
    var mk = function(l) { return { id: 'b-' + l, label: l, background_color: '#73CCFF' }; };
    var key = function(l) { return { id: 'b-' + l, label: l, background_color: '#FFFFFF' }; };
    return [
      '1234567890'.split('').map(mk),
      'qwertyuiop'.split('').map(key),
      ['.'].concat('asdfghjkl'.split('')).map(key),
      ['shift'].concat('zxcvbnm'.split('')).concat(['space', ':']).map(key)
    ];
  };

  test('a full keyboard board puts the number row above q and the colon beside space', function(assert) {
    var rows = full_kb_board();
    var pos = qwerty_positions(rows);
    var at = function(l) { return pos.get(find_btn(rows, l)); };
    assert.deepEqual(at('1'), { row: 1, col: 1 }, 'the number row opens the block');
    assert.deepEqual(at('0'), { row: 1, col: 10 }, 'and closes at ten wide, like the letter rows');
    assert.deepEqual(at('q'), { row: 2, col: 1 }, 'q sits directly under the numbers');
    assert.deepEqual(at('space'), { row: 4, col: 9 }, 'space keeps its place');
    assert.deepEqual(at(':'), { row: 4, col: 10 }, 'the colon takes the slot right of space');
    assert.strictEqual(pos.size, 40, 'all forty keys placed');
  });

  test('the number row and the colon leave Describe and Controls empty', function(assert) {
    // Both were categories on the real board purely because the key block did not claim
    // them: the digits are Fitzgerald blue, so they were filed under Describe.
    var groups = group_buttons(full_kb_board(), DEFAULT_CATEGORY_ORDER);
    var byKey = {};
    groups.forEach(function(g) { byKey[g.key] = g; });
    assert.strictEqual(byKey.describe, undefined, 'no Describe category is produced');
    assert.strictEqual(byKey.controls, undefined, 'no Controls category is produced');
    assert.strictEqual(byKey.keyboard.count, 40, 'every key is in the keyboard instead');
    assert.strictEqual(byKey.keyboard.label, 'Full Keyboard',
      'and it is named for what it holds');
  });

  test('a keyboard WITHOUT a number row is still just "Keyboard"', function(assert) {
    var groups = group_buttons(kb_board(), DEFAULT_CATEGORY_ORDER);
    var kb = groups.filter(function(g) { return g.key === 'keyboard'; })[0];
    assert.strictEqual(kb.count, 30, 'the inline keyboard is unchanged at thirty keys');
    assert.strictEqual(kb.label, 'Keyboard', 'and keeps its own name');
  });

  test("o'clock is its own category, not a key and not Describe", function(assert) {
    var rows = full_kb_board();
    rows[0].push({ id: 'b-oclock', label: "o'clock", background_color: '#73CCFF' });
    var groups = group_buttons(rows, DEFAULT_CATEGORY_ORDER);
    var byKey = {};
    groups.forEach(function(g) { byKey[g.key] = g; });
    assert.ok(byKey.clock, 'a Clock category exists');
    assert.strictEqual(byKey.clock.count, 1, 'holding exactly the one button');
    assert.strictEqual(byKey.keyboard.count, 40, 'the key block is unchanged at forty');
    assert.strictEqual(byKey.describe, undefined, 'and it did not fall back to Describe');
  });

  test('an all-emoji Connectors panel is called Emojis, a mixed one is not', function(assert) {
    var emoji = ['\u{1F602}', '\u{1F62D}', '\u{2764}\u{FE0F}'].map(function(e, i) {
      return { id: 'e' + i, label: e, background_color: '#FFFFFF' };
    });
    var only = group_buttons([emoji], DEFAULT_CATEGORY_ORDER)
      .filter(function(g) { return g.key === 'words'; })[0];
    assert.strictEqual(only.label, 'Emojis', 'every button an emoji -> Emojis');

    var mixed = group_buttons([emoji.concat([{ id: 'w', label: 'and', background_color: '#FFFFFF' }])],
      DEFAULT_CATEGORY_ORDER).filter(function(g) { return g.key === 'words'; })[0];
    assert.strictEqual(mixed.label, 'Connectors', 'one real connector among them -> Connectors');
  });

  test('the word "a" two cells from the a KEY is not taken as the key', function(assert) {
    var mk = function(l, id) { return { id: id, label: l }; };
    var rows = [
      ['they', 'it', 'for', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', 'Give me time'].map(function(l, i) { return mk(l, 'r6-' + i); }),
      /* col 2 is the WORD, col 5 is the KEY — same label, same case, same row. */
      ['more', 'a', 'because', '.', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'small words'].map(function(l, i) { return mk(l, 'r7-' + i); }),
      ['yes', 'done', 'no', '[shift]', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '[ space ]', '?', 'keyboard'].map(function(l, i) { return mk(l, 'r8-' + i); })
    ];
    var word_a = rows[1][1];
    var key_a = rows[1][4];
    var pos = qwerty_positions(rows);
    assert.deepEqual(pos.get(key_a), { row: 2, col: 2 },
      'the "a" sitting after the period is the home-row key');
    assert.strictEqual(pos.get(word_a), undefined,
      'the Connectors word two cells to its left is left alone');

    /* And it must still reach Connectors rather than vanishing. */
    var groups = group_buttons(rows, DEFAULT_CATEGORY_ORDER);
    var holder = groups.filter(function(g) {
      return (g.buttons || []).indexOf(word_a) !== -1;
    })[0];
    assert.ok(holder && holder.key !== 'keyboard',
      'the word is grouped as vocabulary, not as a key (landed in ' + (holder && holder.key) + ')');
  });

  test('the pronoun "I" is NOT taken as the i key', function(assert) {
    // Exact case wins: on a real board the pronoun sits beside the key and a
    // case-insensitive match handed the PRONOUN to the keyboard.
    var rows = kb_board();
    rows.push([{ id: 'pronoun-I', label: 'I' }]);
    var pos = qwerty_positions(rows);
    assert.notOk(pos.get(find_btn(rows, 'I')), 'the pronoun keeps out of the keyboard');
    assert.deepEqual(pos.get(find_btn(rows, 'i')), { row: 1, col: 8 }, 'the real key still placed');
  });

  test('a single-letter WORD on a vocabulary board is not treated as a key', function(assert) {
    var rows = [[{ id: 'x', label: 'a' }, { id: 'y', label: 'I' }, { id: 'z', label: 'the' }]];
    assert.strictEqual(qwerty_positions(rows).size, 0, 'no keys without most of the alphabet');
  });

  test('group_buttons routes the keyboard into its own category, in key order',
    function(assert) {
      var groups = group_buttons(kb_board(), null);
      var kb = groups.find(function(g) { return g.key === 'keyboard'; });
      assert.ok(kb, 'a keyboard panel exists');
      assert.strictEqual(kb.count, 30, 'all thirty keys are in it');
      assert.true(kb.is_keyboard, 'flagged so the grid pulls it out of column packing');
      assert.deepEqual(kb.buttons.slice(0, 10).map(function(b) { return b.label; }),
        'qwertyuiop'.split(''), 'DOM order follows the keyboard, so tabbing does too');
    });

  test('assign_columns keeps the user order intact', function(assert) {
    var groups = [
      { key: 'a', count: 8 }, { key: 'b', count: 8 },
      { key: 'c', count: 8 }, { key: 'd', count: 8 }
    ];
    var flat = assign_columns(groups, 2, 4).reduce(function(a, c) { return a.concat(c); }, []);
    assert.deepEqual(flat.map(function(g) { return g.key; }), ['a', 'b', 'c', 'd'],
      'reading order survives the split');
  });

  test('assign_columns never leaves a column empty', function(assert) {
    // One huge category could otherwise consume the whole first column's target
    // and starve the rest.
    var groups = [{ key: 'huge', count: 40 }, { key: 'x', count: 1 }, { key: 'y', count: 1 }];
    var cols = assign_columns(groups, 3, 4);
    assert.strictEqual(cols.length, 3, 'all three columns are produced');
    var empty = cols.map(function(c, i) { return c.length ? null : i; }).filter(function(i) { return i !== null; });
    assert.deepEqual(empty, [], 'no column is left empty');
  });

  test('assign_columns loses no group', function(assert) {
    var groups = [];
    for(var i = 0; i < 12; i++) { groups.push({ key: 'k' + i, count: (i % 5) + 1 }); }
    var flat = assign_columns(groups, 3, 4).reduce(function(a, c) { return a.concat(c); }, []);
    assert.strictEqual(flat.length, 12, 'every category is placed exactly once');
  });

  test('assign_columns balances by ROWS, not raw button count', function(assert) {
    // 4 and 5 buttons are 1 and 2 rows at 4 across — much closer in height than
    // their counts suggest, and height is what actually has to balance.
    var groups = [{ key: 'a', count: 4 }, { key: 'b', count: 5 }, { key: 'c', count: 4 }, { key: 'd', count: 4 }];
    var cols = assign_columns(groups, 2, 4);
    assert.strictEqual(cols.length, 2, 'two columns');
    assert.strictEqual(cols[0].length, 2, 'first column takes two categories');
    assert.strictEqual(cols[1].length, 2, 'second column takes the remaining two');
  });

  test('assign_columns degenerate inputs', function(assert) {
    assert.deepEqual(assign_columns([], 3, 4), [[]]);
    assert.deepEqual(assign_columns([{ key: 'a', count: 1 }], 3, 4), [[{ key: 'a', count: 1 }]]);
    assert.strictEqual(assign_columns([{ key: 'a', count: 1 }, { key: 'b', count: 1 }], 1, 4).length, 1);
  });

  test('assign_columns minimises the tallest column', function(assert) {
    // Weight is ceil(buttons/4)+1, so these are 2,2,2,5 rows. The only balanced
    // split of [2,2,2,5] into two columns is [2,2,2] and [5] — tallest 6 vs 5.
    // A greedy "close once you pass the average" fill closes after the first two
    // and leaves 2+5=7, a whole row taller, which is the uneven bottom that has
    // to be padded out.
    var groups = [{ key: 'a', count: 4 }, { key: 'b', count: 4 }, { key: 'c', count: 4 }, { key: 'd', count: 16 }];
    var cols = assign_columns(groups, 2, 4);
    var heights = cols.map(function(c) {
      return c.reduce(function(sum, g) { return sum + Math.ceil(g.count / 4) + 1; }, 0);
    });
    assert.strictEqual(Math.max.apply(null, heights), 6, 'tallest column is the optimum, not 7');
  });

  test('assign_columns fills every track even when the optimum needs fewer', function(assert) {
    // Optimal packing of these into 3 columns only needs 2, which would leave a
    // trailing grid track empty and a hole down the right of the board.
    var groups = [{ key: 'a', count: 1 }, { key: 'b', count: 1 }, { key: 'c', count: 1 }];
    var cols = assign_columns(groups, 3, 4);
    assert.strictEqual(cols.length, 3, 'every track is used');
    var empty = cols.map(function(c, i) { return c.length ? null : i; }).filter(function(i) { return i !== null; });
    assert.deepEqual(empty, [], 'and none of them is empty');
  });

  test('group_buttons tolerates empty input', function(assert) {
    assert.deepEqual(group_buttons([], DEFAULT_CATEGORY_ORDER), []);
    assert.deepEqual(group_buttons(null, DEFAULT_CATEGORY_ORDER), []);
  });

  // ── COMPACT tiling (pack_category_tiles) ──────────────────────────────────
  // The invariants here are the ones the CSS cannot defend: a tile that runs off
  // the board, two tiles on the same cell, or a lost category all render as a
  // silently broken board rather than as an error.

  /* `each_key` mirrors what controllers/components stamp on a real group (see
     board-detail-grid.js#categoryGroups) — it is the {{#each}} identity, and a split
     category depends on its two tiles carrying different ones. */
  var cat = function(key, count, extra) {
    var g = { key: key, count: count, buttons: [], each_key: 'cat-' + key };
    for(var i = 0; i < count; i++) { g.buttons.push({ id: key + '-' + i }); }
    if(extra) { Object.keys(extra).forEach(function(k) { g[k] = extra[k]; }); }
    return g;
  };

  // A keyboard group shaped the way group_buttons stamps one: three rows of ten.
  var keyboard_group = function(rows, cols) {
    var g = { key: 'keyboard', count: 0, buttons: [], each_key: 'cat-keyboard', is_keyboard: true };
    for(var r = 1; r <= rows; r++) {
      for(var c = 1; c <= cols; c++) {
        g.buttons.push({ id: 'k' + r + '-' + c, kb_row: r, kb_col: c });
      }
    }
    g.count = g.buttons.length;
    return g;
  };

  // Paint every tile onto a grid and report any cell claimed twice or out of bounds.
  var occupancy = function(packed, columns) {
    var seen = {};
    var faults = [];
    (packed.tiles || []).forEach(function(t) {
      if(t.col < 1 || t.col + t.w - 1 > columns) {
        faults.push(t.group.key + ' spans columns ' + t.col + '..' + (t.col + t.w - 1));
      }
      if(t.row < 1 || t.row + t.h - 1 > packed.rows) {
        faults.push(t.group.key + ' spans rows ' + t.row + '..' + (t.row + t.h - 1));
      }
      for(var r = t.row; r < t.row + t.h; r++) {
        for(var c = t.col; c < t.col + t.w; c++) {
          var at = r + ':' + c;
          if(seen[at]) { faults.push('cell ' + at + ' claimed by ' + seen[at] + ' and ' + t.group.key); }
          seen[at] = t.group.key;
        }
      }
    });
    return { faults: faults, filled: Object.keys(seen).length };
  };

  test('every tile holds its whole category and no tile overlaps or overflows', function(assert) {
    var groups = [cat('people', 10), cat('actions', 22), cat('describe', 17),
                  cat('things', 13), cat('words', 6), cat('social', 3)];
    var packed = pack_category_tiles(groups, 14);
    var over = occupancy(packed, 14);
    assert.deepEqual(over.faults, [], 'no overlap and nothing off the board');
    var short = packed.tiles.filter(function(t) { return t.w * t.h < t.group.count; })
                            .map(function(t) { return t.group.key; });
    assert.deepEqual(short, [], 'every tile is big enough for its own buttons');
  });

  test('no category is dropped and reading order survives the packing', function(assert) {
    var groups = [cat('people', 10), cat('actions', 22), cat('describe', 17),
                  cat('things', 13), cat('words', 6), cat('social', 3)];
    var packed = pack_category_tiles(groups, 14);
    assert.strictEqual(packed.tiles.length, groups.length, 'every category got a tile');
    // Tiles come out band by band, left to right — the order a user reads, which is
    // also the DOM order focus and a screen reader follow.
    var out_of_order = [];
    for(var i = 1; i < packed.tiles.length; i++) {
      var a = packed.tiles[i - 1];
      var b = packed.tiles[i];
      if(b.row < a.row || (b.row === a.row && b.col < a.col)) {
        out_of_order.push(b.group.key + ' before ' + a.group.key);
      }
    }
    assert.deepEqual(out_of_order, [], 'tiles are emitted in reading order');
  });

  test('the keyboard is pinned to the BOTTOM-RIGHT and keeps its own shape', function(assert) {
    var groups = [cat('people', 10), cat('actions', 22), cat('describe', 17),
                  cat('words', 6), cat('social', 3), keyboard_group(3, 10)];
    var packed = pack_category_tiles(groups, 14);
    var kb = packed.tiles.filter(function(t) { return t.group.is_keyboard; })[0];
    assert.ok(kb, 'the keyboard got a tile');
    assert.strictEqual(kb.w, 10, 'ten columns wide — the width of the qwertyuiop row');
    assert.strictEqual(kb.h, 3, 'three rows tall, sized from the keys and not the count');
    assert.strictEqual(kb.col + kb.w - 1, 14, 'flush with the right edge');
    assert.strictEqual(kb.row + kb.h - 1, packed.rows, 'flush with the bottom edge');
  });

  test('the notch beside the keyboard holds categories rather than a hole', function(assert) {
    var groups = [cat('people', 10), cat('actions', 22), cat('describe', 17),
                  cat('words', 6), cat('social', 3), keyboard_group(3, 10)];
    var packed = pack_category_tiles(groups, 14);
    var over = occupancy(packed, 14);
    assert.deepEqual(over.faults, [], 'still no overlap or overflow');
    // The four columns left of a 10-wide keyboard on a 14-column board are the notch.
    var kb = packed.tiles.filter(function(t) { return t.group.is_keyboard; })[0];
    var inside = packed.tiles.filter(function(t) {
      return !t.group.is_keyboard && t.col < kb.col &&
             t.row + t.h - 1 >= kb.row && t.row <= kb.row + kb.h - 1;
    });
    assert.ok(inside.length > 0, 'the notch is used, not left as dead board beside the keyboard');
    var cells = inside.reduce(function(sum, t) { return sum + (t.w * t.h); }, 0);
    assert.strictEqual(cells, (kb.col - 1) * kb.h, 'and it is used in full');
  });

  test('a category too wide for the board is given extra rows, never extra columns', function(assert) {
    var packed = pack_category_tiles([cat('things', 40)], 8);
    assert.strictEqual(packed.tiles.length, 1);
    assert.ok(packed.tiles[0].w <= 8, 'never wider than the board');
    assert.ok(packed.tiles[0].w * packed.tiles[0].h >= 40, 'still holds all 40 buttons');
  });

  /* The layout this packer exists to produce, on the board it was designed against.

     Two defects show up here together. The greedy per-band version scored each band on
     its own wasted cells, which picked a 1-row band holding People alone — four columns
     of bare board beside it — and left every later band to pack around that. And without
     DONATIONS the five categories want 15 columns at five rows a piece, one too many, so
     the search had to fall back to six rows and every ring gained a mostly-empty final
     row. Moving one button out of Actions buys the fifth row back for all of them. */
  test('the board tiles exactly — no bare board, no spare cells in any ring', function(assert) {
    /* The REAL vocal-flair board, category by category — the small trailing categories
       included, because they are what fills the notch beside the keyboard and so decide
       both how much is left for the bands above and how many donations the notch can
       take. A fixture holding only the five big categories packs differently. */
    var groups = [cat('people', 10), cat('actions', 21), cat('describe', 20),
                  cat('words', 16), cat('questions', 5), cat('how_when', 4),
                  cat('places', 3), cat('no_not', 2), cat('social', 1),
                  keyboard_group(3, 10)];
    var packed = pack_category_tiles(groups, 14);
    assert.deepEqual(occupancy(packed, 14).faults, [], 'no overlap and nothing off the board');

    var band = packed.tiles.filter(function(t) { return t.row === 1; });
    assert.strictEqual(band.reduce(function(sum, t) { return sum + t.w; }, 0), 14,
      'the first band fills the board width exactly — no bare strip beside a category');
    assert.deepEqual(band.map(function(t) { return t.group.key + ':' + t.w + 'x' + t.h; }),
      ['people:2x5', 'actions:4x5', 'describe:4x5', 'words:3x5', 'questions:1x5'],
      'each category is a columnar block five rows tall, in compact_order');

    var spare = packed.tiles.filter(function(t) { return (t.w * t.h) !== t.group.count; })
                            .map(function(t) { return t.group.key + ' ' + t.w + 'x' + t.h + ' for ' + t.group.count; });
    assert.deepEqual(spare, [], 'every ring holds exactly its own buttons');

    var covered = packed.tiles.reduce(function(sum, t) { return sum + (t.w * t.h); }, 0);
    assert.strictEqual(covered, packed.rows * 14, 'and no cell of the board is left bare');
  });

  /* A category that donates its trailing buttons keeps the rest, and the two pieces
     together still hold every button — a split that dropped one would take vocabulary off
     the board without any error to notice. */
  test('a donating category loses no button and keeps its own colour', function(assert) {
    var groups = [cat('people', 10), cat('actions', 21), cat('describe', 20),
                  cat('words', 16), cat('questions', 5), cat('how_when', 4),
                  cat('places', 3), cat('no_not', 2), cat('social', 1),
                  keyboard_group(3, 10)];
    var packed = pack_category_tiles(groups, 14);
    /* The donated tile carries its OWN key (named for the button it holds) so a style rule
       for it cannot also hit the full Actions block — match on the label instead. */
    var actions = packed.tiles.filter(function(t) {
      return (t.group.buttons || []).some(function(b) { return /^actions/.test(b.id); });
    });
    assert.ok(actions.length > 1, 'Actions was split (' + actions.length + ' tiles)');

    var seen = {};
    var dupes = [];
    var total = 0;
    actions.forEach(function(t) {
      (t.group.buttons || []).forEach(function(b) {
        if(seen[b.id]) { dupes.push(b.id); }
        seen[b.id] = true;
        total += 1;
      });
    });
    assert.strictEqual(total, 21, 'all 21 buttons are still on the board');
    assert.deepEqual(dupes, [], 'and none of them is rendered twice');

    var keys = {};
    packed.tiles.forEach(function(t) { keys[t.group.each_key] = (keys[t.group.each_key] || 0) + 1; });
    var clashes = Object.keys(keys).filter(function(k) { return keys[k] > 1; });
    assert.deepEqual(clashes, [], 'every tile has its own {{#each}} key, so Ember can tell them apart');
  });

  /* The keyboard FOLDER tile (`keyboard_extra` — the button that OPENS a keyboard board,
     split off from the key block) belongs beside the keys it opens. It is a trailing
     CATEGORY while the `yes`-style overflow tile is a DONATION, and the notch is filled
     "trailing categories, then donations" — so the folder came out to the left of a tile it
     has nothing to do with. `keyboard_folder_last` pulls it to the end of that run. */
  test('the keyboard folder tile sits beside the keyboard, not left of a donated tile', function(assert) {
    var kb = keyboard_group(3, 10);
    /* The folder: in the keyboard category, no QWERTY position — group_buttons parks these
       on the row below the layout, which is exactly what makes pack_category_tiles split
       them out as `keyboard_extra`. */
    kb.buttons.push({ id: 'kb-folder', kb_row: 4, kb_col: 1, kb_extra: true });
    kb.count = kb.buttons.length;
    var groups = [cat('people', 10), cat('actions', 21), cat('describe', 20),
                  cat('words', 16), cat('questions', 5), cat('how_when', 4),
                  cat('places', 3), cat('no_not', 2), cat('social', 1), kb];
    var packed = pack_category_tiles(groups, 14);

    var folder = packed.tiles.filter(function(t) { return t.group.key === 'keyboard_extra'; })[0];
    assert.ok(folder, 'the folder is split into its own tile');

    /* The donated tile is the Actions overflow: an Actions button in a tile that is not the
       main Actions block. */
    var donated = packed.tiles.filter(function(t) {
      return t.group.key !== 'actions' &&
        (t.group.buttons || []).some(function(b) { return /^actions/.test(b.id); });
    })[0];
    if(!donated) {
      assert.ok(true, 'no donation on this board — nothing for the folder to sit right of');
      return;
    }
    assert.ok(folder.col > donated.col || folder.row > donated.row,
      'the folder tile comes after the donated tile (folder at ' + folder.col + ',' + folder.row +
      ' vs donated at ' + donated.col + ',' + donated.row + ')');
  });

  test('scrolling puts the controls on one full-width row above a full-width keyboard', function(assert) {
    /* The notch is gone in the scrolling variant. The keyboard takes the whole board width
       and pays for it by spanning fewer board rows than it has key rows — its inner grid
       still holds every QWERTY row, so the keys get shorter rather than moving — and the
       categories that used to fill the notch beside it get a row of their own, in reading
       order, directly above. The last two share whatever the row has left. */
    var kb = keyboard_group(3, 10);
    kb.buttons.push({ id: 'kb-folder', kb_row: 4, kb_col: 1, kb_extra: true });
    kb.count = kb.buttons.length;
    var groups = [cat('people', 13), cat('actions', 13), cat('describe', 12), cat('how_when', 12),
                  cat('places', 8), cat('questions', 5), cat('social', 1), cat('no_not', 2),
                  cat('words', 14), kb, cat('predictions', 3), cat('yes', 1), cat('time', 1),
                  cat('things', 9)];
    var packed = pack_category_tiles(groups, 14, { scrolling: true });

    var keyboard = packed.tiles.filter(function(t) { return t.group.is_keyboard; })[0];
    assert.ok(keyboard, 'the keyboard is placed');
    assert.strictEqual(keyboard.col, 1, 'the keyboard starts at the first column');
    assert.strictEqual(keyboard.w, 14, 'the keyboard spans the whole board width');
    assert.ok(keyboard.h < keyboard.ih,
      'the key block spans fewer board rows (' + keyboard.h + ') than it has key rows (' +
      keyboard.ih + '), so the keys are shorter rather than moved');
    assert.strictEqual(keyboard.ih, 3, 'all three QWERTY rows survive inside the block');

    /* Nothing sits beside the keyboard — that is what "no notch" means. */
    var beside = packed.tiles.filter(function(t) {
      return !t.group.is_keyboard &&
        t.row < keyboard.row + keyboard.h && t.row + t.h > keyboard.row;
    });
    assert.strictEqual(beside.length, 0, 'no tile shares the keyboard rows');

    /* The controls row, immediately above, in the order it was asked for. */
    var controls = packed.tiles.filter(function(t) { return t.row === keyboard.row - 1; })
      .sort(function(a, b) { return a.col - b.col; });
    assert.deepEqual(controls.map(function(t) { return t.group.key; }),
      ['predictions', 'yes', 'no_not', 'social', 'time', 'keyboard_extra'],
      'the controls row reads predictions, yes, no_not, social, time, keys');

    /* Every tile is exactly its own button count wide, and the row is left SHORT on
       purpose: this row only exists in the scrolling variant, so it is always a flex band,
       and `flex: var(--bd-tile-columns) 0 …` shares the unused columns across every tile in
       proportion to its width. Widening two of them here instead — Time and Keys used to
       absorb the lot — bought two single-button tiles a mostly empty ring and left the
       tiles holding real buttons at their minimum. */
    var wrong = controls.filter(function(t) { return t.w !== t.group.count; })
      .map(function(t) { return t.group.key + ' is ' + t.w + ' wide for ' + t.group.count + ' buttons'; });
    assert.deepEqual(wrong, [], 'every controls tile is exactly its own button count wide');

    var width = controls.reduce(function(sum, t) { return sum + t.w; }, 0);
    assert.ok(width < 14,
      'the row does not claim the whole width (' + width + ' of 14) — the rest is the flex band\'s to share');

    var time = controls.filter(function(t) { return t.group.key === 'time'; })[0];
    var keys = controls.filter(function(t) { return t.group.key === 'keyboard_extra'; })[0];
    assert.strictEqual(time.w, 1, 'Time is one button, so one column');
    assert.strictEqual(keys.w, 1, 'the Keys folder is one button, so one column');
  });

  test('scrolling packs every vocabulary ring exactly full, in block shapes', function(assert) {
    /* The real vocal-flair-112 shape. A flex band shares its unused columns out with
       `flex-grow: w`, so slack at a band's end is not bare board -- it is width, i.e.
       bigger buttons. `plan_bands` scores the scrolling variant on that basis (squared
       spare cells first, rows only as a tie-break), and this is the layout that falls out:
       every ring holds exactly its own buttons and nothing is drawn as a strip.

       Scored the old way -- cells first, with a penalty for a band's unused columns -- the
       same board came out People 10x1, Actions 7x3, Describe 7x3, which is one fewer row
       and four half-empty rings. */
    var kb = keyboard_group(3, 10);
    kb.buttons.push({ id: 'kb-folder', kb_row: 4, kb_col: 1, kb_extra: true });
    kb.count = kb.buttons.length;
    var groups = [cat('people', 10), cat('actions', 20), cat('describe', 20), cat('words', 11),
                  cat('questions', 5), cat('how_when', 4), cat('things', 3),
                  cat('predictions', 3), cat('yes', 1), cat('no_not', 2), cat('social', 1),
                  cat('time', 1), kb];
    var packed = pack_category_tiles(groups, 14, { scrolling: true });
    var shape = {};
    packed.tiles.forEach(function(t) { shape[t.group.key] = t.w + 'x' + t.h; });

    assert.deepEqual(
      { people: shape.people, actions: shape.actions, describe: shape.describe },
      { people: '2x5', actions: '4x5', describe: '4x5' },
      'the three big vocabulary categories share one five-row band'
    );
    assert.deepEqual(
      { questions: shape.questions, how_when: shape.how_when, things: shape.things },
      { questions: '5x1', how_when: '4x1', things: '3x1' },
      'Questions, How & When and Things fit on ONE row'
    );
    assert.strictEqual(shape.words, '11x1', 'Connectors keeps its own row');

    var slack = [];
    ['people', 'actions', 'describe', 'words', 'questions', 'how_when', 'things'].forEach(function(key) {
      var t = packed.tiles.filter(function(x) { return x.group.key === key; })[0];
      var spare = (t.w * t.h) - t.group.count;
      if(spare !== 0) { slack.push(key + ' has ' + spare + ' spare cells'); }
    });
    assert.deepEqual(slack, [], 'no vocabulary ring carries a spare cell');
  });

  test('the non-scrolling variant still leads on total rows, not on ring fullness', function(assert) {
    /* The scoring change is scoped to the flex bands. With scrolling OFF the tiles are
       grid-placed and the rows are `1fr` under a definite height, so unused columns really
       are bare board and an extra row comes out of every button on the board -- fewest
       cells first is still correct there, and must stay. */
    var groups = [cat('people', 10), cat('actions', 20), cat('describe', 20), cat('words', 11),
                  cat('questions', 5), cat('how_when', 4), cat('things', 3)];
    var fixed = pack_category_tiles(groups, 14);
    var scrolled = pack_category_tiles(groups, 14, { scrolling: true });
    assert.ok(fixed.rows < scrolled.rows,
      'the fixed-height pack is shorter (' + fixed.rows + ' rows vs ' + scrolled.rows + '), ' +
      'because it is still paying for every row');
  });

  test('pack_category_tiles tolerates degenerate input', function(assert) {
    assert.deepEqual(pack_category_tiles([], 14), { tiles: [], rows: 0 });
    assert.deepEqual(pack_category_tiles(null, 14), { tiles: [], rows: 0 });
    // An empty category is not given a tile — an empty ring reads as a broken group.
    assert.deepEqual(pack_category_tiles([cat('social', 0)], 14), { tiles: [], rows: 0 });
    var packed = pack_category_tiles([cat('people', 4)], 0);
    assert.strictEqual(packed.tiles.length, 1, 'a zero column count is clamped, not fatal');
  });
});
