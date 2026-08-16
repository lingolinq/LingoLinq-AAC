# LingoLinq Compliance & Security Program

> **DRAFT v1.3 - awaiting attestation (2026-08-09).** Successor to attested
> `docs/legal/COMPLIANCE_PROGRAM.md` (v1.2). Internal use only until the CEO attests this file.
> This document supersedes the external "Master Compliance & Security Program v1.1"
> (Dominic, 2026-06-15). It is an honest, evidence-backed statement of the program as it actually
> exists, plus a clearly-labeled roadmap of what is not yet built. It is not a certification, a
> legal opinion, or a guarantee of compliance. It remains internal and is not authorized for
> external sharing, in full or in summary, until the CEO explicitly releases a version for that
> purpose (see Section 15, point 6). Every "implemented" claim cites a file, pull request, or
> finding ID that can be verified against live code. Aspirational controls are confined to
> Section 12 and are marked "not yet built" so nothing here reads as a promise we cannot keep.
>
> **Version:** 1.3 (DRAFT) · **Date:** 2026-06-18 (v1.0); 2026-07-22 (v1.1); 2026-08-04
> (v1.2); 2026-08-09 (v1.3 draft) · **Attested by:** Scot Wahlquist, CEO (2026-06-18;
> 2026-07-22; 2026-08-04 on predecessor); v1.3 pending · **Supersedes:** attested
> `COMPLIANCE_PROGRAM.md` v1.2 (DOC-b61994933c) · **Source of truth for status:**
> `audit-reports/FINDINGS.json`
>
> **v1.3 scope (2026-08-09 draft).** Aligns Section 5 residuals and Section 12 roadmap with the
> live register at HEAD `20aab90d3` (0 Critical / 12 High / 30 Medium / 25 Low, publisher
> convention). Records that LL-6619cc1811 and LL-11db0dc848 are verified-closed; updates
> infrastructure wording accordingly; adds Article 50(1) enablement, ACR publish, and
> remediated-unverified verification to the not-yet-complete roadmap. Does not close any finding.

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

- **Open Critical findings: 0** (the gate). As of the 2026-08-09 draft refresh, live High /
  Medium / Low counts (publisher convention at HEAD) are **12 / 30 / 25**. See the register and
  `docs/legal/2026-08-09_compliance-posture-report_draft.md` (DRAFT pending re-attest) for the
  authoritative derivation; do not hand-edit counts here.
- Distribution spans FERPA (student data isolation, access scoping, audit trail), HIPAA (PHI
  handling, minimum necessary, BAA coverage), GDPR (residency, subprocessor posture, deletion and
  export), SOC 2 (control-evidence and audit-system hardening, in progress), WCAG (standing AAC
  domain), and COPPA (controls in Sections 5 and 6).

---

## 5. Active product controls (implemented, evidence in code)

These are implemented and operating, not aspirational. Each cites its evidence.

| Control | What it does | Evidence |
|---|---|---|
| PiiScrubber backstop | Redacts identifiers before any external model call; independent of any vendor retention toggle | `lib/pii_scrubber.rb` (`redact_for_ai`) |
| Feature-flag gating + COPPA AI hard block | AI features individually gated; under-13 users awaiting consent are blocked from AI egress | `lib/feature_flags.rb` (`coppa_blocks_ai_for?`); `lib/eval_narrator.rb` (`ai_allowed_for?`) |
| Eval-narration hardening | COPPA gate + PiiScrubber + AiApiLog on the eval AI path; student name redacted before egress (PiiScrubber blocklist); egress bound to server-resolved user | PRs #411, #412, #413. Consent-binding High LL-11db0dc848 is **verified-closed** (2026-06-23). |
| Child-event scrubbing | Drops error events tied to child users before they reach the error tracker | `config/initializers/sentry.rb` (CoppaSentryScrub) |
| AI call logging | Every external model call recorded with PII-detection results for audit | `app/models/ai_api_log.rb` |
| Console / privileged-access auditing | Privileged actions recorded with audit trails | `AuditEvent` model; per-session console AuditEvent residual tracked as open High LL-7f7372e3eb |
| Parental consent flow | Child registration gated; parent confirms via secure tokenized link; consent recorded with timestamp; 14-day expiry | `app/controllers/parental_consents_controller.rb`; `app/models/user.rb` (`grant_parental_consent!`) |
| Encryption of sensitive fields | Server-side encryption layer for sensitive data | `secure_serialize` concern |
| Rate limiting | Edge throttling on protected paths including consent endpoints | `config/initializers/throttling.rb` (Rack::Attack); LL-ca38d4d99e verified-closed |
| Retention enforcement | Scheduled deletion per the retention schedule | `lib/data_policy_enforcer.rb`, `lib/flusher.rb` |
| Article 50(2) marking | Server-signed provenance markers on in-scope generative paths | `lib/art50_marker.rb` (board generation and word prediction). Article 50(1) disclosure UI is built but flag-gated off (see Section 12). |

