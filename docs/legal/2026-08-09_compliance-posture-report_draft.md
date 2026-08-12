# LingoLinq AAC Compliance Posture Report

> **DRAFT - awaiting attestation (2026-08-09 counts refresh).** Successor to attested
> `docs/legal/COMPLIANCE_POSTURE_REPORT.md` (re-attested 2026-07-23). Prior attestations on the
> predecessor: ATTESTED 2026-06-19 by Scot Wahlquist, CEO; RE-ATTESTED 2026-07-16; RE-ATTESTED
> 2026-07-23. This draft refreshes headline and framework counts from the findings register at
> HEAD. It is not a current attested statement until Scot signs. Drafted by the
> compliance-officer; for adversary review; for CEO attestation.
>
> Register audited SHA: `20953ab3` (auditedDate 2026-07-08, ref `scot/compliance/audit-refresh-2026-07-07`).
> That stamp records the last full audit RUN. The register has been amended by remediation and
> disclosure PRs since, so the counts below are re-derived from `audit-reports/FINDINGS.json` **as
> committed at HEAD `20aab90d3`**, not from a re-run audit, using the publisher convention (`open` +
> `remediated-unverified` findings by severity, per `scripts/compliance-notion-publish.rb`). Do not
> hand-edit the figures; refresh them from the register.

### Changes since the 2026-07-23 re-attest (predecessor)

- **Counts refreshed 2026-08-09 (this draft).** Publisher convention at HEAD gives **0 Critical /
  12 High / 30 Medium / 25 Low** (67 live), against 8 / 27 / 25 (60) at the 2026-07-23 re-attest.
  Open Critical remains **0**, the gating metric. The High rise reflects three Highs promoted from
  PR-review adversary passes (LL-1b0d78dbe6, LL-16ef84ad9a on 2026-08-02; LL-522c1a6d13 on
  2026-08-04) plus same-day 2026-07-23 register movement after the early-day 8 High stamp. No
  finding is marked closed in this draft.
- **Gate 1 DNS cutover completed (2026-07-22).** `app.lingolinq.com` serves from GCP Cloud Run
  with Cloud SQL and Memorystore. Render remains a write-frozen rollback fallback pending
  explicit decommission.
- **Redis TLS (LL-6619cc1811) verified-closed (2026-07-22).** In-context Cloud Run `rediss://`
  evidence and Scot attestation are on the finding; this report no longer treats Redis TLS as open.
- **Eval consent-binding residual (LL-11db0dc848) verified-closed (2026-06-23).** Do not restate
  as an open High.
- **EU AI Act Article 50 date passed (2026-08-02).** Article 50(2) machine-readable marking is
  shipped (`lib/art50_marker.rb`). Article 50(1) disclosure UI is built but
  `article_50_disclosure` remains AVAILABLE-only. Open WCAG High LL-a9d6d5a46b (low-contrast
  full-notice link) is a pre-enable blocker for that modal.
- **GCP infrastructure agreements recorded.** GCP CDPA + HIPAA BAA and SCCs for project
  `lingolinq-prod` remain as previously attested; Google Cloud infrastructure is an active
  subprocessor in `SUBPROCESSORS.md`. Google Gemini remains disabled as an AI runtime path.

### Earlier changes (retained for history)

