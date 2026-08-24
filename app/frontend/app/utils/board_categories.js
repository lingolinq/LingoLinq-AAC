import i18n from './i18n';

/*
 * Fitzgerald category registry for board-detail grouping.
 *
 * ONE registry, two consumers: the grid that renders the grouped panels and the
 * edit-panel UI that reorders them. Keeping it here is deliberate -- LEARNINGS
 * ("when two surfaces must agree on the same set, put the registry in ONE shared
 * util") records what happens otherwise: the keys and availability rules drift.
 *
 * The colours are NOT redefined here. Each category points at the `--fitzgerald-*`
 * custom properties already emitted by styles/_variables.scss:204+, so editing a
 * Fitzgerald colour stays a one-place change and the grouped board cannot drift
 * from the button colours it sits behind.
 *
 * `types` are the raw part-of-speech values buttons already carry, so grouping
 * needs NO new per-button data and no migration for existing boards.
 */

// Order here is the DEFAULT order a user sees before they reorder anything.
// Roughly core-vocabulary-first: people and actions before describers, with the
// closed-class and catch-all groups last.
export const BOARD_CATEGORIES = [
  {
    key: 'people',
    labelKey: 'board_category_people',
    defaultLabel: "People",
    types: ['pronoun', 'nominative'],
    fillVar: '--fitzgerald-pronoun-yellow',
    textVar: '--fitzgerald-pronoun-yellow-text'
  },
  {
    key: 'actions',
    labelKey: 'board_category_actions',
    defaultLabel: "Actions",
    types: ['verb'],
    fillVar: '--fitzgerald-verb-green',
    textVar: '--fitzgerald-verb-green-text'
  },
  {
    key: 'describe',
    labelKey: 'board_category_describe',
    defaultLabel: "Describe",
    types: ['adjective'],
    fillVar: '--fitzgerald-adjective-blue',
    textVar: '--fitzgerald-adjective-blue-text'
  },
  {
    key: 'how_when',
    labelKey: 'board_category_how_when',
    defaultLabel: "How & When",
    types: ['adverb'],
    fillVar: '--fitzgerald-adverb-brown',
    textVar: '--fitzgerald-adverb-brown-text'
  },
  {
    key: 'places',
    labelKey: 'board_category_places',
    defaultLabel: "Places",
    types: ['preposition'],
    fillVar: '--fitzgerald-preposition-pink',
    textVar: '--fitzgerald-preposition-pink-text'
  },
  {
    key: 'questions',
    labelKey: 'board_category_questions',
    defaultLabel: "Questions",
    types: ['question'],
    fillVar: '--fitzgerald-question-purple',
    textVar: '--fitzgerald-question-purple-text'
  },
  {
    key: 'social',
    labelKey: 'board_category_social',
    defaultLabel: "Social",
    types: ['social', 'interjection'],
    fillVar: '--fitzgerald-social-pink',
    textVar: '--fitzgerald-social-pink-text'
  },
  {
    // `key` stays 'no_not' -- it is the value stored in a user's saved category
    // order, and normalize_order discards keys it does not recognise, so renaming
    // it would drop this category out of any order already saved. Label only.
    key: 'no_not',
    labelKey: 'board_category_nos_donts',
    defaultLabel: "No's and Don'ts",
    types: ['negation', 'expletive'],
    fillVar: '--fitzgerald-negation-red',
    textVar: '--fitzgerald-negation-red-text'
  },
  {
    // `key` stays 'words': it is the value stored in the user's saved category
    // order, so renaming it would silently drop this category out of any order
    // already saved (normalize_order discards keys it does not recognise). Only
    // the DISPLAYED label changed.
    key: 'words',
    labelKey: 'board_category_connectors',
    defaultLabel: "Connectors",
    types: ['determiner', 'article', 'conjunction', 'number'],
    fillVar: '--fitzgerald-determiner-gray',
    textVar: '--fitzgerald-determiner-gray-text'
  },
  {
    /* Keyboards get their OWN panel rather than falling in with Connectors.
       A keyboard is a different KIND of thing from vocabulary: a tool for spelling
       anything, not a word choice. Burying it among "the / and / because" makes it
       hard to find at exactly the moment a user has given up hunting for a word and
       wants to spell it instead. It has no part of speech, so it only landed in
       Connectors by COLOUR proximity — an accident, not a decision.
       No `types`: membership is decided by the load_board rule in
       category_for_button, not by part of speech. */
    key: 'keyboard',
    labelKey: 'board_category_keyboard',
    defaultLabel: "Keyboard",
    types: [],
    fillVar: '--fitzgerald-determiner-gray',
    textVar: '--fitzgerald-determiner-gray-text'
  },
  {
    // Board buttons whose vocalization is a special action (':clear', ':speak',
    // ':backspace', ':beep' -- see LingoLinq.special_actions, utils/button.js:1489).
    // These are BOARD CONTENT, not the sentence bar: the sentence bar and sidebar
    // are separate DOM outside the grid component and are never touched here.
    key: 'controls',
    labelKey: 'board_category_controls',
    defaultLabel: "Controls",
    types: [],
    fillVar: '--fitzgerald-other-blue',
    textVar: '--fitzgerald-other-blue-text'
  },
  {
    // Catch-all. Anything with no part_of_speech, or a type no category claims,
    // lands here rather than vanishing -- a button that cannot be classified must
    // still be reachable on the board.
    key: 'extra',
    labelKey: 'board_category_extra',
    defaultLabel: "Extra",
    types: [],
    fillVar: '--fitzgerald-conjunction-white',
    textVar: '--fitzgerald-conjunction-white-text'
  },
  {
    // Deliberately LAST in the default sequence, not third.
    // Columns are filled with consecutive runs of this order, so the final entry
    // lands at the bottom of the final column. Things is a large category on a
    // core board, and sitting third pushed it into column one where it forced
    // the other columns short and left the bottom edge uneven. Users who have
    // already saved a custom order keep theirs — "Reset order" adopts this one.
    key: 'things',
    labelKey: 'board_category_things',
    defaultLabel: "Things",
    types: ['noun'],
    fillVar: '--fitzgerald-noun-orange',
    textVar: '--fitzgerald-noun-orange-text'
  }
];

