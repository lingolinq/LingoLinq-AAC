# 2026-11-16: Sync retry pacing (PR #1326)

Branch `traci/fix/sync-retry-pacing`. Two Codex P2 findings from the #1322 re-review (threads 4581887033, 4581887039):

1. Every parked board came back when the earliest was due, so a board on its third retry (about 90 s) came back after a newer board's first wait (about 10 s).
2. A thread resuming after its wait incremented `active_board_threads` directly, so several walks resuming together could run above the download limit.

This log was written after the code and reviews, to record what the PR description cites and to add the falsification run. The fact sheet below was re-verified against the committed head (fa1ba0be9) on 2026-11-16. It does not show that a written proposal came before the code: no record of that exists.

## Fact sheet (verified at fa1ba0be9)

- **Where the wait is read:** `app/frontend/app/utils/board_retry.js` `create_parking`. Each parked entry has `at` (monotonic park time) and `due = at + delay_for(attempt)`. The `wait` timer is armed for the earliest due board. CONFIRMED.
- **Delays:** `BOARD_RETRY_DELAYS_MS = [10000, 30000, 90000]`, each within 20% (`retry_delay`, `board_retry.js:13-22`). CONFIRMED.
- **Download limit:** `services/persistence.js:3400` `n_threads` is 1 under `sync_testing`, 6 on mobile, 10 otherwise; `add_thread` re-checks every 1 s while `active_board_threads > n_threads` (`:3403`), so with overlapping walks it admits up to `n_threads + 1`. CONFIRMED.
- **Resume path:** `services/persistence.js:3391`. Boards that are already due come back with the slot kept (`kept_slot`), with no new increment. Otherwise the resume goes through `when_slot_free` with the same `>` test, then increments. CONFIRMED.
- **Shapes a resume can take:** (a) already due when the thread asks to wait: `resume(items, true)`; (b) the timer fires: `resume(boards due by max(now, target), false)`; (c) cancel or Try now, through `wake`: `resume(all parked, false)`. CONFIRMED in `board_retry.js` `wait` / `fire` / `wake`.
- **Open, not changed here:** `add_thread` admits `n_threads + 1` when walks overlap (root sync plus supervisee walks share the counter). The PR keeps `>` to match it (reply to Codex 4594458773).

## Reviews

- Two adversarial reviews of the code (recorded in the PR description). The second simulated 2000 random runs, normal and cancelled, against the real `board_retry.js`: no lost boards, no double resumes, no slot drift, no hung thread, never above `n_threads + 1`, the limit `add_thread` applies (the old code went above it in 259 of 2000). The 2000-run figures come from that review's report; no artifact of it is in the repo.
- A third adversarial pass reviewed the `>=` change (7483a71da, 2026-11-16) before the reply to Codex; the change was dropped (reset to fa1ba0be9), so it is not a review round of the PR's code.
- An adversarial review of this log (2026-11-16) found the first m7 verdict wrong; see Falsification.
- Codex review of fa1ba0be9: one P2 (`>` versus `>=`), answered with reasons and not adopted. No Codex response as of 2026-11-16.
- Sync is not on the dual-review list, so the Codex review is the one required PR review.

## Falsification (mutation run, 2026-11-16)

Method: switchable mutants in `board_retry.js` and `persistence.js` keyed on a `mut=` query parameter, ONE `ember build --environment=test`, then `ember test --path <build> --query "timingStrict=1&mut=<id>" --filter "/board retry|persistence/i"` for each. Code restored with `git checkout` afterwards; `git diff HEAD` was empty.

Counts are from the run before the new test was added (except the m7 re-run). The new test also fails under m1, m3 and m4 (simulated in node by the second review, not re-run in Ember).

| Mutant | Change | Failing tests |
|---|---|---|
| none | baseline | 0 (326 pass, 9 pre-existing skips) |
| m1 | every board uses attempt 1's delay | 3 (board retry: one thread waits…; later retry keeps its own longer wait; parked during a wait…) |
| m2 | wait counted from when the thread waits, not the park | 2 (wait counts from when parked; boards already due…) |
| m3 | a board parked during a wait does not re-arm the timer | 1 (parked during a wait…) |
| m4 | the timer brings back every parked board (old behaviour) | 3 (same as m1) |
| m5 | overdue boards wait instead of coming back with the slot kept | 1 (boards already due…) |
| m6 | wake brings back only due boards | 1 (cancel still brings back every parked board) |
| m7 | stale-timer `seq` check removed | 0 at first: a missing case; now 1 (new test, below) |
| m8 | `when_slot_free` never waits | 2 (resumed thread waits for a free slot; persistence-sync: start a retried board only when a slot is free) |
| m9 | the kept-slot branch also goes through `when_slot_free` (double count) | 1 (persistence-sync: retry at once, keeping its slot) |
| m10 | old direct increment from #1322 | 2 (persistence-sync: slot free; retry at once, keeping its slot) |

**m7 was a missing case, not an equivalent mutant.** The first verdict here ("re-arming only moves the timer earlier, so the outdated timer always fires after the newer one") was wrong. The due times use the monotonic clock (`board_retry.js:26-29`), but the timer is Ember's `runLater`, which expires on `Date.now`. A wall clock moved forward between the first arm and the re-arm (or a device asleep then) can make the superseded timer fire FIRST. Without the `seq` check it then fires the wait and brings B back before its own wait is over. The existing test ran the newer timer first, so it could not see this. Added test: "a superseded timer that fires before the newer one brings nothing back early" (`tests/unit/utils/board-retry-test.js`): 16 of 16 pass on the code, and 1 fails with the `seq` check removed.

A related case is not fixed: when the timer fires early because of a forward wall-clock change (and, plausibly, device sleep), `fire` brings back boards due by `max(now, target)` on the monotonic clock. So the right board comes back, but the wait itself can end early. That is the same Date.now timer limit as the backward-clock note in the PR's "Not covered".

## Learnings consulted

- `learnings-archive/2026-11.md`: "A mutant that survives points at a missing case, not a redundant line" (read after the review; it would have caught the first m7 verdict).

## Pre-PR checklist (P1 to P6)

- P1: the description's claims re-checked against fa1ba0be9 (line numbers, delays, thread counts, test names). Pass.
- P2 to P4: not applicable (no auth or visibility change, no compliance docs or register).
- P5: Fix status, Not covered and Author-Model are present.
- P6: no UI flow change. The manual check on dev after merge (a phone sync on a weak connection, no board listed as failed) is in "Not covered".
