# Scheduler Dispatch: Interruption and Post-Interruption Observations

**Status: DRAFT. Unattested and unreviewed.** Prepared 2026-09-14. This record supersedes
nothing, modifies no attested record, and closes, downgrades or accepts no finding. It records
observations and states their limits. Only the CEO attests a record in this corpus; a review and
an attestation are separate events, and neither has occurred for this document.

## 1. Why this record exists

`rake scheduler:dispatch` (`lib/tasks/scheduler.rake`) is the single entrypoint for every
recurring job in this application. Finding `LL-3e36a18199` (high, open) records that nothing
triggered it in production from 2026-07-21 until 2026-09-02. Five compliance drafts described
retention, redaction, purge, flush and expiry work in language that did not distinguish
configured cadence from observed execution. This record is the single dated place those drafts
cite, so that one set of facts is stated once rather than paraphrased five ways.

## 2. Chronology

| Date (UTC) | Event | Source |
| --- | --- | --- |
| 2026-07-21 | The Render cron that had run this task hourly shows `suspended` with a user suspender and an `updatedAt` of this date, the day before the GCP cutover. | `LL-3e36a18199` original evidence |
| 2026-07-22 | Render-to-GCP cutover. No replacement trigger was provisioned. | `docs/INFRASTRUCTURE.md` |
| 2026-09-01 | Absence of any trigger verified live and corroborated by an independent session the same day. | `LL-3e36a18199` notes |
| 2026-09-02 | Finding `LL-3e36a18199` promoted from review. | `audit-reports/FINDINGS.json` |
| 2026-09-02T17:05:54Z | `userUpdateTime` on Cloud Scheduler job `lingolinq-scheduler-hourly`. | receipt `scheduler-jobs.out` |
| 2026-09-02T18:00Z | First execution on the hourly cadence. | receipt `scheduler-executions.out` |
| 2026-09-14T07:23:04Z | Evidence capture window closes. | receipt `manifest.json` |

## 3. Receipts

Captured 2026-09-14 by a read-only harness that records each command's argv, exit status, capture
window and scope in a sidecar, and the harness and validator hashes in a run manifest. Held
outside this repository at
`~/ai-company-brain/outputs/docs/2026-09-14-scheduler-evidence-receipts/run-20260914T072304Z-945417/`.
They are raw cloud API output, and this repository is public, so they are cited by sha256 rather
than committed. That is a size-and-format decision, not a confidentiality claim: this record
necessarily restates the operationally meaningful contents below. Whether those restated contents
are RETAINED in a public repository is an open question for Scot, flagged in section 6.1. Whether
the raw receipts THEMSELVES are published is a separate open decision, recorded in this record's
register row.

| Receipt | sha256 (first 16) | Establishes |
| --- | --- | --- |
| `alert-policies.out` | `e827fbdb518a8be8` | Alert policy inventory |
| `dispatch-completion.out` | `a542d54380452001` | 280 dispatch-complete entries, zero failed |
| `logging-buckets.out` | `e0f88d116034c8c7` | Log retention as configured |
| `logging-sinks.out` | `22e5d85331102d63` | Log routing as configured |
| `manifest.json` | `ddcb07d0ea5faa41` | Run identity, harness and validator hashes, gcloud 564.0.0, query bounds |
| `scheduler-executions.out` | `a1461056f1647422` | 280 executions with identity, creator annotation, conditions |
| `scheduler-jobs.out` | `14e8ae1ad74c296a` | Trigger configuration as captured |
| `task-clean_old_deleted_boards.out` | `5bfeb339f956edbb` | Daily-block log lines for `clean_old_deleted_boards` |
| `task-enforce_data_retention_policies.out` | `3e4eef706a239aa2` | Daily-block log lines for `enforce_data_retention_policies` |
| `task-expire_offboarding_coppa_consents.out` | `3079fa48749ca030` | Daily-block log lines for `expire_offboarding_coppa_consents` |
| `task-flush_users.out` | `4535cee45b6a9dff` | Daily-block log lines for `flush_users` |
| `task-purge_old_eu_ai_api_logs.out` | `64fb30acc6532865` | Daily-block log lines for `purge_old_eu_ai_api_logs` |
| `task-redact_old_ai_api_log_ips.out` | `881d3830257d6272` | Daily-block log lines for `redact_old_ai_api_log_ips` |

