# LingoLinq AAC Compliance Posture Report

> **ATTESTED 2026-06-19 by Scot Wahlquist, CEO. RE-ATTESTED 2026-07-16, and again 2026-07-23**
> after a counts refresh to the register as committed at HEAD. This is a Phase 3 report generated from the findings register. The
> headline counts are read directly from `audit-reports/FINDINGS.json`; every other report in
> `audit-reports/` is a point-in-time snapshot and is not authoritative for status. Drafted by the
> compliance-officer; adversary-reviewed; attested by the CEO.
>
> Register audited SHA: `20953ab3` (auditedDate 2026-07-08, ref `scot/compliance/audit-refresh-2026-07-07`).
> That stamp records the last full audit RUN. The register has been amended by remediation and
> disclosure PRs since, so the counts below are re-derived from `audit-reports/FINDINGS.json` **as
> committed at HEAD**, not from a re-run audit, using the publisher convention (`open` +
> `remediated-unverified` findings by severity, per `scripts/compliance-notion-publish.rb`). Do not
> hand-edit the figures; refresh them from the register.

### Changes since the prior draft (2026-06-13)

- **Eval-narration AI surface brought under governance** (#411, #412, #413). The comprehensive
  assessment narrator now scrubs student PII before egress, logs every call to `AiApiLog`, hard
  blocks under-13 eval data via COPPA gating, and binds the egress payload to the server-resolved
  user. Three findings on this path were verified-closed; one residual stays open (below).
- **Redis TLS capability shipped** (#410). The application can now speak `rediss://` TLS to a
  managed Redis. After the 2026-07-22 Gate 1 cutover, closure of LL-6619cc1811 is no longer blocked
  on DNS cutover; it is blocked on the in-context Cloud Run `rediss://` PONG evidence and Scot's
  attestation.
- **Open High count moved 13 -> 16 -> 4.** A second full audit run plus the accessibility finder
  raised the count to 16 (wider scan coverage, not new regressions); those 16 were dispositioned
  in #419 (14 fixed-intent / 2 accepted), and the fixed-intent set has since been remediated and
  verified-closed, leaving **4 open High** at the 2026-06-19 register (SHA `445336592`).
- **GCP infrastructure agreements recorded (2026-07-12/14).** The GCP CDPA + HIPAA BAA (accepted
  2026-07-12) and SCCs (certified 2026-07-14) for project `lingolinq-prod` are recorded in the
  framework table and migration section, and in `SUBPROCESSORS.md` / `COMPLIANCE.md` /
  `docs/legal/GCP_BAA_ACCEPTED.md`. Confirmed 2026-07-16 that `lingolinq-prod` holds no real users
  or tenant personal data yet, so GCP correctly remained a planned (not active) subprocessor at that
  point in time.
- **Gate 1 DNS cutover completed (2026-07-22).** `app.lingolinq.com` now serves from GCP Cloud Run
  with Cloud SQL and Memorystore. Render remains online as a write-frozen rollback fallback pending
  explicit decommission. This report's headline counts remain register-derived; no finding is
  marked closed here.
- **Counts refreshed and re-attested 2026-07-23.** The 2026-07-16 figures had drifted: findings
  opened by the localization/speech egress trace (LL-c38e7da48e, LL-1eb9a2435b), the Article 50
  Phase 5 accessibility pass (LL-a9d6d5a46b), and the TTS endpoint work (LL-a167848115) post-date
  them. Re-derived at HEAD, the publisher convention gives **0 Critical / 8 High / 27 Medium /
  25 Low** (60 open), against 7 / 24 / 23 (54) at the prior re-attestation. Open Critical remains
  **0**, the gating metric. The framework table below is refreshed to match. The WCAG row gains its
  first open High (LL-a9d6d5a46b, a low-contrast token on the Article 50 disclosure link), which is
  a pre-enable blocker for that feature rather than a live-surface regression.
- **Counts refreshed and re-attested 2026-07-16.** The register was restamped to auditedSha
  `20953ab3` (auditedDate 2026-07-08) after the 2026-07-07 audit refresh, which the 2026-06-19
  figures predated. Recomputing per the publisher convention (open + remediated-unverified by
  severity) gives **0 Critical / 7 High / 24 Medium / 23 Low**, with 49 verified-closed. The
  headline and framework table below are refreshed to that register state. Open Critical remains 0
  (the gating metric). The rise in open High (4 -> 7) and across several framework rows reflects
  the wider 2026-07-07 audit refresh now incorporated; see `audit-reports/FINDINGS.json` for the
  per-finding detail.

## Headline

| Metric | Count |
|---|---|
| **Open Critical findings** | **0** |
| **Open High findings** | **8** |
| Open Medium / Low | 27 / 25 |
| Verified closed (Scot attested) | 49 |
| Accepted risk | 3 |
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
| FERPA (US schools) | 15 | 2 | Student data isolation, access scoping, audit trail. |
| HIPAA (US hospitals) | 8 | 2 | PHI handling, minimum necessary, BAA coverage. AWS BAA on file (2026-02); GCP HIPAA BAA accepted (project `lingolinq-prod` 2026-07-12; org-wide 2026-06-08). |
| GDPR (EU clients) | 12 | 2 | Data residency, subprocessor posture, deletion and export paths. GCP SCCs certified (2026-07-14, project `lingolinq-prod`). |
| COPPA (under-13 users) | 6 | 2 | Amended Rule enforceable since 2026-04-22. Open High items include the eval-narration consent-binding residual (LL-11db0dc848). Product controls below. |
| WCAG (accessibility) | 10 | 1 | Tracked as a standing domain because it is product-existential for an AAC tool. See Accessibility below. |
| SOC 2 (in progress) | 23 | 3 | Control-evidence and audit-system hardening items. |

A single finding can map to more than one framework, so these rows do not sum to the 60 open total
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
  and external model calls are recorded with audit trails.
- **Eval-narration AI gating** (`lib/eval_narrator.rb`, `app/controllers/api/eval_sessions_controller.rb`):
  the comprehensive assessment narrator is held to the same controls as the rest of the AI
  surface. Student PII is scrubbed before egress, every call is recorded in `AiApiLog`, a COPPA
  hard block prevents under-13 eval data from reaching the model, external narration is opt-in,
  and the egress payload is bound to the server-resolved user (the client-asserted student name
  is dropped). One residual on this path stays open and tracked (consent binding to the gate
  subject, LL-11db0dc848).

## Infrastructure migration state

LingoLinq completed the Gate 1 DNS cutover on 2026-07-22. Production compute for
`app.lingolinq.com` now runs on Google Cloud Run, with Cloud SQL PostgreSQL and Memorystore Redis
inside the GCP infrastructure boundary. Object storage and email stay on AWS. Render remains online
as a write-frozen rollback fallback until explicit decommission.

- **Managed Redis over TLS.** The application can now negotiate `rediss://` TLS to a managed
  Redis instance (#410), which is the prerequisite for moving Redis to GCP Memorystore with AUTH
  and TLS. Closure of LL-6619cc1811 still requires the in-context Cloud Run `rediss://` PONG and
  Scot's attestation; the DNS cutover alone does not close the register entry.
- **GCP Business Associate Agreement.** The Google Cloud HIPAA BAA was first accepted in-console
  org-wide (certified 2026-06-08; acceptance evidence captured 2026-06-19). On 2026-07-12 the
  Cloud Data Processing Addendum (CDPA) and the HIPAA BAA were reviewed and accepted for project
  `lingolinq-prod` specifically, and the Standard Contractual Clauses (EU GDPR, UK GDPR, Swiss
  FDPA) were certified 2026-07-14 for EU/UK/Swiss-transfer coverage. (This 2026-07-14 project-level
  SCC certification supersedes this report's earlier reference to SCCs certified 2026-06-08, which
  reflected the org-wide acceptance; if reconciling against the branded Drive mirror, confirm the
  2026-06-08 SCC entry.) Under the HIPAA BAA, PHI is permitted on Google Cloud subject to BAA
  terms, which are necessary but not sufficient (HIPAA-eligible services, encryption in transit and
  at rest, access controls, minimum necessary; private VPC additionally). Recorded in-repo at
  `docs/legal/GCP_BAA_ACCEPTED.md`; evidence in Drive "Compliance Audits" / "Google Cloud Platform
  - Accepted Compliance Agreements (captured 2026-07-14)". This is an infrastructure BAA (Cloud
  Run, Cloud SQL, Memorystore) covering only products on Google's HIPAA Covered Products list; it
  does not extend to Vertex AI as a whole or to the Anthropic model-provider egress path. Any future
  Vertex AI or Gemini inference path requires per-product covered-service verification before PHI or
  child data. Google Cloud infrastructure is now listed as an active subprocessor in
  `docs/legal/SUBPROCESSORS.md`; Google Gemini remains disabled as an AI runtime path.

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
| Reviewed by | adversary agent |
| Attested by | **Scot Wahlquist, CEO** |
| Attestation date | **2026-06-19; re-attested 2026-07-16; re-attested 2026-07-23** |

_Phase 3 deliverable of the Audit/Compliance System Modernization (plan section 6). Counts
re-derived from `audit-reports/FINDINGS.json` as committed at HEAD prior to the 2026-07-23
re-attestation (the auditedSha stamp records the last full audit run, not the last register edit). The one-way Notion publish of this report is a separate, human-initiated step into
the Master Inbox._
