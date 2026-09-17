# whenever Resque queue drain (issue #964)

**Started:** 2026-09-15
**Status:** code change on `melissa/fix/whenever-queue-drain`; not live until staging then prod deploy
**Issue:** https://github.com/lingolinq/LingoLinq-AAC/issues/964

## Goal

Make deployed Cloud Run workers drain the `whenever` overflow queue, matching the
local `Procfile` `resque_slow` process and the 2018 "really slow queue" design.

## Diagnosis (verified in tree)

- Producers: `User#track_boards` under `any_queue_pressure?` (`app/models/user.rb`),
  `LogSession#update_board_connections` under `queue_pressure?` (`app/models/log_session.rb`),
  LessonPix batch cache (`lib/uploader.rb`), daily `BoardContent.link_clones`
  (`lib/tasks/scheduler.rake`).
- Consumer: `bin/docker-worker-entrypoint` defaulted `QUEUES` to
  `priority,default,slow`. Deploy workflow does not set `QUEUES`.
- Live backlog measured 2026-09-13 on prod (not re-measured here): 71 jobs
  (60 `track_boards`, 11 `link_clones`). Staging empty.
- `track_boards` `ts` skips if `settings['tracked_boards_at']` is newer; drain is
  one full run per user who never succeeded after enqueue, then no-ops.

## Change

Option A: add `whenever` last on the entrypoint default. Docs updated so they no
longer claim the queue is undrained.

## Release

1. Merge to `develop`.
2. Promote to `staging` (shared nonprod worker; `whenever` was empty on 2026-09-13).
   Confirm the worker registers four queues before releasing prod.
3. Release `staging` to `main`. That deploy releases the prod backlog. Watch
   worker logs and the failed queue. Do not set `QUEUES` by hand on the live pool.
