# LingoLinq Compliance & Security Program

> **ATTESTED, internal use only.** This document supersedes the external "Master Compliance &
> Security Program v1.1" (Dominic, 2026-06-15). It is an honest, evidence-backed statement of the
> program as it actually exists, plus a clearly-labeled roadmap of what is not yet built. It is
> not a certification, a legal opinion, or a guarantee of compliance. It remains internal and is
> not authorized for external sharing, in full or in summary, until the CEO explicitly releases a
> version for that purpose (see Section 15, point 6). Every "implemented" claim cites a file, pull
> request, or finding ID that can be verified against live code. Aspirational controls are confined
> to Section 12 and are marked "not yet built" so nothing here reads as a promise we cannot keep.
>
> **Version:** 1.0 (attested) · **Date:** 2026-06-18 · **Attested by:** Scot Wahlquist, CEO
> (2026-06-18) · **Supersedes:** Master Compliance & Security Program v1.0/v1.1 · **Source of
> truth for status:** `audit-reports/FINDINGS.json`

---

## 1. Purpose and how to read this

LingoLinq is an AI-first AAC (Augmentative and Alternative Communication) application serving US
school districts, US hospitals and clinics, European clients, and families directly. Those
channels trigger different legal regimes, so a single flat policy is the wrong shape.

This document is a **front door**, not a monolith. A compliance program that lives in one long
Word file goes stale the day it is signed and cannot be verified. Ours is deliberately the
opposite: a short overview that points to (a) living, individually-owned policy documents, (b) a
code-anchored evidence register that is checked mechanically against live code, and (c) a
forward-looking calendar. Where this overview makes a claim, it cites the artifact that proves
it. The index of those artifacts is Section 13.

This replaces v1.1 because v1.1 described a system that does not exist (end-to-end encryption with
no keys, FIPS hardware security modules, a generic sanitization gateway, NPI verification, a
biometric vault) as though it were live, and bundled in multi-state obligations and audit
machinery we cannot yet staff. Those items are not deleted; the real ones are tracked in the
roadmap (Section 12) where they belong, separated from what is actually running.

---

## 2. Regulatory frame: three segments

Compliance obligations vary by who holds the relationship with the user. The same product runs in
three arrangements:

| Segment | Primary regime | Consent authority | Notes |
|---|---|---|---|
| Direct-to-consumer (family) | COPPA (under-13), state minor-privacy | Parent or guardian (verifiable parental consent) | The channel where parental consent mechanics matter. |
| School / district | FERPA | The district, as the parent's agent for educational use | LingoLinq acts as a "school official" under district control; the district authorizes collection for educational use. |
| Private clinical (SLP / clinic) | HIPAA | The provider, under a signed BAA | PHI only attaches in this segment; no PHI is generated until a BAA is executed. |

This frame, inherited and corrected from v1.1, is sound. The one wording change: institutional
("school official") consent should be described as **institutional consent / school
authorization**, never as a "bypass" of parental consent, which is language a regulator or
district counsel would seize on.

---

## 3. How we run compliance (the differentiator)

The program is operated as a continuous, code-anchored findings register rather than periodic
point-in-time reports. The practices behind every number in Section 4:

1. **One register, one source of truth** (`audit-reports/FINDINGS.json`). Each finding carries a
   stable ID, severity, framework tags, evidence anchored to a file and line at a specific commit,
   and a status lifecycle (open, remediated-unverified, verified-closed, accepted-risk,
   superseded).
2. **Read-only auditors.** Specialist finder agents scan the code and can only report; they cannot
   edit code, change infrastructure, or close their own findings (`.claude/agents/*-auditor.md`,
   enforced by `.claude/hooks/audit-readonly-guard.sh`). An independent adversary pass tries to
   refute each new finding before it is treated as real.
3. **Mechanical evidence validation.** `scripts/citation-check.rb` proves each finding's cited
   snippet still exists at its commit. `scripts/audit-merge.rb` only ever adds findings as "open";
   it never closes, downgrades, or triages.
4. **Human attestation.** Only the accountable owner (Scot) closes a finding, downgrades severity,
   or accepts risk. An AI may draft and flag; it may not decide. Attestation records who signed
   and when.
5. **Evidence is code, never user data.** No student or patient data appears in any audit artifact;
   evidence snippets are source code only.
