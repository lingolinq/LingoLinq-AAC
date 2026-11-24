# Liked boards drop off after 5 syncs that did not finish (item 1 of #1328's follow-up), 2026-11-23

Branch `traci/fix/offline-liked-board-verdicts` from develop 3ccf3003e (#1365 merged). Source: #1328 final review
(Medium), `~/offline-sync-handoff/NEXT-after-1328-followup.md`; the first proposal and its review are in the #1365
worktree's local log `docs/task-management/2026-11-22-offline-boards-followup.md` ("Item 1", "Review of the item 1
proposal": proceed with changes, six conditions).

LEARNINGS consulted: ".eslint-todo is line-anchored" (callers edited on existing lines; services/app-state.js has 75
baselined rows, so its sign-out line is extended in place; services/persistence.js is not touched).

## Fact sheet (CONFIRMED in the first review; re-checked at 3ccf3003e)
- (a) Read: `seen_by_last_sync(sync_log, user_name)` (utils/offline_board_list.js:62), from `pick_device_boards`
  (:127) via `device_board_list` (:255-260), called by controllers/user/index.js:1975 and
  components/dashboard/classic-view.js:711, both passing `persistence.get('sync_log')`.
- (b) The log keeps the newest 5 entries for every sync on the device (utils/sync_log_store.js SYNC_LOG_KEEP);
  entries leave it only in `record_sync_log` (the single path every writer uses) and `merge_logs` (restore), and on
  sign-out (services/app-state.js:2254). Stops, cancels, other people's syncs and early failures push a deciding
  entry out without deciding anything.
- (c) Saved as the `settings` record `syncLog` `{owner, entries}` only for the owner of the open database; restored
  once per app start (`restore_sync_log`, `_sync_log_restored`, never reset).

## Revised proposal (the first review's six conditions, plus one change of mechanism)
New `utils/board_verdicts.js` holds the rule (moved from offline_board_list.js) and the record:
- `entry_verdicts(entry, fallback_at)`: per token (row id and key), for rows of OTHER owners' boards only (a row whose
  key starts with `entry.user_id + '/'` is skipped; id-only rows are kept, since a link refusal is logged by id):
  `false` when the entry has a `refused` row for it; else `true` for a positive row of a whole sync whose `answered`
  names the board and is not 'kept'; else `'weak'` for a positive row of a whole sync. Each verdict carries `at`: the
  entry's `finished` time (or `fallback_at`, the entry's place in the log, for entries without one).
- `merge(a, b)`, per token, ORDER-INDEPENDENT: two decisive verdicts: the later `at` wins (a tie: `false`); a decisive
  verdict beats `'weak'`; two weak: either. (Equivalent to the current newest-first reading.)
- `board_seen(user_verdicts, raw)`: per BOARD, the decisive verdict with the latest `at` across its id and key decides
  (a tie: `false`); with none, any `'weak'` lists; else not seen. (Condition 1: a refusal under the global id followed
  by key-only answers no longer hides the board forever.)
