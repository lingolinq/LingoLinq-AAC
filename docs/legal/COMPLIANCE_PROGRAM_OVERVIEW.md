# LingoLinq Security, Privacy & Compliance Overview

> **DRAFT for CEO review and attestation before external release.** As of 2026-07-09.
> Reflects the current production build. Present tense describes controls that exist in the
> product today. The "Planned" section describes controls we intend to add and is written in
> the future tense on purpose. This document deliberately claims only what we actually do.
>
> **Purpose:** this is the short, externally shareable overview of our program. It is the
> honest, right-sized replacement for the aspirational 85-page draft. It does not replace the
> internal attested program (`docs/legal/COMPLIANCE_PROGRAM.md`), which remains the internal
> front door and evidence index; this overview is the version we can hand to a family, a
> district, or a partner. Status of every implemented claim is verifiable against live code and
> the findings register (`audit-reports/FINDINGS.json`).
>
> **Owner:** Scot Wahlquist, CEO. **Not authorized for external sharing** until the CEO attests
> this specific version.

---

## 1. What LingoLinq is, and how obligations attach

LingoLinq is an Augmentative and Alternative Communication (AAC) application that supports
speech and language development. **Our default model is user and caregiver owned.** The AAC user,
or an adult caregiver, owns the account, in the same way a family owns a wheelchair or a dedicated
AAC device. A therapist or teacher participates as a *supervisor* on that account. Supervising an
account does not make LingoLinq a healthcare business associate, and it does not transfer
ownership of the data to a clinic or a school.

One practical consequence drives this whole program: **the account owner (the user or guardian)
is the party who controls the data and is the only one who can request that it be permanently
deleted.** We honor that with a hard delete. Because the family holds the relationship in the
common case, our obligations attach to the real deployment, not to a worst-case assumption that
every user is a school-owned record or a clinical patient.

| Deployment | Who owns the relationship | Primary regime | Consent authority |
|---|---|---|---|
| **Family (default)** | The user / guardian | COPPA (under-13), state minor-privacy | Parent or guardian |
| School / district | The district | FERPA | The district, as authorized "school official" |
| Clinic / hospital | The institution, under a signed BAA | HIPAA | The provider (PHI attaches only here) |

FERPA and HIPAA do not apply simply because a therapist is involved. They attach only in the
institutional deployments described in the addendums (Sections 5 and 6). We do not require
therapists to submit professional licenses or NPI numbers to use the product: a license is not
what triggers HIPAA, and requiring it would add friction without adding protection.

---

## 2. What we do today (implemented controls)

Everything in this section is live in the product.

**Encryption and data protection**
- Sensitive fields are encrypted at rest with AES-256-GCM server-side encryption; LingoLinq
  manages the keys.
- All traffic is encrypted in transit with TLS 1.2 or 1.3. Production enforces HTTPS.
- File storage on AWS S3 is encrypted at rest, under a signed BAA with AWS (executed February 2026).

**Children's privacy (COPPA)**
- A neutral age gate collects month and year of birth only, with no coercive "you must be 13"
  language.
- If a user is under 13, standard registration halts and a verifiable parental consent flow
  begins before the account is activated.
- AI features are hard-blocked at the code level for consent-pending under-13 users.
- Where a district deploys LingoLinq, the district's institutional authorization covers the
  educational-use consent step (see Section 5).

**AI and PII handling**
- LingoLinq uses AI for word prediction and communication-board generation. The primary model is
  Anthropic Claude (Haiku 4.5), with a Google (Gemini) fallback.
- Before any text is sent to an external model, our PII scrubber removes identifiers. This is
  **pseudonymization (scrubbing)**, and we describe it accurately: the result is scrubbed data
  that we still treat as personal data. We do not call it de-identified or anonymized.
- Our production AI vendors operate under Data Processing Agreements. The Anthropic models we use
  are eligible for zero data retention (no ZDR contract is signed today; see Section 3).
- Every AI call is recorded in an audit log (AiApiLog) with the fields needed for AI-governance
  reporting. IP addresses in that log are automatically redacted on a scheduled 90-day cycle.
- AI consent is versioned per user. The eval and narration AI paths apply the same COPPA gate,
  PII scrubbing, and logging, and drop client-asserted names.
