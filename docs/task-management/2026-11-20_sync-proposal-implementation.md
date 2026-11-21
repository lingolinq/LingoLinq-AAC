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