**Known residuals (tracked, not hidden):** live open Highs that touch product controls include
word-prediction pre-scrubber cache (LL-16ef84ad9a), masquerade without AuditEvent (LL-522c1a6d13),
district seat-reclaim consent (LL-f150e0e828), hard-delete media gaps (LL-854b1d3853), terms-agree
modal a11y/order (LL-104bfa61dc, LL-53cb93fab1), Article 50 disclosure contrast (LL-a9d6d5a46b),
Bedrock account-binding check (LL-1b0d78dbe6), and audited-console session AuditEvent
(LL-7f7372e3eb). Free-text named-entity coverage in PiiScrubber remains a residual of closed
LL-e573a39d2b. LL-11db0dc848 and LL-6619cc1811 are verified-closed and are not open residuals.
The AiApiLog IP-address scrub is implemented and scheduled (`AiApiLog.redact_old_ip_addresses!`,
wired into the daily `scheduler:dispatch` block in `lib/tasks/scheduler.rake` by PR #222).
None of the above are undiscovered risks; all are register-tracked.

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
waits, parent confirms via a single tokenized link, consent recorded, parent receives a
confirmatory email with an explicit revoke-anytime link) satisfies **email-plus** for signup
consent, pending counsel review of the default copy.

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
  with a 30-day customer change-notice commitment. AWS BAA signed 2026-02-07. Anthropic is the
  designated AI vendor for pseudonymized (scrubbed) prompts via `lib/pii_scrubber.rb`, **not
  operational as of 2026-08-04**, having been operational only from 2026-08-03T08:23Z to
  2026-08-04T06:31Z for a single internal verification call carrying no user or student data (see
  the 2026-08-04 operational-status correction in `docs/legal/AWS_BAA_ACCEPTED.md`), and when live is
  classified as receiving pseudonymized personal data, not anonymous or de-identified data
  (direct identifiers removed by design, but still personal data under GDPR/UK-GDPR). OpenAI is
  contracted but has no active data flow as of 2026-07-06 (see the register, row 3). Google Gemini
  is retained in the register as a disabled historical row: the runtime path was disabled
  2026-07-09, and no active code path sends data to Gemini as of the 2026-07-12 register
  correction. Render BAA is pending; no new hospital tenants requiring a hosting-provider BAA are
  onboarded until it executes.
