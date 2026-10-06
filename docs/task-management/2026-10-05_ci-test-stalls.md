# 2026-10-05: CI test stalls and slowdown (HANDOFF)

Handoff for a fresh session. Three workstreams are open; this file is the source of truth for
all three. Read it top to bottom before acting. Rule #0 applies: verify, never assume; label
claims CONFIRMED (file:line / measured) or ASSUMED.

---

## 0. Where things are right now

| Item | State |
| --- | --- |
| Current branch | `traci/test/ci-test-stalls` (from `develop` `fb65d4a7c`), pushed |
| Draft PR | #1109 (diagnostics only, DO NOT MERGE), CI running on commit `629c6412b` |
| PR #1108 `traci/styling/styling-touchups` | All work pushed (head `8a9393cbc`); description updated with commit links; only CI failure is the modal-scanning test below, which also fails on develop |
| Category rework | WIP committed LOCALLY (not pushed) on `traci/feat/category-implementation`; full handoff in that branch at `docs/task-management/2026-10-05_category-layout-HANDOFF.md` |
| `traci/feat/category-implementation` | local branch fast-forwarded to `8a9393cbc` (styling work merged in), NOT pushed (9 ahead of origin) |

Local dev DB changes made this session (local only): `sarah_chen_slp` and `ethan_brown` prefs
were changed for testing and RESTORED (Sarah: classic + gentle; Ethan: modern + gentle). The
Vocal Flair 112 category layout was written (seeder) onto `lingolinq/vocal-flair-112`,
`aiden_parker/vocal-flair-112`, `marcus_williams_slp/vocal-flair-112`, `marcus_williams_slp/vocal-flair-112_1`
(only meaningful once the stash is restored; harmless otherwise, `settings['category_layout']`).

Test logins (local seeds): `example`/`password` (org manager + supporter, Modern Focused),
`marcus_williams_slp`/`demo2025!` (supervisor, Modern Focused), `lingolinq_admin`/`admin2025!`
(Modern Gentle), students e.g. `ethan_brown`/`demo2025!`. Ember :8184, Rails :5000. Frontend
commands need Node 22: `source ~/.nvm/nvm.sh && nvm use 22` (the shell defaults to Node 16).

---

## 1. CI test stalls (ACTIVE)

### Request (Traci, 2026-10-05)
Branch from develop; add diagnostics to the modal callback and the test harness; run in CI to
see why the callback stalls; fix the real cause. Also find where tests stall and reduce total
CI test time. Asked: are CI parts redundant / can parts be combined. "DO NOT ASSUME ... check
if they actually do come from ..."

### Problem 1: one frontend test fails in CI only
`modal: modal scanning - should not resume scanning when a different modal is opened`
(`app/frontend/tests/utils/modal-test.js:194`).
- CONFIRMED failing in CI `build-and-test` on: develop merges #1107 (`fb65d4a7c`), #1106
  (`72de0d791`), #1105 (`091341dda`); PR #1108 commits `cd7e41314` and `8a9393cbc`.
- CONFIRMED passing on develop #1087 (`5ea557103`), between #1105 and #1106. So intermittent,
  not introduced by #1106 (#1106 only lengthened the failing run: ~6.7s before, ~11.2s after).
- CONFIRMED passes locally: 3/3 isolated, whole modal module 23/23, misc+modal 40/40.
- Mechanism (code-read, CONFIRMED): test opens 'hat', stubs `modal.is_open` with a counter,
  opens 'cheese'; `modal.open` calls `this.close()` (`app/utils/modal.js:199`), whose
  `runLater` (`modal.js:438`) calls `is_open()`. First `waitsFor(open_checks >= 1)` (default
  5.5s) fails in CI => that runLater did not fire within 5.5s. The second `waitsFor(..., 10000)`
  then polls to its deadline (hence ~11.2s). Failure text always says "5500ms" (harness prints
  maxAttempts*100 regardless of a passed timeout; `tests/helpers/jasmine.js` runs()).
- WHY it does not fire in CI: NOT YET KNOWN. The #1109 diagnostics log each is_open check
  with ms since test start plus a snapshot (pending/overdue run-loop timers etc.), and the suite
  hook logs a snapshot on every failure.

### Problem 2: suite time
Measured from PR #1108's CI log (job 112062222466), `build-and-test` ~51 min:
| Step | min |
| --- | --- |
| npm install | 0.2 |
| `npm run lint:hbs` | 1.6 |
| `npm run lint:js:ci` | 0.5 |
| `npx ember build` | 0.9 |
| `npx ember test` build before first test | 0.9 |
| `npx ember test` tests | 46.7 |
- CONFIRMED redundant: CI builds twice (`.github/workflows/ci.yml` "Build Ember app" then
  `npx ember test`, which rebuilds). ~0.9 min saving: `ember build --environment=test` then
  `ember test --path dist`. Workflow change: get Traci's approval (Rule #14 lists CI wiring).
