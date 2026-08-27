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
    defaultLabel: "No's and Dont's",
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
    textVar: '--fitzgerald-determiner-gray-text',
    /* A STRIP, not a block. "to / and / that / with / the / of" are the joins BETWEEN
       words: a user reaches for one on the way from one content word to the next rather
       than dwelling in the category. Stacked five rows deep beside People and Actions it
       reads as another block of vocabulary to search through; laid out as a single row
       underneath them it reads as what it is, and every word is one hop from the block
       above. Acted on by `lift_own_row_tiles`, and only in the scrolling variant, which is
       the one that can afford a row. */
    own_row: true
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
    /* Word-prediction SLOTS: the buttons whose label is replaced with whatever the
       predictor offers next (`vocalization: ':suggestion'`, the marker `models/board.js`
       finds them by in `refresh_suggestions` / `update_suggestion_button`).

       Its own category because it is the one group on the board whose CONTENT is not fixed.
       Filed by colour it lands wherever the board author happened to tint it — on the core
       boards, grey, which is Connectors — so three cells in the middle of the function words
       change under the user while everything around them stays put. Grouped together they
       read as one changing strip instead.

       No `types`: membership is the vocalization rule in `category_for_button`, which is
       also why the label is never consulted. A predictor's label is a different word every
       few seconds and a different word again in another locale.

       `own_row` for the same reason as Connectors — see there. */
    key: 'predictions',
    labelKey: 'board_category_predictions',
    defaultLabel: "Predictions",
    types: [],
    fillVar: '--fitzgerald-other-blue',
    textVar: '--fitzgerald-other-blue-text',
    own_row: true
  },
  {
    /* O'CLOCK on its own, beside Predictions.

       It sits at the end of the number row on a keyboard board, so it was swept into the
       key block with the digits — but it is a WORD, not a key: pressing it says something,
       where every key around it spells. Given its own category the number row is also the
       same ten wide as the letter rows, instead of an eleventh column that stood empty on
       every row but one.

       Membership is the AUTHORED-LABEL rule in `category_for_button`, so the button keeps
       the colour its author gave it; the swatch here only dresses the tile. */
    key: 'clock',
    labelKey: 'board_category_clock',
    defaultLabel: "Clock",
    types: [],
    fillVar: '--fitzgerald-other-blue',
    textVar: '--fitzgerald-other-blue-text'
  },
  {
    /* YES on its own, because an AAC "yes" is not a verb. On a real board it is Fitzgerald
       verb green, so the colour rule filed it in Actions — in the middle of the verbs, the
       one place a user answering a question will not look. Membership is the AUTHORED-LABEL
       rule in `category_for_button`, so the button KEEPS its green and nothing about the
       Fitzgerald key changes; the swatch here only dresses the tile's header and ring. */
    key: 'yes',
    labelKey: 'board_category_yes',
    defaultLabel: "Yes",
    types: [],
    fillVar: '--fitzgerald-verb-green',
    textVar: '--fitzgerald-verb-green-text'
  },
  {
    /* TIME: the "give me time to answer" phrase — a conversational control, not vocabulary.
       It is WHITE on a real board, and white is the Connectors colour, so it sat among
       "the / and / with". Same mechanism as Yes: authored label, colour untouched. */
    key: 'time',
    /* `key` stays 'time' — it is the value stored in a user's saved category order, and
       `normalize_order` drops keys it does not recognise, so renaming it would silently
       drop this category out of any order already saved. Only the LABEL changed.

       `labelKey` stays too. Changing an English default under an existing key normally
       strands the old translation — every other locale keeps confidently saying the old
       thing — but VERIFIED that is not the case here: `board_category_time` appears in none
       of the thirteen `public/locales/*.json` (of this whole registry only
       `board_category_keyboard` has ever been generated, en.json:8340). There is nothing to
       strand, so the key is reused rather than orphaned. It does mean this label, like its
       siblings, is still pending an `i18n_generator.rb --generate --merge` run. */
    labelKey: 'board_category_time',
    defaultLabel: "More Time",
    types: [],
    fillVar: '--fitzgerald-conjunction-white',
    textVar: '--fitzgerald-conjunction-white-text'
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

/*
 * i18n REGISTRATION for the labels above.
 *
 * `label_for` calls `i18n.t(cat.labelKey, cat.defaultLabel)` — both arguments are read off
 * the registry, so the key is never a literal and `i18n_generator.rb` cannot see it. It
 * scans raw LINES for `i18n.t('key', "default")`, comments included, which is what makes the
 * block below work: the calls never run, and the generator collects every category label
 * into `public/locales/*.json` exactly as if they did.
 *
 * Without this the keys are absent from every locale file and `i18n.t` falls back to the
 * English default — so a translated board still says "People" and "Connectors". That was the
 * state for all of these; the block is added with `predictions` rather than for it alone,
 * because a half-registered list is the same bug with fewer symptoms.
 *
 * Keep in step with BOARD_CATEGORIES. One line per entry, same key, same default:
 *   i18n.t('board_category_people', "People");
 *   i18n.t('board_category_actions', "Actions");
 *   i18n.t('board_category_describe', "Describe");
 *   i18n.t('board_category_how_when', "How & When");
 *   i18n.t('board_category_places', "Places");
 *   i18n.t('board_category_questions', "Questions");
 *   i18n.t('board_category_social', "Social");
 *   i18n.t('board_category_nos_donts', "No's and Dont's");
 *   i18n.t('board_category_connectors', "Connectors");
 *   i18n.t('board_category_keyboard', "Keyboard");
 *   i18n.t('board_category_full_keyboard', "Full Keyboard");
 *   i18n.t('board_category_emojis', "Emojis");
 *   i18n.t('board_category_predictions', "Predictions");
 *   i18n.t('board_category_clock', "Clock");
 *   i18n.t('board_category_yes', "Yes");
 *   i18n.t('board_category_time', "More Time");
 *   i18n.t('board_category_controls', "Controls");
 *   i18n.t('board_category_extra', "Extra");
 *   i18n.t('board_category_things', "Things");
 */

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

/* #RRGGBB, each channel scaled toward black.

   0.9, not the 0.8 the app's palette uses to derive a BORDER from a fill (`darken20`,
   app.js). A border is a hairline and wants the contrast; this is a large filled panel
   sitting directly behind the buttons it darkens, and at 0.8 it read as a different, muddier
   colour rather than as the same one behind them. Half that much keeps the panel visibly a
   frame while staying recognisably the buttons' own colour. */
function darken_hex(hex, factor) {
  const ch = function(i) {
    const v = Math.round(parseInt(hex.substr(i, 2), 16) * factor);
    return (v < 16 ? '0' : '') + Math.max(0, Math.min(255, v)).toString(16);
  };
  return ('#' + ch(1) + ch(3) + ch(5)).toUpperCase();
}

/*
 * The inline custom properties that tint one category's tile.
 *
 * Every category but one takes its colour from the registry, and that is right: a category
 * IS a Fitzgerald colour, so the tile and the buttons in it cannot disagree.
 *
 * PREDICTIONS is the exception, and the only one. Its membership is a vocalization rule
 * (`:suggestion`), not a colour, so its registry swatch is an arbitrary pick — bluish — and
 * the buttons inside it are whatever the board author tinted them. On a keyboard board they
 * are Fitzgerald verb-green, which put green buttons in a blue frame. So this category, and
 * only this category, takes its tint FROM its contents: the colour its buttons agree on,
 * darkened, which is the same relationship every other tile already has with its own.
 *
 * Falls back to the registry swatch when the buttons disagree or carry no readable colour —
 * a mixed set has no colour to match, and a wrong guess is worse than the neutral one.
 */
function group_swatch(key, buttons, cat) {
  const registry = '--bd-group-fill:var(' + cat.fillVar + ');--bd-group-text:var(' + cat.textVar + ')';
  if(key !== 'predictions') { return registry; }
  let hex = null;
  const agreed = (buttons || []).every(function(b) {
    const own = normalize_color(b && b.background_color);
    if(!own) { return false; }
    if(hex === null) { hex = own; }
    return own === hex;
  });
  if(!agreed || !hex) { return registry; }
  const by_color = nearest_category_for_color(hex);
  const text = (by_color && BY_KEY[by_color]) ? BY_KEY[by_color].textVar : cat.textVar;
  return '--bd-group-fill:' + darken_hex(hex, 0.9) + ';--bd-group-text:var(' + text + ')';
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
/*
 * Affirmations in the locales this app ships, plus the English spoken variants. Compared
 * against the AUTHORED label, lower-cased with accents and punctuation stripped.
 */
const YES_LABELS = [
  'yes', 'yeah', 'yep', 'yup', 'yes please',
  'si', 'oui', 'ja', 'sim', 'tak', 'da',
  'naam', 'hai', 'shi', 'dui', 'ta', 'seadh'
];

/* The "hold the floor" phrase, matched as a prefix: boards word it differently and every
   variant is the same button doing the same job. */
const TIME_LABEL_PATTERN = /^give me (a )?(time|minute|moment|second)/;

/* The clock word, matched on the AUTHORED label after `normalize_label` has dropped the
   apostrophe. Its own rule rather than a colour, because on a keyboard board it is painted
   the same blue as the digits it sits beside. */
const CLOCK_LABELS = ['oclock', 'o clock', 'clock'];

/*
 * Auxiliaries that OPEN a question: "do you ...", "is it ...", "can I ...", "will you ...".
 *
 * A SAFETY NET, not the route these words normally take. On the boards we ship they are
 * already painted question-purple and the colour rule claims them -- vocal-flair-112 paints
 * all four `rgb(226, 207, 255)`, which sits 3.88 from the palette purple and so lands well
 * inside COLOR_MATCH_MAX_DISTANCE. Nothing on that board reaches this list.
 *
 * The net is for the board that paints them verb-GREEN, which is the defensible Fitzgerald
 * reading of an auxiliary and which drops them into the middle of twenty content verbs --
 * the one place a user forming a question will not look. Same failure the `yes` rule above
 * exists to prevent, one category over.
 *
 * Applied ONLY to a verdict that would otherwise be Actions, and that restriction is what
 * makes it safe rather than clever: "can" is also a container and "will" is also a
 * document, so an orange or a blue one must stay where its author put it. A rule that can
 * only downgrade an Actions verdict can never reach those.
 *
 * English only, deliberately. YES_LABELS carries translations because "yes" is one
 * high-value word with a clean equivalent in every locale; auxiliaries are a different
 * problem -- most languages do not open a question with a separate word at all -- so a
 * translated list would be guesswork. A non-English board matches nothing here and keeps
 * its colour verdict, which is the safe outcome.
 */
const QUESTION_STARTER_LABELS = ['do', 'is', 'can', 'will'];

/*
 * Turn an Actions verdict for a question-starting auxiliary into a Questions verdict.
 * Runs against BOTH the colour verdict and the part_of_speech verdict, because a board can
 * arrive at Actions by either route and the net has to cover both.
 */
function redirect_question_starter(key, base) {
  if(key !== 'actions' || !base) { return key; }
  return QUESTION_STARTER_LABELS.indexOf(base) >= 0 ? 'questions' : key;
}

/* Lower-case, strip accents, drop anything that is not a letter, digit or single space. */
function normalize_label(value) {
  if(value == null) { return ''; }
  let text = String(value).toLowerCase();
  if(text.normalize) { text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  return text.replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
}

export function category_for_button(btn) {
  if(!btn) { return 'extra'; }

  const voc = btn.vocalization;
  /* A word-prediction SLOT, and BEFORE the generic special-action rule below, which would
     otherwise swallow it: `:suggestion` is a `:`-prefixed vocalization like any other. It is
     not a control — the user presses it to say a WORD, and which word is decided a moment
     before they press it.

     Two spellings of the same fact, because the button arrives here in two states. An
     authored button still carries `vocalization: ':suggestion'` (what `models/board.js`
     finds them by). A DISPLAY button has already been dressed as the word it is currently
     offering — its label is the prediction and the `:suggestion` is gone — so board-detail
     stamps `suggestion_slot` while the authored vocalization is still readable
     (`controllers/user/board-detail.js#_localized_button_fields`, carried through both
     `_make_btn` and `_make_ember_btn`). Never the LABEL, in either state: it is a different word
     every few seconds and a different word again in another locale. */
  if(btn.suggestion_slot || voc === ':suggestion') { return 'predictions'; }
  if(voc && typeof voc === 'string' && voc.charAt(0) === ':') { return 'controls'; }

  /* A folder that opens a KEYBOARD board is its own category. Detected by the board
     KEY suffix, matching how the rest of the app identifies these boards
     (models/board.js VARIANT_ROOT_SUFFIXES, board_hierarchy.js `key.match(/keyboard$/)`)
     rather than by the English label, which would not survive a translated board.
     Runs BEFORE the colour check below: keyboard buttons are usually grey, and grey is
     nearest to Connectors — which is exactly how they ended up filed there.

     `(_\d+)?` is not optional polish — it is what makes this work on a COPIED board set,
     which is what nearly every real user has. Board keys are disambiguated with a trailing
     `_<n>` (`generate_unique_key`, app/models/concerns/processable.rb:147-150), so copying a
     set turns `…/board-keyboard` into `…/board-keyboard_1`. Anchored on `keyboard$` alone
     that misses, the folder falls through to the colour rule, and grey files it under
     Connectors — the exact failure this rule exists to prevent. Verified against the dev
     database: `marcus_williams_slp/vocal-flair-112-keyboard_1`. */
  if(btn.load_board) {
    const lb_key = btn.load_board.key || btn.load_board.id || '';
    if(typeof lb_key === 'string' && /(^|[-_/])keyboard(_\d+)?$/i.test(lb_key)) { return 'keyboard'; }
  }

  /* YES and TIME, on the AUTHORED label and therefore BEFORE the colour rule — both are
     mis-filed by colour, and neither has a part of speech that separates it.

     The authored label, never the displayed one: `base_label` is the button's label in the
     board's own source locale, stamped by board-detail while the raw button is still
     readable. Translating a board rewrites `label` but not `base_label`, so a Spanish board
     keeps `yes` in Yes instead of scattering it back into Actions. */
  const base = normalize_label(btn.base_label != null ? btn.base_label : btn.label);
  if(base) {
    if(YES_LABELS.indexOf(base) >= 0) { return 'yes'; }
    if(TIME_LABEL_PATTERN.test(base)) { return 'time'; }
    if(CLOCK_LABELS.indexOf(base) >= 0) { return 'clock'; }
  }

  const hex = normalize_color(btn.background_color);
  if(hex) {
    const byColor = nearest_category_for_color(hex);
    if(byColor) { return redirect_question_starter(byColor, base); }
  }

  const type = btn.part_of_speech || btn.painted_part_of_speech || btn.suggested_part_of_speech;
  if(type && TYPE_TO_KEY[type]) { return redirect_question_starter(TYPE_TO_KEY[type], base); }

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

/*
 * The keyboard, as it is actually laid out — three rows of ten.
 *
 * Not just the letter runs: `.` opens the home row and `shift` / `space` / `?` bracket
 * the bottom one, which is what makes each row exactly ten and keeps the letters in the
 * staggered positions a speller reaches for. Tokens are NORMALISED labels (see
 * normalize_key_label), so a button labelled "[shift]" or "[ space ]" matches `shift`
 * and `space`.
 */
/*
 * The key block, as tokens to look for on the board.
 *
 * A slot may be an ARRAY, meaning "whichever of these this board actually carries". The
 * key right of `space` is the case that needs it: the inline keyboard on a vocabulary
 * board puts `?` there, while a full keyboard board puts `:`. One slot, two boards, and
 * only ever one of them present — an array says that without inventing a column that
 * stands empty on whichever board lacks the other.
 *
 * The NUMBER row is part of the block, not a separate category. Filed by colour those
 * buttons are Fitzgerald blue, so they came out as "Describe" — a row of digits sitting
 * under the adjectives, away from the keys they belong to, on a board whose whole purpose
 * is spelling. `o'clock` is NOT one of them: it is a word, not a key, and it has its own
 * category (see `clock`), which also leaves this row the same ten wide as the letter rows.
 *
 * Rows are not all the same width and do not have to be: `qwerty_positions` normalises
 * whatever it finds (see the end of that function), so a board with no digits keeps
 * exactly the three-row block it has today rather than gaining an empty row above it.
 */
export const QWERTY_LAYOUT = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['.', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'space', ['?', ':']]
];

/* Tracks in the keyboard panel — the width of the widest row. Nothing reads this today;
   kept exported and correct because the panel's real width comes from the placed keys
   (`kb_w` in pack_category_tiles), and a constant that disagreed with it would be a trap. */
export const QWERTY_COLUMNS = QWERTY_LAYOUT.reduce(function(w, row) {
  return Math.max(w, row.length);
}, 0);

/*
 * A category's name, where WHAT IT HOLDS changes what to call it.
 *
 * Two categories are defined by a rule rather than by a Fitzgerald colour, and on different
 * boards that rule collects genuinely different things. A fixed registry label then has to
 * describe both, and ends up describing neither.
 *
 *   keyboard -> "Full Keyboard" when the block carries the NUMBER ROW. The inline keyboard
 *     on a vocabulary board is letters and a little punctuation, for spelling a word the
 *     board does not have; a full keyboard board adds the digits and is where a user goes to
 *     type anything at all. Calling both "Keyboard" made the folder that opens the second
 *     look like a duplicate of the first. Read off the PLACED keys, not the board, so a
 *     stray "7" elsewhere cannot rename anything.
 *
 *   words -> "Emojis" when every button in it is one. This category is Connectors — "to /
 *     and / that / with" — but its membership is really "grey or white", and a keyboard
 *     board's emoji rows are white. A panel of nineteen emoji under the heading "Connectors"
 *     is simply mislabelled. ALL of them, not most: a mixed panel genuinely is connectors
 *     with some emoji among them, and Connectors is the honest name for that.
 *
 * Anything else takes its registry label unchanged.
 */
const EMOJI_PATTERN = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component})+$/u;

function group_label(key, buttons) {
  const list = buttons || [];
  if(key === 'keyboard') {
    const full = list.some(function(b) {
      return b && b.kb_row && /^[0-9]$/.test(normalize_key_label(b.label));
    });
    if(full) { return i18n.t('board_category_full_keyboard', "Full Keyboard"); }
  }
  if(key === 'words' && list.length) {
    const all_emoji = list.every(function(b) {
      const raw = (b && typeof b.label === 'string') ? b.label.trim() : '';
      return raw && EMOJI_PATTERN.test(raw);
    });
    if(all_emoji) { return i18n.t('board_category_emojis', "Emojis"); }
  }
  return label_for(key);
}

/* Letters only; the run gate counts these, not the punctuation. */
const QWERTY_LETTERS = 'qwertyuiopasdfghjklzxcvbnm'.split('');

/* How much of the alphabet has to be present before these buttons are treated as a
   KEYBOARD. A vocabulary board legitimately holds single-letter words ("a", "I") and a
   stray "q" is not a keyboard; requiring most of the alphabet means the letters only
   become keys when they clearly are keys. */
const QWERTY_MIN_RUN = 0.7;

/* "[shift]" -> "shift", "[ space ]" -> "space", "Q" -> "q".
   Boards label these keys inconsistently (brackets, spacing, case); the KEY is the
   same. Letters keep their exact case for the caller to disambiguate — see below. */
function normalize_key_label(raw) {
  return String(raw == null ? '' : raw)
    .replace(/[[\]]/g, '')
    .trim()
    .toLowerCase();
}

/*
 * Find the keyboard on a board and give each key its position.
 *
 * Returns a Map of button -> {row, col} (1-based). Board-level on purpose:
 * `category_for_button` sees one button at a time and cannot tell the word "a" from the
 * "a" between s and d — that distinction only exists with the whole board in view.
 */
export function qwerty_positions(rows) {
  /* Candidates, WITH their board position. A token can legitimately appear more than
     once: `vocal-flair-112` carries both the key `a` (white, no part of speech, id 72)
     and the word "a" (grey, conjunction, id 59). Taking the first match in board order
     handed the WORD to the keyboard — the home row rendered as a grey determiner sitting
     between "." and "s", and Connectors lost a word. Which one is the key is not
     knowable from the label; it is knowable from WHERE it sits, so the position travels
     with the candidate and the choice is made below.

     Exact case still ranks above normalised: the pronoun "I" sits beside the key "i" on
     the same boards, and there case alone settles it. */
  const exact = new Map();
  const loose = new Map();
  (rows || []).forEach(function(row, r) {
    (row || []).forEach(function(btn, c) {
      if(!btn || btn.empty) { return; }
      const raw = (btn && typeof btn.label === 'string') ? btn.label.trim() : '';
      if(!raw) { return; }
      const at = { btn: btn, r: r, c: c };
      if(!exact.has(raw)) { exact.set(raw, []); }
      exact.get(raw).push(at);
      const norm = normalize_key_label(raw);
      if(norm) {
        if(!loose.has(norm)) { loose.set(norm, []); }
        loose.get(norm).push(at);
      }
    });
  });
  const candidates = function(token) {
    const hits = exact.get(token);
    if(hits && hits.length) { return hits; }
    return loose.get(token) || [];
  };
  /* A layout slot is a token or a list of alternatives (see QWERTY_LAYOUT). Resolve to the
     first alternative this board actually carries, so the slot is filled by whichever key
     is present and stays empty when neither is. */
  const slot_candidates = function(slot) {
    if(!Array.isArray(slot)) { return candidates(slot); }
    for(let i = 0; i < slot.length; i++) {
      const hits = candidates(slot[i]);
      if(hits.length) { return hits; }
    }
    return [];
  };

  const found = QWERTY_LETTERS.filter(function(ch) { return candidates(ch).length > 0; });
  if(found.length < Math.ceil(QWERTY_LETTERS.length * QWERTY_MIN_RUN)) { return new Map(); }

  /* Where the keyboard SITS on the board, estimated from the tokens that are not
     ambiguous — most letters appear exactly once, and each one that does pins the
     block's origin at (its board cell) minus (its position in the layout). The median
     of those offsets is robust to a stray single-letter word that happens to be unique.

     With an origin, every token has a PREDICTED cell, which is what disambiguates the
     rest: the key `a` is the "a" one cell right of ".", not the "a" five rows down in
     Connectors. */
  const offsets_r = [];
  const offsets_c = [];
  QWERTY_LAYOUT.forEach(function(layout_row, lr) {
    layout_row.forEach(function(slot, lc) {
      const hits = slot_candidates(slot);
      if(hits.length !== 1) { return; }
      offsets_r.push(hits[0].r - lr);
      offsets_c.push(hits[0].c - lc);
    });
  });
  const median = function(list) {
    if(!list.length) { return 0; }
    const sorted = list.slice().sort(function(a, b) { return a - b; });
    return sorted[Math.floor(sorted.length / 2)];
  };
  const origin_r = median(offsets_r);
  const origin_c = median(offsets_c);

  const out = new Map();
  QWERTY_LAYOUT.forEach(function(layout_row, lr) {
    layout_row.forEach(function(slot, lc) {
      const hits = slot_candidates(slot);
      if(!hits.length) { return; }
      let best = null;
      let best_score = null;
      hits.forEach(function(at) {
        /* A key already placed earlier in the layout is not claimed twice — a board with
           one "." would otherwise land it in every slot that matches. */
        if(out.has(at.btn)) { return; }
        const score = Math.abs(at.r - (origin_r + lr)) + Math.abs(at.c - (origin_c + lc));
        if(best_score === null || score < best_score) { best = at; best_score = score; }
      });
      if(best) { out.set(best.btn, { row: lr + 1, col: lc + 1 }); }
    });
  });

  /* Normalise to the block that is ACTUALLY there.
   *
   * The layout is a superset — the number row, and the punctuation beside space, exist on a
   * full keyboard board and not on the inline keyboard a vocabulary board carries. Placing
   * against the raw layout would give that inline keyboard rows 2-4 and leave row 1 empty,
   * which the panel renders as a blank strip above the keys (and `kb_h` counts, so it also
   * changes how many board rows the block is given). Sliding everything back to (1,1) means
   * a board that has no digits keeps exactly the three-row block it has today.
   *
   * Both axes, and the minimum is taken across the WHOLE block rather than per row, so the
   * layout's internal offsets — `.` starting the home row, `shift` starting the bottom one —
   * survive untouched. */
  let min_r = null;
  let min_c = null;
  out.forEach(function(pos) {
    if(min_r === null || pos.row < min_r) { min_r = pos.row; }
    if(min_c === null || pos.col < min_c) { min_c = pos.col; }
  });
  if(min_r > 1 || min_c > 1) {
    out.forEach(function(pos) {
      pos.row -= (min_r - 1);
      pos.col -= (min_c - 1);
    });
  }
  return out;
}

/*
 * Category order for COMPACT mode (grouping on, scrolling off).
 *
 * Compact mode drops the panel boxes and flows every button into ONE grid, so the only
 * thing that separates categories is where they sit — which makes the order carry all
 * the meaning. Fixed lead, then the rest by size:
 *
 *   people (yellow) -> actions (green) -> describe (blue) -> everything else, largest
 *   first -> keyboard LAST
 *
 * The lead three are the Fitzgerald colours a speller scans for first and they sit
 * top-left, where reading order starts. After that, largest-first keeps the big blocks
 * whole near the top and leaves the small categories to fill the tail, which is what
 * stops a two-button category stranding a half-empty row in the middle of the board.
 *
 * The keyboard is pinned last regardless of size: it is a spatial layout that occupies
 * its own rows at the bottom (see qwerty_positions), not a block of vocabulary.
 *
 * NOTE this deliberately does NOT use the user's stored category order. That order
 * exists to arrange PANELS; compact mode has no panels, and honouring an arbitrary
 * order here would scatter the colour blocks the mode exists to line up. The stored
 * order still drives the panel layout when scrolling is on.
 */
export const COMPACT_LEAD = ['people', 'actions', 'describe'];

export function compact_order(groups) {
  const list = (groups || []).slice();
  const rank = function(g) {
    const lead = COMPACT_LEAD.indexOf(g.key);
    if(lead !== -1) { return [0, lead, 0]; }
    if(g.key === 'keyboard') { return [2, 0, 0]; }
    /* Negative count => larger first, without needing a second comparator. */
    return [1, -(g.count || 0), 0];
  };
  return list.sort(function(a, b) {
    const ra = rank(a);
    const rb = rank(b);
    return (ra[0] - rb[0]) || (ra[1] - rb[1]) || 0;
  });
}

/*
 * COMPACT tiling — one rectangle per category on the board's OWN grid.
 *
 * Compact mode used to flow every button into the board grid with the category shown as
 * a ring on each CELL, because a category whose cells wrap across rows occupies a
 * staircase and no single border can draw that. Giving the category ONE ring means
 * giving it one rectangle, which is what this packs.
 *
 * Pure on purpose, same as `assign_columns`: this decides how the board looks, so it is
 * verifiable in tests rather than by eye.
 *
 * Two properties the layout depends on and which the caller must preserve:
 *
 *   1. Every tile is `w` columns of the board wide and `h` rows tall, and its inner grid
 *      is exactly `w` x `h` equal tracks at the board's own gap with NO padding. That is
 *      what keeps a button in a 3-wide tile the same size as one in a 9-wide tile —
 *      padding would make button width a function of the tile's span, which is not a
 *      trade to make on a board a user has motor memory for.
 *   2. Rows are `minmax(0, 1fr)` under a definite grid height (LEARNINGS, "Board-detail
 *      board grid height is a load-bearing magic-number calc"), so a tiling that needs
 *      MORE rows than the board authored costs button HEIGHT and never introduces
 *      scrolling. Compact mode exists because the user cannot scroll.
 *
 * The keyboard is pinned BOTTOM-RIGHT: it is a spatial layout a speller navigates by
 * position, so it keeps its own shape (`qwerty_positions`) rather than being packed by
 * button count. The notch to its left is filled from the END of the order, which
 * `compact_order` has already sorted to the smallest categories — exactly what a few
 * spare columns can hold.
 */

/* Band heights the search considers. Raised automatically when a single category cannot
   fit the board width at this height. */
const COMPACT_MAX_BAND_ROWS = 10;

/*
 * Layout scores are TUPLES, summed component-wise across bands and compared
 * lexicographically. A tuple rather than a pair of numbers because the two variants rank
 * on different things and one of them needs three terms; see `score_band` in `plan_bands`.
 */
function add_score(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function better_score(a, b) {
  for(let i = 0; i < a.length; i++) {
    if(a[i] !== b[i]) { return a[i] < b[i]; }
  }
  return false;
}

function tile_count(group) {
  return (group && (group.count || (group.buttons || []).length)) || 0;
}

/*
 * Choose the bands.
 *
 * A band is a horizontal run of tiles that all share a height — they must, or the band
 * below has no shared row line to start on and the tiling develops holes. Within a band
 * a category of N buttons at height h is ceil(N / h) columns wide, so the band height is
 * the only real decision.
 *
 * This is a GLOBAL search (dynamic programming over the remaining categories), not a
 * greedy per-band one. Greedy was the whole defect: scoring each band on its own wasted
 * cells picked a 1-row band holding one 10-button category — locally the least waste on a
 * 14-column board — and left everything after it to pack around that decision. The board
 * came out as a stack of thin bands, each with its own ragged end.
 *
 * Minimising TOTAL cells (band height x board width, summed) is the same thing as
 * minimising total rows, which is also what keeps the buttons as large as possible: rows
 * are `1fr` under a definite grid height.
 *
 * Ties are broken on how CONCENTRATED the leftover space is, not how much of it there is
 * — the sum of SQUARED emptiness, counted per tile and per band of dead board. Total
 * emptiness cannot separate two layouts of equal height (they hold the same buttons in
 * the same number of cells), and it is concentration that reads as a fault: four spare
 * cells spread one-per-category is invisible, while the same four in one ring looks like
 * buttons have gone missing, and a 4x1 strip of bare board beside a category looks like
 * the board failed to draw. Squaring prefers the spread-out layout in both cases.
 *
 * Every prefix length is considered, not just the longest that fits, so the search is
 * free to leave a category for the next band when that packs better. Order is never
 * reshuffled: `compact_order` put the Fitzgerald lead colours first on purpose.
 *
 * Worked example, the 14-column board this was built against
 * (people 10, actions 21, describe 20, words 16, questions 5):
 *   greedy      -> 1-row band (people, 4 columns of bare board), then 3-row, then 2-row:
 *                  10 rows, three ragged band ends
 *   this search -> ONE 6-row band, widths 2 + 4 + 4 + 3 + 1 = 14 exactly: 6 rows above the
 *                  keyboard, no bare board at all, at most 4 spare cells in any one ring
 */
/*
 * Fit one band, shedding columns by DONATING buttons when the categories do not fit.
 *
 * A category of N buttons in a band `h` rows tall wants ceil(N / h) columns. When the
 * band's categories together want more columns than the board has, one of them can be
 * given a column less and its trailing buttons handed to the bottom band instead — the
 * `donation`. The cheapest donation is taken first, which is what picks the category
 * with a nearly-empty last row rather than one that is packed solid.
 *
 * This is the difference between a band that fits and one that does not, and on a real
 * board it is the difference between every ring being exactly full and every ring
 * carrying a half-empty final row. Worked example, 14 columns:
 *   people 10, actions 21, describe 20, words 15, questions 5
 *   h = 5 wants 2 + 5 + 4 + 3 + 1 = 15 columns — one too many, so no 5-row band exists
 *   donate 1 button from actions (cost 1; every other category costs 5) -> 2 + 4 + 4 + 3
 *   + 1 = 14, and all five rings hold exactly their buttons with nothing spare.
 * Without donations the search has to fall back to h = 6, where the widths do fit but
 * every one of the five rings gains a mostly-empty sixth row.
 *
 * Returns null when the band cannot be made to fit inside the donation budget.
 */
function fit_band(counts, h, columns, budget) {
  const w = counts.map(function(c) { return Math.ceil(c / h); });
  const donate = counts.map(function() { return 0; });
  let used = w.reduce(function(a, b) { return a + b; }, 0);
  let spent = 0;
  while(used > columns) {
    let pick = -1;
    let cost = null;
    for(let k = 0; k < w.length; k++) {
      /* Never shed a category to nothing — a zero-width tile is not a tile. */
      if(w[k] <= 1) { continue; }
      const remaining = counts[k] - donate[k];
      const need = Math.max(0, remaining - ((w[k] - 1) * h));
      /* And never donate a category away entirely; it has to keep a block of its own. */
      if(remaining - need < 1) { continue; }
      if(cost === null || need < cost) { cost = need; pick = k; }
      if(cost === 0) { break; }
    }
    if(pick < 0 || spent + cost > budget) { return null; }
    w[pick] -= 1;
    donate[pick] += cost;
    spent += cost;
    used -= 1;
  }
  return { w: w, donate: donate, used: used, spent: spent };
}

/*
 * Choose the bands.
 *
 * A band is a horizontal run of tiles that all share a height — they must, or the band
 * below has no shared row line to start on and the tiling develops holes. Within a band
 * a category of N buttons at height h is ceil(N / h) columns wide, so the band height
 * (and, now, which categories donate) is the whole decision.
 *
 * A GLOBAL search (dynamic programming over the remaining categories), not a greedy
 * per-band one. Greedy was the original defect: scoring each band on its own wasted cells
 * picked a 1-row band holding one 10-button category — locally the least waste on a
 * 14-column board — and left everything after it to pack around that decision.
 *
 * The state is (categories left, donation budget left): a donation spends from a budget
 * fixed by how many cells are free in the bottom band, so a band cannot promise the
 * bottom band more buttons than it can hold.
 *
 * Minimising TOTAL cells (band height x board width, summed) is the same as minimising
 * total rows, which is what keeps the buttons as large as possible — rows are `1fr` under
 * a definite grid height.
 *
 * Ties are broken on how CONCENTRATED the leftover space is, not how much of it there is
 * — the sum of SQUARED emptiness, per tile and per band of bare board. Total emptiness
 * cannot separate two layouts of equal height (same buttons, same cells), and it is
 * concentration that reads as a fault: four spare cells spread one-per-category is
 * invisible, while the same four in one ring looks like buttons have gone missing.
 *
 * Every prefix length is considered, not just the longest that fits, so the search may
 * leave a category for the next band when that packs better. Order is never reshuffled:
 * `compact_order` put the Fitzgerald lead colours first on purpose.
 */
/*
 * `flex` — the SCROLLING variant, whose bands render as flex rows rather than grid-placed
 * tiles. It changes what the search is allowed to believe about a band, and both changes
 * are corrections rather than preferences; see `score_band`.
 */
function plan_bands(list, columns, budget, flex) {
  const n = list.length;
  if(!n) { return { bands: [], spent: 0 }; }
  const counts = list.map(tile_count);
  let max_h = COMPACT_MAX_BAND_ROWS;
  counts.forEach(function(c) { max_h = Math.max(max_h, Math.ceil(c / columns)); });
  const cap = Math.max(0, Math.floor(budget) || 0);

  /*
   * One band's contribution to the layout score, as a tuple compared LEXICOGRAPHICALLY and
   * summed component-wise across bands. The two variants weigh different things because
   * they render differently, and each term below is a fact about one of them.
   *
   * GRID (scrolling off) -- unchanged from what shipped: `[cells, dead^2 + empty^2, -]`.
   * Tiles are placed on the board's own grid, so a band that does not use every column
   * really does leave bare board at its end, and rows are `1fr` under a definite height,
   * so every extra row comes straight out of every button on the board. Fewest cells
   * first, then the most evenly spread leftovers, is right there.
   *
   * FLEX (scrolling on) -- `[empty^2, rows, bands]`. Three differences, all of them things
   * the grid scorer asserts that are simply not true of a flex row:
   *
   *   1. NO `dead` TERM. A band's unused columns are not bare board: the tiles carry
   *      `flex-grow: w` and share that space out proportionally, so slack renders as
   *      WIDER BUTTONS in that band. Charging it as waste is what made the search break
   *      the vocabulary block into thin bands -- a 5-row band using 10 of 14 columns
   *      scored 20 dead cells (400 squared) against the 4-cell penalty of a 1-row band,
   *      so People was drawn as a 1x10 strip and Actions/Describe as 7x3.
   *   2. NO MODELLED STRETCH. `close_band_edge` is skipped for a flex band (see its call
   *      site) for the same reason -- there is no gap at the end of the row for the last
   *      tile to close. Modelling one invented spare cells INSIDE that tile's ring, which
   *      pushed the search to split a band rather than let one category absorb them.
   *   3. ROWS DEMOTED TO A TIE-BREAK. Scrolling rows are `minmax(--bd-scroll-row-min,
   *      auto)` and the board simply grows, so a row is nearly free -- the same reasoning
   *      `lift_column_tiles` already relies on. Minimising cells FIRST is a fixed-height
   *      objective; here what is actually visible is whether each ring holds exactly its
   *      own buttons, so squared emptiness leads and rows (then bands, i.e. horizontal
   *      seams) only separate layouts that tie on it.
   *
   * Measured consequence on the 14-column board: every ring comes out exactly full --
   * People 2x5, Actions 4x5, Describe 4x5, Connectors 11x1, Questions 5x1, How & When
   * 4x1, Things 3x1 -- and across a sweep of board shapes the flex scorer produced no
   * one-column slivers at all, where the grid scorer produced them on three of eight.
   */
  const score_band = function(h, tiles, used) {
    const slack = columns - used;
    const stretch = (!flex && slack > 0 && slack <= stretch_cap(columns)) ? slack : 0;
    let empty_sq = 0;
    tiles.forEach(function(t, idx) {
      const w = t.w + ((idx === tiles.length - 1) ? stretch : 0);
      const empty = (w * h) - (tile_count(t.group) - t.donate);
      empty_sq += empty * empty;
    });
    if(flex) { return [empty_sq, h, 1]; }
    const dead = (slack - stretch) * h;
    return [h * columns, (dead * dead) + empty_sq, 0];
  };

  /* best[i][b] = cheapest way to pack categories i..n-1 with b donations still available.
     Filled back to front so every `best[j + 1][...]` a candidate needs is already known. */
  const best = [];
  for(let i = 0; i <= n; i++) { best.push(new Array(cap + 1).fill(null)); }
  for(let b = 0; b <= cap; b++) { best[n][b] = { score: [0, 0, 0], bands: [], spent: 0 }; }

  for(let i = n - 1; i >= 0; i--) {
    for(let b = 0; b <= cap; b++) {
      let choice = null;
      for(let h = 1; h <= max_h; h++) {
        for(let j = i; j < n; j++) {
          const slice = counts.slice(i, j + 1);
          const fit = fit_band(slice, h, columns, b);
          /* Adding a category can only widen the band, so once a prefix cannot be made to
             fit, no longer one can either. */
          if(!fit) { break; }
          const rest = best[j + 1][b - fit.spent];
          if(!rest) { continue; }
          const tiles = [];
          for(let k = i; k <= j; k++) {
            tiles.push({ group: list[k], w: fit.w[k - i], donate: fit.donate[k - i] });
          }
          const score = add_score(score_band(h, tiles, fit.used), rest.score);
          if(!choice || better_score(score, choice.score)) {
            choice = {
              score: score,
              spent: fit.spent + rest.spent,
              bands: [{ h: h, tiles: tiles, used: fit.used }].concat(rest.bands)
            };
          }
        }
      }
      best[i][b] = choice;
    }
  }

  /* Unreachable for a non-empty list — h = ceil(count / columns) always fits the first
     category with no donation — but a packer that silently dropped categories would be
     far worse than one that fell back to full-width bands, so make the fallback explicit. */
  if(!best[0][cap]) {
    return {
      bands: list.map(function(g) {
        return { h: Math.max(1, Math.ceil(tile_count(g) / columns)),
                 tiles: [{ group: g, w: columns, donate: 0 }], used: columns };
      }),
      spent: 0
    };
  }
  return { bands: best[0][cap].bands, spent: best[0][cap].spent };
}

/*
 * Fill a fixed region — the notch beside the keyboard — row by row.
 *
 * The band planner above takes strict PREFIXES, because in the main body of the board
 * reading order is the layout and a packer that reshuffles categories would undo the
 * Fitzgerald ordering. The notch is not that: it is a bin a handful of small categories
 * drop into, and there the rule that matters is that each row comes out full.
 *
 * So this one may pull a later group FORWARD to close a row. Without it the notch cannot
 * reach three rows on the real board — Places (3 wide) leaves one column, the next
 * category in order is 2 wide and does not fit, and everything after is pushed onto a
 * fourth row that the keyboard's height has no room for. With the pull, Places is
 * completed by the next one-wide category and the whole notch lands in three rows.
 */
function fill_region(groups, width, pinned) {
  /* `pinned` — groups that must stay at the END, in the order given, instead of being
     pulled forward to close an earlier row. The pull below exists to stop the notch
     fragmenting, and it is right for ordinary categories; a pinned group is one that has
     been placed deliberately (see `notch_tail_order`) and must not be moved off its row.
     They are still allowed to close each OTHER's row — that is the point of pinning them
     as a run — so the skip applies only while the row was opened by an unpinned group. */
  const pin = new Set(pinned || []);
  const pending = (groups || []).filter(function(g) { return g && tile_count(g) > 0; });
  const tiles = [];
  let row = 1;
  while(pending.length) {
    const first = pending.shift();
    const n = tile_count(first);
    /* Too wide for one row: give it whole rows of its own rather than fragmenting it. */
    if(n > width) {
      const h = Math.ceil(n / width);
      tiles.push({ group: first, col: 1, row: row, w: width, h: h, iw: width, ih: h });
      row += h;
      continue;
    }
    const in_row = [{ group: first, col: 1, w: n }];
    const row_pinned = pin.has(first);
    let col = 1 + n;
    while(col <= width) {
      let idx = -1;
      for(let k = 0; k < pending.length; k++) {
        if(!row_pinned && pin.has(pending[k])) { continue; }
        if(tile_count(pending[k]) <= (width - col + 1)) { idx = k; break; }
      }
      if(idx < 0) { break; }
      const next = pending.splice(idx, 1)[0];
      const c = tile_count(next);
      in_row.push({ group: next, col: col, w: c });
      col += c;
    }
    /* Only after the pull has failed is a ragged edge worth absorbing — and only if the
       tile absorbing it stays more than half FULL.

       `close_band_edge` applies the same idea to a band and lets exactly-half through. The
       notch cannot afford that boundary, because its tiles are one or two columns wide: the
       smallest stretch available here is a ONE-button category widened to two cells, which
       is a tile 50% blank with the blank cell as big as the button beside it. That is
       precisely the "reads as a category whose buttons went missing" the band guard exists
       to prevent — it just does not bite at a band's scale. A one-button category is left
       one column wide instead, the way Social and Keys already are. */
    const slack = width - (col - 1);
    const last = in_row[in_row.length - 1];
    if(slack > 0 && slack <= stretch_cap(width) && tile_count(last.group) * 2 > last.w + slack) {
      last.w += slack;
    }
    in_row.forEach(function(t) {
      tiles.push({ group: t.group, col: t.col, row: row, w: t.w, h: 1, iw: t.w, ih: 1 });
    });
    row += 1;
  }
  return { tiles: tiles, rows: row - 1 };
}

/* The trailing buttons each donating category handed down, as tiles of their own. Kept
   in band order so the bottom band reads left to right the way the board above does. */
function collect_donations(bands) {
  const out = [];
  (bands || []).forEach(function(band) {
    (band.tiles || []).forEach(function(t) {
      if(!t.donate) { return; }
      const buttons = (t.group.buttons || []).slice(tile_count(t.group) - t.donate);
      if(!buttons.length) { return; }
      const spill = derived_group(t.group, buttons, '-spill');
      /* Its OWN key, so it is addressable on its own. It renders the parent category's
         colours and keeps its label, but it is a separate tile in a separate place on the
         board, and sharing `actions` meant a rule meant for this one-button tile also hit
         the 20-button Actions block. Named for the button it holds. */
      spill.key = (buttons.length === 1 && buttons[0] && typeof buttons[0].label === 'string')
        ? buttons[0].label.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_')
        : (spill.key + '_spill');
      /* Marked because its KEY cannot say what it is — it is named after the button it
         holds, so there is no fixed key a rule can match on. `notch_tail_order` needs to
         know: a one-button spill is small controls, not vocabulary, and belongs at the
         notch's foot rather than padding out the row above. */
      spill.is_spill = true;
      out.push(spill);
    });
  });
  return out;
}

/* A same-category tile holding a SLICE of a category's buttons. Used when a category
   donates its trailing buttons to the bottom band, and when the keyboard's non-key
   members are split off the keys. Carries the category's own label and colours, so two
   tiles of one category still read as that category. */
function derived_group(group, buttons, suffix, is_keyboard) {
  return {
    key: group.key,
    label: group.label,
    fillVar: group.fillVar,
    textVar: group.textVar,
    swatch_style: group.swatch_style,
    each_key: (group.each_key || ('cat-' + group.key)) + suffix,
    buttons: buttons,
    count: buttons.length,
    is_keyboard: !!is_keyboard
  };
}

/*
 * Close a SMALL ragged edge by widening the band's last tile; leave a large one as board.
 *
 * A couple of spare cells inside a ring read as a category with room left, which is
 * tidier than a notch cut out of the board. Past a point it inverts: a lone 5-button
 * category stretched across a 14-column board is a ring two-thirds empty, and that reads
 * as buttons having gone missing.
 */
/* How much ragged edge is worth absorbing rather than leaving as board. One definition,
   used both by the search that scores a candidate band and by the step that applies it. */
function stretch_cap(columns) {
  return Math.max(1, Math.floor(columns / 4));
}

function close_band_edge(band, columns) {
  const slack = columns - band.used;
  if(slack <= 0 || slack > stretch_cap(columns)) { return band; }
  const last = band.tiles[band.tiles.length - 1];
  /* Never stretch a tile past half empty. The cap above is a fraction of the BOARD, which
     says nothing about the tile absorbing the slack: on a 12-column board it let a
     one-button category grow from 1x2 to 2x2 — a ring with three empty cells and one
     button in it, which reads as a category whose buttons went missing. The band simply
     ends short instead; bare board beside a small tile is quieter than a hollow ring. */
  const count = tile_count(last.group);
  const height = band.h || 1;
  if(count * 2 < (last.w + slack) * height) { return band; }
  last.w += slack;
  band.used = columns;
  return band;
}

/*
 * SCROLLING ONLY: lift a one-column category out of a shared band onto a row of its own
 * directly beneath that band.
 *
 * The pathology this fixes. A band's height is shared by everything in it, so a small
 * category that joins a five-row band is drawn one column wide and five rows tall however
 * few buttons it has. On the 14-column board the search picks exactly that — people 2 +
 * actions 4 + describe 4 + connectors 3 + questions 1 = 14, a five-row band with not one
 * wasted cell, the best score available — and Questions comes out as a 1-wide sliver of
 * five stacked buttons beside four blocks three to four times its width. The score cannot
 * see the problem: a column of five cells holding five buttons is full.
 *
 * Re-laid as a row the same five buttons are 5 x 1 at the board's own button size, which
 * is the shape the rest of the board is already in.
 *
 * WHY SCROLLING ONLY. This costs a row, and the two variants pay for a row completely
 * differently. With scrolling off the grid holds a definite height and its rows are
 * `1fr`, so an extra row comes straight out of every button on the board — the mode
 * exists to fit a board a user cannot scroll, and trading everyone's button size for one
 * category's shape is the wrong trade there. With scrolling on the rows hold a floor
 * (`minmax(--bd-scroll-row-min, auto)`) and the board simply grows, so the row is free.
 *
 * WHAT IT DOES NOT DO. It never re-plans: the band search has already run, tiles keep
 * their order, and no category other than the lifted one changes band. The band it leaves
 * is handed back to `close_band_edge` by the caller's render loop exactly as any other
 * band is, so the column it vacated is absorbed by its neighbour under the same rule
 * (and its "never stretch a tile past half empty" guard) that shapes every other band
 * edge — that is the packer's existing answer to a short band, not a new one.
 *
 * Skipped for a DONATING tile: its width was chosen to make the band fit at all, and its
 * trailing buttons are already committed to the notch, so re-widening it here would be
 * reasoning about a split the notch has been packed against.
 */
/*
 * SCROLLING ONLY: give a category marked `own_row` a band to itself.
 *
 * Which categories, and why, is recorded on the registry entry (see `words`) rather than
 * here — this function only carries it out.
 *
 * The band is SPLIT, not the tile lifted to the end. A band's tiles are in reading order,
 * so pulling one out and appending it would move that category past everything that
 * followed it on the board. `[run before] [the row] [run after]` keeps the order intact,
 * and costs an extra band only when the category actually sits in the middle of one.
 *
 * The row's HEIGHT is the shortest that fits the board — one row for anything the board is
 * wide enough to hold in a single line, which is the case this exists for. If nothing up to
 * `COMPACT_MAX_BAND_ROWS` fits, the band is left exactly as the search planned it.
 *
 * Nothing here is edge-stretched, the row or the runs it leaves behind. Widening a tile
 * means adding a column of empty SLOTS — an empty slot inside a ring reads as a button gone
 * missing — and the flex band shares a row's unused columns out as WIDTH instead, so the
 * row fills without gaining cells. Same reasoning as the sliver lift below.
 *
 * A DONATING tile is skipped: its width was chosen to make its band fit at all and its
 * trailing buttons are already committed to the notch.
 */
function lift_own_row_tiles(bands, columns) {
  const own = function(t) {
    if(!t || t.donate) { return false; }
    const cat = category_for_key(t.group && t.group.key);
    return !!(cat && cat.own_row);
  };
  const out = [];
  (bands || []).forEach(function(band) {
    if(!band.tiles.some(own)) { out.push(band); return; }

    /* Solve every row's height BEFORE emitting anything, so a band holding one category
       that cannot be laid out in a single band is left untouched rather than half split. */
    const heights = new Map();
    let ok = true;
    band.tiles.forEach(function(t) {
      if(!own(t)) { return; }
      const n = tile_count(t.group);
      let h = 1;
      while(h < COMPACT_MAX_BAND_ROWS && Math.ceil(n / h) > columns) { h += 1; }
      if(Math.ceil(n / h) > columns) { ok = false; } else { heights.set(t, h); }
    });
    if(!ok) { out.push(band); return; }

    let run = [];
    const flush = function() {
      if(!run.length) { return; }
      out.push({ h: band.h, no_edge_stretch: true, tiles: run,
                 used: run.reduce(function(sum, t) { return sum + t.w; }, 0) });
      run = [];
    };
    band.tiles.forEach(function(t) {
      if(!own(t)) { run.push(t); return; }
      flush();
      const h = heights.get(t);
      const w = Math.ceil(tile_count(t.group) / h);
      out.push({ h: h, used: w, no_edge_stretch: true,
                 tiles: [{ group: t.group, w: w, donate: 0 }] });
    });
    flush();
  });
  return out;
}

function lift_column_tiles(bands, columns) {
  const out = [];
  (bands || []).forEach(function(band) {
    const lifted = [];
    const kept = [];
    band.tiles.forEach(function(t) {
      /* A one-column tile is only a SLIVER if the band is taller than it is wide and it
         has company — a category alone in a one-row band is already a row. */
      const sliver = band.tiles.length > 1 && band.h > 1 && t.w === 1 && !t.donate;
      (sliver ? lifted : kept).push(t);
    });
    if(!lifted.length || !kept.length) { out.push(band); return; }

    /* Shape the new row BEFORE touching the old band, so a band that cannot be re-laid is
       left exactly as the search planned it. `fit_band` is the same width solver the
       search uses, at no donation budget: the shortest height at which the lifted
       categories fit the board width side by side. h = 1 for anything the board is wide
       enough to hold in a single row, which is the case this exists for. */
    const counts = lifted.map(function(t) { return tile_count(t.group); });
    let h = 1;
    let fit = null;
    while(h <= COMPACT_MAX_BAND_ROWS && !fit) {
      fit = fit_band(counts, h, columns, 0);
      if(!fit) { h += 1; }
    }
    if(!fit) { out.push(band); return; }

    band.tiles = kept;
    band.used = kept.reduce(function(sum, t) { return sum + t.w; }, 0);
    /* The column the lift freed is left as BARE BOARD, not handed to the neighbour.
       `close_band_edge` would widen the last tile to absorb it, and because a tile's
       buttons are always one board column wide, widening means adding a column of empty
       SLOTS: Connectors would go from 3 x 5 holding fifteen buttons to 4 x 5 holding
       fifteen, and the helper's own "never stretch past half empty" guard does not catch
       it (fifteen in twenty is over half). On an AAC board an empty slot inside a ring
       reads as a button that has gone missing, which is worse than a quiet strip of board
       at the end of the row. */
    band.no_edge_stretch = true;
    out.push(band);
    out.push({
      h: h,
      used: fit.used,
      /* Marked so the caller can find it again — the lifted row is the one band that may
         still take a category, and only it (see `continue_into_lifted_row`). */
      lifted: true,
      no_edge_stretch: true,
      tiles: lifted.map(function(t, k) { return { group: t.group, w: fit.w[k], donate: 0 }; })
    });
  });
  return out;
}

/*
 * Continue the reading order into the lifted row: move the NEXT category into it, to the
 * right of the tile that was lifted.
 *
 * A lifted row starts out short. Questions re-laid as 5 x 1 on a 14-column board uses
 * five columns and leaves nine, and `close_band_edge` cannot help — its stretch cap is a
 * quarter of the board (3 here), and it refuses to grow a tile past half empty anyway, so
 * a five-button category is never widened to fourteen columns. An ordinary band closes
 * its edge by holding more categories; this one has to do the same.
 *
 * The next category in reading order is the front of `notch_groups` — the run the notch
 * was filled with, which is the tail of the order, so its first entry is the category
 * that would otherwise have come next. On the 14-column board that is How & When, and it
 * lands to the right of Questions on the same row.
 *
 * It keeps taking while the next category still fits, so the row is filled the only way
 * that does not distort anything: with more CATEGORIES. The alternative — widening the
 * tiles already there — would make their buttons wider than the rest of the board's, and
 * a button is the same size everywhere when categories are on. On the 14-column board the
 * run comes out exactly: Questions 5 + How & When 4 + Things 3 + No's 2 = 14.
 *
 * It stops before the notch would be stripped below one full row of its own — fewer
 * buttons left than the notch is wide. That is the point where the notch stops reading as
 * a block beside the keyboard and starts reading as a hole, and it is what keeps No's and
 * Don'ts down there: taking it would leave three buttons for a four-wide notch.
 *
 * The notch is then re-packed ONCE and the whole move is REVERTED if the result no longer
 * fits beside the keyboard: buttons fitting by count does not prove the rectangles do,
 * which is the same check the donation path makes.
 */
function continue_into_lifted_row(bands, notch_groups, donated, notch_w, kb_h, columns) {
  const band = (bands || []).filter(function(b) { return b && b.lifted; })[0];
  if(!band || !notch_groups.length || notch_w <= 0) { return null; }

  const take = [];
  const kept = [];
  let used = band.used;
  /* What the notch still has to show once the run has been taken out of it — INCLUDING the
     buttons donated down into it by the bands above. It renders both, so counting only its
     own categories under-reports what is left and stops the run a category early: on the
     14-column board it withheld Social, whose one button the notch could spare because the
     donated Actions overflow was already filling that cell. */
  let left_below = notch_groups.concat(donated || [])
    .reduce(function(sum, g) { return sum + tile_count(g); }, 0);
  /* SKIP rather than stop. A category is passed over for one of two reasons — it is wider
     than the row has left, or moving it would strip the notch below a full row of itself —
     and neither says anything about the categories after it. A smaller one may still fit,
     and on the 14-column board that is exactly what happens: How & When and Things go up,
     No's and Don'ts is too big for what the notch can spare, and Social (one button) goes
     up behind it and lands to the right of Things.
     Order among those taken is preserved, so the row still reads left to right. */
  /* The notch's FOOT is never promoted, however well it would fit. Those tiles are what
     give the notch its shape — the folder against the key block, the singles stacked under
     the vocabulary — so taking one up leaves the notch holding less than it was packed for
     AND costs the foot a member. Social is the case that made this explicit: one button,
     it fitted the lifted row easily, and it went up. `notch_tail_order` already declares
     which tiles those are, so ask it rather than keeping a second list here. */
  const foot = new Set(notch_tail_order(notch_groups.concat(donated || [])).pinned);
  notch_groups.forEach(function(next) {
    const need = Math.ceil(tile_count(next) / band.h);
    if(foot.has(next)) { kept.push(next); return; }
    if(need <= columns - used && left_below - tile_count(next) >= notch_w) {
      take.push({ group: next, w: need, donate: 0 });
      used += need;
      left_below -= tile_count(next);
    } else {
      kept.push(next);
    }
  });
  if(!take.length) { return null; }

  const remaining = kept;
  const tail = notch_tail_order(remaining.concat(donated));
  const repacked = fill_region(tail.list, notch_w, tail.pinned);
  if(repacked.rows > kb_h) { return null; }

  take.forEach(function(t) { band.tiles.push(t); });
  band.used = used;
  /* `kept` rather than a count: the run is no longer a prefix, so the caller cannot
     reconstruct what is left by slicing. */
  return { notch: repacked, kept: kept };
}

/*
 * The keyboard FOLDER tile goes last in the notch — the cell run to the left of the key
 * block — so it sits immediately beside the keyboard it opens.
 *
 * Order in the notch is otherwise "trailing categories, then whatever the bands donated",
 * and the folder is a trailing category while a donation (the Actions overflow that renders
 * as the `yes` tile) is not — so the folder came out to the LEFT of a tile it has nothing to
 * do with. Pulling it to the end swaps those two and puts the folder against the keys.
 *
 * Stable for everything else: the remaining tiles keep their relative order exactly.
 */
const NOTCH_TAIL_KEYS = ['social', 'predictions', 'clock', 'yes', 'no_not', 'time', 'keyboard_extra'];

/*
 * SCROLLING ONLY. The controls row: one full-width row directly above the keyboard, in this
 * order, replacing the notch beside it.
 *
 * The notch existed because the keyboard was ten columns of a fourteen-column board and
 * something had to fill the four beside it. Giving the key block the FULL width removes that
 * problem rather than solving it — the keys get wider, the controls get a row of their own
 * where they read left to right like everything else, and the two-dimensional
 * notch-plus-keyboard shape disappears.
 *
 * The keyboard pays for the row by spanning two board rows instead of three. Its inner grid
 * still has all three QWERTY rows — a speller navigates that block by POSITION, so reflowing
 * it to two rows of fifteen would move every key — the keys are simply shorter, which they
 * can afford: they are the tallest buttons on the board.
 */
const CONTROL_ROW_KEYS = ['predictions', 'clock', 'yes', 'no_not', 'social', 'time', 'keyboard_extra'];

/* Board rows the key block spans in the controls-row layout. */
const KEYBOARD_BOARD_ROWS = 2;

/*
 * The notch's FOOT: the one-button controls, stacked under the vocabulary block.
 *
 * The notch is a narrow column beside the keyboard, and the categories that land in it are
 * a two-button block (No's and Don'ts) plus a handful of single buttons — the folder that
 * opens the keyboard, Social, and whatever the bands donated down. Left to itself
 * `fill_region` pulls those singles FORWARD to finish the block's row, which is how a
 * one-button tile ends up padding out a row of vocabulary. Pinning them as a run keeps them
 * together at the foot, where they read as controls.
 *
 * Returning the pinned run as well as the list is what makes it stick — `fill_region` skips
 * a pinned group while the row was opened by an unpinned one, so the run can only ever
 * close its OWN rows.
 *
 * ORDER inside the run: donated spills first, then Social, then the Keys folder, then Time,
 * then Predictions, then Yes, then No's and Dont's. Time sits immediately LEFT of the Keys
 * folder (consecutive one-wide tiles share a row while the row has width for them); Yes and
 * No's and Dont's close the notch on the bottom row, in that order.
 *
 * No's and Dont's is in the run even though it is a two-button block rather than a control.
 * Unpinned it opened the notch's FIRST row and everything else stacked beneath it; pinned at
 * the end it falls to the bottom row beside Yes, which is where it was asked for.
 * (It used to be Social then the folder, on a single shared row. That was right while the
 * notch was packed to its full four columns; at the narrower width the render pack now uses
 * it puts Social on a row of its own, which is where Traci asked for it.)
 *
 * Predictions is LAST because it was asked to sit underneath Social. It is a trailing
 * category, so it lands in the notch on its own — but unpinned it opens the notch's second
 * row and pushes the whole foot run down, which read as the prediction slots heading the
 * controls rather than closing them. `own_row` cannot express this: that flag is acted on
 * by `lift_own_row_tiles`, which splits a BAND, and a notch member never reaches band
 * planning. Pinning it at the end of the foot is the notch-level equivalent, and it is free
 * — measured against the same notch (No's and Don'ts, a spill, the folder, Social,
 * Predictions), the render pack still chooses width 3 at 3 rows and the keyboard still gets
 * 11 columns; only the order changes:
 *     before   [No's and Don'ts] / [Predictions]        / [yes][Keys][Social]
 *     after    [No's and Don'ts] / [yes][Keys][Social]  / [Predictions]
 *
 * A spill has no fixed key to match on — it is named after the button it holds — so it is
 * identified by `is_spill` and only when it holds a single button. A multi-button spill is a
 * chunk of vocabulary and belongs in the block, not the foot.
 *
 * `keys` narrows the run to exactly those keys and takes no spills. The donation re-pack
 * passes `['keyboard_extra']` and ignores the `pinned` half, which is the folder-last rule
 * on its own. That call decides whether a DONATION survives, and a donation that is rejected
 * sends the band search back to a plan a row taller for the whole board: pinning there cost
 * the notch a row, the donation was refused, and the top band went from five rows to six.
 * The foot belongs to the pack that renders, not to the one that is only testing whether a
 * donation fits — which is also why the default run is reached ONLY from the scrolling
 * path, and the non-scrolling notch is unaffected by any of it.
 */
function notch_tail_order(list, keys) {
  const tail = [];
  if(!keys) {
    (list || []).forEach(function(g) {
      if(g && g.is_spill && tile_count(g) === 1) { tail.push(g); }
    });
  }
  (keys || NOTCH_TAIL_KEYS).forEach(function(key) {
    (list || []).forEach(function(g) { if(g && g.key === key && tail.indexOf(g) === -1) { tail.push(g); } });
  });
  if(!tail.length) { return { list: list, pinned: [] }; }
  const rest = (list || []).filter(function(g) { return tail.indexOf(g) === -1; });
  return { list: rest.concat(tail), pinned: tail };
}

/*
 * `options.scrolling` — whether the board is allowed to exceed the viewport
 * (`board_category_grouping.vertical_scroll`, which the grid carries as `--compact-scroll`).
 * It is the ONE input here that is not about the board's own shape, and it buys exactly
 * one thing: the freedom to spend a row. See `lift_column_tiles` for what that pays for
 * and why the non-scrolling board must not do the same. Absent means false, so a caller
 * that does not pass it gets the layout this function has always produced.
 */
export function pack_category_tiles(groups, columns, options) {
  const opts = options || {};
  const cols = Math.max(1, Math.floor(columns) || 1);
  const list = (groups || []).filter(function(g) { return g && tile_count(g) > 0; });
  if(!list.length) { return { tiles: [], rows: 0 }; }

  let kb = list.filter(function(g) { return g.is_keyboard; })[0] || null;
  const vocab = list.filter(function(g) { return g !== kb; });

  /*
   * A keyboard-category button with no QWERTY position is not a KEY — the folder that
   * OPENS a keyboard board is the real case. `group_buttons` parks those on a row below
   * the layout so they cannot displace a letter, which in a tiled compact board means the
   * keyboard's ring grows a fourth row holding one button and nine empty cells.
   *
   * Split them into a tile of their own instead. The keys keep the 3x10 shape a speller
   * navigates by position; the folder becomes an ordinary one-button tile the notch packs
   * like any other. Both derived groups carry the keyboard category's own label and
   * colours, so the two still read as the same category.
   *
   * `is_keyboard` is what the template keys the per-key `grid-row`/`grid-column`
   * placement off, so the extras group must NOT carry it — its buttons still hold the
   * kb_row group_buttons parked them on, and applying that inside a one-row tile would
   * place them outside their own tile.
   */
  if(kb) {
    /* `kb_extra` is stamped by group_buttons on anything in the keyboard category with no
       layout position of its own — the folder that OPENS a keyboard board is the real case.
       Read the flag rather than comparing the row against the layout's length: the layout is
       a superset of what any one board carries, so that comparison called a real key on a
       four-row board an extra. */
    const keys = (kb.buttons || []).filter(function(b) { return b && b.kb_row && !b.kb_extra; });
    const extras = (kb.buttons || []).filter(function(b) { return b && (!b.kb_row || b.kb_extra); });
    if(extras.length && keys.length) {
      const base = kb;
      kb = {
        key: base.key, label: base.label, fillVar: base.fillVar, textVar: base.textVar,
        each_key: (base.each_key || 'cat-keyboard') + '-keys',
        buttons: keys, count: keys.length, is_keyboard: true
      };
      vocab.push({
        /* `keyboard_extra`, not `keyboard`: this is the folder that OPENS a keyboard, a
           one-button tile parked in the bottom band, and it shares nothing but a colour
           with the 30-key block. One key for both meant a rule for either hit both.

           Its own LABEL too. Sharing the block's "Keyboard" put the same word on two tiles
           that do different things, and this one is a single small tile whose header has
           room for a short word at most. Written here rather than in BOARD_CATEGORIES
           because `keyboard_extra` is a derived group, not a category a user can order. */
        key: base.key + '_extra', label: i18n.t('board_category_keys', "Keys"), fillVar: base.fillVar, textVar: base.textVar,
        each_key: (base.each_key || 'cat-keyboard') + '-extra',
        buttons: extras, count: extras.length, is_keyboard: false
      });
    }
  }

  /* The keyboard's shape comes from the KEYS, not from a count: `qwerty_positions` has
     already placed them (and parked anything in the keyboard category without a layout
     position, the folder that opens a keyboard board, on a row below). */
  let kb_w = 0;
  let kb_h = 0;
  if(kb) {
    (kb.buttons || []).forEach(function(b) {
      if(!b || !b.kb_row) { return; }
      if(b.kb_row > kb_h) { kb_h = b.kb_row; }
      if(b.kb_col > kb_w) { kb_w = b.kb_col; }
    });
    kb_w = Math.max(1, kb_w);
    kb_h = Math.max(1, kb_h);
  }
  /* On a board NARROWER than a QWERTY row the keyboard cannot have one board column per
     key, so its tile spans what the board has while its inner grid keeps the full ten
     tracks — the keys come out smaller than the vocabulary buttons, but the layout a
     speller navigates by position survives, which is the whole reason the keyboard is
     placed rather than flowed. Every other tile has inner tracks == span. */
  /* A KEY BLOCK, not merely a keyboard category. `is_keyboard` is also carried by a board
     whose only keyboard button is the FOLDER that opens a keyboard elsewhere — the common
     case on a vocabulary board — and that group is one button with no QWERTY position, so
     `kb_w` and `kb_h` are both 1.

     Everything below this line reshapes the board around a real 10x3 block: the full width,
     the two-row span, and pulling the controls out of the band planning. Applied to a folder
     it stretched a single button across all fourteen columns and re-planned every band
     underneath it — measured on a real board, five vocabulary tiles moved. So the new layout
     is gated on there actually being keys to lay out; a folder-only board keeps exactly the
     geometry it had. */
  const has_key_block = !!kb && kb_h > 1 && kb_w > 1;
  const controls_layout = !!(opts.scrolling && has_key_block);

  /* Scrolling takes the whole width for the key block (see CONTROL_ROW_KEYS): with no
     columns left beside it there is no notch, and `notch_w` below falls to 0 on its own. */
  const kb_span = controls_layout ? cols : Math.min(cols, kb_w);
  const kb_rows = controls_layout ? Math.min(KEYBOARD_BOARD_ROWS, kb_h) : kb_h;

  /* Fill the notch to the LEFT of the keyboard from the tail of the order. Without this
     the bottom band is a keyboard with a hole beside it.

     The notch is packed by THIS function, recursively, against the notch width — it is
     the same problem on a smaller board. That matters: giving each of the trailing
     categories a full-height column instead put one button inside a four-cell ring.
     The recursion terminates because the sub-list never contains the keyboard.

     Take as many trailing categories as still pack within the keyboard's height. */
  /* Taken out before `plan_bands` sees them: they are a fixed row, not something the band
     search may reshape, and leaving them in would let the search spend them on filling a
     vocabulary band. Everything else the bottom of the board used to carry — donation
     spills, Controls, Extra — stays in `vocab` and packs into the bands above. */
  const control_row = [];
  if(controls_layout) {
    CONTROL_ROW_KEYS.forEach(function(key) {
      for(let i = 0; i < vocab.length; i++) {
        if(vocab[i] && vocab[i].key === key) {
          control_row.push(vocab.splice(i, 1)[0]);
          break;
        }
      }
    });
  }

  const notch_w = kb ? (cols - kb_span) : 0;
  let notch_groups = [];
  let notch = null;
  if(notch_w > 0) {
    let take = 0;
    while(take < vocab.length) {
      /* Deliberately the UNPINNED packing. This loop decides how many categories leave
         `vocab` for the notch, and `vocab` is what the band search plans over — so a
         different arrangement here does not just reshape the notch, it re-plans the whole
         board. Pinning makes `fill_region` need a row more for the same set, which made
         this loop stop a category earlier and moved every band above it. The pinned order
         is applied to the pack that RENDERS (below), where it changes only the notch. */
      const sub = fill_region(vocab.slice(vocab.length - (take + 1)), notch_w);
      if(sub.rows > kb_h) { break; }
      notch = sub;
      take += 1;
    }
    if(notch) {
      notch_groups = vocab.splice(vocab.length - take, take);
    }
  }

  /*
   * How many cells the notch has left over, and therefore how many buttons the bands
   * above may DONATE down into it.
   *
   * This is what unlocks a band that fits exactly. On the real 14-column board the five
   * vocabulary categories want 15 columns at five rows a piece, so without donations the
   * search has to use six rows and every ring gains a mostly-empty final row. One button
   * moved out of Actions makes it 14 — five rings, each holding exactly its own buttons —
   * and the notch had a free cell for it anyway.
   */
  const notch_free = notch_w > 0
    ? Math.max(0, (notch_w * kb_h) - notch_groups.reduce(function(sum, g) { return sum + tile_count(g); }, 0))
    : 0;

  let plan = plan_bands(vocab, cols, notch_free, !!opts.scrolling);
  let donated = collect_donations(plan.bands);

  /* Re-pack the notch with the donated tiles in it. Buttons fitting by COUNT does not
     prove the rectangles fit, so a notch that now needs more rows than the keyboard is
     tall is rejected and the whole layout falls back to donating nothing. */
  if(donated.length) {
    const tail = notch_tail_order(notch_groups.concat(donated), ['keyboard_extra']);
    const repacked = fill_region(tail.list, notch_w);
    if(repacked.rows <= kb_h) {
      notch = repacked;
    } else {
      plan = plan_bands(vocab, cols, 0, !!opts.scrolling);
      donated = [];
    }
  }

  /* AFTER the donation settle, never before: a re-plan on the fallback path above would
     throw away a lift computed against the first plan's bands. The notch and the keyboard
     are already out of `plan.bands`, so this can only ever move a vocabulary tile within
     the shelf above them. */
  if(opts.scrolling) {
    plan.bands = lift_column_tiles(plan.bands, cols);
    const cont = continue_into_lifted_row(plan.bands, notch_groups, donated, notch_w, kb_h, cols);
    if(cont) {
      notch_groups = cont.kept;
      notch = cont.notch;
    }

    /* LAST, and the order is load-bearing. The sliver lift only fires on a band holding
       more than one tile, and `continue_into_lifted_row` only fills a row the sliver lift
       made. Splitting the band first robs both: on the real 14-column board it left
       Questions alone in a five-row band one column wide, which a flex band then stretched
       to the full width — one button 1556px across. Measured. Splitting last leaves both
       steps the band they were planned against. */
    plan.bands = lift_own_row_tiles(plan.bands, cols);

    /*
     * The pack that RENDERS, at the NARROWEST width the notch still fits in.
     *
     * Two reasons it is done once here rather than left to whichever earlier pack ran last.
     * The donation test deliberately uses a narrower foot run (see `notch_tail_order`) and
     * `continue_into_lifted_row` returns null whenever it moves nothing, so on some paths
     * the notch the user sees was never packed with the foot rule at all.
     *
     * And the width. `notch_w` is what is LEFT of the board once the keyboard has its ten
     * columns — a budget, not a shape. Packing to it spreads four small tiles across four
     * columns and leaves the rows ragged; packing to the narrowest width that still fits
     * beside the keyboard stacks them into a block. In the scrolling variant that width
     * costs nothing, because the region sizes its own tracks to what the notch actually
     * reaches and hands the rest to the keyboard — narrower notch, wider keys.
     *
     * Scrolling only. The non-scrolling notch is packed against a fixed cell budget it has
     * to fill exactly, and reshaping it there would move every band above it.
     */
    if(notch_w > 0 && notch) {
      const tail = notch_tail_order(notch_groups.concat(donated));
      for(let w = 1; w <= notch_w; w++) {
        const shaped = fill_region(tail.list, w, tail.pinned);
        if(shaped.rows <= kb_h) { notch = shaped; break; }
      }
    }
  }

  /* The controls row, appended after every post-pass so none of them can reshape it:
     `lift_own_row_tiles` would otherwise SPLIT it around Predictions, which carries
     `own_row` for the band case and must not act here — this row IS its own row.

     Every tile is exactly its own button count wide, and the columns the row does not use
     are left ALONE for the flex band to share out.

     They used to be handed to Time and the Keys folder, which are single buttons, on the
     reasoning that a part-empty row reads as ragged. That reasoning belongs to a
     grid-placed row: this row only ever exists in the scrolling variant (`controls_layout`
     requires it), so it is always a flex band, and `flex: var(--bd-tile-columns) 0 …`
     already shares the leftover columns across every tile in PROPORTION to its width. All
     the stretch did was buy two single-button tiles three and four columns of mostly empty
     ring — Time 470px and Keys 622px around one 147px button — while the four tiles that
     hold real buttons stayed at their minimum. Left to the flex band the same slack raises
     every button in the row instead, and they all come out the same width, which is what
     stops the row reading as ragged in the first place.

     `used` is recorded so the band reports its true slack like every other band. */
  if(control_row.length) {
    const ctl = control_row.map(function(g) {
      return { group: g, w: Math.max(1, tile_count(g)), donate: 0 };
    });
    let used = ctl.reduce(function(a, t) { return a + t.w; }, 0);
    /* Narrow board: shed from the widest tile down rather than overflowing the row. There
       is no flex growth to fall back on when the tiles want MORE than the board has. */
    while(used > cols) {
      let widest = 0;
      for(let i = 1; i < ctl.length; i++) { if(ctl[i].w > ctl[widest].w) { widest = i; } }
      if(ctl[widest].w <= 1) { break; }
      ctl[widest].w -= 1;
      used -= 1;
    }
    plan.bands.push({ h: 1, tiles: ctl, used: used, no_edge_stretch: true });
  }

  const tiles = [];
  /*
   * The same tiling, described a second way: as horizontal BANDS plus the keyboard REGION.
   *
   * `tiles` is a flat list with an explicit `col`/`row` each, which is everything a grid
   * placement needs. It cannot express "share this band's unused columns evenly between
   * its categories", because a grid span is an integer and an even share of one column
   * between four tiles is a quarter of one. The band model exists so the scrolling variant
   * can lay a band out as a flex row instead, where a fractional share is just `flex-grow`.
   *
   * Both are returned and both describe the same layout — the caller picks. The keyboard
   * and the notch beside it are NOT a band (a 30-key block three rows tall with a
   * four-column notch alongside is two-dimensional), so they stay in `region` and keep
   * their `col`/`row`.
   */
  const bands = [];
  let row = 1;
  plan.bands.forEach(function(band) {
    /* `no_edge_stretch` is set only by the lift, on the two bands it disturbed — see the
       note there for why their leftover columns stay bare instead of being absorbed.

       Skipped ENTIRELY when scrolling, because the stretch answers a question a flex band
       does not ask. Its job is to stop a band ending in bare board by widening the last
       tile into the gap; a flex row has no gap — `flex-grow: w` has already shared those
       columns across every tile in the band, proportionally, which is both fairer and
       what makes the band's buttons come out uniform. Running it here only inflated the
       LAST tile's ring: on the 14-column board it grew Things from 3 buttons in 2x2 to 3
       buttons in 3x2, three empty cells for no gain. `plan_bands` stops modelling the
       stretch under the same flag, so the search and the render still agree. */
    if(!band.no_edge_stretch && !opts.scrolling) { close_band_edge(band, cols); }
    const band_groups = [];
    let col = 1;
    band.tiles.forEach(function(t) {
      /* A donating category renders only the buttons it kept; the rest are already a tile
         of their own in the notch. */
      const group = t.donate
        ? derived_group(t.group, (t.group.buttons || []).slice(0, tile_count(t.group) - t.donate), '-main')
        : t.group;
      tiles.push({ group: group, col: col, row: row, w: t.w, h: band.h, iw: t.w, ih: band.h });
      band_groups.push(group);
      col += t.w;
    });
    /* `slack` is what the flex layout has to share out: the columns this band does not
       use. It is 0 for a band that fills the board, which is most of them. */
    bands.push({ row: row, h: band.h, used: band.used, slack: cols - band.used,
                 groups: band_groups });
    row += band.h;
  });

  /*
   * The region, described twice for the same reason the bands are.
   *
   * On the BOARD's grid it is `notch_w + kb_span` equal columns, which is what `tiles`
   * carries and what the non-scrolling variant renders. That geometry is what holds the
   * region's buttons below the bands': a tile placed on equal board columns can only hold
   * a tray of `w*A + (w-1)*B`, and the `(w-1)*(boardGap - B)` it does not use is dead
   * board — 216px of it under the ten-column keyboard at 2280px. Raising A instead is not
   * available, because the per-button slack `(w-1)/w` is ZERO at one column and the notch
   * has a one-column tile.
   *
   * So the scrolling variant gets a second description: the region's OWN track list, one
   * button-wide track per notch column plus a single track for the keyboard. Those tracks
   * are not the board's, so they can be sized to the tray that actually goes in them (see
   * `--bd-region-btn-w` in app.scss). Coordinates are region-local — column 1 is the
   * notch's first column and row 1 is the region's first row — so the caller can place
   * them inside a container of its own without knowing where on the board it sits.
   */
  let region = null;
  if(kb) {
    /* Top-aligned inside the band, so the notch continues the reading order from the
       shelf above and any rows the sub-packing did not need fall at the bottom-left
       corner as plain board rather than as a gap inside the flow. */
    const region_row = row;
    const region_tiles = [];
    /* The notch's RENDERED width is what its tiles actually REACH, which is not always the
       `notch_w` the packing was planned against: a row whose last tile declines to stretch
       (see `fill_region`) leaves the final column empty in every row. On the board's own
       grid that column is bare board either way, but the region has a track list of its own,
       and a track nothing sits in would be a dead column between the last notch category and
       the keyboard. Sized to what is used, that width goes to the keyboard track instead —
       so the keys get it, and the region reads as one block. */
    let notch_used = 0;
    if(notch) {
      notch.tiles.forEach(function(t) {
        tiles.push({ group: t.group, col: t.col, row: region_row + t.row - 1, w: t.w, h: t.h, iw: t.iw, ih: t.ih });
        region_tiles.push({ group: t.group, col: t.col, row: t.row, w: t.w, h: t.h });
        notch_used = Math.max(notch_used, t.col + t.w - 1);
      });
    }
    /* `h` is board rows, `ih` is the key rows INSIDE. They were the same number until the
       controls row took one: the block now spans `kb_rows` rows of the board while its inner
       grid still has every QWERTY row, so the keys get shorter rather than moving. */
    tiles.push({ group: kb, col: cols - kb_span + 1, row: region_row, w: kb_span, h: kb_rows, iw: kb_w, ih: kb_h });
    /* ONE track wide whatever the board thinks: the keyboard's ten key columns live INSIDE
       its tray (`--bd-tile-columns`, stamped from `iw`), and the region's last track is
       sized to hold exactly that tray. */
    region_tiles.push({ group: kb, col: notch_used + 1, row: 1, w: 1, h: kb_rows });
    region = {
      row: region_row,
      rows: Math.max(kb_rows, notch ? notch.rows : 0),
      notch_cols: notch_used,
      kb_cols: kb_w,
      tiles: region_tiles
    };
    row += kb_rows;
  }

  /* Tiles come out in READING order (band by band, left to right). DOM order is what
     decides focus and screen-reader order, so it has to be the order a user reads. */
  return { tiles: tiles, rows: row - 1, bands: bands, region: region, columns: cols };
}

export function group_buttons(rows, order, button_overrides) {
  const keys = normalize_order(order);
  /* Per-button category assignments authored on the BOARD, keyed by button id. Wins over
     `category_for_button`, which is a classifier and therefore a guess: colour and part of
     speech get most buttons right, and the board author overrides the ones they do not.
     Keyed by ID rather than label because the id is what the GRID already references
     (`grid.order[row][col] = button.id`, board.rb:1122) and is therefore structurally
     stable across a copy — the cloner carries `buttons` and `grid` together, so renumbering
     would break the board itself. A label-keyed override would not survive translation.
     Ids are read as STRINGS: they arrive as JSON object keys, which are always strings,
     while `btn.id` is a number. */
  const overrides = (button_overrides && typeof button_overrides === 'object') ? button_overrides : {};
  const buckets = {};
  keys.forEach(function(k) { buckets[k] = []; });

  /* Board-level pass first: QWERTY keys can only be recognised by looking at the whole
     board (see qwerty_positions). Their position is stamped on the button so the
     keyboard panel can lay them out on a real keyboard grid instead of reflowing them
     into the panel's normal columns. */
  const qwerty = qwerty_positions(rows);

  (rows || []).forEach(function(row) {
    (row || []).forEach(function(btn) {
      if(!btn || btn.empty) { return; }
      /* An override only counts if it names a category the board is actually rendering.
         `keys` is the normalized order, so an override pointing at a key that was dropped
         (unknown, or removed from the registry) falls through to the classifier rather
         than putting the button in a bucket nothing draws. */
      const forced_raw = (btn.id === undefined || btn.id === null) ? null : overrides[String(btn.id)];
      const forced = (forced_raw && buckets[forced_raw]) ? forced_raw : null;
      /* Checked BEFORE the QWERTY pass, so an explicit assignment beats it. `qwerty_positions`
         is itself a heuristic — it claims a run of letters once ~70% of the alphabet is
         present — and it is exactly the kind of guess an author needs to be able to correct:
         `vocal-flair-112` carries both the KEY `a` and the WORD "a", and only position tells
         them apart. Overriding a key OUT of the keyboard leaves a gap in the keyboard's
         positional layout, which is the author's call to make and not ours to refuse. */
      const pos = forced ? null : qwerty.get(btn);
      if(pos) {
        btn.kb_row = pos.row;
        btn.kb_col = pos.col;
        btn.kb_extra = false;
        buckets.keyboard = buckets.keyboard || [];
        buckets.keyboard.push(btn);
        return;
      }
      /* Clear any stale stamp: the same button object is reused across regroups, so a
         button that stops qualifying — including one an override has just pulled out of
         the keyboard — must not keep a keyboard position. */
      if(btn.kb_row) { btn.kb_row = null; btn.kb_col = null; btn.kb_extra = false; }
      const key = forced || category_for_button(btn);
      // category_for_button can only return a registry key, but guard anyway so a
      // future edit to it can never drop buttons on the floor.
      (buckets[key] || buckets.extra).push(btn);
    });
  });

  /* Keys render in KEYBOARD order, not board order — the panel places each one
     explicitly by kb_row/kb_col, but DOM order still decides focus and screen-reader
     order, and tabbing through a keyboard should follow the keyboard. */
  /* Only when the board actually HAS keys. `vocal-flair-84` carries the folder that opens
     a keyboard but no letters of its own, and parking that folder below a layout that is
     not there set `kb_row = 4` on it — which made `is_keyboard` true, gave the category a
     phantom 4-row / 1-column shape, and had the compact packer reserve a 1x4 bottom-right
     band for a single button with three empty cells under it, pushing every other category
     into the notch beside it. A keyboard category with no keys is just a category. */
  const has_keys = (buckets.keyboard || []).some(function(b) { return b && b.kb_row; });
  if(has_keys && buckets.keyboard && buckets.keyboard.length) {
    /* A keyboard-category button with no QWERTY position — the folder that OPENS a
       keyboard board is the real case — is appended to the LAST row rather than left
       unplaced. Unplaced items auto-flow into the first free cell, which put the
       "keyboard" folder in the middle of the a..l row. On the authored board it sits at
       the end of the bottom row, so that is where it goes. */
    /* Anything in the keyboard category WITHOUT a layout position — the folder that
       OPENS a keyboard board is the real case — goes on a row BELOW the keyboard rather
       than into a key slot. The three rows are exactly ten wide and full; squeezing an
       extra item in would shift the letters out of the positions a speller reaches for.
       Unplaced items also auto-flow into the first free cell otherwise, which put the
       "keyboard" folder in the middle of the home row. */
    /* One row below the last row of KEYS THIS BOARD HAS, not below the layout table.
       The table is a superset — a board without the number row uses three of its four rows
       — so `QWERTY_LAYOUT.length + 1` parked the folder two rows under the keys and left an
       empty strip between them. `kb_extra` then says what the row number used to imply, so
       nothing downstream has to re-derive "is this a key or the parked folder" from
       arithmetic that a change to the layout can silently invalidate. */
    let lastRow = 0;
    buckets.keyboard.forEach(function(b) {
      if(b.kb_row && b.kb_row > lastRow) { lastRow = b.kb_row; }
    });
    lastRow += 1;
    let tail = 0;
    buckets.keyboard.forEach(function(b) {
      if(!b.kb_row) { tail += 1; b.kb_row = lastRow; b.kb_col = tail; b.kb_extra = true; }
    });
    buckets.keyboard.sort(function(a, b) {
      return (a.kb_row - b.kb_row) || (a.kb_col - b.kb_col);
    });
  }

  return keys.filter(function(k) {
    return buckets[k] && buckets[k].length;
  }).map(function(k) {
    const cat = BY_KEY[k];
    return {
      key: k,
      label: group_label(k, buckets[k]),
      fillVar: cat.fillVar,
      textVar: cat.textVar,
      swatch_style: group_swatch(k, buckets[k], cat),
      buttons: buckets[k],
      count: buckets[k].length,
      /* The keyboard panel is laid out on a real keyboard grid and spans the full board
         width, so the grid component pulls it out of the normal column packing. */
      is_keyboard: k === 'keyboard' && buckets[k].some(function(b) { return b.kb_row; })
    };
  });
}
