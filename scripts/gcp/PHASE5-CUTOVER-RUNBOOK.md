# Phase 5 Production Cutover Runbook (Render -> GCP Cloud Run)

LingoLinq-AAC. This is tracker item **4.3** ("write the cutover runbook"): the operator
procedure for the **production cutover** (tracker Phase 5), built on top of the data-layer
steps already shipped in `scripts/gcp/PHASE4-CUTOVER-DATA-RUNBOOK.md` (S1 setval + S2 secret
preservation).

> **Status: the DNS cutover is DONE** (cut 2026-07-22, re-verified 2026-08-09), **and prod
> holds no real users yet.** Both points are detailed further down this block; the remaining
> gates are Cloud Run ingress, the Cloud Armor preview-to-enforce flip, and Render decommission.
>
> The rest of this block is the 2026-07-15 pre-cutover snapshot, kept for history. Read it as a
> record of what was true then, not as open work. At that point the GCP stack was stood up and
> healthy on CURRENT `main` and the irreversible cutover actions remained gated on Scot's
> explicit go. The clean-DB rehearsal ran
> and passed (schema load + seed + Redis-TLS handshake, 2026-06-29; five-path smoke re-run
> 2026-07-02/04 - see the checklist), and a fresh deploy from current `main` (image `f7e89fe2d`,
> the Dockerfile npm-pin fix #594) redeployed `lingolinq-web` + `lingolinq-worker` and re-ran the
> `db:migrate` Job cleanly. Verified live 2026-07-15: Cloud SQL `lingolinq-prod-pg` RUNNABLE,
> Memorystore `lingolinq-prod-redis` READY (TLS), web serving HTTP 200 (`/api/v1/token_check`
> hits the DB and returns 200), worker pool Ready. The external HTTPS LB + Cloud Armor front end
> **is built and provisioned in preview** (step 8): LB IP `136.68.41.122`, policy `lingolinq-armor`
> with WAF rules 1001-1004 (`deny 403`) + rate-limit 2000 all in `preview=true` (log-only, not
> enforcing), verified live 2026-07-15. **THE DNS CUT HAS HAPPENED (step 9 is DONE).** Verified
> 2026-08-09: `app.lingolinq.com` resolves to `136.68.41.122` (the `lingolinq-https-fr` forwarding
> rule) and `/api/v1/health` returns 200 through the LB. Step 9 and the "NXDOMAIN / create the
> record" instructions below are historical, not to-do. The body at line ~634 records the cutover
> itself as 2026-07-22; 2026-08-09 is only the date this was re-verified.
>
> **PROD HAS NO REAL USERS YET (Scot, 2026-08-09).** DNS being cut does not mean launched. The
> LB path serves and `app.lingolinq.com` is live, but the only accounts on it are internal and
> test. The other statements throughout this file that prod holds no real user data are CORRECT;
> an earlier version of this block said "real district traffic is on GCP", which was inferred
> from DNS resolving plus a 200 health check and was wrong. Prod is the environment that WILL
> hold real districts; it does not yet, and it will not while migration issues are being worked.
>
> **What that buys, and what it does not.** It means the residual risks below are operational,
> not FERPA/HIPAA incidents, and it makes this the cheapest possible window to exercise anything
> risky, including the first run of the automated deploy pipeline. It does NOT make any of them
> permanently acceptable. Everything in the next block is a hard gate on onboarding the first
> real district, not a nice-to-have:
>
> - [ ] Rotate `lingolinq_admin` off the deliberately simple password. Its stated justification
>       ("no real user data") expires the moment a real district exists, and the account will
>       outlive the justification unless this is done deliberately.
> - [ ] Ingress lockdown (`--ingress=internal-and-cloud-load-balancing`). Until then the
>       `run.app` URL and any revision tag bypass the LB and Cloud Armor entirely. Read the
>       coupling note in `scripts/gcp/phase5-frontend-lb.sh` first: it breaks the deploy
>       pipeline's health probe.
> - [ ] WAF enforce flip (9c). Rules 1001-1004 and 2000 are still `preview=true` / log-only.
> - [ ] Cloud SQL `deletionProtection` on, and a pre-migration backup step in the deploy path.
> - [ ] The unchecked `- [ ]` boxes in the pre-cutover checklist near the end of this file
>       (DNS TTL lowered, operator quiet window, external writers enumerated and pause-tested,
>       client 503 re-queue confirmed). The cut having happened does NOT mean those were all
>       satisfied first; the checklist boxes remain authoritative.
>
> Treat that list as the launch gate. Once a real district is onboarded, every item on it turns
> from an operational nicety into a Tier 1 compliance obligation.
>
> **What is still gated and has NOT run:** the ingress lockdown (the web service is still
> `--ingress=all`, so the `run.app` URL bypasses the LB and Cloud Armor entirely), the WAF
> **enforce** flip (9c), and the Render decommission (9b). Those remain the HIPAA-relevant,
> hard-to-reverse actions; nothing in that set runs before sign-off, and those constraints (no
> Cloud Armor enforce, no ingress lockdown, no Render/SES changes) stay in force until explicitly
> lifted. Before the ingress lockdown specifically, read the coupling note at the LOCKDOWN GATE in
> `scripts/gcp/phase5-frontend-lb.sh`: it breaks the deploy pipeline's health probe.

> **Finding references in this runbook.** `audit-reports/FINDINGS.json` is the single source of
> truth for the status of any `LL-*` finding. Notes below are dated, historical, and may cite a
> finding ID for context, but **a status word written here is not authoritative and may have
> drifted** since it was typed. Never treat a gate as satisfied - or unsatisfied - on the basis of
> a status restated in this document; resolve the ID against the register. When editing this file,
> prefer citing the ID alone over restating its status.

## Gate 1 (operational) vs Gate 2 (customer-facing) readiness

The cutover is gated in two independent stages. **Gate 1** is operational/infra readiness under the
no-real-users boundary: can we stand GCP up and cut DNS safely. **Gate 2** is customer-facing
readiness (email deliverability, credential hygiene, data cleanliness) before any real user is
onboarded. Gate 1 can be scheduled with open Gate-2 items; the two do not block each other.

**Gate 1 rehearsal evidence (2026-07-19/20) - GREEN:**

- **Render WriteFreeze write-reject:** `POST /api/v1/logs` -> `503` + `Retry-After: 120`; reads
  return 200; `POST /token` -> `400` (login allowlist intact). The middleware runs before
  routing/auth and `/api/v1/logs` is not allowlisted (`config/initializers/write_freeze.rb`).
- **Client 503 stash retention:** a real browser `window.stashes.push_log(false)` against a frozen
  Render observed the 503 and RETAINED the `usage_log` locally (not dropped).
- **External-writer pause/resume:** the `sync-render-secrets` GitHub Action, the n8n `infra-monitor`
  workflow, and the Render cron/worker/web-autoDeploy toggles were each paused and restored to their
  prior state.
- **GCP `/api/v1/logs` write + read:** an authenticated `POST` created a real log and `GET` read it
  back (`pending=false`).
- **Async usage-log worker materialization - verified via live Cloud Logging (2026-07-20):**
  `lingolinq-worker` ran `LogSession.process_delayed_follow_on` to completion (0-1s, no errors),
  paired with web-side stash creation (`generating stash` -> `done with process_as_follow_on`).
  **Caveat:** this proves the async route RUNS and the worker DRAINS the `default` queue; it is NOT
  a full real-UI offline replay with a GET-confirmed final `global_id` (that remains an optional
  Gate-2 belt-and-suspenders check, not a Gate-1 blocker).

**Open items - YELLOW (all Gate 2; none is a DNS-cut blocker):**

- **SES mail authentication residuals:** SES accepted the send and manual inbox receipt was
  confirmed, so *delivery* is settled (`LL-42a24ee911`, verified-closed). Two residuals that
  delivery did not establish remain open: the SPF/DKIM/DMARC `Authentication-Results` headers have
  never been captured on a delivered prod message, and no custom `MAIL FROM` domain is configured,
  so SPF is unaligned under DMARC and DKIM is the sole passing alignment mechanism. Accepted for
  Gate 1 (Scot, 2026-07-19); resolve both before customer-facing launch. Tracked as Gate-2 register
  finding `LL-abd6c88733`.
- **Seeded `lingolinq_admin` weak test credential:** rotate/replace with a break-glass admin
  procedure before Gate 2. Tracked as Gate-2 register finding `LL-caaf8e20ec`.
- **Test residue:** rehearsal left fake note logs on the current GCP DB, and `Api::LogsController`
  has no `destroy` action (so `DELETE /api/v1/logs/...` is a no-op). Benign under no-real-users;
  either console-clean or confirm the migrate Job reseeds the DB at the flip before Gate 2.

**Schedule posture:** READY to schedule Gate 1 with the accepted yellows above, AFTER (a) this
runbook reconciliation lands and (b) an operator quiet-window is confirmed - no Codex/Claude/browser
rehearsal still generating `phase2-*` / synthetic `/api/v1/logs` traffic against prod GCP when DNS
is cut (see the pre-cutover checklist). Gate 1 stays separate from Gate 2 customer-facing readiness.

## Scope and the one rule that governs everything

**Render stays live and authoritative until DNS is flipped, and stays untouched through the
soak.** The master rollback for the entire cutover is "flip DNS back to Render." That only works
if Render is never degraded during the cutover. Therefore:

- The write-freeze is a **feature-flagged write-reject mode** on Render web (503 + Retry-After on
  mutating endpoints, reads still served), combined with a **60s DNS TTL**, NOT a scale-to-0 and
  NOT a DB-level read-only toggle. Render web stays UP through the entire soak; this is the guard
  that stops offline/DNS-stale clients from writing to the abandoned Render DB after cutover
  (decided mechanism, Scot 2026-06-23, Option 1 + 2). This write-reject mode is **BUILT** -
  `WriteFreeze::Middleware`, ENV-gated on `WRITE_FREEZE` (`config/initializers/write_freeze.rb`,
  PR #472, merged to staging, spec-covered by `spec/features/write_freeze_spec.rb` +
  `spec/initializers/write_freeze_paths_spec.rb`). Default (`WRITE_FREEZE` unset) = zero behavior
  change; the operator toggles it on at freeze start. See step 1 for coverage detail and the
  accepted-loss set.
- **Render decommission is NOT part of this runbook.** It is tracker Phase 6 (`6.2`), gated, and
  only after a clean soak AND Cloud SQL confirmed authoritative. See step 9b, a pointer, not an
  action.

---

## CLEAN-DB CUTOVER VARIANT (DECIDED: Scot, 2026-06-26) - read this first

**`lingolinq-prod` carries no real client data - only fake/internal test accounts** (recorded in
PR #483; `project_prod_no_real_users`). There is therefore **nothing to migrate**, and the
default cutover path below collapses to "stand up the GCP stack on a fresh seeded DB and point DNS
at it." This variant is the ACTIVE plan for the current window. The full-data path (steps 1-3, 7,
S1) is **retained unchanged below** as the fallback: if real users are onboarded to prod before
the window, revert to it.

**What collapses (do NOT run these in the clean-DB path):**

| Default step | Why it exists | Clean-DB action |
|---|---|---|
| 2. Fresh `pg_dump` | capture real prod data | **DROP** - nothing to capture |
| 3. Restore -> Cloud SQL | move real data | **REPLACE** with a fresh `db:schema:load` + `db:seed` in the migrate Job |
| S1 `phase4-setval-sequences` | realign PK sequences after a data restore (global_id uses raw PKs) | **DROP** - a fresh schema sets sequences correctly; nothing to realign |
| 7. `phase5-delta-check.sh` | catch a writer that slipped the freeze | **DROP** - no source DB to reconcile against |
| 1. write-freeze accepted-loss analysis (offline replay, `saml/consume` linkage, last-writer-wins, SNS/Stripe/SMS drop) | avoid losing in-flight real writes during the window | **Accepted-loss sign-off not needed** (no real writers/users) - BUT keep building `WRITE_FREEZE` and **toggle it on at DNS time**: it is still the cheap guard against split-brain on the seeded `lingolinq_admin`/`lingolinq` accounts (which exist on BOTH DBs) when a DNS-stale client hits the old Render IP during TTL propagation. Do NOT read "no data to protect" as "drop the build." |

**What still runs (stack validation, not data) - unchanged from below:**

- **Two hard gates, both irreversible if wrong:**
  - **Host-bound empty-DB proof (irreversible gate).** `db:schema:load` uses `force: :cascade` and
    drops every table; the proof that the target DB is the empty Cloud SQL instance (not the still
    authoritative Render DB) MUST be bound to the live `DATABASE_URL` secret the Job uses, not a
    hand-typed proxy. This is the one step that can cause permanent loss - treat it as THE
    irreversible gate.
  - **0c Redis TLS live handshake (`LL-6619cc1811`)** - **exercised green against live Memorystore
    2026-06-29** (`lingolinq-redischeck-zsq74`, PONG over `rediss://`, CA-chain verified), so the
    technical gate has passed. That is one of two closure conditions for the finding - prod must
    also cut over off plaintext Render Redis (see 0c); register status is authoritative in
    `audit-reports/FINDINGS.json`. Because **seeding itself enqueues to Redis synchronously**, re-run
    this handshake BEFORE any re-seed on a fresh DB. The functional go/no-go gate for the Redis path.
- 0b worker-pool health; the schema-load + seed (two separate executions, NOT a combined re-runnable
  Job; seeding performs a full Moby word import - budget a long task-timeout); the five-path smoke
  test (login, board load, S3 read, SES send, Resque process); the frontend LB + Cloud Armor
  (step 8 / #476); the DNS flip (step 9, 60s TTL); soak; Phase 6 decommission.

**Boot secrets (DECIDED: preserve, Scot 2026-06-26):** even on a clean DB, seed the four
`generateValue` secrets (`SECRET_KEY_BASE`, `COOKIE_KEY`, `SECURE_ENCRYPTION_KEY`,
`SECURE_NONCE_KEY`) via the already-built, byte-verified `scripts/gcp/phase4-seed-boot-secrets.sh`
(`--verify` then `CONFIRM_SEED_SECRETS=1`). Preserving has zero downside and avoids any stale-key
reference; regenerating fresh is also safe (all data is fake) but buys nothing. Do NOT regenerate.

**Collapsed clean-DB sequence:**

```
1. Seed GCP boot secrets    phase4-seed-boot-secrets.sh --verify -> seed   (preserve the 4)
2. Host-bound empty proof   rails-runner: assert Cloud SQL host + 0 tables <- IRREVERSIBLE GATE
3. 0c Redis TLS handshake   PING -> PONG over rediss://, assert CA count   <- REAL GATE (before seed)
4. Fresh schema, then seed  db:schema:load THEN db:seed (two separate execs; seeds Moby words)
5. 0b + smoke test          worker RUNNABLE + 5 paths green on a run.app URL
6. Frontend LB + Armor      phase5-frontend-lb.sh (#476)
7. DNS flip (60s TTL) -> soak -> decommission Render (Phase 6)
```

**Operator runsheet for steps 1-4 (dry-run first):** `scripts/gcp/PHASE5-CLEAN-DB-REHEARSAL.md`.
The live spin-up of Cloud SQL + Cloud Run + Memorystore is still GATED on Scot's explicit go and
costs money; re-verify live state (Render cron, secrets, GCP provisioning) before any command
lands on the action list.

---

## Operator identity (HIPAA)

Run as **Scot or a designated engineer** holding all three: prod GCP access (project
`lingolinq-prod`), the **1Password "LingoLinq Prod"** vault, and a **Render** API key for the
prod service. Single-operator host, never a shared box, never under `bash -x` (tracing leaks
secret material). This is an auditable production change; record start/end times for the
compliance register.

---

## Cutover sequence (steps 0a -> 9)

Legend for each step: **GATE** = needs Scot go-ahead (money / DNS / data move / delete).

### 0a. Full dress rehearsal  (tracker 4.1, GATE: real data)

Real prod dump -> restore to Cloud SQL -> prod-config Cloud Run on a `run.app` URL ->
smoke-test login, board load, S3 read, SES send, Resque enqueue/process. No DNS.

**This is the real go/no-go gate.** It is the first time S1, S2, the migrate Job, and the live
Redis-TLS handshake (0c) are exercised against live infrastructure together. A production window
is not schedulable to a firm date until this passes.

- Success: all five smoke paths green; row counts reconcile against the dump baseline; no boot
  errors; sequences verified (S1).
- Failure: stop. The rehearsal is non-destructive to Render; fix and re-rehearse.

**Two write-freeze go/no-go checks to add to this rehearsal (dual-review of PR #472/#473):**

- **Client 503 re-queue (confirm; code trace says it already re-queues).** With `WRITE_FREEZE` on,
  drive a real offline edit (board save) and a `LogSession` create, then confirm the write lands on
  Cloud SQL on the next sync and is NOT dropped. The offline path is expected to pass: `sync_changed`
  leaves a record `changed` on save failure and retries it, and the `big_logs` stash re-stashes logs
  on failure (see step-1 residual note). Also spot-check an ONLINE direct board save under the freeze
  (it should error and be re-saveable, not silently lost). Only a confirmed DROP here is a no-go.
- **Worker requeue + shutdown budget.** Enqueue a synthetic long slow-queue job, replace the
  worker-pool instance (redeploy) mid-job, and confirm: (a) the job re-runs after the new instance
  comes up, and (b) actual shutdown wall-clock stays under Cloud Run's fixed 10s under live
  `rediss://` TLS Redis (the entrypoint sets `RESQUE_PRE_SHUTDOWN_TIMEOUT=4` + `RESQUE_TERM_TIMEOUT=3`
  = 7s nominal; confirm the requeue LPUSH completes inside the term window and right-size from the
  measured number, tracker 4.2). Also confirm DirtyExit jobs (TERM outside job execution / SIGKILL)
  are visible in the Resque failed queue.

**Private-bucket read/write path checks (added 2026-07-05, findings LL-705b10bcd7 / LL-9a09771121):**

- **S3 write path.** Create a real ButtonImage from an external PNG URL and let the worker pool
  process it: the record's `url` must become a `lingolinq-prod-uploads` bucket URL (no
  `data_uri` fallback, no `errored_pending_url`), and `head-object` must show the object with
  `ServerSideEncryption: aws:kms` under the expected CMK. Verified green on the rehearsal stack
  2026-07-05 (synthetic ButtonImage id 840). Prerequisites: IAM policy `lingolinq-cloudrun-s3-ses`
  v2 (KMS statement) attached to `lingolinq-cloudrun-prod`; `UPLOADS_S3_NO_ACL=1` in the deploy env.
- **S3 read path via CDN.** The bucket blocks all public access; client reads go through CloudFront
  distribution `E2X2HAS6Y1L2MI` (`https://d34sa6lc5jfe66.cloudfront.net`, OAC + KMS grant). Confirm
  `UPLOADS_S3_CDN` is set on web + worker, an uploaded image renders in a browser via its CDN URL
  (and the raw `s3.amazonaws.com` URL still 403s), and the response carries
  `access-control-allow-origin` (the Ember offline-sync XHR needs CORS). Then sync a board offline
  in the app and confirm images cache.

### 0b. Worker health verification  (was Copilot "6b warmup", reframed)

The worker is a Cloud Run **worker-pool** (`gcloud beta run worker-pools`, see
`.github/workflows/deploy-cloudrun.yml`), `--instances 1`, always-on and non-HTTP. There is no
request-driven cold start to "warm up." What matters before DNS is **health**:

- Worker-pool instance is up and `RUNNABLE`.
- It is connected to Memorystore over `rediss://` (TLS) and to Cloud SQL.
- It is draining the `priority`, `default`, and `slow` queues (enqueue a synthetic job, confirm
  it processes).

Run this after the migrate Job + deploys (step 6) and before DNS (step 9).

### 0c. Redis TLS live handshake smoke test  (one of two conditions for register LL-6619cc1811)

The app-side TLS capability is merged (#410/#416/#417: `rediss://` enables `:ssl` + `:ssl_params`
in `config/initializers/resque.rb`, hostname hatch `REDIS_TLS_VERIFY_HOSTNAME=false`, CA wired
into `BOOT_SECRETS`). This handshake was **exercised green against the live Memorystore instance on
2026-06-29** (`lingolinq-redischeck-zsq74`: `PONG` over `rediss://`, CA chain verified), so this
technical gate has passed. **That alone does NOT close `LL-6619cc1811`.** The finding is that
*prod* Redis runs without TLS, and prod is still Render (`redis://`, plaintext) until the cutover.
Closure requires BOTH: (1) this handshake green against live Memorystore, and (2) prod actually
cut over off plaintext Render Redis. Scot's disposition (2026-06-18) says the same - "full closure
lands at the GCP Memorystore cutover; status stays open until the cutover." Only Scot closes a
finding, and only after (2). **Re-run this handshake as a pre-flight before any re-seed on a fresh
DB** - it is cheap and catches a broken CA/endpoint before data work.

```
# From a Cloud Run context that has the prod REDIS_URL (rediss://) + REDIS_CA_CERT loaded
# (the migrate Job or a one-off job execution is the cleanest place):
#   ruby -e "require './config/initializers/resque'; Resque.redis.ping == 'PONG'"
# OR the equivalent in a rails runner that exercises RedisInit.redis_options.
```

- **Success criteria:** `PING` returns `PONG` over the `rediss://` endpoint
  (`10.160.1.3:6378`) with CA-chain verification ON (VERIFY_PEER against `REDIS_CA_CERT`) and
  hostname verification OFF. Resque enqueue + process of one synthetic job succeeds.
- **CA-completeness check (dual-review):** `redis_ssl_params` (`config/initializers/resque.rb:56-71`)
  **skips unparseable certs** and only raises if ZERO parse. So a `REDIS_CA_CERT` containing the
  current CA plus a malformed next-rotation CA passes today and fails silently when Memorystore
  rotates mid-soak. Assert the **count** of certs parsed from `REDIS_CA_CERT` equals the expected
  number (log `added`), and confirm the seeded blob contains every currently-valid Memorystore CA,
  not just one that happens to work now. A green PING is necessary but not sufficient.
- **Rollback trigger:** TLS handshake error (cert chain, CA mismatch, connection refused) that is
  not resolved by confirming `REDIS_CA_CERT` is the live instance CA. Do not proceed to DNS with
  Redis unverified; jobs (including log processing) would silently fail post-cutover. Mark
  LL-6619cc1811 **verified-closed** in the register only after BOTH this is green against live AND
  prod has actually cut over off plaintext Render Redis - the handshake alone is not sufficient
  (see 0c). Closure is Scot's alone.

### 1. Write-freeze window - Render write-reject mode  (tracker 5.2, GATE: data move begins)

**The freeze is a write-reject mode on Render web (kept up), NOT a scale-to-0.** And note: the web
app is not the only writer. LingoLinq has writers that do not run inside the web dyno. Freezing the
DB means freezing ALL of them, in this order, BEFORE the dump:

- **Scheduled rake tasks** - all unified into a **single Render cron service**, `lingolinq-prod-scheduler`
  (`crn-d68nfmbnv86c73eho6vg`, schedule `0 * * * *`, start command `bundle exec rake scheduler:dispatch`).
  These are NOT Resque jobs in `render.yaml` and there is no `resque-scheduler`; the cron boots its own
  Rails process that writes prod independently. `scheduler:dispatch` runs the hourly tasks every run
  (`generate_log_summaries`, `push_remote_logs`, `check_for_log_mergers`, `advance_goals`) plus a **daily
  block gated to `hour == 6` UTC** that includes several **destructive** purges: `flush_users`,
  `clean_old_deleted_boards`, `enforce_data_retention_policies` (purges stale log sessions),
  `flush_expired_beta_feedback_recordings` (deletes recordings), plus `redact_old_ai_api_log_ips`,
  `expire_licenses`, and `expire_stale_supervisor_consent_requests`. **Suspend the one cron service**
  before the dump - that pauses all of them at once. **Re-verify against the live Render dashboard the day
  before; do not trust this list** (2026-06-24: exactly one prod cron service existed).
- **The hourly secret sync** - a **GitHub Action**, `.github/workflows/sync-render-secrets.yml`
  (cron `15 * * * *`), running `node scripts/sync-render-env.js --source op --apply` (1Password -> Render
  env). Note the apply step passes **no `--service` flag**, so it writes **all three** Render
  environments' env (dev, staging, AND prod) - not prod only (`sync-render-env.js:581,587` default to all
  services unless `--service` narrows). **Disable the workflow** - it is a GitHub Action, NOT a Render
  service, and there is no prod-only invocation to look for in CI - for the whole window AND soak, or a
  1Password edit silently rewrites Render env (breaks the "Render is pristine rollback insurance"
  invariant; see Rollback).
- **n8n workflows** - as of 2026-06-24 **none of the active workflows write prod**: `daily-ai-cost-pii-digest`
  GETs the *staging* summary and posts to Google Chat, and `infra-monitor` polls health endpoints read-only.
  No pause is needed for data safety, but **silence `infra-monitor`** for the window or it will fire Google
  Chat alerts the moment prod starts 503'ing writes. (Re-verify the day before.)
- **Render deploys (deploy freeze).** Any deploy of the prod web service runs
  `bundle exec rails db:migrate` against the prod DB via its `preDeployCommand` (`render.yaml:13`; live
  on `lingolinq-prod`). That is a schema write outside the web/worker/cron/Action set above, so a stray
  merge or manual redeploy during the window mutates the about-to-be-abandoned prod DB and weakens the
  rollback-pristine invariant. **No deploys of `lingolinq-prod` during the window/soak** - pause
  auto-deploy or hold merges to the deploy branch.
- **Outbound webhook delivery** (`Webhook.notify_all_with_code`, scheduled from
  `app/models/concerns/notifier.rb`). It can run ~20 min sending outbound webhooks per recipient,
  and is **non-idempotent**: the W1 SIGTERM requeue (PR #473) re-runs an interrupted job from the
  top, so a worker replacement mid-notify resends to already-notified district/school endpoints
  (duplicate, unretractable webhooks). Pause/drain it before pausing the workers so none is in
  flight at the freeze. (Making the requeue selective per-class is a documented follow-up; for the
  cutover the mitigation is operational - pause it.)
- **Inbound external webhooks** (Stripe `purchasing_event`, AWS SNS/transcoder `callback`, CSP
  reports - all mutating POSTs under `/api/v1`). These need **no separate pause**: they are POSTs and
  the only allowlisted paths are `saml/*` (`write_freeze.rb:62-63`), so the same WriteFreeze on Render
  web auto-503's them once write-reject is on. The flip side is dropped writes during the soak: a Stripe
  subscription/payment event, a transcoder completion (`callbacks_controller.rb:32`), **and inbound SMS**
  (`RemoteTarget.process_inbound` -> `save!`, `callbacks_controller.rb:46`) are not recorded on Render.
  Stripe and AWS both retry, but on **different models** - Stripe retries on its own backoff schedule;
  **SNS redelivers and dead-letters** to its DLQ - so if the soak outlasts a provider's retry window the
  event is lost (billing / media-record / SMS-record impact). Either keep the soak inside the providers'
  retry windows, or plan to reconcile/replay (and drain the SNS DLQ) for the window. Note it in the
  window plan.

**DECIDED mechanism (Scot, 2026-06-23): Option 1 + Option 2 combined. NOT scale-to-0.**
The offline/mobile replay hazard (AAC clients buffer writes in IndexedDB/SQLite and replay on
reconnect, and the client sync path has **no server-side conflict resolution** -
`app/frontend/app/utils/persistence.js:3630` "TODO: check for conflicts before saving") is
mitigated by keeping Render web **up and reachable but rejecting all writes**, combined with a 60s
DNS TTL so reconnecting clients resolve GCP fast and their retried writes land on Cloud SQL, not the
abandoned Render DB.

The freeze, in order:

- **Lower DNS TTL to 60 seconds** well before the window (not 24-48h). This is what makes a
  rejected-write retry resolve to the new prod quickly instead of sticking to a cached Render IP.
- **Enable Render write-reject mode (built, feature-flagged - see "Required build" below).** All
  mutating endpoints return **`503` + `Retry-After`**; reads still serve. This gives offline/late
  writes a clean, retryable rejection instead of a silent loss or a write to the soon-to-be-stale
  DB. Render web **stays up** (it is NOT scaled to 0).
- **Pause Render workers** (the Resque worker writes via background jobs; scale the worker service
  to 0 or stop it). Confirm no in-flight Resque jobs.
- Announce the window (copy must be i18n'd, calm and concrete for AAC users): "LingoLinq is briefly
  read-only for scheduled maintenance and will be fully back at <time tz>." **Skipped at the current
  cutover: prod has no real users, only internal/fake test accounts, so no proactive announcement is
  sent (Scot, 2026-06-24; see the maintenance-message checklist item). The reactive WriteFreeze 503
  page covers the only edge cases. Re-instate this announce step only if real users are onboarded to
  prod before the window.**
- **Do NOT scale Render web to 0, and do NOT decommission, until after soak and after Cloud SQL is
  confirmed authoritative** (step 9b). Render web in write-reject mode is the soak-safety guard.

> **Required build (pre-cutover, like W1): Render write-reject mode. BUILT - PR #472**
> (`config/initializers/write_freeze.rb`, `WriteFreeze::Middleware`). A Rack middleware that, when
> the operator sets `WRITE_FREEZE`, short-circuits writes with HTTP `503` + `Retry-After` and an
> i18n'd body (JSON for API/sync clients, HTML for browser navigations). Reads pass through. Default
> (`WRITE_FREEZE` unset) = zero behavior change; toggle it on at freeze start, off on rollback.
> Coverage as built:
> - **Mutating verbs** (POST/PUT/PATCH/DELETE) are rejected by default.
> - **Side-effect GETs are also rejected** via an explicit denylist (`SIDE_EFFECT_GET_PATHS`): a
>   verb-only check would have leaked `upload_success` (images/sounds/videos `record.save`),
>   `/goal_status/` (log write), and `/parental_consent/complete` (COPPA consent + Device writes).
>   This list is maintained: a NEW side-effect GET added later is NOT covered until listed.
> - **Auth allowlist** keeps existing-user sign-in working (token/oauth/refresh/SAML/google-link).
>   New-account creation (`auth/google/signup`) and password reset are deliberately NOT allowlisted.
>
> **Gate is an ENV var (`WRITE_FREEZE`), not a `lib/feature_flags.rb` entry.** This is an
> operator-controlled infra maintenance mode, not a user-facing product feature, so it is env-gated
> like other infra behavior; the only user-facing surface (the 503 copy) is i18n'd. (The earlier
> draft assumed a feature flag; the build and review settled on the ENV gate.) Re-confirm the
> mutating-endpoint coverage in the dress rehearsal, especially the `lib/json_api` write paths the
> offline clients sync to.

> **Accepted-loss set (dual-review, PR #472 - confirm with Scot before the window).** The auth
> allowlist intentionally lets EXISTING users sign in during the freeze, and those auth routes DO
> write to the about-to-be-abandoned Render DB: `token`/`oauth2/token` create a `Device` row +
> token (`generate_token!`), and `saml/consume` can persist SSO linkage. **These writes are LOST at
> cutover; the user simply signs in again afterward.** That is the accepted trade for not locking
> users out for the whole soak. `auth/google/signup` (full new user + boards) is NOT allowlisted, so
> no brand-new account is persisted to Render mid-soak. `saml/consume` is kept allowlisted (favoring
> existing-SSO sign-in), which means a brand-new SAML user provisioned mid-soak would be lost.
> **DECISION (Scot, 2026-06-23): keep `saml/consume` allowlisted.** Existing single-sign-on users
> must be able to sign in during the window; a brand-new SSO signup landing in a ~2-3h overnight
> window is rare and simply retries against GCP afterward. Accepted-loss set is therefore: login
> Device/token writes + `saml/consume` SSO linkage (lost on rollback; user re-signs-in). New-account
> creation (`auth/google/signup`) stays blocked.

> **Residual note (dual-review of PR #472, then code-traced):** keeping Render up in write-reject
> mode + 60s TTL closes the post-dump-write data-loss class ONLY IF the client retains a rejected
> write and retries it rather than dropping it. **Code trace says the offline write path already
> does this** (so this is a confirm-in-rehearsal item, NOT a likely blocker):
> - Offline record edits: `persistence.sync_changed` (`app/frontend/app/utils/persistence.js:3587`)
>   saves each locally-`changed` record; on save failure it rejects WITHOUT removing the local
>   record or clearing its `changed` marker (`:3651`), and uses `RSVP.all_wait` so one failure does
>   not abort the rest. The record stays `changed` and is re-picked-up by `find_changed` on the next
>   sync, which (after the 60s TTL moves DNS to GCP) lands on Cloud SQL. Not dropped.
> - Usage logs: the `big_logs` stash observer re-stashes logs on a failed push
>   (`persistence.js:~286`, `concat` back), so logs are retried too.
> - The "~3 tries then stop, ignores Retry-After" path the review first flagged is
>   `persistence.handleTokenError` - a TOKEN/auth-flow helper, NOT the data-write path; it does not
>   govern board/log writes.
>
> Residual caveats to still check in 0a: (1) an ONLINE direct save (e.g. a board edit made while
> online) that 503s surfaces as a save error and relies on user/app re-save - that is a UX retry,
> not a silent write to the abandoned Render DB (the freeze's actual goal is met either way); (2)
> `sync_changed` saves with `setProperties` + `save()` and no conflict check ("TODO: check for
> conflicts before saving", `:3630`), so offline-replay is last-writer-wins - minimized by dump
> timing but worth a spot-check. On the happy path the only manual reconciliation is on **rollback**
> (see Rollback).

### 2. Fresh prod `pg_dump`  (GATE: real data move)

Take a fresh full dump of the Render prod Postgres now that it is quiesced. Use the dump path in
`scripts/gcp/phase3-data-layer.sh` and the preflight in
`PHASE4-CUTOVER-DATA-RUNBOOK.md` section 1. Record the dump's row-count baseline for
reconciliation.

### 3. Restore -> Cloud SQL

Restore the dump whole into `lingolinq_production` on `lingolinq-prod-pg` (private IP
`10.160.0.3`). Reconcile row counts, extensions, and schema against the baseline. The migrate Job
later applies only **incremental** `db:migrate` on top; it never runs `db:prepare` (which could
load `schema.rb` and drop tables; see the "Strictly incremental" comment on the
"Run database migration (Cloud Run Job)" step in `deploy-cloudrun.yml`).

### 4. S1 - reset and verify sequences  (built, #424)

A restore leaves column-owned sequences behind `MAX(id)`; because `global_id` encodes the raw PK
(`app/models/concerns/global_id.rb`), the next insert would collide. Run:

```
DATABASE_URL='postgres://lingolinq_app:PASSWORD@127.0.0.1:5432/lingolinq_production' \
  ./scripts/gcp/phase4-setval-sequences.sh
```

Idempotent. Expected tail: `Phase 4 setval + verify complete.` Verify exits non-zero if any
sequence is still behind its `MAX` or an identity-PK has drifted. Full detail:
`PHASE4-CUTOVER-DATA-RUNBOOK.md` S1.

### 5. S2 - preserve and seed the four `generateValue` secrets  (built, #424)

The four (`SECRET_KEY_BASE`, `COOKIE_KEY`, `SECURE_ENCRYPTION_KEY`, `SECURE_NONCE_KEY`) must be
**preserved, never regenerated** (regenerating the encryption keys makes every
`secure_serialize`'d column permanently undecryptable; the session keys invalidate all logins).
Source of truth is 1Password "LingoLinq Prod" / "Rails Secrets".

```
./scripts/gcp/phase4-seed-boot-secrets.sh                 # 1) plan (no creds, no write)
./scripts/gcp/phase4-seed-boot-secrets.sh --fingerprint   # 2) sha256 compliance prints
./scripts/gcp/phase4-seed-boot-secrets.sh --verify        # 3) 1Password vs live Render; must be green
CONFIRM_SEED_SECRETS=1 ./scripts/gcp/phase4-seed-boot-secrets.sh  # 4) verify THEN write to Secret Manager
```

#### S2 decision gate - `SMS_ENCRYPTION_KEY`

`SMS_ENCRYPTION_KEY` is a **separate** secret (the salt for the persisted one-way `source_hash`
at `app/models/remote_target.rb:44,56`). It is NOT a `generateValue` secret, is NOT seeded by the
script, and is NOT in the deploy workflow `BOOT_SECRETS`. Decide before cutover:

- **If SMS source routing is used in prod:** preserve `SMS_ENCRYPTION_KEY` from 1Password the same
  way as the four (do not regenerate; regenerating breaks matching of existing stored
  `source_hash` values), and add it to `BOOT_SECRETS` in `deploy-cloudrun.yml` so the runtime can
  read it.
- **If SMS source routing is NOT used in prod:** do NOT take this branch on judgment. The failure
  is silent: with `SMS_ENCRYPTION_KEY` unset, `source_hash` is computed with a `nil` salt
  (`app/models/remote_target.rb:44,56`), so post-cutover hashes never match existing stored values
  and SMS source routing silently mis-routes with no boot error. **Hard gate:** during the dress
  rehearsal, query the restored DB for `RemoteTarget.where(target_type: 'sms').exists?`. If any row
  exists, seeding `SMS_ENCRYPTION_KEY` + adding it to `BOOT_SECRETS` is **mandatory**, not optional.
  Only mark "not required" if that query is empty.

### 6. Un-inert  (set GitHub Actions repo variables) - MUST precede the dispatch

> **Ordering fix (dual-review):** un-inert comes BEFORE the migrate/deploy dispatch. The deploy
> workflow no-ops while `vars.GCP_PROJECT_ID` is empty, so dispatching first just no-ops. Steps 6
> and 7 were swapped in the first draft; this is the corrected order.

The deploy workflow no-ops while `vars.GCP_PROJECT_ID` is empty (the `guard` job, "Check
migration readiness", in `deploy-cloudrun.yml`).
Note: once PR #758 reaches `main`, a push to `main` also CREATES a production deployment
automatically, which proceeds after a reviewer approves it in the `production` environment. A
release merge into `main` is therefore itself a production deploy, and `gh workflow run` below
becomes the manual redeploy path rather than the only path.
"Un-inert" = set the deferred repo variables (Settings > Secrets and variables > Actions >
Variables). Three are already set (`GCP_REGION=us-central1`, `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA`,
per tracker 1.10). Set the remaining four:

| Variable | Value | Constraint |
|---|---|---|
| `GCP_PROJECT_ID` | `lingolinq-prod` | The un-inert switch itself; set last. |
| `GCP_CLOUDSQL_INSTANCE` | `lingolinq-prod:us-central1:lingolinq-prod-pg` | Reached via the built-in socket proxy (`--set-cloudsql-instances`), unaffected by `private-ranges-only` egress. |
| `GCP_VPC_NETWORK` | the prod VPC | **Must be the same network as the private-IP Cloud SQL + Memorystore** (`10.160.0.0/...`). Direct VPC egress, not a Serverless connector. |
| `GCP_VPC_SUBNET` | the prod subnet | Same region (`us-central1`) as the instances; `private-ranges-only` routes only RFC1918/Google ranges through the VPC, so public egress (S3/SES) still uses the default path. |

Region/VPC/subnet must all agree with the Phase 3 provisioning, or the migrate Job, web, and
worker fail to reach Cloud SQL / Memorystore at connect time.

### 7. Migrate Job + deploys  (dispatch the now-enabled workflow)

Only after step 5 (S2 seeded the secrets the Job boots with) and step 6 (repo vars set) does the
workflow do anything. One dispatch runs all of it: build image -> push to Artifact Registry -> run
`lingolinq-migrate` Cloud Run Job (`db:migrate` only) -> deploy `lingolinq-web` ->
deploy `lingolinq-worker` pool.

```
gh workflow run deploy-cloudrun.yml
```

Then, BEFORE any DNS change:

- Run **0b (worker health verification)** and **0c (Redis TLS handshake)** against the deployed
  services.
- **Pre-DNS delta check (dual-review finding):** compare `MAX(id)` / `MAX(updated_at)` on
  high-traffic tables (`LogSession`, `Board`, `BoardContent`) between **live Render** and **Cloud
  SQL** immediately before the flip. The step-0a/3 reconciliation only compares dump-to-restore, so
  it cannot see writes that reached Render after the dump. **Any non-zero delta is a rollback
  trigger** (it means an external writer or offline replay slipped past the freeze; go fix the
  freeze, do not flip DNS).

  **Script: `scripts/gcp/phase5-delta-check.sh`** (built, strictly read-only - every query runs in
  `BEGIN READ ONLY`, so it is safe against live prod). Forward (gate) mode exits non-zero on any
  drift:

  ```
  cloud-sql-proxy --port 5432 lingolinq-prod:us-central1:lingolinq-prod-pg &
  RENDER_DATABASE_URL='postgres://USER:PASS@RENDER_HOST:5432/lingolinq_production' \
  CLOUDSQL_DATABASE_URL='postgres://lingolinq_app:PASS@127.0.0.1:5432/lingolinq_production' \
    ./scripts/gcp/phase5-delta-check.sh           # add --counts to also compare COUNT(*) (slower)
  ```

  Default tables are `log_sessions boards board_contents` (override with `TABLES=`). On **rollback**
  (Rollback step 3), the same script in reverse mode enumerates the cutover-window writes that
  landed only on Cloud SQL, for replay/merge back into Render:
  `CLOUDSQL_DATABASE_URL=... ./scripts/gcp/phase5-delta-check.sh --since '<DNS-flip timestamp>'`.

### 8. Front-end decision gate  (tracker 5.3 - DECIDED 2026-06-23)

The web service currently serves on its `--allow-unauthenticated` `run.app` URL. The Option B LB +
Cloud Armor path below **is already built and provisioned** (LB IP `136.68.41.122`, policy
`lingolinq-armor`, WAF rules 1001-1004 + rate-limit 2000 all in `preview=true` / log-only, verified
live 2026-07-15). **DNS IS CUT OVER.** Verified 2026-08-09: `app.lingolinq.com` resolves to
`136.68.41.122` (the `lingolinq-https-fr` forwarding rule) and `/api/v1/health` returns 200
through the LB. An earlier version of this paragraph said "no real DNS traffic points at the LB
yet", which was true when written and is now false. Note what this does and does not establish:
the LB path serves. It does NOT mean prod is launched. Prod has no real users yet (Scot,
2026-08-09); see the Status block at the top for the gate list that must close before the first
real district is onboarded. What genuinely remains gated: the ingress lockdown (the web service is still `--ingress=all`, so the
`run.app` URL bypasses the LB and Cloud Armor entirely) and the WAF enforce flip (rules 1001-1004
and 2000 are still `preview=true` / log-only). See the ingress lockdown and the enforce flip in
step 9c.

Before running the ingress lockdown, read the coupling note added at the LOCKDOWN GATE in
`scripts/gcp/phase5-frontend-lb.sh`: it breaks the deploy pipeline's health probe.

**DECISION (Scot, 2026-06-23): Option B - external HTTPS Load Balancer + Cloud Armor in front of
Cloud Run, gated on building and smoke-testing the full LB + Cloud Armor path in the dress
rehearsal (0a) so cutover is not its first real run. Fallback if rehearsal timing is tight: launch
on Option A (domain-map, managed TLS) at cutover and add the LB in the soak.** Rationale: the WAF
posture is wanted for HIPAA/FERPA defense-in-depth and is required for the n8n.3 webhook hardening,
and A->B later is a *second* DNS cutover (CNAME-to-Cloud-Run vs A-record-to-LB-IP) with its own
propagation/rollback window - building B first means one DNS event, not two.

- **Option A (fallback):** map the custom domain directly to Cloud Run (managed TLS) - simpler.
- **Option B (chosen):** front with an external HTTPS Load Balancer + Cloud Armor (WAF / IP rules).
  A misconfigured Cloud Armor rule can itself cause an outage (false-positive blocks on legitimate
  AAC traffic), so exercise the policy in the rehearsal.

Full rationale in the decision memo
(`~/ai-company-brain/outputs/docs/2026-06-23-cloudrun-frontend-5-3-decision.md`).

**Build script: `scripts/gcp/phase5-frontend-lb.sh`** (gated, idempotent; PR #476). Order:
1. `DOMAIN=<prod domain> CONFIRM_LB=1 ...` builds the static IP + serverless NEG + backend +
   URL map + managed cert + HTTPS/HTTP forwarding. Records the **LB IP** = the DNS A-record
   target for step 9.
2. `... CONFIRM_ARMOR=1 ...` adds Cloud Armor with the OWASP WAF in **PREVIEW** (log-only, low
   sensitivity). **The WAF stays in PREVIEW through the DNS cutover and the soak. Do NOT flip it
   to enforce pre-DNS.** Rationale (verified live 2026-06-30): the LB receives NO traffic until
   step 9 points DNS at it (the `run.app` smoke tests bypass the LB), so pre-DNS the Cloud Armor
   preview logs are empty and prove nothing. The specific risk that motivated preview mode -
   free-text AAC utterances tripping the SQLi/XSS rules - only surfaces under real user traffic,
   which does not exist until after the cut. Preview mode blocks nothing, so leaving it in preview
   across the cut adds zero outage risk. The rehearsal's IP+Host validation only confirms the LB
   path is wired, NOT that the WAF is false-positive clean. The enforce flip is therefore a
   **post-real-traffic** step (the no-users cutover soak cannot validate it either): see step 9c.
3. After the LB path is validated, `... CONFIRM_INGRESS_LOCKDOWN=1` takes `lingolinq-web` off the
   public `run.app` URL (LB-only). Run this **after** the 0a smoke test (which uses `run.app`).
The managed cert stays PENDING until step 9 points DNS at the LB IP, so validate the LB in the
rehearsal via the IP + Host header (`curl --resolve <domain>:443:<LB_IP> -k`). This is a
**pre-cutover build**, not improvised in the window. **Expect the managed cert to read
`PROVISIONING` / `domainStatus: FAILED_NOT_VISIBLE` until DNS is flipped** - this is normal, not a
failure; Google can only validate the domain once it resolves to the LB IP. It transitions to
`ACTIVE` after DNS propagates and provisioning completes - budget up to ~60 min past propagation
(+~30 min to be LB-usable), and propagation itself can take hours; see step 9's cert-window note for
the realistic timing and the AAAA/CAA pre-checks.

### 9. DNS cut  (tracker 5.4, GATE: DNS)

- DNS TTL is already at **60s** (lowered in step 1); confirm it propagated before the flip.
- **DNS is on Cloudflare.** At cutover, create a **DNS-only / grey-cloud (unproxied)** `A` record
  `app.lingolinq.com` -> **`136.68.41.122`** (the LB IP from step 8), **TTL 60, and no `AAAA`**. The
  decided path is this A-record-to-LB-IP (Option B); the Cloud-Run custom-domain / CNAME target is
  the Option-A fallback only (step 8). Keep it **grey-cloud (not proxied)** so the Google-managed
  cert validates directly against the LB and traffic is not fronted by Cloudflare's proxy.
  (`app.lingolinq.com` is NXDOMAIN until this record is created.)
- Watch logs, error rate, latency, email deliverability, job processing (tracker 5.5).
- **Do not touch Render prod** (tracker 5.6) except that it stays UP in write-reject mode; it is
  rollback insurance through the soak. Do not scale it to 0 or decommission (step 9b).
- **Managed-cert window (decided: accept it, Scot 2026-06-30).** The managed cert only validates
  AFTER this DNS flip points `app.lingolinq.com` at the LB IP. Expect a `PROVISIONING` window where
  DNS resolves to the LB but the cert is not yet issued, so HTTPS returns a cert error. This is
  acceptable because prod has **no real users at cutover** (only internal testers). Watch for the
  transition to `ACTIVE` before declaring the cut clean:
  `gcloud compute ssl-certificates describe lingolinq-cert --global --project=lingolinq-prod --format='value(managed.status,managed.domainStatus)'`
  - **Realistic timing (Google docs):** provisioning takes up to **~60 min AFTER DNS changes have
    propagated worldwide**, plus up to **~30 min more** before the cert is usable by the LB. And
    propagation itself is not instant even at a 60s TTL: Google notes it "sometimes takes up to 72
    hours worldwide." So do **not** treat 60 min as a hard ceiling - start the clock from when
    `dig +short app.lingolinq.com` first returns the LB IP, and only investigate if it is still
    `PROVISIONING` well after propagation has completed.
  - **Pre-flip gotchas worth a 60-second check (each can silently wedge issuance):**
    1. **Stale AAAA record.** DNS must not resolve to any IP other than the LB. If an `A` record is
       correct but an `AAAA` (IPv6) record still points elsewhere, `domainStatus` goes
       `FAILED_NOT_VISIBLE`. We publish no IPv6 for the LB, so `dig AAAA app.lingolinq.com +short`
       must be **empty**.
    2. **CAA record.** If `lingolinq.com` (or `app.lingolinq.com`, or an inherited parent) has any
       **CAA record**, it must authorize **both** `pki.goog` **and** `letsencrypt.org`: Google
       issues managed certs from either CA and may switch CAs on renewal, so authorizing only one
       "isn't recommended" and can break a later renewal. An empty CAA (the default) allows both.
       Check: `dig CAA lingolinq.com +short` should be **empty**, or list both CAs.
    3. **One claimant.** Confirm only ONE cert resource claims the domain (a second managed cert on
       the same domain stalls both).
    4. **Stale cert in retry-backoff (VERIFIED trap, 2026-07-22 cutover).** If the managed cert was
       created BEFORE `app.lingolinq.com` existed, it has been failing validation on every retry
       since creation, and Google-managed certs use **exponential backoff**. After days of failures
       it only re-checks every several hours, so it will **not** flip to `ACTIVE` promptly after the
       DNS cut even though everything is now correct - our cert was 22 days old and sat at
       `FAILED_NOT_VISIBLE` for 66+ min post-cut with config verified clean (attached to the
       https-proxy, DNS->LB, no AAAA, no CAA). **Pre-flip check:** compare the cert's
       `creationTimestamp` to now; if it predates the DNS record you are about to create, it is
       stale. **Fix (fast):** create a FRESH managed cert and swap it onto the proxy - a new cert
       starts a clean retry schedule and validates in minutes because DNS is already in place:
       ```
       gcloud compute ssl-certificates create lingolinq-cert-v2 \
           --domains app.lingolinq.com --global --project lingolinq-prod
       gcloud compute target-https-proxies update lingolinq-https-proxy \
           --ssl-certificates lingolinq-cert-v2 --global --project lingolinq-prod
       ```
       This is safe mid-cutover: HTTPS is not serving anything while the old cert is stuck, so the
       swap can only improve state, and it is reversible (the old cert is left in place). Better
       still, recreate the cert as part of pre-flip prep so the window starts from a clean cert.
  (To eliminate the window entirely instead, pre-provision via Certificate Manager DNS-authorization
  before the flip - deliberately NOT chosen for this cut.)

### 9c. Cloud Armor WAF: preview -> enforce (POST-REAL-TRAFFIC, GATE: enforce = outage-capable)

The WAF ships and cuts over in **PREVIEW** (step 8, item 2), and it **stays in preview through the
cutover and the no-users soak.** This is deliberate: prod has no real users at cutover, so the soak
generates only internal-tester traffic (and pre-DNS the LB gets none at all - `run.app` bypasses
it). That is enough to prove the LB path, TLS, and app health, but it is **NOT** a representative
sample of real AAC request payloads, so it cannot tell you whether the WAF signature rules would
false-positive on legitimate traffic. "Clean preview logs" during a no-users soak is therefore
trivially true and proves nothing about the WAF.

Enforcement is a **separate, later step gated on REAL production traffic**, not on the cutover soak:
after the first real districts/clinics are actually using the app through the LB (define this as at
least a few days of genuine multi-user traffic, or the first onboarded district), review the preview
hits and only then flip the signature rules to enforce. The rate-limit rule (2000) is gated
separately again and stays in preview even longer (see below). Sequence, when that real-traffic
condition is met:

1. **Review preview hits from real production traffic** (this covers BOTH the WAF rules AND the
   rate-limit rule - all of ours resolve to a deny outcome, so `outcome="DENY"` catches them, and
   `configuredAction` tells them apart: `DENY` for the WAF sig rules, `THROTTLE` for the rate limit).
   **Default output omits `remoteIp`/`requestUrl`** - those land in Cloud Logging under the GCP BAA,
   but printing them to the operator's own terminal is a distinct exposure surface (shell scrollback,
   history, screen share) that the BAA does not cover (Codex review of PR #513):
   ```bash
   gcloud logging read \
     'resource.type="http_load_balancer" AND jsonPayload.previewSecurityPolicy.outcome="DENY"' \
     --project=lingolinq-prod --freshness=<soak-days>d --limit=1000 \
     --format='value(timestamp, insertId, jsonPayload.previewSecurityPolicy.priority, jsonPayload.previewSecurityPolicy.configuredAction, jsonPayload.previewSecurityPolicy.rateLimitAction.outcome)'
   ```
   The `insertId` column above is what you paste into the follow-up command below (Codex review of
   PR #513: the summary command must actually emit the id the follow-up references). Only pull
   `httpRequest.remoteIp` / `httpRequest.requestUrl` as an explicit follow-up, scoped to a
   single `insertId` you are actively investigating (e.g. confirming a specific flagged hit is a real
   AAC utterance, not an attack) - never as the default bulk sweep:
   ```bash
   gcloud logging read \
     'resource.type="http_load_balancer" AND insertId="<id-from-the-summary-above>"' \
     --project=lingolinq-prod --format='value(httpRequest.remoteIp, httpRequest.requestUrl)'
   ```
   Split the hits by `priority` (raise `--limit` / narrow `--freshness` if you hit the cap):
   - **WAF rules 1001-1004** (`configuredAction=DENY`, `outcome=DENY`): each is traffic the WAF
     would block at enforce. Confirm each is genuinely malicious, not a legitimate AAC utterance /
     board payload tripping SQLi/XSS. If a real request is flagged, add a preconfigured-WAF
     exclusion (or lower the rule) and keep it in preview - do NOT enforce over a false positive.
   - **Rate-limit rule 2000** (`configuredAction=THROTTLE`, `rateLimitAction.outcome=RATE_LIMIT_THRESHOLD_EXCEED`):
     see the caveat below - this rule CANNOT be validated by internal-tester traffic, so do not treat
     a clean log as license to enforce it. It is gated separately and stays in preview.

   > **Rate-limit rule 2000 is gated separately and stays in preview.** Even with real traffic, a
   > per-IP limit is uniquely dangerous: the many-users-behind-one-IP pattern real districts/hospitals
   > produce means a whole school or clinic NATs to a single public IP and shares ONE per-IP token
   > bucket (`--enforce-on-key=IP`, 600 req/60s), so a threshold that looks generous per-user can 429
   > an entire building at once. The script therefore does **not** flip rule 2000 with the WAF sig
   > rules: `ARMOR_ENFORCE=1` enforces only 1001-1004 and **does not touch rule 2000 at all**, so no
   > WAF-enforce run can ever flip it to enforcing. Conversely, a routine Armor run will **not**
   > silently downgrade a rule 2000 you have deliberately enforced - it leaves it as-is and prints a
   > `[GATE]` warning, so returning 2000 to preview is only ever done via the explicit revert (step 3).
   > Enforcing 2000 is a deliberate, even-later step - only after its threshold is proven generous for
   > building-scale NAT against real district traffic - done by ALSO passing its own gate:
   > ```bash
   > CONFIRM_LB=1 CONFIRM_ARMOR=1 ARMOR_ENFORCE=1 CONFIRM_ARMOR_ENFORCE=1 \
   >   RATE_LIMIT_ENFORCE=1 CONFIRM_RATE_LIMIT_ENFORCE=1 DOMAIN=app.lingolinq.com \
   >   ./scripts/gcp/phase5-frontend-lb.sh
   > ```
   > After this run, confirm rule 2000 now reads `preview=false` in the step-2e readback (this is the
   > one case where `preview=false` on rule 2000 is the intended, correct result).
2. **Flip to enforce (double-gated):**
   ```bash
   CONFIRM_LB=1 CONFIRM_ARMOR=1 ARMOR_ENFORCE=1 CONFIRM_ARMOR_ENFORCE=1 DOMAIN=app.lingolinq.com \
     ./scripts/gcp/phase5-frontend-lb.sh
   ```
   **`CONFIRM_LB=1` is REQUIRED here**, not just the ARMOR flags: the script hard-exits at the LB
   gate (`phase5-frontend-lb.sh` step 1) whenever `CONFIRM_LB != 1`, so it never reaches the Cloud
   Armor block and the enforce flip silently no-ops (WAF stays in preview while the run reports
   success). The LB build is idempotent (every create is describe-guarded), so re-passing
   `CONFIRM_LB=1` against the already-built LB just skips through to the Armor block. The script
   then converges the **WAF sig rules 1001-1004** to `--no-preview`, does **not** touch rule 2000,
   and prints the actual per-rule preview state PLUS rule 2000's actual threshold (step 2e). For this
   WAF-sig-only enforce run (no `RATE_LIMIT_ENFORCE`), confirm rules 1001-1004 read `preview=false`
   **and rule 2000's preview state is unchanged from whatever it was before this run** - do NOT trust
   the exit code alone, and do NOT assume 2000 reads `preview=true` here: this run never mutates 2000
   either way (correction, Codex review of PR #513), so if 2000 was already deliberately enforced from
   an earlier rate-limit-enforce run, it correctly stays `preview=false` here too. (Rule 2000 first
   reads `preview=false` after the separate rate-limit enforce run in step 1's blockquote.)
3. **Verify** a known-bad probe (e.g. `?q=' OR 1=1--`) now returns `403` and that normal app use is
   unaffected. **Rollback is manual**: re-running the script WITHOUT `ARMOR_ENFORCE` does NOT
   restore preview - the script only converges rules to `--no-preview` (there is no preview-restore
   branch), so a describe-guarded re-run just skips the existing enforcing rules. To roll back, set
   each rule back to preview explicitly:
   ```bash
   for P in 1001 1002 1003 1004 2000; do
     gcloud compute security-policies rules update "$P" \
       --security-policy=lingolinq-armor --preview --project=lingolinq-prod
   done
   ```
   (This manual loop is the ONLY way any enforced rule returns to preview - the script never
   auto-reverts. That is deliberate: once validated and enforced, both the WAF sig rules 1001-1004
   AND rate-limit rule 2000 should stay enforced until an operator explicitly rolls them back here,
   so no routine Armor re-run silently drops a live security control. A non-`RATE_LIMIT_ENFORCE` run
   leaves an already-enforced rule 2000 untouched and prints a `[GATE]` warning rather than
   downgrading it.)

This is independent of the Render decommission (9b) and happens once real production traffic has
been reviewed clean (not the no-users cutover soak).

### 9b. Render decommission - POINTER ONLY (tracker Phase 6, 6.2, GATE: delete prod)

Decommissioning Render (scale to 0, lock/snapshot the DB, archive logs, mark the environment
inactive in the compliance register) is **deliberately out of this runbook.** It happens in
tracker Phase 6 after a clean soak, gated on Scot, with a fresh snapshot + keeper export first.
Doing any of it at cutover would destroy the rollback path. Listed here only so operators know it
is the *next* phase, not a cutover step.

> **Soak guard (decided mechanism):** during soak, Render web stays UP **in write-reject mode**
> (step 1), so any DNS-stale or offline client that reaches Render gets a `503` + `Retry-After` and
> retries against current DNS (GCP, via the 60s TTL) rather than writing to the abandoned Render DB.
> This is what closes the offline-replay divergence for the soak. **Do not scale Render web to 0 and
> do not decommission until after soak AND after Cloud SQL is confirmed authoritative.** Before 6.2
> decommission, run the step-7 delta check against Render one final time and confirm zero
> post-cutover writes landed (write-reject should guarantee this; verify, do not assume).

---

## Rollback plan

The master rollback is **flip DNS back to Render**, which works because Render stayed UP the whole
time in **write-reject mode** (WriteFreeze) - never scaled to 0 and never degraded. Trigger and
steps:

### Rollback triggers (any one -> roll back)

- **0c Redis TLS handshake fails** against live Memorystore and isn't a CA-config fix.
- **Cloud SQL connectivity issues** from the migrate Job / web / worker (VPC, socket, auth).
- **Migrate Job failure** (any non-zero exit; never re-run blind).
- **App-level smoke test failure** post-deploy (login, board load, S3, SES, Resque).
- **Data reconciliation mismatch** (row counts / sequences don't match the dump baseline).
  **(Full-data fallback only - N/A in the active clean-DB path: there is no dump baseline to
  reconcile against.)**

### Rollback steps

> **Recovery is fast because Render web stayed up the whole time** (write-reject mode, never
> scaled to 0). Rollback restores Render writes and brings DNS back; there is no Render cold start
> to wait on.

1. **Disable Render write-reject mode** (flip the feature flag/env off) so writes are accepted
   again, **re-enable the Render workers**, and **re-enable the external writers** paused in step 1
   (rake cron, n8n, the hourly `sync-render-env`). Render's DB was never set read-only, so it is
   immediately authoritative again. Smoke-test Render green (a write succeeds).
2. **Re-point DNS back to Render.** (TTL is 60s, so this propagates fast.)
3. **Reconcile the cutover-window writes (the ONLY manual reconciliation case).** **(Clean-DB path:
   the GCP DB is discarded on rollback since Render stays authoritative, so this normally reduces to
   "accept as lost" for the seeded admin/test accounts - there is no dump baseline to reconcile
   against; the full replay/merge below is the full-data-fallback procedure.)** Any write that
   reached **Cloud SQL** between the DNS flip and the rollback exists only on GCP and must be
   replayed/merged back into Render, or accepted as lost, before standing down. Capture them with
   the step-7 delta check run in reverse (Cloud SQL rows newer than the DNS-flip timestamp). On the
   happy path no manual reconciliation is needed; this step applies only when rollback is triggered.
4. **Secrets:** S2 is additive-only; it writes **new GCP Secret Manager versions** from 1Password
   and does not write Render. **Caveat:** the "Render env is pristine" invariant only holds if the
   hourly `sync-render-env` push was paused for the window/soak (step 1). If it was NOT paused and a
   1Password edit landed, Render env may have drifted; diff Render env against the pre-window
   baseline before trusting rollback.
4. **Sequence drift:** if any writes reached Cloud SQL during a partial cutover, the GCP DB is
   discarded on rollback (Render is authoritative), so no Render-side sequence fix is needed. If a
   later re-attempt reuses the same Cloud SQL DB, **re-run S1** (`phase4-setval-sequences.sh`,
   idempotent) after the next restore before any writes.
5. Confirm Render smoke paths green, then stand down. Leave the GCP services deployed but
   un-DNS'd for diagnosis.

Rollback is non-destructive: nothing in the cutover deletes or rewrites Render data.

---

## Operational tuning  (recommendations; tracker 4.2 validates with real numbers)

These are starting points to set before the dress rehearsal, then right-size from measured
cold-start / p50 / p95 / memory in tracker 4.2.

### Cloud SQL connection planning

- The launch DB is a single zonal `db-custom-1-3840` (1 vCPU / ~3.75 GB). Postgres
  `max_connections` is modest at that tier; budget connections, don't assume headroom.
- Size the ActiveRecord pool per process so that **(web instances x pool) + (worker instances x
  pool) + the migrate Job** stays comfortably under `max_connections`. With `--min-instances 1`
  on web and `--instances 1` on the worker pool, this is small at launch, but verify the number
  rather than assuming.
- **pgbouncer: probably NOT needed at launch scale.** A single small instance with one web +
  one worker instance won't exhaust connections. Revisit pooling when Cloud SQL flips to
  regional/HA on the first paying district/hospital (tracker 6.4) and instance counts grow.

### Cloud Run sizing

- **Web service** (`lingolinq-web`): the cold-start concern lives here (HTTP, request-scaled).
  It deploys `--min-instances 1 --memory 2Gi`; keeping min-instances >= 1 avoids user-visible
  cold starts. Measure p95 and raise memory only if boot/GC pressure shows.
- **Worker pool** (`lingolinq-worker`): `gcloud beta run worker-pools`, always-on, non-HTTP.
  Request-service knobs (request concurrency, `--cpu-boost`) do NOT apply here. The knobs that
  matter are instance count and CPU/memory. **Correction (W1 / dual-review of PR #473): the SIGTERM
  termination grace is a FIXED 10s and is NOT configurable** for services, jobs, or worker pools -
  `gcloud beta run worker-pools deploy` exposes no grace flag (verified against the Cloud Run
  container runtime contract). So the W1 fix is NOT "set a longer grace": it is (a) tuning Resque's
  in-budget timeouts in `bin/docker-worker-entrypoint`
  (`RESQUE_PRE_SHUTDOWN_TIMEOUT=4` + `RESQUE_TERM_TIMEOUT=3` = 7s, under the 10s with headroom), so
  short jobs finish cleanly; and (b) the existing BoyBand requeue-on-`Resque::TermException`
  (PR #473) re-running anything interrupted. Long (multi-minute) slow-queue jobs cannot finish in
  10s regardless and rely on the requeue, not the grace - which is why the non-idempotent
  outbound-webhook notifier must be paused before cutover (step 1).
- The migrate Job runs `gen2` with Cloud SQL attached and full boot secrets; it boots Rails
  fully, so it needs the same `BOOT_SECRETS` set as web, not a subset.

---

## Window scheduling

- **This section describes the full-data-cutover fallback** (dump -> restore -> S1 -> S2), where a
  low-usage window matters because real data is moving and a live-user freeze has a blast radius.
  **The clean-DB path in effect now (see the banner above) does not need a low-usage window for the
  same reason**: `lingolinq-prod` carries no real client data or users
  ([[project_prod_no_real_users]] equivalent - see PHASE5-CLEAN-DB-REHEARSAL.md), so the "lowest AAC
  usage" rationale below does not apply. **Corrected 2026-07-02 (Scot's call):** do not wait for a
  Sunday; schedule the DNS flip once the still-open checklist items below are closed, regardless of
  day/time.
- Full-data fallback guidance (retained in case real users are onboarded before any future
  cutover): lowest AAC usage is overnight with US schools closed; target a **Sunday 02:00-05:00
  America/New_York** slot (~2-3h end to end: announce -> freeze -> fresh dump -> restore -> S1 ->
  S2 -> deploy -> 0b/0c verify -> DNS).
- ~~Earliest realistic date if the rehearsal passes cleanly: Sunday 2026-07-12.~~ **Stale as of
  2026-07-02: the clean-DB rehearsal (0a/0c below) already ran and passed on 2026-06-29** (see
  checklist), so this date no longer gates anything. Schedule per checklist readiness, not calendar.
- Lower the DNS TTL to **60s** ahead of the window (the decided mechanism; see step 1).

---

## Pre-cutover checklist (all must be true before scheduling the window)

- [ ] **0a dress rehearsal - PARTIALLY confirmed, do NOT check this box yet** (Codex review of
      PR #513 correctly caught an earlier draft of this note overclaiming full completion).
      **Confirmed live via Cloud Run job execution history (2026-06-29):** Step 2 Redis TLS
      handshake (`lingolinq-redischeck-zsq74`, 22:38 UTC, PONG over `rediss://`); Step 3a schema
      load (`lingolinq-migrate-cleandb-ss6m8`, `gcp:guarded_schema_load`, 22:46 UTC); Step 3b seed
      (`lingolinq-migrate-cleandb-kzqkk`, `db:seed`, 23:16 UTC, 29m35s incl. the full Moby word
      import); admin **login** confirmed working 2026-06-30 (per session notes).
      **Confirmed live 2026-07-02/03 (five-path re-run against the rehearsal stack):** admin
      **login** (after a one-off password reset via a throwaway Cloud Run Job - self-service
      password change is still broken by the known `valet_login` boolean-coercion bug, fixed in
      PR #506 but not yet deployed to this rehearsal's image
      `web:ccbdb5e21f764754662a42471206fb745854028c`); **board load** rendered fully with 50+
      buttons; **S3 read** returned real 200s from `lingolinq-prod-static` and `opensymbols`.
      **Resque enqueue/process - still open, do not check this box for it, and the picture got
      worse, not better.** The `lingolinq-worker` pool's ~24,842-job `queue:default` backlog
      (leftover `WordData#assert_priority` from the 2026-06-29 Moby seed import, not a bug) was
      drained by a temporary scale to 8 instances (`gcloud beta run worker-pools update
      lingolinq-worker --instances=8`, ~6.6 jobs/sec); the pool has since correctly scaled back
      down to `manualInstanceCount: 1` (verified live, 2026-07-03), and as of the next check
      **all three queues are empty** (`queue:priority`/`queue:default`/`queue:slow` all size 0).
      But `Resque::Failure.count` jumped from `174` to **`914`** across that same window. A first
      pass at this attributed the jump to the scale-8-back-to-1 transition; that was wrong (caught
      by Codex review of PR #516 - the arithmetic didn't even add up) and has been corrected. The
      verified crosstab (job class x error, sums to exactly 914): 830 `SIGKILL` + 2 `SIGSEGV`
      across `ButtonImage`/`BoardDownstreamButtonSet`/`User`; 58 `BoardDownstreamButtonSet` S3
      SigV4/KMS errors, traced to `lib/uploader.rb`'s handcrafted SigV2 POST-policy upload path
      (`Uploader.remote_upload_params`, lines 293-336 - AWSAccessKeyId + HMAC-SHA1, posted via
      `Typhoeus.post`, never touching `Aws::S3::Client`) rather than an SDK client config knob
      (register: `LL-705b10bcd7`, remediation corrected after Codex review of PR #516 caught the
      original "bump signature_version" fix targeting a client this path doesn't use - the real
      fix is replacing the handcrafted policy with a SigV4 presigned POST); 16 `ButtonImage`
      ImageMagick-`identify`-missing
      + 3 `Board` `job_stash` + 1 `Board:update_privacy`-method-not-found, all pre-existing (register:
      `LL-5954bcbbe6`). **The SIGKILL/SIGSEGV failures are NOT clustered around the scale-down
      transition** - an hourly histogram of their `failed_at` timestamps spans 2026-07-03 01h
      through 15h UTC continuously, hours after the pool had already returned to
      `manualInstanceCount: 1`. Root cause confirmed directly via `gcloud logging read` on
      `resource.type=cloud_run_worker_pool`: **833 "Out-of-memory event detected in container" log
      lines** in the trailing 24h, matching the SIGKILL/SIGSEGV count almost exactly. The pool's
      container memory limit is `512Mi` - too small for the forked `ButtonImage`/
      `BoardDownstreamButtonSet` job processes that shell out to ImageMagick. This is a standing
      capacity problem, not a one-time scale-transition artifact (register: `LL-a95e9c5f7c`; the
      existing W1 SIGTERM-requeue fix from PR #473 doesn't cover OOM-killed forked children, so
      these land in `Resque::Failure` instead of being requeued). Our own test job
      (`Board#check_for_parts_of_speech_and_inflections` on board id 7) is not among any sampled
      failure and the queue is now fully empty, which is stronger circumstantial evidence it ran
      successfully than the prior check had, but `board.updated_at` is still unchanged from
      `2026-06-30 21:49:48 UTC` (the method only saves when something actually changes, so this
      remains inconclusive rather than a confirmed pass). **Fix `LL-a95e9c5f7c` before relying on
      this environment for real image-processing load** (register remediation: bump the
      worker-pool's memory limit to 1-2Gi and re-verify `Resque::Failure` stops accumulating this
      error) - this OOM condition will recur continuously under normal single-instance load,
      independent of any worker-pool scaling operation.
      **SES send - functionally confirmed, but verify final delivery before checking this box.**
      The original UI-only "Email sent!" check was correctly flagged as weak (a `gcloud logging
      read` sweep found zero mail-related log lines despite confirmed-working log capture for the
      same service). Re-tested by bypassing ActionMailer's `Aws::Rails::Mailer` delivery method
      (whose `deliver!` return value is the local `Mail::Message`, not the SES API response - the
      first re-test's `message_id` of `...@localhost.mail` was a locally-generated header, not
      proof of anything) and calling `Aws::SES::Client#send_email` directly. It returned a real AWS
      SES message ID (`0101019f28e79404-...-000000` format), meaning SES genuinely accepted the
      send with no exception. This is real server-side confirmation of successful handoff to SES -
      check the box once the test message is confirmed received at the destination inbox (final
      proof of end-to-end delivery, not just acceptance).
      **Update 2026-07-04 (see `PHASE5-0A-STATUS-2026-07-04.md`):** re-tested through the real
      ActionMailer `:ses` adapter (not the raw SDK) directly in Cloud Run - real SES MessageIds
      returned for both recipients, `beta@lingolinq.com` confirmed delivered, direct
      `scotwahlquist@gmail.com` confirmed still non-delivered (checked inbox/spam/trash). This
      partially closes the "was the raw-SDK test representative of the real app" question at the
      adapter level (credentials/region/delivery-method wiring); it used a generic
      `ActionMailer::Base.mail(...)` call rather than a concrete mailer class (`UserMailer` etc.),
      so full mailer-class representativeness is still untested, and per-message delivery-event
      evidence explaining the Gmail gap still doesn't exist. The box stays unchecked. The finding
      this note originally tracked (`LL-42a24ee911`) covered only whether a diagnostic send
      ARRIVED; the residuals described here are now tracked as `LL-abd6c88733`. Current status for
      both is authoritative in `audit-reports/FINDINGS.json`.
- [ ] **New findings from this session's Resque investigation, root-caused and cleared - separate
      gate from 0a, do NOT treat as satisfied just because the 0a Resque smoke-test box above gets
      checked.** Three findings are tracked in the register (`audit-reports/FINDINGS.json`), which
      is authoritative for their current status - this gate is NOT satisfied by a status value
      restated here: `LL-a95e9c5f7c` (lingolinq-worker's 512Mi memory limit causes continuous OOM kills of
      forked `ButtonImage`/`BoardDownstreamButtonSet` job processes - 832 SIGKILL/SIGSEGV failures,
      see above), `LL-705b10bcd7` (S3 SigV4/KMS-SSE misconfiguration on `BoardDownstreamButtonSet`
      - 58 failures, see above), and `LL-5954bcbbe6` (pre-existing: 16 `ButtonImage` failures from a
      missing/misconfigured ImageMagick `identify` binary in the Cloud Run image, 3 `Board`
      `job_stash` lookup failures, and 1 job calling a `Board` method - `update_privacy` - that no
      longer exists, suggesting deploy/version skew). Needs root-cause fixes and re-verification
      (`Resque::Failure.count == 0` or an explained/accepted residual) before this environment is
      customer-facing.
      **Update 2026-07-04 (see `PHASE5-0A-STATUS-2026-07-04.md`):** `LL-5954bcbbe6`'s ImageMagick
      fix (already merged, PR #521) is now live - `lingolinq-web`/`lingolinq-worker` redeployed from
      `origin/staging` (`efb758284`), `identify -version` confirmed working in the new image, and
      `Resque::Failure.count` unchanged at 914 with zero new `identify` failures since the
      redeploy. Not yet exercised under real upload load. `LL-a95e9c5f7c` (OOM) and
      `LL-705b10bcd7` (S3 SigV4) were not touched today - out of scope for this pass.
- [ ] **`lingolinq_admin` test credential rotated or the account deleted - separate gate from 0a, do
      NOT treat as satisfied just because the 0a login box above is checked.** The account currently
      has a deliberately simple, memorable password (Scot's call, 2026-07-03: needed for hands-on
      testing - board creation, org-feature testing - across multiple devices before cutover; not
      a real secret risk today since this rehearsal DB has no real user data). Do not write the
      literal value in this or any other repo file going forward. Once testing is done, either
      rotate to a real secret or delete the account before this environment is customer-facing.
- [x] **0c Redis TLS handshake green against live Memorystore** - see `lingolinq-redischeck-zsq74`
      above (PONG over `rediss://`, CA-chain verified). This box covers the HANDSHAKE only.
      **It does not mean `LL-6619cc1811` is closable yet.** That finding is that *prod* Redis runs
      without TLS, and prod is still Render (`redis://`, plaintext) until the cutover; closure needs
      the prod cutover as well (see 0c), then Scot's explicit sign-off and a register edit. Current
      status is authoritative in `audit-reports/FINDINGS.json`.
- [x] W1 worker SIGTERM grace + requeue fix built + dual-reviewed (tracker 4.W1, **PR #473**,
      merged to staging: `RESQUE_PRE_SHUTDOWN_TIMEOUT=4`/`RESQUE_TERM_TIMEOUT=3` + the
      existing BoyBand requeue).
- [x] **W1 residual DECIDED (Scot, 2026-06-23): pause the outbound-webhook notifier pre-cutover**
      (operational mitigation, step 1) rather than building a per-class selective requeue. The
      blanket requeue's double-run risk is handled by ensuring no long notifier is in flight at the
      freeze. (Selective requeue remains a possible later improvement, not a cutover blocker.)
- [x] 5.3 front-end choice **decided (Option B, LB + Cloud Armor) AND built + provisioned** as of
      2026-06-30: LB IP `136.68.41.122`, Cloud Armor policy attached, WAF rules 1001-1004 + rate-limit
      2000 all in preview (log-only). **Still open, NOT part of this box:** the ingress lockdown (run
      only after the LB path is validated against real DNS traffic) and the DNS cut itself. The WAF
      **enforce** flip is deferred to **post-real-traffic** (step 9c), reviewed against genuine
      multi-user traffic - NOT flipped during the rehearsal or the no-users cutover soak (neither
      produces representative LB traffic). Rate-limit rule 2000 is gated separately again and stays
      in preview even after the sig rules enforce.
- [x] **Render write-reject mode built + tested + dual-reviewed** (tracker 5.2, **PR #472**,
      merged to staging: `WriteFreeze` middleware, ENV-gated `WRITE_FREEZE`, 503 +
      Retry-After on mutating verbs AND side-effect GETs incl. the `lib/json_api` write paths;
      reads pass; auth allowlist). Re-confirm endpoint coverage in the rehearsal.
- [ ] **Client 503 re-queue confirmed in the dress rehearsal:** a frozen offline board-save /
      LogSession write lands on Cloud SQL on the next sync, NOT dropped. Code trace shows the
      offline path already re-queues (`sync_changed` keeps the record `changed` on failure; logs
      re-stashed), so this is a confirmation, not a likely blocker; a confirmed DROP is the only
      no-go. Also spot-check an online direct save under the freeze.
- [x] **Accepted-loss set signed off (Scot, 2026-06-23):** existing-user login Device/token writes
      and `saml/consume` SSO linkage land on Render during the soak and are lost on rollback
      (user re-signs-in after); `auth/google/signup` is blocked. `saml/consume` stays allowlisted.
      See step 1.
- [ ] **Every external writer enumerated and pause-tested:** Render cron services, n8n workflows
      hitting prod, hourly `sync-render-env`, **the outbound webhook notifier**
      (`Webhook.notify_all_with_code`), AND a plan for **inbound webhooks** (Stripe/AWS) 503'd
      during the soak (verified against the LIVE Render dashboard, not this doc).
- [x] Pre-DNS Render-vs-Cloud-SQL delta check defined and dry-run (step 7): built as
      `scripts/gcp/phase5-delta-check.sh` (read-only; forward gate exits non-zero on drift, reverse
      `--since` mode for rollback reconciliation). Dry-run locally 2026-06-24 (zero-delta exit 0,
      drift exit 1, reverse report, read-only write-rejection all verified). The live pre-DNS run
      against Render + Cloud SQL is still a gated cutover step.
- [ ] `SMS_ENCRYPTION_KEY`: `RemoteTarget` sms-row query run against restored DB; seeded + in
      BOOT_SECRETS if any row exists, else confirmed-empty.
- [ ] **DNS TTL lowered to 60s** ahead of the window and propagation confirmed.
- [ ] **Operator quiet-window confirmed before the DNS cut:** no Codex/Claude/browser rehearsal is
      still generating `phase2-*` or synthetic `/api/v1/logs` traffic against prod GCP when DNS is
      flipped (verify with a live `gcloud logging read` sweep). Rehearsal writers must be stood down
      so the post-cut soak reflects only real traffic, not leftover test writes.
- [ ] Operator holds GCP `lingolinq-prod` + 1Password "LingoLinq Prod" + Render API key.
- [x] **Maintenance message (i18n): satisfied by the PR #472 503 page; no proactive announcement
      needed (Scot, 2026-06-24).** Render prod carries no real clients/users at cutover - only a
      few internal/fake test accounts (prod will be brought up to staging, then migrated to GCP) -
      so no user-facing window announcement is warranted. The reactive WriteFreeze 503 page
      (i18n'd `write_freeze.title`/`write_freeze.body`, calm AAC copy, reads still served) is the
      only maintenance surface and is already built + merged. **Re-open this item only if real
      users are onboarded to prod before the cutover window;** then add a proactive announcement
      surface (no in-app banner mechanism exists yet).
