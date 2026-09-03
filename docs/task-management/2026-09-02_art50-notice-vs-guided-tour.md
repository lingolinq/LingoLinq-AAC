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

### Results (22:20 UTC)
- Falsification: against the pre-fix file 7/8 fail (only the pre-existing speak/edit-host guard passes); restored
  from the saved copy, `cmp` verified.
- Neighbouring suites (`/article50|ai-disclosure|focus-words|guided-tour|terms-agree/`): 94/94 pass.
- `npm run lint:js:ci`: `new=0`, OK.
- Commits: bfa007042 (fix + test + this log), d8579c268 (eslint rebaseline). PR #920 -> staging.
- Dual review started: Claude adversary agent on the diff + Codex senior-dev pass (after the data-path guard).

### Dual review results (22:45 UTC)
- Codex senior-dev pass (gpt-5.6-terra, `~/bin/codex-review --base staging`): approve, no findings. Verbatim
  verdict: "The change correctly defers auto-opening while the disclosure modal or pending gate is active,
  preserves handoff behavior, and is covered by passing targeted tests."
- Claude adversary pass (agent `art50-tour-pr920-adversary`, SHA d8579c268): 1 High + 3 Medium so far
  (report truncated mid finding 4; remainder requested). Each checked in code below.

| # | Finding (adversary) | My check | Decision |
|---|---|---|---|
| A1 High | "The handoff is never dropped" is false when the component is torn down mid-wait: `_autoOpenAfterArt50Notice` returns on `isDestroyed`/`isDestroying` (`guided-tour.js:629`) without re-arming; both signals were consumed at init (`:1270`, `:1275`) | CONFIRMED. Navbar `<GuidedTour />` lives in `app-navbar-authenticated-inner.hbs:37`, rendered only under `useAppNavbarInHeader` (`templates/application.hbs:8`), a computed on `appState.current_route` / `currentBoardState.id` (`controllers/application.js:2324`), so a route change mid-hold destroys the instance. Pre-fix the window was one afterRender flush; now >= 250 ms, up to 5 s on the due path, uncapped while the notice is open. Codex missed this. | Fix forward (proposal below). Also correct the PR body and the `:601-603` comment. |
| A2 Medium | Every test stubs `_runAutoOpen`, so the Fix-status row citing a test for "handoff preserved" is unsupported | CONFIRMED (`guided-tour-test.js:64`) | Add one case that keeps `_runAutoOpen` real, stubs `router.transitionTo`, forces `tourBuilder` falsy, and asserts the `board-picker` transition. Reword the row to cite it. |
| A3 Medium | Gate-subject wiring untested; swapping `sessionEntryGatePending(subject)` for `(this.get('appState'))` would pass all 8 | CONFIRMED (`guided-tour-test.js:57-58` stub both, subject `null`, predicate ignores its arg) | Add one case: `art50Subject` returns a sentinel, assert `sessionEntryGatePending` received that exact object. |
| A4 Medium | Test 3 ("due but not yet open") flakes under load: due cap 80 ms, `sleep(30)` before the flip | CONFIRMED arithmetic; a >50 ms stall expires the due cap before `noticeOpen` flips | Set `art50_tour_due_max_ms` to 2000 in that case only (the "never opens" case keeps 80). |

### Fact sheet for the A1 fix (rule 13)
- (a) READ: both auto-open signals are read and cleared in `init` (`guided-tour.js:1268-1281`: appState flag, then
  sessionStorage `ll_auto_open_home_tour`) and in `_autoOpenWatcher` (`:350-356`, appState flag on change). Both
  then call `_scheduleAutoOpen` (`:611`), which sets `_autoOpenDeferring` and starts the poll. The poll's only exit
  on teardown is the bare return at `:629`. CONFIRMED.
- (b) SHAPES at teardown: `_autoOpenDeferring` true with a `runLater` pending (waiting: notice open or due);
  false (never scheduled, or `_runAutoOpen` already ran and cleared it at `:638`). After `destroy()` the pending
  timer still fires and returns at `:629`. Writers of the appState flag: terms-agree.js:66,
  dashboard/authenticated-view.js:1701, getting-started.js:90, controllers/getting-started.js:69,
  subscribe.js:91,:99, controllers/subscribe.js:43, register.js:112. sessionStorage writers: register.js:107,
  services/beta-welcome-mode.js:45. CONFIRMED by grep.
- (c) Cross-file claims: `willDestroyElement` exists at `:1242` and calls `_super`; no `willDestroy` hook is
  defined in the file (grep). Speak/edit hosts' `_autoOpenWatcher` returns BEFORE clearing the flag (`:351`), so
  a re-armed flag is not swallowed by a board-detail instance. `register.js:107` already uses sessionStorage as
  the cross-mount carrier for exactly this signal. CONFIRMED.

