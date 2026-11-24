# A failed usage-log push was dropped when a newer push had started

Base: `develop` at `084552a6b`. Branch `traci/fix/usage-log-requeue`.

## Fact sheet

- **(a) Where the batch leaves and comes back.** `push_log` takes up to 250 events out of `usage_log` and
  persists the rest before saving (`app/frontend/app/services/stashes.js:885`). Only the failure handler
  puts them back (`:925`). That handler returns first when `pushSerial !== this._logPushSerial` (`:909`),
  so a failure that lands after a newer push started never reaches `:925`. CONFIRMED.
- **(b) When a newer push can start before an older one settles.** The only gap between pushes is
  `last_log_push` and a 10 second minimum (`:858-869`); there is no in-flight flag. Every caller can start
  one: a press (`log_event`, `:673`), the reconnect drain (`:847`), the 15 minute timer (`:930-933`), the
  `wait_timer` retry (`:863-866`), the success handler's follow-up for over 250 events (`:898-905`),
  sync (`services/persistence.js:2028`, `utils/persistence.js:2045`) and evaluations (`utils/eval.js:216`,
  `:295`, `utils/eval_session.js:236`). A save slower than 10 seconds plus any of those is enough. CONFIRMED by reading;
  the test reproduces it.
- **(b) What the failure handler can see.** `this.isDestroyed` (app torn down); the serial equal (latest
  push) or not (stale). Only the stale case is broken. The destroyed case also drops the batch; see
  "Not covered".
- **(c) Cross-file claims.** `utils/_stashes.js:780-812` holds the same handler, and its export is a Proxy
  that forwards to the service once it exists (`:834`). Calls through the Proxy reach the service, but a
  push or 15 minute timer started on the util object before the service existed keeps running on it,
  and writes the same localStorage key. CONFIRMED by reading; not reached by any test.
  The server sorts a session's events by timestamp (`app/models/log_session.rb:49`), so a re-queued batch
  landing behind newer events on the device does not reorder anything the server keeps. CONFIRMED.
- **Why the serial guard exists.** No commit message says (it arrived in the squashed #625), but the
  test harness uses it: `tests/helpers/ember_helper.js:1216` and `tests/utils/stashes-test.js:54` bump
  `_logPushSerial` to silence a save still in flight from the previous test. In the app it keeps a stale
  result out of state the newer push owns: the back-off (`errored_at`) and the success handler's
  follow-up push. The fix keeps it for those. CONFIRMED (reviewer, checked).

## Red test

`tests/unit/services/stashes-push-log-requeue-test.js`, with the store's `save` held open:
1. Push `first`, push `second`, record `third`, fail `first`: the queue must be `first, third`, and stay so
   after `second` succeeds. **Red on develop** (actual: `third` only). The `third` event makes a fix that
   overwrites the queue instead of adding to it fail too (reviewer's point).
2. A failure of the latest push re-queues and counts toward the back-off (green on develop; pins it).
3. A stale failure leaves `errored_at` alone (green on develop; pins the guard's remaining job).

Mutation that must turn test 1 red: move the re-queue back below the serial check.

## Proposal

**A (chosen).** In the failure handler, re-queue before the serial check; keep the check for the back-off
bookkeeping and the log lines. Same change in `utils/_stashes.js`. Smallest change; the guard keeps the
only job it can have.

**B.** Delete the serial check from the failure handler. A stale failure would then also bump
`errored_at`, so an old timeout could put a newer, healthy push stream into back-off. Rejected: changes
behaviour beyond the bug.

**C.** Leave the batch in `usage_log` until the server acknowledges it (mark in flight instead of
removing). Also fixes the reload-while-saving loss below. Rejected for this PR: a lost response would
resend a batch the server already stored. A grep of `log_session.rb` found de-duplication only for
evaluations (by `ref_id`), not for usage events; that is not a full check, so C needs its own design.

## Risks and open questions

- A batch the server always rejects (a 400 for one bad event) is re-queued and resent forever, with the
  back-off, and every later event rides in the same 250-event batch. That is already true for the latest
  push; the fix extends it to stale failures. Not new, but worth its own look.
- **Possible double count (accepted trade-off).** A POST times out on the device at 20 seconds
  (`utils/extras.js:186-191`) and a status-0 POST is retried once (`:361-377`), so a save can fail on the
  device after the server stored it. The server gives a repeated client event id a new id rather than
  dropping it (`app/models/log_session.rb:172`). A stale failure needs a save over 10 seconds, the case
  most likely to end that way, so the fix can turn a lost batch into a counted-twice batch. That already
  happens today for the latest push; for usage data a duplicate is better than a silent loss.
- **Harness interaction.** The harness's serial bump no longer stops a late failure from writing its
  batch back. `persist` returns on a destroyed service (`services/stashes.js:264`), so this only matters
  when a test shares a live service with the previous one. Checked with a full timing-strict run.

## Review and verification

- Proposal reviewed by a local red-team agent before any code change. It found no path where the fix
  drops or duplicates events in `usage_log`. Its points, all taken: strengthen test 1, use `stub()` and an
  empty queue, correct the guard's history and the double-delivery claim, check the harness interaction.
- Applied: re-queue before the serial check, in both copies, with line counts unchanged (`.eslint-todo`).
  The test holds the `timer` slot so `push_log` schedules nothing, instead of importing `@ember/runloop`.
- Falsified: develop's `services/stashes.js` makes test 1 red; the fix makes it green.
- `--filter stashes` with `timingStrict=1`: 47 of 48 before the fix (only the new test), 48 of 48 after.
  `npm run -s lint:js:ci`: no new findings.
- Full suite with the fix and `timingStrict=1`: 3988 tests, 0 failures, 37 skipped, no browser
  timeout (a complete run). The harness interaction the reviewer raised did not show up.

## Production check (2026-11-09)

With the synthetic prod test account, logging on and Speak Mode, five presses were queued, sent as JSON to
`POST /api/v1/logs`, answered 200, and the device queue emptied. New accounts start with logging off: no
default is set server-side, and `app-state.js:3145` records only in Speak Mode with logging on.

## Not covered by this fix

- **Reload or close while a save is in flight:** the batch is already out of `usage_log` (`:885`), so if
  the request never reached the server it is gone. Option C territory.
- **`isDestroyed` at failure time:** same loss, same root (remove before ack).
- The 30 minute / 20 day threshold is the separate held branch `traci/fix/usage-log-push-timing`.
