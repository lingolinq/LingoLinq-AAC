# LingoLinq Data Retention Schedule

> # DRAFT - NOT YET ATTESTED
>
> **This successor carries NO attestation of its own.** It supersedes
> `docs/legal/2026-09-14_data-retention.md` (`DOC-4dc241c83a`, attested 2026-09-16), which remains
> frozen and byte-identical. That predecessor was accurate for its date: Render was still a live write-frozen
> rollback fallback on 2026-08-09. This successor exists because that stopped being true on
> 2026-09-09. Every attestation statement reproduced below belongs to a predecessor version and is
> retained as history; none of them attests these bytes. Internal use only until the CEO attests
> this file.
>
> **Reason for supersession (2026-09-22).** Three rows of section 2 described retention controls
> that do not exist in the code that runs today. Each was verified by reading the runtime source at
> `origin/develop` e64653c59 before this file was written:
>
> - **User account records.** The predecessor said "plus 2 years of inactivity, then soft-delete".
>   The window in code is **12 months** and the outcome is **permanent destruction**, not a
>   PII-masking soft delete.
> - **Communication logs (`LogSession`).** The predecessor said "3 years default". **No default
>   exists**; `lib/data_policy_enforcer.rb` purges only where a policy sets `retention_months`.
> - **`AuditEvent`.** Not listed at all in any predecessor. The table has **no retention control**
>   and grows without bound.
>
> Every other row is carried forward byte-identical from the predecessor, including its own
> corrections and its unresolved doc-versus-code gaps. The predecessor's reason for supersession is
> retained below as lineage.
>
> **Predecessor's reason for supersession (2026-09-14).** The Render backup row carried an explicit end condition, "Ends when
> the Render fallback is decommissioned". That condition has been met: the Render workspace was
> deleted on 2026-09-09 (0 services, 0 databases, 0 disks). The 35 day Render-managed backup window
> no longer exists, and the only surviving copy of pre-cutover production data is a GCS archive
> under a one-year retention policy. Both rows are restated below.
>
> **Also copied forward from PR #969 (2026-09-14), which landed on the predecessor after this
> branch started:** cadence-versus-execution language for `LL-3e36a18199` (scheduler interrupted
> 2026-07-21 to 2026-09-02). Without that copy-forward this successor would have re-asserted that
> retention jobs "run" as of 2026-09-14. See `docs/legal/2026-09-14_scheduler-dispatch-interruption-and-restoration.md`.
> Does not close, downgrade, or re-attest any finding.
>
> **The attester must confirm** the 2026-09-09 deletion date against the vendor record (dashboard
> screenshot or account-deletion email), and decide the Article 17 question raised by the archive
> row's retention policy. **That policy is NOT locked** (`isLocked` absent, verified live
> 2026-09-14), so it is removable by a project admin. This archive must not be called immutable.

**Supersedes:** `docs/legal/2026-09-14_data-retention.md` (`DOC-4dc241c83a`), which remains frozen
and keeps its 2026-09-16 attestation over its own bytes. This dated record is the operative
retention schedule from 2026-09-22 forward.
**The document register (`audit-reports/DOCUMENT-REGISTER.json`) is the authoritative record of
this file's attestation state.**

**Owner:** Privacy Office (privacy@lingolinq.com)
**Last reviewed:** 2026-09-22 (this successor; predecessor 2026-09-14, attested 2026-09-16 by Scot Wahlquist, CEO)
**Next review:** 2027-04-20 (unchanged. This successor is a targeted doc-versus-code correction of three rows and does NOT reset the review clock)
**Earlier in the same lineage:** attested `docs/legal/DATA_RETENTION.md` (DOC-bff9acf51f), also frozen. Retained here as lineage, not as this record's direct predecessor.
**Attestation history:** first attested 2026-06-21. That attestation covered an earlier revision:
PR #569 (2026-07-10) and PR #656 (2026-07-22) rewrote the AI-log retention rows, and the
2026-07-22 Gate 1 cutover moved the production database off Render, which the backup rows did not
reflect until the 2026-07-23 correction below. Re-attested 2026-07-23 against the then-current
revision. This 2026-08-09 draft supersedes that attested cut for the Flusher erasure updates in
PR #721 and awaits CEO attestation.
**Related:** `docs/legal/2026-09-14_incident-response-breach-runbook.md`, `docs/legal/2026-09-14_subprocessor-register.md`, `docs/legal/2026-09-14_compliance-data-governance.md` (the current heads; the predecessors `BREACH_RUNBOOK.md`, `SUBPROCESSORS.md` and `COMPLIANCE.md` remain frozen)

