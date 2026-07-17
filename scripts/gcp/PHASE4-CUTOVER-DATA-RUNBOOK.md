# Phase 4 Cutover - Data Runbook (S1 setval + S2 secret preservation)

LingoLinq Render -> GCP Cloud Run migration. This runbook covers the two "after restore"
data-layer cutover steps that this branch ships:

- **S1** - reset Postgres sequences after the dump/restore so the next insert cannot collide.
- **S2** - copy the four `generateValue` secrets into GCP Secret Manager, preserving their bytes.

It is the operator companion to:

- `scripts/gcp/phase4-setval-sequences.sql` + `phase4-verify-sequences.sql` (S1 logic, single source of truth)
- `scripts/gcp/phase4-setval-sequences.sh` (S1 cutover runner) and `rake db:setval_all_sequences` / `rake db:verify_sequences` (S1 rehearsal/test)
- `scripts/gcp/phase4-seed-boot-secrets.sh` (S2 runner)

> Nothing in this runbook is run before Scot's explicit go. S1 and S2 are safe to **rehearse**
> (rake against a local DB, `--verify`/`--fingerprint`/plan modes), but the real restore + seed
> against `lingolinq-prod` are cutover actions. Render stays fully live and authoritative until
> the DNS flip; these steps never touch Render.

---

## 0. Operator identity (HIPAA)

Run as **Scot or a designated engineer** holding all three: prod GCP access (project
`lingolinq-prod`), the **1Password "LingoLinq Prod"** vault, and a **Render** API key for the
prod service. This is an auditable production change. Run on a single-operator host, never a
shared box, and never under `bash -x` (tracing would leak secret material; the scripts disable
xtrace defensively in their secret regions, but the surrounding shell would not).

## 1. Preflight (confirm ALL before any command - avoids half-runs)

- [ ] Cloud SQL `lingolinq-prod-pg` reachable (cloud-sql-proxy running on a local port, OR you
      will use `gcloud sql connect`).
- [ ] `gcloud auth list` shows the right active account; `gcloud config get project` = `lingolinq-prod`.
- [ ] 1Password session valid: `op whoami` (or `op vault list`) succeeds.
- [ ] `RENDER_API_KEY` exported, e.g. `export RENDER_API_KEY="$(op read 'op://LingoLinq Admin/Render API/credential')"`.
- [ ] `psql`, `jq`, `curl`, `gcloud`, `op` all on PATH.
- [ ] The Render prod DB has been dumped and restored into `lingolinq_production` on Cloud SQL
      (the step that precedes S1). Row counts reconciled against the dump baseline.

## 2. Order of operations

The full cutover order is: write-freeze Render -> dump -> restore -> **S1 (setval+verify)** ->
**S2 (verify+seed)** -> migrate Job -> un-inert (`GCP_PROJECT_ID`) -> LB -> DNS. This runbook is
S1 then S2. Do S1 first: the sequences must be correct before anything writes to the new DB.

### S1 - reset and verify sequences

Why: a restore leaves each column-owned sequence behind its table's `MAX(id)`. Because
`global_id` (app/models/concerns/global_id.rb) encodes the **raw** primary key, the next insert
would reuse an existing id and corrupt global_id references. Idempotent and safe to re-run.

```bash
# Connect through the proxy (the /cloudsql socket only exists inside Cloud Run):
cloud-sql-proxy --port 5432 lingolinq-prod:us-central1:lingolinq-prod-pg &

DATABASE_URL='postgres://lingolinq_app:PASSWORD@127.0.0.1:5432/lingolinq_production' \
  ./scripts/gcp/phase4-setval-sequences.sh
```

The script prints the resolved project + Cloud SQL instance + db/host/user **before** touching
the DB (confirm the target), runs the setval, then runs verify. Verify exits non-zero and halts
if any sequence is still behind its `MAX`, or if an identity-column PK has drifted past the
SERIAL-only reset. Expected tail: `Phase 4 setval + verify complete.`

Rehearsal (no Cloud SQL needed), run on this branch before cutover:

```bash
DB_USER=scotw RAILS_ENV=test bundle exec rake db:setval_all_sequences
DB_USER=scotw RAILS_ENV=test bundle exec rake db:verify_sequences
DB_USER=scotw RAILS_ENV=test bundle exec rspec spec/lib/tasks/phase4_sequences_spec.rb
```

### S2 - preserve and seed the four generateValue secrets

The four: `SECRET_KEY_BASE`, `COOKIE_KEY`, `SECURE_ENCRYPTION_KEY`, `SECURE_NONCE_KEY`. These
are `generateValue` on Render and **must be preserved, never regenerated**: regenerating
`SECURE_ENCRYPTION_KEY` / `SECURE_NONCE_KEY` makes every `secure_serialize`'d column and
`ExternalNonce` permanently undecryptable; regenerating `SECRET_KEY_BASE` / `COOKIE_KEY`
invalidates all live sessions. A wrong value is **silent** until logins or decryption fail.

