# Copy Performance Tuning (Staging)

This doc captures the **post-#230 performance picture** for "Copy a full
board set" and the recommended staging-side knobs for keeping the
deferred-buttonset window short on large copies.

## Background

PR #230 changed `BoardSetCopier#copy_and_relink` so copied boards that
do not already have a `BoardDownstreamButtonSet` defer
`BoardDownstreamButtonSet.update_for` to the `:slow` Resque queue while
`Thread.current[:bulk_copy_in_progress]` is set. This dropped the
synchronous server-side copy time for a 97-board set from ~20 minutes
to **~9 seconds** (measured on staging on 2026-05-09). The behavior can
be disabled with `ASYNC_BUTTONSET_DURING_BULK_COPY=false` for emergency
rollback.

The tradeoff: each freshly-copied board without a pre-existing
buttonset has **no buttonset row** until the deferred `update_for` job
runs. While the queue drains, any operation that needs the buttonset
(the next Copy modal's preferred hierarchy load, search across the new
set, the translation modal, etc.) may return incomplete data or time
out at the frontend's 60s master timeout (`WORK_TIMEOUT_MS` in
`app/frontend/app/models/buttonset.js`, added in PR #237).

Frontend mitigation lives in the copy-modal fast-fallback branch (PR
#257 if opened from that branch): `copy_hierarchy_loader` races the
buttonset hierarchy load against a 6s delayed live-links walk. The
active component modal and the legacy controller both use that shared
loader, so the rendered modal no longer waits for the full 60s
buttonset timeout before showing a selectable hierarchy. This doc is
the backend/infrastructure side: keep the queue-drain time as short as
possible so the partial-results window closes quickly.

## Current staging worker config (read from Render dashboard 2026-05-09)

```
service:    lingolinq-dev-staging-worker
id:         srv-d66jbilum26s73aa7mn0
branch:     staging
plan:       standard
numInstances: 1
startCommand: env QUEUES=priority,default,slow INTERVAL=5 TERM_CHILD=1 \
              bundle exec rake environment resque:work
```

One worker process, polling Redis every 5s, sharing all three queues
(`priority`, `default`, `slow`). When a 97-board copy queues roughly
one `update_for` job per copied board onto `:slow`, the same worker
pool that just ran the `BoardSetCopier` job drains them.

## Drift between `render.yaml` and live services

`render.yaml` declares a service named `LingoLinq-AAC-Worker` with
`INTERVAL=1.0`. The actual deployed worker is named
`lingolinq-dev-staging-worker` with `INTERVAL=5`. The blueprint is not
being re-applied to the live services, so `render.yaml` edits will
not take effect on their own. **Any of the changes below need to be
made manually in the Render dashboard** until the blueprint is
re-synced (out of scope for this PR).

## Recommended changes (staging only)

### 1. Drop `INTERVAL` from 5 to 1

Smaller wins in queue latency. Resque polls Redis when idle; smaller
INTERVAL means jobs are picked up sooner after the worker becomes idle.

```
INTERVAL=1
```

Reversible: set back to `INTERVAL=5`.

### 2. (Optional) Bump worker `numInstances` from 1 to 2

Doubles drain throughput at roughly double the worker cost on the
`standard` plan. Useful as a temporary capacity bump while validating
PR #230 and #257 on production-scale board sets. Should be reverted
back to 1 once validated, or moved to a dedicated `:slow`-only worker
(option 3).

Reversible: scale back to 1.

### 3. (Better long-term) Add a dedicated `:slow`-only worker

Splits the workload so high-priority work (notifications, immediate
user-facing jobs) is never blocked by a 100+ job buttonset backfill.
Run with:

```
QUEUES=slow INTERVAL=1 TERM_CHILD=1
```

The existing main worker drops `slow` from its queue list:

```
QUEUES=priority,default INTERVAL=1 TERM_CHILD=1
```

Reversible: re-add `slow` to the main worker's `QUEUES`, delete the
dedicated worker.

## How to monitor drain progress

Tail the staging worker app logs and watch for either of these
markers (both already live as of PR #230):

```
[Board#post_process] Deferring buttonset creation to :slow queue for board <id>
performing BoardDownstreamButtonSet . update_for ()
done performing BoardDownstreamButtonSet . update_for (), finished in <n>s
```

If `Deferring` lines aren't followed by a matching `done performing
BoardDownstreamButtonSet . update_for` within a few minutes, the
deferred jobs are stuck or the worker is starved.

Console one-liner for queue depth (during a bulk-copy validation
session):

```ruby
Resque.size('slow')
```

## When NOT to make these changes

Don't touch worker config during an active copy by a real user. The
worker will be SIGKILLed on a config change and the in-flight copy
job will end up in the failed queue (recoverable, but disruptive).

Pick a quiet window or use staging only (which is the default scope
of this doc).

## Frontend fallback behavior to expect

With the fast-fallback branch merged:

- If `BoardHierarchy.load_with_button_set` returns quickly, the modal
  uses the buttonset hierarchy and never starts the live-links walk.
- If the buttonset load is hanging or waiting on deferred buttonset
  generation, `BoardHierarchy.load_from_live_links` starts after 6s and
  the first usable hierarchy wins.
- If the buttonset load rejects before 6s (`buttonset load timed out`,
  `generation_stalled`, missing data, etc.), live-links starts
  immediately.
- If live-links wins, the modal sets `hierarchyRootOnlyWarning` so the
  user knows the list was rebuilt from folder links. In current code,
  live-links walks linked board records recursively when those records
  can be resolved in the browser; if any linked board cannot be fetched,
  the hierarchy is marked incomplete and backend copy expansion remains
  the final safety net.

## Validation checklist

After applying changes 1 (and optionally 2 or 3):

- [ ] Copy `vocal-flair-112` (~97 downstream boards) on staging.
- [ ] Capture the `[copy_perf]` log lines (Phase 1 / Phase 2 / total).
- [ ] Capture the time from the last `Deferring buttonset creation`
      log line to the last matching `done performing
      BoardDownstreamButtonSet . update_for` line. This is the
      partial-results window.
- [ ] Open the Copy modal again, against the freshly copied root.
      With the fast-fallback branch merged, the modal should show a
      selectable hierarchy in ~6s even if the `:slow` queue is still
      draining; without that branch it can hang up to 60s.

## Rollback

For any change above:

1. Set the env var or scale value back to the previous setting in the
   Render dashboard.
2. The worker will redeploy (~30-60s downtime for staging worker).
3. Confirm the queue drains a small (5-10 board) test copy normally.
