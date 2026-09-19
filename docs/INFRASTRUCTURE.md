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

Cloud Run worker pool lingolinq-worker  (Resque: priority, default, slow, whenever)
Cloud Run job lingolinq-migrate         (db:migrate before each web rollout)
Cloud Run job lingolinq-scheduler       (scheduled rake tasks; see below)
```

| Resource | Type | Purpose |
|---|---|---|
| `lingolinq-web` | Cloud Run service | Rails web app behind the load balancer |
| `lingolinq-worker` | Cloud Run worker pool | Resque workers |
| `lingolinq-migrate` | Cloud Run job | runs migrations; also the recipe for one-off `rails runner` work (override args, `USER_KEY` required) |
| `lingolinq-scheduler` | Cloud Run job | scheduled rake tasks. The job is deployed on every release; whether Cloud Scheduler triggers are attached must be verified live (`gcloud scheduler jobs list`) before assuming the tasks run. Missed-run detection: see "Scheduler liveness" below |
| `lingolinq-prod-pg` | Cloud SQL PostgreSQL | private-IP only |
| `lingolinq-prod-redis` | Memorystore Redis | TLS; app connects with `rediss://` |
| `lingolinq-lb-ip` | global address | `136.68.41.122` |
| Google-managed certificate | SSL | `app.lingolinq.com`; recreate a cert stuck in `FAILED_NOT_VISIBLE` before touching DNS |

### Scheduler liveness (missed-run detection)

Production alerting can see a scheduler run that FAILS. Until this was added it could not
see one that never happened, and those are different events: `PROD Cloud Run job execution
FAILED` filters on `metric.label.result="failed"`, and a run that does not happen produces
no execution to count.

That gap was not theoretical. From 2026-07-21 (the day before the GCP cutover, when the
Render cron was suspended) to 2026-09-02, `scheduler:dispatch` was not run by the scheduler,
and nothing alerted. The retention, purge, flush and expiry tasks it dispatches, including
`Flusher.flush_deleted_users` (a GDPR Art. 17 concern), were not run by it either. Whether
any ran by another route is not established; see
`docs/legal/2026-09-14_scheduler-dispatch-interruption-and-restoration.md`. Findings
`LL-3e36a18199` (closed on this control) and `LL-cbc8bc4211` (the impact assessment).

The detector is a Cloud Monitoring **metric-absence** policy on
`run.googleapis.com/job/completed_execution_count` for the `lingolinq-scheduler` job in `us-central1`,
firing after 90 minutes with no completed execution, with a reminder every 24 hours while
the incident stays open. Across 398 completed executions from 2026-09-02 to 2026-09-19 the
longest gap between completions was 69.7 minutes, so 90 minutes leaves about 20 minutes of
headroom. It is not immune to false alarms: the task timeout is 3000s, so one execution
finishing more than about 30 minutes later than usual can trip it. The window is deliberately
far shorter than a day, because the 06:00 UTC daily block carries the retention work and has
no catch-up.

```bash
scripts/gcp/prod-scheduler-liveness-alert.sh --check   # read-only; exit 0 OK, 1 FAIL, 3 NOT YET ARMED
scripts/gcp/prod-scheduler-liveness-alert.sh --apply   # create or update it (WRITES to prod)
```

`--check` compares the live policy with the committed definition in
`scripts/gcp/prod-scheduler-liveness-alert.json`: condition, channel, runbook text and
reminders. It requires exactly one policy with that exact name and an enabled channel.

**Limits of metric absence (Google's documented behaviour).**

- **It cannot fire until it has seen a data point after it was installed or last modified.**
  Re-applying while the scheduler is already stopped leaves it silent. `--check` reports that
  state as NOT YET ARMED.
- **Metrics of deleted resources are not considered.** If the `lingolinq-scheduler` job itself
  is deleted, this alert stays silent, and so does the FAILED policy. A job-independent second
  control, for example on Cloud Scheduler attempt errors, is an open follow-up.

**Delivery, proven 2026-09-18.** The policy was applied that day
(`alertPolicies/16889750021495574173`). To prove the email channel it notifies actually
delivers, a temporary threshold policy on the same channel was created to fire at once on the
healthy state (a completed execution in the last hour). Scot confirmed the email arrived, and the
temporary policy was deleted. The Cloud Monitoring API has no "send test notification" method,
which is why a firing policy was used. All four production policies notify that same channel
(`notificationChannels/2035727736516782378`), so this proves delivery for each of them at the
channel level. `--check` fails if the channel has been changed since that proof
(`DELIVERY_PROVEN_AT` in the script); re-prove delivery the same way, then update it.

**Firing, proven 2026-09-19, without an outage.** A temporary copy of the policy with the same
filter and aggregation, a 30-minute window and no notification channel was created at
06:17:57Z. The last completed execution before it was at 06:02:56Z. The copy opened incident
`0.oct1kkuk1c7n` at 06:42:53Z, while production was healthy and simply between hourly runs, and
closed it at 06:24 past the next hour (07:06:24Z), after the 07:01:22Z execution completed. The
temporary policy was then deleted. This shows the absence condition both fires and clears on this
metric. It also showed that a data point written shortly before a policy change arms it, which is
the rule `--check` uses. The filter was later scoped to `us-central1`. A read-only
time-series query showed it selects the same single series with the same points, so the result
carries over.

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
- Other AWS integrations: SES (email), SNS (notifications), MediaConvert (media; Elastic Transcoder was discontinued 2025-11-13),
  Bedrock (runtime AI; credentials provisioned separately from developer tooling).
- MediaConvert (issues #966, #981): `lib/transcoder.rb` submits jobs only when
  `MEDIACONVERT_ROLE_ARN` and `UPLOADS_S3_BUCKET` are set. `MEDIACONVERT_QUEUE_ARN` is
  optional in nonprod (omit = account Default queue) and required in production so jobs
  cannot land on the shared nonprod queue. `MEDIACONVERT_ENDPOINT` is optional. Completion
  is EventBridge -> SNS -> `POST /api/v1/callback`. Subscription confirmation needs
  `SNS_ARNS` (one topic ARN per environment; the deploy shape check rejects commas) and
  `SNS_REGION` on the web service. Those GitHub vars are `APP_SNS_ARNS` and
  `APP_SNS_REGION` in `deploy-cloudrun.yml`. Applied IAM documents live in
  `scripts/gcp/iam/`. Staging uses `lingolinq-dev-uploads`; subscribe only the staging
  host on the nonprod topic (staging and dev share one database). Convert_* still logs
  and returns false when the Role is unset.

## Background jobs (Resque)

Queues: `priority` (board downloads/exports, Progress actions, translations), `default`,
`slow` (transcoding, large imports, button-set updates), `whenever` (overflow:
`User#track_boards` under `any_queue_pressure?`, `LogSession#update_board_connections`
under `queue_pressure?`, LessonPix batch image cache, daily `BoardContent.link_clones`).
Worker start command:

```
env QUEUES=priority,default,slow,whenever INTERVAL=0.1 TERM_CHILD=1 bundle exec rake environment resque:work
```

Keep `whenever` last so Resque prefers the other three. The Cloud Run entrypoint
(`bin/docker-worker-entrypoint`) defaults `QUEUES` to this list; the deploy workflow
does not override it. Do not set `QUEUES` by hand on the live worker pool: the next
deploy uses `--set-env-vars`, which replaces the whole set. Local `Procfile`
`resque_slow` uses the same four queues.

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