- Time split: Jasmine-style tests (tests/helpers/jasmine.js describe/it) 1,986 tests = 33.4 min,
  QUnit-style 1,291 = 13.2 min; one acceptance test (board lock) = 66s.
- CONFIRMED per-test growth in CI: Jasmine-style median per decile 66, 126, 445, 809, 720, 946,
  1132, 1413, 1578, 1876ms; minimum per decile 38 -> 1026ms. Something accumulates.
- Locally (413 jasmine tests, modules app_state/editManager/scanner/modal/utterance/speecher/
  stashes/session) per-test time does NOT grow (app_state steady ~520ms/test locally; that
  ~500ms floor per app_state test is itself worth explaining: 154 tests x 0.5s).
- Accumulation measured locally with the diagnostics (CONFIRMED):
  - DOM: +~25 nodes/test; at test 200, 4,630 of 4,856 nodes are inside QUnit's `#qunit`
    reporter (passed-test rows). Small leak: `div#scanner_axis_vertical` / `_horizontal` x4.
  - Native window/document listeners: +6/test, never removed. Sources CONFIRMED in code:
    `app/services/app-state.js:260` (`lingolinq-domain-settings-sync`, no removal anywhere),
    `app/services/persistence.js:4244` `_setupOnlineListeners` (window online/offline +
    document online; persistence has no willDestroy), `app/instance-initializers/keyboard-activation.js:58`
    (document keydown, never removed), and `@ember/test-helpers` `_setupAJAXHooks` (ajaxSend /
    ajaxComplete). jQuery's own ajaxSend handler list stays at 1 (measured), i.e. test-helpers'
    `.off()` cleanup works at the jQuery level; the native-count growth for those two is not
    yet explained.
  - App instances: 0 left alive (owners are destroyed).
  - Run-loop timers / setTimeouts fluctuate, no monotonic growth seen locally.
- NOT YET PROVEN which accumulation causes the CI slowdown. Do not claim one. The #1109 run
  gives the full-scale numbers every 100 tests; correlate per-test time with dom / qunitDom /
  listeners / heap / runloopTimers.

### Diagnostics (commit `629c6412b`, PR #1109)
- `app/frontend/tests/helpers/suite-diagnostics.js` (new, test-only), installed from
  `app/frontend/tests/test-helper.js` (`installSuiteDiagnostics(testApplication)`).
  `[DIAG] #<n> <ms> {heapMB, dom, qunitDom, runloopTimers, runloopOverdue, timeouts, listeners,
  liveAppInstances, jqAjaxSend} :: <test>` every 100 tests and on any failure, followed by
  `[DIAG] body children: ...` and `[DIAG] listener sources: ...` (call sites).
  runEnd summary lines do NOT appear in testem output (logs after the last test are dropped).
- `app/frontend/tests/utils/modal-test.js`: two EXISTING lines extended (no line added):
  `var open_checks = 0, diag_t0 = Date.now();` and the stub logs `[DIAG] modal-test is_open
  check #n at +Xms {snapshot}`.
- Diagnostics in `app/utils/modal.js` were tried and REVERTED: adding lines there shifts
  baselined eslint rows and the CI lint gate (`node scripts/eslint-todo-gate.js`, fingerprint
  includes line+column) fails before tests run. Same trap for any file with baselined rows:
  check `grep -c "^<file>|" app/frontend/.eslint-todo` before inserting lines.

### How to read the CI run
```
TOKEN=$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill 2>/dev/null | sed -n 's/^password=//p')
SHA=$(git rev-parse origin/traci/test/ci-test-stalls)
curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/lingolinq/LingoLinq-AAC/commits/$SHA/check-runs" # find build-and-test job id
curl -sL -H "Authorization: Bearer $TOKEN" \
  "https://api.github.com/repos/lingolinq/LingoLinq-AAC/actions/jobs/<JOB_ID>/logs" -o ci.log
grep -E '\[DIAG\]' ci.log | sed 's/\\"/"/g'
```
Never echo the token (`.claude/rules/github-pr.md`). Per-test timings: lines
`ok <n> Chrome 147.0 - [<ms> ms] - <name>`; Jasmine-style = names not starting with
`Unit |`, `Integration |`, `Acceptance |`.

### Next steps
1. Read the #1109 `[DIAG]` lines: per-100 trend of dom/qunitDom/listeners/heap/runloopTimers vs
   per-test ms; the failure snapshot and is_open timings for the modal test (did the check fire
   late, never, or with overdue run-loop timers?).