6. **Recurrence is a diff.** Finding IDs are deterministic, so a previously closed finding that
   reappears is flagged as a regression, not silently reopened.

This is the substance that a v1.1-style narrative document cannot provide: claims that are
mechanically verifiable against the running system.

---

## 4. Posture by framework

The gating metric is the count of **open Critical findings**, not a synthetic readiness score. The
current authoritative counts are read directly from the register and summarized in
`docs/legal/COMPLIANCE_POSTURE_REPORT.md` (regenerated per audit run; do not hand-edit).

- **Open Critical findings: 0** (the gate). Open High findings are tracked to closure under
  advisory remediation service levels (High: 15 to 30 days). See the register / posture report for
  the live High, Medium, and Low counts at the current audited commit.
- Distribution spans FERPA (student data isolation, access scoping, audit trail), HIPAA (PHI
  handling, minimum necessary, BAA coverage), GDPR (residency, subprocessor posture, deletion and
  export), SOC 2 (control-evidence and audit-system hardening, in progress), and COPPA (controls
  in Sections 5 and 6).

---

## 5. Active product controls (implemented, evidence in code)

These are implemented and operating, not aspirational. Each cites its evidence.

| Control | What it does | Evidence |
|---|---|---|
| PiiScrubber backstop | Redacts identifiers before any external model call; independent of any vendor retention toggle | `lib/pii_scrubber.rb` (`redact_for_ai`) |
| Feature-flag gating + COPPA AI hard block | AI features individually gated; under-13 users awaiting consent are blocked from AI egress | `lib/feature_flags.rb` (`coppa_blocks_ai_for?`); `lib/eval_narrator.rb` (`ai_allowed_for?`) |
| Eval-narration hardening | COPPA gate + PiiScrubber + AiApiLog on the eval AI path; student name redacted before egress (PiiScrubber blocklist) | PRs #411, #412, #413. The eval-content-to-consented-user binding is **not yet complete** and is tracked as open High finding LL-11db0dc848 (see residuals below). |
| Child-event scrubbing | Drops error events tied to child users before they reach the error tracker | `config/initializers/sentry.rb` (CoppaSentryScrub) |
| AI call logging | Every external model call recorded with PII-detection results for audit | `app/models/ai_api_log.rb` |
| Console / privileged-access auditing | Privileged actions recorded with audit trails | `AuditEvent` model |
| Parental consent flow | Child registration gated; parent confirms via secure tokenized link; consent recorded with timestamp; 14-day expiry | `app/controllers/parental_consents_controller.rb`; `app/models/user.rb` (`grant_parental_consent!`) |
| Encryption of sensitive fields | Server-side encryption layer for sensitive data | `secure_serialize` concern |
| Rate limiting | Edge throttling on protected paths (consent-endpoint coverage tracked, see open finding) | `config/initializers/throttling.rb` (Rack::Attack); finding LL-ca38d4d99e |
| Retention enforcement | Scheduled deletion per the retention schedule | `lib/data_policy_enforcer.rb`, `lib/flusher.rb` |

