# 2026-10-05: Category layout rework (HANDOFF)

Handoff for a fresh session on `traci/feat/category-implementation`. Companion files:
- `docs/task-management/2026-10-05_category-layout-on-board.md`: running task log (fact sheet,
  proposal, adversarial review findings, decisions as they happened).
- Claude Docs page "Category Grouping: Current State" (state of the feature BEFORE this rework):
  https://claude.ai/code/artifact/f15a6b6b-9cf3-4343-941e-c8f079c2f396
- CI work that interrupted this (separate branch `traci/test/ci-test-stalls`, draft PR #1109):
  `docs/task-management/2026-10-05_ci-test-stalls.md` on that branch.

Rule #0 applies throughout: verify, never assume; label claims CONFIRMED (file:line / measured)
or ASSUMED. Use `/fix-proposal` discipline for behaviour changes (red test first, adversarial
review before editing, falsify after).

---

## 1. Branch state

- Branch `traci/feat/category-implementation` = develop `72de0d791` + fast-forward of the
  styling branch (`8a9393cbc`, PR #1108 work) + ONE WIP commit holding everything below.
- The WIP commit is NOT CI-clean: the eslint gate fails on shifted baseline rows (section 6, Q2).
  No PR is open for this branch.
- Local dev DB (per machine): the Vocal Flair 112 layout was seeded onto
  `lingolinq/vocal-flair-112`, `aiden_parker/vocal-flair-112`,
  `marcus_williams_slp/vocal-flair-112`, `marcus_williams_slp/vocal-flair-112_1`.
  Re-seed on another machine: `RAILS_ENV=development DB_USER=... PGPASSWORD=... FILE=lib/category_layouts/vocal_flair_112.json BOARDS=<keys> bundle exec rake lingolinq:seed_category_layout`.
- Frontend needs Node 22: `source ~/.nvm/nvm.sh && nvm use 22` (shell default is Node 16).
- See it locally: start Rails with `DEV_FEATURE_FLAGS=board_category_grouping`, log in as
  `marcus_williams_slp`/`demo2025!`, open `/marcus_williams_slp/board-detail/vocal-flair-112`, edit
  page -> Categorize -> "Group by category" on. Or run the QA script (section 5), which turns it
  on in memory without the server flag.

---

## 2. What Traci asked for (2026-10-05, in order)

1. Rework the category structure. Categories are saved to the user's board; the feature reads
   the board's buttons to decide how to order them.
2. Non-scrolling categorized view keeps the board's current rows and columns.
3. Fitzgerald grouping across the grid width: main categories first, default order People
   (yellow), Actions (green), Describe (blue), Connectors (gray), Questions (purple); each over
   two columns unless 5 or fewer buttons (then one column).
4. Keyboard order kept exactly; with a keyboard, the remaining categories go to its LEFT in row
   form.
5. Categories wrap as a grid inside outlined blocks; strays allowed ("some categories will not
   be able to fit perfectly ... may have a single stray").
6. Start with categories on; first board: originally "Vocal Flair 84 w/ keyboard", then
   corrected to **Vocal Flair 112** with Traci's map (below). "Follow it completely."

### Traci's map for Vocal Flair 112 (8 rows x 14 columns, all 112 buttons)

```
     0          1         2           3         4      5      6          7          8           9        10         11          12        13
0  people     I         actions     like      want   eat    feelings   describe   color/vis   good     questions  a           and       then
1  me         you       drink       think     go     play   in         on         same        bad      do         because     for       so
2  he         she       make        look      read   stop   out        off        different   new      is         more        of        away
3  we         us        open        get       put    have   here       up         big         old      can        that        the       again
4  they       it        come        feel      help   tell   there      down       little      done     will       to          with      social
5  places     time      categories  SMALLWDS  q      w      e          r          t           y        u          i           o         p
6  P*(pred)   P*(pred)  P*(pred)    TIME      .      a      s          d          f           g        h          j           k         l
7  not        no        yes         KEYBOARD  shift  z      x          c          v           b        n          m           [space]   ?
```
Blocks (outlined): People cols 0-1 rows 0-4; Actions 2-5; Describe 6-9; Questions 10; Connectors
11-12; How & When col 13 rows 0-3; Social (4,13); Things row 5 cols 0-2; Small Words (5,3);
Predictions row 6 cols 0-2 (the three `:suggestion` slots, stored labels give/need/use, live
labels change); More Time (6,3) = "Give me time to answer."; Negative (7,0-1); Yes (7,2);
Keyboard button (7,3) is its OWN outlined block, separate from the keys block (rows 5-7, cols
4-13). Each block fills row by row in Traci's order. This is encoded in
`lib/category_layouts/vocal_flair_112.json` (generated from the board, checked 112/112;
`labels` there is a check the seeder enforces).

NOTE: the map does NOT follow rule 3 literally (Actions/Describe span 4 columns, Connectors 2,
etc.); for this board the map wins. A generator that derives a layout from rules 3-5 for other
boards is a LATER phase and should be tested against this map.

### Decisions (Traci)
- Storage: board default layout saved ON the board and copied with it; each user's own edits
  later in a NEW database table (user, board, layout). Migration is additive and needs Traci's
  approval before it runs. ("if we are going to allow category editing, then boards need to
  categories per board, per user")
- Flag: local only, via a committed development-only switch (not registered in the flag lists).
- Edit mode with categories on: shows the board WITHOUT categories plus a message that editing
  is done without categories and applies when categories are off; to change the category layout,
  use Categorize ("they must do so in the Categories link").
- Grid size: the categorized view uses the board's own grid (VF112 is already 8x14).

---

## 3. What is built (in the WIP commit)

### Backend
- `lib/feature_flags.rb`: `FeatureFlags.dev_feature_flags` + call in `frontend_flags_for`.
  `DEV_FEATURE_FLAGS=a,b` turns flags on only when `Rails.env.development?`. Deployed
  environments run RAILS_ENV=production (`Dockerfile:52`), so it cannot apply there.
  Specs: `spec/lib/feature_flags_spec.rb` "DEV_FEATURE_FLAGS" (4 examples).
- `app/models/board.rb`:
  - `CATEGORY_LAYOUT_MAX_CELLS = 2500`, `CATEGORY_LAYOUT_MAX_BLOCKS = 500`.
  - `sanitize_category_layout(raw, match_grid)`: shape
    `{version:1, rows, columns, order:[[button_id|nil]], cells:[[block_index|nil]], blocks:[{category}]}`;
    ids must be board buttons, placed once, stored as the board's own id values; unknown category
    -> 'extra'; a dropped id clears its block; `match_grid` requires rows/columns == board grid.
  - `process_params` hook after the grid block: absent / null / '' = unchanged;
    `{clear: true}` removes; a JSON string is parsed; edit notes added.
  - `generate_defaults`: prunes dead ids on every save (not dims-enforcing, so a grid resize
    never discards a layout); layout added to `data_hash` ONLY when present (boards without one
    keep their exact revision: no offline re-download storm).
  - `parent_board_id` block in `process_params`: a client-side copy carries the parent's layout
    (the client never sends it).
- `app/cloners/board_cloner.rb`: carries `category_layout` (deep_dup) on server copies.
- `lib/json_api/board.rb`: emits `category_layout` on the full board only (not list summary).
- `app/models/user.rb`: `BOARD_CATEGORY_KEYS` += `small_words` (spec pins equality with the
  frontend registry by reading the JS).
- `lib/category_layout_seeder.rb`: `CategoryLayoutSeeder.run(board_key, file)` /
  `.apply(board_key, data)`; refuses (writes nothing) unless every id is on the board with the
  expected label; saves through `Board#process` under PaperTrail whodunnit `seed:category_layout`;
  confirms what was stored. Rake isn't audited: in deployed envs use
  `bin/audit_console runner 'CategoryLayoutSeeder.run(...)'`.
- `lib/tasks/lingolinq.rake`: `lingolinq:seed_category_layout FILE=... [BOARDS=...]`.
- `lib/category_layouts/vocal_flair_112.json`: the map (library content only, no user data).
- Specs: `spec/models/board_spec.rb` "category_layout" (11), `spec/lib/json_api/board_spec.rb`
  (1), `spec/lib/category_layout_seeder_spec.rb` (4). Full affected files: 902 examples, 0
  failures, 9 pending (pre-existing).

### Frontend
- `app/models/board.js`: `category_layout: attr('raw')`.
- `app/serializers/board.js` (new): `category_layout` never sent (`serialize: false`) so a stale
  session cannot overwrite; kept in the OFFLINE local copy (`options.localCopy`), same pattern as
  `serializers/user.js` supervisees. Test: `tests/unit/serializers/board-category-layout-test.js`.
- `app/utils/category_layout.js` (new): `resolve_category_layout(layout, button_rows)` -> cells in
  visual reading order with `btn`, `block`, `category`, `edges{top,right,bottom,left}` (outline
  where the BLOCK changes, not the category) and `order` (scan matrix by id); missing id -> empty
  cell (never a fallback); unplaced shown button -> first free cell (no block); returns null for
  unusable layouts. `is_keyboard_board_key(key)` shared rule. Test:
  `tests/unit/utils/category-layout-test.js` (10).
- `app/utils/board_categories.js`: registry entry `small_words` (white tint, before Things) + i18n
  registration line.
- `app/components/board-detail-grid.js`:
  - `groupingEnabled` returns false in edit mode (reverses the earlier "group in edit mode too").
  - `savedLayout` (grouping on + resolvable layout), `layoutGroup` (one group, `key:null` so it is
    `display: contents`; parallel arrays `cell_styles` / `cell_classes`), `groupedNoScroll`.
  - `compactCategories` / `compactScroll` false when a saved layout shows (no packer, no
    `--compact*`, no QWERTY kb_row placement).
  - `renderColumns` returns `[[layoutGroup]]` first.
  - Cell classes: `--layout`, `--cat-<key>`, `--edge-<side>`, `--board-<side>` (outer board sides).
- `app/components/board-detail-grid.hbs`: root class `md-board-detail-grid--category-layout`;
  `{{#each group.buttons as |btn idx|}}` and per-cell style/class via `(get group.cell_styles (concat idx))`.
- `app/styles/app.scss` (after `--grouped-no-scroll` rules): backing `::before` in the category
  tint reaching half the gap (not past the board's outer sides), 3px outline on block edges,
  rounded outer corners, `pointer-events: none` (taps/dwell land as on the plain board).
- `app/controllers/user/board-detail.js`: `category_layout_grid` (rows, columns, order) present
  exactly when the layout shows; import of `utils/category_layout`. Test:
  `tests/unit/controllers/user-board-detail-category-layout-test.js` (4).
- `app/utils/scanner.js` `scan_content`: reads `controller.category_layout_grid` before
  `model.grid` so switch scanning follows the displayed layout (adversarial review CRITICAL).
  Test: `tests/utils/scanner-test.js` new example.
- `app/templates/user/board-detail.hbs`: edit-panel note under Categorize when categories are on
  (`board_detail_categorized_edit_note`, reuses `.md-folder-style-locked-note`, hook class
  `md-board-edit-panel__categorized-note`).
- `app/frontend/scripts/category-layout-vf112-qa.mjs`: UI test (8 checks) — layout mode, 8x14,
  all 112 ids at their map cells, outlines exactly on block boundaries, no scrolling, edit mode
  shows plain board + note. Last run 8/8 PASS; falsified (removing the render line -> 3 FAIL).
  `node scripts/category-layout-vf112-qa.mjs --user marcus_williams_slp --pass 'demo2025!'`

All new tests were red before their code (or falsified by mutation), then green.

---

## 4. Adversarial review outcome (all addressed in the build above)

CRITICAL scanning order (fixed via `category_layout_grid`); HIGH drift (empty cell / first free
cell / server prune), HIGH QWERTY + compact CSS conflicts (own mode/class), HIGH edit mode
(Traci's decision); MEDIUM stale saves (client never sends), scrolling (layout ignores it),
reading order (one group, visual order), tap/dwell gaps (backing behind the button, pointer-events
none), audited seeding. Details: the task log.

---

## 5. Verification commands

```
# backend
RAILS_ENV=test DB_USER=<user> PGPASSWORD=<pw> bundle exec rspec spec/models/board_spec.rb -e category_layout spec/lib/category_layout_seeder_spec.rb spec/lib/feature_flags_spec.rb spec/lib/json_api/board_spec.rb
# frontend (Node 22)
cd app/frontend && npx ember test --filter "/category|scan_content|board category layout/i"
node scripts/category-layout-vf112-qa.mjs --user marcus_williams_slp --pass 'demo2025!'
npx --no-install sass --no-source-map --load-path=app/styles app/styles/app.scss > /dev/null
node scripts/eslint-todo-gate.js   # currently FAILS: shifted baseline rows, see Q2
```

---

## 6. Open questions for Traci (asked, not yet answered)

1. **Architecture.** Keep one board + saved categorized layout (built; recommended because one
   vocabulary means no drift between the two views) and add drag-and-drop editing in Categorize,
   OR make the categorized arrangement its own (copied) board so the normal editor works as-is
   (but two boards drift). Traci raised this ("is it better to have boards that are categorized
   saved as their own board ... so the edit screen would allow them to drag and drop").
2. **ESLint gate.** The WIP shifts baselined rows in 5 files: `app/controllers/user/board-detail.js`
   (52), `app/components/board-detail-grid.js` (4), `app/models/board.js` (11),
   `app/utils/scanner.js` (14), `tests/utils/scanner-test.js` (5). VERIFIED pure shift (same
   findings per file/rule/message). Options: (a) re-baseline those rows (Rule #14: needs explicit
   approval), (b) rearrange new code so no baselined row moves (add code only after each file's
   last baselined line; `grep "^<file>|" app/frontend/.eslint-todo | cut -d'|' -f3 | sort -n`).
3. **i18n.** `board_category_small_words` and `board_detail_categorized_edit_note` not yet in
   `public/locales/*.json` (`ruby i18n_generator.rb --generate --merge`; see memory notes on
   duplicates blocking generation).

---

## 7. Next phases (after the questions)

1. Resolve Q1-Q3; make the branch CI-clean; open a PR (run `/pr-preflight`, `/review-pr`,
   `/adversary-review`).
2. Per-user layouts: new table (user, board, layout jsonb) + API + resolution order
   (user layout > board default); migration approval first.
3. Editing in Categorize: drag/drop or move between blocks, writes the user's layout; the
   category order list (`category_ordering_available: false`, controller ~242) and the disabled
   move-to-category picker (controller ~7218) get redesigned around blocks.
4. Generator: derive a default layout from a board's buttons using Traci's rules (sections 2.2-2.5),
   tested against the Vocal Flair 112 map.
5. Before any non-local enablement: the recorded checklist in `lib/feature_flags.rb` (run
   `BoardCategoryGroupingReset.run`, add to `DISABLED_CANARY_FEATURES`, check stored Settings,
   beta opt-in only, rewrite the two "absent from lists" specs).

Known leftovers from the old feature (not touched): the TEMPORARY 50%-darker tray at
`app/styles/app.scss` ~84917; dead `panelLayout` path; copied-keyboard-board regex gap
(`is_keyboard_board_key` uses `keyboard$`, misses `-keyboard_1`); stale comments that the saved
order drives the packer.
