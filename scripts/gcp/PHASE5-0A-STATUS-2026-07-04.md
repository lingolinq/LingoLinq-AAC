# Phase 5 step 0a status - 2026-07-04

Follow-up to the 0a dress-rehearsal checklist in `PHASE5-CUTOVER-RUNBOOK.md`. Resolves the two
blockers Scot flagged for advancing past step 0a: SES delivery evidence via the real application
code path, and the ImageMagick `identify` gap. Both were investigated read-only first; fixes were
only applied after explicit confirmation (see IAM notes below).

## 1. SES delivery - reproduced via ActionMailer (not just raw SDK)

All prior SES evidence (`LL-42a24ee911`) used a raw `Aws::SES::Client#send_email` call, not Rails
ActionMailer. This closes that gap.

A throwaway Cloud Run Job (`lingolinq-mailtest`) ran `ActionMailer::Base.mail(...).deliver_now`
(`delivery_method: :ses`, `config/environments/production.rb:116`) against the then-current
lingolinq-web/worker image (`web:ccbdb5e21f...`), sending to both `beta@lingolinq.com` and
`scotwahlquist@gmail.com` in the same run:

| Recipient | SES MessageId | Arrived? |
|---|---|---|
| `beta@lingolinq.com` | `0101019f2b9c732c-d007737e-96ac-4266-a027-6cfe75154ecd-000000` | Yes - INBOX (checked via the connected Gmail account) |
| `scotwahlquist@gmail.com` | `0101019f2b9c73e6-8043c295-9839-4b6d-8622-d4c340a72b9c-000000` | No - not found in inbox, spam, or trash |

Both calls returned real SES MessageIds via `Aws::Rails::SesMailer#deliver!`, confirming
ActionMailer's `:ses` path is correctly wired end-to-end in Cloud Run (region, credentials,
`DEFAULT_EMAIL_FROM` all resolve). The non-delivery to the personal Gmail address reproduces
exactly, now through the real application code path instead of the raw SDK.

**Side note on `beta@lingolinq.com` routing:** it lands in `scotwahlquist@gmail.com`'s own inbox,
not only `scot@lingolinq.com`'s Workspace inbox as the original finding assumed. Exact routing
(group membership vs. broader alias) not investigated further.

**Still open, unchanged by this test:** no SES configuration set / event destination exists, so
there is still no per-message delivery-event evidence to explain *why* Gmail drops the direct
send. `LL-42a24ee911` stays `open`; register updated with this evidence, not closed.

## 2. ImageMagick `identify` - fixed, redeployed, and live-verified

`LL-5954bcbbe6`'s code fix (add `imagemagick`/`ghostscript` to the Dockerfile, PR #521, commit
`77233fb19`) was already merged to `origin/staging`, but the running production image
(`web:ccbdb5e21f...`, built 2026-06-29) predated the fix. Today's work:

1. Built a fresh image from `origin/staging` (`efb758284`) via Cloud Build (no local Docker in
   this shell) - `web:efb75828471c4c73055a069b6d1bebaf4f964aea`.
2. Ran the one pending migration (`add_retention_cleanup_indexes`, additive/low-risk) via the
   `lingolinq-migrate` Cloud Run Job.
3. Deployed both `lingolinq-web` (revision `lingolinq-web-00002-g7b`) and `lingolinq-worker`
   (revision `lingolinq-worker-00002-gp4`) with the new image. Web health check returned `200`
   immediately after; worker booted clean with no errors.
4. Confirmed `identify -version` runs in the new image directly (`ImageMagick 6.9.11-60 Q16`).
5. Confirmed no regression: `Resque::Failure.count` is unchanged at `914` post-deploy, and all 16
   `identify`-related failures still carry their original 2026-06-29 `failed_at` timestamps - zero
   new `identify` failures since the redeploy.

**Residual:** this confirms the binary is present and nothing regressed in the short window since
deploy, but no real `ButtonImage` upload has hit the new image yet, so "under normal upload load"
(the finding's original verification bar) isn't exercised yet. Watch `Resque::Failure` for new
`identify` errors once real board-image traffic resumes. Register status left at
`remediated-unverified` (not `verified-closed`) pending Scot's attestation, per the "only Scot
closes/downgrades a finding" policy - not because of remaining technical doubt.

## Side observation: production console guard is now live

A diagnostic job hit `refused: ENV['USER_KEY'] is required to open an audited runner in
production` on the freshly redeployed image - this is the boot-path guard from PR #501
(`bin/audit_console` / `config/initializers/auditing.rb`), which per prior memory notes had not
yet been confirmed live. It fired correctly and was cleared by setting `USER_KEY` on the job, same
as the documented `bin/audit_console` pattern. Worth a look at whether `LL-7f7372e3eb` (the
audited-console finding) should be re-assessed now that this guard is confirmed active in
production - not investigated further as part of this task.

## IAM changes made (confirmed with Scot before each)

Cloud Build's default service account (`549902645644-compute@developer.gserviceaccount.com`) had
zero project-level roles (deliberately hardened, no broad Editor grant), which blocked local
`gcloud builds submit`. Three narrow grants were added, each confirmed before applying:

- `roles/storage.objectViewer` on `gs://lingolinq-prod_cloudbuild` only (read its own source
  uploads).
- `roles/logging.logWriter` at project level (no narrower scope exists in GCP's IAM model for
  Cloud Build log writes).
- `roles/artifactregistry.writer` scoped to the `lingolinq` repository only (matches the existing
  grant already held by `cloud-run-deployer@`).

All three are standard, documented minimum requirements for Cloud Build's default service account
to build and push images - no other permissions were touched.

## Bottom line

Both step-0a blockers are answered with live, server-side evidence:

- SES: delivery via ActionMailer confirmed working end-to-end; the Gmail non-delivery gap is real
  and reproduced, root cause still open (needs an SES configuration set / event destination -
  see `LL-42a24ee911` remediation options).
- ImageMagick: fix confirmed live in production (`identify` present, zero new failures since
  redeploy); full verification under real upload load still pending.

Neither finding was closed unilaterally - `audit-reports/FINDINGS.json` was updated with this
evidence, register artifacts regenerated (`citation-check.rb --render`: 77 PASS / 0 FAIL / 10 SKIP;
`document-register-render.rb`: OK; `compliance-notion-publish.rb --check`: OK), and both findings
remain at their pre-existing status pending Scot's review.
