import { module, test } from 'qunit';
import {
  BOARD_CATEGORIES,
  DEFAULT_CATEGORY_ORDER,
  assign_columns,
  category_for_button,
  normalize_order,
  group_buttons
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
});