### Proposal for A1 (rule 12, reviewed before code)
- Candidate A (preferred): in a new `willDestroy` hook, if `_autoOpenDeferring` is true, clear it and set
  `appState.auto_open_home_tour` back to true. The next non-speak/edit-host instance consumes it at `init`
  exactly as a fresh signal; live speak/edit hosts ignore it (`:351`). `willDestroy` rather than
  `willDestroyElement` so it fires for a direct `destroy()` too (testable with `factoryFor(...).create()`).
- Candidate B: consume the signals only when the wait ENDS (move the clears into `_runAutoOpen`). Rejected:
  touches `init`, `_autoOpenWatcher` and the sessionStorage branch; leaves the flag true for the whole wait,
  which contradicts the "clears the flag on start so subsequent renders don't re-fire" contract at `:340-342`.
- Candidate C: drop the destroyed guard and run `_runAutoOpen` anyway. Rejected: fires the board-picker
  handoff during a route change, the defect this PR removes.
- Risk seen: re-arm on logout without reload would carry the tour to the next login on the same app instance.
  The notice overlay covers the navbar identity menu, so a logout mid-hold is not reachable from the UI; noted,
  not handled.
- Test (red first): "re-arms the auto-open signal if destroyed while waiting": notice open, schedule, sleep,
  `destroy()`, expect `appState.auto_open_home_tour === true` and `runs === 0`. Mutation that must fail it:
  delete the `willDestroy` hook.

Remainder of the adversary report (findings 5 and 6, plus a verified-clean list: runLater argument order,
eslint rebaseline scope, no i18n, no import cycle, `_art50NoticeHoldsAutoOpen` cannot throw, `is_open` cannot
stick, notice link is `target=_blank`, stubs restored by the harness, no-notice path creates zero timers):

| # | Finding (adversary) | My check | Decision |
|---|---|---|---|
| A5 Low | Notice opening inside the final poll interval at the 5 s due cap still lets `_runAutoOpen` fire; for a supporter the caseload transition closes it | CONFIRMED by trace, but the proposed re-check at the top of `_runAutoOpen` has the same time-of-check window (the notice can open after any check). Reachable only if the notice took ~5 s to open, then landed in one 250 ms slot. | Logged, not fixed. The complete fix is the defect class (`app-state.js:716` closing uncloseable modals), already listed as a register recommendation. |
| A6 Low | "7 of 8 fail" on the pre-fix file mostly proves the method is absent (stub inert), and case 6 fails by throwing, not by asserting | PLAUSIBLE; consistent with the observed count (case 8 passes, case 6 fails) | Re-falsify by in-place mutation (`_art50NoticeHoldsAutoOpen` forced false) after the A1 fix lands and report which cases go red. |

### Proposal review of candidate A (adversary, 22:21 UTC) and what changed
| # | Finding | My check | Decision |
|---|---|---|---|
| R1 High | A bare re-armed flag has no consumer on board-detail (speak/edit hosts return before clearing, `:351`) and no expiry, so the tour and its board-picker handoff resurrect at an arbitrary later moment | CONFIRMED | Re-arm carries `auto_open_home_tour_rearmed_at`; `_consumeAutoOpenSignal` drops a signal older than `art50_tour_rearm_max_ms` (60 s). Test: stale re-arm dropped. |
| R2 Medium | `appState.set` from `willDestroy` can hit a destroyed service at owner teardown | CONFIRMED (services and components go down together) | Guarded on `isDestroyed`/`isDestroying`. |
| R3 Medium | `clear_user_state` (`app-state.js:2102`, called from `session.js:758` on SPA sign-out) does not clear `auto_open_home_tour`, so a re-arm survives sign-out | CONFIRMED by reading the ~50 resets | Added both resets; test falsified by removing them. Separate commit. |
| R4 Medium | The red test reads the flag before the scheduled `willDestroy` runs | CONFIRMED (non-eager destructor, `@ember/object/core.js:205`) | Test sleeps after `destroy()`. |
| Answers | (1) the dying instance's watcher cannot fire: observers are deactivated by an eager destructor before `willDestroy`; (2) the pending timer may fire in the gap, harmless, `:629` exits without touching state; (3) see R3 | Accepted; (1) also matched by test 7 passing | |

Test-design correction found on the way: observers are SYNCHRONOUS in this app, so a test that sets the flag
and then calls `_consumeAutoOpenSignal` directly double-consumes (the watcher already took it). The two
consumption cases now go through a second instance's `init`, which is the real production path for a re-arm.

