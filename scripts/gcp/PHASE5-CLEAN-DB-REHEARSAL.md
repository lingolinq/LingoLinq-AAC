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

> **Two hard gates, both irreversible if wrong - do not treat either as a formality:**
> - **Step 1 (host-bound empty proof).** `db:schema:load` uses `force: :cascade` and DROPS every
>   table. The ONLY thing standing between this rehearsal and irreversibly destroying the still
>   authoritative Render prod DB is proving that the DB the Job will actually connect to is (a) the
>   Cloud SQL instance and (b) empty. This proof must be bound to the live `DATABASE_URL` secret,
>   not to a hand-typed proxy connection (see Step 1).
> - **Step 2 (Redis TLS handshake, `LL-6619cc1811`).** The `rediss://` path to Memorystore has
>   never been exercised live, and **seeding itself enqueues to Redis synchronously** (see Step 3),
>   so Redis must be proven BEFORE the seed runs, not after.

---

## Operator identity (HIPAA)

Same as the main runbook: run as Scot or a designated engineer holding all three of prod GCP
access (`lingolinq-prod`), the 1Password "LingoLinq Prod" vault, and a Render API key. Single
operator host, never `bash -x` (tracing leaks secrets). Record start/end times for the compliance
register.

## Prerequisites (do these before step 1)

- **P1. SEED_* passwords must exist (NEW secrets). GATE: secret creation.**
  `db/seeds.rb` HARD-STOPS in production unless these are set, because `seed_password` raises when
  `Rails.env.production?` and the env key is blank. Baseline seeding (`BetaSeed.ensure_baseline!`)
  reads exactly two of them:
  - `SEED_ADMIN_PASSWORD` - the `lingolinq_admin` account (admin org owner; this is how you log in
    after cutover). **Required.**
  - `SEED_LINGOLINQ_PASSWORD` - the `lingolinq` system-boards user. **Required.**
  - `SEED_DEMO_PASSWORD` - demo user(s). **Only needed if you set `SEED_DEMO_DATA=1`, which you must
    NOT do against prod** (see P4). Omit it; do not provision a demo password for the clean-prod
    seed.

  Create strong values in 1Password "LingoLinq Prod", add each to GCP Secret Manager, and reference
  them in the seed Job's `--set-secrets` (Step 3). These are genuinely new secrets, not part of the
  four `generateValue` boot secrets.

- **P2. Confirm the four boot secrets are seeded (preserve, not regenerate). DRY then GATE.**
  ```bash
  # DRY: read 1Password + Render, compare byte-for-byte, write nothing.
  ./scripts/gcp/phase4-seed-boot-secrets.sh --verify
  # GATE (seed): only after --verify is all-green.
  CONFIRM_SEED_SECRETS=1 ./scripts/gcp/phase4-seed-boot-secrets.sh
  ```
  Seeds `SECRET_KEY_BASE COOKIE_KEY SECURE_ENCRYPTION_KEY SECURE_NONCE_KEY` into Secret Manager
  with verified bytes. Decision (Scot 2026-06-26): **preserve** these even on a clean DB. (Safe:
  wiping the DB removes all `secure_serialize` ciphertext AND all `ExternalNonce` rows together, so
  the preserved encryption/nonce keys are never left pointing at orphaned ciphertext; the fresh seed
  writes new ciphertext + nonces under the same keys.)

- **P3. Confirm GCP data layer is provisioned.** Cloud SQL PG18 instance `lingolinq-prod-pg` and
  Memorystore (AUTH/TLS) exist from Phase 3/4. Confirm `vars.GCP_CLOUDSQL_INSTANCE`
  (`PROJECT:REGION:INSTANCE`), `GCP_REGION`, `GCP_PROJECT_ID`, `GCP_VPC_NETWORK`, `GCP_VPC_SUBNET`
  are set on the deploy workflow, and **record the expected Cloud SQL host** (the private IP /
  socket path the `DATABASE_URL` secret should resolve to) - Step 1 asserts against it. (Re-verify
  against live `gcloud` state; do not trust this note.)

- **P4. Demo data stays OFF.** Do NOT set `SEED_DEMO_DATA=1` against prod. It seeds ~20 fabricated
  students, a fake district org, and ~90 days of geo-tagged `LogSession` rows with synchronous
  clustering + weekly-stats generation into prod and its S3 `extra_data` (`db/seeds.rb` demo block).
  It is synthetic (not a real-PII leak) but heavy and awkward to remove from a "clean" prod.
  Clean-prod = baseline only.

