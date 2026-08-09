# Phase 5 Clean-DB Rehearsal Runsheet (Render -> GCP Cloud Run)

Operator runsheet for the **clean-DB cutover variant** decided 2026-06-26 (see the
"CLEAN-DB CUTOVER VARIANT" banner in `PHASE5-CUTOVER-RUNBOOK.md`). `lingolinq-prod` has no
real client data, so there is nothing to dump, restore, or reconcile. This runsheet stands the
GCP stack up on a **fresh seeded Cloud SQL DB** and validates it on a `run.app` URL, with **no
DNS change**. It covers clean-DB steps 1-4; steps 5-6 (LB, DNS, soak, decommission) are
unchanged from the main runbook and run only after this rehearsal is green.

> **SUPERSEDED FOR RE-RUNS AS WRITTEN. Read before executing any step.** This runsheet was
> written for a pre-DNS rehearsal and describes itself below as "non-destructive and
> re-runnable". That was true then. It is not true now: DNS was cut on 2026-07-22, so
> `app.lingolinq.com` resolves to the LB in front of `lingolinq-web`, and step 3a's
> `db:schema:load` DROPS ALL TABLES on the database that the DNS-fronted service is using.
> Re-running this end to end today wipes the live prod database and takes the public hostname
> down. It does not currently destroy real user data (prod has no real users yet, Scot
> 2026-08-09), which is the only reason this is an outage rather than an incident. That will
> stop being true the moment a district is onboarded. Treat every "re-runnable" claim below as
> scoped to the pre-DNS window it was written in, and do not run step 3a against
> `lingolinq-prod-pg` again without a deliberate decision.
>
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
>   Cloud SQL instance and (b) empty. This proof must be bound to the live DB connection (the `DB_*` secrets),
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

  **Provisioned 2026-06-26** in 1Password "LingoLinq Prod" (strong 40-char alphanumeric values):
  - `SEED_ADMIN_PASSWORD (lingolinq-prod)` - item `njww3nwgzpaiblfkgy7vid4iie`, username `lingolinq_admin`.
  - `SEED_LINGOLINQ_PASSWORD (lingolinq-prod)` - item `f3n4fl45syeqqmeif5rcjqfr2a`, username `lingolinq`.

  These are genuinely new secrets, not part of the four `generateValue` boot secrets.
  **Seeded to GCP Secret Manager 2026-06-26** (project `lingolinq-prod`, `userManaged/us-central1`,
  version 1, value piped op -> gcloud and sha256-verified against 1Password; runtime SA
  `lingolinq-run@lingolinq-prod.iam.gserviceaccount.com` granted `secretAccessor`). Reference them
  in the seed Job's `--set-secrets` (Step 3b) as `SEED_ADMIN_PASSWORD=SEED_ADMIN_PASSWORD:latest` and
  `SEED_LINGOLINQ_PASSWORD=SEED_LINGOLINQ_PASSWORD:latest`. Do NOT provision `SEED_DEMO_PASSWORD`.

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
  socket path the `DB_HOST` secret resolves to) - Step 1 asserts against it. (Re-verify
  against live `gcloud` state; do not trust this note.)

- **P4. Demo data stays OFF.** Do NOT set `SEED_DEMO_DATA=1` against prod. It seeds ~20 fabricated
  students, a fake district org, and ~90 days of geo-tagged `LogSession` rows with synchronous
  clustering + weekly-stats generation into prod and its S3 `extra_data` (`db/seeds.rb` demo block).
  It is synthetic (not a real-PII leak) but heavy and awkward to remove from a "clean" prod.
  Clean-prod = baseline only.

---

## Step 1 - Early read-only confirmation the target DB is EMPTY (DRY). DRY: reads only

