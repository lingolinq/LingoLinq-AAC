# LingoLinq Compliance & Security Program

> **v1.3.1 DRAFT - awaiting attestation. Internal use only until the CEO attests this file.**
> Successor via Path A supersession to attested `docs/legal/2026-08-20_compliance-program.md`
> (v1.3, ATTESTED 2026-08-20 by Scot Wahlquist, CEO), which succeeded the unattested draft
> `docs/legal/2026-08-09_compliance-program_draft.md`, which itself succeeded attested
> `docs/legal/COMPLIANCE_PROGRAM.md` (v1.2). This successor exists ONLY to correct the defects listed below, carried
> by its predecessor. Those include the Article 50(1) enablement claim, which IS a program claim;
> nothing else in the program is changed. Internal use only; not authorized for
> external sharing, in full or in summary, until the CEO explicitly releases a version for that
> purpose (see Section 15, point 6). This document supersedes the external "Master Compliance &
> Security Program v1.1" (Dominic, 2026-06-15). It is an honest, evidence-backed statement of the
> program as it actually exists, plus a clearly-labeled roadmap of what is not yet built. It is not
> a certification, a legal opinion, or a guarantee of compliance. Every "implemented" claim cites a
> file, pull request, or finding ID that can be verified against live code. Aspirational controls
> are confined to Section 12 and are marked "not yet built" so nothing here reads as a promise we
> cannot keep.
>
> **Version:** 1.3.1 (DRAFT - NOT YET ATTESTED) · **Date:** 2026-06-18 (v1.0);
> 2026-07-22 (v1.1); 2026-08-04 (v1.2); 2026-08-20 (v1.3); v1.3.1 drafted 2026-08-22 ·
> **Attested by:** PREDECESSOR VERSIONS ONLY - Scot Wahlquist, CEO (2026-06-18; 2026-07-22;
> 2026-08-04; 2026-08-20 on v1.3). **v1.3.1 carries no attestation.** · **Supersedes:** attested
> `2026-08-20_compliance-program.md` v1.3 (DOC-5a4b795792), which superseded unattested draft
> `2026-08-09_compliance-program_draft.md` (DOC-73a80fc88d), which itself superseded attested
> `COMPLIANCE_PROGRAM.md` v1.2 (DOC-b61994933c) · **Source of truth for status:**
> `audit-reports/FINDINGS.json`
>
> **v1.3 scope (content refreshed 2026-08-20).** Aligns Section 5 residuals and
> Section 12 roadmap with the live register at staging commit `64cdccba1` (0 Critical / 20 High / 52
> Medium / 40 Low, publisher convention -- up from 12/30/25 at the 2026-08-09 draft, almost
> entirely from the 2026-08-12 six-finder full audit run). Records that LL-6619cc1811,
> LL-11db0dc848, and LL-1b0d78dbe6 are verified-closed; that the Article 50(1) server-side
> disclosure backstop now covers all 5 AI ingresses (LL-6723438462 remediated-unverified, #829/#831);
> and that the disclosure-link contrast blocker (LL-a9d6d5a46b) was found already fixed (#694,
> 2026-07-28) and is now remediated-unverified rather than open. Updates infrastructure wording
> accordingly; adds Article 50(1) enablement, ACR publish, and remediated-unverified verification to
> the not-yet-complete roadmap. Does not close any finding.

---

## Corrections in this successor

This successor exists only to correct defects carried by its predecessor. Every count, finding
id and framework figure is otherwise unchanged, and the snapshot boundary is still `64cdccba1` --
these corrections do not move the derivation to a later commit. The one substantive claim that
IS corrected is the Article 50(1) enablement claim; see the row for it below.

| # | Defect in `2026-08-20_compliance-program.md` | Correction |
|---|---|---|
| 1 | "auditedDate 2026-08-12, 46 new findings" (:405) | 40 new findings. Verified against both `firstSeen: 2026-08-12` in the register (40 rows, 9 High / 18 Medium / 13 Low) and `audit-reports/run-log/runs.jsonl` (`"new": 40`). Wrong at every commit. |
| 2 | "(publisher convention at HEAD) are **20 / 52 / 40**" (:111), "Posture at HEAD" (:406), and the v1.3-scope blockquote's "staging HEAD" (:24) | pinned to `` `64cdccba1` `` (the blockquote reworded to "staging commit"), so the live-tense phrasing stops fighting the document's own pinned derivation. Values unchanged. |
| 3 | Article 50(1) enablement claim: "the flag remains AVAILABLE-only, not enabled" (:137, :308) | Restated as the CODE DEFAULT at `64cdccba1`, with the runtime source named, AND flagged as contradicted. The claim stated a RUNTIME fact but rested only on a code listing. `FeatureFlags` resolves the effective list through `SystemFeatureSettings.default_enabled_features` (`lib/system_feature_settings.rb:6-12`), a `Setting` DB row that falls back to the code constant only when unset. Separately, `docs/legal/2026-08-17_ai-data-flow-classification.md:132` -- CEO-attested 2026-08-19 -- records `article_50_disclosure_shown` TRUE on all 63 post-deploy `AiApiLog` rows, a column (`app/models/user.rb:1324-1331` at `64cdccba1`) that is true only after an actual modal acknowledgement. **Production flag state WAS read on 2026-08-23: VERIFIED ENABLED. See `docs/legal/2026-08-23_article-50-production-flag-verification.md`.** |
| 4 | Section 15 metadata table headed **`open`** on all four severity counts (:429), and the Section 15 guard sentence claiming no part of the section was re-made | Severity counts relabelled **`live`**, matching the publisher convention (`open` + `remediated-unverified`) they were always derived under -- a label fix, values unchanged. The guard sentence is narrowed to the signed *statement* only, since the metadata table beneath it was never part of what was signed and does carry corrections 1, 2 and 4. |

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
`docs/legal/2026-08-22_compliance-posture-report.md` (this successor's corrected counterpart,
UNATTESTED draft) and its last-attested predecessor
`docs/legal/2026-08-20_compliance-posture-report.md` (ATTESTED 2026-08-20, frozen and superseded;
it carries the 46-findings run-size defect this correction fixes). Read the successor for the
corrected figures and the predecessor for the signed record. Regenerated per audit run; do not
hand-edit.

- **Open Critical findings: 0** (the gate). As of the 2026-08-20 attestation, live High /
  Medium / Low counts (publisher convention at `64cdccba1`) are **20 / 52 / 40**. See the register and
  `docs/legal/2026-08-22_compliance-posture-report.md` (corrected successor, UNATTESTED) for the
  derivation, and `docs/legal/2026-08-20_compliance-posture-report.md` (ATTESTED 2026-08-20,
  superseded) for the signed record; do not hand-edit counts here.
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
| Article 50(2) marking | Server-signed provenance markers on in-scope generative paths | `lib/art50_marker.rb` (board generation and word prediction). Article 50(1) disclosure UI is built and its server-side backstop now covers all 5 AI ingresses (#829/#831, 2026-08-19); the flag is AVAILABLE-only in `lib/feature_flags.rb` at `64cdccba1` -- a code default; the runtime state was verified ENABLED on 2026-08-23; see Section 12 and the runtime caveat there. |

**Known residuals (tracked, not hidden):** live open Highs that touch product controls include
word-prediction pre-scrubber cache (LL-16ef84ad9a), masquerade without AuditEvent (LL-522c1a6d13),
district seat-reclaim consent (LL-f150e0e828), hard-delete media gaps (LL-854b1d3853), terms-agree
modal a11y/order (LL-104bfa61dc, LL-53cb93fab1), and audited-console session AuditEvent
(LL-7f7372e3eb). The 2026-08-12 six-finder audit run added several GCP production-access/logging
Highs not yet reflected in this section's prose (WIF ref-lock LL-1e7b568ef3, no Data Access audit
logging LL-b7ccc522b9, project-wide admin on a human principal LL-c0b3d59f58, public Cloud Run
ingress LL-0b5443f43b) -- see the register for the full current list, this paragraph is
illustrative, not exhaustive. Free-text named-entity coverage in PiiScrubber remains a residual of
closed LL-e573a39d2b. LL-11db0dc848, LL-6619cc1811, and LL-1b0d78dbe6 (Bedrock account-binding
check, verified-closed 2026-08-11) are verified-closed and are not open residuals. The Article 50
disclosure contrast finding (LL-a9d6d5a46b) is remediated-unverified, not open -- fix landed
2026-07-28 (#694); the register recorded it as open until this refresh caught the drift. The
AiApiLog IP-address scrub is implemented and scheduled (`AiApiLog.redact_old_ip_addresses!`,
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
| Article 50(1) disclosure enablement | Backstop built and complete; not in `ENABLED_FRONTEND_FEATURES` at `64cdccba1` (code default AVAILABLE-only at `64cdccba1`; runtime VERIFIED ENABLED 2026-08-23) | Code default only: `FeatureFlags` resolves the effective list from `SystemFeatureSettings.effective_enabled_for` (`lib/feature_flags.rb:147` via `feature_enabled_for?` at `:170-173`), which resolves through `SystemFeatureSettings.default_enabled_features` (`lib/system_feature_settings.rb:6-12`) -- a `Setting` DB row that falls back to the code constant only when unset, a database override no code listing can show. **Production flag state WAS verified 2026-08-23: ENABLED in production via the `default_enabled_features` DB Setting (see `docs/legal/2026-08-23_article-50-production-flag-verification.md`).** `article_50_disclosure` is AVAILABLE-only in code while `ai_board_generation` is enabled. Obligation date 2026-08-02 has passed. Server-side backstop now covers all 5 AI ingresses (#829/#831, 2026-08-19; LL-6723438462 remediated-unverified). The contrast blocker (LL-a9d6d5a46b) is also remediated-unverified (already fixed via #694). LL-104bfa61dc (terms-agree modal switch scanning, same shared modal component) remains open. The premise is now VERIFIED: production has the flag ENABLED, so this is a documentation correction rather than a pending enablement decision. **CONTRADICTION RESOLVED 2026-08-23 - PRODUCTION VERIFIED ENABLED.** `docs/legal/2026-08-17_ai-data-flow-classification.md:132`, itself CEO-attested 2026-08-19, records a live production read: `article_50_disclosure_shown` is TRUE on all 63 post-deploy `AiApiLog` rows. That column comes from `User#article_50_disclosure_shown?` (`app/models/user.rb:1324-1331` at `64cdccba1`), which returns true only when the user's `settings['ai_transparency']` carries a `shown_at` AND a matching `disclosures_version` -- i.e. only after an actual modal acknowledgement. A disclosure never enabled cannot produce that. (Scope caveat from that same record: the 63 rows come from 2 accounts, consistent with internal pre-tenant testing.) **RESOLVED 2026-08-23 - PRODUCTION VERIFIED ENABLED.** Production was read through the application path: `Setting.get('default_enabled_features')` CONTAINS `article_50_disclosure`, and `FeatureFlags.feature_enabled_for?('article_50_disclosure', user)` resolved TRUE for every user probed at `2026-08-23T21:04:12Z` (`RAILS_ENV=production`, image `web:73a8f633`). No org, beta or canary layer modifies it: production holds 2 organizations, 0 EU-stamped and 0 carrying any feature override, and neither the canary nor the beta `Setting` row exists. Enabled-SINCE date is NOT recoverable - `Setting` carries no PaperTrail history (0 version rows) and `Setting.set` overwrites in place; the containing row was created `2026-08-04T07:19:11Z` and last written `2026-08-13T00:03:56Z`, and nothing records which features the list held at either write. Full record: `docs/legal/2026-08-23_article-50-production-flag-verification.md`. It IS enabled, so this is a documentation correction, not a roadmap item. LL-104bfa61dc is scoped to the TERMS-AGREE modal; the AI disclosure modal is opened with `scannable: true` (`app/frontend/app/utils/article50_gate.js:108,141`) and carries `.modal_targets` and a `.btn` (`app/frontend/app/components/ai-disclosure.hbs:51,56`), so treating it as a hard pre-enable blocker for THIS modal is not supported by the code. It remains a shared-component confidence concern pending a runtime switch-scanning check. |
| ACR / VPAT publish | Draft | `docs/legal/ACCESSIBILITY_CONFORMANCE_REPORT.md` and branded Drive mirror remain `draft` awaiting attestation. |
| Remediated-unverified verification wave | In progress | Eight findings (five High) await fresh-context verification before Scot can close: LL-90045bb29c, LL-a95e9c5f7c, LL-705b10bcd7, LL-a9d6d5a46b, LL-6af580a23a (High); LL-5954bcbbe6, LL-a167848115, LL-6723438462 (Medium). |

---

## 13. Document and evidence index

The artifacts this overview points to. These are the living program; this document is the index
over them.

| Artifact | Purpose |
|---|---|
| `audit-reports/FINDINGS.json` | Code-anchored findings register; single source of truth for status |
| `docs/legal/2026-08-22_compliance-posture-report.md` | Posture summary (counts by framework), CORRECTED SUCCESSOR - UNATTESTED draft; supersedes the attested 2026-08-20 report |
| `docs/legal/2026-08-20_compliance-posture-report.md` | LAST-ATTESTED posture summary, ATTESTED 2026-08-20, now frozen and superseded by the 2026-08-22 successor above; earlier predecessors frozen at `2026-08-09_compliance-posture-report_draft.md` (unattested) and `COMPLIANCE_POSTURE_REPORT.md` (attested 2026-07-23) |
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
  basis for customer-facing responses now that it is attested (subject to the external-release
  gate in point 5 below).
- It is **not** a certification, a legal opinion, or a guarantee of compliance.
- Aspirational controls are confined to Section 12 and marked "not yet built." No control in
  Sections 5 to 11 is asserted unless it is evidenced in code or a signed agreement.
- The disclosure altitude for any externally shared version (full, or summarized) is Scot's
  decision at attestation time. The 16 CFR 312.2 internal-operations carve-out for cloud and model
  vendors, the FERPA studies-exception conditions, and the HIPAA de-identification standard should
  be confirmed with counsel before the relevant claims go external.

---

## 15. Attestation

> **NOT RE-MADE FOR v1.3.1.** The re-attestation *statement* below is the **v1.3 attestation as
> signed on 2026-08-20**, reproduced byte-for-byte: its first-person voice and its dates are the
> predecessor's, and no word of that statement has been re-made for v1.3.1.
> **The metadata table beneath the statement is NOT part of what was signed**, and it does carry
> this successor's corrections: the 2026-08-12 run size (46 -> 40, correction 1), the `HEAD` ->
> `` `64cdccba1` `` pinning (correction 2), the `open` -> `live` severity relabel (correction 4),
> and the draft attestation status. v1.3.1 is unattested. If Scot attests v1.3.1, a new statement
> dated to that attestation must be written here first.

**Re-attestation statement (v1.3, as signed 2026-08-20 -- reproduced, not re-made).** As CEO and the accountable owner of LingoLinq's compliance program, I
re-affirm points 1 through 6 of the 2026-06-18 attestation: this document is an honest,
evidence-based description of the program; implemented controls in Sections 5 through 11 are backed
by code, configuration, or signed agreements with accurate citations; aspirational controls remain
confined to Section 12; known residuals remain tracked rather than hidden; counsel-dependent claims
remain internal; and no external sharing is authorized until explicitly released. Prior residual
IDs LL-11db0dc848, LL-6619cc1811, and LL-1b0d78dbe6 are now verified-closed in the register. Live
residuals as of this 2026-08-20 attestation include LL-7f7372e3eb, LL-aacae48768
(accepted-risk), the High set listed in Section 5, and the additional GCP production-access/logging
Highs added by the 2026-08-12 six-finder audit run. This attestation's fresh verification scope is
the findings register and the Article 50 code-level claims (Sections 5/12); the infrastructure
posture in point 2 and vendor/BAA posture in point 3 below are carried forward from their last live
verification (Posture Report re-attest 2026-07-23; v1.2 attestation 2026-08-04) and were not
independently re-checked against live GCP/AWS state for this v1.3 attestation. I additionally
attest that, to the best of my knowledge as of 2026-08-20 (register cross-checked fresh; v1.2 on
the predecessor was attested 2026-08-04):

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

This attestation reflects the register's audited commit and the infrastructure state last verified
live on 2026-07-23/2026-08-04 (see the scope note above); it is not a certification, a legal
opinion, or a guarantee of compliance.

| Field | Value |
|---|---|
| Prepared by | Compliance review (Claude, acting as compliance officer); 2026-08-09 v1.3 draft; content refreshed and attested 2026-08-20 |
| Reviewed by | Predecessor v1.2 post-cutover sweep; Claude Code content-accuracy pass 2026-08-20 (every cited finding ID cross-checked against the live register); adversary review run on PR #838, #845 and #846 (the #846 pass produced the Section 15 fidelity, citation-anchor and provenance corrections recorded above) |
| Register audited commit | last full `/audit-run`: `d67ed76e0a1` (auditedDate 2026-08-12, 40 new findings); monthly light-run restamp `59f502aa4` (auditedDate 2026-08-18); live counts re-derived at staging commit `64cdccba1` (2026-08-20) |
| Posture at `64cdccba1` (v1.3, attested 2026-08-20) | 0 live Critical / 20 live High / 52 live Medium / 40 live Low (publisher convention), per `audit-reports/FINDINGS.json` |
| Infrastructure state verified | 2026-07-22 Gate 1 DNS cutover: `app.lingolinq.com` live on GCP load balancer IP `136.68.41.122`; Redis PONG captured from Cloud Run execution `lingolinq-migrate-vl5d5` at 2026-07-22T05:00:46Z (`ping=PONG`, `scheme=rediss`, `ca_blocks=1`, `verify_hostname=false`). `ca_blocks=1` is the expected Memorystore instance-CA chain length for this endpoint; `verify_hostname=false` is the documented pinned-CA/private-IP hatch while CA-chain verification remains on. Render retained as write-frozen rollback fallback pending explicit decommission. LL-6619cc1811 verified-closed. **Not re-verified against live infrastructure for this 2026-08-20 attestation** (register-and-code-only pass); this row carries forward the 2026-07-22/23 live verification. Re-check against live GCP/AWS state before relying on this for anything infrastructure-sensitive. |
| Attested by | NOT YET ATTESTED - awaiting Scot Wahlquist, CEO (v1.3.1) |
| Attestation date | 2026-06-18 (v1.0); 2026-07-22 (v1.1); 2026-08-04 (v1.2); 2026-08-20 (v1.3); v1.3.1 pending |

_Once attested, the canonical home for this document is the repository at
`docs/legal/COMPLIANCE_PROGRAM.md`, alongside the evidence it indexes. Moving it there is a
separate, deliberate commit on a branch off `staging`._
