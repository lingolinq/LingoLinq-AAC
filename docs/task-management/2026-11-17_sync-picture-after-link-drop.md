# A picture cut off by a dropped link marks its board failed (2026-11-17)

Branch `traci/fix/sync-picture-after-link-drop` (from develop at 46dddb591, after #1327). Follows #1327's e2e run
(`docs/task-management/2026-11-16_sync-status-first-sync.md` did not carry its E2E section into develop; it is
repeated below) and the #1326 session's handoff (`~/offline-sync-handoff/2026-11-17-icon-failure/`).

Learnings consulted: `learnings-archive/2026-11.md:298` (a queue worker that resolves an item must continue or count
itself out); `LEARNINGS-2026-01_to_2026-09.md:9925` (`store_url_now` can resolve without a cached copy). Neither is
about a content failure in the walk.

## Reports

1. #1327 e2e (local, 6 browser projects, 9e68fc8d1): "the link drops during a sync and comes back" finishes with every
   board processed and 1 error: a home-board button picture cut off by the drop (5 projects:
   `board sync_e2e_basic/sync-e2e-basic-home failed to sync completely: button image failed to sync, .../home-6.png`),
   or Crisis Vocabulary's sidebar icon `/images/square.svg` (iPhone). On develop before #1327 it failed earlier, on the
   avatar.
2. #1326 session (WebKit at iPhone size, `synth_big` with 6 liked folders, 4 Mbps, link down 20-45 s): 57/57 boards
   saved, sync "finished" not "succeeded", 2-3 boards failed with `sidebar icon url failed to sync,
   /images/lingolinq-board-icon.png, linked from starred board`. Trace: 7 saves of the shared icon started at 10-13.6 s,
   the 2 still running failed at 21.1 s with `URL lookup failed during proxy`. Same on develop (5077) with the drop;
   0 failures without the drop.

## Fact sheet (develop 46dddb591)

- CONFIRMED: in the board walk (`services/persistence.js` sync_boards, `nextBoard`), a board's content saves go into
  `visited_board_promises`; any rejection there makes the board a board error, `"board X failed to sync completely: <err>,
  linked from <source>"` (:3333-3349), and the walk moves on. It is never retried.
- CONFIRMED, what each content failure does today:
  - ignored (resolves): the board's own icon `icon_url_with_fallback` (:3134-3141), its background picture (:3143-3149),
    its background sound (:3150-3157);
  - board error: the sidebar/liked board's icon `next.image` (:3159-3167), a button picture (:3187-3191), a button
    picture the device lost (:3200-3205), a button sound (:3221-3226).
- CONFIRMED: only a failed board LOOKUP is retried: `claim_board_retry(sync_progress, id, err)` (:3355,
  `utils/sync_board_fallback.js:102-110`) parks it when `passing_failure(err)` (:26-33: timeout, `offline`, "promise
  timed out", or `fakeXHR.status` 0/429/5xx), up to 3 more times after about 10/30/90 s (`utils/board_retry.js`).
- CONFIRMED: a picture whose download fails ends at `store_url_now`'s last fallback, the image proxy, which rejects
  `{error: "URL lookup failed during proxy for " + url}` (:1642-1644) and drops the cause: `persistence.ajax` rejected
  with the request (`fakeXHR`, with its status; :3863-3879) or with `{offline: true}` when the app is offline (:3881).
  So the walk cannot tell a dropped link (status 0) from a picture that does not exist (a 4xx from the proxy).
- CONFIRMED: `RSVP.all_wait` outside tests rejects at the FIRST failure (`utils/misc.js:153-154`, `!LingoLinq.testing`),
  so in the app a board's other content saves keep running in the queue after the board is marked failed; in tests
  it waits for all of them.
- CONFIRMED (#1326 trace): the cause is the link dropping while the save runs. Not a cause: the shared icon is
  downloaded several times in parallel because `store_url_quick_check` runs before any save finishes (wasteful only).
- ASSUMED, to verify in review: what revisiting a board does to the sync's bookkeeping (`synced_boards`,
  `visited_boards`, `note_board_root`, `sync_progress.board_statuses`, visited/total counts), and whether the revisit
  re-downloads the board itself (`full_set_revisions[id]` is set only on success, :3328).

## Candidates

- A. The sidebar/liked board's icon is treated like the board's own icon: its failure is ignored (one handler,
  :3164-3166). Fixes report 2 and the iPhone case of report 1, not the button picture. A picture that is really missing
  stays unsaved, as the board's own icon does today. It is a picture of a board in the sidebar, not something said.
- B. A content save that fails for a passing reason parks the board for a retry, through the existing machinery:
  `store_url_now`'s proxy rejection keeps the cause (`fakeXHR`, `offline`); the content handlers keep the board's
  error as today, and at :3333, when the error is a passing failure and `claim_board_retry` gives a retry, the board is
  parked (`parking.park(next, retry)`) instead of becoming a board error. On the retry, `store_url_quick_check` skips
  what saved; only the failed picture or sound is tried again. After 3 retries it is a board error, as today. Fixes
  both reports (button pictures, sounds and the sidebar icon) for a link that comes back within about 2 min.
- C. A content save that fails for a passing reason is listed (url, type, board); when the walk ends, each is tried once
  more, and only those still failing become board errors. Own wait policy, own bookkeeping, a new end-of-walk step.

Proposal: B, plus A (decision for Traci: whether a liked board's icon that never saves should still mark the board
failed). C is rejected: it duplicates the board retry's waits and cancel handling.

Open questions for review: B's revisit bookkeeping (the ASSUMED item); whether keeping `fakeXHR` on the picture
rejection changes any caller that classifies errors (the sync's failure branch reads `fakeXHR`/`offline` for "Must be
online to sync", :2455-2459); whether a picture error inside `all_wait` can be the FIRST failure while a non-passing one
follows (the board then retries; a 404 picture would come back as a board error after the retries).

## Red test (first)

`tests/utils/persistence-sync-test.js`, modelled on "should append to the sync log on board failure" (:1586): a home
board with one button picture whose `store_url` rejects once with `{error: 'URL lookup failed during proxy for ...',
fakeXHR: {status: 0}}` and then resolves. Expect: the sync log entry has no issues and no board error. Today: a board
error (red). Second test: the same with a 404 (`fakeXHR: {status: 404}`) stays a board error (guard). Third (if A):
a failing `next.image` does not make a board error.

## Red tests (written, 2026-11-17)

`tests/utils/persistence-sync-test.js`, describe "a picture cut off by a dropped link" (end of the main describe, below
the last ESLint baseline row). Run with `timingStrict=1`, on develop 46dddb591:
- "tries a button picture again when the link dropped while it downloaded, and does not report the board": RED.
- "reports the board when the picture still fails after the retries" (4 tries, then the board error): RED.
- "reports a picture that does not exist at once, without trying it again" (404): green today, the guard.

CONFIRMED by the run: a board whose content failed has TWO sync-log rows, its download (`status: 're-downloaded'`) and
a separate error row (`board 145 failed to sync completely: ..., linked from home board`). Bookkeeping for a retried
board must not add a third row, and the error row must wait until the retries are spent.

## Review (adversary, 2026-11-17) and the revised B

Verdict: B as written would have made it worse; "B changed" proceeds; A is a product call. Checked myself:
- CONFIRMED (High): a parked board coming back is skipped: its id is already in `visited_boards` (:3132), so
  nextBoard's check (:3095) sends it to the skip branch. No retry and no error: "succeeded" with the picture missing.
- CONFIRMED (High): `claim_board_retry` drops `key_lookups[id]` (sync_board_fallback.js:108), so a re-walk runs the board
  lookup again (findRecord, possibly reload): a board download per retry, a third log row, the linked-board finds again.
- Medium: devices that keep pictures only in the database miss `store_url_quick_check` on a re-walk, so a re-walk would
  queue every picture again; outside tests `all_wait` rejects at the first failure, so a board parked then would queue
  its in-flight pictures twice; the handlers dropped the cause; copy only `offline` and `fakeXHR.status` (the proxy's
  400 body repeats the picture URL; protected URLs carry a token).
- Low: retries shared with lookup retries; the proxy answers 400, not 404, for a picture it could not get.
- Doc correction: the "Must be online to sync" branch reads `online`, not `fakeXHR` (:2456-2458); no other caller of
  `store_url`/`store_url_now` reads more than `quota_maxed` or the message, so keeping the cause changes none of them.

Done (`utils/board_content_retry.js`; `services/persistence.js`, line-neutral, the import last):
- `store_url_now`'s proxy rejection keeps `failure_cause(xhr)`: `offline` and `fakeXHR.status` only (:1643).
- The four content handlers (sidebar icon, button picture, missing button picture, button sound) reject with
  `content_failure(message, err, item)`: the same message, whether the cause passes, and what to save again.
- `settle_content` replaces `RSVP.all_wait` for the board's saves: every save settles before the board is judged.
- When every failure passes and the board has a content retry left (`sync_progress.retried_content`, its own count,
  MAX_BOARD_RETRIES = 3), only the failed saves are parked (`content_entry`), through the walk's parking (waits about
  10/30/90 s, cancel wakes them). nextBoard's first branch takes such an entry before the visited check and calls
  `retry_content`: only those saves again; parked again while they pass, or the board error, worded as before.
- A (ignore a liked board's icon that never saves) NOT done: waiting on Traci.

Tests (`timingStrict=1`):
- `tests/unit/utils/board-content-retry-test.js` (10), `tests/utils/persistence-test.js` "should keep only the cause"
  (3), `tests/utils/persistence-sync-test.js` "a picture cut off by a dropped link" (6: button picture, offline, button
  sound, sidebar icon, retries spent, a 400 reported at once; the board is asked for 3 times, as with no retry).
- Wider filter `/sync pictures|persistence|sync rollup|sync log|board content retry|board retry/i`: 378 passed, 0 failed,
  9 skipped (pre-existing skips).
- Mutants, two builds, each killed: the walk's retry branch removed (every walk test), the board parked whole (same),
  any failure retried (util; the 400 walk test), `store_url_now` not keeping the cause (3 cause tests), `offline`
  dropped (util; offline walk test), settle rejecting at the first failure (util), the count shared with lookups
  (util), the sound handler and the sidebar handler not keeping the cause (their walk tests only).
- Not covered by a walk test: the "missing button image" handler (same `content_failure` call as the others).
- Lint gate: only the known `sync-details.js:220` false positive.

## Live runs and final review (2026-11-17)

E2E (6 browser projects, eaf5cf7f5 on :5089): 53/54. "The link drops during a sync and comes back" passes on 5 of 6 (it
failed on all 6 with #1327). Android Chrome: CONFIRMED from its trace as a harness artifact: home-6's direct download
failed during the drop, its proxy fallback ran after the link was back (23:40:13.7), and the server asked the real CDN
for the spec's made-up path (403, answered 400: "File not retrieved, status 403"); a 400 reports the board at once, by
design. The spec answers the picture host in the browser only, not through the server's proxy.

`synth_big` WebKit reproduction (6 liked folders, 4 Mbps, link down 20-45 s; develop and #1326: "finished", 2-3 failed
rows, 57/57 saved, 8 runs): 10 runs on eaf5cf7f5, all "succeeded" with 0 failed rows; pictures of 2-5 liked folders
parked and saved on retry in every run where it was sampled (runs 3-10). Run 1: 56/57 on the device, unexplained; the
probe then printed counts only and read the device about 1 s after the sync ended, while the last board rows are still
being written one every 200 ms (`store_eventually`, services/persistence.js:702). Runs 2-10: 57/57. Runs 11-15 on
713e5f7a4 (the probe names any missing board and reads the device again 20 s later): 57/57 at both reads, "succeeded", 0
failed rows, liked-folder pictures retried and saved in each. Run 1 not reproduced in 14 runs since; its cause is
unproven (the late row write is the likely one), and it is stated in the PR as not covered.

Final review (adversary): ship with conditions. All four earlier conditions CONFIRMED met; no caller regression; no
path in the diff found that drops a board. Done from it: the retry's save arguments pinned (type and sync_id asserted
on the second try); a board whose retried content saves is recorded in `full_set_revisions` (`content_board`,
`ctx.saved`); `retry_content` calls `then` once even when a save throws; the error row's `board_id` is `id || key`,
as the walk's. Mutants for each killed (one build). Not done: `content_error` stays a copy of the walk's inline message
(replacing those 9 lines needs padding to keep the line count for the rows below); a save that never settles holds its
thread (also true before for a board whose saves all succeed); the drawer counts parked content as a folder left
(`waiting_line`): wording for Traci.

## Drawer wording (2026-11-18, Traci: "fix the drawer wording to reflect what is actually happening")

- Cause, confirmed: `waiting_line` (components/sync-progress-drawer.js) read `sync_progress.parked`, which is `parking.size()` (services/persistence.js:3087), and counted parked content entries (a saved board whose pictures or sounds wait) together with boards not yet saved. So a saved folder was reported as "1 folder is left".
- Change: `parking.count(test)` (utils/board_retry.js), `is_content_entry` (utils/board_content_retry.js), and the walk reports `parked_content`, summed with `parked` in `update_sync_progress`, line-neutral. The drawer words the two kinds apart; boards not yet saved keep the existing wording and translations. There are 2 new strings (`sync_drawer_waiting_content_one/_many`), added with `i18n_generator.rb --generate` and then `--merge`; the 12 locales show the `***` untranslated marker.
- Tests: the drawer unit test, `count`, `is_content_entry`, and a walk test reading `parked`/`parked_content` = 1/1 while the picture waits. 4 mutants in one build, each turned its own test red. Filter `sync`: 401 passed, 0 failed, 2 skipped.
- Process note: a combined mutate-and-revert command that ended with `git checkout --` on files with UNCOMMITTED fixes was blocked before it ran; it would have wiped the fix. Commit the fix first, then mutate. A reverse-replace undo also fails when the mutant's text already appears elsewhere in the file (`return parked.length;` is in `size` too).

## Liked/sidebar icon: warning, not failure (Traci, 2026-11-18)

Decided: a liked or sidebar folder's icon that cannot be saved no longer fails its folder. Offline, the icon shows the app's placeholder. The finished sync shows a warning naming the folder, with "Try again" as a secondary action in the drawer and in Sync Details. Traci asked for this in THIS PR, not a follow-up. The branch was pushed; the PR is not opened until this lands.

Facts:
- CONFIRMED `services/persistence.js:3160`: the sidebar/liked entry's icon (`next.image`, from `utils/offline_sync_seeds.js:48` sidebar `b.image`, `:56/:59` starred `ref.image_url`/`opt.url`) is the ONLY one of the walk's non-button pictures whose failure fails the board. The board's own icon (:3134-3141), background picture (:3143) and background sound (:3151) already resolve on failure (console.log only, no warning).
- CONFIRMED: it is also the only one without the `LingoLinq.remote_url` gate (`app.js:112`: http(s), not localhost). The #1326 failures were `/images/lingolinq-board-icon.png` = `Board::DEFAULT_ICON` (`app/models/board.rb:8`; `user.rb:4189` uses it as the sidebar fallback), an app-relative path.
- CONFIRMED `lib/offline_shell.rb`: the service worker precaches `/images/square.svg` (the `Button.broken_image` placeholder, `utils/button.js:1130`) but NOT `/images/lingolinq-board-icon.png`. So on the web, the default icon still needs the sync's save; adding the `remote_url` gate there would lose it offline. Not changed.
- CONFIRMED: a later sync tries a missing icon again. :3160 is gated only by `store_url_quick_check` (already stored), not by `safely_cached` (:3123), and the seeds are walked every sync.
- CONFIRMED placeholder coverage: `components/board-icon.hbs:115-117` and `templates/user/board-detail.hbs:2223-2233` have `onerror="button_broken_image(this);"`; the classic sidebar `templates/application.hbs:1686, 1692, 1703` does NOT.
- Existing Try again: drawer `attention` stage (`sync-progress-drawer.hbs:42-44`, `try_again` :143 starts `sync('self', true)`); Sync Details missing group (`sync-details.hbs:123-125`).

### Proposal (icon warning)

More facts:
- CONFIRMED `persistence.js:3343-3362`: when a board saves, the success branch records `full_set_revisions` and walks on. On a failure with no retry claimed, the rejection pushes a board error (:3359).
- CONFIRMED `persistence.js:2382-2397`: at the end, `sync_progress.errors` are merged into `statuses` rows as `error`. `errors.length > 0` sets status 'finished' and the log's `issues`; otherwise 'succeeded'.
- CONFIRMED `utils/sync_log_store.js:42-52` `entry_copy` keeps only the listed entry keys and the row keys `id, key, status, error`. A new `warning` row field and a `warned` entry key must be added there, or they are lost on reload.
- CONFIRMED `utils/sync_rollup.js:67-113` `rollup`: a group is `ready` from `board_missing` and `folders_missing` only; `final_rows` keeps `error`/`status`.
- CONFIRMED drawer `ready` stage = notice 'succeeded' and missing 0 (`sync-progress-drawer.js:24`). Sync Details opens the first not-ready card by default (`sync-details.js:104`).
- CONFIRMED a liked/sidebar folder is a seed at depth 1, so it is its own group (`offline_sync_seeds.js:48,59`; `note_board_root`).

Candidates:
- C1 (chosen): the icon save's failure item is marked `optional`. Retries are unchanged (a dropped link is tried again about 10/30/90 s). When the board would be reported (no retry claimed, either at the first judgment :3349 or in `retry_content`'s final failure) and EVERY failure is optional, record a warning `{warning, board_id, board_key}` in `board_warnings` instead of a board error, and record the board as complete (`full_set_revisions`), as a save does. A mix with a real button picture or sound failure is still a board error. `update_sync_progress` sums `sync_progress.warnings`. At the end they are merged into the rows as `warning`, and the log entry gets `warned`. The status stays 'succeeded'. The rollup gives each group `pictures_missing: [names]` and `overall.warned`; `ready` is unchanged. Drawer `ready` + warned: the detail adds "1 folder's picture couldn't be saved. It shows a plain square until a later sync gets it." Buttons: Sync Details (primary), Try again (secondary); the X still dismisses. Sync Details card: a note section with the folder names and Try again (hidden while syncing), shown with or without subfolders. The default-open card falls back to the first warned card. Classic sidebar `<img>`s get `onerror="button_broken_image(this);"` (the placeholder `images/square.svg`, precached).
  - Risk: recording the revision hides nothing. The next sync's icon save is gated only by `store_url_quick_check` (confirmed :3160), so it tries again.
  - Risk: line-neutral edits in persistence.js (all appended to existing lines).
- C2: the icon save never rejects; warn at once, no retry. Simpler, but a short drop gives a warning the C1 retry would have avoided. Rejected.
- C3: silent like the board's own icon (:3137). Rejected by Traci (she wants a warning).
