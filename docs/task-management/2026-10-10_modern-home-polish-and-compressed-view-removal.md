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
- Full Ember suite on the final tree (2026-10-10, 19:00 MDT): 3353 tests, 0 failed (37 skip,
  5 todo).
- Full RSpec (2026-10-10, 19:21-19:38 MDT, with `1d0f76e61`'s UTC pin and `/usr/bin` paths):
  7840 examples, 0 failures, 51 pending. Without the pin, the same suite had failed 11 in the
  evening in America/Denver (UTC date rollover, and macOS has no `/bin/false`).

## Open items
- Run the backfill on staging and production after deploy, and record when and the counts.
- Declined (2026-10-10): shorter Gentle buttons at <=600px, 2 full-size boards per row at
  1025-~1150px, Gentle Speak Mode heading -2px at <=1024px.

## Pre-PR review (2026-10-11)

`/review-pr` and `/adversary-review` could not run on this machine: the PII guard
(`~/ai-company-brain/scripts/review-preflight.sh`) and the `adversary` agent are not installed. As a
substitute, three red-team agents each reviewed one slice of the branch against `origin/develop`
(session and routing; Compressed View removal and backfill; home, rail and View menu). Every
finding acted on below was re-checked in code or live first. **The canonical adversary pass is
still owed.**

### Fixed (red test first; each test failed on the old code)
- **Force-logout dialog trapped its own links.** "need help?", "forgot password" and "sign up" in
  the dialog (login-form.hbs) navigated, but the dialog only closed on the way to `login`, so it
  stayed over the page the user asked for. `app-state#keeps_force_logout_open` now lets those three
  routes close it. Tests: app_state-test `global_transition: the force-logout dialog` (+3). Live:
  "forgot password" in the dialog now lands on `/forgot_password` with the dialog gone.
- **Home Boards card tiles were dead when their record could not load** (offline and not cached, or
  a failed fetch; Crisis Vocabulary is the likely case). The card moved from plain buttons that
  opened by key to `BoardIcon`, which (1) rendered no name without the record, (2) set
  `pointer-events: none` until the record was ready, and (3) returned early from `pick_board`. Now:
  the card passes the preview's name; `tile_display_name` falls back to it; `opens_by_key` keeps a
  key-only tile with `@onActionOverride` clickable; `pick_board` hands that caller the key. Callers
  without `@onActionOverride` keep the not-ready behaviour (tested); the one other caller with it,
  the style-variant picker (board-preview-overlay.hbs:28), now also takes clicks before load
  (corrected 2026-10-11 after the second review). Live, with the Crisis board's API request blocked:
  the tile shows "Crisis" and a real click opens `/lingolinq/board-detail/crisis-vocabulary`.
- **"Home Board" was never announced.** The tile wrapper's `aria-label` replaces its contents for
  assistive technology, so the home glyph's own label was not read (true on `develop` as well; the
  template comment claimed otherwise and is corrected). `tile_aria_name` adds ", Home Board".
- **Crisis could fall off the card** when it was also in the user's own list (it was
  kept at its list position, so the 12-cap could cut it, and it lacked the small-screen flag). It now
  always ends the list, flagged, keeping its loaded record. Test: preview-boards-test (+1).
- **A token check in flight during a teardown ran the logout again** (a second alert and
  `invalidate` when there is no modal route). `check_token` now acts only while the token it checked
  is still the stored one (`session#_token_still_stored`). Test: session-test check_token (+1).
- **Coverage lost with the Compressed View tests**, restored without changing an assertion: the
  Need Attention card's three rows and "View all" link (`dashboard-need-attention-test.js`, from the
  deleted file's normal-mode cases) and Display Style registering the Dashboard Design opener on mount
  (`display-style-disc-test.js`). Both fail when the code they guard is broken (checked).
- New code was placed so no `.eslint-todo` row moved (helpers after `actions` in board-icon.js and
  before `force_logout` in session.js, below the last anchored rows; in-place condition edits).

Verification after these fixes: full Ember suite 3366 tests, 0 failed (37 skip, 5 todo; 3353 + 13
new); `lint:js:ci` 0 new findings; template lint clean; the live idle-session flows re-run unchanged.

### Checked and not a defect
- "Errors on user pages are swallowed after a dead-session logout": NOT refuted, only on the reload
  path. Live (the `auth_spa_transition` flag off, so Log Out reloads), the flags reset and the error
  page shows. On the SPA logout path nothing clears `invalid_token` (its only resets are
  session.js:95, :307, :311), so it stays set until the next sign-in. Corrected 2026-10-11 after the
  second review; see below.

### Kept as requested, with the trade-off recorded
- **The force-logout dialog stays uncloseable** (requested 2026-10-09: up until the user acts). Its
  exits now all work (sign in, Log Out, and the three links). Trade-off: a communicator who does not
  know the password cannot get back to speak mode without an adult; "basic access" is hidden inside
  the dialog (`{{#unless this.force_logout}}`, unchanged from `develop`). Recommendation for Scot:
  show "basic access" in the dialog where the `emergency_boards` flag is on.
- **The rail's Up/Down pager stays removed** (requested 2026-10-10). Measured: the rail scrolls
  (`overflow-y: auto`); wheel and keyboard focus reach the last row at 1024x768, 1280x720 and
  1024x600. The collapsed rail overflows by 89px at 1024x768 and 257px at 1024x600, so a pointer
  user without a scroll wheel (eye-gaze or head pointer with no scroll tool) must scroll a nested
  panel. Follow-up: fit the rows at short heights rather than bring back the pager.

