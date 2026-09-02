# Art. 50 notice vs auto-opened Guided Tour (fix log)

Started 2026-09-02 20:25 UTC. Branch `scot/fix/art50-notice-vs-guided-tour` off `staging` (dd5e01251), worktree
`~/.local/share/agent-wt/worktrees/LingoLinq-AAC-ea35b3a9/art50-notice-vs-guided-tour`.

## Goal

A first-time user who confirms the registration terms gets the EU AI Act Art. 50(1) notice AND the auto-opened
Guided Tour at the same moment; the tour paints over the notice and takes focus; cancelling the tour navigates to
the board picker and the route change closes the (uncloseable) notice with nothing acknowledged. Fix: never
auto-open the tour while the notice is up.

## Evidence (production, 2026-09-02, revision lingolinq-web-00026-pas = PR #898 = 3f752f1fd)

Full record: `~/ai-company-brain/outputs/docs/2026-09-02-art50-production-verification-qa.md` sections 12-13.

- test_com on /test_com/home: notice inserted t=5017ms, focus on `#ai-disclosure-title` t=5109, Shepherd tour
  inserted t=5038..5340 and took focus (tour z 9999 / overlay 9997 / notice 1050). Escape -> tour cancelled ->
  `transitionTo('board-picker')` -> t=29064 notice gone, no `article_50_disclosure_ack`, server read-back
  shown=false.
- test_sup1 on /caseload: same stacking (tour over notice) observed; not dismissed there.

## Fact sheet (rule 13)

(a) Where is the value READ?
- `auto_open_home_tour` is read by `components/guided-tour.js#_autoOpenWatcher` (observer, :349) and at `init`
  (:1213-1216, plus the sessionStorage fallback :1218-1222). Both call `_scheduleAutoOpen` (:581). CONFIRMED.
- `_scheduleAutoOpen` branches: supporter -> `_startCaseloadAutoOpen` (:627, polls for the caseload tourKey then
  `_startTour()` with NO handoff); everyone else -> `scheduleOnce('afterRender')` -> `_startTour({afterComplete:
  handoff})` where `handoff = router.transitionTo('board-picker')`, bound to complete AND cancel (:1039-1040).
  CONFIRMED.
- The notice is opened by `routes/index.js` via `onlyIfGenuinelyResolved(result, model)` after the terms-agree
  promise resolves -> `article50_gate.js#maybeShowSessionEntryGate` -> `modal.open('ai-disclosure', {scannable:
  true})`. CONFIRMED.
- The notice is closed by `services/app-state.js#global_transition` -> `modal.close()` at :716, unconditional on
  every route change; `utils/modal.js#close` (:367) does not consult `is_closeable` (:257). CONFIRMED.

(b) ALL shapes / writers of `auto_open_home_tour` (six): `components/terms-agree.js:66` (observed path),
`components/dashboard/authenticated-view.js:1701`, `components/getting-started.js:90`,
`controllers/getting-started.js:69`, `components/subscribe.js:91,99`, `controllers/subscribe.js:43`, plus the
sessionStorage `ll_auto_open_home_tour` fallback consumed at init. So the fix belongs in the CONSUMER
(`_scheduleAutoOpen`), not in the terms-agree writer. CONFIRMED by `git grep`.

(c) Claims about other files:
- `utils/modal.js#is_open('ai-disclosure')` returns true while the notice is the service's `currentTemplate`
  (:232-247). CONFIRMED.
- `article50_gate.js#needsAcknowledgement(appState)` is exported and reads sessionUser (fallback currentUser).
  CONFIRMED.
- `ai-disclosure.js#acknowledge` sets `article_50_disclosure_shown` true on the subject model on success (:136).
  CONFIRMED.
- Shepherd 14.5.1 restores focus to `focusedElBeforeOpen` on hide. CONFIRMED in node_modules; irrelevant once
  the notice is not underneath.

## Candidate fixes (rule 12) — see proposal sent to adversarial review below

## Log

### Proposal sent to adversarial review (20:35 UTC), before any code edit

Candidate A (preferred): defer in the consumer. `_scheduleAutoOpen` keeps its speakHost/editHost early return, then
calls `_autoOpenAfterArt50Notice(startedAt)`: while `modal.is_open('ai-disclosure')` OR
(`needsAcknowledgement(appState)` AND waited < grace 2s) poll every 250ms (cap 10 min, then drop the tour);
otherwise `_runAutoOpen()` = the old body (supporter -> `_startCaseloadAutoOpen`; else afterRender ->
`_startTour({afterComplete: handoff})`). The inline afterRender function at :598 becomes a named method (also
retires the line-anchored eslint-todo row for :598).
Candidate B (rejected here, follow-up): stop `app-state.js#global_transition:716` / `modal.js#close` from closing an
uncloseable modal on route change. Blast radius (terms-agree, logout flows) too wide for this PR.
Candidate C (rejected): patch the terms-agree writer only. Six writers plus a sessionStorage fallback exist.

Red test written first: `app/frontend/tests/components/guided-tour-test.js` (jasmine adapter, itAsync, stubs
`modal.is_open` and `article50Gate.needsAcknowledgement`, shrinks the tunables). Six cases; mutations that must
fail them: remove the deferral (cases 1,2), remove the grace branch (2), remove the destroyed guard (4), remove the
cap (5), remove the host guard (6).

Harness: worktree has no node_modules; symlinked the primary checkout's. Node 22.23.2 via absolute binary
(the worktree guard refuses `source nvm.sh` / `env PATH=` forms). Smoke run: `ember test --filter ai-disclosure`.

### Adversarial review, batch 1 (findings 1-5), each re-verified by me before acceptance

