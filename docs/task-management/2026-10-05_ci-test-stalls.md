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

### Session 2 findings (2026-10-05, measured locally, nothing pushed)
Method: build once (`npx ember build --environment=test --output-path=<dir>`), then
`npx ember test --path <dir> --filter "..."`. Probes were temporary test files, deleted after.
- Cost split of PR #1108's run (job 112062222466, no diagnostics), by suite type:
  Jasmine-style 1,986 tests 33.4 min; Integration 98 tests 6.1 min (median 2.2 s, min 1.5 s);
  Acceptance 19 tests 4.3 min (7 tests carry it); Unit 1,174 tests 2.8 min.
  Rolling-minimum floor rise across the run (accumulated drag estimate): ~19 min of 46.6.
- CONFIRMED: every `await click()` waits ~5 s. `touch_start` schedules a 5000 ms `runLater`
  safety reset of `buttonTracker.triggerEvent` (`app/utils/raw_events.js:960-964`), and
  `settled()` waits for all run-loop timers. Probe: click on a bare button took 5,014 ms with
  that timer at +4,952 ms. `mut-action-arg-test.js` in isolation: render+1 click 7.1 s,
  render+2 clicks 12.1 s, matching CI.
- CONFIRMED: every rendering test pays ~2.0 s in `setupRenderingTest` setup (empty test
  2,039 ms, setup 2,030 ms, render 5 ms). Setup waits on boot-time run-loop timers; the last
  chain is `app-state` `monitor_scanning` observer -> `check_scanning` -> `runLater(1000)`
  (`app/services/app-state.js:2034`), re-armed once at +1,038 ms; stashes `flush` 1,500 ms
  in parallel. Which hook awaits settled() during setup: not yet traced.
- CONFIRMED: the ~30.9 s acceptance tests (board-detail empty state, global header) are one
  30,000 ms `runLater` in `LingoLinq.Buttonset.load_button_set` (`app/models/buttonset.js:1418-1422`,
  backstop that clears `pending_promises[id]`). In isolation: 30,912 ms; `visit()` took
  30,841 ms with 3 timers pending throughout; probe logged that later() x3 during the visit.
  NOTE: a `--filter` regex with `\|` produced a "global failure" with 0 tests run; use a
  plain-string filter.
- PATTERN (both CONFIRMED cases): a long backstop/cleanup timer scheduled with `runLater`
  makes every `settled()` wait out its full delay. Candidates to inventory next: every
  `runLater(..., >=1000)` reachable from boot, click or visit.
- CONFIRMED: fixed 500 ms per test in "sync-heavy" modules. `isSyncHeavyTestModule`
  (`tests/helpers/ember_helper.js:1152-1168`, substring match on Acceptance, app_state,
  capabilities, persistence(-sync), word_suggestions, Board, frame_listener, speecher, Utterance,
  User, stashes, dbman, session) -> `setupSyncHeavyTestHarness` sets `LingoLinq.sync_testing`
  -> harness waits `settleMs = 500` after every test (`tests/helpers/jasmine.js:108`).
  Locally app_state: 149/154 tests at ~520 ms; an empty Jasmine-style test outside those
  modules: 16-45 ms. Test names matching the list in #1108: 680 (substring module match may
  cover more) => >= 5.7 min. The settle was added to stop cross-test async bleed (comment at
  ember_helper.js:1153-1160), so any change must keep that guarantee (e.g. settle until idle
  instead of a fixed 500 ms) and needs Traci's approval (test harness).