### 3.1 Trigger

Cloud Scheduler job `lingolinq-scheduler-hourly` in `lingolinq-prod/us-central1`, state `ENABLED`,
schedule `0 * * * *`, `timeZone Etc/UTC`, `attemptDeadline 1800s`,
`userUpdateTime 2026-09-02T17:05:54.687129Z`. Its target is the Cloud Run Jobs `:run` API for the
`lingolinq-scheduler` job
(POST, authenticated with an OAuth service-account token; the receipt records `httpTarget.oauthToken` with scope `https://www.googleapis.com/auth/cloud-platform` and no `oidcToken`).

That target returns a long-running Operation before the rake task runs, so Cloud Scheduler's own
success signal cannot evidence task success. Nothing in this record relies on it.

### 3.2 Executions

280 executions of Cloud Run job `lingolinq-scheduler`, each reporting `succeededCount: 1`, no
`failedCount`, condition `Completed=True`, and a `completionTime`.

278 fall on hour boundaries and account for all 278 expected hourly slots from `2026-09-02T18:00Z`
through `2026-09-14T07:00Z`, with no missing slot and no interval above 70 minutes.

Two do not fall on that cadence: `lingolinq-scheduler-sp45b` at `2026-09-02T16:59:42Z` and
`lingolinq-scheduler-qsq8x` at `2026-09-02T21:44:26Z`. Both carry a `run.googleapis.com/creator` annotation naming an OPERATOR user credential with
`client-name: gcloud`; the other 278 name the Cloud Scheduler invoker service account. That annotation records the
credential under which each execution was created. It does not by itself establish who or what
initiated the call, and no separate evidence of interactive invocation was gathered.

### 3.3 Dispatch completion

280 `=== Scheduler Dispatch Complete ===` entries and zero `=== Scheduler Dispatch FAILED ===`
entries, spanning `2026-09-02T17:04:50.749567Z` to `2026-09-14T07:03:19.866220Z`.

### 3.4 Daily-block tasks

The daily block is gated on `hour == 6` UTC and contains eleven `run_task` calls. **Six were
inspected.** `check_for_expiring_subscriptions`, `transcode_errored_records`,
`expire_stale_supervisor_consent_requests`, `flush_expired_beta_feedback_recordings` and
`expire_licenses` were not queried, and nothing in this record describes them.

Across the twelve UTC dates 2026-09-03 through 2026-09-14, each of the six inspected task
summaries appeared once per date:

| Task | Reported result, each date |
| --- | --- |
| `enforce_data_retention_policies` | 0 stale sessions purged |
| `redact_old_ai_api_log_ips` | 0 AI log IPs redacted |
| `flush_users` | deleted 0 users |
| `clean_old_deleted_boards` | 0 deleted |
| `purge_old_eu_ai_api_logs` | 0 EU AI logs purged (5-year retention) |
| `expire_offboarding_coppa_consents` | 0 export-then-delete scheduled |

**Reading the zeros.** Each of the six inspected task summaries reported zero for its stated
result. These counts do not establish stored population size or contents. For the COPPA worker, an
explicitly logged disabled mode indicates invocation without expiration processing. For
`redact_old_ai_api_log_ips`, the reported value is the count of records updated by
`AiApiLog.redact_old_ip_addresses!`, whose query selects rows older than the retention window whose
`ip_address` is neither null nor already `[REDACTED]` (`app/models/ai_api_log.rb:225-229`); the
update reported zero affected rows at each observed execution. This does not establish whether qualifying rows existed at other times. As of the 2026-08-17 live re-verification recorded in `docs/legal/2026-08-25_ai-data-flow-classification.md`, `ip_address` was null on all 64 `AiApiLog` rows then present; the table has not been re-queried since, so the current population is unknown. Nothing here
evidences completion of downstream asynchronous work enqueued by any task.

