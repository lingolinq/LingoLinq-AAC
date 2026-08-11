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
      /* Key slugs: quick-core*, core-blocks*, or core-NN (2+ digits) — avoid
         matching incidental slugs like user/core-5. Name patterns catch shipped
         set titles ("Core 112 - …", "Core Blocks 40 - …"). */
      return /(?:^|\/|-)quick-core\b/i.test(key) ||
        /(?:^|\/|-)core-blocks\b/i.test(key) ||
        /(^|\/)core-\d{2,}\b/i.test(key) ||
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
/* Brand families demoted into the "Other Boards" bucket on the Find Boards grid
   (they get no section of their own here). They still classify normally in the
   speak-mode "My Board Collection" drawer, which uses BRAND_FAMILIES directly —
   only this Find-Boards grouping skips them. */
var FIND_BOARD_DEMOTED_BRANDS = { communikate: true, sequoia: true };

export function groupBoardsByBrand(boards) {
  if (!boards || !boards.forEach) { return []; }
  var families = BRAND_FAMILIES.filter(function(f) { return !FIND_BOARD_DEMOTED_BRANDS[f.id]; });
  var buckets = Object.create(null);
  families.forEach(function(f) { buckets[f.id] = []; });
  var other = [];
  boards.forEach(function(b) {
    if (!b) { return; }
    var matched = null;
    for (var i = 0; i < families.length; i++) {
      if (families[i].test(b)) { matched = families[i]; break; }
    }
    if (matched) { buckets[matched.id].push(b); }
    else { other.push(b); }
  });
  var groups = [];
  families.forEach(function(f) {
    if (buckets[f.id].length) {
      groups.push({ id: f.id, label_key: f.label_key, default_label: f.default_label, boards: buckets[f.id] });
    }
  });
  if (other.length) {
    groups.push({ id: 'other', label_key: 'other_boards', default_label: 'Other Boards', boards: other });
  }
  return groups;
}

/* Which key `root_re` should be matched against for a given board.

   NOT always the board's own key. A copy keeps the source slug only until its
   owner renames it: the board-detail save flow auto-renames the KEY to match the
   new display name (`controllers/user/board-detail.js#_auto_rename_board` → POST
   `/api/v1/boards/:id/rename`). So renaming a copy of "Sequoia 15" turns
   `<user>/sequoia-15` into `<user>/sequoia-15-changed-with-a-really-long-name`,
   which by key SHAPE alone is indistinguishable from a genuine sub-board page
   like `<user>/sequoia-15-animals` — and the renamed ROOT then vanished from the
   owner's own My Boards list.

   The parent's key is the stable signal: a copy of the set ROOT has
   `parent_board_key = lingolinq/sequoia-15` (root-shaped), a copy of a page has
   `parent_board_key = lingolinq/sequoia-15-animals` (not), and a rename never
   touches the PARENT. Boards with no parent — originals, shallow clones, and the
   lite serializations that omit the field — fall back to their own key, i.e. the
   previous behavior. */
function brandRootMatchKey(board) {
  var parentKey = (board.get && board.get('parent_board_key')) || board.parent_board_key;
  if (parentKey) { return parentKey; }
  return (board.get && board.get('key')) || board.key || '';
}

/* True when a board is a brand-set ROOT tile (or not a brand board at all).
   A board is a brand SUB-board — the page copies that ride along inside a copied
   set, e.g. "CommuniKate alcohol", "Sequoia 15 animals" — when it matches a
   family's `test()` (brand marker in key/name) but its `brandRootMatchKey` does
   NOT match that family's `root_re` (the `<brand>-<size>` root shape). This is
   the KEY-pattern classifier the speak-menu brand sections use; it works even
   when the records have no `copy_id`, which is exactly the case `filterRootBoards`
   (copy_id-based) misses. Non-brand boards always pass. */
export function isBrandSetRoot(board) {
  if (!board) { return false; }
  var key = brandRootMatchKey(board);
  for (var i = 0; i < BRAND_FAMILIES.length; i++) {
    var fam = BRAND_FAMILIES[i];
    if (fam.test(board)) {
      // Brand board: keep only the root; drop the descriptive-suffix sub-boards.
      return fam.root_re ? fam.root_re.test(key) : true;
    }
  }
  return true; // not a known brand — leave it alone
}

/* Drop brand-family SUB-boards while keeping the brand ROOT tile and every
   non-brand board untouched. */
export function filterBrandRoots(boards) {
  if (!boards || !boards.filter) { return boards || []; }
  return boards.filter(isBrandSetRoot);
}

export default BRAND_FAMILIES;
