# Offline sync proposal: implementing every phase (started 2026-11-20)

Branch `traci/docs/offline-sync-research-proposal` (worktree `~/LingoLinq-AAC-sync-proposal`), rebased on develop
f581c0066 on 2026-11-20. The proposal is `2026-11-15_offline-sync-research-proposal.md`.

## Decision (Traci, 2026-11-20)

Option 3: build phases 0 to 3 together, planned as one design ("we really need to be taking a holistic overview of
everything when implementing"). The PR carries the proposal and all the work it recommends. No two-round review cap
(#1311 lets senior developers decide extra rounds). Earlier decisions still stand: no feature flags, lossless WebP for
symbols (2026-11-16).

## Approach

1. Re-verify the proposal's facts against today's develop (it was written against 9728d6bd1; #1326, #1327, #1330
   and #1334 changed the sync since). Four parallel read-only researchers: client sync, server, device storage, open
   sync PRs and issues. Their reports are evidence to verify, not findings.
2. One integrated implementation plan: phases 2 and 3 redesigned per review round 2 (section 10), shared code and
   dependencies mapped, a build order, and what needs Scot or a device.
3. Adversarial review of the plan before any code; then each item through `/fix-proposal`.

## Lessons consulted (Rule #0.8)

- LEARNINGS.md: the Ember Data adapter runs the utils persistence copy (`DSExtend.findRecord`), and
  `findRecord(..., {reload: true})` never reaches the network (`persistence.force_reload`).
- learnings-archive/2026-11.md: utils copy vs service for save-queue fixes; SQLite writes are two statements
  (`utils/sqlite_row_queue.js`); staging has no `UPLOADS_S3_CDN`, so production CDN behaviour has no staging run;
  server settings reach the apps through `/api/v1/domain_settings`; `cors_match` includes the trust result;
  `sync_testing` runs every sync wait at 1 ms, so parked retries can be driven in whole-sync tests; judge the device
  row you adopt, not the record in memory; a sync's result card is decided before its log is written; commit before
  planting mutants; review "just wording" commits too.

## Log

- 2026-11-20: decision recorded; worktree rebased; researchers started.
- 2026-11-20: open-work researcher reported. Checked here: #1330 merged (f581c0066); #1336 is a draft and conflicts
  with develop (`mergeable_state` dirty); #1328 is open, mergeable, blocked on review; `entry_copy` keeps only a fixed
  field list (`utils/sync_log_store.js:44`), so phase 0's counts must be added there or a reload drops them.
  Proposed landing order (to confirm in the plan): #1336 first (finish its mutants, merge develop with #1330), then
  #1328, then the persistence-sync test hygiene (#1121 / #589), then phase 1. Fold in: #1341's "a save that never
  settles holds the walk" (phase 1.1); decide #1221's public-catalog seeds before lifting the 100-board cap; phase 3
  must not delete boards with unsynced local edits (#1301) and shares #1219's 32 MiB and picture-lookup limits.
- 2026-11-20: client-sync researcher reported. Checked here: the batch fan-out is still there
  (`services/persistence.js:2961-2979`: `next_batch()` per stored board), the cap is `< 100` (:2945), batches of 25
  (:2955); `requestQuota` maps to an ungated `navigator.storage.persist()` (`utils/capabilities.js:56`), reached from
  `root_dir` (:1713, :1741). Corrections to the proposal: phase 1 item 6 (avatar) is done (#1327, `optional_picture`);
  the 60 s board attempt covers only the utils copy's single-board `findRecord` (batches still get 8 s then 20 s,
  `utils/extras.js`); the persist() gate is "offline shell on + trusted device", and phase 1.5 must also deal with the
  ungated Chrome call; the sync log has no start time or duration yet; there is no reusable "iOS app" helper
  (`utils/ipad_detect.js` only has `is_ipad_with_mac_agent`).
- 2026-11-20: device-storage researcher reported. Checked here:
  - **New defect (CONFIRMED):** `find` sets `record.raw.important` (`services/persistence.js:425`) but the
    out-of-date test reads `record.important` (:429), which is never set. Every row persisted over a week ago is
    marked `outdated`, important or not, and `usable_database_copy` (`utils/database_picture.js`) rejects outdated
    rows. Effect (PLAUSIBLE, to measure): on no-file-storage browsers (iPad Safari, desktop Safari, Firefox) a
    week-old picture is downloaded again every sync. Goes into the plan as a phase 1 item via `/fix-proposal`.
  - The delete path on a second failed open is `dbman.delete_database(key)` (`utils/dbman.js:687-688`); there is no
    VersionError-specific handling. Phase 2 must not bump `dbversion` (4).
  - Pictures live in one folder per device, shared by every user; file names are a deterministic function of the URL;
    nothing deletes picture files and nothing counts references (researcher, CONFIRMED by it; spot check pending in
    the fact sheet). A rendition under the same URL would overwrite the original's file and row: phase 2 needs its own
    file name and a field in the row, never the original's slot.
  - On the no-file path `url_cache` is never filled (rows go to `url_uncache`), so synchronous readers (board
    rendering) find those pictures only through `board_device_copy` (researcher, to verify).
- 2026-11-20: server researcher reported. Checked here:
  - **Existing erasure gap (CONFIRMED, not caused by this work):** `flush_user_content` deletes a person's
    ButtonSounds and UserVideos by `user_id` (`lib/flusher.rb:456-461`) but not their ButtonImages. Board flushing
    reaches ButtonImages only through `BoardButtonImage` rows (`lib/flusher.rb:264`), which nothing writes any more
    (`app/models/board.rb:1717`, commented out; the comment at `lib/flusher.rb:57-66` says so). Uploaded pictures (and
    their `.raster.png` siblings) likely survive account deletion. Not in `audit-reports/FINDINGS.json` (searched
    2026-11-20). Raised with Traci; only Scot changes the register.
  - Researcher facts used in the plan (to re-check in each fact sheet): the 25-id cap is at
    `users_controller.rb:857`; `users#boards` uses the 30-minute permission cache (permissable gem, `expires ||= 1800`)
    while `board_revisions` uses `BoardRevisionsAccess`; `image_urls` are personalised for the CALLER; storage keys
    are secret-derived (`uploadable.rb:73-81`); `remote_remove` and `remote_remove_thumbnail_family` do not match
    rendition-style keys; `button_images.file_hash` exists and is unused; button-set files are encrypted, at
    secret-derived CDN paths, with no client-facing signed URL, and stay on the proxy on purpose
    (`utils/direct_fetch.js`); no compression and no `Cache-Control` on uploads; `current_revision` excludes image
    URLs, and subscription or supervision changes touch no board; no sync route has been added since 2026-11-15.
- 2026-11-20: Traci's decisions: (1) #1221: the first sync downloads only the person's own boards; catalog boards
  on open or like. (2) Technical details: a plain-language summary for the person, full counters in the sync log;
  mock up the wording for her OK first. (3) The erasure gap is fixed inside phase 2.3. Recorded in section 12.6.
  Section 12 committed (89db2125d) and sent to the adversary agent for review.
- 2026-11-20: review round 3 (adversary, 89db2125d): needs rework, 12 findings. F3, F4, F5, F6, F9 re-read and confirmed. All accepted; section 12 reworked and section 12.7 added. Open for Traci: 2.3 policy for pictures used by other people's copies (with Scot and legal); server-side writer off switches. Phase 0, 1.2, 1.4 cleared to start.
- 2026-11-20: Traci: 2.3 policy = pictures still used by other people's copies are handed over to those owners and kept, the rest deleted (Scot + legal OK before merge); yes to server-side off switches per new device-format writer.
- 2026-11-21 (handed over from the Android speech / Firefox symbols session, 271a315e; added uncommitted for this
  session to review and commit): evidence for phase 1.2 (stall timeouts, #1212) and state of the prerequisites.
  - **Prerequisites met:** #1336 merged 2026-11-22 01:26 UTC and #1328 merged 04:04 UTC, so 12.5 steps 2 and 4 are
    no longer waiting on them. Re-read both merged diffs before 0.1's log work: the `log.push` sites and
    `entry_copy` changed.
  - **Android emulator at 0.4 Mbps** (Chrome 124, AVD `ll_trace`, synth_big: home + 56 folders of ~0.75 MB; one run
    each; full table in `2026-11-16_sync-late-copy-current.md`, "Android emulator"; traces in
    `~/offline-sync-handoff/2026-11-19-emulator/` (`run-emu-dev-400.txt`, `trace-emu-dev-400.json`)): develop
    9d96df96f saved 39/57 boards and #1330 36/57, both syncs ending "finished" with each missing board at "failed
    retrieval for syncing". One 0.76 MB board needs at least 15 s with the link to itself, the same as
    `find_limits.caller_ms` (15 s, `utils/board_download.js`), and several downloads share the link. At 0.8 Mbps all
    57 saved. This is the baseline 1.2 has to beat; 0.2's harness should reproduce it before 1.2 lands.
    Note: `compare-android.js` and the other probes load Playwright from `~/LingoLinq-AAC-late-copy`, which was
    removed on 2026-11-21; point them at a worktree with `app/frontend/node_modules`.
  - **Thread limit off by one (CONFIRMED on develop de6b1052e):** `add_thread` checks
    `_this.active_board_threads > n_threads` (`services/persistence.js:3403`), and the parked-retry resume uses the
    same `> n_threads` (`:3391`), so up to n_threads + 1 board threads run (7 on mobile, 11 on desktop). Fold into
    1.1 or 1.2 through `/fix-proposal` (it changes how many downloads share a slow link). Not filed separately.
  - Limits on develop as of #1212's 2026-11-20 update: `find_limits.caller_ms` 15 s, `board_transport_ms` 60 s,
    `BOARD_RELOAD_MS` 20 s (`utils/sync_board_fallback.js`), `MAX_BOARD_RETRIES` 3 (4 tries per board).
  - **Checked by this session (2026-11-21):** #1336 merged (da911bfde) and #1328 merged (4494d67ac), confirmed on
    GitHub; the off-by-one at `services/persistence.js:3403` and `:3391` (`> n_threads`) confirmed on origin/develop
    4494d67ac; `find_limits` (`utils/board_download.js:19`), `BOARD_RELOAD_MS` (:13) and `MAX_BOARD_RETRIES` (:132)
    confirmed; the emulator table is at `2026-11-16_sync-late-copy-current.md:171-183`; the traces are in
    `~/offline-sync-handoff/2026-11-19-emulator/`. **Correction:** the probe scripts load Playwright and
    `sync-link` from `~/LingoLinq-AAC-sync-e2e/app/frontend` (`compare-android.js:18`, `check.js:5`,
    `compare-late.js:7`, `real.js:8`), not `~/LingoLinq-AAC-late-copy`. That worktree was removed on 2026-11-21 after
    #1345 merged, so the fix is the same: point `E2E` at a worktree with `app/frontend/node_modules`.
- 2026-11-21: Traci chose the summary layout from a mockup: visible under the last sync result in the main Sync Details view, plus a storage line; older syncs and the per-board table stay in Technical details.
- 2026-11-21: Traci: fold #1201 (iPad detected as Mac) into the plan as item 1.0, first in phase 1 (before 1.2). Full #1201 scope (every capabilities reader), via /fix-proposal.
- 2026-11-21: phase 0.2 started.
  - Seed `app/frontend/e2e/support/sync-measure.rb` (synthetic; private e2e database only): `sync_m_big` (the
    emulator baseline's shape, ported from the scratch `seed_big_boards.rb`; a folder's JSON is 1.52 MB as
    JsonApi::Board serializes it, not the 0.75 MB quoted in the handoff), `sync_m_core` (61 boards, 2,104 pictures),
    `sync_m_supervisor` with 3 supervisees (skins default/medium/dark, 51 skin-tone pictures each, sounds on
    sync_m_child_1), `sync_m_caseload` with 12 supervisees. Checked in the database after seeding.
  - Harness gap found and fixed before measuring: self-answered pictures never used the link's bandwidth, so
    picture bytes (about 99% of a sync) were neither throttled nor counted. `sync-link.js` gains `transfer(bytes)`;
    `routePictures` uses it in measurement runs only (`measureLink` option), with a 16 KB picture (production's
    average) and a sound for `.mp3`. The regular sync suite is unchanged.
  - `e2e/sync-measure.spec.js` and four `measure-*` projects; the emulator path now covers `measure-android-emulator`.
  - The proposal worktree's `npm ci` failed building sqlite3 (node-pre-gyp); lockfile identical to the main
    checkout's, so `app/frontend/node_modules` is a symlink to it, as in the other worktrees.
  - **Finding (item 1.8):** every picture downloaded twice on a first sync with the Modern home page open. Evidence in
    section 12.4 item 1.8. One run's link bytes read 36.4 MB instead of 72.5 MB with the same 4,208 answers;
    unexplained, to watch in the baseline runs.
- 2026-11-21: e2e suite on this branch (desktop Chrome): 8/9 with the harness changes; scenario 1 failed on
  `expect(details.pct).toMatch(/100%/)`, a stale assertion since #1336 (da911bfde) replaced the percentage with "All
  your boards are ready offline" (the assertion came from #1345, e0b8ae7c3, a day earlier; the suite is local-only, so
  CI did not see it). Traci approved updating it (spec changed); it now also fails if a percentage returns (7fffb63d8).
  Scenario 1 then passed.
- 2026-11-21: emulator baseline for 1.2. The probe is a copy of `compare-android.js` in the session scratchpad with
  `E2E` pointed at this worktree (originals untouched). Starting the emulator for it: `setsid
  ~/android-tools/sdk/emulator/emulator -avd ll_trace -no-window -no-audio -no-snapshot-save -gpu swiftshader_indirect`,
  wait for `getprop sys.boot_completed` = 1, then OPEN CHROME (`adb -s emulator-5554 shell am start -a
  android.intent.action.VIEW -d about:blank com.android.chrome`) before the probe, or `connectOverCDP` fails with
  "socket hang up". Chrome on the AVD is 124.0.6367.219, as in the 2026-11-19 runs.
- 2026-11-21: **1.2 baseline reproduced on this branch** (app code = develop 4494d67ac; emulator Chrome 124, AVD
  ll_trace, synth_big, 0.4 Mbps, 100 ms, one run, cold): 1169 s, **38/57 boards saved**, 56.5 MB, 212 link requests;
  19 missing, each "failed retrieval for syncing"; 23 failed rows. Earlier: develop 9d96df96f 39/57 (1333 s, 63.3 MB),
  #1330 36/57 (1171 s, 56.5 MB). Different from 2026-11-19: 37 boards were in memory before the sync (then 1), and the
  status counts show 106 "re-downloaded" (then 6): likely the Modern page's tree warm-up getting further ahead of the
  sync since #1328 (see item 1.8); to check in 1.8's fact sheet. Output, trace and the repointed probe: `~/offline-sync-handoff/2026-11-21-emulator/`.
- 2026-11-22: **0.2 before-numbers** (app code = develop 4494d67ac; local :5077 production build; measure-desktop-chrome
  then measure-android-chrome; 100 ms each way; the link limited from the start of the board walk; 32/32 tests
  passed, 64 rows). Raw rows: `~/offline-sync-handoff/2026-11-21-measure/before-develop-4494d67ac.jsonl`. "Boards"
  counts the device's board rows (the shape's boards plus the sidebar board); the denominator is the most any run saved.

| Shape | Link | Desktop Chrome first sync | Android Chrome first sync | Repeat sync (desktop / Android) |
|---|---|---|---|---|
| big | full | 13.8 s, 73.2 MB, 52/58 boards, ok | 12.6 s, 43.9 MB, 57/58 boards, ok | 9.5 s, 11.4 MB, succeeded / 9.6 s, 0.0 MB, succeeded |
| big | 4 Mbps | 89.2 s, 43.9 MB, 58/58 boards, ok | 89.7 s, 43.9 MB, 58/58 boards, ok | 9.6 s, 0.0 MB, succeeded / 9.6 s, 0.0 MB, succeeded |
| big | 0.8 Mbps | 15.5 s, 1.6 MB, 0/58 boards, FAILED: failed to retrieve user details | 15.5 s, 1.6 MB, 0/58 boards, FAILED: failed to retrieve user details | 50 s, 6.1 MB, failed / 49.8 s, 4.9 MB, failed |
| big | 0.4 Mbps | 1542.5 s, 77.1 MB, 29/58 boards, 39 errors | 1455.4 s, 72.8 MB, 25/58 boards, 34 errors | 0.6 s, 0.0 MB, failed / 817 s, 40.8 MB, finished |
| core | full | 151.3 s, 36.4 MB, 62/62 boards, 2104/2104 pictures, ok | 449.7 s, 36.9 MB, 62/62 boards, 2104/2104 pictures, ok | 9.5 s, 0.0 MB, succeeded / 9.6 s, 0.0 MB, succeeded |
| core | 4 Mbps | 151.8 s, 36.4 MB, 62/62 boards, 2104/2104 pictures, ok | 450.1 s, 36.9 MB, 62/62 boards, 2104/2104 pictures, ok | 9.5 s, 0.0 MB, succeeded / 9.5 s, 0.0 MB, succeeded |
| core | 0.8 Mbps | 367.8 s, 36.7 MB, 62/62 boards, 2104/2104 pictures, ok | 460.2 s, 36.9 MB, 62/62 boards, 2104/2104 pictures, ok | 9.6 s, 0.0 MB, succeeded / 9.6 s, 0.0 MB, succeeded |
| core | 0.4 Mbps | 749.5 s, 37.5 MB, 62/62 boards, 2104/2104 pictures, ok | 780.2 s, 37.7 MB, 62/62 boards, 2104/2104 pictures, ok | 9.6 s, 0.0 MB, succeeded / 9.6 s, 0.0 MB, succeeded |
| supervisor | full | 56.2 s, 21.0 MB, 33/33 boards, 735/735 pictures, ok | 159 s, 20.7 MB, 33/33 boards, 735/735 pictures, ok | 11.1 s, 0.5 MB, succeeded / 11.1 s, 0.5 MB, succeeded |
| supervisor | 4 Mbps | 67.2 s, 21.0 MB, 33/33 boards, 735/735 pictures, ok | 167 s, 20.7 MB, 33/33 boards, 735/735 pictures, ok | 11 s, 0.5 MB, succeeded / 11.1 s, 0.5 MB, succeeded |
| supervisor | 0.8 Mbps | 215.5 s, 21.5 MB, 33/33 boards, 735/735 pictures, ok | 239.7 s, 21.2 MB, 33/33 boards, 735/735 pictures, ok | 11.1 s, 0.2 MB, succeeded / 11 s, 0.2 MB, succeeded |
| supervisor | 0.4 Mbps | 434.4 s, 21.7 MB, 33/33 boards, 735/735 pictures, ok | 433.2 s, 21.4 MB, 33/33 boards, 735/735 pictures, ok | 11.1 s, 0.2 MB, succeeded / 11.1 s, 0.2 MB, succeeded |
| caseload | full | 45.7 s, 20.1 MB, 44/52 boards, 588/698 pictures, ok | 127.5 s, 20.6 MB, 44/52 boards, 588/698 pictures, ok | 11.1 s, 0.6 MB, succeeded / 11.1 s, 0.6 MB, succeeded |
| caseload | 4 Mbps | 54.7 s, 20.1 MB, 44/52 boards, 588/698 pictures, ok | 134.4 s, 20.7 MB, 44/52 boards, 588/698 pictures, ok | 11.1 s, 0.6 MB, succeeded / 11.1 s, 0.6 MB, succeeded |
| caseload | 0.8 Mbps | 184.9 s, 18.4 MB, 36/52 boards, 478/698 pictures, ok | 249.8 s, 23.1 MB, 52/52 boards, 698/698 pictures, ok | 27.1 s, 2.3 MB, succeeded / 11 s, 0.3 MB, succeeded |
| caseload | 0.4 Mbps | 309.2 s, 15.4 MB, 24/52 boards, 313/698 pictures, ok | 342 s, 17.0 MB, 28/52 boards, 368/698 pictures, ok | 134.9 s, 6.5 MB, succeeded / 120.4 s, 5.7 MB, succeeded |

  Readings:
  - Production shape: complete at every speed; time is set by the link below about 4 Mbps and by Android Chrome's one
    picture at a time above it (450 s at full speed against desktop's 151 s). Phase 2 (smaller pictures) and 1.3
    (Android concurrency) are the levers.
  - Repeat sync with nothing changed: about 10 s and almost no bytes for every shape that completed.
  - Dev shape: complete at full and 4 Mbps; at 0.4 Mbps 25 to 29 of 58 saved (1.2's target); at 0.8 Mbps both
    projects failed at once with "failed to retrieve user details" (15.5 s, the adapter's 15 s limit). A re-run of
    desktop at 0.8 Mbps passed with all 58 (15 min), so that failure is intermittent: the page's warm-up queued ahead
    of the sync's first request on the shared link.
  - Caseload (12 supervisees): 44 of 52 boards at full speed on both projects, repeats included, no warning: new
    item 1.9 (the user JSON lists 10 supervisees). Fewer at 0.4 to 0.8 Mbps; the repeat sync then fills up to 44.
- 2026-11-22: harness additions, verified with three desktop probes
  (`~/offline-sync-handoff/2026-11-21-measure/probe-warnings.jsonl`): each row now records `before_sync` (pictures the
  page fetched before the sync started) and `warnings` (console lines saying part of a sync failed). Results: core
  full, 2,104 pictures before the sync and 2,104 during it, all direct (item 1.8 refined in the plan); caseload full,
  44 boards and no warning (the cap, not a timeout); big at 0.8 Mbps, complete (the intermittent failure above). The
  first probe attempt ran under an older Node from a non-login shell and Playwright refused it; run with nvm's Node 22.

## Item 0.1: sync counters and the Sync Details summary (fact sheet and proposal, 2026-11-22)

Learnings consulted: archive 2026-11 "A sync's result card is decided before its log is written" (read the log when
used, compare entries for the signed-in person only); archive 2026-01..09 "`sync_boards` exists in both copies" (any
sync change goes in `services/persistence.js` AND `utils/persistence.js`).

### Fact sheet

(a) Where the values are READ
- The sync log list is `persistence.sync_log`; readers: `components/sync-details.js` (`summary_for`, `details`,
  `restored_lead`), `components/sync-progress-drawer.js`, `services/sync-notice.js`, `utils/offline_board_list.js`
  (`answered`), the dashboards, `controllers/user/index.js`, `services/app-state.js` (CONFIRMED, grep of `sync_log`).
- What survives a restart is only what `entry_copy` whitelists (`utils/sync_log_store.js` `entry_copy`; `merge_logs`
  runs stored entries through it). A field not added there exists until the app restarts, then vanishes (CONFIRMED).
- The summary will be read in Sync Details under the last result: `summary_for` (`utils/sync_rollup.js`) picks the
  entry through `last_result` / `partial_result` (`utils/sync_log_store.js`) (CONFIRMED).

(b) Every shape an entry can have, by writer
- W1 finished (clean, with issues, or `storage_failed` + `errored`): `services/persistence.js:2422` and the copy
  `utils/persistence.js:2443`, only when `sync_progress.root_user == user_id` (`services/persistence.js:2376`).
- W2 stopped (failed, or a cancel that ended through the failure branch): `services/persistence.js:2464`, copy
  `utils/persistence.js:2483`, same root-user condition (`:2445`).
- W3 cancel that ended through `end_canceled_sync`: `services/persistence.js:5128` (copy: to check when editing).
- Restored entries (`merge_logs` → `entry_copy`, `finished` rebuilt as a Date) and entries written by older builds:
  no counters, no start time. The summary must say nothing it cannot back, never "0".
- Supervisee syncs write no entry of their own (the root-user condition); they run inside the root sync's window.
- A root sync requested while one runs is absorbed (`services/persistence.js:2040`): one root sync at a time, by
  `sync_progress.sync_id`. `sync_progress` is rebuilt once the user loads (`:2197`) but keeps `sync_id` and
  `started_at` (CONFIRMED), so counters cannot live inside `sync_progress`; they are keyed by `sync_id`.

(c) Cross-file claims checked
- Every jQuery request (adapter `record.reload()`, `persistence.ajax`, the picture proxy, board downloads) goes through
  `$.realAjax(options)` at `utils/extras.js:292`: the adapter calls `$.ajax` (`adapters/application.js:45-46`),
  `persistence.ajax` calls `$.ajax` (`services/persistence.js:3854`), and `$.ajax` is the patched one
  (`utils/extras.js:147`) (CONFIRMED). `utils/board_download.js` has no XHR or fetch of its own (CONFIRMED, grep).
- Pictures and sounds are downloaded by one raw XHR in `store_url_now` (`services/persistence.js` `xhr.open('GET', url
  + '...cr=1')`; copy `utils/persistence.js:1619`), with the proxy (through `$.ajax`) as fallback. The installed app
  takes the same path (`capabilities.installed_app` only sets `check_for_local`, `services/persistence.js:1558`); there
  is no native downloader (CONFIRMED, grep for FileTransfer / downloadFile / fetch).
- Resource Timing (`transferSize`, `encodedBodySize`) reads 0 for cross-origin responses without a
  `Timing-Allow-Origin` header (ASSUMED from the Resource Timing spec; not load-bearing: it is why candidate B is
  rejected, and the 0.2 run will show it if wrong).
- `navigator.storage.estimate()` covers the browser's storage for the origin, not files a native plugin writes
  (ASSUMED; it decides only whether the storage line shows in the installed app, which is an open question below).

### Diagnosis (what is missing today)
A sync log entry has the outcome and per-board rows but no start time, no request or byte counts, no peak
concurrency and no failure breakdown. Support cannot tell a slow link from a stall, and nothing measures any later
item in the field. Supervisee failures are a pop-up only (`services/persistence.js:2628-2633`; item 1.9).

### Candidates
- A (proposed). `utils/sync_counters.js`: `begin(sync_id)` when the root sync creates `sync_progress`
  (`services/persistence.js:2049`); `request_started()` / `request_ended({bytes, kind, failure})` called from two
  places only, `$.realAjax` in `utils/extras.js` and the picture XHR in `store_url_now` (both copies); a picture or
  sound saved through the XHR or the proxy counts as `media_saved`; `note_failure(kind)` for storage writes and
  supervisee syncs; `finish(sync_id)` returns a plain JSON object that W1 to W3 put on the entry as `counters`, with
  `started`. Counting happens only while a root sync is active. Bytes are the decoded size (`responseText.length`,
  the blob's size, the proxy's base64 length × 3/4), labelled `bytes_decoded`.
  - Trade-off: everything the app requests during the sync counts, including requests a board page makes while the
    sync runs (labelled "during the sync"); the page's `<img>` warm-up (item 1.8) is not seen, since it is not a
    request the app sends itself.
- B. A `PerformanceObserver` over the sync window: no request site touched, real transfer sizes, the `<img>` warm-up
  included. Rejected for 0.1: cross-origin pictures (all of them, on the picture host) report 0 bytes without
  `Timing-Allow-Origin`, and it gives no status, so failures by kind would still need A's hooks.
- Simplest alternative: derive everything from the existing per-board rows (no network hooks). Rejected: rows carry
  no bytes, requests or timing, which is the point of 0.1.

### What the person sees (Traci's layout, 2026-11-21)
Under the last sync result in Sync Details, one line built only from what the entry holds, parts left out when not
known: "Took 2 minutes · 12 boards and 340 pictures downloaded (18 MB) · 1 picture couldn't be saved". Plus a storage
line: "LingoLinq is using 412 MB on this device (2.1 GB available)", from `navigator.storage.estimate()`, read when
Sync Details opens. All strings through i18n, no percentages, final wording by Traci in the built UI. The full
counters show in Technical details for each sync.

### Risks
- A hook in `$.realAjax` runs on every request in the app: it must never throw or change the promise (a try/catch
  around counting, no await, no change to arguments or results).
- Old and restored entries: the summary omits parts it lacks; a test covers an entry with no counters.
- Supervisor syncs: one window covers every supervisee, so the counts are the whole run's (what the person waited for).

### Unresolved questions
- The installed app: does `estimate()` include the plugin's picture files? If not, the storage line would understate
  by most of the pictures; proposed: hide the storage line in the installed app until 1.x measures it.
- Should a supervisee failure change the finished message from "without errors"? That is behaviour (1.9); 0.1 only
  counts it and shows it in the summary.

### Tests (red first)
- `tests/unit/utils/sync-counters-test.js`: counts only while a sync is active and only for its `sync_id`; peak
  concurrency; failure kinds from the error shapes `passing_failure` knows (timeout, offline, 429, 5xx, refused);
  a throwing input does not throw. Mutation: drop the `sync_id` check, the test of a second sync's id goes red.
- `sync-log-store-test.js`: `entry_copy` keeps `started` and `counters`. Mutation: remove them from the whitelist.
- The summary words for: a full entry, an entry with no counters (only "Took ..." if `started` exists, else
  nothing), a supervisor entry with a supervisee failure.
- e2e (the 0.2 harness): each measured sync also records the entry's counters beside the link's own counts; requests
  and bytes should agree within the warm-up's share. This is the accuracy check.
