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

- The write-freeze is a **feature-flagged write-reject mode** on Render web (503 + Retry-After on
  mutating endpoints, reads still served), combined with a **60s DNS TTL**, NOT a scale-to-0 and
  NOT a DB-level read-only toggle. Render web stays UP through the entire soak; this is the guard
  that stops offline/DNS-stale clients from writing to the abandoned Render DB after cutover
  (decided mechanism, Scot 2026-06-23, Option 1 + 2). No such write-reject mode exists in the
  codebase yet; it is a required pre-cutover build (step 1).
- **Render decommission is NOT part of this runbook.** It is tracker Phase 6 (`6.2`), gated, and
  only after a clean soak AND Cloud SQL confirmed authoritative. See step 9b, a pointer, not an
  action.

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
- **CA-completeness check (dual-review):** `redis_ssl_params` (`config/initializers/resque.rb:56-71`)
  **skips unparseable certs** and only raises if ZERO parse. So a `REDIS_CA_CERT` containing the
  current CA plus a malformed next-rotation CA passes today and fails silently when Memorystore
  rotates mid-soak. Assert the **count** of certs parsed from `REDIS_CA_CERT` equals the expected
  number (log `added`), and confirm the seeded blob contains every currently-valid Memorystore CA,
  not just one that happens to work now. A green PING is necessary but not sufficient.
- **Rollback trigger:** TLS handshake error (cert chain, CA mismatch, connection refused) that is
  not resolved by confirming `REDIS_CA_CERT` is the live instance CA. Do not proceed to DNS with
  Redis unverified; jobs (including log processing) would silently fail post-cutover. Mark
  LL-6619cc1811 **verified-closed** in the register only after this is green against live.

### 1. Write-freeze window - Render write-reject mode  (tracker 5.2, GATE: data move begins)

**The freeze is a write-reject mode on Render web (kept up), NOT a scale-to-0.** And note: the web
app is not the only writer. LingoLinq has writers that do not run inside the web dyno. Freezing the
DB means freezing ALL of them, in this order, BEFORE the dump:

- **Scheduled rake tasks** (`generate_log_summaries`, `push_remote_logs`, `advance_goals`,
  `flush_users`, `clean_old_deleted_boards`, etc.). These are NOT Resque jobs in `render.yaml` and
  there is no `resque-scheduler`; they fire from **Render cron services and/or n8n**, each booting
  its own Rails process that writes prod independently. `flush_users` and `clean_old_deleted_boards`
  are **destructive**. Pause every one before the dump. **Verify the live list against the Render
  dashboard cron services + n8n workflows the day before; do not trust this list.**
- **The hourly `scripts/sync-render-env.js` push** (1Password -> Render env). Pause it for the
  whole window AND soak, or a 1Password edit silently rewrites Render env (breaks the "Render is
  pristine rollback insurance" invariant; see Rollback).
- **n8n workflows that hit prod** (e.g. the cost/PII digest). Pause.

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
  read-only for scheduled maintenance and will be fully back at <time tz>."
- **Do NOT scale Render web to 0, and do NOT decommission, until after soak and after Cloud SQL is
  confirmed authoritative** (step 9b). Render web in write-reject mode is the soak-safety guard.

> **Required build (pre-cutover, like W1): Render write-reject mode.** A feature-flagged
> request-layer guard (Rack middleware or a global `before_action`) that, when the flag/env is on,
> short-circuits every mutating request (POST/PUT/PATCH/DELETE, plus any GET that writes) with HTTP
> `503` and a `Retry-After` header, and an i18n'd body. Reads pass through untouched. Per LingoLinq
> rules this is new user-facing behavior, so it ships behind a flag (`lib/feature_flags.rb`) and is
> tested before the window. It must cover the JSON API write paths the offline clients sync to (the
> `lib/json_api` mutation routes), not just HTML forms. Enumerate and test the mutating-endpoint
> coverage during the dress rehearsal.

> **Residual note:** with writes rejected and TTL at 60s, the post-dump-write data-loss class is
> closed for online clients (they get a 503 and retry against GCP) and for offline clients that
> reconnect after their cached TTL expires. The only manual reconciliation needed is on **rollback**
> (see Rollback); no manual reconciliation is required on the happy path.

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

- DNS TTL is already at **60s** (lowered in step 1); confirm it propagated before the flip.
- At cutover, flip DNS to the new front end (Cloud Run custom-domain target, or the LB IP).
- Watch logs, error rate, latency, email deliverability, job processing (tracker 5.5).
- **Do not touch Render prod** (tracker 5.6) except that it stays UP in write-reject mode; it is
  rollback insurance through the soak. Do not scale it to 0 or decommission (step 9b).

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

The master rollback is **flip DNS back to Render**, which works because Render was only scaled to
0, never degraded. Trigger and steps:

### Rollback triggers (any one -> roll back)

- **0c Redis TLS handshake fails** against live Memorystore and isn't a CA-config fix.
- **Cloud SQL connectivity issues** from the migrate Job / web / worker (VPC, socket, auth).
- **Migrate Job failure** (any non-zero exit; never re-run blind).
- **App-level smoke test failure** post-deploy (login, board load, S3, SES, Resque).
- **Data reconciliation mismatch** (row counts / sequences don't match the dump baseline).

### Rollback steps

> **Recovery is fast because Render web stayed up the whole time** (write-reject mode, never
> scaled to 0). Rollback restores Render writes and brings DNS back; there is no Render cold start
> to wait on.

1. **Disable Render write-reject mode** (flip the feature flag/env off) so writes are accepted
   again, **re-enable the Render workers**, and **re-enable the external writers** paused in step 1
   (rake cron, n8n, the hourly `sync-render-env`). Render's DB was never set read-only, so it is
   immediately authoritative again. Smoke-test Render green (a write succeeds).
2. **Re-point DNS back to Render.** (TTL is 60s, so this propagates fast.)
3. **Reconcile the cutover-window writes (the ONLY manual reconciliation case).** Any write that
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
  build are done. Earliest realistic date if the rehearsal passes cleanly: **Sunday 2026-07-12**.
- Lower the DNS TTL to **60s** ahead of the window (the decided mechanism; see step 1).

---

## Pre-cutover checklist (all must be true before scheduling the window)

- [ ] 0a dress rehearsal passed (all five smoke paths, row reconcile, sequences verified).
- [ ] 0c Redis TLS handshake green against live Memorystore, CA-completeness asserted
      (LL-6619cc1811 verified-closed).
- [ ] W1 worker SIGTERM/requeue fix shipped (tracker 4.W1).
- [ ] 5.3 front-end choice decided AND built (Option A or B).
- [ ] **Render write-reject mode built + tested** (feature-flagged 503 + Retry-After on every
      mutating endpoint incl. the `lib/json_api` write paths; reads pass through). Decided
      mechanism, Option 1 + 2.
- [ ] **Every external writer enumerated and pause-tested:** Render cron services, n8n workflows
      hitting prod, hourly `sync-render-env` (verified against the LIVE Render dashboard, not this
      doc).
- [ ] Pre-DNS Render-vs-Cloud-SQL delta check defined and dry-run (step 7).
- [ ] `SMS_ENCRYPTION_KEY`: `RemoteTarget` sms-row query run against restored DB; seeded + in
      BOOT_SECRETS if any row exists, else confirmed-empty.
- [ ] **DNS TTL lowered to 60s** ahead of the window and propagation confirmed.
- [ ] Operator holds GCP `lingolinq-prod` + 1Password "LingoLinq Prod" + Render API key.
- [ ] Maintenance message (i18n) staged.