**Source of truth:** the **1Password "LingoLinq Prod" / "Rails Secrets"** item. This is what
`scripts/sync-render-env.js` already treats as canonical and pushes to Render hourly, so
1Password is authoritative and Render is downstream of it. The script seeds GCP from 1Password
and independently verifies each value byte-for-byte (sha256, never echoed) against the **live
Render** env before writing.

```bash
# 1) Plan (zero creds, writes nothing) - confirms scope:
./scripts/gcp/phase4-seed-boot-secrets.sh

# 2) Compliance fingerprints (1Password only, sha256, no plaintext):
./scripts/gcp/phase4-seed-boot-secrets.sh --fingerprint

# 3) Dry verification - compare 1Password vs live Render, NO write. Must be green first:
./scripts/gcp/phase4-seed-boot-secrets.sh --verify

# 4) Real seed (verify THEN write into GCP Secret Manager):
CONFIRM_SEED_SECRETS=1 ./scripts/gcp/phase4-seed-boot-secrets.sh
```

Out of scope here: `DATABASE_URL` / `REDIS_URL` / `REDIS_CA_CERT` are already seeded by
`phase3-data-layer.sh`; `DEFAULT_HOST` and the mail secrets are non-encryption config seeded
separately. The deploy workflow's full `BOOT_SECRETS` list is in
`.github/workflows/deploy-cloudrun.yml`.

> **Pre-cutover task - `SMS_ENCRYPTION_KEY` (separate from the four above).**
> `app/models/remote_target.rb:56` uses `SMS_ENCRYPTION_KEY` as the salt for a **persisted**
> one-way hash (`source_hash`, set at remote_target.rb:44 via `GoSecure.sha512`). It is NOT
> reversible encryption, so a wrong value does not make data undecryptable, but regenerating it
> would break matching of existing stored SMS `source_hash` values (SMS source routing for
> existing records). It is a perEnv secret in 1Password ("LingoLinq Prod"/"Rails Secrets",
> field `SMS_ENCRYPTION_KEY`), and it is currently **not in the deploy workflow `BOOT_SECRETS`**.
> Before cutover, if SMS routing is used in prod: (a) preserve `SMS_ENCRYPTION_KEY` from
> 1Password the same way as the four (do not regenerate), and (b) add it to `BOOT_SECRETS` in
> `deploy-cloudrun.yml` so the runtime can read it. This script intentionally does not seed it
> (it is not a generateValue secret); track it as its own task.

## 3. The hard rules these scripts enforce

- **Never echo plaintext.** Values are read into shell vars, hashed, piped straight into
  `gcloud secrets versions add --data-file=-`, and unset. Only sha256 prefixes and "value not
  shown" lines are printed.
- **Empty value = STOP.** If either 1Password or Render returns an empty/absent value, the
  script stops without seeding.
- **Mismatch = STOP.** If a 1Password value does not match live Render byte-for-byte, it is a
  hard stop. The usual cause is a stray trailing newline or an edit-drift between the two; the
  fix is to reconcile, not to override.
- **A Render 429 / 5xx is a STOP, not a retry.** The Render env list is fetched once; a failed
  fetch aborts. Retrying mid-cutover risks a partial seed. Wait, investigate, then re-run from
  `--verify`.

## 4. Rollback

- **S1 verification fails** (a sequence still behind): re-run `phase4-setval-sequences.sh` - the
  setval is idempotent, so re-running advances any laggard and re-verifies. If verify reports an
  identity-PK drift instead, STOP: the SQL must be extended before cutover (out of scope here).
- **S2 mismatch / empty**: **stop and investigate, never retry the seed.** Reconcile 1Password
  vs Render, re-run `--verify` until green, then seed. A GCP secret version is additive and can
  be re-pointed, but the correct move on a mismatch is always to fix the source, not to write a
  guessed value.
- **Both S1 and S2 are pre-DNS-flip.** Render remains live and authoritative the entire time, so
  the master rollback for the whole cutover (flip DNS back to Render) still applies; nothing here
  is destructive to Render.

## 5. Verification checklist

- [ ] S1: `phase4-setval-sequences.sh` ends with `setval + verify complete`; verify exit code 0.
- [ ] S1: spot-check - in a rolled-back transaction, insert one row into a high-traffic table
      and confirm no PK collision.
- [ ] S2: `--verify` is green (all four match) before any seed.
- [ ] S2: after seed, `gcloud secrets versions list <NAME> --project=lingolinq-prod` shows a new
      (or unchanged, if idempotent-skipped) version for each of the four.
- [ ] S2: the migration Job / web boot succeeds (proves the seeded secrets decrypt existing data
      and sessions remain valid). This is the real confirmation that no value was regenerated.
