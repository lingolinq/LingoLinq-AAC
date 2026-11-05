# 2026-10-30: nonprod one-off Jobs use the workers' Resque namespace

Part of lingolinq_mobile#3 (found while diagnosing why staging serves library pictures as
embedded data). The full diagnosis is in the `traci/fix/sync-bounded-reads` branch's log,
`docs/task-management/2026-10-30_sync-bounded-reads.md` (Problem C, Proposal D1 and its review).

## Problem
`config/initializers/resque.rb:102-116` namespaces Resque as `lingolinq#{REDIS_NAMESPACE_SUFFIX}`.
Nonprod web, worker and scheduler set `-dev`; `lingolinq-migrate-staging`, `lingolinq-migrate-dev`
and `lingolinq-utility-dedupe-dryrun` did not (read live 2026-10-30). Every job a one-off run
through them enqueued went to `lingolinq`, which no nonprod worker reads: 503,976 jobs on
`default` and 28,883 on `slow` were stranded there on 2026-10-30, including the uploads for the
September library imports. Production is unset everywhere, so it was consistent.

## Change
- `deploy-cloudrun.yml`, assemble step: writes `MIGRATE_ENV_VARS` (the old literal, plus
  `REDIS_NAMESPACE_SUFFIX` only when non-empty). Production's value is byte-identical.
- Migrate step: `set -euo pipefail`, requires `MIGRATE_ENV_VARS`, deploys with it, then reads
  back the Job's `RAILS_ENV` and suffix and refuses to execute unless the suffix equals both the
  configured value and the live draining surface's (the worker pool, or with DEPLOY_WORKER off,
  the web service). A surface that does not exist yet (a new environment) is skipped with a notice.
- `scripts/gcp/dedupe-utility-boards-dryrun.sh`: copies the web service's plain suffix when
  non-empty; refuses anything but `[A-Za-z0-9_-]` because its flags file is sourced.
- Docs: INFRASTRUCTURE.md "Console and one-off work", demo-district.md, the dedupe runbook and
  the workflow's OPERATIONAL RULE header.

## Tests and falsification
`spec/config/deploy_cloudrun_migrate_env_spec.rb` runs the workflow's step scripts and the dedupe
script in bash against a stub `gcloud`. Red before the fix: 9 of 11 workflow examples, and the
dedupe copy example. Green after: `spec/config/` 36 examples, 0 failures. Each mutation turned
the suite red: always emit the suffix (2), literal deploy env (1), drop the live comparison (2),
drop the configured comparison (1), drop the RAILS_ENV check (1), always compare with the worker
pool (1), no exit on mismatch (4); script: no copy (2), copy empty (2), no shape check (1; that
mutation actually ran the injected `touch`, which is why the test now runs in its temp dir).
The `${MIGRATE_ENV_VARS:?}` line is not separately falsifiable: `set -u` fails the same way.

## Risks
- Takes effect per Job at its next deploy; `lingolinq-migrate-staging` only once this reaches
  `staging`. A failed readback leaves the Job deployed but not executed.
- From then on, nonprod one-off runs that enqueue work feed the shared worker, which runs the
  staging image; develop-only job code run through `lingolinq-migrate-dev` fails there (the
  same exposure `lingolinq-web-dev` already has).
- Cache invalidations from nonprod one-offs now reach the web services (correct, but new).
- The stranded jobs already in `lingolinq` are not touched here (census and drop is a separate
  nonprod-only step on issue #3).

## Review (2026-10-30, local adversary, verified by me)
No Critical or High. All four findings CONFIRMED by reading and fixed, test first:
- Medium: a deliberate change to `APP_REDIS_NAMESPACE_SUFFIX` fails every later deploy, because
  the pool gets the new env only in a later step. Kept the refusal (running against a stale
  namespace is the bug), and the error now prints the recovery: move the pool first with
  `gcloud beta run worker-pools update`, then re-run.
- Low: in dev the reference was `lingolinq-web-dev`, deployed from the same variable, so the
  check compared dev's value with itself. Dev now compares with `lingolinq-worker-staging`, the
  pool that actually drains the shared Redis (named in the workflow header).
- Low: any describe failure counted as "does not exist yet". Only NOT_FOUND does now, as in
  the "Record current serving revision" step; any other failure stops before execute.
- Low: the dedupe comment and spec name implied a secret-backed suffix is dropped; it travels
  with the copied secrets, and the spec now asserts that.
Red before these fixes: 3 new examples. Mutations, each red: dev compares with its own pool (1),
every describe failure treated as not found (1), no recovery hint (1). `spec/config/`: 39
examples, 0 failures.