**COPPA worker mode.** Disabled mode was logged 2026-09-04 through 2026-09-14. The 2026-09-03
entry reports zero scheduled exports and deletions but does not identify the mode; that entry alone
does not establish whether candidate processing occurred on that date. The worker's default is
`:disabled` by design: the sweep is retroactive over an accumulated backlog and schedules
irreversible deletion 36 hours out, so enabling it is a deliberate operator act
(`app/workers/offboarding_coppa_expiration_worker.rb`).

### 3.5 Alerting

Three alert policies exist in `lingolinq-prod` as captured on 2026-09-14, all enabled, each with
one notification channel: "PROD Cloud Run job execution FAILED"
(`metric.label.result="failed"`), "PROD app.lingolinq.com is DOWN", and "Cloud Armor ROLLBACK
TRIGGER". The failure policy counts failed executions; the 2026-07-21 to 2026-09-02 condition was
non-execution, which produces no failed execution to count. No missed-run or absence detection was
found, and no evidence was gathered that any notification has been delivered to a recipient.

The comment at `lib/tasks/scheduler.rake:78-80` is a dated statement about 2026-09-03 and is not
contradicted by this capture; it no longer describes the configuration captured on 2026-09-14, and
this record takes no position on what was configured on 2026-09-03.

### 3.6 Log retention and routing

Two log buckets exist, both in `global`: `_Default` at `retentionDays: 400` and `_Required` at
`retentionDays: 400`, locked. Two sinks exist: `_Required` routes the audit log families, and
`_Default` routes everything not in those families, which is where Cloud Run job `textPayload`
entries land.

This is configuration as captured on 2026-09-14. It does not establish historical routing or
historical retention, and it does not establish that entries from any earlier period still exist.

## 4. Affected controls

Hourly tasks: `generate_log_summaries`, `push_remote_logs`, `check_for_log_mergers`,
`advance_goals`.

Daily tasks (06:00 UTC): the eleven listed in section 3.4.

Two of the daily tasks have an independent reason for a zero result that is unrelated to dispatch.
`purge_old_eu_ai_api_logs` matched no production row as of the 2026-08-23 audited read because
none of the rows PRESENT AT THAT READ carried an EU jurisdiction stamp. That read describes the
rows then present. It does not establish that no row had ever been stamped, since a stamped row
could have been deleted before the read. `expire_offboarding_coppa_consents` returns zero
in `:disabled` mode without scanning. Neither is evidence about dispatch, and dispatch is not
evidence about either.

## 5. Impact

For the window 2026-07-21 to 2026-09-02, the configured controls above were not run by the
scheduler. Whether any ran by another route has not been established. This record does not quantify
what accumulated during that window, does not identify affected data subjects, and does not assess
residual work. That assessment is outstanding and is a closure condition on `LL-3e36a18199`.

## 6. Limitations

1. Continuous historical enforcement is not established.
2. Successful completion of every downstream task is not established. Six of eleven daily tasks
   were inspected, and asynchronous work enqueued by any task is outside these observations.
3. Completeness of historical audit-event coverage is not established.
4. Production deletion behaviour for a non-zero eligible population is not established. Every
   observed count is zero.
5. The COPPA offboarding expiration sweep is not enabled, and nothing here argues that it should
   be.
6. Record counts, minimum and maximum timestamps, and the absence of a result limit do not
   establish complete historical coverage.
7. Configuration snapshots describe current state only.

## 6.1 Open question for Scot, retention

