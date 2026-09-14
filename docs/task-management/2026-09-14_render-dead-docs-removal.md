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

## Agent and skill config (after #962 merged)

#962 merged 2026-09-14 as `c0e632190`. `render.yaml`, `bin/render-build.sh` and `bin/push_deploy`
are gone; `Procfile` is present.

Three files carried the same sentence: "`render.yaml`, `bin/render-build.sh` and `Procfile` are
legacy files". That sentence had two errors, one new and one that predates the decommission.

1. It names two files that no longer exist.
2. It calls `Procfile` legacy. `Procfile` is the LOCAL development process definition, read by
   `foreman start` per `README.md:124-131`. That was already wrong before #962.

Rewritten in `.claude/rules/deploy.md`, `.claude/agents/infra-auditor.md`, and
`.claude/skills/soc2-security-audit/SKILL.md`.

**Do not tell auditors those citations are broken.** `citation-check.rb` anchors evidence to a
recorded `file@sha`, not to HEAD, so the three register findings citing `render.yaml`
(LL-7314b5a8ea, LL-107c9fb665, LL-c5fe9e2e3e) still resolve after the deletion. Verified: 195 PASS,
3 FAIL, and all three failures are pre-existing `app/models/lesson.rb` / `webhook.rb` citations at
sha `e37817432a58`, byte-identical in `FINDINGS.json` at `e8cea7329` before the merge.

## Compliance record (section 4)

Nine Path A successors, dated 2026-09-14. **No frozen or attested predecessor was edited.**

### Why successors rather than in-place edits

Every live head is a DATED document that was accurate when written: Render genuinely was a live
write-frozen fallback on 2026-08-09, 08-15, 08-16, 08-22 and 08-25. Two of them pin themselves to a
snapshot, and `2026-08-22_compliance-program.md` says so outright ("the snapshot boundary is still
`64cdccba1` -- these corrections do not move the derivation to a later commit"). Editing a
2026-09-09 fact into a document dated 2026-08-22 would back-date a later event into an earlier
record and break that document's own stated invariant. Scot chose successors on 2026-09-14.

### What was created

| Successor | Supersedes | Predecessor state |
|---|---|---|
| `2026-09-14_data-retention.md` | `DOC-e62caf7fb9` | draft |
| `2026-09-14_subprocessor-register.md` | `DOC-f850df36ad` | **attested 2026-08-19** |
| `2026-09-14_compliance-program.md` | `DOC-e5e85eccb1` | draft |
| `2026-09-14_incident-response-breach-runbook.md` | `DOC-28f19f73e4` | **attested 2026-08-16** |
| `2026-09-14_compliance-data-governance.md` | `DOC-f6d26afec8` | draft |
| `2026-09-14_compliance-program-overview.md` | `DOC-90632edc44` | draft |
| `2026-09-14_compliance-posture-report.md` | `DOC-c5408d90b7` | draft |
| `2026-09-14_gcp-baa-accepted.md` | `DOC-5b14b08908` | **attested 2026-07-23** |
| `2026-09-14_compliance-status-snapshot.md` | `DOC-af01c65b10` | draft |

The last three were found by the cross-doc sweep that `.claude/rules/compliance-docs.md` requires,
NOT by the original audit. The audit listed six documents; the sweep found a seventh chain (the
posture report) plus the GCP BAA record and the status snapshot. The posture report matters most of
the three: it ships in the `grant`, `school-dpa-package` and `security-review` bundles, so its stale
"Render remains a write-frozen rollback fallback" line travelled to funders, districts and security
reviewers.

### Substantive changes, not just wording

- **A retention end-condition fired.** The Render backup row carried "ends when the Render fallback
  is decommissioned". That is now met. The 35 day Render-managed window is ENDED and a new row
  records the replacement: `gs://lingolinq-prod-render-archive`, verified live 2026-09-14 as a
  one-year immutable lock (`retentionPeriod` 31,557,600s, effective 2026-09-02T17:30:22Z, NEARLINE,
  public access prevention enforced, uniform bucket-level access, 7 day soft-delete).
- **n8n MOVED, it did not end.** It is a live Cloud Run service in `lingolinq-nonprod`. Its
  subprocessor row is relocated, not terminated. Terminating it would have been wrong.
- **The breach runbook lost a capability.** Render-side service and audit logs are no longer
  obtainable for ANY window, including windows before the deletion. The runbook now says to record
  that explicitly rather than leave the evidence step open.
- Ended subprocessor rows are RETAINED with an end date, per the register's own convention that it
  is a history and not a current-only list.

### Open questions carried to the attester, not answered here

1. Confirm the 2026-09-09 deletion date against the vendor record (dashboard screenshot or
   account-deletion email).
2. Whether Render retains residual copies after account deletion. Not confirmed with the vendor.
   Every successor says so rather than asserting Render holds nothing.
3. The archive's retention lock refuses deletion for a year, so an Article 17 erasure request
   cannot be executed against it inside that window. Prod carried no real users at cutover; the
   2.4 GB dev/staging dump has not been assessed for real content.

**No finding was closed.** `audit-reports/FINDINGS.json` is untouched. Section 5 is the CEO's act.

### A trap worth remembering

`scripts/regenerate-register.sh` refused to run with three citation FAILs on
`app/models/lesson.rb` and `webhook.rb` at sha `e37817432a58`. That sha was simply **not fetched in
this worktree**; `git fetch origin <sha>` made it resolve and the gate went green (198 PASS / 0
FAIL). A fresh worktree can fail this gate for a reason that has nothing to do with the register.
Fetch the sha before concluding the evidence is broken.

## Not in scope, still outstanding

- `develop` CI was already red on `build-and-test` at `e8cea7329`, before #962 merged. #962's own
  head was green on all six required checks. The red is the Ember test-isolation flake family.
- Compliance documents still describing Render as a live fallback. These are attested and
  hash-pinned, so they need dated successors rather than in-place edits.
- Register findings the decommission resolves: LL-7314b5a8ea, LL-107c9fb665, LL-aacae48768,
  LL-40f3571b19, LL-ba0585ab93.

## History

- 2026-09-14: audit and the eight file changes above. No commit yet.