| # | Finding | My check | Change to the proposal |
|---|---|---|---|
| 1 High | Expiry `return` drops the board-picker handoff; ai-disclosure stays open forever on a failed ack (ai-disclosure.js:139-143), flag already consumed (:352) | CONFIRMED (guided-tour.js:605-611 runs the handoff even with no tour) | On expiry call `_runAutoOpen()`; never drop the handoff. Test 5 rewritten: after the cap the tour runs once. |
| 2 High | Test stubs the default export; a named import bypasses the stub | CONFIRMED | Call `article50Gate.needsAcknowledgement` / `.sessionEntryGatePending` / `.art50Subject` off the default import in the component. |
| 3 High | eslint baseline is line+column anchored: 18 rows for this file, 15 below :598; any insertion reddens CI; new `runLater` adds `ember/no-runloop` findings | CONFIRMED (`.eslint-todo`: 18 rows) | Run `npm run lint:js:todo` in this PR and hand-review the baseline diff; commit it separately from the fix. |
| 4 Medium | 2s grace is a guess; `sessionEntryGatePending(model)` is the deterministic predicate (really_fresh is a 30s window, base.js:54-58) | CONFIRMED | Replace the grace with `noticeOpen || article50Gate.sessionEntryGatePending(article50Gate.art50Subject(appState))`. art50Subject (sessionUser, fallback currentUser) covers the case where sessionUser is not yet assigned. |
| 5 Medium | No re-entrancy guard: init (:1213, :1220) and the observer (:353) can start two chains | CONFIRMED | `_autoOpenDeferring` flag, set when a chain starts, cleared in `_runAutoOpen`; a second call while deferring returns. |

### Adversarial review, batch 2 (findings 6-10), re-verified

| # | Finding | My check | Decision |
|---|---|---|---|
| 6 Medium | `init()` consumes the auto-open signals during `create()`, before the test replaces `_runAutoOpen` | CONFIRMED (guided-tour.js init reads appState flag + sessionStorage) | Test creates the instance as `speakHost: true`, clears both signals in beforeEach, then un-hosts. |
| 7 Medium | A 10-minute `runLater` chain stalls `settled()` in acceptance tests; local polls cap at ~3s | PLAUSIBLE hazard; CONFIRMED no existing test sets the flag or opens ai-disclosure with it | Partly accepted. The "due but not open" wait is capped at 5s. The OPEN wait is deliberately uncapped, because any cap re-creates the defect for a slow reader; the notice only closes on ack or navigation, both end the wait; destroyed guard ends it on teardown. Stated in the code comment and PR body. |
| 8 Medium | `sessionEntryGatePending` needs `really_fresh` (30s); a slow terms reader may get no notice at all, independent of the tour | CONFIRMED mechanism; whether `user.save()` in terms-agree refreshes `retrieved` NOT verified (`retrieved` is stamped in utils/persistence.js:4438 on fetched records) | Out of scope; listed under "Not covered" in the PR body with the file:line trail. PR body does not claim the first-entry disclosure is restored in all cases, only that the tour no longer takes it away. |
| 9 Low | Candidate B is the defect class; `app-state.js:716` and `:2020` (`check_scanning`) close any modal, `modal.js#close` ignores `is_closeable`; no register row exists | CONFIRMED (no row in audit-reports/FINDINGS.json) | Recommend a register finding to Scot; not filed in this PR (register edits carry regeneration and attestation consequences). |
| 10 Low | Scanner may resume on page targets that the tour overlay then covers | PLAUSIBLE | Manual switch-scanning pass not performed (no rig); stated in the PR body. |

Answers accepted: sessionUser is assigned at boot (app-state.js:469/:518/:534); supporter deferral is consistent with
routes/index.js:70-77; no i18n, no flag (bug fix), plain revert.

### Implementation (21:50 UTC)
- `guided-tour.js`: `_scheduleAutoOpen` -> re-entrancy flag -> `_autoOpenAfterArt50Notice(startedAt)` polls
  `art50_tour_defer_poll_ms` (250) while `modal.is_open('ai-disclosure')` or
  (`article50Gate.sessionEntryGatePending(article50Gate.art50Subject(appState))` and < `art50_tour_due_max_ms`
  5000) -> `_runAutoOpen` (old body; supporter branch or afterRender `_startHomeAutoOpen`). The inline afterRender
  function became `_startHomeAutoOpen` (clears the :598 inline-anonymous-function baseline row).
- Direct eslint on the two files: 17 `no-runloop` (16 pre-existing + 1 new), 1 pre-existing `require-super` warning,
  0 findings in the test. Rebaseline via `npm run lint:js:todo` to follow, diff hand-reviewed.
- Harness: the /mnt/c node_modules symlink made eslint take >120s; replaced with `npm ci` inside the worktree (ext4).

### Verification (22:05 UTC)
- Harness: `npm ci` under a Node 24 PATH failed in `postinstall-postinstall` (yarn env); `npm install` with Node
  22 first on PATH (as CI does, ci.yml:95/:114) succeeded: 2128 packages, patch-package found no patches.
- `ember test --filter "guided-tour auto-open"` against the fix: **8/8 pass** (`# tests 8 / # pass 8 / # skip 0`).
- `npm run lint:js:todo`: baseline diff touches ONLY `app/components/guided-tour.js` rows (18 removed, 18 added):
  16 `no-runloop` rows shifted, +1 `no-runloop` at :631 (the new `runLater`), the
  `no-incorrect-calls-with-inline-anonymous-functions|598` row removed (inline fn is now `_startHomeAutoOpen`),
  `require-super-in-lifecycle-hooks` shifted 1186 -> 1242. No other file gained or lost a row. Committed separately.
- Falsification: running the same 8 tests against the pre-fix file (copy saved in the session scratchpad, restore by
  copy, never `git checkout`).
