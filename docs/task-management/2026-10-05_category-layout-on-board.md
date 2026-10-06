# 2026-10-05: Category layout saved on the board (Vocal Flair 112 first)

Branch: `traci/feat/category-implementation`

## Request (Traci)

Rework category grouping. Categories are saved to the user's board; the feature reads the
board's buttons to decide placement. Non-scrolling view keeps the board's rows and columns.
Main categories first (People yellow, Actions green, Describe blue, Connectors gray,
Questions purple), keyboard order kept exactly, remaining categories to the keyboard's left in
row form. Categories wrap as a grid inside outlined blocks; strays are allowed.
Start with the Vocal Flair 112 board, laid out exactly as Traci's map (2026-10-05, 8 x 14).

Decisions (2026-10-05): saved on the board and copied with it; flag switched on locally with a
committed development-only switch; a board's own grid size is kept.

## Map (Vocal Flair 112, 8 rows x 14 columns)

Rows 0-4: People cols 0-1, Actions cols 2-5, Describe cols 6-9, Questions col 10, Connectors
cols 11-12, How & When col 13 rows 0-3, Social (4,13).
Rows 5-7, cols 0-3: Things places/time/categories + Small Words; prediction slots x3 + More
Time; not, no, yes, keyboard folder. Keys rows 5-7, cols 4-13, in the board's own order.
Each block fills row by row in Traci's order (People: people, I / me, you / he, she / we, us /
they, it).

## Fact sheet

- Board `lingolinq/vocal-flair-112` (id 879): 8 x 14, 112 buttons, all placed. CONFIRMED
  (rails runner, `BoardContent.load_content`). Copies: `aiden_parker/vocal-flair-112`,
  `marcus_williams_slp/vocal-flair-112`, `marcus_williams_slp/vocal-flair-112_1`.
- Every map label matches a board button, 112 of 112. CONFIRMED. The three P* cells are the
  `:suggestion` slots stored as give / need / use; their label is the live prediction.
- Board and user settings are encrypted at rest (psql shows ciphertext). CONFIRMED.
- Current grouping: client-side `category_for_button` + `pack_category_tiles`; nothing stored
  per board or button; saved order mostly ignored (`compact_order`). CONFIRMED, see
  `2026-10-05` current-state doc (Claude Docs "Category Grouping: Current State").
- Flag `board_category_grouping` resolves only from `AVAILABLE_FRONTEND_FEATURES`
  (`lib/feature_flags.rb:199-215`); no environment override exists. CONFIRMED.

## Learnings consulted

- `LEARNINGS.md` "when two surfaces must agree on the same set, put the registry in ONE shared
  util" (cited in `utils/board_categories.js` header).

## Proposal (for adversarial review before any code)

Storage, CONFIRMED anchors (agent map, spot-checked): settings is one encrypted hash
(`board.rb:77`); only buttons/grid/translations/intro/background are content-shared
(`board_content.rb:23`); `process_params` copies only keys it names (grid block
`board.rb:1974`); copies carry an allowlist (`app/cloners/board_cloner.rb:112-121`);
`current_revision` hashes grid/buttons/public/unlisted/translations only (`board.rb:964`);
board JSON emits listed keys (`lib/json_api/board.rb:23-28`); Ember `grid: attr('raw')`
(`models/board.js:907`).

Shape, board-own `settings['category_layout']`:
`{version: 1, rows, columns, order: [[button_id|null]...], cells: [[block_index|null]...],
blocks: [{category: '<key>'}...]}`. Outline between cells whose block differs (the map draws
a line between the keyboard folder and the keys, both category keyboard). A button's category
is its block's category.

Units, in order, each red test first:
1. Dev-only flag switch: `FeatureFlags.frontend_flags_for` adds names from
   `ENV['DEV_FEATURE_FLAGS']` only when `Rails.env.development?`. Spec: on in development
   with the var, off in test/production.
2. Backend: sanitize in `process_params` (ints within bounds, rows*columns <= 600, ids must be
   board buttons and appear once, block indexes valid, categories in BOARD_CATEGORY_KEYS,
   '' or nil clears); add to `data_hash`; emit in non-list JSON; carry in BoardCloner;
   `small_words` added to BOARD_CATEGORY_KEYS and the registry.
3. Frontend: `category_layout: attr('raw')` + `create_copy`; util that validates the layout
   against the display buttons and computes per-cell edges; board-detail-grid renders the
   saved layout (each button placed by grid-row/column on the board grid, one group per
   block with display:contents, cell padding instead of grid gap, category tint fill,
   outline on block-boundary sides) when grouping is on and the board has a valid layout;
   boards without one keep today's behaviour.
4. Seed: `lib/category_layouts/vocal_flair_112.json` (button ids + labels, no user data) and
   `rake lingolinq:seed_category_layout BOARD=<key>` that checks ids and labels, then saves.

Tests: RSpec (flag switch, process_params, revision, json, cloner, keys match); QUnit unit
(layout util, edges); QA script checking all 112 cells and the outlines against the map.

## Adversarial review (2026-10-05) and resulting changes

Findings verified before acting on them.
- CRITICAL, CONFIRMED: switch scanning builds rows from `model.grid.order`
  (`utils/scanner.js:572-594`), so a moved layout would scan out of visual order. Change: the
  board page exposes one displayed-order matrix (layout order when active, else grid.order);
  the scanner reads it; QUnit test that a row scan follows the map's rows.
- HIGH, drift (buttons added/deleted after the layout is saved): missing id renders an empty
  cell, an unplaced button takes the first free cell; server prunes dead ids on save.
  Validate after `process_buttons` (`board.rb:1946`).
- HIGH, QWERTY placement / compact CSS: the layout path gets its own mode and class; no
  `is_keyboard`, no `--compact` / `--compact-scroll`.
- HIGH, edit mode. Traci (2026-10-05): with categories on, edit mode shows the normal grid and
  a message that editing is done without categories and applies to the board when categories
  are off.
- MEDIUM: stale saves re-send the raw attr. Change: layout sent only by the seed (later the
  editor); null / absent / '' = unchanged; clearing only by an explicit flag.
- MEDIUM: the layout ignores the scrolling preference (always the board's own tracks).
- MEDIUM: one group, cells in visual row order (DOM order = visual order); the gap is padding
  inside `.button` so a dwell or tap in the gap still hits a button.
- MEDIUM: seed through `bin/audit_console runner`; the source board, plus the seeded local
  test accounts' copies (local only).
- LOW, CONFIRMED: all Cloud Run environments set RAILS_ENV=production (`Dockerfile:52`), so the
  dev-only switch cannot apply there. Keep it outside the AVAILABLE loop; stub Rails.env in
  specs.
- LOW: `small_words` must be added to BOARD_CATEGORY_KEYS, the registry, the i18n
  registration comment and locales, a tint, and the Coming Soon chips.

## Status

Paused 2026-10-05 for the CI stalls work. Units 1-4 built and tested; see
`2026-10-05_category-layout-HANDOFF.md` for the full state, open questions and next phases.