2. If needed, a controlled experiment in CI on this branch (one variable per run), e.g.
   `QUnit.config.hidepassed = true` (drops passed rows from the reporter DOM) or removing the
   leaked listeners; compare per-decile medians against this baseline. Only claim a cause the
   experiment shows.
3. Fix the real causes. Likely candidates to verify, not assume: remove listeners on service
   destroy (app-state willDestroy, persistence willDestroy, keyboard-activation instance
   teardown) — app code, needs `/fix-proposal` discipline, red tests, adversarial review.
4. CI time proposals for Traci (need approval; Rule #14 covers workflow/matrix changes):
   single build (`--path dist`), and sharding the Ember suite across parallel jobs (all tests
   still run; e.g. ember-exam `--split/--partition` if available — check package.json first).
5. Remove or reduce the diagnostics in the fix PR; close #1109.

### Constraints that bit this session
- Rule #14: never skip/weaken/retry-until-green; no re-baselining `.eslint-todo` or `.lint-todo`
  without explicit approval.
- Line-anchored eslint baseline: inserting lines in a file with baselined rows fails CI.
- Don't run the full Ember suite locally (memory). Use `--filter` regexes, e.g.
  `npx ember test --filter "/^(app_state|scanner|modal):/"`.

---

## 2. PR #1108 (styling touch-ups), branch `traci/styling/styling-touchups`

Done and pushed (commits `321577dc0`, `3c89bf22e`, `7b9fc7142`, `3c60cf7ae`, `8a9393cbc`; task log
`docs/task-management/2026-10-05_focused-single-buttons-badge-action.md`). Description updated:
"Not covered" items marked fixed with commit links. Its only CI failure is Problem 1 above
(shared with develop). Not done: `/review-pr` and `/adversary-review` on those commits.

---

## 3. Category rework (PAUSED; local WIP commit)

### Restore
```
git checkout traci/feat/category-implementation
cat docs/task-management/2026-10-05_category-layout-HANDOFF.md   # the detailed handoff
```
The WIP commit is local only (not pushed). Task log on that branch: `docs/task-management/2026-10-05_category-layout-on-board.md`
(full fact sheet, adversarial review findings, decisions). Current-state doc (Claude Docs):
"Category Grouping: Current State", https://claude.ai/code/artifact/f15a6b6b-9cf3-4343-941e-c8f079c2f396

### Decisions so far (Traci, 2026-10-05)
- First target: Vocal Flair 112 (`lingolinq/vocal-flair-112`, 8x14, 112 buttons), laid out exactly
  per Traci's map (`lib/category_layouts/vocal_flair_112.json` in the stash, generated from the
  board and checked 112/112).
- Board default layout saved ON the board and copied with it; per-user edits later in a NEW
  database table (migration needs Traci's approval before it runs).
- Flag on locally via committed dev-only switch `DEV_FEATURE_FLAGS=board_category_grouping`
  (`lib/feature_flags.rb` `dev_feature_flags`, only when `Rails.env.development?`).
- Edit mode with categories on shows the board WITHOUT categories plus a note; layout edits
  happen in the Categorize panel.
- Non-scrolling view keeps the board's own rows/columns.

### Built (all tests green, each falsified)
Backend: `Board#sanitize_category_layout`, `process_params` hook (absent/null/blank =
unchanged, `{clear:true}` removes), prune dead ids on every save, layout in `current_revision`
hash only when present, JSON (non-list), BoardCloner + client-copy (`parent_board_id`) carry,
`small_words` category key, `CategoryLayoutSeeder` + `rake lingolinq:seed_category_layout`.
Frontend: `category_layout: attr('raw')` + `serializers/board.js` (never sent; kept in offline
local copy), `utils/category_layout.js` (resolve, edges, `is_keyboard_board_key`),
BoardDetailGrid `savedLayout`/`layoutGroup` mode + CSS (`md-board-detail-grid--category-layout`),
controller `category_layout_grid` + scanner reads it (switch scanning follows the layout),
edit-mode note. QA: `app/frontend/scripts/category-layout-vf112-qa.mjs` 8/8 PASS.

### Open questions for Traci (asked, not answered)
1. Architecture: keep one board + saved layout (recommended: no vocabulary drift) vs a
   separate categorized board (editor for free, but two boards drift).
2. Lint gate: the WIP's edits shift baselined eslint rows in 5 files (controller board-detail,
   board-detail-grid, models/board.js, scanner.js, tests/utils/scanner-test.js); verified pure
   shift. Option 1 re-baseline those rows (needs approval), option 2 rearrange code so no row
   moves.
3. i18n: new keys `board_category_small_words`, `board_detail_categorized_edit_note` not yet
   generated into locales (`i18n_generator.rb`).
