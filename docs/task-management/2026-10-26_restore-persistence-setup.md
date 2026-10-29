# Restore the sync startup and periodic checks disabled in the Ember migration (2026-10-26)

Branch `traci/fix/restore-persistence-setup` off `develop`. Found while testing the Capacitor 8
native apps: a new device never saves boards for offline use on its own (#1208), and Basic view
saves no picture files. Requested by Traci: "carefully restore what is missing and what we broke,
make sure it happens regardless of the view the user is on."

CoughDrop baseline: `55aaa8aab` (2025-04-24, the last upstream commit before the fork).

## Fact sheet

### (a) Where each value is READ

- `last_sync_at`: read by `check_for_needs_sync` (`app/frontend/app/services/persistence.js:4016`,
  `synced = last_sync_at || 0`). The 48-hour branch needs `synced > 0` (`:4028`). CONFIRMED.
- `local_system.available` / `.allowed`: read by `prime_caches` (`services/persistence.js` `prime_caches`,
  the first `if`) and by the image and sound file writers (`:1302`, `:1693`): without them, synced
  pictures are not written as files. CONFIRMED.
- `refresh_stamp` on persistence: written every 500 ms by app state
  (`services/app-state.js:5404-5406`), read by nothing active today. CONFIRMED.
- `just_logged_in` (localStorage, unprefixed): read and cleared by `schedulePostLoginSyncIfNeeded`
  (`services/persistence.js:3986-3988`). CONFIRMED.
- The live persistence object is the service: `services/persistence.js:125` sets
  `window.persistence = this`, and `utils/persistence.js:4628-4660` forwards every call to it.
  CONFIRMED.

### (b) Every shape the state can hold, and who writes it

`last_sync_at`:
- `undefined`: today, after every app start, on every device (nothing loads it). CONFIRMED at
  runtime on the Android emulator on 2026-10-26 (`window.persistence.get('last_sync_at')` was
  undefined).
- the stored `last_sync` time: written at the end of a successful sync (`:2416`) and, in
  CoughDrop, loaded at startup by `setup()`.
- `1`: CoughDrop's new-device sentinel, written by `setup()` when the device has no `lastSync`
  record (`55aaa8aab:app/frontend/app/utils/persistence.js:38-53`). With it, `check_for_needs_sync`
  takes the 48-hour branch and starts the first sync.
- After a second failed sync, the failure path stores a `lastSync` too (`:2443-2449`).

Writers today of the startup load and the sentinel: only `setup()` (`services/persistence.js:219-286`)
and the utils copy (`utils/persistence.js:236-275`). Callers of either: none. CONFIRMED
(`git grep "persistence.setup("` finds only tests). CoughDrop called it from
`initializers/session.js:13`; that call was removed in `887351945` (2026-01-28, #22), and the
service's own calls were commented out ("TEMPORARILY DISABLED", `services/persistence.js:160-196`).

`local_system`: `undefined` until set; set today only by Modern view's board route
(`routes/user/board-detail.js:28-66`, `_maybe_prime_caches`). CoughDrop set it for every view at
startup from the device-ready hook in `setup()` (`55aaa8aab` `utils/persistence.js:78-95`). CONFIRMED
at runtime: undefined on the Android emulator in Basic view.

Observers CoughDrop's persistence had (`55aaa8aab`): `enable_wakelock`, `on_connect`,
`check_for_needs_sync`, `check_for_sync_reminder`, `check_for_new_version` (plus four computeds).
Active today: only `on_connect`. Disabled: `enable_wakelock` (`:1822-1844`), the
`check_for_needs_sync` observer (`:4086-4187`, replaced by a plain method at `:4001` that runs only
when called), `check_for_sync_reminder` and `check_for_new_version` (`:4188-4242`). CONFIRMED.

### (c) Cross-file claims, checked

- The automatic check logic is unchanged from CoughDrop apart from guards (compare `:4001-4084`
  with `55aaa8aab` `utils/persistence.js:3075-3150`). TRUE.
- `last_sync_stamp` is copied from the session user at login in both (`app-state.js:4180-4182`,
  CoughDrop `app_state.js:2554-2557`), and the server returns the same stamp from both sources
  (`app/controllers/api/users_controller.rb:37`, `lib/json_api/user.rb:38`). TRUE, so the stamp
  branch never starts a new device's first sync, in CoughDrop or now.
- `auto_sync` is true on the installed app (`app-state.js:2316-2321`, `models/user.js:791-800`);
  read live on Android: `true`, `installed_app: true`. TRUE.
- The installed app reloads after login (`components/login-form.js`, `login_success`,
  `capabilities.installed_app` branch: `location.reload()` after `wait`), and the local database
  is chosen once per page load from the logged-in user (`utils/capabilities.js:2529-2545`). TRUE.
  So a startup load reads the right user's `lastSync`.
- `session.confirm_authentication` calls `schedulePostLoginSyncIfNeeded` at login
  (`services/session.js:114-123`), which clears `just_logged_in` at once and starts a 10 s timer
  (`services/persistence.js:3986-3994`). On the installed app the reload that follows login ends
  that timer, and the startup call after the reload (`:205-206`) finds no flag. CoughDrop cleared
  the flag only at startup (`55aaa8aab` `utils/persistence.js:73-77`). TRUE by code order; not yet
  observed at runtime.
- Nothing in CoughDrop read `sync_reminder`, and nothing in the app sets `LingoLinq.update_version`
  (the only readers are `components/confirm-update-app.js:14` and the templates). So restoring
  `check_for_sync_reminder` or `check_for_new_version` would change nothing a user sees. TRUE.
- `capabilities.wakelock` (`utils/capabilities.js:1987-2023`) only uses `chrome.power` or the
  Cordova `powerManagement` plugin; under Capacitor it returns `false`. TRUE.
- The big-logs producer was already commented out in CoughDrop (`55aaa8aab`
  `utils/_stashes.js:722`). TRUE: nothing to restore.

ASSUMED (not load-bearing for the fix): that Basic view's "sync complete" message on Android
followed a sync that did not finish. The device has no `lastSync` record, which the success path
always writes. Separate issue.

## Proposal

### Diagnosis

The January 2026 service migration switched off persistence's startup routine and its observers to
stop initialization errors. A May fix (#271) restored the post-login check and reconnect check
only. Still missing, for every view:

1. Loading the device's last sync time at startup, with the new-device sentinel `1` that starts
   the first sync.
2. Detecting device file storage (`local_system`) and priming the local file caches at startup.
   Today only Modern view's board route does this.
3. The periodic check (every app tick, throttled inside to the user's interval) that keeps a device
   in step with server changes.
4. The post-login check on the installed app, which the reload cancels (above).
5. The sync wake lock (inert under Capacitor; restored for Electron and Chrome parity).

### Candidate fixes

A. **Restore the service's startup routine at the existing deferred init hook** (`:197-208`):
   call `setup()` (which already loads `lastSync` with the sentinel), and add to it the device-ready
   storage step, moved out of `routes/user/board-detail.js` into one service method that both the
   startup and the board route call. Restore the `check_for_needs_sync` observer as a thin observer
   on `refresh_stamp` and `last_sync_at` that calls the existing method, so the method and its
   callers stay as they are. Clear `just_logged_in` only when the 10 s check fires. Restore
   `enable_wakelock` as it was.
B. **Call the utils `setup()` from an initializer, as CoughDrop did.** Rejected: the utils copy
   registers a legacy `lingolinq:persistence` injection on the application, and the live object is
   the service; it would restore a second, stale persistence registration.
C. **Start a sync directly after login when `last_sync_at` is 0** (the original #1208 suggestion).
   Rejected as the simplest alternative: it adds a new trigger instead of restoring the one that
   worked, leaves returning devices without their 48-hour sync and with no periodic checks, and
   does not fix Basic view's file storage.

A is chosen.

### Guards and risks

- Every restored piece runs only outside tests unless `LingoLinq.sync_testing` is set, the seam
  `on_connect` already uses (`:3954`), so unit tests that look up the service do not start storage
  work.
- The observer fires synchronously on every `refresh_stamp` tick (500 ms). The method returns early
  unless logged in and the extras are ready, and limits server stamp checks to the user's interval
  (default 5 minutes), as in CoughDrop. Cost per tick: a few property reads.
- `setup()` sets `last_sync_at`, which fires the restored observer synchronously; that is the
  intended CoughDrop behaviour (sentinel set, check runs, first sync starts).
- Risk: whatever initialization error made the January change disable these may come back. The
  guards that were added since (`isDestroyed` checks, `stashes` checks) are kept. Unknown: the
  original error text is not in the commit; it must be watched for in the full test run and on the
  simulator and emulator.
- Web: `auto_sync` is off by default on the web (`app-state.js:2317-2318`), so the sentinel does not
  start a sync for a web user who never synced. A web user with auto-sync on who logs in without a
  reload reads the anonymous database's `lastSync` at startup; that database holds no synced
  boards, so a sync then is correct.
- Not changed: Basic view's "complete" message for an unfinished sync, sync speed on Android, and
  Modern view's offline board loading (#1213).

### Tests (red first), and the mutation that must turn each red

1. A new device (no `lastSync` record) gets `last_sync_at === 1` after the service starts; a device
   with a record gets the stored time. Mutation: remove the startup call to `setup()`.
2. After the service starts, `local_system` is set and `prime_caches(true)` runs, with no route
   entered. Mutation: remove the storage step from startup.
3. Changing `refresh_stamp` runs `check_for_needs_sync`. Mutation: remove the observer.
4. `just_logged_in` is still set until the delayed check fires. Mutation: clear it at scheduling
   time, as now.
5. `syncing` turning true and false calls `capabilities.wakelock('sync', true/false)`. Mutation:
   remove the observer.

### Questions not resolved

- The exact initialization error from January. Watch the full suite and the device runs.
- Whether the iOS post-login check also failed for another reason; the device run will show
  `syncing because ...` in the console if the restore works.

## Proposal review (adversary-local, 2026-10-26) and the revised plan

Verified by hand: the test harness sets `LingoLinq.sync_testing = true` in each sync-heavy
module's `beforeEach` (`app/frontend/tests/helpers/ember_helper.js:726`, `:1180-1182`), after the
services are looked up, so a `sync_testing` gate read in the deferred init hook is open in tests
(finding 1, CONFIRMED). Every failed sync calls `modal.error` (`services/persistence.js:2475-2477`)
(finding 3, CONFIRMED). The no-reload web login is behind `feature_flags.auth_spa_transition`
(`components/login-form.js:545`) (finding 6, CONFIRMED). The rest were checked against the cited
lines and accepted, except where noted.

Changes to candidate A:

1. **Startup gate:** decided synchronously in `init` with `!isTesting()` (the precedent in
   `schedulePostLoginSyncIfNeeded`). The startup is a named method (`start_sync_state`) so tests
   call it directly.
2. **Observer gate:** the restored observer acts only once the startup has set an instance flag
   (`_sync_checks_enabled`). Existing tests never set it, so the `check_for_needs_sync` tests keep
   testing the method alone (finding 2).
3. **One shared priming step** on the service (`prepare_local_files`), with board-detail's guards
   (signed in, storage allowed) and one in-flight promise cleared when nothing was primed. It
   runs the full `prime_caches(true)` only; CoughDrop's fast first pass was not adopted (see
   below). Board-detail's `_maybe_prime_caches` calls it (finding 7).
4. **Sync bookkeeping:** set `last_sync_event_at` before `last_sync_at` on success (finding 4), and
   skip a forced check while a sync is running (finding 5).
5. **Database owner:** automatic checks are skipped when the open local database does not belong to
   the signed-in user (no-reload web login on a shared browser) (finding 6).
6. **`just_logged_in`:** cleared when the delayed check fires, with a pending-timer guard so two
   calls do not start two timers (finding 8).
7. **Automatic sync failures** (Traci's decision, 2026-10-26: "Quiet, with back-off"): a sync not
   started by the user shows no error popup on failure (the sync status and Sync details log still
   record it), and automatic checks back off after a failure instead of retrying every interval. A
   sync the user starts still shows the popup. The back-off resets on success (finding 3).
8. **Wake lock dropped:** nothing in the repo provides `chrome.power` or `powerManagement`, so it is
   inert on every platform (finding 9). Recorded as a follow-up for native keep-awake.
9. **Diagnosis wording corrected:** the periodic stamp check catches server changes made during
   this session; changes made while the device was off are caught by the 48-hour rule, because the
   stamp is copied from the user record at sign-in (finding 9).

Not adopted from the review: CoughDrop's fast first pass (`prime_caches()` without the file
listing). Basic view never waits on priming (it renders from what is cached), and Modern view's
route already waited on the full pass alone before this change, so adding the fast pass would only
lengthen Modern view's wait. Recorded here so it can be revisited if iOS file listing proves slow.

## Implementation

- `app/frontend/app/services/persistence.js`:
  - New behaviour in a `persistence.reopen({...})` block after the class, so no `.eslint-todo` row in
    the file moves (`npm run lint:js:ci` reports 0 new findings there):
    - `init` calls `start_sync_state` when `!isTesting()`.
    - `start_sync_state` turns on the periodic check, calls `setup()` (unchanged; it already loads
      `lastSync` and sets the sentinel), and registers `prepare_local_files` on device-ready.
    - `prepare_local_files` is board-detail's storage step moved here, with one in-flight promise.
    - `sync_check_watcher` observes `refresh_stamp` and `last_sync_at`.
    - The `check_for_needs_sync` wrapper adds three guards: no check while syncing, none when the
      open database is not the user's, and the back-off for unforced checks.
    - The `sync` wrapper records the root sync's reason, and `sync_backoff_watcher` sets the
      back-off.
  - Line-for-line edits in the class: the success path sets `last_sync_event_at` before
    `last_sync_at`; the failure popup only for syncs that are not automatic
    (`!sync_is_automatic()`; first written as `sync_reason == 'manual_sync'` and corrected after the
    implementation review, below); the post-login
    function clears `just_logged_in` after the check runs, has a pending guard, and reads an
    optional `post_login_sync_delay` (tests set it; production keeps 10 s).
- `app/frontend/app/routes/user/board-detail.js`: `_maybe_prime_caches` calls
  `persistence.prepare_local_files()`; the unused `capabilities` import is removed. This shifts the
  file's 5 `.eslint-todo` rows by a constant -32 lines (same rule, column and message hash; total
  findings 1549 = baseline 1549). Re-anchoring them needs Traci's approval (Rule #14). Approved
  by Traci on 2026-10-27 ("re-anchor the lint entries"): rows 112/130/140/489/619 moved to
  80/98/108/457/587, each checked to be the same `runLater(function() {` call.

## Tests

- New, at this stage (more were added after the reviews, below):
  `app/frontend/tests/unit/services/persistence-sync-startup-test.js` (10 tests), and three
  tests at the end of `app/frontend/tests/utils/persistence-sync-test.js` (automatic failure is quiet
  and backs off; a user-started failure still shows the popup; event time recorded before
  `last_sync_at`).
- Red first, against unchanged `develop` code: 12 of 13 failed, each for the reason it was written
  for (`start_sync_state` / `prepare_local_files` missing; the guards returning true and requesting
  the stamp; one forced check seeing the flag already cleared; the popup shown for an automatic
  failure; the event time not newer at the `last_sync_at` change). The 13th (a user-started failure
  shows the popup) passes on `develop` by design: it guards existing behaviour.
- Green after the fix: 13 of 13.
- Baselines: `--filter "persistence"` on `develop` 181 tests, 172 pass, 9 skip, 0 fail; with the
  fix 194, 185, 9, 0 (the 13 new tests). `--filter "/(persistence|board-detail|board detail)/i"`
  with the fix: 394, 385, 9, 0.
- Full suite with the fix, both timing-strict shards (`--query "pool=include&timingStrict=1"` and
  `pool=exclude`): include 1682 tests, 1670 pass, 7 skip, 5 todo, 0 fail; exclude 2138 tests,
  2108 pass, 30 skip, 0 fail. Skips total 37 (a complete run). The only harness reports are the
  `waitForQueuedStoreFetches` self-tests' own deliberate `[queued-fetch]` lines.

## Device verification (Android emulator, 2026-10-27)

Build: this branch's frontend (production build, `rake extras:assert_js`, precompile) packaged
into the Capacitor 8 shell (lingolinq/lingolinq_mobile#2 branch), API pointed at staging, fresh
install (`adb uninstall` first). Synthetic account `traci-test-simulator`, which uses Basic view
(`board_view_style: classic`; the session stayed on `user.board-alt.index` and never entered
`user.board-detail`). Sync was never pressed.

- 07:49:04, about 30 s after sign-in: "syncing because it has been more than 48 hours", then
  "syncing for self". The first sync started on its own.
- `local_system`: `{available: true, requires_confirmation: false, allowed: true}`, `primed: true`,
  set by the startup path (Basic view, no board-detail route).
- 08:31:28: `sync_status: finished`, `last_sync_at` set, `settings::lastSync` row written.
  Device DB: 1,579 board rows, 233 buttonsets, 437 dataCache rows, 302 of them with a local file.
- 36 sync errors: 33 "sync promise took too long" (the 5 s board-reload limit; the existing
  sync-timeouts issue) and external icon URLs that failed to download. Not caused by this change.
- Airplane mode: the "do" folder (which showed "Not available offline" before the fix) and its
  "play" sub-folder open with every picture; 0 broken images; pictures served from device files
  (`https://localhost/...`) and data URIs.

### Why the sync looked slow on the emulator (measured, not a code regression)

The emulator renders with software GL (`gles_mode_selected:swangle`, `vulkan:lavapipe`). The
header's sync spinner (`.spinning`, a `transform: rotate` animation, the same as CoughDrop's
`application.hbs` at 55aaa8aab) kept the app's `RenderThread` at about 71% of a core, and every
Capacitor plugin call took 1 to 4 s. Pausing that one animation through CDP: native calls went
from 27 to 422 per minute, median SQLite query from 1,900 ms to 8 ms, boards from about 1 to 14
per minute. Turning off Capacitor's JS-side debug logging alone changed nothing. Speed
measurements need hardware GPU emulation or a real device.

Real inefficiencies seen, for a separate change: `background_board_prefetch` adds owned roots
(and public roots when enabled) to the offline sync on top of CoughDrop's home-board tree; the
same large dataCache rows (1.7 MB, 550 KB) were written more than once within a minute.

### Device verification (iPad simulator, 2026-10-27)

iPad Air 11-inch (M4) simulator, iOS 27.0, same frontend build in the Capacitor 8 shell, staging
API, fresh install, same synthetic account (Basic view). Sync was never pressed. Driven through
the WebKit inspector (`ios_webkit_debug_proxy` on the simulator's `webinspectord_sim` socket);
taps were real `mousedown`/`mouseup` events on the button elements, handled by `raw_events.js`.

- 09:17: "syncing because it has been more than 48 hours"; the first sync started on its own.
- 09:24:49: sync finished, `settings::lastSync` written. About 7.5 minutes, against 42 on the
  software-rendered Android emulator (the simulator draws with the Mac's GPU). Device DB: 1,406
  distinct boards; 252 picture and sound files under the app's `Documents/image` and
  `Documents/sound`. 44 "sync promise took too long" timeouts (the 5 s board-reload limit, #1212).
- Offline, with the Mac's Wi-Fi off (every server request in the window failed with status 0;
  boards were read from SQLite): home, "do", "play", "eat", "feel" and "keyboard" all opened, 0
  broken images on each, no "not available offline" text; tapping "winner" and "tasty" added them
  to the sentence box.
- Not caused by this change, seen during the run:
  - The `keyboard_10` board's letter keys have `hide_label: true` and no image, so they draw as
    blank tiles online and offline (board data; the labels exist in the DOM with `.hide-label`).
  - In the simulator, `navigator.onLine` stayed `false` after the Mac's Wi-Fi came back, although
    a `fetch` to staging from the web view returned 200; the app's `online` flag follows
    `navigator.onLine` only (`services/persistence.js:4246-4277`), so it stayed in offline mode
    until relaunch. Not checked on a real iPad; it may be a simulator quirk.

## Implementation review (adversary-local, 2026-10-27)

Local substitute only; the canonical `/review-pr` and `/adversary-review` have not run. Two
`adversary-local` reviewers on the uncommitted working tree (app code; tests and `.eslint-todo`).
Findings verified by hand before recording. No Critical or High.

- **Medium, CONFIRMED: user-started syncs with a named reason now fail silently.** The popup
  condition `sync_reason == 'manual_sync'` (`services/persistence.js:2475`) also silences syncs
  the user triggered that pass a reason: `push_to_cloud` (`components/push-to-cloud.js:72`),
  `home_board_changed` (`controllers/board-picker.js:195` and others), `sidebar_update`
  (`components/add-to-sidebar.js:142`). On develop every failed sync showed `modal.error`. They
  also start the automatic back-off. Needs a fix: classify "automatic" by the reasons the app
  starts on its own, not "everything except manual_sync".
- **Medium, CONFIRMED in code, not seen on devices: a second full sync can start right after
  one finishes.** `sync_status` turns `finished`/`succeeded` synchronously (`:2401`/`:2408`) but
  `last_sync_at` and `last_sync_event_at` are written only after the `lastSync` store resolves
  (`:2415-2418`). In that window `syncing` is false, `last_sync_at` is still 1 and the event time
  is the sync's start (older than the interval for any sync over about 5 minutes), so the
  `refresh_stamp` observer takes the 48-hour branch again. If the store rejects, it repeats after
  every sync. Both device runs logged only one start, so the store won the race there. Fix
  direction: set `last_sync_event_at` synchronously when the final status is set.
- **Medium, CONFIRMED: the post-login edits compress lines to hold baseline rows still.**
  `services/persistence.js:3988`, `:3990`, `:3992` now carry two statements each, which keeps the
  two `.eslint-todo` rows after line 3988 from moving. `app/frontend/CLAUDE.md` forbids this
  ("deleting or compressing existing lines to hold them still is not"). Fix: move the change into
  the `reopen` block (override `schedulePostLoginSyncIfNeeded`) or re-anchor the two rows with
  approval.
- **Medium, CONFIRMED: test gaps (a mutation passes every test).** `init` calling
  `start_sync_state` (the core of the fix; tests call `start_sync_state` directly); board-detail
  joining the service promise; retry when nothing was primed; back-off reset on success, doubling
  and cap; the `last_sync_at` observer key; `local_db_is_current_user` treating an unknown owner as
  current.
- **Low:**
  - New tests clean up inline after assertions (`just_logged_in`, `auto_sync_backoff_until`), so a
    failure would leak into later tests.
  - `sync_backoff_watcher` is not gated on `_sync_checks_enabled`.
  - "Record the sync event time first" test compares millisecond timestamps (possible flake).
  - Pre-existing, now more reachable:
    - two automatic failures in a row set `last_sync_at = now` (`:2446-2451`), so a new device
      on a flaky network waits 48 hours for its first automatic sync;
    - supervisee sync failures still show `modal.warning` during an automatic sync (`:2632`);
    - Basic view is not primed after a no-reload sign-in (web `auth_spa_transition` only);
    - the DB-owner guard after a username change is unverified;
    - `start_sync_state` in `init` has no try/catch.
- Clean: the wrong-user guard precedes every check-driven sync path; no concurrent syncs from the
  checks; the back-off cannot stick; signed-out and web behaviour unchanged; board-detail guards
  reproduced; plan-review findings 2 and 4 to 9 implemented; existing tests only added to (Rule 14);
  `.eslint-todo` re-anchored rows point at the same five calls.

### Fixes after the implementation review (2026-10-27)

Only findings that are real problems were fixed (Traci, 2026-10-27: "only make the fixes if they
are necessary and correct real problems"). Each fix has a test written first that failed for the
reason it was written for.

- **User-started syncs with a reason show the popup again.** `sync_is_automatic()` (reopen block)
  is true only for the reasons `check_for_needs_sync` passes (`long_time_since_sync:`,
  `sync_stamp_changed:`), read from the root sync's reason so supervisee syncs follow their root.
  The popup condition (`services/persistence.js:2475`, same line count) and the back-off use it.
  Test: "should still show the error popup for a failed sync the user started with a reason"
  (`push_to_cloud`); red before the fix (no popup).
- **No second full sync after a long one.** `sync_backoff_watcher` sets `last_sync_event_at` when
  the status turns `succeeded`/`finished`, before the `lastSync` store resolves. Test: "should
  record the sync event time when a sync finishes, before the lastSync store resolves" (reads the
  value a microtask after the status change and checks the store has not resolved yet); red before
  the fix and red again with the line removed.
- **Coverage for the core:** "the service runs the sync startup when it is created outside tests"
  (`isTesting` stubbed false, `start_sync_state` stubbed on the prototype); red with the call
  removed from `init`.
- Not fixed, by decision:
  - The two failures then a 48-hour wait (`:2444-2451`) is CoughDrop's deliberate "prevent
    repeated attempts" rule and the back-off does not make it worse; changing it is a product
    decision.
  - The other untested behaviours (board-detail joining the promise, retry when nothing was primed,
    back-off reset and cap, the `last_sync_at` observer key, unknown DB owner) work as reviewed and
    were left without new tests.
  - The Low items are left as recorded above.
  - The compressed post-login lines (`:3988`, `:3990`, `:3992`) were split back into one statement
    per line; with Traci's approval (2026-10-27) the two `.eslint-todo` rows below them were
    re-anchored, `persistence.js` `ember/no-runloop` 3989 -> 3990 and 4521 -> 4524, each checked
    to be the same `runLater(function() {` call as at HEAD. Gate: new=0; the 65 sync tests pass.
- Results: the 16 sync startup and sync-failure tests pass. `npm run lint:js:ci`: new=0. Full suite,
  both timing-strict shards: include 1684 tests, 1672 pass, 7 skip, 5 todo, 0 fail; exclude 2139,
  2109 pass, 30 skip, 0 fail (3,823 tests, 3 more than the earlier run; 37 skips, a complete run).

## Canonical review passes (2026-10-27)

PII preflight: `review-preflight.sh range` exited 0.
`REVIEWED=range origin/develop (a01becefdf90ba80476c88119e558639cb1125c8) ... origin/traci/fix/restore-persistence-setup (068e1f15b8a11797c0c0a634cff45478077604ef) in /Users/traciday/Documents/GitHub/lingolinq/LingoLinq-AAC`

- `/review-pr` (senior-dev pass, read only the preflight's `DIFF_FILE`): **Approve with
  comments.** No Critical or High.
- `/adversary-review` (ai-company-brain `agents/adversary.md`): **Ship with conditions.** No
  Critical or High; "data isolation on the automatic path holds by construction".

Each finding was checked by hand:

- **Fixed: a startup error could stop the service being created** (`/review-pr`, Medium).
  `setup()` rethrows (`services/persistence.js:282-284`) and `init` called `start_sync_state`
  unguarded; every route and component injects the service, so the app, not just sync, would fail.
  `init` now catches and logs. Test: "the service is still created when the sync startup throws",
  red before the fix.
- **Fixed: task log.** The 2026-10-28 dates were wrong (corrected to 2026-10-27); the
  implementation and test-count lines are marked as superseded; the board-detail re-anchor
  approval is recorded where it was asked for.
- **Refuted: the DB-owner guard fails open on an unexpected name** (`/review-pr`). The real name
  is `"lingolinqStorage::" + db_id + "===" + db_key` (`utils/capabilities.js:2539`), with `db_id`
  the signed-in user name (`utils/_stashes.js:310-312`), which the guard's pattern matches.
- **Product decision, open: a failed first sync is invisible in Modern view**
  (`/adversary-review`, Medium). CONFIRMED: the "Sync Failed" row exists only in the classic
  dashboard (`components/dashboard/classic-view.hbs:400`, `classic-rail.hbs:555`) and Sync
  details; `authenticated-view.hbs` has none. With quiet automatic failures, a Modern-view user
  whose first sync fails is told nothing. Options: a small non-modal failed state in Modern view,
  or keep the first-device sync loud.
  Decided 2026-10-28 (Traci): option A, unflagged. See "Sync-failed notice in Modern view" below.
- **Pre-existing, not fixed: reconnect forces a check that skips the back-off**
  (`/adversary-review`, Medium, PLAUSIBLE). `on_connect` (`:3945-3958`) calls
  `check_for_needs_sync(true)` on every offline-to-online flip; it is identical on develop, where
  each failure also showed a popup. Each reconnect after a failed sync retries a full sync. Not
  caused by this change; now quiet.
  Fixed in this PR 2026-10-28 at Traci's request (no follow-up issue). See "Reconnect respects the
  back-off" below.
- **Not fixed (Low, by decision):** pointer comments at the class methods the reopen block wraps
  (would move more baseline rows); back-off doubling, cap and reset tests; a test tied to the real
  DB-name builder; `_root_sync_reason` shared between overlapping syncs; the owner check running
  every tick; the millisecond comparison in "event time recorded before last_sync_at"; a stuck
  `syncing` status now also blocking forced checks; the new per-user fields not reset by
  `clear_user_state` (the DB-owner guard blocks the next user's checks until reload anyway); the
  two-failures 48-hour rule.
- Results after the fix: the 66 sync startup and sync tests pass (1 skip); `npm run lint:js:ci`
  new=0.

## Sync-failed notice in Modern view (2026-10-28)

Traci chose the non-modal failed state, with no feature flag (a fix to the behaviour this branch
changed, not a new feature).

- **Where the failure is read (CONFIRMED).** `persistence.sync_status` is set to `'failed'` in the
  failure branch of `sync` (`services/persistence.js:2443`) and `stashes.last_sync_status` to
  `'failed'` beside it (`:2454`). `stashes.persist` calls `this.set` (`services/stashes.js:266`),
  and the stash is restored from localStorage at startup (`:136-144`), so it survives a reload,
  which `sync_status` does not.
- **Every shape (CONFIRMED).** `sync_status`: empty, `syncing` (`:1852`, `:2043`), `finished`
  (synced with some board errors, `:2401`), `succeeded` (`:2408`), `failed` (`:2443`).
  `last_sync_status`: null, `finished`, `succeeded`, `failed`.
- **Rule** (`components/dashboard/authenticated-view.js`, `sync_failed_notice`, in a reopen block
  at the end of the file so the line-anchored ESLint baseline does not shift; the file already
  places later additions there): hidden unless `sync_able` (extras ready, not an external-device
  account, the same gate as the classic sync row); a non-empty `sync_status` decides it (shown
  only for `failed`, hidden while a retry runs); with an empty `sync_status` (after a reload) the
  stashed `last_sync_status == 'failed'` decides it.
- **UI** (`authenticated-view.hbs`, Home tab, below the pending-approval notices): reuses the
  `md-pending-notice` card (`role="status"`). Text: new key `sync_failed_notice` ("Sync failed.
  Some boards may not be ready to use offline.") plus `sync_status_error` when set. Buttons: "Try
  Again" (existing key `try_again`, calls the existing `sync` action, shown only online) and "Sync
  Details" (existing key `sync_details`, opens the existing details modal through `extraAction`).
- **Tests:** `tests/unit/components/dashboard-sync-failed-notice-test.js`, 5 tests, red before the
  computed existed (5 of 5 failed). Mutation: replacing the stash read with `return false` turns
  "still shows after a reload" red (1 failure); restored from a copy.
- **Live check** (local dev server, headless Chrome, example user switched to Modern view and back):
  the notice renders with `role="status"`; Try Again calls `persistence.sync('self', true)`; Sync
  Details opens the modal; after a reload with an empty `sync_status` and the stash `failed` the
  notice still shows; offline hides Try Again; a success removes it. The local dev DB needed the two
  pending develop migrations (`20261013120000`, `20261018120000`) before the API would answer.
- **Known limit:** the notice does not say why the sync failed beyond `sync_status_error`; the
  details modal holds the log for the session only.
- Results: dashboard filter 118 of 118 pass; `npm run lint:js:ci` new=0; template lint clean.
- Full suite, timing-strict shards: include 1684 tests, 0 fail, 7 skip; exclude 2145 tests, 0 fail,
  30 skip. Against the last full run (1684 / 2139) the exclude total is up 6: these 5 tests and the
  startup-throws test added after that run.

## Reconnect respects the back-off (2026-10-28)

- **Mechanism (CONFIRMED).** `on_connect` (`services/persistence.js:3945`) runs on every change of
  `online` and, 500 ms after the device comes online, calls `check_for_needs_sync(true)` (`:3958`).
  The wrapper in the reopen block let any forced check past the back-off, so after a failed
  automatic sync each reconnect could start the full sync again (the 48-hour branch for a device
  still on the first-sync marker, or the forced stamp check).
- **Every forced caller (CONFIRMED).** Reconnect (`:3958`) and the post-login check (`:3994`). The
  copies in `utils/persistence.js` (`:3975`, `:4092`) belong to the module's own object, whose
  `online` is set only when it is created (`:4259`); every online event and the 30 s poller write
  the service through `getPersistence()` (`:109-118`), so those observers never fire.
- **Fix.** `on_connect` passes a second argument, `check_for_needs_sync(true, 'reconnect')` (the
  same line, so no baseline row moves). The wrapper lets only a forced check that is not a reconnect
  skip the back-off. Outside a back-off a reconnect is still forced, so it checks the stamp at once
  as before. Rejected: passing a non-`true` value from `on_connect`, which would also drop the
  immediate check when there is no back-off.
- **Test.** "a reconnect waits out the back-off, and still checks at once outside it"
  (`tests/unit/services/persistence-sync-startup-test.js`, guards module). It drives a real
  offline-to-online flip. `sync_testing` is on only for the flip (other app code polls while it is
  on), and `stashes.push_log` is stubbed, because coming online also drains the usage log
  (`services/stashes.js` drain_on_reconnect), which arms a 15-minute timer that `settled()` waits
  for (found with a probe of the pending run-loop timers). Red before the fix (stamp request during
  the back-off); mutation: `on_connect` back to `check_for_needs_sync(true)` turns it red; restored
  from a copy. The earlier back-off test's assertion message said "(sign-in, reconnect)"; it now
  says sign-in only, with the assertion unchanged.
- Results: startup 13/13, persistence-sync 54 (1 skip), check_for_needs_sync 16, stashes reconnect
  7, all passing; `npm run lint:js:ci` new=0.
- Full suite, timing-strict shards: include 1684 tests, 0 fail, 7 skip; exclude 2146 tests, 0 fail,
  30 skip (one more than the run before it: the new reconnect test).

## Local adversarial review of the notice and the reconnect fix (adversary-local, 2026-10-28)

Two `adversary-local` reviewers, one per change, briefed with the questions and not the author's
conclusions. No Critical or High. Each finding was checked against the code before acting.

- **Medium, CONFIRMED, fixed: an automatic sync that failed because the device went offline was no
  longer retried on reconnect.** The failure branch records "Must be online to sync"
  (`services/persistence.js:2459`) and `sync_backoff_watcher` counted it like any automatic failure,
  so with reconnect now respecting the back-off the retry waited 30 minutes to 6 hours. Fix: a
  failure while `online` is false does not back off (the reconnect retries it, as before this
  branch); failures while online still do. The stashes log upload clears its own back-off on
  reconnect for the same reason (`services/stashes.js:838-842`).
- **Medium, PLAUSIBLE, fixed: after the no-reload sign-out (`auth_spa_transition`, a per-user beta
  flag, not on by default), the previous user's failure showed to the next user and Try Again could
  sync into the previous user's database.** CONFIRMED parts: the service has no `clear_user_state`
  (only app-state has one; `services/session.js:897` calls it only if present), and Try Again calls
  `sync` directly, which skips the database-owner guard. Fix: the notice is hidden while
  `local_db_is_current_user()` is false. Basic view's Sync row has the same stale status and was
  not changed.
- **Low, CONFIRMED, fixed: a cancelled sync showed as "Sync failed" and, through the stash, after
  every reload.** `cancel_sync` makes `board_lookup` reject `{error: 'canceled'}` (`:2735`), which
  reaches the root failure branch. Fix, in the reopen block (an edit in the failure branch would
  move 12 baseline rows): `cancel_sync` records `root_sync_canceled`; the root `sync` wrapper resets
  it and, when a cancelled sync rejects, puts back the `last_sync_status` it had before; the notice
  ignores a failed status from a cancelled sync. Side effect: a cancel no longer counts toward the
  two-failures 48-hour pause. Basic view still shows "Sync Failed" in the session after a cancel.
- **Left, Low:** focus drops after Try Again (the card is removed while the sync runs); `role="status"`
  on a card with buttons (same as the approval notices); no period after the appended error text;
  during a back-off a reconnect no longer refreshes unread counts (token restore still runs); no
  test of the notice's buttons (the live check covered them).
- **Checked and correct:** reconnect and post-login are the only forced callers; the
  `utils/persistence.js` copy never fires; sync does not get stuck after the back-off (the 500 ms
  tick re-checks); a failed manual sync does not set the back-off; the new tests fail for the right
  reason; the edit to the earlier assertion message was legitimate.
- **Tests, each red first and each turned red again by removing its fix (restored from copies):**
  "an automatic sync that failed offline does not back off; one that failed online does" (startup
  guards); "hidden while the open database belongs to another user" and "hidden after the user
  cancels a sync" (notice); "should not remember a cancelled sync as a failed one"
  (`tests/utils/persistence-sync-test.js`, a real sync whose board step cancels).
- Results: startup 14, notice 7, persistence-sync 55 (1 skip), check_for_needs_sync 17, stashes
  reconnect 7, dashboard 120, all passing; `npm run lint:js:ci` new=0.
- Full suite, timing-strict shards: include 1685 tests, 0 fail, 7 skip; exclude 2149 tests, 0 fail,
  30 skip (4 more than the run before: the 4 new tests).
