# A board saved late in a sync is downloaded again by the same sync (2026-11-16)

Found by the before/after comparison of #1322 (synthetic account synth_big: home board + 56 folders of about 0.75 MB,
Chrome with a Pixel 7 profile, a local link throttled to 800 kbps / 100 ms, folders removed from the device first):

| | Old (6a32989c5) | New (develop e13291c88) |
|---|---|---|
| 4 Mbps | 92 s, 41.9 MB | 91 s, 41.9 MB |
| 1.5 Mbps | 301-335 s, 51-56 MB | 240 s, 42 MB |
| 0.8 Mbps | 478 s, 43 MB | 869 s, 80.6 MB |

A request trace of the new code at 0.8 Mbps: 56 board GETs by global id (8 s to 425 s), then 53 by key (441 s to
858 s), each a different URL; the old code: 119 GETs, all by id, none by key.

## Fact sheet

- (a) Where is the decision READ? CONFIRMED: `services/persistence.js` `board_lookup`, the `find_board` then-callback
  (~:2764-2786): a record that is not `fresh` (fetched within 5 minutes, `models/base.js:43-51`) and not covered by one
  of its "cached" shortcuts is marked 're-downloaded' and `record.reload()`ed (~:2780-2782).
- (b) Shapes of the record at that read, for a board the walk parked:
  - CONFIRMED: on a slow link the adapter's 15 s caller limit answers `{error: 'timeout'}` while the download keeps
    running (`utils/board_download.js` find_limits; `utils/persistence.js` ~:4357-4363); `claim_board_retry` treats it
    as passing (`utils/sync_board_fallback.js` ~:102-108), drops `key_lookups[id]` and the board is parked.
  - CONFIRMED: when the late answer lands, `store_late_board` writes the device row with `retrieved = now`
    (`utils/board_download.js:100-121`).
  - CONFIRMED: the retry runs after the walk (the waiting thread, `utils/board_retry.js`), finds that row through
    `findRecord` (served locally), and by then it is older than 5 minutes on a long sync: not `fresh`.
  - CONFIRMED: `reload()` sets `force_reload` (`models/base.js:32-41`), and the adapter, finding a device row with a key,
    requests the board by key (`utils/persistence.js` ~:4263, :4366-4368): the by-key pass.
  - So the reloaded copy is the same board this sync already downloaded: about 40 MB and 420 s wasted in the trace.
