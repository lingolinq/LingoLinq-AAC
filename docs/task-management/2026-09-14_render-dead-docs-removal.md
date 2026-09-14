# Render to GCP cleanup: dead docs and runbooks

Branch cut from `origin/develop`. Audited at `e8cea7329` (#968). Scope is documentation and
runbook cleanup only: nothing here changes application behaviour.

Companion work: PR #962 (open, draft) removes the dead Render code and config. This branch does not
touch any file in that PR.

## What was wrong

After the 2026-07-22 cutover and the 2026-09-09 Render workspace deletion, a set of documents still
gave operators live instructions against infrastructure that no longer exists. The worst was a
runbook whose every command POSTed to `api.render.com` with a 1Password key.

## Changes

| File | Change |
|---|---|
| `docs/ops/staging-translate-library-job.md` | Rewritten for Cloud Run. Was a full runbook against `api.render.com/v1/services/srv-d510c13e5dus73c8lg10/jobs`. |
| `docs/OPENSYMBOLS_QUICKSTART.md` | Render dashboard env var to Secret Manager plus `--set-secrets`. |
| `docs/GOOGLE_SSO_SETUP.md` | Same. |
| `docs/COPY_PERF_TUNING.md` | Dated banner; worker config re-read from Cloud Run; `render.yaml` drift section replaced; rollback steps rewritten. |
| `docs/native-apps/privacy-data-flow-evidence-map.md` | "Hosting: Render (migrating to GCP Cloud Run)" corrected. |
| `scripts/gcp/iam/README.md` | Dated note; "Render currently authenticates" put in past tense. |
| `scripts/gcp/PHASE5-CLEAN-DB-REHEARSAL.md` | Render-deletion line added to the existing banner; Render API key dropped from prerequisites. |
| `scripts/gcp/phase5-delta-check.sh` | Dated header note, matching the one its `phase4-seed-*` siblings already carry. |

Historical documents were left alone: `docs/archive/**`, dated `docs/task-management/` logs,
`learnings-archive/**`, frozen `audit-reports/` snapshots, and the cutover runbooks that already
carry a dated 2026-09-12 banner.

## Live verification

Every command placed in a document was run first.

- **`gcloud run jobs execute` with `--args` and `--update-env-vars` is execution-scoped.** Its own
  help says an execution is created with the merge result. Confirmed empirically: after the dry run
  the job's args were still `exec;rake;scheduler:dispatch` and none of `DRY_RUN`, `DEST_LANG` or
  `SCOPE` had been added to the job definition. This is what makes borrowing the scheduler job safe.
- **The dry run really works.** Execution `lingolinq-scheduler-staging-rn5dj`, exit 0, output
  `Dry run: 32 root(s) would be translated, 1 skipped`, which matches the doc's pre-existing claim
  of about 32 roots. The container took 2m35s to start before the rake began.
- **`lingolinq-scheduler-staging` mounts `GOOGLE_TRANSLATE_TOKEN`; `lingolinq-migrate-staging` does
  not** (18 env names, none of them that). This is why the runbook targets the scheduler job.
- **`assert_production_ok!` returns early on a dry run** (`lib/library_board_translator.rb:204`:
  `return if dry_run || Rails.env.test?`), so the doc's claim that a dry run needs neither
  `ALLOW_PROD_TRANSLATE` nor `TRANSLATE_CONFIRM` is correct.
- **The staging worker is a Cloud Run worker pool**, `lingolinq-worker-staging`, not a service, so
  it does not appear in `gcloud run services list`. Command `bin/docker-worker-entrypoint`,
  1 vCPU / 2Gi, no `QUEUES` or `INTERVAL` override.
- Both remaining doc commands (`jobs describe ... --format='value(...image)'` and the multi-line
  `gcloud logging read` filter) were run verbatim as written.

## One substantive finding beyond the rename

`COPY_PERF_TUNING.md`'s headline recommendation was "drop `INTERVAL` from 5 to 1". The GCP
entrypoint already defaults to `INTERVAL=0.1` (`bin/docker-worker-entrypoint:10`), which is lower
than the recommendation ever asked for. The recommendation is marked superseded rather than
deleted, since the reasoning still explains the default.

## Not in scope, still outstanding

- Three sentences claiming `render.yaml`, `bin/render-build.sh` and `Procfile` are all legacy files
  go false when #962 merges, because it deletes the first two while `Procfile` survives and is
  still read by `foreman start`: `.claude/rules/deploy.md:15-16`,
  `.claude/agents/infra-auditor.md:68`, `.claude/skills/soc2-security-audit/SKILL.md:34`.
- Compliance documents still describing Render as a live fallback. These are attested and
  hash-pinned, so they need dated successors rather than in-place edits.
- Register findings the decommission resolves: LL-7314b5a8ea, LL-107c9fb665, LL-aacae48768,
  LL-40f3571b19, LL-ba0585ab93.

## History

- 2026-09-14: audit and the eight file changes above. No commit yet.
