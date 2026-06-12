# LingoLinq Data Retention Schedule

**Owner:** Privacy Office (privacy@lingolinq.com)
**Last reviewed:** 2026-04-20
**Next review:** 2027-04-20
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
| Communication snapshots (`LogSnapshot`) | Same as parent LogSession | Same as LogSession | Cascading delete with LogSession | Snapshots purge when parent session retention expires |
| Audio and video recordings (`UserVideo`, `UserSound`) | Tied to user account retention | FERPA; GDPR | `Flusher` removes S3 objects with the user record | S3 object keys are anonymized identifiers |
| Board definitions (`Board`) | Retained while the owning user or shared copies remain active | Contract; FERPA school-official role | Flusher cascade for owner delete; shared copies persist with their owners | Public boards published to the library follow a separate public-content policy |
| AI API logs (`AiApiLog`) | Full record kept 2 years; IP addresses redacted at 90 days | GDPR data minimization; HIPAA audit | `AiApiLog.redact_old_ip_addresses!` for 90 day IP scrub; purge job at 2 years | IP redaction task must be scheduled in `lib/tasks/scheduler.rake` (see open gap) |
| Authentication and audit trails (`PaperTrail` versions on User, Board, LogSession) | 6 years | HIPAA 45 CFR § 164.316(b)(2)(i); good-practice baseline | Scheduled archival job; active-record versions are retained, older are migrated to cold storage | Required for HIPAA access-log review |
| Analytics events (`WeeklyStatsSummary` and similar aggregates) | Indefinite once aggregated; raw events 2 years | Legitimate interest (GDPR); aggregates are non-identifiable | Raw-event purge job; aggregates retained | Aggregates do not re-identify individuals |
| Session cookies and device fingerprints | Session lifetime plus 14 days | GDPR consent or legitimate interest; ePrivacy | Browser expiry plus server-side session purge | EU users require opt-in consent before non-essential cookies |
| ClusterLocation (IP and geolocation) | 90 days | GDPR data minimization; HIPAA audit | Nightly job trims older records | Geo coordinates are precise; treat as sensitive |
| Backups (Render managed PostgreSQL) | 35 day rolling window | Operational recovery; aligned with RPO target | Managed automatically by Render | Restoring from backup does not defeat deletion; we re-run deletion jobs post-restore |
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

## 3. Deletion Mechanism

LingoLinq performs deletion through `lib/flusher.rb`. The Flusher cascades from the top-level record (typically `User` or `Organization`) and removes:

- User settings blob (`users.settings` secure-serialized)
- Associated `Board`, `LogSession`, `LogSnapshot`, `UserVideo`, `UserSound`, `UserExtra`, `AiApiLog`, `Device`, `Subscription`, `SupervisorRelationship`, `ContactMessage`
- S3 objects under the user's namespace in the configured bucket
- External CRM records (HubSpot) when `ExternalTracker` has written them
- Session artifacts and active tokens

Known gaps tracked for remediation: the Flusher cascade must be verified against any newly added model. A 2026 April audit flagged `License` (added 2026-04-07), `UserVideo`, `UserExtra`, `AiApiLog`, `ContactMessage`, and `LogSnapshot` as models that require explicit Flusher handling. Those gaps are tracked in `docs/compliance/flusher-gaps.md` (to be created).

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