- (c) Cross-file claims:
  - CONFIRMED: `sync_progress` has no start time; it is created at `services/persistence.js:2049-2054` and recreated at
    :2197-2201 (keeping `sync_id`, which embeds the start time as text).
  - CONFIRMED: `known_on_device` (`utils/sync_board_fallback.js:86-92`) already treats a record fetched after the
    device read (`retrieved >= device_boards_read_at`) as on the device.
  - CONFIRMED: the old code never reached `reload()` for these boards because it discarded late answers (the #1322 diff).

## Proposal

A (chosen). A complete copy (permissions and image_urls) fetched during this sync is current for this sync: in
`board_lookup`'s not-fresh branch, a new first shortcut `fetched_this_sync(sync_progress, record)` →
status 'downloaded' (it was downloaded by this sync), no reload. Unless `cache_mismatch` (the server says a newer
revision exists), which still reloads. `sync_progress.started_at` is recorded where `sync_progress` is created (and
kept when it is recreated). Helper in `utils/sync_board_fallback.js`, next to `known_on_device`.

B. Mark a board done for the sync when its late answer is stored (drop the parked retry). Rejected for now: couples the
adapter to sync state; a late answer can land while its retry is running.

C. Join downloads by board identity, or reload by id. Rejected: the first download had already finished; nothing to
join. Changing the key swap affects every board refresh.

Simplest alternative: a longer freshness window during a sync. Rejected: it would also skip boards that really are
stale from an earlier session.

## Risks and open questions

- A board edited on the server during a long sync is not refreshed until the next sync, unless the revisions list
  (`fresh_board_revisions`) shows the change (then `cache_mismatch` still reloads). The 5-minute window allows the
  same today.
- The by-key URL of `reload()` is unchanged elsewhere.
- Status: 'downloaded' (not 'cached') for these boards, which matches what happened.

## Tests (red first) and mutations

- sync_board_fallback unit: `fetched_this_sync` true for `retrieved >= started_at`, false before it, false with no
  start time, false with no `retrieved`.
- persistence-sync: a board parked after a timeout whose late copy was stored with an old-looking `retrieved` (older
  than 5 minutes but after the sync's start) is not reloaded on its retry (no keyed request; status 'downloaded').
  Mutation: drop the shortcut → reload, red. A board fetched before the sync started is still reloaded when stale.

## Review (adversary, 2026-11-16): proceed with changes

All CONFIRMED facts held, with one correction: `fresh` also ends when `appState.refresh_stamp` (a 5-minute timer from
app start, `services/app-state.js:5364-5377`) passes `retrieved` (`models/base.js:47-50`), so a late copy stops being
fresh 0 to 5 minutes after it is stored, not only after 5 minutes.

Conditions before building (accepted):
1. Boards already in memory at the retry (Modern view pushes the open board's /tree folders, with no `retrieved`):
   `store_late_board` writes only the device, so the in-memory record keeps no stamp and the shortcut would miss it.
   On a retry, read the device row by global id (as keep_stored_board does, `services/persistence.js:2782`), judge
   its `retrieved`, and push that row (the /tree copy is the lite form). Re-measure with Modern home open.
2. Red tests that fail for the right reason: a unit test of board_lookup with the real adapter (sync_progress started
   10 minutes ago, device row stamped 6 minutes ago, board not in memory: no request, 'downloaded'; old code requests
   by key); a whole-sync test with the real lookup and primed storage, `refresh_stamp` set after the late row lands,
   `started_at` recorded by the code (not planted) and kept through the re-creation at :2197; negatives: cache
   mismatch still reloads, a partial board still reloads, a stamp equal to the start counts.
3. The window starts at the later of `started_at` and `device_boards_read_at` (known_on_device's rule: a stamp from
   before the device read proves nothing, #1212).
4. Lookups by key: decide (keep their reload with `&& !key_for_id`, or state the saving) and pin it with a test.
5. Set `button_set_needs_reload` as the fresh branch does; place the shortcut after `local_full_set_revision` (:2768).
6. Risk noted: "stored during this sync", not "requested during it"; `cache_mismatch` covers only boards in
   board_revisions.

## Implementation (2026-11-16, commit on traci/fix/sync-late-copy-current)

- `utils/sync_board_fallback.js`: `copy_from_this_sync(sync_progress, row)` (a usable row with permissions and
  image urls, stamped at or after the later of `started_at` and `device_boards_read_at`) and
  `stored_this_sync(sync_progress, id, record, find_row)` (only for ids in `retried_lookups`, the parked retries;
  reads the DEVICE row, not the record: condition 1).
- `services/persistence.js` (line-neutral above the ESLint baseline's last row, 4465):
  - `started_at` set where `sync_progress` is created (sync, ~:2051) and kept at the re-creation (~:2199).
  - board_lookup's reload branch (~:2780-2782): unless `key_for_id` or `cache_mismatch`, `board_stored_this_sync`
    first; a copy found is pushed as the sync pushes a cached row (`{data: {id, type: 'board', attributes: row}}`,
    as at ~:2921), status 'downloaded', `button_set_needs_reload` true (condition 5); otherwise reload as before.
    The shortcut sits after `local_full_set_revision` is read (:2768) and after the three 'cached' shortcuts, so a
    board that was 'cached' stays 'cached'.
  - new `device_board_row` and `board_stored_this_sync` in the last `reopen`; the #1212 keep path now calls
    `device_board_row` instead of its own copy of the same lookup.
- Condition 4 (lookups by key): kept their reload (`key_for_id`), pinned by a test. A parked retry is for the id the
  walk used; a by-key id means the walk knew no global id.
- `utils/persistence.js` has an older copy of board_lookup (no #1212 changes); the proxy at its end sends calls to the
  service when `window.persistence` has the method, so it is left unchanged, as #1212 left it.
- Condition 2, corrected: the first commit claimed a whole-sync test could not drive a real parked retry because the
  waits are 10 s+. That was wrong (the final review): under `sync_testing` every wait runs at 1 ms
  (`schedule_sync_board_step`, services/persistence.js:76-88, used by `create_parking`). The second commit adds that
  test (`syncWithBoard167`: a timeout, the late copy on the device, then the retry: 2 requests and 'downloaded'; with
  the shortcut disabled, 3 and 're-downloaded'). The started_at test proves the start is recorded by the code and kept
  through the re-creation (the user's answer is held 30 ms; a re-stamp would be later than it).

## Final review (adversary, 2026-11-16): ship with changes, no Critical or High

Each finding checked in the code before acting:
- Medium, accepted: add the whole-sync parked-retry test (premise above was false). Done.
- Medium, accepted: `cache_mismatch` was judged on the record in memory, which may be the lite /tree record, not the
  row being used. Now the listed revision is passed to `copy_from_this_sync` and compared with the ROW's
  `current_revision`; the gate in board_lookup keeps only `key_for_id`.
- Low, accepted: a failure to put the copy in the store now falls back to the reload (`.then(null, () => null)` in
  `board_stored_this_sync`), instead of failing the board.
- Low, accepted: the back-off comment moved back above `pause_automatic_sync`; this doc is committed with the PR.
- Not changed: the push replaces the record in memory without comparing it. A record newer than a row stored during
  this sync would be `fresh` and never reach this branch unless the 5-minute window or `refresh_stamp` passed.

## Verification

- Red first: 9 unit tests (helper missing), 2 board_lookup positives (1 reload, expected 0), the started_at test
  (undefined); the 6 negatives were green before and after (they pin current behaviour).
- Green: 71/71 with `--filter "/sync board fallback|saved late in a sync|board_lookup|slow server|must be on the device|board retry|retry pacing|parked/i"`.
- Mutations (each run 18 tests, 4 red, each the expected ones):
  - A: shortcut disabled; `started_at` re-stamped at the re-creation; window from `started_at` only.
  - B: `key_for_id`/`cache_mismatch` guard removed; `retried_lookups` gate removed.
- After the review: red on the first commit for the 4 new behaviour tests; green 76/76 on the same filter plus
  "stored late by a timed-out". Mutations: C (shortcut disabled): 4 red, including the whole-sync test; D+E (store
  fallback removed, listed-revision check removed): 4 red, each the expected ones.
- `npm run lint:js:ci`: only the known worktree false positive (`sync-details.js:220`).

## Measurement

synth_big, Pixel 7 Chromium, 800 kbps / 100 ms, Modern home open (/synth_big/board-detail/big-core, 37 boards in
memory before the sync), folders removed from the device first.


| Code | Seconds | MB over the link | Requests | Boards saved |
|---|---|---|---|---|
| Old (6a32989c5, before #1322) | 477-479 | 43.0-43.7 | 237-242 | 57/57 |
| develop (e13291c88) | 869 | 80.6 | 311-314 | 57/57 |
| First fix commit, 2 runs | 459-460 | 42.1 | 145-147 | 57/57 |
| Final (both commits) | 460 | 42.1 | 146 | 57/57 |

The 37 in-memory boards were complete records (image urls present), so this run did not exercise a lite /tree record
at the retry; that case is covered by the board_lookup tests. The sync log holds 94 statuses for 57 boards (57
"downloaded", 37 "re-downloaded"): consistent with each in-memory board's first reload timing out and its retry using
the late copy, but not traced board by board.

Faster links with the final code, one run each: 4 Mbps 93 s / 41.9 MB (develop 90-92 s / 41.9 MB); 1.5 Mbps 248 s /
42.1 MB (develop 240-241 s / 42.1 MB). The 1.5 Mbps run's sync log has 58 statuses (94 at 0.8 Mbps, where
boards were retried), which suggests few or no retries and so little or no use of the changed code; not checked board
by board. One run cannot say whether the 8 s is real.

Comparison page (private until shared): https://claude.ai/artifact/FX6pAnfHqqpxv57Y27cr8J
