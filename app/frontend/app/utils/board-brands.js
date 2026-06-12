/* Brand families for AAC page sets shipped with LingoLinq. Shared by the
   speak-mode "My Board Collection" panel (components/board-collection.js),
   which loads each brand into its own section, and the Find Boards page
   (controllers/search.js), which groups the search-results grid by brand.

   `query`   — server-side `q=` term board-collection uses to fetch a
               candidate set per brand.
   `test(b)` — client-side classifier: does this board belong to the brand?
               Server search matches tangentially-related boards by
               description/keyword, so we confirm the brand marker appears
               in the board KEY or NAME. This is what the grid grouping uses.
   `root_re` — ROOTS-ONLY guard board-collection uses to hide sub-boards in
               its brand sections (roots are `<brand>-<size>`, e.g.
               `vocal-flair-84`, optionally `-w-keyboard`; sub-boards carry a
               descriptive suffix). Not used by the grid grouping.
   Array order drives the rendered section/group order. */
export const BRAND_FAMILIES = [
  {
    id: 'communikate',
    label_key: 'communikate',
    default_label: 'CommuniKate',
    query: 'CommuniKate',
    root_re: /(^|\/)communikate(-home|-\d+)?$/i,
    test: function(board) {
      var key = (board && board.get && board.get('key')) || '';
      var name = (board && board.get && board.get('name')) || '';
      return /(?:^|\/|-)communikate\b/i.test(key) || /\bcommunikate\b/i.test(name);
    }
  },
  {
    id: 'quick_core',
    label_key: 'quick_core',
    default_label: 'Quick Core',
    query: 'Quick Core',
    /* Roots: `quick-core-60`, `core-112`, `core-blocks-112`, optional `-w-keyboard`.
       Sub-boards: `core-blocks-112-categories`, names like "Core Blocks 112 - …"
       or "Core 112 - at". Legacy slugs omit the `quick-` prefix on copies. */
    root_re: /(^|\/)(?:quick-core|core)(?:-blocks)?-\d+(-w(?:ith)?-keyboard)?$/i,
    test: function(board) {
      var key = (board && board.get && board.get('key')) || '';
      var name = (board && board.get && board.get('name')) || '';
      return /(?:^|\/|-)quick-core\b/i.test(key) ||
        /(?:^|\/|-)core-blocks\b/i.test(key) ||
        /(?:^|\/|-)core-\d+\b/i.test(key) ||
        /\bquick[\s-]?core\b/i.test(name) ||
        /\bcore\s+blocks\s+\d+\b/i.test(name) ||
        /\bcore\s+\d+\b/i.test(name);
    }
  },
  {
    id: 'sequoia',
    label_key: 'sequoia',
    default_label: 'Sequoia',
    query: 'Sequoia',
    root_re: /(^|\/)sequoia-\d+(-w(?:ith)?-keyboard)?$/i,
    test: function(board) {
      var key = (board && board.get && board.get('key')) || '';
      var name = (board && board.get && board.get('name')) || '';
      return /(?:^|\/|-)sequoia\b/i.test(key) || /\bsequoia\b/i.test(name);
    }
  },
  {
    id: 'vocal_flair',
    label_key: 'vocal_flair',
    default_label: 'Vocal Flair',
    query: 'Vocal Flair',
    root_re: /(^|\/)vocal-flair-\d+(-w(?:ith)?-keyboard)?$/i,
    test: function(board) {
      var key = (board && board.get && board.get('key')) || '';
      var name = (board && board.get && board.get('name')) || '';
      return /(?:^|\/|-)vocal-flair\b/i.test(key) || /\bvocal[\s-]?flair\b/i.test(name);
    }
  }
];

/* Group a flat list of boards into brand sections, preserving the input
   order within each group (so a pre-sorted list stays sorted per brand).
   Returns an ordered array of non-empty groups — BRAND_FAMILIES in order,
   then a trailing "Other Boards" group for anything that matches no brand
   (so nothing is dropped). Shape per group:
     { id, label_key, default_label, boards: [...] } */
export function groupBoardsByBrand(boards) {
  if (!boards || !boards.forEach) { return []; }
  var buckets = Object.create(null);
  BRAND_FAMILIES.forEach(function(f) { buckets[f.id] = []; });
  var other = [];
  boards.forEach(function(b) {
    if (!b) { return; }
    var matched = null;
    for (var i = 0; i < BRAND_FAMILIES.length; i++) {
      if (BRAND_FAMILIES[i].test(b)) { matched = BRAND_FAMILIES[i]; break; }
    }
    if (matched) { buckets[matched.id].push(b); }
    else { other.push(b); }
  });
  var groups = [];
  BRAND_FAMILIES.forEach(function(f) {
    if (buckets[f.id].length) {
      groups.push({ id: f.id, label_key: f.label_key, default_label: f.default_label, boards: buckets[f.id] });
    }
  });
  if (other.length) {
    groups.push({ id: 'other', label_key: 'other_boards', default_label: 'Other Boards', boards: other });
  }
  return groups;
}

export default BRAND_FAMILIES;
