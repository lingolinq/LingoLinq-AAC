# Phase 5 Clean-DB Rehearsal Runsheet (Render -> GCP Cloud Run)

Operator runsheet for the **clean-DB cutover variant** decided 2026-06-26 (see the
"CLEAN-DB CUTOVER VARIANT" banner in `PHASE5-CUTOVER-RUNBOOK.md`). `lingolinq-prod` has no
real client data, so there is nothing to dump, restore, or reconcile. This runsheet stands the
GCP stack up on a **fresh seeded Cloud SQL DB** and validates it on a `run.app` URL, with **no
DNS change**. It covers clean-DB steps 1-4; steps 5-6 (LB, DNS, soak, decommission) are
unchanged from the main runbook and run only after this rehearsal is green.

> **Status: DRAFT. Nothing here runs before Scot's explicit go.** The seed/secret reads and the
> Cloud SQL / Cloud Run spin-up are real, cost money, and are HIPAA-relevant infra actions. Every
> step has a dry/verify mode that touches nothing; run those first. Re-verify live state (Render
> cron, secrets, GCP provisioning) the day of, per the twice-burned rule on this project.

Legend: **GATE** = needs Scot go-ahead (money / live infra / data-destructive). **DRY** = no
state change, safe to run anytime.

---

## Operator identity (HIPAA)

Same as the main runbook: run as Scot or a designated engineer holding all three of prod GCP
access (`lingolinq-prod`), the 1Password "LingoLinq Prod" vault, and a Render API key. Single
operator host, never `bash -x` (tracing leaks secrets). Record start/end times for the compliance
register.

## Prerequisites (do these before step 1)

- **P1. SEED_* passwords must exist (NEW secrets). GATE: secret creation.**
  `db/seeds.rb` HARD-STOPS in production unless these are set, because `seed_password` raises when
  `Rails.env.production?` and the env key is blank:
  - `SEED_ADMIN_PASSWORD` - the `lingolinq_admin` account (admin org owner; this is how you log in
    after cutover).
  - `SEED_DEMO_PASSWORD` - demo user(s).
  - `SEED_LINGOLINQ_PASSWORD` - the `lingolinq` system-boards user.
  - (optional) `SEED_ACCESSIBILITY_USERS=1` + `SEED_EYE_GAZE_PASSWORD` / `SEED_SWITCH_USER_PASSWORD`
    only if you want the eyegaze/switch demo accounts.

  Create strong values in 1Password "LingoLinq Prod", add each to GCP Secret Manager, and you will
  reference them in the migrate Job's `--set-secrets` (step 2). These are genuinely new secrets,
  not part of the four `generateValue` boot secrets.

- **P2. Confirm the four boot secrets are seeded (preserve, not regenerate). DRY then GATE.**
  ```bash
  # DRY: read 1Password + Render, compare byte-for-byte, write nothing.
  ./scripts/gcp/phase4-seed-boot-secrets.sh --verify
  # GATE (seed): only after --verify is all-green.
  CONFIRM_SEED_SECRETS=1 ./scripts/gcp/phase4-seed-boot-secrets.sh
  ```
  Seeds `SECRET_KEY_BASE COOKIE_KEY SECURE_ENCRYPTION_KEY SECURE_NONCE_KEY` into Secret Manager
  with verified bytes. Decision (Scot 2026-06-26): **preserve** these even on a clean DB.

- **P3. Confirm GCP data layer is provisioned.** Cloud SQL PG18 instance `lingolinq-prod-pg` and
  Memorystore (AUTH/TLS) exist from Phase 3/4. Confirm `vars.GCP_CLOUDSQL_INSTANCE`
  (`PROJECT:REGION:INSTANCE`), `GCP_REGION`, `GCP_PROJECT_ID`, `GCP_VPC_NETWORK`, `GCP_VPC_SUBNET`
  are set on the deploy workflow. (Re-verify against live `gcloud` state; do not trust this note.)

---

## Step 1 - Confirm target Cloud SQL DB is EMPTY (data-destructive guard). GATE: read live DB

`db:schema:load` uses `force: :cascade`, which **DROPS every table**. That is exactly right
against a fresh empty DB and **catastrophic** against a populated one. Before any schema build,
prove the target is empty.

```sql
-- READ-ONLY. Run against the Cloud SQL lingolinq_production DB (via the socket proxy or a
-- one-off job execution). Expect ZERO user tables.
SELECT count(*) AS user_tables
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
```

- **Proceed only if `user_tables = 0`** (or only `schema_migrations`/`ar_internal_metadata`
  exist and you intend to wipe). If ANY app table has rows, STOP - this is not the clean-DB case;
  use the full-data path in the main runbook instead.

## Step 2 - Build schema + seed on a fresh Cloud SQL DB. GATE: data-destructive, money

The default migrate Job (`deploy-cloudrun.yml`) runs `bundle exec rake db:migrate` ONLY, and its
own comment notes it deliberately does NOT load schema (the full-data path provisions schema via
the Phase 3 restore). Clean-DB has no restore, so we need a **schema-load + seed** invocation
instead. Two options:

- **Recommended: `db:schema:load` then `db:seed`** - fast, uses authoritative `db/schema.rb`.
  Requires the empty-DB guard (step 1) because of `force: :cascade`.
- Alternative: `db:migrate` from zero - builds schema by replaying full migration history (slower,
  exercises old migrations), then `db:seed`. No `force: :cascade`. Use only if `schema:load`
  surfaces a schema.rb/migration drift.

