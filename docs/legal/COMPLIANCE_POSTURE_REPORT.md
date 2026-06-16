# LingoLinq AAC Compliance Posture Report

> **DRAFT, awaiting attestation.** This is a Phase 3 skeleton generated from the findings
> register. It is not a published statement and must not be shared externally until Scot
> attests it. The headline counts are read directly from `audit-reports/FINDINGS.json`; every
> other report in `audit-reports/` is a point-in-time snapshot and is not authoritative for
> status. Drafted by the compliance-officer; goes through adversary review before reaching Scot.
>
> Generated: 2026-06-13. Register audited SHA: `56da75814c` (auditedDate 2026-06-12).
> Regenerated per audit run; do not hand-edit.

## Headline

| Metric | Count |
|---|---|
| **Open Critical findings** | **0** |
| **Open High findings** | **13** |
| Open Medium / Low | 7 / 6 |
| Verified closed (Scot attested) | 9 |
| Superseded | 2 |

The headline is the count of open Critical and High findings, not a synthetic readiness score
(modernization decision 5.9.2). Zero open Critical findings is the gating metric. Open High
findings are tracked to closure under remediation service levels (High: 15 to 30 days,
advisory). No finding is marked closed until the fix is verified against live code and Scot
signs the attestation.

## How LingoLinq runs compliance

LingoLinq operates a continuous findings register rather than periodic point-in-time reports.
The practices behind these numbers:

1. **One register, one source of truth.** Findings carry a stable ID, severity, framework
   tags, evidence anchored to a file and line at a specific commit, and a status lifecycle
   (open, remediated but unverified, verified and closed, accepted risk, superseded).
2. **Read-only auditors.** Specialist finder agents scan the code and can only report. They
   cannot edit code, change infrastructure, or close their own findings. An independent
   adversary pass tries to refute each new finding before it is treated as real.
3. **Human attestation.** Only the accountable owner closes a finding, downgrades severity, or
   accepts risk. An AI may draft and flag; it may not decide. Attestation records who signed
   and when.
4. **Evidence is code, never user data.** No student or patient data appears in any audit
   artifact. Evidence snippets are source code only.
5. **Recurrence is a diff.** Finding IDs are deterministic, so a previously closed finding that
   reappears is flagged as a regression, not silently reopened.

## Posture by framework

Open-finding distribution across regulatory frameworks (a single finding can map to more than
one framework):

| Framework | Open findings | Open High | Context |
|---|---:|---:|---|
| FERPA (US schools) | 8 | 4 | Student data isolation, access scoping, audit trail. |
| HIPAA (US hospitals) | 6 | 5 | PHI handling, minimum necessary, BAA coverage. AWS BAA on file (2026-02). |
| GDPR (EU clients) | 4 | 2 | Data residency, subprocessor posture, deletion and export paths. |
| SOC 2 (in progress) | 5 | 0 | Control-evidence and audit-system hardening items. |
| COPPA (under-13 users) | see controls | see controls | Amended Rule enforceable since 2026-04-22. Controls below. |

### Active product controls (evidence in code)

These are implemented and operating, not aspirational:

- **PiiScrubber backstop** (`lib/pii_scrubber.rb`): identifiable data is redacted before any
  external model call. This is the enforced control, independent of any vendor data-retention
  toggle.
- **Feature flags** (`lib/feature_flags.rb`): AI features are individually gated, with a COPPA
  hard block for under-13 users.
- **Child-event scrubbing** (`config/initializers/sentry.rb`, CoppaSentryScrub): drops error
  events tied to child users before they reach the error tracker.
- **Console auditing** (`AuditEvent`) and **AI call logging** (`AiApiLog`): privileged access
  and external model calls are recorded with audit trails.

## Accessibility

Accessibility is tracked as a standing compliance domain because it is product-existential for
an AAC tool. A WCAG 2.1 AA Accessibility Conformance Report is in draft
(`docs/legal/ACCESSIBILITY_CONFORMANCE_REPORT.md`). Current internal status is Partially
Supports on the modernized surfaces, with remediation patterns identified. Assistive-technology
user testing and full-surface coverage are the gaps to close before that report is published.

## AI governance

Model usage, the no-identifiable-data-to-external-models policy, the position that zero data
retention is a privacy control and not a substitute for a Business Associate Agreement, and the
EU AI Act classification analysis are documented in the AI Governance Memo
(`docs/legal/AI_GOVERNANCE_MEMO.md`).

## What this report is and is not

- It **is** an honest internal posture summary, generated from live data, suitable as the basis
  for customer-facing responses once attested.
- It is **not** a certification, a legal opinion, or a guarantee of compliance.
- The disclosure altitude for any externally shared version (counts as shown, or summarized) is
  Scot's decision at attestation time.

## Attestation

| Field | Value |
|---|---|
| Prepared by | compliance-officer agent (draft) |
| Reviewed by | adversary agent (pending) |
| Attested by | _Scot Wahlquist (pending signature)_ |
| Attestation date | _pending_ |

_Phase 3 deliverable of the Audit/Compliance System Modernization (plan section 6). The one-way
Notion publish of this report is a separate, human-initiated step into the Master Inbox._