- **AI egress.** No directly identifying student or patient data is sent to external models by
  design; scrubbing removes known direct identifiers and is a strong safeguard, not an absolute
  guarantee (see the register's section 5.1). Zero data retention, where a vendor offers it, is
  treated as a privacy control and explicitly not a substitute for a BAA
  (`docs/legal/AI_GOVERNANCE_MEMO.md` Section 4).

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

Production now serves `app.lingolinq.com` from Google Cloud Platform after the 2026-07-22 Gate 1
DNS cutover. The live app runs on Cloud Run, Cloud SQL PostgreSQL, and Memorystore Redis over the
private GCP network, with object storage and email remaining on AWS. The Google Cloud CDPA, HIPAA
BAA, and SCCs for project `lingolinq-prod` are accepted and recorded in
`docs/legal/GCP_BAA_ACCEPTED.md`.

Render is no longer the active production app host for the branded domain, but it remains online as
a write-frozen rollback fallback at `https://lingolinq-prod.onrender.com` until a separate explicit
decommission go. Redis TLS (LL-6619cc1811) is **verified-closed** (2026-07-22) with in-context
Cloud Run `rediss://` evidence and Scot attestation. The Render Postgres public-allowlist finding
(LL-aacae48768, accepted-risk) and audited-console finding (LL-7f7372e3eb, still open for the
per-session AuditEvent residual) should be superseded or closed only when Render is deleted or
restricted and/or the console control is verified, not silently closed at DNS cutover.

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
| Render decommission | Pending | Render is superseded as primary host but remains a write-frozen rollback fallback until explicit teardown. Retires accepted-risk LL-aacae48768 path once fallback is gone. |
| Article 50(1) disclosure enablement | Built, not enabled | `article_50_disclosure` is AVAILABLE-only while `ai_board_generation` is enabled. Obligation date 2026-08-02 has passed. Pre-enable blocker: LL-a9d6d5a46b (and preferably LL-104bfa61dc). Scot decision required: enable for EU users or record a dated non-applicability rationale. |
| ACR / VPAT publish | Draft | `docs/legal/ACCESSIBILITY_CONFORMANCE_REPORT.md` and branded Drive mirror remain `draft` awaiting attestation. |
| Remediated-unverified verification wave | In progress | Five findings (three High) await fresh-context verification before Scot can close: LL-90045bb29c, LL-a95e9c5f7c, LL-705b10bcd7, LL-5954bcbbe6, LL-a167848115. |

---

## 13. Document and evidence index

The artifacts this overview points to. These are the living program; this document is the index
over them.

| Artifact | Purpose |
|---|---|
| `audit-reports/FINDINGS.json` | Code-anchored findings register; single source of truth for status |
| `docs/legal/2026-08-09_compliance-posture-report_draft.md` | Posture summary draft (counts by framework); attested predecessor frozen at `COMPLIANCE_POSTURE_REPORT.md` |
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

**Re-attestation statement.** As CEO and the accountable owner of LingoLinq's compliance program, I
re-affirm points 1 through 6 of the 2026-06-18 attestation: this document is an honest,
evidence-based description of the program; implemented controls in Sections 5 through 11 are backed
by code, configuration, or signed agreements with accurate citations; aspirational controls remain
confined to Section 12; known residuals remain tracked rather than hidden; counsel-dependent claims
remain internal; and no external sharing is authorized until explicitly released. Prior residual
IDs LL-11db0dc848 and LL-6619cc1811 are now verified-closed in the register. Live residuals as of
the 2026-08-09 draft include LL-7f7372e3eb, LL-aacae48768 (accepted-risk), and the High set listed
in Section 5. I additionally attest that, to the best of my knowledge as of 2026-08-04 (v1.2 on
the predecessor); v1.3 draft updates Section 5/12 only and awaits re-attestation:

1. This document is an honest, evidence-based description of the compliance and security program as
   it actually exists after the Gate 1 GCP DNS cutover, not as we aspire for it to be.
2. The infrastructure posture described in Section 11 is accurate: `app.lingolinq.com` serves from
   Google Cloud Platform on Cloud Run behind the Google Cloud load balancer, using Cloud SQL
   PostgreSQL and Memorystore Redis, while Render remains a write-frozen rollback fallback pending
   explicit decommission.
3. The vendor and BAA posture described here is accurate for the live hosting path: AWS remains the
   storage/email provider under the AWS BAA, Google Cloud Platform is the active infrastructure
   host under the accepted GCP CDPA / HIPAA BAA / SCCs, Anthropic is the designated runtime AI
   provider under the executed HIPAA-Ready BAA, and Render remains listed only because fallback data
   and services still exist. **Corrected 2026-08-01, re-corrected 2026-08-04:** this clause
   previously read "Anthropic is the *active* runtime AI provider", and was then over-corrected to
   assert the Bedrock route had never been operational. The accurate statement is a closed window:
   the Bedrock route was operational from 2026-08-03T08:23Z to 2026-08-04T06:31Z (revision
   `00013-76w`), carrying one internal verification call with no user or student data, and is not
   operational as of 2026-08-04 (no credential on any current `lingolinq-web` revision). The direct
   `api.anthropic.com` route is disabled. See the 2026-08-04 operational-status correction in
   `docs/legal/AWS_BAA_ACCEPTED.md`.
4. This re-attestation does not close, downgrade, or supersede any finding by itself. Finding
   status remains governed by `audit-reports/FINDINGS.json`. Redis TLS (LL-6619cc1811) is
   verified-closed. LL-f150e0e828 still needs functional offboarding-consent remediation;
   LL-aacae48768 (accepted-risk) and LL-7f7372e3eb remain Render-tail / console-control items until
   the fallback is deleted or restricted and the console AuditEvent gap is verified closed.
5. The items flagged for counsel in Section 14, customer notice timing for the new active GCP
   infrastructure subprocessor listing, Render decommission, and external release of any summary
   remain separate decisions. This document is internal and is not authorized for external sharing,
   in full or in summary, until I explicitly release a version for that purpose.

This attestation reflects the register's audited commit and the live infrastructure state verified on
the attestation date. It is not a certification, a legal opinion, or a guarantee of compliance.

| Field | Value |
|---|---|
| Prepared by | Compliance review (Claude, acting as compliance officer), draft; 2026-08-09 v1.3 successor draft |
| Reviewed by | Predecessor v1.2 post-cutover sweep; v1.3 adversary review pending |
| Register audited commit | `20953ab3d5a80c3a9cbb249f37a79357b7f1baf1` (auditedDate 2026-07-08); live counts re-derived at HEAD `20aab90d3` for v1.3 draft |
| Posture at HEAD (v1.3 draft) | 0 open Critical / 12 open High / 30 open Medium / 25 open Low (publisher convention), per `audit-reports/FINDINGS.json` |
| Infrastructure state verified | 2026-07-22 Gate 1 DNS cutover: `app.lingolinq.com` live on GCP load balancer IP `136.68.41.122`; Redis PONG captured from Cloud Run execution `lingolinq-migrate-vl5d5` at 2026-07-22T05:00:46Z (`ping=PONG`, `scheme=rediss`, `ca_blocks=1`, `verify_hostname=false`). `ca_blocks=1` is the expected Memorystore instance-CA chain length for this endpoint; `verify_hostname=false` is the documented pinned-CA/private-IP hatch while CA-chain verification remains on. Render retained as write-frozen rollback fallback pending explicit decommission. LL-6619cc1811 verified-closed. |
| Attested by | Scot Wahlquist, CEO (v1.0–v1.2 on predecessor); v1.3 pending |
| Attestation date | 2026-06-18 (v1.0); 2026-07-22 (v1.1); 2026-08-04 (v1.2); 2026-08-09 (v1.3 draft, pending) |

_Once attested, the canonical home for this document is the repository at
`docs/legal/COMPLIANCE_PROGRAM.md`, alongside the evidence it indexes. Moving it there is a
separate, deliberate commit on a branch off `staging`._
