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
(LL-7314b5a8ea, LL-107c9fb665, LL-c5fe9e2e3e) still resolve after the deletion.

**Current result: 198 PASS / 0 FAIL.** An earlier run in this worktree reported 195 PASS / 3 FAIL on
`app/models/lesson.rb` and `webhook.rb` at sha `e37817432a58`, and commit `36d53b416` records that
number. Those three were NOT a register defect: the sha simply had not been fetched into this
worktree. `git fetch origin e37817432a58…` made it resolve. The 3-FAIL figure does not reproduce and
should not be quoted.

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
- **Finding 7 (adversary, Medium): `docs/legal/INCIDENT_LOG.md:25` is a tenth live head naming
  Render.** Register `DOC-1ea9f75b4f`, `status: approved`, attested 2026-06-21, hash-pinned, in the
  `soc2-evidence` bundle. The text is a template placeholder:
  `- Source system: [Render service / AWS / subprocessor / workstation]`. Deliberately NOT given a
  successor: filing an attested supersession to edit a bracketed placeholder is disproportionate.
  Recorded here so the next sweep does not rediscover it as a miss.
- **Finding 12 (adversary, Low): the broad `lingolinq-app` AWS IAM key may still be active.**
  `scripts/gcp/iam/README.md`'s new banner raises this as prose. `aws sts get-caller-identity`
  returns `arn:aws:iam::239044785114:user/lingolinq-app`, so that user has at least one key in
  active use; key enumeration was denied (`iam:ListAccessKeys` on self). This belongs in
  `FINDINGS.json` as a real finding, not in a README banner. Not filed here because filing is a
  register act and this branch deliberately leaves the register untouched.
- **Finding 2 (adversary, High): the supersessions reduce attested membership of four bundles.**
  Attested live-head members, base -> HEAD: `baa` 7->5, `school-dpa-package` 8->6,
  `security-review` **4->2**, `soc2-evidence` 11->9. Superseding an attested head with an
  unattested draft is correct governance, but the bundles a district or auditor receives now carry
  fewer attested documents, and `document-register-render.rb --check` does not measure this (it
  reports the same 23 bundle gaps before and after). **This is the strongest argument for
  attesting the nine successors promptly rather than leaving them as drafts.** It must be stated
  in the PR body.
- Compliance documents still describing Render as a live fallback. These are attested and
  hash-pinned, so they need dated successors rather than in-place edits.
- Register findings the decommission resolves: LL-7314b5a8ea, LL-107c9fb665, LL-aacae48768,
  LL-40f3571b19, LL-ba0585ab93.

## Dual review

Round 1, both reviewers, on `1d53ab658` / `4c378897d`.

- **Codex: 2 findings, both real**, both the same defect class: each successor was created by
  copying its predecessor, and the `**Supersedes:**` metadata line BELOW the rewritten banner was
  left pointing at the wrong document. Fixed in `1d53ab658`.
- **The sweep for that class found a third Codex missed** (`2026-09-14_data-retention.md`, a second
  contradictory `Supersedes` line) and a fourth neither reviewer reported: the breach runbook told
  readers its own attestation state lived at register row `DOC-28f19f73e4`, the PREDECESSOR's row.
  Mid-incident that sends a responder to the frozen document.
- **Adversary: 12 findings.** Governance half verified independently clean (0 modified files under
  `docs/legal/`, no attestation block altered on any existing row, `FINDINGS.json` untouched,
  `auditedSha` not restamped). Applied: 1, 3, 4, 5, 6, 8, 9, 10, 11. Recorded as outstanding
  rather than applied: 2 (PR body), 7 and 12 (above).

### The one that mattered

Finding 1, High: **I called the archive bucket "immutable" in six places and told the attester an
Article 17 erasure "cannot be executed" against it.** Both false. The bucket's `retentionPolicy`
has **no `isLocked` field**, verified live twice, so a project admin can remove the policy and then
delete. The direction of the error is the dangerous one: it understates our ability to comply with
an erasure request, in a retention schedule written for a DPO. Corrected everywhere, and the
Article 17 sentence now says erasure is a decision, not a technical impossibility.

I had the evidence for this in hand and misread it: I saw a retention policy plus a proof object
that "cannot be removed before 2027-09-08" and concluded immutability. The proof object's
protection is real; the POLICY's removability is the separate fact I did not check.

## History

- 2026-09-14: audit; sections 1-3; nine compliance successors; dual review round 1 applied.
