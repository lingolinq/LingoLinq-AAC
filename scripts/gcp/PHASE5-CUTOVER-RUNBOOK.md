# Phase 5 Production Cutover Runbook (Render -> GCP Cloud Run)

LingoLinq-AAC. This is tracker item **4.3** ("write the cutover runbook"): the operator
procedure for the **production cutover** (tracker Phase 5), built on top of the data-layer
steps already shipped in `scripts/gcp/PHASE4-CUTOVER-DATA-RUNBOOK.md` (S1 setval + S2 secret
preservation).

> **Status: DRAFT for review. Nothing here runs before Scot's explicit go.** Every step is
> describable and rehearsable; the real dump/restore/seed/DNS against `lingolinq-prod` are
> cutover actions gated on sign-off. This is a HIPAA-relevant production change.

## Scope and the one rule that governs everything

**Render stays live and authoritative until DNS is flipped, and stays untouched through the
soak.** The master rollback for the entire cutover is "flip DNS back to Render." That only works
if Render is never degraded during the cutover. Therefore:

- The write-freeze is a **hard maintenance window** (Render web + workers scaled to 0), NOT a
  DB-level read-only toggle. No app-level read-only switch exists in the codebase
  (no `maintenance_mode` / `default_transaction_read_only` / feature flag), and a clear
  "back at <time>" page is gentler for AAC users than intermittent write-path 500s.
- **Render decommission is NOT part of this runbook.** It is tracker Phase 6 (`6.2`), gated, and
  only after a clean soak. See step 9b, which is a pointer, not an action.

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

### 0b. Worker health verification  (was Copilot "6b warmup", reframed)

The worker is a Cloud Run **worker-pool** (`gcloud beta run worker-pools`, see
`.github/workflows/deploy-cloudrun.yml`), `--instances 1`, always-on and non-HTTP. There is no
request-driven cold start to "warm up." What matters before DNS is **health**:

- Worker-pool instance is up and `RUNNABLE`.
- It is connected to Memorystore over `rediss://` (TLS) and to Cloud SQL.
- It is draining the `priority`, `default`, and `slow` queues (enqueue a synthetic job, confirm
  it processes).

Run this after the migrate Job + deploys (step 6) and before DNS (step 9).

### 0c. Redis TLS live handshake smoke test  (closes register LL-6619cc1811)

The app-side TLS capability is merged (#410/#416/#417: `rediss://` enables `:ssl` + `:ssl_params`
in `config/initializers/resque.rb`, hostname hatch `REDIS_TLS_VERIFY_HOSTNAME=false`, CA wired
into `BOOT_SECRETS`). It has **never been exercised against the live Memorystore instance**. This
step is that verification.

```
# From a Cloud Run context that has the prod REDIS_URL (rediss://) + REDIS_CA_CERT loaded
# (the migrate Job or a one-off job execution is the cleanest place):
#   ruby -e "require './config/initializers/resque'; Resque.redis.ping == 'PONG'"
# OR the equivalent in a rails runner that exercises RedisInit.redis_options.
```

- **Success criteria:** `PING` returns `PONG` over the `rediss://` endpoint
  (`10.160.1.3:6378`) with CA-chain verification ON (VERIFY_PEER against `REDIS_CA_CERT`) and
  hostname verification OFF. Resque enqueue + process of one synthetic job succeeds.
- **Rollback trigger:** TLS handshake error (cert chain, CA mismatch, connection refused) that is
  not resolved by confirming `REDIS_CA_CERT` is the live instance CA. Do not proceed to DNS with
  Redis unverified; jobs (including log processing) would silently fail post-cutover. Mark
  LL-6619cc1811 **verified-closed** in the register only after this is green against live.

### 1. Hard maintenance window  (tracker 5.2, GATE: data move begins)

- Announce a short maintenance window in advance (see "Window scheduling" below). User-facing
  copy must be i18n'd; for an AAC product the message should be calm and concrete:
  "LingoLinq is briefly offline for scheduled maintenance and will be back at <time tz>."
- At window start, scale Render **web and worker** services to 0 instances (Render dashboard or
  API). This stops all new writes cleanly. Reads stop too; this is intentional (hard maintenance,
  not read-only) and keeps the dump consistent without a half-broken app.
- Confirm no active connections are writing (no in-flight Resque jobs on Render).

### 2. Fresh prod `pg_dump`  (GATE: real data move)

Take a fresh full dump of the Render prod Postgres now that it is quiesced. Use the dump path in
`scripts/gcp/phase3-data-layer.sh` and the preflight in
`PHASE4-CUTOVER-DATA-RUNBOOK.md` section 1. Record the dump's row-count baseline for
reconciliation.

### 3. Restore -> Cloud SQL

Restore the dump whole into `lingolinq_production` on `lingolinq-prod-pg` (private IP
`10.160.0.3`). Reconcile row counts, extensions, and schema against the baseline. The migrate Job
later applies only **incremental** `db:migrate` on top; it never runs `db:prepare` (which could
load `schema.rb` and drop tables; see `deploy-cloudrun.yml:118-124`).

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
- **If SMS source routing is NOT used in prod:** explicitly mark "not required for prod cutover"
  in the cutover log and proceed. (Confirm with Scot which is true before the window.)

### 6. Migrate Job + deploys  (coupled to un-inert, step 7)