### Results (22:40 UTC)
- `ember test --filter "guided-tour auto-open"`: 15/15. Neighbouring suites
  (`/article50|ai-disclosure|focus-words|guided-tour|terms-agree|clear_user_state|loading-overlay/`): 107/107.
- Falsification by IN-PLACE mutation (restore by copy, `cmp` verified each time):
  re-arm removed -> only case 7 red; expiry removed -> only case 10 red; sign-out resets removed -> that case red;
  subject swapped for appState -> only the SUBJECT case red; handoff dropped -> only the board-picker case red;
  `_art50NoticeHoldsAutoOpen` forced false -> 6/12 red (cases 1, 2, 3, 4, 6, 7), which replaces the earlier
  "7 of 8 on the pre-fix file" number (that one mostly proved the method was absent, per A6).
- `npm run lint:js:ci`: new=0. Baseline: guided-tour.js rule multiset unchanged (18 rows shifted); app-state.js
  38 rows shifted; `willDestroy` uses `this._super(...arguments)` so it adds no row.
- Commits: b6dd81c19 (re-arm + expiry + tests), be7f34b68 (sign-out reset), c430fa086 (test hardening),
  plus the eslint rebaseline.
- Logged, not fixed: A5 (250 ms race at the 5 s due cap; any re-check has the same window; the real fix is the
  modal-close-on-transition defect class), the slow-reader `really_fresh` question, switch-scanning pass.

### Adversary proposal-review remainder (received 22:22 UTC, after the fix landed)
- Verdict: "proceed, with the four counter-measures applied" (expiry stamp, destroyed-service guard,
  `clear_user_state` reset, test waits for the scheduled `willDestroy`). All four were applied in b6dd81c19/be7f34b68.