---

## Step 1 - Host-bound proof that the target DB is EMPTY (irreversible gate). GATE: read live DB

This is the irreversible gate. `db:schema:load` (`force: :cascade`) drops every table, and the
committed migrate Job's own comment (`deploy-cloudrun.yml:118-131`) forbids schema-load precisely
because, against the wrong/populated `DATABASE_URL`, it destroys data irreversibly. The clean-DB
path re-introduces schema-load, so the guard MUST be bound to the exact `DATABASE_URL` secret the
destructive Job uses - **not** a hand-typed proxy connection that could point somewhere else.

Run this as a **read-only rails-runner Job execution wired with the SAME `DATABASE_URL` secret** as
the schema-load Job (i.e. deploy the Job with `--set-secrets "...DATABASE_URL=DATABASE_URL:latest"`
and `--command rails --args "runner,<<preflight>>"`). It aborts unless the connection is the
expected Cloud SQL host AND has zero app tables:

```ruby
# READ-ONLY preflight. Exits non-zero (fails the Job) unless BOTH hold.
cfg  = ActiveRecord::Base.connection_db_config.configuration_hash
host = cfg[:host] || cfg[:socket] || 'UNKNOWN'
expected = ENV.fetch('EXPECTED_CLOUDSQL_HOST')                # from P3; pass via --set-env-vars
abort("WRONG DB: connected to #{host}, expected #{expected}") unless host.to_s.include?(expected)
tables = ActiveRecord::Base.connection.tables - %w[schema_migrations ar_internal_metadata]
abort("DB NOT EMPTY: #{tables.size} app tables (#{tables.first(5).join(', ')}...)") unless tables.empty?
puts "PREFLIGHT-OK host=#{host} app_tables=0"
```

- **Proceed only on `PREFLIGHT-OK`.** Any `WRONG DB` or `DB NOT EMPTY` abort is a HARD STOP - you
  are not in the clean-DB case (or `DATABASE_URL` is mis-pointed); use the full-data path instead
  and investigate where `DATABASE_URL` resolves.
- Do NOT substitute a `psql` query over a hand-opened proxy: that proves a DB you chose, not the one
  the Job will drop.

## Step 2 - Redis TLS live handshake (0c, closes LL-6619cc1811). GATE: real go/no-go, runs BEFORE seed

Run BEFORE Step 3, because baseline seeding enqueues to Redis synchronously: `BetaSeed.ensure_baseline!`
creates boards via `Board.process_new` / `ensure_public_board!`, which call `schedule`/`schedule_for`
-> `boy_band` -> `Resque.redis` + `Resque.enqueue`. A broken `rediss://` path makes the SEED itself
fail mid-run (after `schema:load` has already dropped+recreated tables), so prove Redis first.

Run from a Cloud Run context holding the prod `REDIS_URL` (rediss://) + `REDIS_CA_CERT` (cleanest: a
one-off rails-runner Job execution with those secrets):

```bash
ruby -e "require './config/initializers/resque'; puts(Resque.redis.ping == 'PONG' ? 'PONG-OK' : 'FAIL')"
```

- **Success:** `PING` returns `PONG` over `rediss://` (the `10.160.1.3:6378` endpoint) with
  CA-chain verification ON and hostname verification OFF; one synthetic Resque enqueue + process
  succeeds.
- **CA-completeness assertion (dual-review):** `redis_ssl_params`
  (`config/initializers/resque.rb:56-71`) **skips unparseable certs** and only raises on zero
  parsed. So a `REDIS_CA_CERT` with the current CA plus a malformed next-rotation CA passes today
  and fails silently when Memorystore rotates mid-soak. Assert the **count** of parsed certs equals
  the expected number (count `-----BEGIN CERTIFICATE-----` blocks and compare; log `added`), and
  confirm the blob holds every currently-valid Memorystore CA. A green PING is necessary but not
  sufficient.
- **No-go:** any TLS handshake error (cert chain / CA mismatch / connection refused) not resolved
  by confirming `REDIS_CA_CERT` is the live instance CA. Do not proceed; jobs (incl. log
  processing) and the seed itself would fail. Mark LL-6619cc1811 **verified-closed** in the register
  only after this is green against live.

## Step 3 - Build schema, then seed (two SEPARATE gated executions). GATE: data-destructive, money