- Inventory (subagent, code-read; evidence to verify, not findings): ~120 run-loop timers
  >= 1000 ms in app/. Note `utils/persistence.js` and `utils/_stashes.js` proxy to the service
  instances after boot, EXCEPT `utils/persistence.DSExtend`, mixed into the adapter at load
  (`adapters/application.js:48`). Top suspects by reach: `utils/persistence.js:4416-4422`
  15 s timeout backstop on every remote `findRecord` (code CONFIRMED; whether tests wait on it
  NOT yet measured); modal flash fade 1.5/3.5 s (`utils/modal.js:554`, `services/modal.js:194`);
  `raw_events.js:1137` long-press 1.5 s not cancelled on release; `app-state.js:4908/4911`
  selected-button fade 1.5-5 s + 3 s; `stashes.js:930` 15 min push_log re-armed on each
  logged event. Next: one probe that records every later()/debounce >= 1000 ms per test across
  the integration + acceptance modules, so impact is measured, not ranked by reading.
- MEASURED (local, temporary global probe wrapping `_backburner.later/debounce/throttle`,
  logging every timer >= 1000 ms per test; all 98 integration + 19 acceptance passed):
  Integration 5.9 min locally (CI 6.1): every test hit stashes `flush` 1500 + `check_scanning`
  1000 (+ nested 1000); the test's floor is set by `touch_start` 5000 in 19 tests (189.5 s)
  and by the boot timers in 79 tests (162.5 s). The 15 s `findRecord` backstop never appeared.
  Acceptance 4.3 min locally (CI 4.3): 6 tests gated by the 30 s `load_button_set` backstop
  = 227.4 s, incl. board lock (Back test 65.6 s: x5 loads, two serial waits); board-lock tests
  also run `check_scanning` 17-25x each.