**Known residuals (tracked, not hidden):** the eval consent-binding residual (LL-11db0dc848) and
free-text named-entity coverage in PiiScrubber (residual of LL-e573a39d2b) are open in the
register. The AiApiLog IP-address scrub is implemented and scheduled (`AiApiLog.redact_old_ip_addresses!`,
wired into the daily `scheduler:dispatch` block in `lib/tasks/scheduler.rake` by PR #222), so there is
no open IP-redaction gap to file; the stale "see open gap" note in `docs/legal/DATA_RETENTION.md` has been
corrected to reflect that the task is scheduled. The daily `scheduler:dispatch` cron is confirmed live in
Render production as the standalone `lingolinq-prod-scheduler` cron job (hourly, with a 6 AM UTC daily gate
for the retention/redaction block); it is defined outside the `render.yaml` blueprint, which is why the
blueprint alone does not show it. None are undiscovered risks.

---

## 6. Consent model

### 6.1 Parental consent (under-13, direct-to-consumer)

The compliant, low-friction method is **"email plus"** (16 CFR 312.5(b)(2)(viii)), available
because child data is used for internal operations and is not "disclosed" to third parties. We
treat routing data to AWS or GCP under a data processing agreement as internal-operations support
rather than "disclosure" under 16 CFR 312.2, subject to legal confirmation; that carve-out depends
on the provider not using the data for any other purpose, and it is a stronger fit for
storage/hosting than for external model vendors (for AI calls, the PiiScrubber-redacts-first
posture, not the carve-out, is the primary defense). The current flow (child registers, account
waits, parent confirms via a single tokenized link, consent recorded) is the **first message
only** and does **not yet satisfy email-plus**: the method is valid under COPPA only once the
confirmatory second message and an explicit revoke-anytime notice ship. Single-token confirmation
is the interim state.

**No credit card is collected at registration.** A $0 authorization or non-charging "card check"
does not satisfy the FTC credit-card method (which requires a real transaction that notifies the
cardholder), so it would add friction for the families this product serves while providing no
legal benefit. High-assurance methods (a real charge, government ID, knowledge-based auth) are
reserved for the narrow case in Section 6.2 Tier 2 and are not the default.

### 6.2 Data-use opt-in tiers (default off)

Whether using an LLM "shares personal information" depends on what is sent and the contract, not
on the API call itself. Three uses, three answers:

1. **Live prediction for everyone (default, on).** Scrubbed, context-free, no retention, under
   contract. We treat this as internal-operations support rather than a third-party disclosure
   (subject to legal confirmation); PiiScrubber redacting identifiers before egress is the primary
   control, and base-service consent covers it.
2. **Personalize the child's own prediction (Tier 1, opt-in, off by default).** Retains the
   child's own words tied to their account, so it is personal data used for internal operations.
   Legal with a separate, unbundled parental opt-in; **no credit card** (the already-verified
   parent ticks an additional box).
3. **Donate de-identified data for study (Tier 2, opt-in, highest).** The only third-party
   disclosure (university + OpenAAC research into AAC drop-off). Email-plus is unavailable here,
   but a credit card is still not required. Two card-free paths: (a) de-identified, aggregate data
   under a data use agreement (the right path for dropout statistics, which need counts not named
   children); or (b) if identifiable per-child data is ever genuinely required, a signed
   consent-form upload, or in the school channel the FERPA studies exception
   (34 CFR 99.31(a)(6)) under a written agreement plus university IRB review.

**Design rule:** the consent tiers must map to a real data-isolation boundary in code. Tier 1 data
trains only that child's own model and never leaves their account; only Tier 2 data flows into any
shared or global research set. That boundary, which mirrors the existing supervisor/org isolation,
makes the consent model auditable rather than merely promised.

**Guardrails:** each opt-in is separate and truly optional (refusing the research tier never
reduces service); revocation stops use and deletes contributed data; HIPAA de-identification is
stricter than COPPA (Safe Harbor 18-identifier removal per 45 CFR 164.514, or expert
determination, and research use of PHI needs authorization or an IRB waiver). The Tier 1/2 model
is **planned**, not yet built; it appears here so the consent architecture is on record.

---

## 7. Data lifecycle: retention, deletion, subprocessors

- **Retention schedule.** Per-data-type windows, legal basis, and the actual deletion mechanism
  are documented in `docs/legal/DATA_RETENTION.md` (GDPR Article 5(1)(e), HIPAA 45 CFR
  164.316(b)(2), FERPA and state student-data laws, COPPA 16 CFR 312.10). Deletion is executed by
  `lib/flusher.rb` and `lib/data_policy_enforcer.rb`. The written retention policy now required by
  the 2025 COPPA Rule is satisfied by this document being embedded in (not merely linked from) the
  privacy notice; embedding is an open task.
- **Subprocessors.** The Article 28 / 45 CFR 164.502(e) register is `docs/legal/SUBPROCESSORS.md`,
  with a 30-day customer change-notice commitment. AWS BAA signed 2026-02-07. AI vendors (OpenAI,
  Anthropic, Google) receive only de-identified prompts via `lib/pii_scrubber.rb` and are
  classified as not receiving identifiable data. Render BAA is pending; no new hospital tenants
  requiring a hosting-provider BAA are onboarded until it executes.
- **AI egress.** No identifiable student or patient data is sent to external models. Zero data
  retention, where a vendor offers it, is treated as a privacy control and explicitly not a
  substitute for a BAA (`docs/legal/AI_GOVERNANCE_MEMO.md` Section 4).

---

## 8. Incident response and breach notification

The incident-response and breach-notification playbook, including the jurisdictional notification
clock and roles, is `docs/legal/BREACH_RUNBOOK.md`; the append-only incident record is
`docs/legal/INCIDENT_LOG.md` (7-year minimum retention). These satisfy HIPAA breach rules and
state breach statutes and are kept current as living documents.

---

## 9. Accessibility

Accessibility is a standing compliance domain because it is product-existential for an AAC tool. A
WCAG 2.1 AA / EN 301 549 Accessibility Conformance Report is in draft
(`docs/legal/ACCESSIBILITY_CONFORMANCE_REPORT.md`); current internal status is Partially Supports
on modernized surfaces, with remediation patterns identified. Assistive-technology user testing
and full-surface coverage are the gaps to close before that report is published. WCAG findings are
produced by a dedicated read-only accessibility finder in the audit run.

---

## 10. AI governance

Model usage, the no-identifiable-data-to-external-models policy, the position that zero data
retention is a privacy control and not a BAA substitute, and the EU AI Act classification analysis
are documented in `docs/legal/AI_GOVERNANCE_MEMO.md`. The compliance calendar
(`audit-reports/compliance-calendar.json`) tracks the forward horizon, including the EU AI Act
milestone (2026-08-02), California AB 2013 (AI training-data transparency), the FIPS 140-2 sunset,
and event-driven ZDR re-verification after key rotation.

---

## 11. Infrastructure and the cloud migration

Production currently runs on Render (web, worker, scheduler, managed PostgreSQL and Redis). A
deliberate migration to Google Cloud Run is in progress: Phase 1 foundation is complete, and the
Phase 3 data layer (Cloud SQL, Memorystore, VPC) is provisioned but inert pending cutover, with
TLS configured on the Memorystore endpoint. Production Redis TLS in the running application
remains an **open pre-cutover item** (finding LL-6619cc1811); the inert endpoint's TLS is not the
same as the live app encrypting Redis in transit today. BAAs are being put in place along the
migration (AWS signed; GCP and Render in progress). The migration is also the natural home for any future
self-hosted model (Section 12).

---

## 12. Roadmap: not yet built

Everything in this section is **aspirational and not currently implemented.** It is recorded so the
program has a target state, and explicitly separated from Sections 5 to 11 so nothing above reads
as a false promise. Several of these came from v1.1, where they were incorrectly described as live.

| Item | Status | Notes |
|---|---|---|
| End-to-end encryption with client-held keys | Not built | Current state is server-side encryption (`secure_serialize`); the server holds keys. Do not claim E2EE until built. |
| FIPS 140-2/3 validated HSM-backed KMS, key inventory, rotation | Not built | Aspirational enterprise control; tie to the GCP migration if pursued. |
| Tier 1 / Tier 2 data-use opt-in (personalization + research) | Planned | Consent architecture in Section 6.2; requires the per-user vs global isolation boundary. |
| Self-hosted LLM inside the GCP BAA boundary | Under consideration | Inference-first (privacy win, low new burden), training-on-opt-in-data later (adds EU AI Act / AB 2013 / memorization duties). Direction logged in the decision log. |
| Clinical-segment provider verification (NPI / NPPES, license check) | Not built | For the HIPAA/SLP onboarding path. |
| Biometric (voiceprint / gaze) consent and handling | Audited, not fully built | COPPA audit items 2; scope carefully before building a dedicated consent vault. |
| Multi-state minor/biometric/health law coverage (CCPA-minor, TX CUBI, WA MHMDA, IL BIPA) | Deferred | Apply as the customer footprint reaches those states; not pre-MVP. |
| Formal SOC 2 program (risk assessments, training cadence, KPIs, internal audit schedule) | In progress / deferred | Enterprise maturity; staged as the team grows. |
| Render BAA execution | Pending | Blocks new hospital tenants that require a hosting-provider BAA. |

---

## 13. Document and evidence index

The artifacts this overview points to. These are the living program; this document is the index
over them.

| Artifact | Purpose |
|---|---|
| `audit-reports/FINDINGS.json` | Code-anchored findings register; single source of truth for status |
| `docs/legal/COMPLIANCE_POSTURE_REPORT.md` | Generated posture summary (counts by framework) |
| `docs/legal/SUBPROCESSORS.md` | Article 28 subprocessor register; AWS BAA on file |
| `docs/legal/DATA_RETENTION.md` | Retention schedule, legal basis, deletion mechanism per data type |
| `docs/legal/BREACH_RUNBOOK.md` | Incident response and breach notification playbook |
| `docs/legal/INCIDENT_LOG.md` | Append-only incident record |
| `docs/legal/COPPA_VERIFICATION_2026-04-26.md` | COPPA Final-Rule code verification (the five requirements) |
| `docs/legal/AI_GOVERNANCE_MEMO.md` | AI usage policy, ZDR-is-not-a-BAA, EU AI Act analysis |
| `docs/legal/ACCESSIBILITY_CONFORMANCE_REPORT.md` | WCAG 2.1 AA / EN 301 549 conformance (draft) |
| `docs/legal/PARENTAL_CONSENT_EMAIL.md` | Parental consent email content |
| `audit-reports/compliance-calendar.json` | Forward regulatory calendar |

---

## 14. What this document is and is not

- It **is** an honest internal program statement, generated from live evidence, suitable as the
  basis for customer-facing responses once attested.
- It is **not** a certification, a legal opinion, or a guarantee of compliance.
- Aspirational controls are confined to Section 12 and marked "not yet built." No control in
  Sections 5 to 11 is asserted unless it is evidenced in code or a signed agreement.
- The disclosure altitude for any externally shared version (full, or summarized) is Scot's
  decision at attestation time. The 16 CFR 312.2 internal-operations carve-out for cloud and model
  vendors, the FERPA studies-exception conditions, and the HIPAA de-identification standard should
  be confirmed with counsel before the relevant claims go external.

---

## 15. Attestation

**Attestation statement.** As CEO and the accountable owner of LingoLinq's compliance program, I
attest that, to the best of my knowledge as of the dates recorded below:

1. This document is an honest, evidence-based description of the compliance and security program as
   it actually exists, not as we aspire for it to be.
2. Every control described in Sections 5 through 11 as "implemented" is backed by code,
   configuration, or a signed agreement that my team can produce on request, and the file, PR, or
   finding ID cited for each is accurate.
3. Aspirational and not-yet-built controls are confined to Section 12 and are not represented
   anywhere above as live.
4. The open residuals are known, tracked in the register, and accepted as the current state rather
   than hidden: the eval consent-binding residual (LL-11db0dc848), free-text named-entity coverage in
   PiiScrubber (LL-e573a39d2b), and production Redis TLS pending the GCP cutover (LL-6619cc1811).
5. The items flagged for counsel in Section 14 (the 16 CFR 312.2 internal-operations carve-out, the
   FERPA studies-exception conditions, and the HIPAA de-identification standard) have not yet been
   confirmed with counsel, and the related claims are not to go external until they are.
6. This document is internal. It is not authorized for external sharing, in full or in summary,
   until I explicitly release a version for that purpose.

This attestation reflects the register's audited commit and the live infrastructure state verified on
the attestation date. It is not a certification, a legal opinion, or a guarantee of compliance.

| Field | Value |
|---|---|
| Prepared by | Compliance review (Claude, acting as compliance officer), draft |
| Reviewed by | Adversary review 2026-06-18: v0.1 findings (1 Critical + 2 High + 2 Medium + 1 nit) all addressed in v0.2; re-verification confirmed each fixed against the live register and code (verdict: attestable) |
| Register audited commit | `d72463c7558f1f00543763f3ab866fcecf4606d1` (2026-06-17) |
| Posture at that commit | 0 open Critical; see `audit-reports/FINDINGS.json` / `docs/legal/COMPLIANCE_POSTURE_REPORT.md` for live High / Medium / Low |
| Infrastructure state verified | 2026-06-18 (Render `lingolinq-prod-scheduler` cron live; retention and AiApiLog IP-redaction enforcement confirmed running) |
| Attested by | Scot Wahlquist, CEO |
| Attestation date | 2026-06-18 |

_Once attested, the canonical home for this document is the repository at
`docs/legal/COMPLIANCE_PROGRAM.md`, alongside the evidence it indexes. Moving it there is a
separate, deliberate commit on a branch off `staging`._