In the deploy workflow these are one dispatch: build image -> push to Artifact Registry -> run
`lingolinq-migrate` Cloud Run Job (`db:migrate` only) -> deploy `lingolinq-web` ->
deploy `lingolinq-worker` pool. Triggered by `gh workflow run deploy-cloudrun.yml` **after** the
repo variables are set (step 7) and after S2 has seeded the secrets the Job needs to boot.

Then run **0b (worker health verification)** and **0c (Redis TLS handshake)** against the deployed
services before any DNS change.

### 7. Un-inert  (set GitHub Actions repo variables)

The deploy workflow no-ops while `vars.GCP_PROJECT_ID` is empty (`deploy-cloudrun.yml:65-71`).
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

### 8. Front-end decision gate  (tracker 5.3 - DECIDE before cutover)

The web service currently deploys with `--allow-unauthenticated` straight to the `run.app` URL.
No HTTPS LB or Cloud Armor is built. Before DNS, decide and build ONE of:

- **Option A:** map the custom domain directly to Cloud Run (managed TLS) - simpler.
- **Option B:** front with an external HTTPS Load Balancer + Cloud Armor (WAF / IP rules) - more
  work, more control.

See the separate decision memo
(`~/ai-company-brain/outputs/docs/2026-06-23-cloudrun-frontend-5-3-decision.md`). This is a
**pre-cutover decision gate**, not a step you improvise during the window.

### 9. DNS cut  (tracker 5.4, GATE: DNS)

- Lower the DNS TTL 24-48h **before** the window so the flip propagates fast.
- At cutover, flip DNS to the new front end (Cloud Run custom-domain target, or the LB IP).
- Watch logs, error rate, latency, email deliverability, job processing (tracker 5.5).
- **Do not touch Render prod** (tracker 5.6); it is rollback insurance through the soak.

### 9b. Render decommission - POINTER ONLY (tracker Phase 6, 6.2, GATE: delete prod)

Decommissioning Render (scale to 0, lock/snapshot the DB, archive logs, mark the environment
inactive in the compliance register) is **deliberately out of this runbook.** It happens in
tracker Phase 6 after a clean soak, gated on Scot, with a fresh snapshot + keeper export first.
Doing any of it at cutover would destroy the rollback path. Listed here only so operators know it
is the *next* phase, not a cutover step.

---

## Rollback plan

The master rollback is **flip DNS back to Render**, which works because Render was only scaled to
0, never degraded. Trigger and steps:

### Rollback triggers (any one -> roll back)

- **0c Redis TLS handshake fails** against live Memorystore and isn't a CA-config fix.
- **Cloud SQL connectivity issues** from the migrate Job / web / worker (VPC, socket, auth).
- **Migrate Job failure** (any non-zero exit; never re-run blind).
- **App-level smoke test failure** post-deploy (login, board load, S3, SES, Resque).
- **Data reconciliation mismatch** (row counts / sequences don't match the dump baseline).

### Rollback steps

1. **Re-point DNS back to Render.** (TTL was already lowered, so this propagates fast.)
2. **Scale Render web + worker back up** from 0 to their prior instance counts. Render's DB was
   never set read-only and its env was never modified, so Render returns to full service as soon
   as the app processes are back. (There is **no "re-enable DB writes"** step; the freeze was
   app-scale-to-0, not a DB toggle.)
3. **Secrets:** nothing to restore on the Render side. S2 is additive-only; it writes **new GCP
   Secret Manager versions** from 1Password and never modifies Render's environment. The Render
   secrets that were live before the window are still live.
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
  matter are instance count, CPU/memory, and **SIGTERM grace**, which is exactly the W1 fix (long
  slow-queue jobs must not be cut off / lost on instance replacement). Set adequate termination
  grace before cutover.
- The migrate Job runs `gen2` with Cloud SQL attached and full boot secrets; it boots Rails
  fully, so it needs the same `BOOT_SECRETS` set as web, not a subset.

---

## Window scheduling

- **Lowest AAC usage** is overnight with US schools closed. Target a **Sunday 02:00-05:00
  America/New_York** slot (~2-3h end to end: announce -> freeze -> fresh dump -> restore -> S1 ->
  S2 -> deploy -> 0b/0c verify -> DNS).
- **Not schedulable to a firm date** until the dress rehearsal (0a), W1, and the 5.3 front-end
  build are done. Earliest realistic date if the rehearsal passes cleanly: **Sunday 2026-07-13**.
- Lower the DNS TTL 24-48h ahead.

---

## Pre-cutover checklist (all must be true before scheduling the window)

- [ ] 0a dress rehearsal passed (all five smoke paths, row reconcile, sequences verified).
- [ ] 0c Redis TLS handshake green against live Memorystore (LL-6619cc1811 verified-closed).
- [ ] W1 worker SIGTERM/requeue fix shipped (tracker 4.W1).
- [ ] 5.3 front-end choice decided AND built (Option A or B).
- [ ] `SMS_ENCRYPTION_KEY` decision made (seed + add to BOOT_SECRETS, or mark not-required).
- [ ] DNS TTL lowered 24-48h ahead.
- [ ] Operator holds GCP `lingolinq-prod` + 1Password "LingoLinq Prod" + Render API key.
- [ ] Maintenance message (i18n) staged.
