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

### SES events and alarms

- **Pipeline.** Every environment sets `SES_CONFIGURATION_SET=lingolinq-transactional`
  (`APP_ENV_VARS_STATIC` in `deploy-cloudrun.yml`), so `SesConfigurationSetInterceptor`
  (`config/initializers/amazon_ses.rb`) tags all mail, staging included. The configuration
  set publishes SEND, REJECT, BOUNCE, COMPLAINT, DELIVERY and DELIVERY_DELAY to SNS topic
  `lingolinq-ses-events` (us-west-2). Two SQS queues subscribe to it:
  - `lingolinq-ses-events`: every event, 14-day retention, no raw delivery. Nothing reads
    it: it is the per-message delivery record finding LL-42a24ee911 asked for. Provisioned
    by `scripts/gcp/phase5-ses-config-set-setup.sh`.
  - `lingolinq-ses-feedback`: only Bounce and Complaint (`FilterPolicyScope=MessageBody`,
    `FilterPolicy {"eventType":["Bounce","Complaint"]}`), 14-day retention, raw delivery
    off, with dead-letter queue `lingolinq-ses-feedback-dlq` after 24 receives (about a day
    of hourly runs). Provisioned by `scripts/gcp/ses-feedback-queue-setup.sh`
    (`--dry-run`, `--apply`, `--check`).
- **Consumer.** `SesEventsWorker` (`app/workers/ses_events_worker.rb`) reads
  `lingolinq-ses-feedback` in the hourly block of `scheduler:dispatch`, up to 100 receives
  of 10 messages per run. Permanent bounces (every subtype, including
  `OnAccountSuppressionList`) call `UserMailer.bounce_email`, which turns email off for
  every user with that address and records `email_disabled_reason: 'bounce'` and
  `email_disabled_at` (only when the flag goes from off to on; PaperTrail whodunnit
  `system:ses-events`). An account already off for another reason is left alone.
  Complaints are counted but not acted on (owner decision, 2026-11-09). Transient bounces
  are deleted without action. Malformed messages are counted and deleted. A message whose
  handling raised stays on the queue for the next run, and the task then fails so the
  execution goes red. Logs carry counts and event types only. Parsing:
  `app/models/ses_event.rb`. Changing a user's email to a different address clears the
  flag, reason and time (`User#process_params`).
- **Env var.** `SES_EVENTS_QUEUE_URL` (GitHub environment variable
  `APP_SES_EVENTS_QUEUE_URL`), optional; unset means the worker is a no-op. Set it in the
  **production** environment only: staging events reach the same queues, and two
  consumers would split one. A production consumer acting on a staging bounce is
  accepted, because a permanent bounce is a property of the mailbox. Value after rollout:
  `https://sqs.us-west-2.amazonaws.com/239044785114/lingolinq-ses-feedback`. Never set it
  by hand on the service or Job; the next deploy's `--set-env-vars` removes it.
- **IAM.** `scripts/gcp/iam/lingolinq-cloudrun-s3-ses-policy.json` statement
  `SQSConsumeSesEventsQueue` grants `sqs:ReceiveMessage`, `sqs:DeleteMessage` (also covers
  `DeleteMessageBatch`) and `sqs:GetQueueAttributes` to `lingolinq-cloudrun-prod`. During
  the rollout it lists both queues; the last rollout step removes `lingolinq-ses-events`.
  The repo file is a mirror; apply it as a new policy version.
- **Alarms.** `scripts/gcp/ses-reputation-alarms.sh` (`--dry-run`, `--apply`, `--check`)
  creates SNS topic `lingolinq-ses-alarms` with an email subscription (recipient from
  `ALARM_EMAIL` or `--email`) and five CloudWatch alarms: `Reputation.BounceRate >= 0.02`
  (AWS reviews at 5%, may pause at 10%), `Reputation.ComplaintRate >= 0.0005` (AWS reviews
  at 0.1%, may pause at 0.5%), `ApproximateAgeOfOldestMessage >= 3h` on
  `lingolinq-ses-feedback` (the consumer is not draining it), any message on the DLQ, and
  `NumberOfNotificationsFailed >= 1` on the topic (SNS could not deliver to a queue and
  does not retry). The stale alarm does not catch one message that keeps failing (SQS
  drops a message received 3 or more times from that metric); the DLQ alarm does. The
  subscription delivers nothing until its confirmation link is clicked.
- **Send-failure alert (GCP).** `scripts/gcp/prod-mail-failure-alert.{json,sh}`
  (`--check`, `--apply`): a log-match policy on `[inactivity sweep] mail stopped` and
  `SES delivery failed` from the scheduler Job, the web service and the worker pool, on the
  scheduler liveness alert's proven channel. It does not cover other errors from queued
  mail (password reset, consent and notification mail run as Resque jobs): those raise into
  the job and land only in Resque's Redis failed list, with no log line. Confirm once that
  app logs are `textPayload` (the command is in the script header).
- **Moving messages out of the DLQ.** After fixing the cause, an admin principal runs
  `aws sqs start-message-move-task --source-arn arn:aws:sqs:us-west-2:239044785114:lingolinq-ses-feedback-dlq --region us-west-2`
  (no destination: messages go back to the queue they came from), and checks progress with
  `aws sqs list-message-move-tasks --source-arn <same>`. A DLQ message keeps its original
  enqueue time, so it expires 14 days after SES published it. Do not inspect it with
  `receive-message`: each receive counts.