The default migrate Job (`deploy-cloudrun.yml`) runs `bundle exec rake db:migrate` ONLY, and its
own comment notes it deliberately does NOT load schema (the full-data path provisions schema via the
Phase 3 restore). Clean-DB has no restore, so we need a schema build + seed. **Run them as two
separate Job executions, not one combined `db:schema:load,db:seed`** - because `schema:load` is
`force: :cascade` (re-drops all tables), a combined Job is NOT safely re-runnable once any data
exists (e.g. after smoke testing in Step 4). Splitting lets you re-run the idempotent seed without
re-dropping.

**3a. Schema load (destructive; only after Step 1 PREFLIGHT-OK in the same run).** Recommended
`db:schema:load` (fast, authoritative `db/schema.rb`). Alternative `db:migrate` from zero (slower,
replays full migration history, no `force: :cascade`) only if `schema:load` surfaces schema.rb drift.
Values below are illustrative - resolve every `${{ vars.* }}` against live config first:

```bash
# GATE. Resolve REGION / PROJECT / CLOUDSQL_INSTANCE / VPC from live deploy-workflow vars first.
gcloud run jobs deploy lingolinq-migrate-cleandb \
  --image "$IMAGE" --region "$REGION" \
  --service-account "lingolinq-run@$PROJECT.iam.gserviceaccount.com" \
  --execution-environment gen2 \
  --set-cloudsql-instances "$CLOUDSQL_INSTANCE" \
  --network "$VPC_NETWORK" --subnet "$VPC_SUBNET" --vpc-egress private-ranges-only \
  --command bundle --args "exec,rake,db:schema:load" \
  --task-timeout 1800 \
  --set-env-vars "RACK_ENV=production,RAILS_ENV=production,REDIS_TLS_VERIFY_HOSTNAME=false" \
  --set-secrets "$BOOT_SECRETS"
gcloud run jobs execute lingolinq-migrate-cleandb --region "$REGION" --wait
```

**3b. Seed (idempotent; needs Redis from Step 2 green and the SEED_* secrets).** Update the Job's
args to `exec,rake,db:seed` and add the seed secrets, then execute:

```bash
gcloud run jobs update lingolinq-migrate-cleandb --region "$REGION" \
  --args "exec,rake,db:seed" \
  --task-timeout 3600 \
  --set-secrets "$BOOT_SECRETS,SEED_ADMIN_PASSWORD=...,SEED_LINGOLINQ_PASSWORD=..."
gcloud run jobs execute lingolinq-migrate-cleandb --region "$REGION" --wait
```

- **What seed actually does (budget for it):** `db/seeds.rb` runs idempotently and, on an empty
  `WordData` table (always true on a clean DB), performs a **full Moby word import**
  (`MobyParser.import_words` over `lib/mobyposi.i`) - tens of thousands of row-by-row
  `find_or_initialize_by`+`save!` inserts with per-row stdout, plus `WordData.import_suggestions`.
  This is multi-minute and log-heavy; that is why 3b sets a generous `--task-timeout 3600` and why a
  truncated import looks like a Job timeout, not a clean failure.
- **Success:** Job exits 0; `BetaSeed.ensure_baseline!` has created the admin org + `lingolinq_admin`.
  **Assert the import completed** rather than assuming it: e.g. one-off `rails runner` ->
  `WordData.where(locale: 'en').count` is non-trivial (hundreds+). A near-zero count means a
  truncated import - re-run 3b (seed is idempotent; this does NOT re-drop tables).
- **Re-run safety:** `db:seed` (3b) is idempotent and safe to re-run. `db:schema:load` (3a) is NOT -
  re-running it drops all tables, so never re-run 3a once 3b or any Step-4 activity has written data.

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
2. DNS flip at 60s TTL (main runbook step 9). **Toggle `WRITE_FREEZE` on Render at flip time.** It
   is no longer load-bearing for data integrity (no real data to protect), but it is still the cheap
   guard against split-brain: the seeded accounts (`lingolinq_admin`, `lingolinq`) exist on BOTH the
   old Render DB and the new GCP DB, so an internal tester or monitor hitting a DNS-stale Render IP
   during TTL propagation would mutate the abandoned DB and create divergent state that reads as
   "my change disappeared." Keep the freeze build; do not drop it.
3. Soak, then Phase 6 Render decommission (`6.2`, separate gated op) only after Cloud SQL is
   confirmed authoritative.

## What this runsheet intentionally does NOT do

- No `pg_dump` / restore / `phase4-setval-sequences` / `phase5-delta-check.sh` - all are real-data
  apparatus and do not apply (see the collapse table in the main runbook banner).
- No DNS change and no Render mutation - the rehearsal is non-destructive and re-runnable.
