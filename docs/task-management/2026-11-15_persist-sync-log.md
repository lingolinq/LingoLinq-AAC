# Persist the sync log so Sync Details survives a reload (2026-11-15)

Branch traci/fix/android-sync-board-downloads (worktree /home/tracid/LingoLinq-AAC-sync-downloads). Traci approved
writing the proposal (2026-11-15). Follows the step 2 sync status screens: the grouped Sync Details and the drawer's
"needs attention" read `persistence.sync_log`, which is lost on every reload or app restart.

## Fact sheet

(a) Where is `sync_log` READ?
- CONFIRMED: utils/sync_rollup.js summary_for (`persistence.get('sync_log')`, last entry) feeds
  components/sync-details.js `summary` and components/sync-progress-drawer.js `summary`.
- CONFIRMED: components/sync-details.js `details` (:128-136, the technical log), controllers/sync-details.js:14-22,
  components/dashboard/classic-view.hbs:439 and classic-rail.hbs:594 (`persistence-value 'sync_log'`, shows the Sync
  Details link), classic-rail.js:272, dashboard/authenticated-view.js:1512 and :1729 (lists handed to the modal),
  sync-progress-drawer.js:142.
- CONFIRMED: nothing reads it from storage. It is never stored: no `store(... 'syncLog')` or stash anywhere.

