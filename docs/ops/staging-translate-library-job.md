# Render staging job: translate seeded library boards

Run `rake lingolinq:translate_library_boards` with `SCOPE=seed DEST_LANG=es` on Render **staging** (`lingolinq-staging`) as a one-off job. Do not add this to `render.yaml` as a cron. Creating the job starts it.

This does not delete boards. It stores dest-locale hashes on the existing English `lingolinq` boards (`translate_set` with `default: false`). English stays the visible default.

## What `SCOPE=seed` covers

Listed public roots owned by content user `lingolinq` after a library reindex (starter + sidebar + crisis + Senner + curated S3 + OpenAAC). Linked children are `unlisted` and are translated by the tree walk from those roots.

After a full reindex that is about 32 listed public roots (on the order of 1359 boards in the trees). Skipped:

- `*-es` Spanish copies
- boards whose default locale is not English

Without `SCOPE`, the rake still uses signup slugs only (Quick Core 60, Vocal Flair 60/84, crisis, Senner, yes/no, inflections).

## Service

| Field | Value |
|---|---|
| Name | `lingolinq-staging` |
| ID | `srv-d510c13e5dus73c8lg10` |
| Jobs page | https://dashboard.render.com/web/srv-d510c13e5dus73c8lg10/jobs |
| Branch | `staging` (the rake must be in the currently deployed image) |
| Database | `lingolinq-dev-staging-db` — shared with `lingolinq-dev` |
| Plan | `plan-srv-008` (Standard, 2 GB) |

## Deploy gate

The job runs the image already on `lingolinq-staging`. Merge `feat/melissa-library-board-locales` to `staging` and wait for a green deploy that includes `lib/library_board_translator.rb` before creating the job.

Dashboard Environment must already have `GOOGLE_TRANSLATE_TOKEN`. The job inherits web-service env. A missing or `op://` token raises. Do not put the token in `startCommand`.

Writes go onto `lingolinq/*` in the shared staging/dev database. User-owned copies are not updated until those users recopy.

Staging web services use `RAILS_ENV=production`, so a live run needs `ALLOW_PROD_TRANSLATE=1`. `SCOPE=seed` also needs `TRANSLATE_CONFIRM=1`. Dry run does not. The rake prints the target user and database name before writing.

`FORCE` is not a flag. A re-run overwrites dest hashes without changing English labels. Do not set `force_update_default`.

## Commands

`RENDER_API_KEY` is `op://LingoLinq Prod/RENDER_API_KEY/credential` (not the Admin vault). Do not echo the key.

Dry run (lists roots, no Google):

```bash
export RENDER_API_KEY="$(op read 'op://LingoLinq Prod/RENDER_API_KEY/credential')"
STAGING_SRV=srv-d510c13e5dus73c8lg10

curl --request POST "https://api.render.com/v1/services/${STAGING_SRV}/jobs" \
  --header "Authorization: Bearer ${RENDER_API_KEY}" \
  --header "Content-Type: application/json" \
  --data-raw '{
    "startCommand": "DRY_RUN=1 DEST_LANG=es SCOPE=seed bundle exec rake lingolinq:translate_library_boards",
    "planId": "plan-srv-008"
  }'
```

Real translate:

```bash
curl --request POST "https://api.render.com/v1/services/${STAGING_SRV}/jobs" \
  --header "Authorization: Bearer ${RENDER_API_KEY}" \
  --header "Content-Type: application/json" \
  --data-raw '{
    "startCommand": "ALLOW_PROD_TRANSLATE=1 TRANSLATE_CONFIRM=1 DEST_LANG=es SCOPE=seed bundle exec rake lingolinq:translate_library_boards",
    "planId": "plan-srv-008"
  }'
```

Watch logs on the Jobs page. Dry run should print `[DRY RUN] lingolinq/...` lines then `Dry run: N root(s) would be translated`. The live run prints `boards=N strings=M` per root. The CSV under `tmp/` is discarded when the job container exits; the logs are the durable record.

Do not run this against `lingolinq-prod`.
