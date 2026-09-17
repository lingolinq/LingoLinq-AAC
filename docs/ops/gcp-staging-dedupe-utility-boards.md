# GCP nonprod: library utility-board dedupe

Default is **read-only**. Prints identical emoji / keyboard / numbers
clusters on the `lingolinq` content account and which parent buttons
would be relinked.

`APPLY=1 APPLY_CONFIRM=1` relinks those parents then destroys extras.
It **skips** any cluster that includes `lingolinq/keyboard` (default
sidebar slug). `lingolinq` and `lingolinq_admin` sidebars still point
there. Do not delete that key until sidebar is restored from
`public/system-boards/keyboard.obz`.

The operator script never sets APPLY. Production Cloud SQL is refused
unless `ALLOW_PROD_APPLY=1` is set with `APPLY=1` and `APPLY_CONFIRM=1`.

Test on **nonprod first**. Prod APPLY is a separate execute after a
prod dry-run.

## Where it runs

Staging and dev share one Cloud SQL database in `lingolinq-nonprod`.

| Field | Value |
|---|---|
| Project | `lingolinq-nonprod` |
| Region | `us-central1` |
| Staging web | `lingolinq-web-staging` — https://staging.lingolinq.com |
| Dev web | `lingolinq-web-dev` — https://dev.lingolinq.com |
| Job name | `lingolinq-utility-dedupe-dryrun` (throwaway; not in the deploy workflow) |
| Runtime SA | `lingolinq-run@lingolinq-nonprod.iam.gserviceaccount.com` |

The job uses the **currently deployed web image**. The rake
`lingolinq:dedupe_shared_utility_boards` must be in that image.

- Merge to `develop` → image is on `lingolinq-web-dev`. Same database as staging.
- Merge to `staging` → image is on `lingolinq-web-staging`.

A feature-branch checkout cannot authenticate to this project via WIF
(the nonprod provider admits only `refs/heads/staging` and `refs/heads/develop`).

## What the report must show before any APPLY

- Canonical vs DELETE keys per identical fingerprint (grid + sorted labels)
- Parent `load_board` relinks on `lingolinq` boards
- User home/sidebar refs pointing at a DELETE key
- A WARN if the cluster includes `lingolinq/keyboard` (default sidebar slug).
  Do not delete that key until sidebar is restored from `public/system-boards/keyboard.obz`.

Different-sized Vocal Flair keyboards must stay in different clusters.

## Execute

Needs `gcloud` authenticated to `lingolinq-nonprod`. This repo's WSL
environment does not ship `gcloud`; run from a machine that does.

```bash
# After the rake is on lingolinq-web-dev (merge to develop), same DB as staging:
./scripts/gcp/dedupe-utility-boards-dryrun.sh --web lingolinq-web-dev

# After the rake is on lingolinq-web-staging:
./scripts/gcp/dedupe-utility-boards-dryrun.sh --web lingolinq-web-staging
```

The script copies image, Cloud SQL, VPC, secrets, and the runtime SA from
the chosen web service. It never updates `lingolinq-migrate-*`.
`--max-retries 0`. Logs are the durable record.

## APPLY (nonprod only, after reviewing a dry-run)

Do **not** add APPLY to `dedupe-utility-boards-dryrun.sh`. After this
code is on `lingolinq-web-dev`, update the throwaway job env and execute
once:

```bash
gcloud run jobs update lingolinq-utility-dedupe-dryrun \
  --project lingolinq-nonprod --region us-central1 \
  --update-env-vars APPLY=1,APPLY_CONFIRM=1
gcloud run jobs execute lingolinq-utility-dedupe-dryrun \
  --project lingolinq-nonprod --region us-central1 --wait
```

Then clear those env vars so the next execute is a dry-run again:

```bash
gcloud run jobs update lingolinq-utility-dedupe-dryrun \
  --project lingolinq-nonprod --region us-central1 \
  --remove-env-vars APPLY,APPLY_CONFIRM
```

APPLY will:
- Relink Quick Core / aphasia keyboard buttons to `keyboard_10`
- Relink emoji/numbers on kept `keyboard_10` to `lingolinq/emoji` and `lingolinq/numbers`
- Destroy extra `emoji_*` / `keyboard_*` / `numbers_*` copies
- Leave `lingolinq/keyboard` and `vocal-flair-84-keyboard` both in place
- Retarget user sidebar/home keys that pointed at a destroyed extra (not the sidebar slug)

## APPLY (prod, after a prod dry-run)

The committed operator script still refuses `lingolinq-prod`. After a
read-only execute against `lingolinq-web` (same paste as the prod
dry-run), set the three env vars and execute once:

```bash
gcloud run jobs update lingolinq-utility-dedupe-dryrun \
  --project lingolinq-prod --region us-central1 \
  --update-env-vars APPLY=1,APPLY_CONFIRM=1,ALLOW_PROD_APPLY=1
gcloud run jobs execute lingolinq-utility-dedupe-dryrun \
  --project lingolinq-prod --region us-central1 --wait
gcloud run jobs update lingolinq-utility-dedupe-dryrun \
  --project lingolinq-prod --region us-central1 \
  --remove-env-vars APPLY,APPLY_CONFIRM,ALLOW_PROD_APPLY
```

The first log line must say `[APPLY]` and DB `lingolinq_production`.
Prod keys differ from staging (keep `keyboard_12` and `numbers_11`,
not `keyboard_10` / `lingolinq/numbers`). Skip the VF84 / sidebar
cluster. Then clear the env vars.

## Do not

- Point the **nonprod** job at `lingolinq-prod` / `lingolinq-web`.
- Leave `APPLY=1` or `ALLOW_PROD_APPLY=1` on the job definition after the run.
- Add this to `deploy-cloudrun.yml` or Cloud Scheduler.
- Treat an API key-probe as a full parent/user-ref scan. The rake walks
  every board and user on the database.