- Server-side error monitoring (Sentry) runs with a child-data scrubber that drops children's
  error, transaction, and breadcrumb events. The frontend ships with no third-party
  product-analytics SDKs (no Google Analytics, Mixpanel, or similar).

**Authentication and access**
- Accounts use a username and password (bcrypt-hashed), with Google sign-in and SAML single
  sign-on also supported.
- Time-based one-time-password (TOTP) two-factor authentication is available.
- Role-based permissions govern access, using a supervisor and communicator model for therapy
  teams.
- Rate limiting (Rack::Attack) protects sensitive endpoints (consent, account claim, start-code,
  registration, two-factor, SAML, password reset); abusive requests receive HTTP 429.

**Audit trail**
- We maintain an audit trail (AuditEvent and PaperTrail) over record changes and key
  administrative actions, including license claim and release, supervisor consent, and password
  changes.

**Data lifecycle and deletion**
- Administrators and parents can request permanent deletion of a user's data, which removes the
  account and its configurations.
- Right-to-erasure covers associated records, including license records; account merges transfer
  license records rather than orphaning them.
- Organizations can set retention policies, and retention enforcement runs on a schedule.

**Voice recordings**
- Some users, particularly those with degenerative conditions, record their own voice for message
  banking so it can be played back on their devices. These recordings are the user's own voice and
  are stored encrypted at rest and in transit so they are available across the user's devices.
- We do not create voiceprints, perform speaker identification, or use these recordings to train
  AI. Deletion on request removes them. They are the user's own communication content, not a
  biometric identifier used for recognition.

**Accessibility**
- As an AAC tool, accessibility is core to the product. We build to Web Content Accessibility
  Guidelines (WCAG) 2.1 AA.

**Vendors and subprocessors**
- We maintain a subprocessor list and sign agreements only with vendors that actually handle our
  data: AWS (storage, BAA signed), Anthropic (AI, under a DPA), and Google (sign-in and AI
  fallback). See `docs/legal/SUBPROCESSORS.md`.

**Breach response**
- We maintain a breach runbook (`docs/legal/BREACH_RUNBOOK.md`) and notify affected parties and
  regulators within the timelines the applicable law requires (HIPAA 60 days, GDPR 72 hours to the
  regulator). We do not commit to a self-imposed clock stricter than the law.

---

## 3. Deliberately not claimed

For credibility and legal safety we do not claim the following, because the product does not do
them today. Stating this plainly protects us from deception exposure and makes everything above
trustworthy.

- No end-to-end encryption with zero readable keys. We hold the keys for server-side encryption.
- Not passwordless. We use passwords plus SSO.
- Not a local-first-only architecture. Configuration and some content sync to the cloud.
- No hardware security modules (HSMs), web application firewall (WAF), or SIEM platform.
- No contractual zero-data-retention agreement with the AI vendor (the models are eligible; no
  such contract is signed).
- No differential privacy or mathematical anonymization on retained metrics.
- No native mobile apps yet, so no mobile-hardening claims (certificate pinning, jailbreak
  detection, code obfuscation).
- Not SOC 2 or HITRUST certified; no completed, published VPAT yet.
- We do not collect a diagnosis, disability, health-condition, IEP, 504, or medical field. AAC use
  is not a proxy for disability, so we do not claim to "process health or disability data" as a
  category. Special-category data arises only from free-text content a user or supervisor chooses
  to store, or from a clinical deployment, and is handled by consent or controller instructions.

---

## 4. Planned (staged against real triggers)

These are real goals. They are not built yet, and we add them when a specific need or customer
requires them, not before.

**Near-term hardening (independent of any customer):**
- Make two-factor authentication mandatory for administrators and internal staff.
- Add automated retention jobs: purge unverified signups after a set window; handle long-inactive
  profiles with an export-first, delete-later flow.
- Harden console and privileged-access session auditing so every administrative session is
  attributably logged.
- Publish an accurate VPAT and complete the EU AI Act Article 50 transparency disclosures for AI
  features (target early August 2026).

**When we sell into schools at scale:** district data-privacy addendum workflow, state-specific
student-privacy riders, and roster single sign-on (Clever, ClassLink). See Section 5.