## 1. Purpose

This schedule documents how long LingoLinq keeps each category of data, the legal basis for that window, and how deletion is executed. It is designed to satisfy:

- GDPR Article 5(1)(e) storage-limitation requirements
- HIPAA record retention rules and the six-year access-log rule under 45 CFR § 164.316(b)(2)
- FERPA and state student-data laws, including Illinois SOPPA, California SB 1177, and New York Education Law 2-d
- COPPA deletion-on-request obligations at 16 CFR § 312.10
- US federal and state tax-record retention rules

Default retention windows apply unless a customer data processing addendum specifies a shorter window, in which case the contractual window controls.

## 2. Retention Schedule

| Data type | Retention window | Legal basis | Deletion mechanism | Notes |
|---|---|---|---|---|
| User account records (`users` table and dependents) | Active for the life of the account. After **12 months** with no account activity a deletion warning cycle begins, and the account is then permanently erased | GDPR Article 5(1)(e); FERPA; contract | `User.check_for_subscription_updates` (`app/models/concerns/subscription.rb`) selects `updated_at < 12.months.ago`, sends up to three warnings at least 3 weeks apart, then sets `schedule_deletion_at = 36.hours.from_now`; the daily `flush_users` step of `scheduler:dispatch` runs `Flusher.flush_deleted_users`, which calls `Flusher.flush_user_completely` | **CORRECTED 2026-09-22.** Every predecessor read "Active for the life of the account plus 2 years of inactivity, then soft-delete", with `Flusher.flush_user_completely` named as the mechanism. Both halves of the window were wrong: the code window is 12 months, and the outcome is permanent destruction (`flush_record` plus an `AuditEvent` of type `user_permanently_destroyed`), not a soft delete that masks PII. Exempt from the sweep: accounts with `preferences['never_delete']`, and accounts with `allow_log_reports` whose `updated_at` is within 36 months. Execution is subject to the same scheduled-dispatch caveat recorded in the `LogSession` row below |
| Communication logs (`LogSession`) | **No default window.** Purged only for a user or organization whose data policy sets `retention_months` | GDPR Article 5(1)(e); FERPA; customer contract | `lib/data_policy_enforcer.rb`, dispatched daily at 06:00 UTC via `scheduler:dispatch` (configured cadence; production scheduled dispatch of `rake scheduler:dispatch` was interrupted from 2026-07-21 to 2026-09-02 (finding `LL-3e36a18199`, open), so this task was not run by the scheduler in that window; whether it ran by any other route has not been established. Captures dated 2026-09-14 record hourly execution from 2026-09-02 and one run of the daily 06:00 UTC block on each of the twelve UTC dates 2026-09-03 through 2026-09-14. Across September 3 to 14, each of the six inspected task summaries appeared once per UTC date and reported zero for its stated result. Six of the eleven daily tasks were inspected; the remainder were not queried. These observations do not verify every daily task, do not establish stored population size or contents, and do not evidence completion of downstream asynchronous work. See `docs/legal/2026-09-14_scheduler-dispatch-interruption-and-restoration.md`.) | **CORRECTED 2026-09-22.** Every predecessor read "3 years default, configurable per user or organization via data policy". No default exists in code: `lib/data_policy_enforcer.rb` skips any account whose policy sets no positive `retention_months` (`next unless months && months > 0`), so an unconfigured account is never purged by this job. A configured window is enforced, and district customers commonly set 5 years |
| Communication snapshots (`LogSnapshot`) | **No automated erasure path today** | GDPR Article 17; FERPA | **None.** `LogSnapshot` is keyed by `user_id` and is not swept by `Flusher`; no `dependent: :destroy` and no database foreign key exists | Open finding LL-1e2ab28aab. Individually deletable by the user via the snapshots API; a hard delete leaves the row (label, date range, `device_id`, dangling `location_id`) |
| Audio and video recordings (`UserVideo`, `ButtonSound`) | Tied to user account retention | FERPA; GDPR | `Flusher.flush_user_content` destroys owned rows; Uploadable schedules S3 `remote_remove` for the primary `url`; the `MediaObject` concern additionally schedules removal of the transcription working copy, prior-transcode originals, the video thumbnail, and an abandoned/never-confirmed upload's raw object on destroy | Includes off-board / message-bank voice recordings. Thumbnail removal first lists the video's own S3 objects, which needs `s3:ListBucket` on the uploads-bucket credential in addition to the delete permissions the other categories rely on; this permission is not yet verified in production, with a bounded best-effort fallback (the first five thumbnail indices only, stops at the first gap) if listing fails or is denied. A transcode job whose completion is never recorded (owning record destroyed mid-job, or a lost/never-delivered SNS completion notification) leaves its S3 output with no persisted application metadata for this sweep to discover -- tracked separately as LL-c4566fa37f. LL-854b1d3853 remains open pending independent (dual-reviewer) verification of complete media-object erasure |
| Board definitions (`Board`) | Retained while the owning user or shared copies remain active | Contract; FERPA school-official role | Flusher cascade for owner delete; shared copies persist with their owners | Public boards published to the library follow a separate public-content policy |
| AI API logs (`AiApiLog`), EU-jurisdiction accounts | Up to 5 years; purge job **implemented; mechanism verified end to end by spec; configured for daily scheduled execution; zero production matches as of the 2026-08-23 audited read** | EU AI Act Article 50 record-keeping | `AiApiLog.purge_old_eu_logs!(years: 5)` (PR #553), daily via `scheduler:dispatch` | **CORRECTED 2026-08-25.** This cell previously read "Now functional ... It matches EU rows wherever Phase 4 is deployed", and column 2 read "**enforced**". Both overstate. The job is scheduled, and the three AI call sites do stamp `jurisdiction` via `LingoLinq::Article50CallContext` (`lib/ai_word_predictor.rb:423`, `lib/ai_board_generator.rb:698`, `lib/eval_narrator.rb:331`). But it deleted nothing as of the 2026-08-23 audited read. `purge_old_eu_logs!` deletes `jurisdiction = 'EU' AND created_at < 5.years.ago` (`app/models/ai_api_log.rb:244-248`). The `ai_api_logs` TABLE was created 2026-02-21 (`db/migrate/20260221000001_create_ai_api_logs.rb`), so no row in it can be five years old before **2031-02-21**; rows stamped at write time cannot qualify before **2031-06-21**, when the `jurisdiction` column (created 2026-06-21, `db/migrate/20260621120000_add_article_50_fields_to_ai_api_logs.rb`) turns five. **Scope of this claim, tightened 2026-08-25:** it rests on the table's own age, not on the stamp alone. A backfill that stamped pre-June-2026 rows could pull the floor back toward 2031-02-21, and a manual `UPDATE` could make a row eligible sooner still; no such backfill exists in the codebase (no `update_all` touching `jurisdiction`). Either way the job matched zero rows as of the 2026-08-23 audited read; it has not been re-queried since. "Enforced" describes the schedule, not any deletion. **The date is not the operative reason.** The stamp writes `'EU'` ONLY for a user `EuJurisdiction` resolves to a confirmed `:eu`; `:unknown` and `:non_eu` both map to `nil` (`lib/eu_jurisdiction.rb`, deliberate, to avoid mislabelling under the HIPAA six-year floor). As of the 2026-08-23 audited read, `EuJurisdiction.status` is `:unknown` for **34 of 34** production accounts, and `jurisdiction` is null on all 64 `AiApiLog` rows. So on that read the purge matched zero PRODUCTION rows because no row then present carried a stamp, not merely because stamped rows are too young. That is a point-in-time read of the column's current values; it does not establish that no row was ever stamped, since a stamped row could have been deleted before the read. **That is an absence of eligible data, not a broken control, and an earlier draft of this cell overstated it as "structurally dormant" -- withdrawn 2026-08-26.** The mechanism is verified end to end: `spec/models/ai_api_log_spec.rb:550-586` drives a real EU user through `EuJurisdiction.retention_stamp`, the resolver writes `'EU'`, and `purge_old_eu_logs!` deletes that row while correctly sparing an `:unknown` row under the HIPAA six-year fail-safe. What the predecessors got wrong is the claim that it **matches EU rows in production today**; the safeguard itself is sound. This matches `lib/tasks/scheduler.rake:153-164` and `docs/legal/2026-08-24_ai-governance-memo.md:485-490`, which state it the same way. **Legal basis flagged, not endorsed:** the "EU AI Act Article 50 record-keeping" attribution in the Basis column is INHERITED. Article 50 is the AI Act's transparency provision, and nothing here establishes that it imposes a five-year `AiApiLog` retention duty. Open question for counsel; this record corrects only the enforcement claim. **DISPATCH, added 2026-09-14:** production scheduled dispatch was interrupted from 2026-07-21 to 2026-09-02 (`LL-3e36a18199`, open). Captures dated 2026-09-14 record this task running once per UTC date on 2026-09-03 through 2026-09-14 and reporting 0 EU AI logs purged on each. See `docs/legal/2026-09-14_scheduler-dispatch-interruption-and-restoration.md`. |
| AI API logs (`AiApiLog`), children's accounts (under 13) | 12 months, rolling, independent of account status; **decided, not yet enforced** | 2026-07-09 ratified decision; COPPA 16 CFR § 312.10 | No purge job yet: `ai_api_logs` has no per-row child-subject marker, so this tier cannot be carved out from the 6-year HIPAA floor without a write-time stamp (schema + call-site change) | Tracked in `docs/legal/AI_DATA_FLOW_CLASSIFICATION.md` section 6 |
| AI API logs (`AiApiLog`), all other accounts | 24 months; **decided, not yet enforced** | 2026-07-09 ratified decision; GDPR Article 5(1)(e) storage limitation | No purge job yet: a blanket non-EU 24-month delete cannot safely carve out the 6-year HIPAA audit floor (hospital-linked accounts) or the 12-month children tier without a write-time retention-class stamp (schema + call-site change), so a flat 24-month purge is deliberately not shipped | Tracked with the children tier in `docs/legal/AI_DATA_FLOW_CLASSIFICATION.md` section 6 |
| AI API logs (`AiApiLog`), IP address field, all accounts | 90 days; **configured for daily scheduled execution** | GDPR data minimization; HIPAA audit | `AiApiLog.redact_old_ip_addresses!` daily via `scheduler:dispatch` (`lib/tasks/scheduler.rake`, PR #222) | **CORRECTED 2026-09-14.** This cell previously read "**enforced today**". Production scheduled dispatch of `rake scheduler:dispatch` was interrupted from 2026-07-21 to 2026-09-02 (finding `LL-3e36a18199`, open), so this task was not run by the scheduler in that window; whether it ran by any other route has not been established. Captures dated 2026-09-14 record hourly execution from 2026-09-02 and one run of the daily 06:00 UTC block on each of the twelve UTC dates 2026-09-03 through 2026-09-14. Across September 3 to 14, each of the six inspected task summaries appeared once per UTC date and reported zero for its stated result. Six of the eleven daily tasks were inspected; the remainder were not queried. These observations do not verify every daily task, do not establish stored population size or contents, and do not evidence completion of downstream asynchronous work. See `docs/legal/2026-09-14_scheduler-dispatch-interruption-and-restoration.md`. On each observed execution the update reported zero affected rows. That does not establish whether qualifying rows existed at other times. As of the 2026-08-17 live re-verification recorded in `docs/legal/2026-08-25_ai-data-flow-classification.md`, `ip_address` was null on all 64 `AiApiLog` rows then present; the table has not been re-queried since, so the current population is unknown. Scoped inspection at commit `4104b657b`: three files reach `AiApiLog.log_ai_call` (`lib/ai_board_generator.rb:679`, `lib/ai_word_predictor.rb:408`, `lib/eval_narrator.rb:314`), covering the `board_generation`, `focus_word_generation`, `word_prediction` and `eval_narration` request types, and `ip_address` does not appear in any of those three files. Other write paths have not been exhaustively inspected; the model assigns the parameter when supplied (`app/models/ai_api_log.rb:91`) and `AiApiLog.redact_old_ip_addresses!` writes the column directly (`:225-229`). Row-lifecycle deletion (when the owning account is deleted) is separate and runs via the Flusher cascade below, which is itself dispatched from the same daily block. |
| Authentication and audit trails (`PaperTrail` versions on User, Board, LogSession) | 6 years | HIPAA 45 CFR § 164.316(b)(2)(i); good-practice baseline | **No archival job was found.** `docs/legal/2026-08-30_minimum-necessary-privacy-retention-ai-use-counsel-review.md` records that no cold-storage archival job exists and that `User.flush_old_versions` DELETES these versions at 1 week (LogSession), 1 month (User) and 6 months (Board). This row describes an intended control, not an implemented one. | Required for HIPAA access-log review; the doc-vs-code gap is open and is not resolved here |
| Console and administrative audit events (`AuditEvent`) | **No retention limit today; the table grows without bound** | HIPAA 45 CFR § 164.312(b) audit controls; accounting of disclosures | **None.** `app/models/audit_event.rb` defines no purge method and no task in `lib/tasks/scheduler.rake` references the model | **ADDED 2026-09-22.** This category was absent from every predecessor schedule. Rows are written by audited console sessions (`bin/audit_console`) and by permanent-destruction events, and nothing removes them. Undocumented and unbounded retention is itself the finding; no window is asserted here |
| Analytics events (`WeeklyStatsSummary` and similar aggregates) | Indefinite once aggregated; raw events 2 years | Legitimate interest (GDPR); aggregates are non-identifiable | **No caller was found for the raw-event purge.** The 2026-08-30 counsel-review record notes that `TelemetryEvent.flush` and `ApiCall.flush` exist with no caller. Intended control, not an implemented one. | Aggregates do not re-identify individuals; the doc-vs-code gap is open and is not resolved here |
| Session cookies and device fingerprints | Session lifetime plus 14 days | GDPR consent or legitimate interest; ePrivacy | Browser expiry plus server-side session purge | EU users require opt-in consent before non-essential cookies |
| ClusterLocation (IP and geolocation) | 90 days | GDPR data minimization; HIPAA audit | **Not found.** The 2026-08-30 counsel-review record reports that `app/models/cluster_location.rb` defines no purge method. Intended control, not an implemented one. | Geo coordinates are precise; treat as sensitive; the doc-vs-code gap is open and is not resolved here |
| Backups (Google Cloud SQL, live production) | 7 most-recent automated daily backups, plus point-in-time recovery over a 7 day transaction-log window | Operational recovery | Managed automatically by Cloud SQL (`lingolinq-prod-pg`, us-central1; daily backup at 08:00 UTC, PITR enabled) | Verified against the live instance 2026-07-23. This replaces the pre-cutover Render 35 day window: the recovery window is now **shorter**. No approved RPO target is recorded in the current runbook or schedule, so this attestation does not assert that the window meets an RPO target. Restoring from backup does not defeat deletion; we re-run deletion jobs post-restore |
| Backups (Render managed PostgreSQL, ENDED 2026-09-09) | Ended. Was a 35 day rolling window while the write-frozen fallback existed | Operational rollback for the 2026-07-22 cutover | No longer executed. Render deleted the instances with the workspace on 2026-09-09 | The end condition this row carried ("ends when the Render fallback is decommissioned") is MET. Render-managed backups no longer exist and nothing can be restored from them. Superseded by the archive row below. Whether Render retains residual copies after account deletion is not confirmed with the vendor; the Render DPA is retained |
| Final Render database archive (`gs://lingolinq-prod-render-archive`) | 1 year from 2026-09-02, under an UNLOCKED retention policy | Evidentiary and operational record of the decommissioned platform | GCS bucket retention policy: `retentionPeriod` 31,557,600s (365.25 days), effective 2026-09-02T17:30:22Z. **`isLocked` is ABSENT, so the policy is not locked and a project admin can shorten or remove it.** NEARLINE, public access prevention enforced, uniform bucket-level access, 7 day soft-delete. Verified against the live bucket 2026-09-14 | Two custom-format `pg_dump` sets taken 2026-09-08 from `lingolinq-prod-db` and `lingolinq-dev-staging-db`, restore-verified into stock PostgreSQL 18.6 with `pg_restore --exit-on-error`, both exit 0. See `RESTORE-MANIFEST-2026-09-08.md` at the bucket root. **Open question for the attester:** an Article 17 erasure request against this archive IS executable. The policy blocks object deletion while it stands, but it is unlocked, so the sequence is remove the policy, then delete. Erasure here is a decision, not a technical impossibility, and this schedule must not claim otherwise. Prod carried no real users at cutover; the 2.4 GB dev/staging dump has not been assessed for real content |
| Incident log (`docs/legal/INCIDENT_LOG.md`) | 7 years minimum from incident close | HIPAA; state breach statutes; legal hold | Manual, only with Privacy Contact approval | Append-only; no deletion without legal review |
| Support tickets | 3 years from last activity | Legitimate interest; tax defense | Help-desk tool retention policy | Tickets referencing PHI follow HIPAA audit retention |
| Billing and tax records | 7 years | IRS recordkeeping guidance; state tax rules | Accounting system scheduled purge | Includes invoices, payment records, purchase orders |
| Marketing consent records | Life of the account plus 3 years | Accountability under GDPR Article 7(1) | HubSpot retention policy; mirrored in user settings | Proves consent or withdrawal of consent on request |
| Pen-test reports and security assessments | 6 years | HIPAA evaluation requirements; SOC program expectations | Secure document store with periodic review | Also retained if required for legal hold |
| Vendor agreements, DPAs, BAAs | Term plus 7 years after termination | Contract statute of limitations; tax | Contract repository retention | Includes AWS BAA, HubSpot DPA, Render DPA |
| Employment and contractor records | 7 years after separation | FLSA, IRS, state employment law | HR system retention | Includes time entries in Clockify |
| Children's data (users under 13) | Account and content are not automatically deleted solely because a user turns 18 | COPPA 16 CFR § 312.10 | Explicit user or verified parental deletion path; no age-based deletion mechanism | Verified parental deletion requests processed within 30 days; applicable legal holds and consent-age requirements remain controlling |
| Supervisor consent records (`SupervisorConsentService`) | Life of the relationship plus 2 years | COPPA, FERPA; accountability | Flusher cascade when parent user is deleted | Token-based, 14 day token TTL |
| Deleted-user tombstones | Indefinite (identifier only, no PII) | Integrity, prevent replay | Tombstones stored outside live tables | Used to prevent recreating deleted identifiers |

### Backup and RPO review (2026-07-23)

The live Cloud SQL configuration was verified with `gcloud sql instances describe lingolinq-prod-pg`:

- Region: `us-central1`
- Automated backups: enabled, 7 retained backups, daily start time 08:00 UTC
- Point-in-time recovery: enabled, with 7 days of transaction-log retention

No approved recovery point objective (RPO) target was found in this schedule, the breach runbook, or
the repository's current infrastructure documentation. The current capability is therefore verified,
but whether it meets the organization's RPO is undetermined and is not asserted by this attestation.
The infrastructure owner must set the target and validate it with a restore exercise. If the target
requires recovery beyond the current 7-day PITR window, increase transaction-log retention and review
backup retention. If the target requires less potential data loss than the tested Cloud SQL recovery
path supports, shorten the backup interval and validate the resulting restore procedure.

## 3. Deletion Mechanism

LingoLinq performs deletion through `lib/flusher.rb`. The Flusher cascades from the top-level record (typically `User` or `Organization`) and removes:

- User settings blob (`users.settings` secure-serialized)
- Associated `Board`, `LogSession`, `UserVideo`, `ButtonSound` (including off-board / message-bank), `AiApiLog`, `Device`, and related connection/integration records swept by `flush_user_content`
- S3 objects for destroyed uploadable media when the URL is unique and marked removable
- External CRM records (HubSpot) when `ExternalTracker` has written them
- Session artifacts and active tokens

Known gaps tracked for remediation: the Flusher cascade must be verified against any newly added model. A 2026 April audit flagged `License`, `UserVideo`, `UserExtra`, `AiApiLog`, `ContactMessage`, and `LogSnapshot`; `License`, `UserVideo`/`ButtonSound`, and `AiApiLog` now have explicit Flusher handling. `LogSnapshot` has since been traced and confirmed to have **no** erasure path (open finding LL-1e2ab28aab). `UserExtra` and `ContactMessage` remain unverified: no claim is made here either way. These gaps are tracked in the findings register (`audit-reports/FINDINGS.json`), which is the single source of truth for remediation status; there is deliberately no separate gap tracker, because a second list would drift from the register.

Retention enforcement jobs are **configured to run** under `lib/tasks/scheduler.rake` at 06:00 UTC daily. Production scheduled dispatch of `rake scheduler:dispatch` was interrupted from 2026-07-21 to 2026-09-02 (finding `LL-3e36a18199`, open), so this task was not run by the scheduler in that window; whether it ran by any other route has not been established. Captures dated 2026-09-14 record hourly execution from 2026-09-02 and one run of the daily 06:00 UTC block on each of the twelve UTC dates 2026-09-03 through 2026-09-14. Across September 3 to 14, each of the six inspected task summaries appeared once per UTC date and reported zero for its stated result. Six of the eleven daily tasks were inspected; the remainder were not queried. These observations do not verify every daily task, do not establish stored population size or contents, and do not evidence completion of downstream asynchronous work. See `docs/legal/2026-09-14_scheduler-dispatch-interruption-and-restoration.md`. The `DataPolicyEnforcer` reads the org-level effective data policy (inherited from parent orgs) and applies the correct per-tenant windows.

## 4. Data Subject Rights

Users and authorized representatives may request export or deletion of their personal data at any time by emailing privacy@lingolinq.com or by using the in-product "Export my data" and "Delete my account" controls. Under GDPR we respond within one calendar month; under COPPA parental deletion requests are processed within 30 days. Verified requests trigger the Flusher mechanism described in section 3. For HIPAA-covered tenants, deletion is coordinated with the covered entity per the Business Associate Agreement.

## 5. Legal Holds

A legal hold suspends deletion for the specific data in scope. Legal holds are applied by the Privacy Contact in consultation with counsel and are tracked in `docs/legal/LEGAL_HOLDS.md` (create as needed). Systems honor the hold through a `legal_hold_until` timestamp on the relevant record or by flagging the tenant; automated retention jobs skip any record with an active hold.

## 6. Review Cadence

- Annual review of this document every April, or sooner if a law, regulation, or material contract changes.
- Quarterly review of retention job execution logs to confirm the jobs are running as scheduled. **Note added 2026-09-14:** no recurring-review entry corresponding to this control exists in `audit-reports/compliance-calendar.json`, so the register holds no record of its performance. Whether it has been performed outside the register is unverified.
- Each new model or column added to the application must be reviewed against this schedule before it ships to production; the `compliance-check` slash command exercises this review.

## 7. References

- GDPR Article 5(1)(e): storage limitation
- HIPAA Security Rule 45 CFR §§ 164.308, 164.316
- FERPA 34 CFR § 99.31
- COPPA Rule 16 CFR Part 312
- IRS Publication 583 on recordkeeping
- LingoLinq COMPLIANCE.md
- LingoLinq SUBPROCESSORS.md
- LingoLinq BREACH_RUNBOOK.md

---

Footer: LingoLinq users can request export or deletion of their personal data at any time by emailing privacy@lingolinq.com. Deletions are executed through the Flusher mechanism described in section 3 and confirmed back to the requester in writing.