Items 1 through 7 above record what is NOT established. This subsection is separate because it
states an established fact and puts a decision to Scot.

This repository is public, and this record was PUSHED to it on 2026-09-14, so the disclosure has
already occurred. That anchor is the push itself, not the state of any pull request. What remains
for these restated contents is a RETENTION decision rather than a future-publication decision;
publication of the raw receipts themselves is a separate open decision, recorded in this record's
register row and not settled here.

Section 3.5 states that no missed-run or absence detection exists on a production system serving
children's data. The substance is already public in `LL-3e36a18199`, which this repository also
carries, so this record adds detail rather than a new class of disclosure. Scot decides whether the
alert-policy detail is retained here, moved to the register only, or removed. Moving it to the
register changes discoverability but NOT public availability, because `audit-reports/` is tracked in
this same public repository. Removing it would limit onward visibility but would not undo the
disclosure already made.

## 7. Related records

- `LL-3e36a18199` (high, open): scheduler dispatch HAD no trigger from the GCP cutover until
  2026-09-02. Sections 3.1 and 3.2 of this record establish an enabled trigger and 278 executions
  covering every expected hourly slot from `2026-09-02T18:00Z` through `2026-09-14T07:00Z`. The
  finding remains OPEN because its closure conditions are unmet, not because a trigger is still
  absent. Section 5 records one of those conditions, the outstanding impact assessment for the
  interruption window; the full set is held in the finding's own entry in
  `audit-reports/FINDINGS.json`. Its stored title still asserts that absence in the present tense,
  and therefore renders that way in generated artifacts, including
  `audit-reports/notion/compliance-audit-page.md`. Retitling a finding is Scot's decision and is
  recorded as a deferred follow-up; this record does not restate the stale claim as current.
- `LL-933e61efd7` (high, open): privacy-page retention and deletion promises with no implementing
  mechanism.
- `rev-coppa-retention-quarterly` in `audit-reports/compliance-calendar.json`: overdue since
  2026-07-26; renewed COPPA verification belongs there, not here.
- `docs/legal/COPPA_VERIFICATION_2026-04-26.md`: attested, frozen, `status: approved`, a member of the
  `school-dpa-package` bundle, and Drive-mirrored, so it is exported to school districts. Two of its
  cadence statements have different provenance and must not be conflated.
  - The body statements, for example "daily at 6 AM UTC" at `:231` and "runs daily" at `:233`, were
    introduced on 2026-04-27 by PR #224. They genuinely predate the interruption.
  - The banner statement at `:7-8`, that `AiApiLog.redact_old_ip_addresses!` "was wired into
    `lib/tasks/scheduler.rake` by PR #222 and **runs daily today**", was introduced on 2026-07-23 by
    commit `bf43bccee` (PR #672) and CEO-attested the same day. **That is two days after the
    interruption began on 2026-07-21.** It did not go stale; on the evidence recorded here it was not
    true when it was written, and the register's own attestation note says the re-attestation followed
    "verification against live code and infrastructure state".
  The file's bytes still match its `attestedContentHash`, so this is a content problem, not tampering,
  and the record cannot be corrected in place. **Open decision for Scot, not resolved here and not
  deferrable to the quarterly review:** an approved, bundle-exported, externally mirrored record carries
  a claim the evidence contradicts. The options are a Path A dated successor or an annotation, and
  either is Scot's to choose. Routing this to `rev-coppa-retention-quarterly` alone would be
  insufficient: that review is overdue since 2026-07-26 and this change deliberately does not move its
  due date, so it carries no scheduled date by which the disclosure would happen.

## 8. What this record does not do

It supersedes nothing. It resolves no question put to counsel in
`docs/legal/2026-08-30_minimum-necessary-privacy-retention-ai-use-counsel-review.md`. It takes no
position on the legal basis for any retention window. It closes, downgrades and accepts no
finding, and it is not an attestation.
