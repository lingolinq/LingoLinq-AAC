# LingoLinq Infrastructure Guide

This document describes the deployment architecture for LingoLinq-AAC. AI agents
(Claude Code, Codex, Copilot) and people should read it before making any
infrastructure change. Last rewritten 2026-09-12 after the Render decommission; the
deploy pipeline itself is the source of truth for anything this page and
`.github/workflows/deploy-cloudrun.yml` disagree on.

## Owner

- **User:** Scot Wahlquist (swahlquist), scot@lingolinq.com
- **GitHub:** lingolinq/LingoLinq-AAC
- **License:** AGPLv3

## Hosting summary

Everything runs on Google Cloud Platform. The Render workspace that hosted the app until
the 2026-07-22 cutover was deleted on 2026-09-09; nothing at `*.onrender.com` belongs to
LingoLinq any more and those hostnames must not be referenced (they are re-registrable
by third parties). Final Render database archives, restore-verified 2026-09-08, live in
`gs://lingolinq-prod-render-archive` under a one-year retention policy (see
`RESTORE-MANIFEST-2026-09-08.md` at that bucket's root).

| Environment | Branch | GCP project | Hostname | Notes |
|---|---|---|---|---|
| production | `main` | `lingolinq-prod` | `app.lingolinq.com` (`lingolinq.com` and `www` 301 to it) | approval-gated deploy |
| staging | `staging` | `lingolinq-nonprod` | `staging.lingolinq.com` | unattended deploy |
| dev | `develop` | `lingolinq-nonprod` | `dev.lingolinq.com` | unattended deploy |
| n8n | n/a | `lingolinq-nonprod` | `n8n.lingolinq.com` | automation; GitHub webhooks and Google Chat point here |

The three nonprod hostnames are Cloud Run domain mappings; the `*.run.app` service
URLs also work and some n8n workflows still use them. Both forms are valid.

## Production architecture

```
app.lingolinq.com
      |
      v
Global HTTPS load balancer (lingolinq-lb-ip: 136.68.41.122) + Cloud Armor
      |
      v
Cloud Run service lingolinq-web
      |
      +--> Cloud SQL PostgreSQL (lingolinq-prod-pg, private IP)
      +--> Memorystore Redis (lingolinq-prod-redis, TLS / rediss://)
      +--> AWS S3 + CloudFront (uploads and media)

Cloud Run worker pool lingolinq-worker  (Resque: priority, default, slow; see the
                                         `whenever` note under Background jobs)
Cloud Run job lingolinq-migrate         (db:migrate before each web rollout)
Cloud Run job lingolinq-scheduler       (scheduled rake tasks; see below)
```

| Resource | Type | Purpose |
|---|---|---|
| `lingolinq-web` | Cloud Run service | Rails web app behind the load balancer |
| `lingolinq-worker` | Cloud Run worker pool | Resque workers |
| `lingolinq-migrate` | Cloud Run job | runs migrations; also the recipe for one-off `rails runner` work (override args, `USER_KEY` required) |
| `lingolinq-scheduler` | Cloud Run job | scheduled rake tasks. The job is deployed on every release; whether Cloud Scheduler triggers are attached must be verified live (`gcloud scheduler jobs list`) before assuming the tasks run |
| `lingolinq-prod-pg` | Cloud SQL PostgreSQL | private-IP only |
| `lingolinq-prod-redis` | Memorystore Redis | TLS; app connects with `rediss://` |
| `lingolinq-lb-ip` | global address | `136.68.41.122` |
| Google-managed certificate | SSL | `app.lingolinq.com`; recreate a cert stuck in `FAILED_NOT_VISIBLE` before touching DNS |

Secrets are read from GCP Secret Manager by name (`--set-secrets` in the deploy
workflow). The list each project must hold is in the workflow header. Authentication
from GitHub Actions is keyless (Workload Identity Federation); production's provider
admits only `refs/heads/main`, nonprod's only `refs/heads/staging` and
`refs/heads/develop`.

## Staging and dev (nonprod)

Staging and dev share one project (`lingolinq-nonprod`), one Cloud SQL database, one
Redis, one Secret Manager secret set, and ONE worker pool (`lingolinq-worker-staging`)
that runs the staging image. Resources carry a `-staging` or `-dev` suffix. Consequences:

- A job-class, argument-shape, or queue change on `develop` is not runnable until it
  merges to `staging`; dispatching it from dev enqueues work the staging worker cannot
  process.
- A `develop` migration lands in the database staging serves. Migrations must be
  expand-contract everywhere, and a destructive migration on `develop` breaks staging
  immediately.
- Dev deploys the web service and runs its own migrate Job but never a worker pool or
  scheduler (gated on the `DEPLOY_WORKER` environment variable).

## Deploy pipeline

`.github/workflows/deploy-cloudrun.yml` runs on push to `main`, `staging`, and
`develop`. A push to `main` creates a production deployment that proceeds once a
reviewer approves it in the `production` GitHub environment. Order: migrate Job, then a
new web revision with no traffic, two consecutive health probes on its tagged URL,
traffic pinned to that revision by name, then the worker pool is replaced. Rollback is a
`gcloud run services update-traffic ... --to-revisions <name>=100` (see the PR
template); it never rolls the schema back, which is why migrations are expand-contract.

Hotfix branches may merge directly into `main`; what makes automatic deploy safe is the
set of required checks on `main` (with `enforce_admins` on), the environment approval,
the WIF ref conditions, and the candidate rollout, not branch provenance.

## AWS (account 239044785114)

- IAM user `lingolinq-app` for the Rails app: S3 read/write only; Cloud Run uses a
  separate least-privilege IAM user minted in `scripts/gcp/iam/`.
- Buckets: `lingolinq-prod-uploads`, `lingolinq-dev-uploads`,
  `lingolinq-staging-uploads`, `lingolinq-uploads` (legacy), `lingolinq-*-static`,
  `lingolinq-logs-*`. Upload buckets: ACLs disabled (BucketOwnerEnforced; the app's
  `acl: public-read` is ignored), public read policy on `*`, versioning on. CORS is
  pinned to the app hostnames of the cutover; re-check every bucket whenever a hostname
  changes.
- Prefixes: `images/*`, `sounds/*`, `downloads/*`, `extras*/*`, `imports/*`.
- CloudFront (`UPLOADS_S3_CDN`) fronts production uploads.
- Other AWS integrations: SES (email), SNS (notifications), Elastic Transcoder (media),
  Bedrock (runtime AI; credentials provisioned separately from developer tooling).

## Background jobs (Resque)

Queues: `priority` (board downloads/exports, Progress actions, translations), `default`,
`slow` (transcoding, large imports, button-set updates). Worker start command:

```
env QUEUES=priority,default,slow INTERVAL=0.1 TERM_CHILD=1 bundle exec rake environment resque:work
```

A fourth queue, `whenever`, exists in code: `app/models/user.rb` (`track_boards`),
`app/models/log_session.rb` (`update_board_connections`) and `lib/uploader.rb` enqueue onto it
instead of `slow` when `RedisInit.queue_pressure?` is true. The Procfile's `resque_slow`
process drains it, but the Cloud Run entrypoint (`bin/docker-worker-entrypoint`) defaults
`QUEUES` to the three above and the deploy workflow does not override it, so on Cloud Run
nothing is known to drain `whenever`. Unverified live (check the Redis queue length and the
worker service's `QUEUES` env); if confirmed, that is an operational defect, not a doc one.

Cloud Run sends SIGTERM with a short grace period; the BoyBand wrapper requeues
in-flight jobs, so non-idempotent jobs can run twice.

Board download flow: UI POSTs `/api/v1/boards/:id/download`; `BoardsController#download`
calls `Progress.schedule(board, :generate_download, ...)` onto `priority`; the worker
runs `Board#generate_download` through `Converters::Utils.board_to_remote`; the file
lands under `downloads/` and the UI polls the progress URL.

Common issues: stuck at "Initializing..." means no worker is draining the queue (wrong
database, wrong Redis namespace, or worker down); S3 access denied on images means a
bucket policy narrower than `*`; silent job failures sit in the Resque failed queue
(`RedisInit.errors` in a console).

Redis namespace isolation uses `REDIS_NAMESPACE_SUFFIX` (`config/initializers/resque.rb`);
staging and dev share `-dev` on the nonprod Redis.

## Console and one-off work

Use `bin/audit_console` from a Cloud Run exec shell or through the `lingolinq-migrate`
job with overridden args. It sets `USER_KEY`, which the audited-session control requires
in production and which attributes record writes via PaperTrail. `rake`, other
`bin/rails` subcommands, and `psql` are not audited; prefer the console.

## Key environment variables

Required for each web service and its worker: `DATABASE_URL`, `REDIS_URL`,
`REDIS_NAMESPACE_SUFFIX`, `RAILS_ENV` / `RACK_ENV`, `RAILS_MASTER_KEY`, `AWS_KEY` /
`AWS_SECRET`, `UPLOADS_S3_BUCKET`, `STATIC_S3_BUCKET`, `DEFAULT_HOST`,
`SECRET_KEY_BASE`, `SECURE_ENCRYPTION_KEY`, `SECURE_NONCE_KEY`, `COOKIE_KEY`. See
`.env.example` for the full list and the deploy workflow header for which are secrets.

## Development environment

WSL2; Ruby 3.4.4 (`.ruby-version`); Node 22 (`.nvmrc`); Ember 5.12; Rails per Gemfile;
Bundler and npm. AI tooling: Claude Code (rules in `CLAUDE.md`), Codex (`AGENTS.md`),
Copilot (`.github/copilot-instructions.md`); project MCP servers in `.mcp.json`.

## Critical warnings

- `jquery-integration` is `false` in `app/frontend/config/optional-features.json`; do
  not turn it on (it reintroduces a `Component.reopen` deprecation).
- Never commit secrets; reference Secret Manager and 1Password names.
- Feature flags are required for new user-facing features.
- S3 bucket policies must cover `*`, not just `downloads/*`.
- A worker whose `DATABASE_URL` does not match its web service silently fails every job.