Deploy a one-off variant of the migrate Job with the seed secrets attached. **Do not edit the
committed workflow for the rehearsal**; run an ad-hoc `gcloud run jobs` with the same network/SA
wiring (values below are illustrative - resolve every `${{ vars.* }}` against live config first):

```bash
# GATE. Resolve REGION / PROJECT / CLOUDSQL_INSTANCE / VPC from live deploy-workflow vars first.
gcloud run jobs deploy lingolinq-migrate-cleandb \
  --image "$IMAGE" \
  --region "$REGION" \
  --service-account "lingolinq-run@$PROJECT.iam.gserviceaccount.com" \
  --execution-environment gen2 \
  --set-cloudsql-instances "$CLOUDSQL_INSTANCE" \
  --network "$VPC_NETWORK" --subnet "$VPC_SUBNET" --vpc-egress private-ranges-only \
  --command bundle \
  --args "exec,rake,db:schema:load,db:seed" \
  --set-env-vars "RACK_ENV=production,RAILS_ENV=production,REDIS_TLS_VERIFY_HOSTNAME=false" \
  --set-secrets "$BOOT_SECRETS,SEED_ADMIN_PASSWORD=...,SEED_DEMO_PASSWORD=...,SEED_LINGOLINQ_PASSWORD=..."
gcloud run jobs execute lingolinq-migrate-cleandb --region "$REGION" --wait
```

- **Success:** Job exits 0; `db/seeds.rb` runs idempotently; `BetaSeed.ensure_baseline!` creates
  the admin org + `lingolinq_admin`. Re-run is safe (seeds are idempotent).
- **Decision for Scot:** confirm what "seed" means for clean prod - baseline only (admin org +
  system users), or also demo data (`SEED_DEMO_DATA` / accessibility users). Recommend
  **baseline only** for prod; no demo data unless you want it for first-look testing.

## Step 3 - Redis TLS live handshake (0c, closes LL-6619cc1811). GATE: real go/no-go

This is **the** gate of the clean-DB path: the `rediss://` TLS path to Memorystore has never been
exercised live. Run from a Cloud Run context holding the prod `REDIS_URL` (rediss://) +
`REDIS_CA_CERT` (cleanest: a one-off execution of the migrate Job or a rails-runner job).

```bash
# In-container, exercises the real initializer:
ruby -e "require './config/initializers/resque'; puts(Resque.redis.ping == 'PONG' ? 'PONG-OK' : 'FAIL')"
```

- **Success:** `PING` returns `PONG` over `rediss://` (the `10.160.1.3:6378` endpoint) with
  CA-chain verification ON and hostname verification OFF; one synthetic Resque enqueue + process
  succeeds.
- **CA-completeness assertion (dual-review):** `redis_ssl_params`
  (`config/initializers/resque.rb:56-71`) **skips unparseable certs** and only raises on zero
  parsed. So a `REDIS_CA_CERT` with the current CA plus a malformed next-rotation CA passes today
  and fails silently when Memorystore rotates mid-soak. Assert the **count** of parsed certs equals
  the expected number (log `added`), and confirm the blob holds every currently-valid Memorystore
  CA. A green PING is necessary but not sufficient.
- **No-go:** any TLS handshake error (cert chain / CA mismatch / connection refused) not resolved
  by confirming `REDIS_CA_CERT` is the live instance CA. Do not proceed; jobs (incl. log
  processing) would silently fail post-cutover. Mark LL-6619cc1811 **verified-closed** in the
  register only after this is green against live.

## Step 4 - Stack health + five-path smoke test (0b + smoke). GATE: money (services up)

Deploy the web service + worker pool against the seeded DB (same `gcloud run deploy` /
`gcloud beta run worker-pools deploy` as `deploy-cloudrun.yml` lines 150-181) and hit the
`run.app` URL directly - still **no DNS**.

- **0b worker health:** worker-pool instance `RUNNABLE`, connected to Memorystore over `rediss://`
  and Cloud SQL, draining `priority`/`default`/`slow` (enqueue a synthetic job, confirm it
  processes).
- **Five smoke paths (all must be green):**
  1. **Login** as `lingolinq_admin` (the seeded admin, password = `SEED_ADMIN_PASSWORD`).
  2. **Board load** - open a board in the app.
  3. **S3 read** - an image/sound asset loads (hybrid S3 stays on AWS).
  4. **SES send** - trigger a transactional email (e.g. password reset to a test inbox).
  5. **Resque enqueue + process** - a background job runs end to end.

- **Success:** all five green, no boot errors. The clean-DB stack is validated; you are clear to
  schedule the DNS window (main runbook steps 5/8 LB + 9 DNS).
- **Failure:** stop and fix. Nothing here touches Render or DNS, so the rehearsal is fully
  reversible - tear down the `run.app` services and re-run.

---

## After a green rehearsal

Proceed to the unchanged tail of the main runbook, in the clean-DB framing:

1. Frontend LB + Cloud Armor - `scripts/gcp/phase5-frontend-lb.sh` (#476, Option B HTTPS LB +
   Cloud Armor; honor `CONFIRM_ARMOR_ENFORCE`).
2. DNS flip at 60s TTL (main runbook step 9). Optionally toggle `WRITE_FREEZE` on Render at flip
   time for tidiness; it is no longer load-bearing (no data to protect).
3. Soak, then Phase 6 Render decommission (`6.2`, separate gated op) only after Cloud SQL is
   confirmed authoritative.

## What this runsheet intentionally does NOT do

- No `pg_dump` / restore / `phase4-setval-sequences` / `phase5-delta-check.sh` - all are real-data
  apparatus and do not apply (see the collapse table in the main runbook banner).
- No DNS change and no Render mutation - the rehearsal is non-destructive and re-runnable.