export const DEFAULT_CATEGORY_ORDER = BOARD_CATEGORIES.map(function(c) { return c.key; });

const BY_KEY = {};
BOARD_CATEGORIES.forEach(function(c) { BY_KEY[c.key] = c; });

// type -> category key, built once from the registry so the two can't disagree.
const TYPE_TO_KEY = {};
BOARD_CATEGORIES.forEach(function(c) {
  c.types.forEach(function(t) { TYPE_TO_KEY[t] = c.key; });
});

export function category_for_key(key) {
  return BY_KEY[key] || null;
}

export function label_for(key) {
  const cat = BY_KEY[key];
  if(!cat) { return ''; }
  return i18n.t(cat.labelKey, cat.defaultLabel);
}

/*
 * Reduce any CSS colour to a canonical #RRGGBB so two spellings of the same
 * colour compare equal.
 *
 * This has to handle more than hex. Buttons do NOT reliably store hex:
 * edit_manager.js:2184 writes `tinycolor(...).toRgbString()`, i.e.
 * 'rgb(255, 255, 170)', and paint mode writes whatever the palette entry held.
 * A hex-only parser silently returned null for those and dropped the button
 * through to the unreliable part_of_speech path -- which is precisely how a
 * correctly-coloured board still ended up with every category smeared into
 * Things.
 *
 * tinycolor is already loaded by the app (used in app.js darken20 and
 * edit_manager) and normalises rgb()/rgba()/hsl()/named colours, so it does the
 * work when present. The regex path is a fallback for the two hex forms only,
 * so this stays correct if tinycolor has not loaded yet.
 */
