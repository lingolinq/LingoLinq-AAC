# LingoLinq AAC Compliance Posture Report

> **DRAFT, awaiting attestation.** This is a Phase 3 skeleton generated from the findings
> register. It is not a published statement and must not be shared externally until Scot
> attests it. The headline counts are read directly from `audit-reports/FINDINGS.json`; every
> other report in `audit-reports/` is a point-in-time snapshot and is not authoritative for
> status. Drafted by the compliance-officer; goes through adversary review before reaching Scot.
>
> Refreshed: 2026-06-18. Register audited SHA: `d72463c7` (auditedDate 2026-06-17, ref `staging`).
> The staging tip is `59e20439e`; it leads the audited SHA by one infrastructure-only commit
> (#416, a GCP Memorystore AUTH flag fix) that added no findings. Headline counts are read
> directly from `audit-reports/FINDINGS.json`; do not hand-edit the figures, refresh them from
> the register.

### Changes since the prior draft (2026-06-13)

- **Eval-narration AI surface brought under governance** (#411, #412, #413). The comprehensive
  assessment narrator now scrubs student PII before egress, logs every call to `AiApiLog`, hard
  blocks under-13 eval data via COPPA gating, and binds the egress payload to the server-resolved
  user. Three findings on this path were verified-closed; one residual stays open (below).
- **Redis TLS capability shipped** (#410). The application can now speak `rediss://` TLS to a
  managed Redis. This is an enabler for the GCP Memorystore cutover, not a live closure: the
  current hosting environment still runs plaintext `redis://`, so finding LL-6619cc1811 stays open.
- **Headline moved from 0 Critical / 13 High to 0 Critical / 16 High** as the second full audit
  run and the accessibility finder promoted new findings into the register. The rise reflects
  wider scan coverage, not new regressions.

## Headline

| Metric | Count |
|---|---|
| **Open Critical findings** | **0** |
| **Open High findings** | **16** |
| Open Medium / Low | 18 / 14 |
| Verified closed (Scot attested) | 12 |
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
| FERPA (US schools) | 10 | 5 | Student data isolation, access scoping, audit trail. |
| HIPAA (US hospitals) | 8 | 6 | PHI handling, minimum necessary, BAA coverage. AWS BAA on file (2026-02). Render BAA pending. GCP/Cloud Run BAA for the migration: confirm execution and file the artifact in `docs/legal/` before Google compute carries production data. |
| GDPR (EU clients) | 4 | 2 | Data residency, subprocessor posture, deletion and export paths. |
| COPPA (under-13 users) | 1 | 1 | Amended Rule enforceable since 2026-04-22. The one open High is the eval-narration consent-binding residual (LL-11db0dc848). Product controls below. |
| WCAG (accessibility) | 8 | 1 | Tracked as a standing domain because it is product-existential for an AAC tool. See Accessibility below. |
| SOC 2 (in progress) | 7 | 0 | Control-evidence and audit-system hardening items. |

A single finding can map to more than one framework, so these rows do not sum to the 48 open
total. 21 open findings carry no framework tag (engineering-quality and API-contract items).

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
- **Eval-narration AI gating** (`lib/eval_narrator.rb`, `app/controllers/api/eval_sessions_controller.rb`):
  the comprehensive assessment narrator is held to the same controls as the rest of the AI
  surface. Student PII is scrubbed before egress, every call is recorded in `AiApiLog`, a COPPA
  hard block prevents under-13 eval data from reaching the model, external narration is opt-in,
  and the egress payload is bound to the server-resolved user (the client-asserted student name
  is dropped). One residual on this path stays open and tracked (consent binding to the gate
  subject, LL-11db0dc848).

## Infrastructure migration in progress

LingoLinq is migrating production compute from Render to Google Cloud Run, with object storage
and email staying on AWS. Two compliance-relevant items are in flight:

- **Managed Redis over TLS.** The application can now negotiate `rediss://` TLS to a managed
  Redis instance (#410), which is the prerequisite for moving Redis to GCP Memorystore with AUTH
  and TLS. The current Render environment still runs plaintext `redis://`, so the corresponding
  finding (LL-6619cc1811, HIPAA) is held open until the cutover lands. Closure is gated on the
  migration, not on a separate fix.
- **GCP Business Associate Agreement.** The migration record indicates a BAA with Google was
  pursued in Phase 1, but no executed artifact is on file in `docs/legal/` and the only Google BAA
  item currently tracked in the register is the Gemini API path (`rev-gemini-baa-annual`). Confirm
  the Cloud Run / GCP infrastructure BAA, file the artifact, and add Google as an active
  subprocessor at cutover. Until then Google compute is not listed as an active subprocessor (see
  `docs/legal/SUBPROCESSORS.md`).

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
