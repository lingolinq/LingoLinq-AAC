# Staging job: translate seeded library boards

Run `rake lingolinq:translate_library_boards` with `SCOPE=seed DEST_LANG=es` on **staging** as a
one-off Cloud Run job execution. Do not wire this into a schedule. Creating the execution starts it.

This does not delete boards. It stores dest-locale hashes on the existing English `lingolinq` boards (`translate_set` with `default: false`). English stays the visible default.

## What `SCOPE=seed` covers

Listed public roots owned by content user `lingolinq` after a library reindex (starter + sidebar + crisis + Senner + curated S3 + OpenAAC). Linked children are `unlisted` and are translated by the tree walk from those roots.

After a full reindex that is about 32 listed public roots (on the order of 1359 boards in the trees). A dry run on 2026-09-14 reported `32 root(s) would be translated, 1 skipped`. Skipped:

- `*-es` Spanish copies
- boards whose default locale is not English

Without `SCOPE`, the rake still uses signup slugs only (Quick Core 60, Vocal Flair 60/84, crisis, Senner, yes/no, inflections).

## Where it runs

| Field | Value |
|---|---|
| Cloud Run Job | `lingolinq-scheduler-staging` |
| Project | `lingolinq-nonprod` |
| Region | `us-central1` |
| Database | `lingolinq-dev-staging-db` on Cloud SQL, shared with dev |
| Task timeout | 3000s, `taskCount=1`, `maxRetries=0` |

**Why the scheduler job and not `lingolinq-migrate-staging`.** A Cloud Run Job does **not** inherit
the web service's environment. The rake needs `GOOGLE_TRANSLATE_TOKEN`, and only
`lingolinq-scheduler-staging` mounts it from Secret Manager; `lingolinq-migrate-staging` does not
(verified 2026-09-14). Borrowing the scheduler job is safe because `--args` and
`--update-env-vars` on `gcloud run jobs execute` are **execution-scoped overrides**: they create an
execution with the merged values and leave the stored job definition untouched. Verified after the
2026-09-14 dry run, where the job's args were still `exec rake scheduler:dispatch` and none of
`DRY_RUN`, `DEST_LANG` or `SCOPE` had been added to it.

## Deploy gate

The execution runs whatever image is currently on `lingolinq-scheduler-staging`. Merge to
`develop`, let it promote to `staging`, and wait for a green deploy that includes
`lib/library_board_translator.rb` before executing. Confirm the image first:

```bash
gcloud run jobs describe lingolinq-scheduler-staging \
  --project lingolinq-nonprod --region us-central1 \
  --format='value(spec.template.spec.template.spec.containers[0].image)'
```

Writes go onto `lingolinq/*` in the shared staging/dev database. User-owned copies are not updated until those users recopy.

Staging Cloud Run services run with `RAILS_ENV=production`, so a live run needs `ALLOW_PROD_TRANSLATE=1`. `SCOPE=seed` also needs `TRANSLATE_CONFIRM=1`. A dry run needs neither: `assert_production_ok!` returns early when `dry_run` is set (`lib/library_board_translator.rb:204`). The rake prints the target user and database name before writing.

`FORCE` is not a flag. A re-run overwrites dest hashes without changing English labels. Do not set `force_update_default`.

## Commands

No API key to export. `gcloud` uses your own credentials, and the token the rake needs is already mounted on the job from Secret Manager.

Dry run (lists roots, no Google calls, no writes):

```bash
gcloud run jobs execute lingolinq-scheduler-staging \
  --project lingolinq-nonprod --region us-central1 --wait \
  --args=exec,rake,lingolinq:translate_library_boards \
  --update-env-vars=DRY_RUN=1,DEST_LANG=es,SCOPE=seed
```

Real translate:

```bash
gcloud run jobs execute lingolinq-scheduler-staging \
  --project lingolinq-nonprod --region us-central1 --wait \
  --args=exec,rake,lingolinq:translate_library_boards \
  --update-env-vars=ALLOW_PROD_TRANSLATE=1,TRANSLATE_CONFIRM=1,DEST_LANG=es,SCOPE=seed
```

`--wait` blocks until the execution finishes and exits non-zero if it fails. Expect several
minutes: in the 2026-09-14 dry run the container took 2m35s to start before the rake began.
Drop `--wait` for `--async` if you would rather poll.

## Watching it

`--wait` prints progress but not the rake's own output. Read that from the execution's logs, using
the execution name that `jobs execute` prints:

```bash
gcloud logging read \
  'resource.type=cloud_run_job
   AND resource.labels.job_name=lingolinq-scheduler-staging
   AND labels."run.googleapis.com/execution_name"="<EXECUTION_NAME>"' \
  --project lingolinq-nonprod --limit 200 --freshness=1h \
  --format='value(textPayload)'
```

Dry run prints `[DRY RUN] lingolinq/...` lines then `Dry run: N root(s) would be translated, M skipped.`
The live run prints `boards=N strings=M` per root. The CSV under `tmp/` is discarded when the
container exits; the logs are the durable record.

Do not run this against production.