- **What `email_disabled` suppresses**: every mail sent through `General#mail_message` via
  `Notifiable#channels_for`, except `password_changed`, `email_changed`,
  `email_changed_prior_address` and `forgot_password`. `Api::UsersController#forgot_password`
  sends a reset to an account whose email a bounce turned off (owner decision, 2026-11-09)
  and to no other disabled account; demo logins carry reason `demo`
  (`DemoDistrict::Seeder.disable_email!`). The inactivity sweep still proceeds for an
  account whose notice is not sent, and writes AuditEvent `inactivity_notice_not_sent` with
  the step and reason (`email_disabled` or `no_address`). Mail sent with `mail(...)`
  directly (parental consent, `login_no_user`, `utterance_share`, `lesson_assigned`, admin
  mail) is not gated. Full list: `docs/task-management/2026-10-14_ses-bounce-handling.md`.

**Production rollout order** (each step only after the one before it is verified):

1. `scripts/gcp/ses-feedback-queue-setup.sh --dry-run`, then `--apply`, then `--check`
   (admin principal). From here the new queue collects bounces and complaints; the old
   queue keeps everything.
2. Apply the IAM policy (both queues) as a new default version of `lingolinq-cloudrun-s3-ses`
   (admin principal with MFA; see `scripts/gcp/iam/README.md`). Diff the live default
   version against the repo file first, then
   `aws iam create-policy-version --policy-arn arn:aws:iam::239044785114:policy/lingolinq-cloudrun-s3-ses --policy-document file://lingolinq-cloudrun-s3-ses-policy.json --set-as-default`.
   A managed policy keeps at most five versions; delete the oldest non-default one first if
   needed.
3. **Gate:** read the SES account's suppression setting:
   `aws sesv2 get-account --region us-west-2 --query SuppressionAttributes`. Do not go on
   until the owner has seen the answer. If `BOUNCE` is listed, SES drops mail to a suppressed
   address without sending it (and without counting it against reputation), so the reset a
   bounce-disabled user asks for will not arrive. If `BOUNCE` is NOT listed, every reset to a
   bounced address is a new hard bounce that counts toward `Reputation.BounceRate`; resets
   are capped at 6 per account per window (`Passwords#generate_password_reset`), but the
   owner decides whether that is acceptable before the code ships.
4. Merge and release the code to `main`. With the variable unset, the scheduler logs
   `process_ses_events ... skipped`.
5. Drain the old queue's backlog once: set `APP_SES_EVENTS_QUEUE_URL` in the `production`
   environment to the OLD queue
   (`https://sqs.us-west-2.amazonaws.com/239044785114/lingolinq-ses-events`) and deploy.
   Watch the hourly `[process_ses_events]` and `[SES events]` lines until a run shows
   `failed 0` and receives fewer than 1000 messages. Real bounces in the backlog will turn
   those users' email off. This run deletes the old queue's messages, the one time it does.
6. Switch the variable to `lingolinq-ses-feedback` and deploy. Events published since step 1
   were on both queues; handling one twice is harmless (`bounce_email` skips an account
   already off).
7. `ALARM_EMAIL=<address> scripts/gcp/ses-reputation-alarms.sh --dry-run`, then `--apply`,
   click the confirmation link, and run `--check`.
8. `scripts/gcp/prod-mail-failure-alert.sh --apply`, then `--check`, after confirming the
   `textPayload` assumption in its header.
9. Remove `lingolinq-ses-events` from the IAM statement (repo file and a new policy version)
   once a run on the new queue shows `failed 0`.

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

Seeds and board imports (`db:seed`, the `lingolinq:import_*` and `openaac:` tasks) upload
pictures, so they run where the app's full environment is: the scheduler Job pattern
(`docs/ops/staging-translate-library-job.md`), not a boot-secrets-only migrate Job. In a
deployed environment without S3 the importer refuses before creating any board
(`Uploader.ensure_deployed_uploads_configured!`, lingolinq_mobile#3).

Redis namespace isolation uses `REDIS_NAMESPACE_SUFFIX` (`config/initializers/resque.rb`);
staging and dev share `-dev` on the nonprod Redis.

## Console and one-off work

Use `bin/audit_console` from a Cloud Run exec shell or through the `lingolinq-migrate`
job with overridden args. It sets `USER_KEY`, which the audited-session control requires
in production and which attributes record writes via PaperTrail. `rake`, other
`bin/rails` subcommands, and `psql` are not audited; prefer the console.

The migrate Job carries the workers' `REDIS_NAMESPACE_SUFFIX`, and the deploy refuses to run it
when its suffix differs from the draining worker pool's (in dev, staging's shared pool). Before
that change, nonprod migrate Jobs had no suffix, so every job a one-off run enqueued went to the
`lingolinq` namespace, which no nonprod worker reads (lingolinq_mobile#3). The fix reaches each
Job at its next deploy, and `lingolinq-migrate-staging` only once the workflow change is on
`staging`. `lingolinq-migrate-dev` runs the develop image while the shared worker runs staging's,
so a one-off there that enqueues a job class or arguments that exist only on develop fails on
the worker; use `lingolinq-migrate-staging` for one-offs whose code is on staging.

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