function normalize_color(value) {
  if(!value || typeof value !== 'string') { return null; }
  const raw = value.trim();
  if(!raw || raw === 'transparent' || raw === 'inherit' || raw === 'none') { return null; }

  if(typeof window !== 'undefined' && window.tinycolor) {
    try {
      const c = window.tinycolor(raw);
      if(c && c.isValid && c.isValid()) { return c.toHexString().toUpperCase(); }
    } catch(e) { /* fall through to the hex parser */ }
  }

  const hex = raw.replace(/^#/, '');
  if(/^[0-9a-fA-F]{3}$/.test(hex)) {
    return '#' + hex.split('').map(function(c) { return c + c; }).join('').toUpperCase();
  }
  if(/^[0-9a-fA-F]{6}$/.test(hex)) { return '#' + hex.toUpperCase(); }
  return null;
}

/*
 * fill colour -> category key.
 *
 * Built lazily from the app's OWN palettes so colours are never restated here.
 * board_detail_keyed_colors is consulted FIRST because it is the more precise of
 * the two: the legacy palette collapses preposition and social into one pink
 * (types: ['preposition','social']), which would file every "hello"/"goodbye"
 * under Places. The board-detail palette separates them (social-pink vs
 * preposition-rose), so it must win where both define a colour.
 *
 * Rebuilt on demand rather than cached at module load: the palette reads live
 * --fitzgerald-* custom properties, and LingoLinq.refresh_fitzgerald_colors()
 * can invalidate them (e.g. the "Colored Soft" background preference).
 */
function color_to_key_map() {
  const map = {};
  const add = function(palette) {
    (palette || []).forEach(function(entry) {
      if(!entry || !entry.fill || !entry.types || !entry.types.length) { return; }
      const hex = normalize_color(entry.fill);
      if(!hex || map[hex]) { return; }
      const key = TYPE_TO_KEY[entry.types[0]];
      if(key) { map[hex] = key; }
    });
  };
  const LL = (typeof window !== 'undefined' && window.LingoLinq) || null;
  if(LL) {
    add(LL.board_detail_keyed_colors);
    add(LL.keyed_colors);
  }
  return map;
}

/*
 * Largest RGB distance still treated as "this IS that palette colour".
 *
 * NEAREST-wins does the real work; this ceiling only stops a genuinely unrelated
 * colour (a teal, a brand purple) being dragged into whichever category happens
 * to be least far away.
 *
 * In the HSL metric below, units are roughly degrees of hue. A real board's "no"
 * (#FF7070) scores ~6 against the palette red -- same hue, slightly darker -- so
 * anything genuinely on-hue lands well inside this. An unrelated hue is 70+ away
 * on hue alone, so 45 accepts colour variants while still refusing to force a
 * teal or a brand purple into whichever category is least far away.
 */
const COLOR_MATCH_MAX_DISTANCE = 45;

/*
 * #RRGGBB -> {h (0-360), s (0-1), l (0-1)}.
 *
 * Comparison happens in HSL, NOT RGB, and that is not incidental. The Fitzgerald
 * palette is HUE-coded -- yellow people, green actions, red negations -- so hue is
 * the dimension that carries the meaning. Straight RGB distance does not respect
 * that: a real board's "no" (#FF7070) measures 82 from the palette red but 80.8
 * from adverb BROWN (#CCAA88), so brown won on the arithmetic while being nothing
 * like it to look at, and "no" landed in How & When.
 */
function to_hsl(hex) {
  const r = parseInt(hex.substr(1, 2), 16) / 255;
  const g = parseInt(hex.substr(3, 2), 16) / 255;
  const b = parseInt(hex.substr(5, 2), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  if(delta === 0) { return { h: 0, s: 0, l: l }; }

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h;
  if(max === r)      { h = 60 * (((g - b) / delta) % 6); }
  else if(max === g) { h = 60 * (((b - r) / delta) + 2); }
  else               { h = 60 * (((r - g) / delta) + 4); }
  if(h < 0) { h += 360; }
  return { h: h, s: s, l: l };
}

// Hue is a circle: 350 and 10 are 20 apart, not 340.
function hue_distance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/*
 * Perceptual-ish distance between two colours.
 *
 * Hue dominates because it is what the palette encodes. Saturation and lightness
 * still contribute at half weight, because two palette entries DO share a hue and
 * are separated only by those: social pink (#FFAACC) and preposition rose
 * (#FFCCDD) are 4 degrees apart, so hue alone could not tell Social from Places.
 *
 * Achromatic colours (grey, white) have no meaningful hue, so they are compared
 * on lightness alone and only against each other -- otherwise a mid grey drifts
 * toward whatever hue happens to be nearest zero.
 */
function color_distance(a, b) {
  const ACHROMATIC = 0.12;
  const aFlat = a.s < ACHROMATIC;
  const bFlat = b.s < ACHROMATIC;
  if(aFlat !== bFlat) { return Infinity; }
  if(aFlat && bFlat) { return Math.abs(a.l - b.l) * 100; }
  return hue_distance(a.h, b.h) +
         Math.abs(a.s - b.s) * 100 * 0.5 +
         Math.abs(a.l - b.l) * 100 * 0.5;
}

/*
 * Nearest palette colour, not exact equality.
 *
 * Exact matching was too brittle in two ways that both show up as "some buttons
 * are in the wrong category and others are fine":
 *
 *   1. The "Colored Soft" preference (.fitzgerald-soft, _variables.scss:260)
 *      REASSIGNS the --fitzgerald-* custom properties to desaturated variants.
 *      The palette is read from those properties, so under that preference every
 *      lookup compares muted palette values against vivid stored ones and misses.
 *   2. A board authored by hand, imported from OBF, or coloured before a palette
 *      revision can carry a red that is a few units off the current red.
 *
 * Nearest-wins handles both, and an exact hit is still trivially the nearest, so
 * nothing that worked before changes.
 */
function nearest_category_for_color(hex) {
  const map = color_to_key_map();
  const target = to_hsl(hex);
  let best = null;
  let bestDistance = Infinity;

  Object.keys(map).forEach(function(paletteHex) {
    const distance = color_distance(target, to_hsl(paletteHex));
    if(distance < bestDistance) {
      bestDistance = distance;
      best = map[paletteHex];
    }
  });

  return bestDistance <= COLOR_MATCH_MAX_DISTANCE ? best : null;
}

/*
 * The paintable swatch for a category: the actual fill/border/part-of-speech to
 * stamp on a button being MOVED into it.
 *
 * Moving a button between categories is a recolour, not a relocation -- the
 * category is derived from the colour, so the only way to move a button is to
 * give it that category's colour. Values come from the app's own palette (which
 * reads the live --fitzgerald-* properties, so it honours the "Colored Soft"
 * preference) rather than being restated here, so a painted button lands exactly
 * on the colour the categoriser will read back.
 */
export function swatch_for_category(key) {
  const cat = BY_KEY[key];
  if(!cat || !cat.types.length) { return null; }
  const LL = (typeof window !== 'undefined' && window.LingoLinq) || null;
  const palettes = LL ? [LL.board_detail_keyed_colors, LL.keyed_colors] : [];
  for(let i = 0; i < palettes.length; i++) {
    const palette = palettes[i] || [];
    for(let j = 0; j < palette.length; j++) {
      const entry = palette[j];
      if(entry && entry.fill && entry.types && entry.types.indexOf(cat.types[0]) >= 0) {
        return { fill: entry.fill, border: entry.border, part_of_speech: cat.types[0] };
      }
    }
  }
  return null;
}

/*
 * Which category a single button belongs to.
 *
 * COLOUR IS CHECKED BEFORE part_of_speech, and that ordering is the whole fix.
 * `check_for_parts_of_speech` (utils/button.js:821) only resolves part_of_speech
 * when `edit_mode` is on AND the button has no colour yet -- so in speak mode,
 * where grouping actually renders, part_of_speech is whatever the board data
 * happened to carry. On real boards that is frequently a stale or default 'noun',
 * which piled pronouns, verbs, prepositions and social words into Things while
 * each button visibly rendered its correct Fitzgerald colour from
 * `background_color`.
 *
 * The colour is the curated signal: it is what an author set, what the user sees,
 * and what a therapist points at. Grouping by anything else puts a yellow button
 * in an orange panel, which is worse than not grouping at all.
 */
export function category_for_button(btn) {
  if(!btn) { return 'extra'; }

  const voc = btn.vocalization;
  if(voc && typeof voc === 'string' && voc.charAt(0) === ':') { return 'controls'; }

  /* A folder that opens a KEYBOARD board is its own category. Detected by the board
     KEY suffix, matching how the rest of the app identifies these boards
     (models/board.js VARIANT_ROOT_SUFFIXES, board_hierarchy.js `key.match(/keyboard$/)`)
     rather than by the English label, which would not survive a translated board.
     Runs BEFORE the colour check below: keyboard buttons are usually grey, and grey is
     nearest to Connectors — which is exactly how they ended up filed there. */
  if(btn.load_board) {
    const lb_key = btn.load_board.key || btn.load_board.id || '';
    if(typeof lb_key === 'string' && /(^|[-_/])keyboard$/i.test(lb_key)) { return 'keyboard'; }
  }

  const hex = normalize_color(btn.background_color);
  if(hex) {
    const byColor = nearest_category_for_color(hex);
    if(byColor) { return byColor; }
  }

  const type = btn.part_of_speech || btn.painted_part_of_speech || btn.suggested_part_of_speech;
  if(type && TYPE_TO_KEY[type]) { return TYPE_TO_KEY[type]; }

  return 'extra';
}

/*
 * Validate a stored order against the registry.
 *
 * Unknown keys are dropped and missing keys appended in registry order, so a
 * preference saved before a category existed still opens, and a category removed
 * later cannot leave a hole. Never returns empty.
 */
export function normalize_order(stored) {
  const seen = {};
  const out = [];
  (Array.isArray(stored) ? stored : []).forEach(function(key) {
    if(BY_KEY[key] && !seen[key]) { seen[key] = true; out.push(key); }
  });
  DEFAULT_CATEGORY_ORDER.forEach(function(key) {
    if(!seen[key]) { out.push(key); }
  });
  return out;
}

/*
 * Flatten the grid's 2D `ordered_buttons` into panels, in the user's order.
 *
 * Empty categories are omitted rather than rendered as empty cards -- an AAC
 * board should not spend screen space on a group with nothing in it. Empty
 * placeholder cells are dropped for the same reason; they exist to hold grid
 * shape, and a grouped layout no longer has that shape to hold.
 */
// Buttons across inside one category panel. Exported so the CSS custom property
// and the column-weighting below cannot disagree about how many rows a category
// occupies.
/* Buttons across INSIDE a category panel.
   3, not 4: a narrower panel is what makes room for a FOURTH outer column on large
   boards (board-detail-grid.js#columnCount). Four columns of 3-across hold the same
   buttons as three columns of 4-across, but in a SHORTER stack — which is the point:
   the board gets wider rather than taller, so more of it is above the fold and less
   sits below it. Must stay in step with `--bd-group-inner-columns` in app.scss. */
export const GROUP_INNER_COLUMNS = 3;

/*
 * Split panels into explicit stacking columns.
 *
 * Pure on purpose: this is the part that decides how the board looks, so it is
 * verifiable in tests rather than by eye. CSS multi-column balances too, but it
 * never exposes WHICH panels landed in which column, so nothing can be told to
 * stretch and the bottom edge stays ragged. Explicit columns make the last panel
 * in each stretchable.
 *
 * Filled SEQUENTIALLY, not best-fit: the user chooses the category order, so
 * reading order down column 1 then column 2 has to survive. A column closes once
 * it has its share of the total, never leaving a later column empty.
 *
 * Weighted by ROWS -- ceil(buttons / inner columns), plus one for the header --
 * because rows are what drive a panel's height. Counting buttons instead would
 * treat a 4-button and a 5-button category as very different when they occupy
 * one and two rows.
 */
export function assign_columns(groups, column_count, inner_columns) {
  const list = groups || [];
  const cols = Math.max(1, column_count || 1);
  const inner = Math.max(1, inner_columns || GROUP_INNER_COLUMNS);
  if(cols === 1 || list.length <= 1) { return [list.slice()]; }

  const weight = function(g) {
    return Math.ceil((g.count || (g.buttons || []).length || 0) / inner) + 1;
  };
  const weights = list.map(weight);
  const total = weights.reduce(function(a, b) { return a + b; }, 0);

  /*
   * Pack columns as evenly as possible instead of closing each one the moment it
   * reaches an average share.
   *
   * The greedy version left visibly uneven bottoms: a category that pushed a
   * column just past its share closed that column early, and the leftover height
   * had to be absorbed by padding a panel out — which reads as a category with a
   * hole in it rather than a tidy board.
   *
   * This minimises the TALLEST column (classic linear partition). Binary search
   * the smallest ceiling for which a left-to-right fill still fits in `cols`
   * columns; the answer is exact, and because the fill only ever moves forwards,
   * the user's category order is preserved -- which the reorder panel depends on.
   */
  const fits = function(limit) {
    let used = 0;
    let needed = 1;
    for(let i = 0; i < weights.length; i++) {
      if(weights[i] > limit) { return false; }
      if(used + weights[i] > limit) { needed++; used = weights[i]; }
      else { used += weights[i]; }
    }
    return needed <= cols;
  };

  let lo = Math.max.apply(null, weights);
  let hi = total;
  while(lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if(fits(mid)) { hi = mid; } else { lo = mid + 1; }
  }

  const out = [];
  let current = [];
  let used = 0;
  list.forEach(function(g, i) {
    if(current.length && used + weights[i] > lo) {
      out.push(current);
      current = [];
      used = 0;
    }
    current.push(g);
    used += weights[i];
  });
  if(current.length) { out.push(current); }

  /*
   * The optimal packing can need FEWER columns than the grid has tracks, which
   * would leave a trailing track empty and a hole down the right-hand side. Split
   * the column holding the most categories until every track is used. Splitting
   * by position keeps the order intact.
   */
  while(out.length < cols && out.some(function(c) { return c.length > 1; })) {
    let biggest = 0;
    for(let i = 1; i < out.length; i++) {
      if(out[i].length > out[biggest].length) { biggest = i; }
    }
    const col = out[biggest];
    const at = Math.ceil(col.length / 2);
    out.splice(biggest, 1, col.slice(0, at), col.slice(at));
  }

  return out;
}

export function group_buttons(rows, order) {
  const keys = normalize_order(order);
  const buckets = {};
  keys.forEach(function(k) { buckets[k] = []; });

  (rows || []).forEach(function(row) {
    (row || []).forEach(function(btn) {
      if(!btn || btn.empty) { return; }
      const key = category_for_button(btn);
      // category_for_button can only return a registry key, but guard anyway so a
      // future edit to it can never drop buttons on the floor.
      (buckets[key] || buckets.extra).push(btn);
    });
  });

  return keys.filter(function(k) {
    return buckets[k] && buckets[k].length;
  }).map(function(k) {
    const cat = BY_KEY[k];
    return {
      key: k,
      label: label_for(k),
      fillVar: cat.fillVar,
      textVar: cat.textVar,
      buttons: buckets[k],
      count: buckets[k].length
    };
  });
}