### Follow-ups (not in this PR)
- `!important` grew on this branch: app.scss +105 / -53 lines (net +52), _classic-home.scss +6,
  plus a few cascade-winning blocks (CLAUDE.md Rule #7 asks for the original selector to be edited). Unwinding them is a styling
  refactor with live measurement at every breakpoint; it belongs in its own PR.
- The Reload marker (`utils/reload_intent.js`) is matched by URL and never consumed, so a later
  sign-in's `location.reload()` on the same URL is not treated as a launch (speak mode not opened).
- ~~Two tabs on one account clearing each other's sign-in~~ fixed 2026-10-11 (second review, item 9).
- No unit test drives the extras.js failure branch itself (400 with `invalid_token` ->
  `force_logout`, speak-mode guard, de-dupe); it is covered by the live probes only.
- Rewritten tests marked "approved 2026-10-10" for Scot to confirm: dashboard-sections-test.js,
  dashboard-sections-layout-test.js, dashboard-grid-placement-test.js,
  account-rail-collapse-test.js, classic-view-extras-landing-test.js,
  tours-classic-home-tab-test.js, and spec/spec_helper.rb (TZ=UTC).

## Second review (2026-10-11, `/adversary-review-local`)

Run with the new local skill (`~/.claude/skills/adversary-review-local`, agent
`~/.claude/agents/adversary-local.md`): four read-only slices (session and routing; Compressed View
removal; home, rail and View menu; the four fix commits). Still a substitute: the canonical
`/adversary-review` is owed. Each finding below was re-checked in code (or live) before listing.

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | The dialog's `login` exit never matches: `login` has a child route, so the real transition is `login.index` (router.js:66-68, routes/application.js:126-137). The test passed a synthetic `'login'`. | Medium, regression | **Fixed**: `/^login(\.|$)/`; app_state-test +2 (`login.index`, `login.device`) |
| 2 | Making key-only tiles clickable (`opens_by_key`) also made their nested Preview buttons clickable; with no record, `board_preview(undefined)` throws at `board.preview_option` (board-icon.js:317). Full-size Boards card and the style-variant picker. | Medium, regression from 9ab036c05 | **Fixed**: the two Preview buttons render only with a record; rendering test board-icon-key-only-test.js (also pins the wrapper's real aria-label) |
| 3 | SPA logout path never clears `invalid_token`, so `logout_under_way()` stays true until sign-in and routes/user.js swallows `/:user` errors for the signed-out visitor. Only with `auth_spa_transition` on. | Low, regression | **Fixed**: routes/user.js holds errors back only while the force-logout dialog is open; user-error-action-test +1, and the existing case's dialog-open precondition made explicit (approved 2026-10-11) |
| 4 | Crisis as a user's HOME board moves from first to last (preview-boards.js treats any list entry with the Crisis key as "own"). | Low, regression from 9ab036c05 | **Fixed**: as the home board, Crisis stays first, flagged; preview-boards-test +1 |
| 5 | A stale `check_token` response still sets `invalid_token` on a freshly re-signed-in session: `_token_still_stored` gates only `force_logout`, not the flag writes above it. | Low, pre-existing (improved) | **Fixed**: a stale answer (token no longer this tab's) is ignored before any flag write (`_checked_token_is_current` in check_token's response guards); session-test +1 |
| 6 | Backfill race: `find_each` then `save!` of the whole encrypted settings blob, no reload, no lock; a concurrent settings write by that user is undone. Fix: `user.with_lock`. | Low-Medium; recommended before the staging/production run | **Fixed**: `user.with_lock`, removing the key from the re-read settings; task spec +1 (a change saved after the batch load survives) |
| 7 | Gentle: with Speak Mode hidden, Extras moves to the TOP (`extrasBesideSpeak` runs on the full default order before visibility filtering; its comment says "only when BOTH are visible"). | Low, regression from 2026-10-09 | **Fixed**: `extrasBesideSpeak` takes `vis` on the live grid; dashboard-sections-test +1 |
| 8 | Rail dropdown trigger at <=900px is named after the current page ("Home Page" even on Boards), not "Account menu"; `aria-haspopup="true"` on a list of links. | Low | **Fixed**: `menuTriggerLabel` ("<visible label>, Account menu"); `aria-haspopup` dropped (a disclosure, not a menu); account-rail-trigger-label-test |
| 9 | Boot-time `check_token` can skip the logout if another tab changes the stored login mid-check (also protects that tab's new sign-in). | Low | **Fixed**: staleness compares with this tab's in-memory token, so another tab's logout still logs this tab out; the teardown clears the stored login only when it is this tab's (or empty), so another tab's new sign-in survives (closes the two-tab follow-up); session-test +2 |
| 10 | Dead `.ch-tile--extras-toggle` rules; stale "Focused never places Extras" comment (app.scss ~56327); stale `{id, key}` comment (authenticated-view.hbs:580); `.md-searchOverlay` unused. | Low, hygiene | **Fixed**: Extras-toggle CSS removed (compiled CSS: 47 lines out, none in); comments corrected; the never-opened search overlay removed (template, styles, 5 actions, 5 locale keys x 13 files) with an approved `.eslint-todo` shift (2 rows dropped with their code, 18 moved; 1562 -> 1560) |

Verification after these fixes: full Ember suite 3376 tests, 0 failed (37 skip, 5 todo; 3366 + 10
new); backfill task spec 6/6; `lint:js:ci` 0 new findings; template lint clean; Sass compiles; the live
idle-session flows, the dialog's links and the record-less Crisis tile re-run as expected.

Answered clean: no healthy-session logout path; `.eslint-todo` hides no new finding (42 rows removed,
the rest line shifts; 10 stale rows in dashboard-sections-test.js); `TZ=UTC` in spec_helper matches
CI and the image; all 13 locales parse with no dangling keys; saved Dashboard Design orders produce
valid grids for every role simulated; no focus trap in the rail dropdown; touch targets >= 24px.