This is an early sanity check so you do not provision secrets/services against a DB that is not
what you expect. It is **informational only**: the AUTHORITATIVE, irreversible guard is folded
INTO the schema-load execution (Step 3a) so the proof and the `force: :cascade` drop run in the
SAME Job execution and cannot drift (a separate earlier proof does NOT bind to a later destructive
execution - if the `DB_*` secrets rotate between them, or the job re-runs, an earlier "it was
empty" is stale). Run it as a read-only rails-runner Job wired with the SAME `BOOT_SECRETS`
(`DB_HOST`/`DB_NAME`/`DB_USERNAME`/`DB_PASSWORD`) the schema-load Job will use. **Do NOT wire
`DATABASE_URL`**: the app now connects via discrete params (config/database.yml), and a present
`DATABASE_URL` would route to the legacy `url:` branch and re-trigger the `uri >= 1.0` parse failure.

```bash
# DRY. --command bundle --args "exec,rails,runner,<the ruby below>" with BOOT_SECRETS (DB_*) + EXPECTED_CLOUDSQL_HOST set.
# NOTE: easiest is the committed guard - --args "exec,rails,runner,require Rails.root.join('lib','gcp_clean_db_guard'); puts GcpCleanDbGuard.assert_clean_target!"
bundle exec rails runner '
  cfg  = ActiveRecord::Base.connection_db_config.configuration_hash
  host = cfg[:host] || cfg[:socket] || "UNKNOWN"
  expected = ENV.fetch("EXPECTED_CLOUDSQL_HOST")              # from P3; pass via --set-env-vars
  abort("WRONG DB: connected to #{host}, expected #{expected}") unless host.to_s.include?(expected)
  tables = ActiveRecord::Base.connection.tables - %w[schema_migrations ar_internal_metadata]
  abort("DB NOT EMPTY: #{tables.size} app tables") unless tables.empty?
  puts "PREFLIGHT-OK host=#{host} app_tables=0"
'
```

- **Proceed only on `PREFLIGHT-OK`.** Any `WRONG DB` or `DB NOT EMPTY` abort is a HARD STOP - you
  are not in the clean-DB case (or `DB_HOST` is mis-pointed); use the full-data path instead
  and investigate where `DB_HOST` points.
- Do NOT substitute a `psql` query over a hand-opened proxy: that proves a DB you chose, not the one
  the Job will drop. And do not treat this early pass as sufficient on its own - the binding guard
  in Step 3a is what actually protects the drop.

## Step 2 - Redis TLS live handshake (0c, closes LL-6619cc1811). GATE: real go/no-go, runs BEFORE seed

Run BEFORE Step 3, because baseline seeding enqueues to Redis synchronously: `BetaSeed.ensure_baseline!`
creates boards via `Board.process_new` / `ensure_public_board!`, which call `schedule`/`schedule_for`
-> `boy_band` -> `Resque.redis` + `Resque.enqueue`. A broken `rediss://` path makes the SEED itself
fail mid-run (after `schema:load` has already dropped+recreated tables), so prove Redis first.

Run from a Cloud Run context holding the prod `REDIS_URL` (rediss://) + `REDIS_CA_CERT` (cleanest: a
one-off rails-runner Job execution with those secrets):

```bash
# Use rails runner (NOT `ruby -e require initializer`: that does not load ActiveSupport, so
# cattr_accessor is undefined and the initializer raises before it ever reaches Redis).
bundle exec rails runner 'puts(Resque.redis.ping == "PONG" ? "PONG-OK" : "FAIL")'
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

**3a. Guarded schema load (destructive; guard runs IN THE SAME execution).** The host+empty
assertion MUST run in the same Job execution as the `force: :cascade` load, so the proof binds to
the exact DB connection the drop uses and cannot drift. Do NOT rely on the Step 1 early pass as the
guard. **Use the committed `gcp:guarded_schema_load` rake task** (`lib/tasks/gcp_clean_db.rake` +
`lib/gcp_clean_db_guard.rb`, unit-tested in `spec/lib/gcp_clean_db_guard_spec.rb`): it runs the
`GcpCleanDbGuard.assert_clean_target!` check (asserts the connection host contains
`EXPECTED_CLOUDSQL_HOST` AND zero application tables; fail-closed if `EXPECTED_CLOUDSQL_HOST` is
unset) and THEN `db:schema:load`, in one process, so the guard ships in the image rather than as a
fragile inline command. Values are illustrative - resolve every `${{ vars.* }}` against live config
first:

```bash
# GATE. The rake task aborts (non-zero, no load) unless the target is the expected EMPTY Cloud SQL DB.
gcloud run jobs deploy lingolinq-migrate-cleandb \
  --image "$IMAGE" --region "$REGION" \
  --service-account "lingolinq-run@$PROJECT.iam.gserviceaccount.com" \
  --execution-environment gen2 \
  --set-cloudsql-instances "$CLOUDSQL_INSTANCE" \
  --network "$VPC_NETWORK" --subnet "$VPC_SUBNET" --vpc-egress private-ranges-only \
  --command bundle --args "exec,rake,gcp:guarded_schema_load" \
  --task-timeout 1800 \
  --set-env-vars "RACK_ENV=production,RAILS_ENV=production,REDIS_TLS_VERIFY_HOSTNAME=false,EXPECTED_CLOUDSQL_HOST=$EXPECTED_CLOUDSQL_HOST" \
  --set-secrets "$BOOT_SECRETS"
gcloud run jobs execute lingolinq-migrate-cleandb --region "$REGION" --wait
```

`EXPECTED_CLOUDSQL_HOST` is the Cloud SQL host/socket the `DB_HOST` secret resolves to (P3) -
e.g. `/cloudsql/lingolinq-prod:us-central1:lingolinq-prod-pg` for the socket DSN. Alternative if
`schema:load` ever surfaces `schema.rb` drift: `db:migrate` from zero (slower, replays full history,
no `force: :cascade`) - but run it behind the same guard.

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
- **A timed-out word import does NOT self-heal on re-run.** `db/seeds.rb` calls
  `MobyParser.import_words` (and `WordData.import_suggestions`) **only when `WordData.count == 0`**.
  So if 3b times out after inserting some of the ~233k `lib/mobyposi.i` entries, re-running
  `db:seed` SKIPS the import entirely and silently leaves a truncated word set. A vague "hundreds+"
  check passes this. Therefore:
  - **Validate against the expected total, not a floor.** Capture the known-good `WordData.count`
    (per locale) from a clean staging seed and assert the prod count matches it (compare to
    staging's live `WordData.count`), not merely "non-zero".
  - **To fix a truncated import, drive the importer directly** (it is per-word idempotent via
    `find_or_initialize_by`): `bundle exec rails runner 'MobyParser.import_words; WordData.import_suggestions'`
    - which resumes/fills regardless of the count==0 gate - OR `WordData.delete_all` then re-run
    `db:seed`. Do NOT just re-run `db:seed` and assume it resumed.
- **Re-run safety:** `db:seed` (3b) is idempotent for the baseline org/users, but its word-import
  step is count-gated (above). `db:schema:load` (3a) is NOT re-runnable - it drops all tables, so
  never re-run 3a once 3b or any Step-4 activity has written data.

## Step 4 - Stack health + five-path smoke test (0b + smoke). GATE: money (services up)

Deploy the web service + worker pool against the seeded DB (same `gcloud run deploy` /
`gcloud beta run worker-pools deploy` as the deploy + worker steps in `deploy-cloudrun.yml`) and
hit the `run.app` URL directly.

> **A manual `gcloud run deploy` on `lingolinq-web` may serve 0% of traffic.** The deploy
> workflow pins traffic to the specific revision it health-checked, which clears
> `latestRevision`. Once any workflow run has done that, a hand deploy creates a revision that
> takes no traffic and still exits 0. Check with
> `gcloud run services describe lingolinq-web --region us-central1 --format='value(spec.traffic)'`,
> and shift deliberately with
> `gcloud run services update-traffic lingolinq-web --region us-central1 --to-revisions <new>=100`.

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
   Cloud Armor). Build the LB + WAF **in PREVIEW only** (`CONFIRM_LB=1` then `CONFIRM_ARMOR=1`);
   do **NOT** pass `ARMOR_ENFORCE` yet. The WAF enforce flip is a **post-real-traffic** step, not
   part of the cut - see the note below and main runbook step 9c. Validate the LB pre-DNS via IP + Host
   header (`curl --resolve app.lingolinq.com:443:<LB_IP> -k`); expect the managed cert to read
   `PROVISIONING` / `FAILED_NOT_VISIBLE` until DNS is flipped (normal, not a failure).
2. DNS flip at 60s TTL (main runbook step 9). **Toggle `WRITE_FREEZE` on Render at flip time.** It
   is no longer load-bearing for data integrity (no real data to protect), but it is still the cheap
   guard against split-brain: the seeded accounts (`lingolinq_admin`, `lingolinq`) exist on BOTH the
   old Render DB and the new GCP DB, so an internal tester or monitor hitting a DNS-stale Render IP
   during TTL propagation would mutate the abandoned DB and create divergent state that reads as
   "my change disappeared." Keep the freeze build; do not drop it. Accept the managed-cert
   provisioning window after the flip (up to ~60 min past DNS propagation, and propagation can take
   hours; no real users; clear any stale AAAA and check CAA per main runbook step 9 cert note).
3. Soak with the WAF still in preview. **Flip Cloud Armor preview -> enforce only after REAL
   post-launch traffic proves the preview logs clean** (main runbook step 9c): neither the pre-DNS
   rehearsal nor the no-users cutover soak produces representative LB traffic, so enforce cannot be
   validated at the cut. Rate-limit rule 2000 is gated separately and stays in preview even longer.
4. Then Phase 6 Render decommission (`6.2`, separate gated op) only after Cloud SQL is confirmed
   authoritative.

## What this runsheet intentionally does NOT do

- No `pg_dump` / restore / `phase4-setval-sequences` / `phase5-delta-check.sh` - all are real-data
  apparatus and do not apply (see the collapse table in the main runbook banner).
- No DNS change and no Render mutation - the rehearsal is non-destructive and re-runnable.
