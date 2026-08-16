# LingoLinq Data Retention Schedule

> **DRAFT - awaiting attestation (2026-08-09).** Successor to attested
> `docs/legal/DATA_RETENTION.md` (DOC-bff9acf51f). Internal use only until the CEO attests this file.
> Scope of this draft: updates the audio/video deletion row and Flusher cascade notes
> (`UserVideo`, `ButtonSound`, including off-board / message-bank recordings) to match
> `Flusher.flush_user_content` at HEAD (PR #721). Does not close, downgrade, or re-attest any finding.

**Owner:** Privacy Office (privacy@lingolinq.com)
**Last reviewed:** 2026-08-09 (draft; predecessor attested 2026-07-23 by Scot Wahlquist, CEO)
**Next review:** 2027-04-20 (carry-forward until attestation rebases cadence)
**Supersedes:** attested `docs/legal/DATA_RETENTION.md` (DOC-bff9acf51f)
**Attestation history:** first attested 2026-06-21. That attestation covered an earlier revision:
PR #569 (2026-07-10) and PR #656 (2026-07-22) rewrote the AI-log retention rows, and the
2026-07-22 Gate 1 cutover moved the production database off Render, which the backup rows did not
reflect until the 2026-07-23 correction below. Re-attested 2026-07-23 against the then-current
revision. This 2026-08-09 draft supersedes that attested cut for the Flusher erasure updates in
PR #721 and awaits CEO attestation.
**Related:** `docs/legal/BREACH_RUNBOOK.md`, `docs/legal/SUBPROCESSORS.md`, `COMPLIANCE.md`

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
| User account records (`users` table and dependents) | Active for the life of the account plus 2 years of inactivity, then soft-delete | GDPR Article 5(1)(e); FERPA; contract | `lib/flusher.rb` `Flusher.flush_user_completely` | Soft-delete masks PII; hard purge runs per org data policy |
| Communication logs (`LogSession`) | 3 years default, configurable per user or organization via data policy | GDPR Article 5(1)(e); FERPA; customer contract | `lib/data_policy_enforcer.rb` nightly retention job | User and org settings override default; district customers commonly set 5 years |
| Communication snapshots (`LogSnapshot`) | **No automated erasure path today** | GDPR Article 17; FERPA | **None.** `LogSnapshot` is keyed by `user_id` and is not swept by `Flusher`; no `dependent: :destroy` and no database foreign key exists | Open finding LL-1e2ab28aab. Individually deletable by the user via the snapshots API; a hard delete leaves the row (label, date range, `device_id`, dangling `location_id`) |
| Audio and video recordings (`UserVideo`, `ButtonSound`) | Tied to user account retention | FERPA; GDPR | `Flusher.flush_user_content` destroys owned rows; Uploadable schedules S3 `remote_remove` for the primary `url`; the `MediaObject` concern additionally schedules removal of the transcription working copy, prior-transcode originals, the video thumbnail, and an abandoned/never-confirmed upload's raw object on destroy | Includes off-board / message-bank voice recordings. Thumbnail removal first lists the video's own S3 objects, which needs `s3:ListBucket` on the uploads-bucket credential in addition to the delete permissions the other categories rely on; this permission is not yet verified in production, with a same-effort delete-attempt fallback if listing fails. LL-854b1d3853 remains open pending independent (dual-reviewer) verification of complete media-object erasure |
| Board definitions (`Board`) | Retained while the owning user or shared copies remain active | Contract; FERPA school-official role | Flusher cascade for owner delete; shared copies persist with their owners | Public boards published to the library follow a separate public-content policy |
| AI API logs (`AiApiLog`), EU-jurisdiction accounts | Up to 5 years, **enforced** | EU AI Act Article 50 record-keeping | `AiApiLog.purge_old_eu_logs!(years: 5)` (PR #553), daily via `scheduler:dispatch` | Now functional: the Art50 Phase 4 shared call-context helper stamps `jurisdiction = 'EU'` at the three AI call sites (merged to staging). It matches EU rows wherever Phase 4 is deployed; effective in production only after the Phase 4/5 production deploy |
| AI API logs (`AiApiLog`), children's accounts (under 13) | 12 months, rolling, independent of account status; **decided, not yet enforced** | 2026-07-09 ratified decision; COPPA 16 CFR § 312.10 | No purge job yet: `ai_api_logs` has no per-row child-subject marker, so this tier cannot be carved out from the 6-year HIPAA floor without a write-time stamp (schema + call-site change) | Tracked in `docs/legal/AI_DATA_FLOW_CLASSIFICATION.md` section 6 |
| AI API logs (`AiApiLog`), all other accounts | 24 months; **decided, not yet enforced** | 2026-07-09 ratified decision; GDPR Article 5(1)(e) storage limitation | No purge job yet: a blanket non-EU 24-month delete cannot safely carve out the 6-year HIPAA audit floor (hospital-linked accounts) or the 12-month children tier without a write-time retention-class stamp (schema + call-site change), so a flat 24-month purge is deliberately not shipped | Tracked with the children tier in `docs/legal/AI_DATA_FLOW_CLASSIFICATION.md` section 6 |
| AI API logs (`AiApiLog`), IP address field, all accounts | 90 days, **enforced today** | GDPR data minimization; HIPAA audit | `AiApiLog.redact_old_ip_addresses!` daily via `scheduler:dispatch` (`lib/tasks/scheduler.rake`, PR #222) | Row-lifecycle deletion (when the owning account is deleted) is separate and already enforced via the Flusher cascade below |
| Authentication and audit trails (`PaperTrail` versions on User, Board, LogSession) | 6 years | HIPAA 45 CFR § 164.316(b)(2)(i); good-practice baseline | Scheduled archival job; active-record versions are retained, older are migrated to cold storage | Required for HIPAA access-log review |
| Analytics events (`WeeklyStatsSummary` and similar aggregates) | Indefinite once aggregated; raw events 2 years | Legitimate interest (GDPR); aggregates are non-identifiable | Raw-event purge job; aggregates retained | Aggregates do not re-identify individuals |
| Session cookies and device fingerprints | Session lifetime plus 14 days | GDPR consent or legitimate interest; ePrivacy | Browser expiry plus server-side session purge | EU users require opt-in consent before non-essential cookies |
| ClusterLocation (IP and geolocation) | 90 days | GDPR data minimization; HIPAA audit | Nightly job trims older records | Geo coordinates are precise; treat as sensitive |
| Backups (Google Cloud SQL, live production) | 7 most-recent automated daily backups, plus point-in-time recovery over a 7 day transaction-log window | Operational recovery | Managed automatically by Cloud SQL (`lingolinq-prod-pg`, us-central1; daily backup at 08:00 UTC, PITR enabled) | Verified against the live instance 2026-07-23. This replaces the pre-cutover Render 35 day window: the recovery window is now **shorter**. No approved RPO target is recorded in the current runbook or schedule, so this attestation does not assert that the window meets an RPO target. Restoring from backup does not defeat deletion; we re-run deletion jobs post-restore |
| Backups (Render managed PostgreSQL, superseded) | 35 day rolling window, retained only while the write-frozen rollback fallback exists | Operational rollback for the 2026-07-22 cutover | Managed automatically by Render until the fallback is deleted or restricted | Frozen copy of pre-cutover production data. Ends when the Render fallback is decommissioned (see `SUBPROCESSORS.md` §5.2). `BREACH_RUNBOOK.md` now names Cloud SQL as the primary recovery source and retains Render only as the rollback fallback |
| Incident log (`docs/legal/INCIDENT_LOG.md`) | 7 years minimum from incident close | HIPAA; state breach statutes; legal hold | Manual, only with Privacy Contact approval | Append-only; no deletion without legal review |
| Support tickets | 3 years from last activity | Legitimate interest; tax defense | Help-desk tool retention policy | Tickets referencing PHI follow HIPAA audit retention |
| Billing and tax records | 7 years | IRS recordkeeping guidance; state tax rules | Accounting system scheduled purge | Includes invoices, payment records, purchase orders |
| Marketing consent records | Life of the account plus 3 years | Accountability under GDPR Article 7(1) | HubSpot retention policy; mirrored in user settings | Proves consent or withdrawal of consent on request |
| Pen-test reports and security assessments | 6 years | HIPAA evaluation requirements; SOC program expectations | Secure document store with periodic review | Also retained if required for legal hold |
| Vendor agreements, DPAs, BAAs | Term plus 7 years after termination | Contract statute of limitations; tax | Contract repository retention | Includes AWS BAA, HubSpot DPA, Render DPA |
| Employment and contractor records | 7 years after separation | FLSA, IRS, state employment law | HR system retention | Includes time entries in Clockify |
| Children's data (users under 13) | Parent-controllable at any time; automatic purge at age 18 or after 2 years of inactivity, whichever is sooner | COPPA 16 CFR § 312.10 | `Flusher` with child-flag path; age-threshold sweeper | Parental deletion requests processed within 30 days |
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

Retention enforcement jobs run under `lib/tasks/scheduler.rake` at 06:00 UTC daily. The `DataPolicyEnforcer` reads the org-level effective data policy (inherited from parent orgs) and applies the correct per-tenant windows.

## 4. Data Subject Rights

Users and authorized representatives may request export or deletion of their personal data at any time by emailing privacy@lingolinq.com or by using the in-product "Export my data" and "Delete my account" controls. Under GDPR we respond within one calendar month; under COPPA parental deletion requests are processed within 30 days. Verified requests trigger the Flusher mechanism described in section 3. For HIPAA-covered tenants, deletion is coordinated with the covered entity per the Business Associate Agreement.

## 5. Legal Holds

A legal hold suspends deletion for the specific data in scope. Legal holds are applied by the Privacy Contact in consultation with counsel and are tracked in `docs/legal/LEGAL_HOLDS.md` (create as needed). Systems honor the hold through a `legal_hold_until` timestamp on the relevant record or by flagging the tenant; automated retention jobs skip any record with an active hold.

## 6. Review Cadence

- Annual review of this document every April, or sooner if a law, regulation, or material contract changes.
- Quarterly review of retention job execution logs to confirm the jobs are running as scheduled.
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
