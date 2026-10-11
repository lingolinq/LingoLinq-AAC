# 2026-10-10: Modern home polish, side-rail menu, and Compressed View removal

Branch: `traci/fix/scots-review-fixes`. Committed 2026-10-10 as fae03c680 (backend removal and
backfill), 834c80410 (frontend Compressed View core), 5ef379097 (home), 49e48f854 (account rail),
95334e513 (View menu and locales), then this log. The idle-session work committed earlier the same
day is logged in `2026-10-09_basic-view-refinements.md`.

## What was asked, and what changed

### Modern home page
- **Pill nav at <=900px**: the bar is flush with the navbar on every pill-nav page. Its sticky
  offset is measured from inside `#content`'s top padding (see Learnings), so the offset now
  subtracts `--topbar-height` and a per-page `--ll-content-pad-extra` set beside the padding in
  the three rules that win it.
- **Account rail <=900px** is a dropdown placed below the pill nav (flex `order` on the shell);
  the old 2026-10-05 rule that zeroed its bottom margin at <=640px was removed (it pulled the page
  content up under the dropdown once the rail moved below the nav).
- **One page background at <=900px**: the wash is the shell's again, as a viewport-fixed
  `::before` layer, so `#content`'s own background never shows below a long page.
- **Shell / `.md-main` top padding** removed on the home page at <=900px (both layouts; Gentle's
  `.md-main` through `--dn-main-pad-top`).
- **Focused hero** renamed "Speak Mode" (key `speak_mode`), 100px shorter (120px; 94px badge),
  23px title at <=1024px. Above 1024px Create a Board and Extras stack beside it in column 2,
  sharing the hero's height equally; Edit Dashboard left the Focused home (the navbar's Display
  Style button opens the same editor). Extras shows on Focused as an action card with a drawn
  icon: a SECOND card chosen by CSS from the grid's layout class (see Learnings).
  Layout engine: `focusedLayout` builds the beside grid; `orderIndices` follow it by default, and
  follow the stacked `flowAreas` only when a Dashboard Design order is saved. Flag class
  `md-grid--speak-beside`.
- **Boards card**: up to 12 boards above 1024px, 6 at <=1024px, Crisis Vocabulary last and counted
  (`utils/preview-boards.js`, imported at the END of authenticated-view.js to hold the ESLint
  baseline). Full-size cards for 5 or fewer, above 1024px only, at most 3 per row; compact rows at
  <=1024px. Card sizes to content (the 400px `min-height` floor is gone; the 400px cap stays).
  The compact list needed `display: grid` of its own (the shared compact rule only shapes a grid).
- **Gentle cards scale with the screen**: Speak/Extras step down from 1100px; Create a Board / Edit
  Dashboard step text, icon, glyph, gap and padding together at 1100 / 900 / 600 (table in the
  `CREATE A BOARD / EDIT DASHBOARD SCALE DOWN` comment in app.scss).
- **Focused <=640px**: "View All Boards" reads "Boards" with a smaller arrow, aligned with
  "+ Create"; at <=500px both buttons share a second header row.

### Side rail (Modern account rail)
- Home page: the rail no longer auto-collapses above 900px (test split approved).
- Expanded: at most 12px between rows; a divider under Home Page on every page, Home Page 12px
  higher on tall screens to make room; the collapse arrow centred on that divider.
- Collapsed: 8px under the navbar, 4px between buttons, 8px at the Home Page divider, no divider
  above Home Board; the collapse arrow sits centred in the space under Home Page.
- Both expanded dividers (under Home Page, above Home Board) are centred at every width: the old
  fixed offsets sat 1-2px off above 1200px and up to 10px off at <=1200px (4px gap).
- 640px: the pill dropdown's top padding is 12px (was 8px), so the bar is 66px on both sides of
  640px and nothing below it jumps.
- The Up/Down scroll pager was removed entirely.

### View menu
- Summarized: one-line intro and descriptions at every size, tighter spacing, 330px wide on
  desktop (692px -> 439px tall). The long strings were removed from the locales.

### Compressed View removed from the project
- Frontend: View-menu toggle, body class and its state helper, account-rail and home-page
  branches, the compact caseload (template, tour selectors, stylesheet; the caseload header styles
  moved to `_caseload-head.scss`), the navbar's triggerless Display Style and the component's
  `@triggerless` mode, `_compressed-view.scss`, density-only rules, a QA script, and 17 locale
  keys only it used.
- Backend: `compressed_view` flag (`lib/feature_flags.rb`) and preference handling
  (`app/models/user.rb`). Both files kept their line numbers: the removed blocks became notes of
  the same length, because `docs/legal/CAPABILITY_LEDGER.md` and audit findings cite lines below.
- Data: `rake extras:backfill_remove_compressed_view_preference` (dry run by default, `FRD=1` to
  write; counts only). Run on local development: 54 users checked, 1 cleared, 0 left.
  **Not yet run on staging or production**; that waits for merge and deploy.
- Kept on purpose: `:not(.ll-density-compressed)` qualifiers (always match now; kept for
  specificity) and unset `--dn-*` density hooks (their fallbacks apply).

## Tests changed with approval (Rule #14)
- dashboard-sections-test.js: three Focused layout tests rewritten in place (same line counts, to
  hold the `.eslint-todo` anchors) for the beside layout; Extras/Edit Dashboard assertions swapped;
  org-manager test's sample gained Extras (keeps an even action-card count).
- dashboard-sections-layout-test.js and dashboard-grid-placement-test.js: same spec change.
- account-rail-collapse-test.js: "every page starts collapsed at <=1200px" split into home
  (expanded) and other pages (collapsed).
- Deleted (Compressed View only): compressed-view-state, view-switcher-compressed,
  dashboard-compressed-home, app-state-density-scope, display-style-triggerless (its default-render
  test kept as display-style-disc-test.js). Removed the Compressed View cases from user_spec.rb
  (replaced by two "no longer accepted" tests) and from feature_flags_spec.rb's forced-on inventory.
- New: preview-boards-test.js, the beside-layout module, backfill task spec.

## Verification
- Every visual change measured live (Playwright against `ember serve`) at the widths named in the
  request, plus a screenshot.
- Targeted Ember runs green (last: 234 tests across the affected areas); ESLint gate and template
  lint clean; user_spec.rb (430), feature_flags_spec.rb (50) and the task specs green.
- Each new red test was run against the old code first and failed for the stated reason.
- **The full Ember suite has not been run with all of today's changes together.**

## Open items
- Run the backfill on staging and production after deploy, and record when and the counts.
- Declined (2026-10-10): shorter Gentle buttons at <=600px, 2 full-size boards per row at
  1025-~1150px, Gentle Speak Mode heading -2px at <=1024px.