- **Eval-narration AI surface brought under governance** (#411, #412, #413).
- **Redis TLS capability shipped** (#410), later verified-closed after Gate 1.
- **Open High count moved 13 -> 16 -> 4** after the 2026-06 disposition and remediation wave, then
  rose again through the 2026-07-07 audit refresh and subsequent PR-time filings (see register).
- **Counts refreshed and re-attested 2026-07-16 and 2026-07-23** on the predecessor file.

## Headline

| Metric | Count |
|---|---|
| **Open Critical findings** | **0** |
| **Open High findings** | **12** |
| Open Medium / Low | 30 / 25 |
| Verified closed (Scot attested) | 50 |
| Accepted risk | 5 |
| Superseded | 2 |

The headline counts `open` plus `remediated-unverified` findings by severity (the publisher
convention, modernization decision 5.9.2), not a synthetic readiness score. Zero open Critical
findings is the gating metric. Open High
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
| FERPA (US schools) | 19 | 5 | Student data isolation, access scoping, audit trail, share-token and deletion residuals. |
| HIPAA (US hospitals) | 11 | 4 | PHI handling, minimum necessary, BAA coverage. AWS BAA on file (2026-02); GCP HIPAA BAA accepted (project `lingolinq-prod` 2026-07-12; org-wide 2026-06-08). |
| GDPR (EU clients) | 13 | 4 | Data residency, subprocessor posture, deletion and export paths. GCP SCCs certified (2026-07-14, project `lingolinq-prod`). |
| COPPA (under-13 users) | 5 | 2 | Amended Rule enforceable since 2026-04-22. Open Highs include seat-reclaim consent (LL-f150e0e828) and hard-delete media (LL-854b1d3853). |
| WCAG (accessibility) | 12 | 2 | Standing domain for an AAC tool. Open Highs: terms-agree switch scanning (LL-104bfa61dc); Article 50 disclosure contrast (LL-a9d6d5a46b). |
| SOC 2 (in progress) | 24 | 3 | Control-evidence and audit-system hardening (worker memory, S3 KMS writes, audited console). |

A single finding can map to more than one framework, so these rows do not sum to the 67 live total
(open + remediated-unverified). 9 of those findings carry no framework tag (engineering-quality and
API-contract items).

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
  and external model calls are recorded with audit trails. The audited-console wrapper residual
  (LL-7f7372e3eb) remains open for per-session AuditEvent coverage.
- **Eval-narration AI gating** (`lib/eval_narrator.rb`, `app/controllers/api/eval_sessions_controller.rb`):
  the comprehensive assessment narrator is held to the same controls as the rest of the AI
  surface. Student PII is scrubbed before egress, every call is recorded in `AiApiLog`, a COPPA
  hard block prevents under-13 eval data from reaching the model, external narration is opt-in,
  and the egress payload is bound to the server-resolved user. The prior consent-binding High
  (LL-11db0dc848) is verified-closed.
- **Article 50(2) marking** (`lib/art50_marker.rb`): server-signed provenance markers on in-scope
  generative paths. Article 50(1) disclosure remains built but flag-gated off.

## Infrastructure migration state

LingoLinq completed the Gate 1 DNS cutover on 2026-07-22. Production compute for
`app.lingolinq.com` now runs on Google Cloud Run, with Cloud SQL PostgreSQL and Memorystore Redis
inside the GCP infrastructure boundary. Object storage and email stay on AWS. Render remains online
as a write-frozen rollback fallback until explicit decommission.

- **Managed Redis over TLS.** Redis TLS finding LL-6619cc1811 is **verified-closed** with
  in-context Cloud Run `rediss://` evidence and Scot attestation (2026-07-22).
- **GCP Business Associate Agreement.** The Google Cloud HIPAA BAA was first accepted in-console
  org-wide (certified 2026-06-08; acceptance evidence captured 2026-06-19). On 2026-07-12 the
  Cloud Data Processing Addendum (CDPA) and the HIPAA BAA were reviewed and accepted for project
  `lingolinq-prod` specifically, and the Standard Contractual Clauses (EU GDPR, UK GDPR, Swiss
  FDPA) were certified 2026-07-14 for EU/UK/Swiss-transfer coverage. Under the HIPAA BAA, PHI is
  permitted on Google Cloud subject to BAA terms, which are necessary but not sufficient
  (HIPAA-eligible services, encryption in transit and at rest, access controls, minimum necessary;
  private VPC additionally). Recorded in-repo at `docs/legal/GCP_BAA_ACCEPTED.md`; evidence in
  Drive "Compliance Audits" / "Google Cloud Platform - Accepted Compliance Agreements (captured
  2026-07-14)". This is an infrastructure BAA (Cloud Run, Cloud SQL, Memorystore) covering only
  products on Google's HIPAA Covered Products list; it does not extend to Vertex AI as a whole or
  to the Anthropic model-provider egress path. Any future Vertex AI or Gemini inference path
  requires per-product covered-service verification before PHI or child data. Google Cloud
  infrastructure is listed as an active subprocessor in `docs/legal/SUBPROCESSORS.md`; Google
  Gemini remains disabled as an AI runtime path.

## Accessibility

Accessibility is tracked as a standing compliance domain because it is product-existential for
an AAC tool. A WCAG 2.1 AA Accessibility Conformance Report is in draft
(`docs/legal/ACCESSIBILITY_CONFORMANCE_REPORT.md`). Current internal status is Partially
Supports on the modernized surfaces, with remediation patterns identified. Assistive-technology
user testing and full-surface coverage are the gaps to close before that report is published.
Two open High accessibility items (LL-104bfa61dc, LL-a9d6d5a46b) block confident enablement of
the Article 50 disclosure modal for AAC users.

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
| Reviewed by | _adversary review pending_ |
| Attested by | _Scot Wahlquist, CEO (pending signature on 2026-08-09 successor)_ |
| Predecessor attestation dates | 2026-06-19; re-attested 2026-07-16; re-attested 2026-07-23 |
| Attestation date (this draft) | _pending_ |

_Phase 3 deliverable of the Audit/Compliance System Modernization (plan section 6). Counts
re-derived from `audit-reports/FINDINGS.json` as committed at HEAD `20aab90d3` on 2026-08-09
(the auditedSha stamp records the last full audit run, not the last register edit). The one-way
Notion publish of this report is a separate, human-initiated step into the Master Inbox. The
branded Drive mirror is an operator refresh tracked in COMPLIANCE-PUBLICATION-STATUS._