- #1109 RESULT (commit `2a6b3d3ec`, job 112102600437): completed `failure`, only test #2732
  (the modal scanning test) failed, 3,276 passed; tests 46.9 min vs 46.6 baseline, so the
  diagnostics' own overhead is small. 34 `[DIAG]` snapshots (every 100 tests):
  - dom grows ~20 nodes/test to 67,633; qunitDom (QUnit reporter rows) is 65,630 of that.
  - native window/document listeners grow ~4.6/test to 15,176. At #2732 the sources were
    `window:lingolinq-domain-settings-sync` (app-state setup) 2,719; `document:keydown`
    (keyboard-activation initializer) 2,715; `document:ajaxSend` / `ajaxComplete`
    (@ember/test-helpers `_setupAJAXHooks`) 2,715 each; `window:online` / `offline`
    (persistence `_setupOnlineListeners`) 2,416 each.
  - heap climbs to ~1,065 MB by #1100 then stays flat at ~1,070-1,110 MB to the end, while
    the per-test floor keeps rising (Jasmine-style min per 100: ~40 ms early, 418 at #1800,
    809 at #2100, ~1,000-1,550 after #2600). Heap growth alone does not track the late rise;
    dom/qunitDom and listeners rise steadily the whole way. Correlation only: not a cause.
  - runloopTimers / overdue / liveAppInstances: no monotonic growth.
- MODAL TEST, CORRECTED: the first `waitsFor(open_checks >= 1)` PASSED (is_open check #1 at
  +545 ms). The failure is the SECOND wait, `waitsFor(scanner.scanning, 10000)` (11.3 s total;
  message says 5500 ms because of the harness print bug). Checks #4-6 ran together at
  +1,102-1,109 ms. Open question: does close()'s `runLater` (`app/utils/modal.js:436-443`)
  start the scanner and something then stops it (e.g. app-state `check_scanning` non-scanning
  branch calls `scanner.stop()`, `app/services/app-state.js:2076-2081`), or does the resume
  never run? PLAUSIBLE, unverified. Local repro in CI order
  (`--filter "/^(editManager|extras|filesystem|frame_listener|geo|i18n|waitsFor timeout|misc|modal):/"`,
  197 tests, 0 failed) did NOT reproduce: the test took 47 ms, is_open checks #1-#6 at
  +5..+16 ms, vs +545..+1,109 ms in CI. Same six checks, ~100x slower in CI at position
  2,732 (15k listeners, 53k DOM nodes). PLAUSIBLE: the failure is a timing casualty of the
  suite-wide slowdown (slow run loop lets another timer interleave), not a modal bug. Test it
  with the drag experiments: if the drag goes, does this test pass in CI?
- EXPERIMENT 1 RESULT (commit `4c75987f7`, `QUnit.config.hidepassed = true` only, job
  112116703750): job `success` in 24 min (vs 52). Same 3,319 tests, same 37 skip / 5 todo,
  3,277 pass, 0 fail; same test-name set. Test time 46.9 -> 20.3 min:
  Jasmine-style 33.7 -> 9.3, Unit 2.7 -> 0.7, Integration 6.1 -> 5.9, Acceptance 4.3 -> 4.3.
  Per-100 Jasmine-style floor stays ~20-38 ms to the end (was ~1,000-1,550 ms). qunitDom
  flat ~330; listeners STILL grow to 16,348 and heap still ~1.1 GB, with no slowdown, so
  neither listeners nor heap is the driver. CONFIRMED by experiment: the accumulated slowdown
  was the QUnit reporter DOM of passed-test rows. The modal scanning test PASSED (57 ms):
  consistent with it being a casualty of the slowdown (one run; confirm over more runs).
  Integration/Acceptance unchanged, as expected: they are bound by the app timers above.
- FIX 1 LANDED (`23f2c6fe8`, Traci: "fix it all here", 2026-10-06): button set backstop is a
  native `setTimeout`, cleared on settle (`app/models/buttonset.js:1416-1426`). Rejected:
  runLater + `cancel()` (new `ember/no-runloop` finding, would need a re-baseline); test-env
  shorter delay (changes code under test). Red test fails before (one extra 6-slot backburner
  timer), passes after; mutation back to runLater red 2/2 runs on the whole Buttonset module.
  Adversarial review: APPROVE WITH CHANGES (assertion hardened to compare new timer ids due
  > now+20 s, since a count compare can be masked by an unrelated timer expiring). Acceptance
  19/19 pass locally; 4.3 -> ~0.6 min (30.9 -> 2.7 s, board lock 65.6/34.9/34.3 -> 9.1/6.6/6.1 s).
  Stale baseline row `app/models/buttonset.js|ember/no-runloop|1418` is harmless (gate header).
  - PRE-EXISTING, NOT FIXED (reviewer, CONFIRMED by reading): force reload deletes the entry
    (line 1258) and stores a new promise; when the OLD promise settles, its handler deletes
    the NEW entry unconditionally, so dedupe is lost for the rest of the new load. Guarding the
    settle handlers with `== res` is a behaviour change: own red test, own commit.
- FIX 2 LANDED: press backstop in `touch_start` is a native `setTimeout`
  (`app/utils/raw_events.js:960`, one line swapped in place so the 24 other baselined rows do
  not shift; the row for 960 is now stale). Red test
  `tests/integration/raw-events-press-backstop-test.js` (non-awaited mousedown, no new
  backburner timer due > now+3 s): red before, green after, red again on mutation. Review:
  APPROVE WITH CHANGES (added `_timers` layout guard). Integration suite locally: 99 pass,
  0 fail; 5.9 -> 3.4 min; slowest test 4.1 s.
  - Reviewer note, NOT applied: `buttonTracker` is a singleton, so a test that presses without
    releasing now leaves `triggerEvent` set into the next test for up to 5 s (only effect:
    `dwell_linger` returns early on a held touchstart). No current test does this. If one is
    added, reset it in `tests/helpers/ember_helper.js` beside `scanning_enabled = false`.
- Not yet explained: bound-select paging (22 s, 17 s; integration, so inside the measured
  set above, PLAUSIBLY several clicks x 5 s, not checked per test); the Jasmine drag (the
  largest bucket).
- Fix candidates (NOT applied, need /fix-proposal + Traci's OK; eye-gaze safety behaviour must
  be preserved): make the triggerEvent reset a non-run-loop timer so settled() stops waiting.

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