- Low: "delete the hook" is a weak mutation. Already avoided (the mutation kept the hook and disabled its condition);
  added the reverse mutation it asked for: `willDestroy` re-arms UNCONDITIONALLY -> only case 8 ("does not re-arm
  when destroyed while not waiting") goes red, 14/15 pass. The condition is pinned from both sides.
- Low: eslint rows shift again -> rebaselined in 947cea9d8 with `this._super(...arguments)` so no row was added.
- A2 correction (stub the real `router` injection; assert after the afterRender flush): the committed case stubs
  `component.get('router').transitionTo` and asserts after the timer's runloop has flushed; falsified by mutation.

### Codex "still left to do" list (Scot forwarded, 23:20 UTC) — checked in code, then acted on
| # | Codex item | My check | Decision |
|---|---|---|---|
| 1 | Retain and cancel the poll timer in `willDestroy` | CONFIRMED gap: `runLater` id was not kept; after teardown the timer fired once and exited on the destroyed guard (harmless, but a stray tick holds acceptance `settled()`) | Done: `_art50PollTimer` retained, `runCancel` in `willDestroy`. Test wraps `_autoOpenAfterArt50Notice` before scheduling and asserts no tick after `destroy()`; the global `_hasScheduledTimers` was NOT usable (other timers exist in the harness). Mutation (drop `runCancel`) reddens only that case. |
| 2 | Reset `_autoOpenDeferring` if the gate check throws | NOT a reachable path: `modal.is_open` (`modal.js:232`, `_getService` in try/catch), `art50Subject` (`article50_gate.js:87`), `needsAcknowledgement` (`:130`), `sessionEntryGatePending` (`:233`) all null-guard and only read model properties; the adversary traced the same | Declined: a try/catch here would be speculative code guarding a path that cannot execute, and the fail direction (run the tour over the notice, or drop it) has no right answer. Recorded here instead. |
| 3 | Real `editHost` test | CONFIRMED: the host case only set `speakHost` | Done: separate speak-host and edit-host cases. |
| 4 | Real-time boundary assertion in the due-cap case | CONFIRMED: 80 ms cap vs a 30 ms sleep before `expect(runs).toEqual(0)` | Done, but the assertion is KEPT (it is what makes the never-hold mutation redden this case); the cap is 400 ms in that case so the margin before the first assertion is 370 ms. |
| 5 | Run targeted + broader tests, CI | | guided-tour 17/17; neighbouring suites below; lint gate below; CI on the pushed head. |
| 6 | Re-review, approve, merge | | Scot's call. |

### Round 3: two unresolved Codex review threads on 6738ffbda (Scot, 2026-09-03)
P1 (`guided-tour.js:644`): the 5 s due cap releases the tour while `sessionEntryGatePending(subject)` is still true,
so a delayed notice opens after the tour started. P2 (`:658`): the navbar instance persists across most
authenticated routes (`controllers/application.js:2324-2363`), so a deferred resume can run on a different route
(`user.extras` -> immediate board-picker redirect; `caseload` -> that page's tour with the home handoff).

#### Fact sheet (rule 13)
- (a) READ. P1: the cap is read only in `_art50NoticeHoldsAutoOpen` (`:640-645`): open -> hold; pending and
  elapsed < cap -> hold; pending and elapsed >= cap -> release. CONFIRMED. P2: the resume is `_runAutoOpen`
  (`:656`), which reads `appState.currentUser.supporter_role` and schedules `_startHomeAutoOpen` on afterRender;
  neither reads the route. `_startHomeAutoOpen` reads `tourBuilder`, a computed on `appState.current_route`
  (`:298`), so a foreign route yields null -> immediate `transitionTo('board-picker')` (`:672`). CONFIRMED.
- (b) SHAPES. `sessionEntryGatePending` = `really_fresh && needsAcknowledgement` (`article50_gate.js:233-236`);
  `really_fresh` = `retrieved` within 30 s, recomputed on `appState.short_refresh_stamp`
  (`models/base.js:54-58`), which ticks every 500 ms outside tests (`app-state.js:4958-4980`). So "pending" is
  bounded at ~30 s after the model was fetched; the notice itself opens only through the same predicate
  (`maybeShowSessionEntryGate`, `article50_gate.js:245`), so a still-pending gate means a notice CAN still open,
  and an expired one means it cannot. Routes at resume: the gated flow parks BOTH roles on `user.home`
  (`routes/index.js:70-77`: supporters go to caseload only when no gate is pending); `user.home` is the only
  route with a home tour (`utils/tours/registry.js:27`). CONFIRMED.
- (c) CROSS-FILE. `appState.current_route` is written in `global_transition` (`app-state.js:745`), which runs
  from the `routeWillChange` listener (`routes/application.js:110-139`); router_js fires `routeWillChange`
  synchronously inside transition creation (`ember-source/.../shared-chunks/router-DrLZsJeE.js:757`, before the
  promise chain), so `current_route` already names the destination the moment `transitionTo` returns. The six
  writers that raise the flag and then call `return_to_index()` (getting-started.js:90-91, subscribe.js:91-92,
  :99-100, controllers/*, authenticated-view.js:1701-1702) therefore see `current_route === 'user.home'` by
  afterRender (`return_to_index` -> `transitionTo('user.home', ...)`, `app-state.js:909-917`). CONFIRMED.

#### Proposals (rule 12)
P1-A (preferred): remove `art50_tour_due_max_ms`; hold while `modal.is_open('ai-disclosure') ||
sessionEntryGatePending(subject)`. The 30 s freshness window is the bound, and it is the SAME bound the notice
has, so releasing when pending clears is exactly "release when no notice can still open".
P1-B: keep the cap but cancel the attempt (no tour, no handoff) when pending outlives it. Rejected: drops the
onboarding handoff for a transient delay (blocked main thread), the loss the earlier High fixed.
P1-C: keep the cap and re-check pending once before running. Rejected: same time-of-check window, just moved.
Risk seen: a re-fetched model re-arms `really_fresh` for another 30 s (a second hold, bounded). In tests the
stamp never ticks (`if(!this.get('testing'))`), but the tests stub the predicate directly.
Tests: "keeps holding while the gate stays pending, with no time cap" (pending 200 ms at a 10 ms poll -> 0,
then clears -> 1); "a notice that opens late is still honoured" (pending, then open after the old cap -> 0, close
-> 1). Mutation that must fail them: re-introduce a release after N ms of pending.

P2-A (preferred): `_runAutoOpen` schedules ONE afterRender step, `_startAutoOpen`, which cancels the attempt
(clears `_autoOpenDeferring`, no tour, no handoff, no re-arm) unless `appState.current_route === 'user.home'`,
then branches supporter -> caseload / else -> `_startHomeAutoOpen`. Uniform for the held and never-held paths;
the writer flows pass because routeWillChange is synchronous (fact (c)); a deferred resume after the user left
home is cancelled instead of yanking them to board-picker or starting a foreign tour with the home handoff.
P2-B: capture the origin route at scheduling and compare at resume. Rejected: the watcher consumes the flag
synchronously inside the writer's `set`, BEFORE `return_to_index`, so a hold started on getting-started/subscribe
would resume on user.home and be falsely cancelled.
P2-C: observer on `current_route` that cancels mid-hold. Rejected: same false cancel for the in-flight
return_to_index transition, and for the boot-time index -> user.home replaceWith.
P2-D: re-arm on route change. Rejected: resumes on the new route, which is the yank P2 describes.
Risk seen: a supporter who acks and clicks Caseload before the next poll loses the auto caseload tour (they can
start it from the navbar trigger); a communicator who leaves home loses the auto tour + handoff, by design.
Question not resolved: whether any legitimate writer raises the flag on a route that never transitions to
user.home (grep says all six either sit on the dashboard or call `return_to_index`).
Tests (real `_runAutoOpen`, `_startHomeAutoOpen`/`_startCaseloadAutoOpen` replaced by counters): "cancels the
resume when the route is not user.home after a hold" (0 starts, deferring false); "resumes on user.home" (1);
"never-held path also requires user.home at afterRender" (route foreign -> 0; user.home -> 1). Mutation that
must fail them: drop the route check (foreign-route cases red); the existing real-handoff case sets
`current_route` to user.home.

#### Round-3 adversary review of the proposals (agent `art50-tour-round3-adversary`, SHA 6738ffbda) and outcome
| # | Finding | My check | Decision |
|---|---|---|---|
| High | P2-A equality with `user.home` cancels two live consumption routes: supporters who boot to `caseload` (`routes/index.js:70-75`, sessionStorage consumed there) and `bento`, the second gate host (`routes/bento.js:64,78`); it also makes `guided-tour.js` `current_route === 'caseload'` in `_startCaseloadAutoOpen` dead | CONFIRMED | Allowlist `_autoOpenRouteAllowed(route, supporter)`: `user.home` / `index` / `bento` for everyone, `caseload` for supporters; handoff kept on a gate host with no tour. Tests: bento resumes; allowlist table; foreign route cancels. |
| High | P1-A's only bound (really_fresh, 30 s) does not tick under `testing` (`app-state.js:4923`), so an uncapped hold hangs a suite that reaches the real predicate | CONFIRMED | Ceiling KEPT and raised to 35 s (> the 30 s window, so in production it fires only when the predicate is stuck). At the ceiling the attempt is CANCELLED, not started (Codex's second option), because a gate that still reads pending could still open the notice. Tests: stuck gate cancelled; default ceiling > 30 s. |
| Medium | "pending cleared = no notice can open" is false: `presentBlockingGate` (`article50_gate.js:169-172`) opens the notice on `needsAcknowledgement` alone | CONFIRMED | Comment states the rule as "a session-entry notice is still due, or one is open" and names the blocking gate as covered by `is_open`. |
| Medium | Where `_autoOpenDeferring` clears decides whether a teardown in the afterRender gap re-arms a second tour | CONFIRMED (`willDestroy` re-arms on the flag) | Cleared first thing in `_runAutoOpen`, before the afterRender step; `_startAutoOpen` only returns on cancel. |
| Medium | The sessionStorage twin `ll_auto_open_home_tour` is removed only on the flag-false branch (`:1319`); beta-welcome-mode sets both, so the key survives and re-fires on the next navbar mount, and crosses accounts on SPA sign-out | CONFIRMED (grep: two setters, one remover) | Removed in `_consumeAutoOpenSignal` and in `clear_user_state`; two tests, each with its own mutation. |
| Low | Housekeeping: delete the contradicted due-cap test, fix the comment, rebaseline | | Done. |
| Answers | Writers: TEN, not six (adds controllers/user/index.js:1455, routes/register.js:111, beta-welcome-mode.js:47, controllers/terms-agree.js:37); all land on `user.home`, `bento`, or (supporter boot) `caseload`. `user.home` is the exact leaf name (`router.js:128-129`, `routes/application.js:126-131`). One extra afterRender before the caseload transition is harmless and improves re-entrancy. The `user.home`-resume tests are hollow against the fix; the foreign-route halves are not. | Accepted. The real-handoff case moved to `index` (gate host without a tour). | |

Test-design note: raising `art50_tour_due_max_ms` inside a case cannot distinguish the old 5 s default from the new
35 s, so the value is pinned by a case that reads the default off a fresh instance (`> 30000`).

#### Round-3 results
- guided-tour suite 26/26. Mutations (restore by copy, `cmp` verified): ceiling starts instead of cancels -> only
  the stuck-gate case; ceiling removed -> only the stuck-gate case (deferring stays true); route check removed ->
  the two foreign-route cases; allowlist collapsed to `user.home` -> real-handoff (`index`), bento, allowlist
  table; default ceiling 5000 -> only the default-pin case; sessionStorage removal dropped in consume / in
  sign-out -> only the matching case. Commit 153cff674.