- Maps are null-prototype (`Object.create(null)`), keyed by user_name then token (condition 4); a cap of 3000 tokens per
  person, dropping the oldest (condition 5's size bound).
Writes (condition 2, fold on write): `record_sync_log` folds the newest entry into `persistence.board_verdicts` (merge
is idempotent, so a re-fold is harmless) and saves a separate `settings` record `boardVerdicts` `{owner, verdicts}`, but
only once this owner's stored record has been read and merged (`_board_verdicts_restored`, condition 3), so a skipped
or failed restore never overwrites it.
Restore: `restore_sync_log` also reads `boardVerdicts` for the same owner, merges it with the memory map (order does
not matter), folds the restored log entries in (so entries from before this change survive their eviction), sets the
flag and saves. Sign-out (app-state.js:2254) clears `board_verdicts` and the flag (condition 3).
Reader: `seen_by_last_sync(sync_log, user_name, verdicts)` merges `verdicts[user_name]` with the person's log entries
folded on the fly, then `board_seen`. Callers pass `persistence.get('board_verdicts')` (condition 6: both pages).

Change of mechanism vs the first proposal: verdicts carry the sync's finish time, so merging is commutative and
idempotent. That removes the ordering traps the first review found (save before fold, restore replacing this
session's verdicts, double folds) instead of testing around them.

Rejected: B (keep each person's newest finished entry: loses refusals); C (raise SYNC_LOG_KEEP: only delays).
Risks: entries with no `finished` (only tests build those) fall back to log order; a device clock change between
syncs could reorder two verdicts (a later sync stamped earlier). Unresolved: none known.

## Tests (red first)
- [whole answered, 5 stops] listed (the bug); [whole answered, stop refused, 5 stops] hidden; [refused, 5 other
  people's syncs] hidden.
- A refusal by id then key-only answers: listed (condition 1).
- Save then restore keeps verdicts; a restore merges with this session's verdicts in either order; no save before the
  restore has read; sign-out clears; a user named `__proto__` does not pollute (condition 4); own boards not stored.
- Both callers pass the map.
- The existing offline-list tests unchanged (parity).
Mutations: no fold on write; merge letting weak beat decisive; per-token instead of per-board; save before restore;
own-board filter dropped; no clear on sign-out.

## Review of the revised proposal (adversary, 2026-11-23): proceed with changes; what was built
Verified: the timestamp merge reproduces develop exactly when stamps follow write order (0/100k on full logs), and the
per-board rule only lists boards whose newest deciding sync answered them. Its conditions, applied:
1. No wall clock: each entry gets `seq` when written (`sync_seq`: max(finished, highest known + 1)), kept by
   `entry_copy`; a clock that goes back cannot let an earlier answer beat a later refusal (it could: 5,982/100k).
2. No restored flag: every save reads the stored record, merges (order-independent), writes; a failed read (not "no
   record found", utils/dbman.js) skips that save only.
3. Cap: weak verdicts dropped first; on a tie keys kept (a liked board is logged under its key).
4. Refusal rows never filtered by owner (a link's stated key can name the person while the id is another owner's).
5. The verdicts read is its own call beside `restore_sync_log` in persistence setup (same tick); a separate
   `restore_board_verdicts`, so restore_sync_log's existing "read once" assertion and record_sync_log's write count
   stay as they are (nothing is written for an entry with no other owner's board).
6. Tests: the clock, the upgrade fold, cap ties, a restored `__proto__` person, the caller on both pages, sign-out.
Built: aeed01e54 (utils/board_verdicts.js; offline_board_list.js reads it; sync_log_store.js folds and saves on
record and folds restored entries; persistence.js setup lines and app-state.js sign-out line extended in place; both
callers pass `board_verdicts`). Mutants V1-V16: 15 KILLED, V10 (save without merging the stored record) SURVIVED,
then killed by a new test ("a save keeps what the stored record says about other boards"). No existing test changed.
Checks: 836 tests on the sync, offline, verdicts and page filters, 827 pass, 9 skipped (pre-existing), 0 fail; lint
gate adds nothing (baseline untouched); gitleaks clean.

## Review of the built code (8e377f16f, 2026-11-23/24) and what changed (fdd6c9441)
- `/review-pr`: request changes. H1 (lists captured the verdicts when the device read started) FIXED: read when it
  finishes. M3 (cap tie could drop a refusal) FIXED. L3 comment FIXED. M1 (other people's verdicts in the record: the
  supervisee pages' lists need them), M2 (every writer appends a finished entry first) not real; L1/L2 need the
  no-reload sign-in (`auth_spa_transition`, off).
- `/adversary-review`: ship with conditions. Finding 1 (a verdict held only in memory was never saved if later entries
  had none; a refused board could come back after a restart) FIXED: `_board_verdicts_unsaved`. 2a FIXED: memory adopts
  the merged record. Recorded, not fixed: entries from before `seq` are ordered by their clock (upgrade window plus a
  clock change); every other owner's board is stored, not only liked ones (size; fails closed).
- Mutants W1-W6 KILLED; W7 (unsaved flag cleared despite a fold during the save) SURVIVES: needs two syncs within one
  storage read and the second save failing too.
- Test failures seen in the wide filter: `session.invalidate auth_spa_transition` also fails on develop 3ccf3003e
  (expected 1, got 2). `sync_send_utterance` "a changed sentence..." failed in 1 of 3 wide runs here, 0 of 1 on
  develop, and passes alone: cause NOT yet established.

## Second review round, on fdd6c9441 (2026-11-24), and the last fixes
REVIEWED=range 8e377f16f ... fdd6c9441. `/adversary-review`: ship (round 1's leak closed in the real module: 0 in about
183k fuzz checks; 6 Lows). `/review-pr`: request changes on H1, which the red team rates Low (not reachable while
`auth_spa_transition` is off).
Fixed, red tests first: a save ending after sign-out, or after someone else signed in, no longer puts verdicts back in
memory; a save writes what was folded while its read ran; a stored log with no entries does not throw; the sign-out
flag reset is asserted; references use this file's real name. Mutants X1-X6 all KILLED.
Recorded, not fixed: two separate storage faults in a row can still lose a refusal (until the next whole sync); the
store's owner is checked before the read, and the database cannot change without a reload today.
`sync_send_utterance` "a changed sentence...": 1 failure in 3 earlier wide runs, then 0 of 6 here and 0 of 6 on develop
(prebuilt, alternating). No branch code touches it; the failing run's message was not kept, so the cause is UNKNOWN.