**When a hospital or clinic requires it:** HIPAA clinic mode and a ready-to-sign BAA for
institutions that store PHI on their behalf through us. See Section 5.

**When we sell into the EU or UK (near-term: Poland):** EU representative, Standard Contractual
Clauses, jurisdiction-aware under-16 consent, and a data-transfer story tied to the GCP cutover.
See Section 6.

**Enterprise-sales maturity:** SOC 2 program, a regular penetration-testing cadence, and
centralized security monitoring.

**When we ship native apps:** native mobile application hardening.

---

## 5. Addendum: institutional deployments (schools and clinics)

This addendum applies only when a school district or a clinical institution is the customer. It
does not change the default family-owned model above.

**Schools and districts (FERPA).** When a district purchases and deploys LingoLinq, FERPA governs
and we operate as an authorized "school official" performing a service the district would otherwise
perform itself, under the district's direct control. The district provides authorization on behalf
of parents for educational use. We describe this as institutional consent or school authorization,
never as a "bypass" of parental consent. US districts expect the standard **Student Data Privacy
Agreement** (the SDPC / A4L National Data Privacy Agreement, NDPA), not a homemade DPA; we offer
the NDPA form with our exhibits, plus state riders where required.

**Clinics and hospitals (HIPAA).** HIPAA applies only when an institution stores protected health
information on its behalf through us. In that case we execute a Business Associate Agreement. A BAA
is a business-to-business contract, never a consumer checkbox, and it is the exception rather than
the rule. We keep a ready-to-sign BAA on the shelf and provide it when an institution requires one
as a condition of purchase.

**Hosting note.** The Business Associate obligations above depend on our infrastructure being
covered. The AWS S3 BAA is signed; the Google Cloud BAA covering Cloud Run, Cloud SQL, and
Memorystore is executed at the GCP cutover (migration in progress).

---

## 6. Addendum: EU and UK (near-term: Poland)

We are preparing to sell into the EU through a Polish distributor, selling to families and to
schools or agencies. GDPR therefore moves from "someday" to near-term. In that market:

- **Roles.** LingoLinq is the **controller** for family accounts and a **processor** for schools
  and agencies, mirroring the family-owned vs institutional split above.
- **Children's consent.** Poland sets the digital-consent age at 16, so the COPPA under-13 gate is
  not sufficient there. A jurisdiction-aware under-16 parental-consent gate is required before the
  first EU user (Planned, engineering).
- **EU representative.** We appoint an Article 27 EU representative (a purchased service, not a
  hire) before going live.
- **Transfers.** The EU data-transfer mechanism (Standard Contractual Clauses, and reliance on the
  Data Privacy Framework where applicable) couples to the GCP cutover and to the vendor DPAs.
- **AI transparency.** EU AI Act Article 50 transparency disclosures for AI features are due
  2026-08-02 and are tracked separately (`docs/legal/EU_AI_ACT_ARTICLE_50_PLAN.md`).
- **Documents.** The detailed EU controller privacy notice for Polish families and the EU processor
  DPA with SCCs for Polish schools are drafted and held for counsel review, Polish translation, and
  the EU-representative name before use.

Special-category note: for EU purposes the primary legal basis is contract (Art. 6(1)(b)).
Special-category (Art. 9) data arises only from content a user or supervisor stores, or from a
clinical deployment, and is then handled by explicit consent (families) or controller instructions
(schools). Voice recordings are the user's own communication content under consent, not a
biometric identifier (we run no voiceprint or speaker recognition).

---

## 7. Governance and contact

For a company at our stage, the CEO holds accountability for privacy and security, supported by
operations. We run a live findings register that tracks security and compliance gaps, severity, and
disposition; only the CEO closes a finding or accepts a risk. As we grow, and as specific customers
require it, we assign the dedicated roles named in the "Planned" section (for example a Data
Protection Officer and an EU representative when we enter the EU).

Privacy, deletion requests, and compliance questions: compliance@lingolinq.com.

---

*This overview is the accurate baseline. Anything not listed under "What we do today" must be
written in the future tense in any external or contractual document, and we warrant only the
implemented controls.*