(b) What shapes can it hold, and who writes each?
- CONFIRMED writers (all set the SERVICE instance's property):
  - services/persistence.js:2421-2432 success entry {user_id, reason, manual, issues, finished: Date, statuses,
    roots, summary}, then `sync_log_rand`;
  - services/persistence.js:2463-2473 error entry {user_id, manual, errored: true, finished, statuses, summary}
    (does NOT bump sync_log_rand);
  - services/persistence.js:5117-5120 cancel entry {user_id, manual, canceled: true, finished, statuses: [],
    summary};
  - utils/persistence.js:2443-2454 and :2483-2493, the same two shapes, via getPersistence(), which returns
    `window.persistence`, the service instance (utils/persistence.js:108-115).
- CONFIRMED: readers MUTATE entries in place: sync-details.js `details` sets cached/downloaded/re_downloaded/
  sorted_statuses on each entry, idx and boolean status flags on each status row, and `toggled`.
- CONFIRMED: no cap. Every sync in a session appends (automatic syncs run several times a day).
- States: undefined/[] at boot; N entries in a session; after sign-out on the SPA path (below), the previous person's
  entries.

(c) Cross-file claims
- CONFIRMED: the device database is per user: capabilities.db_name = "lingolinqStorage::<db_id>===<key>"
  (utils/capabilities.js:2491-2493); persistence.local_db_is_current_user compares it with the signed-in user
  (services/persistence.js:4874-4879).
- CONFIRMED: setup_database runs only at capabilities init (utils/capabilities.js:218), i.e. at app boot. Nothing
  switches the database on a sign-in without a reload.
- CONFIRMED: `lastSync` ({last_sync, stamps}) is kept in the same per-user `settings` store and read back at setup,
  services/persistence.js:243-280 (three branches: immediately, and when lingoLinqExtras is `ready`).
- CONFIRMED: sign-out normally reloads; the SPA path (session.js:842, :873) does not. It is gated by the per-user
  beta flag `auth_spa_transition` (session.js:783-789; lib/feature_flags.rb lists it in AVAILABLE, not in
  ENABLED_FRONTEND_FEATURES :136-150), web only (not installed_app).
- CONFIRMED: that path calls persistence.clear_user_state (utils/persistence.js:1971-), which clears sync_progress,
  sync_status, last_sync_at, stamps and queues but NOT `sync_log`. So today, for a beta-flag web user, the previous
  person's sync log (board keys, which carry usernames, and board names) stays in memory and shows in the next
  person's Sync Details on the same device until a reload. PRE-EXISTING; persisting the log must not make it durable.
- ASSUMED, not load-bearing: IndexedDB keeps a Date through structured clone, the SQLite (Cordova) path stores JSON.
  The fix normalises `finished` on restore either way.

## Diagnosis

Sync Details and the drawer group the LAST sync log entry. The log is memory only (writers above, no store), so after
a reload, an app restart, or Android killing the Home Screen app in the background, Sync Details shows nothing and a
"needs attention" result is gone. Seen on the emulator: `sync_log` length 0 after a reload, right after a sync.

## Candidate fixes

A. Per-user IndexedDB record (RECOMMENDED). Keep the newest 5 entries in the `settings` store as `syncLog`, next to
   `lastSync`.
   - Save: one observer on the service's `sync_log` (catches all five writers, since they all set the service), run
     once per change through runLater so a burst writes once. Store a copy with whitelisted fields only (user_id,
     reason, manual, issues, errored, canceled, finished, summary, statuses as {id, key, status, error}, roots), so
     reader mutations (sorted_statuses, toggled, idx, flags) are not saved.
   - Skip the save when local_db_is_current_user() is false (the open database is someone else's).
   - Restore: in the setup hook that reads `lastSync` once the database is ready, read `syncLog`, turn `finished`
     back into a Date, and put the stored entries BEFORE any entries already in memory (a sync that finished before
     the read must stay last), de-duplicated by finished + user_id.
   - Sign-out: clear_user_state also sets `sync_log` to [] (fixes the pre-existing SPA carry-over in memory).
   Trade-off: async, a little code in a legacy file (line-neutral edits); survives sign-out per user, like the boards
   themselves, so a person sees their own last result when they come back.

B. A stash (localStorage, `stashes.persist('sync_log', ...)`).
   - stashes.flush() on every sign-out (session.js invalidate) wipes it for both sign-out paths, so isolation is
     automatic.
   - Rejected: localStorage is synchronous and shared with every other stash under a ~5 MB quota; a supervisor's sync
     covers every supervisee's boards (hundreds of rows, plus roots) and 5 entries can reach hundreds of KB written
     on the main thread at the end of each sync. A quota error there would break other stashes, including auth.

Simplest alternative considered: keep only the newest entry. Rejected as the ONLY change: the technical log for
support shows history, and the cap of 5 already bounds the size. Still possible if review prefers it.

## Risks

- Cross-user exposure: a saved log written into the wrong person's database. Mitigated by the per-user database, the
  local_db_is_current_user guard on save, and clearing memory on sign-out. Residual: the pre-existing case where the
  open database already belongs to someone else (SPA path, beta flag) is not fixed here; this change only refuses to
  write in it.
- Size: bounded at 5 entries; statuses already sit in memory today.
- Restore racing a sync that ends during the read: handled by putting stored entries first and de-duplicating.
- A save failing (storage full): the observer catches and ignores; the log stays in memory as today.
- PII: board keys and names, already stored in the same per-user database as the boards. No new kind of data on the
  device; nothing leaves the device.

## Questions not resolved

1. Should the restored log also feed the drawer after a restart (a "needs attention" card at app start)? Proposed:
   NO. The drawer only follows syncs that run in this session (services/sync-notice.js); Sync Details shows the
   restored result. Traci's call.
2. Does a sync for a supervisee (when the open database is the supervisor's) belong in the supervisor's log? Today
   the in-memory log holds it; this keeps that.
3. The pre-existing SPA sign-out carry-over: fixing the memory side here (clear_user_state) is in scope by the
   resolve-not-file rule; the database side (wrong database open after an SPA sign-in) is not, and should be stated
   in the PR.

## Tests (red first) and the mutations that must fail them

New file tests/unit/services/persistence-sync-log-test.js (persistence stubbed with tests/helpers/persistence-stub.js):
1. A finished entry is saved to settings/syncLog with whitelisted fields only, newest 5. Mutation: remove the
   observer, or save the raw entries (reader fields appear) -> red.
2. Restore puts stored entries first, turns `finished` into a Date, keeps an entry written before the read last,
   and does not duplicate. Mutation: restore not called / appended after / no Date -> red.
3. No save when local_db_is_current_user() is false. Mutation: guard removed -> red.
4. clear_user_state empties sync_log. Mutation: line removed -> red.

## Adversarial review (2026-11-15) and the revised proposal

Reviewer: `adversary` agent at d3d8ab529, read-only. 7 findings, none Critical or High, verdict "proceed with named
changes". Checked myself before accepting: findings 1 and 2 (code read below); the rest are accepted on the reviewer's
cited lines and are re-checked when each is implemented.

Corrections to the fact sheet:
- FALSE (was CONFIRMED): "the SPA sign-out calls persistence.clear_user_state (utils/persistence.js:1971)".
  session.js:897-898 calls it on the persistence SERVICE, which does not define it (services/persistence.js has only
  a comment mentioning it, :5093), so the typeof check skips it. Already recorded by
  tests/unit/services/app-state-clear-handoffs-test.js:67-69. The clear that does run is app-state clear_user_state
  (services/app-state.js:2140, the persistence line at :2255).
- OVERSTATED: the SPA carry-over is LATENT, not live. Per the reviewer, sign-in reads the compiled ENABLED list
  before a user is loaded (login-form.js:545, globals.js.erb:5), which lacks auth_spa_transition, so the next
  sign-in always reloads. Not re-checked by me; not load-bearing for the revised design.
- CONFIRMED (was ASSUMED): Date survives IndexedDB put (dbman.js:493) and becomes a string through SQLite JSON
  (dbman.js:507).
- CONFIRMED (me): persistence.store() resolves on a failed write but calls note_failed_write
  (services/persistence.js:771), which a running sync counts as a storage failure, and it pushes every stored
  object into root.stores / root.log (:762-764).

Revised design (candidate A, adjusted):
1. No observer. One helper, record_sync_log_entry, called on the five writer lines (line-neutral edits): copy the
   entry with whitelisted fields (statuses defaulted to [], each row {id, key, status, error}), keep the newest 5
   in memory, then save. Returns early when the service is destroyed. Never runs on clear or restore.
2. Save with lingoLinqExtras.storage.store directly (own catch), not persistence.store(): a failed save is neither
   counted against a sync nor kept in memory.
3. Owner-stamped record {owner, entries}: save and restore only when auth_settings.user_name is present AND equals
   the open database's id; drop a stored record whose owner differs.
4. One restore, behind a run-once flag, with its own find and rejection handler; never chained onto lastSync, so a
   missing syncLog (every device's first boot after deploy) cannot set last_sync_at = 1. Restored entries go before
   entries already in memory; duplicates removed by user_id + finished.getTime(); finished turned back into a Date;
   rows without key fall back to id.
5. Sign-out: clear sync_log in app-state clear_user_state (:2255), memory only, never saved.
6. Sync Details lead line: when sync_status is null (after a restart), derive it from the last restored entry
   (errored / issues / canceled), so the dialog never says "Synced and ready" above "Not saved yet" cards.

Tests (red first): save on a finished entry (whitelisted, newest 5); a failed save does not make the next sync
report a storage failure; owner mismatch -> no save, no restore (auth {} with database "__" included); restore once,
before in-memory entries, no duplicates, Date restored; missing syncLog keeps last_sync_at; sign-out clear through
appState.clear_user_state (mutant: line only in utils -> red); lead line per restored entry kind. Run
tests/utils/persistence-sync-test.js with timingStrict=1 before claiming no regressions.

## Result (2026-11-15)

Traci: no drawer card at app start (Q1); keep the newest 5, and the grouped view skips cancelled or empty entries
(Q2, after the detailed explanation); the status-line change if it looks modern and professional.

Commit 489161674 (local, not pushed). Red first: 4 integration tests red and the store test unloadable before the
module existed. Green, timing-strict on: 205 tests, 204 pass, 1 pre-existing xit; re-run after moving the
persistence-sync test: 174 tests, 173 pass, 1 xit.

Mutations (one build, 7 mutants, restored with git checkout from the commit): sign-out clear removed -> app-state test;
success writer unwired -> persistence-sync "newest 5"; owner check removed -> owner test; run-once removed ->
restore test; rows not required -> both "earlier result" tests; no restored lead -> both lead tests; save through
persistence.store -> "straight to device storage". Each red on its own test.

Lint: lint:js:ci new=1 is the known toggle_technical false positive (main-checkout plugin). A first placement of the
copied persistence-sync test in the middle of the file shifted 10+ line-anchored baseline rows and copied a baselined
`later`; moved to the end of the main describe (below the highest baselined line, 4890) with setTimeout instead.

Behaviour changes beyond the proposal, stated: the error writer now bumps sync_log_rand (so Sync Details recomputes
after a failure, as it does after success and cancel); the in-memory log is capped at 5 too (it grew without limit).

Not covered by a test, stated:
- the restore call in services/persistence.js setup (the two "extras ready" branches): unit-tested restore_sync_log,
  not its call site. Check on a device: sync, reload, open Sync Details.
- the utils-copy writers and the service error/cancel writers: wired by the same one-line change, only the service
  success writer is pinned by a sync test.
- the status line's look: NOT seen on screen yet (Traci's condition). Same element and style as "Sync Done!".

## Android and iOS emulator runs (2026-11-15, after the fix)

Traci could not test on a device before a merge to develop, so both platforms were emulated against a local server on
the private e2e database, behind the throttle proxy (4 Mbps shared, 100 ms), user synth_big (home board with 56
1.5 MB folders). Served bundle checked each time (process cwd on 5077, digest, a string from the change).
- Android: Chrome on the ll_trace emulator (Android 15), 1280 px wide.
- iOS: Playwright WebKit (Safari's engine) with the iPhone 15 profile (393 px, touch, iPhone UA). NOT the iOS
  Simulator, which needs macOS; a real iPhone or a Mac simulator is the full check.
Scenario (scratchpad emu/synclog-scenario.js): sync, open Sync Details; reload, open it; start a sync and cancel at
2.5 s, open it; reload, open it.

Results, both platforms, final build: the log comes back after a reload (1, then 2 entries, `finished` a Date again,
restore ran once); the status line after a reload says "Synced and ready for offline" after a clean sync and "The last
sync was canceled." after a cancel; the cards stay on the last full sync with "These results are from an earlier
sync, a few seconds ago."

Found by the runs and fixed (each committed, red test first where it is behaviour):
- 08842a82a: on iOS the cancel landed earlier and the walk REJECTED; the failure branch logged it as errored
  ("Error syncing ...: canceled") although it knows it was cancelled (_canceled_sync_id), and the grouped view showed
  that sync's one partial row as the result ("100% ready offline, 1 of 1"). Now logged as canceled, and only a sync
  that finished becomes the result. Tests: persistence-sync "logs a cancelled sync whose walk rejects as canceled";
  sync-log-store "a failed or cancelled sync with some rows is not the result". Both red before, both killed by their
  mutant. Same commit: the status line moved above the grey details (Traci: "improve it").
- f91fd0edf: at 393 px the three tabs wrapped and the selected pill no longer matched the track; below 560 px they
  are equal full-width rows.
Green after: 207 tests, 206 pass, 1 pre-existing xit, timing-strict on.

## "XMLHttpRequest cannot load ... due to access control checks" on iOS (investigated 2026-11-15)

Probe (scratchpad emu/xhr-probe.js): fresh iPhone 15 profile, sign in, watch 150 s; every failed request with its
reason and how long it ran, every uncaught page error with its stack.

| Run | Failed requests | Reason | When they failed | "access control" errors |
|---|---|---|---|---|
| WebKit, throttled | 68 | Load request cancelled | 22 at 7.5-8.6 s, 44 at 15.6-59 s, 2 under 1 s | 11 |
| WebKit, direct (no throttle) | 2 | Load request cancelled | 2 under 1 s | 1 (/sw.js) |
| WebKit, throttled, worker blocked | 25 | Load request cancelled | 19 at 7.5-8.6 s, 5 at 15.6-59 s, 1 under 1 s | 1 |
| Chromium, throttled | 27 | net::ERR_ABORTED | 22 at 7.5-8.6 s, 5 at 15.6-59 s | 0 |

CONFIRMED:
- Not cross-origin: every failure is a request the page CANCELLED ("Load request cancelled" in WebKit,
  net::ERR_ABORTED in Chromium), all same origin.
- The many 8 s cancellations are the app's own first-try timeout on board downloads (then retried patiently; the
  U1/U2 design). Chromium shows the same aborts. They do NOT produce the error: 19 of them in the worker-blocked run
  gave one error.
- The errors come at sign-in: token_check and /tree?root_only=1 cancelled 28 ms and 0 ms after starting, about 1.1 s
  after the Sign In click, when the page navigates away. Requests the app starts while the page is unloading are
  refused by WebKit inside xhr.send (the stack ends in `send`; no synchronous XHR exists in app/) and never become
  requests, hence 11 errors from 2 failed requests. Direct, without the throttle, it is one error (/sw.js).
- The offline worker is not the cause: it never answers /api/ requests (service_worker.js.erb fetch handler, no
  respondWith for /api/), and blocking it left the sign-in error in place.
- What happens to them: window.onerror (app.js:20) -> LingoLinq.track_error (app.js:116): console.error plus an
  in-memory list. Nothing is shown to the person; nothing reaches the server unless window._trackJs is loaded.
- Three full iOS scenario runs (sync, reload, cancel, reload): zero other page errors; the counter stayed at its
  sign-in value through every sync.
NOT KNOWN: the throttled WebKit probe's 8 other page errors (the probe printed only the first 6 errors, all access
control). PLAUSIBLE, not checked against WebKit's source: WebKit words a cancelled same-origin XHR this way.
Verdict: harmless console noise from requests cancelled by the sign-in navigation, not a failure. Possible tidy-up
(not done, not in scope): do not start token_check / the tree warm-up in the moment the sign-in navigation begins.
