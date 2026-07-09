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

LingoLinq is an Augmentative and Alternative Communication (AAC) application that supports speech
and language development. **Our default model is user and caregiver owned.** The AAC user, or an
adult caregiver, owns the account, in the same way a family owns a wheelchair or a dedicated AAC
device. A therapist or teacher participates as a *supervisor* on that account. Supervising an
account does not make LingoLinq a healthcare business associate, and it does not transfer ownership
of the data to a clinic or a school.

One practical consequence drives this whole program: **the account owner (the user or guardian) is
the party who controls the data and is the only one who can request that it be permanently
deleted.** We honor that with a hard delete. Because the family holds the relationship in the common
case, our obligations attach to the real deployment, not to a worst-case assumption that every user
is a school-owned record or a clinical patient.

| Deployment | Who owns the relationship | Primary regime | Consent authority |
|---|---|---|---|
| **Family (default)** | The user / guardian | COPPA (under-13), state minor-privacy | Parent or guardian |
| School / district | The district | FERPA | The district, as authorized "school official" |
| Clinic / hospital | The institution, under a signed BAA | HIPAA | The provider (PHI attaches only here) |

FERPA and HIPAA do not apply simply because a therapist is involved. They attach only in the
institutional deployments described in the addendums (Sections 5 and 6). We do not require
therapists to submit professional licenses or NPI numbers to use the product: a license is not what
triggers HIPAA, and requiring it would add friction without adding protection.

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
- If a user is under 13, standard registration halts and a verifiable parental consent flow begins
  before the account is activated.
- AI features are hard-blocked at the code level for consent-pending under-13 users.
- Where a district deploys LingoLinq, the district's institutional authorization covers the
  educational-use consent step (see Section 5).

**Usage data and reports (off by default)**
- Activity logging, geographic/access logging, and reports are permissioned and **off by default**.
  A family (family-owned account) or a school administrator (district deployment) can turn them on.
- When enabled, reports describe how the person communicates: usage frequency, core vs fringe
  vocabulary use, and an access heat map showing where a user reliably selects and where
  accessibility issues may exist. These reports are treated as sensitive and follow the account's
  permission model.

**Assessment (the built-in eval)**
- LingoLinq includes an optional assessment ("eval") that presents progressive tasks (for example,
  locating a target symbol as it moves and shrinks, distinguishing symbol types, testing concept
  understanding, and early reading) and ends after a set number of misses. It records how far the
  user progressed, the grid sizes they can navigate, and any consistent access blind spots, so a
  clinician or educator can recommend an appropriate vocabulary set.
- Eval results are **functional-access and communication-readiness data, not a medical diagnosis**.
  The product stores no diagnosis, IEP, 504, or condition field. In a school deployment these
  results are education records under FERPA; in the EU they are sensitive children's data handled
  under Section 6.

**AI and PII handling**
- LingoLinq uses AI for word prediction and communication-board generation. The primary model is
  Anthropic Claude (Haiku 4.5), with a Google (Gemini) fallback.
- Before any text is sent to an external model, our PII scrubber removes identifiers. This is
  **pseudonymization (scrubbing)**, and we describe it accurately: the result is scrubbed data that
  we still treat as personal data. We do not call it de-identified or anonymized.
- Our production AI vendors operate under Data Processing Agreements. The Anthropic models we use
  are eligible for zero data retention (no ZDR contract is signed today; see Section 3).
- Every AI call is recorded in an audit log (AiApiLog) with the fields needed for AI-governance
  reporting. IP addresses in that log are automatically redacted on a scheduled 90-day cycle.
- AI consent is versioned per user. The eval and narration AI paths apply the same COPPA gate, PII
  scrubbing, and logging, and drop client-asserted names.
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
- We maintain an audit trail (AuditEvent and PaperTrail) over record changes and key administrative
  actions, including license claim and release, supervisor consent, and password changes.

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
- No contractual zero-data-retention agreement with the AI vendor (the models are eligible; no such
  contract is signed).
- No differential privacy or mathematical anonymization on retained metrics.
- No native mobile apps yet, so no mobile-hardening claims (certificate pinning, jailbreak
  detection, code obfuscation).
- Not SOC 2 or HITRUST certified; no completed, published VPAT yet.
- We store **no diagnosis, disability, health-condition, IEP, 504, or medical field**, and AAC use
  is not a proxy for disability. The built-in eval (Section 2) produces functional-access
  assessment results, not a clinical diagnosis, and we do not represent them as medical or
  diagnostic data.

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
- Confirm and, if missing, add a clear parent/guardian notice-and-consent step when a
  school-offboarded child's account continues as a family trial (see Section 5), with
  export-then-delete if the family declines.
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

This addendum applies only when a school district or a clinical institution is the customer, through
our organization licence portal. It does not change the default family-owned model above.

**The licence portal and seats.** An organization purchases a block of seats (for example 100) and
manages them in the org portal. Seat types include student, supervisor, and eval seats. District or
clinic administrators can create accounts, build and assign vocabulary/page sets (including
topic-based sets), enroll students to trial, and assign student caseloads to SLPs and teachers.
Reports and logging stay off until a family or an administrator turns them on (Section 2).

**Three institutional patterns:**

1. **District- or clinic-managed individual accounts.** An administrator sets up an individual AAC
   user (with the user's or guardian's permission) and may assign clinicians and teachers. This is
   where FERPA (schools) or a BAA (clinics, on request) applies, and where usage and eval reports
   may be enabled. The account is personal to that AAC user.
2. **Shared classroom / UDL account.** A single shared account is used as a language-modeling tool:
   a teacher displays a page set (for example on a smart board) and pushes it to student devices for
   modeling, articulation, sentence structure, spelling, and grammar. This account tracks no
   individual student performance; the only personal data is the roster (which students, teacher, or
   therapist are associated). This is the lowest-data mode.
3. **Family-owned account with institutional supervisors.** The family owns the account and a school
   or clinic simply attaches supervisors. Consumer and COPPA rules apply; FERPA and HIPAA do not
   attach merely from supervision.

**Data ownership and offboarding (the differentiator).** The AAC user's account and its data are
not the property of the district or clinic; they belong to the AAC user and family. When a student
moves or ages out, the district can reclaim the seat, but the account and its personalized setup and
history stay with the user, who continues on a short complimentary trial so communication is not
disrupted. The family then decides whether to subscribe, and a future district can reuse the freed
seat. This is verified in the licence-release code path.

Two points we state honestly so the model holds up under a district's own agreement:

- The data is **not owned** by the institution, but while a student is served on a district seat,
  the district's signed Data Privacy Agreement governs those education records, including any
  delete-or-return-on-termination terms the district requires. We honor those DPA terms for the
  school-collected records. The "stays with the user" transfer is the **family's option** to retain
  their own account as consumers at offboarding; it is not a claim that a district can never require
  deletion during the school relationship.
- Continuing to process a child's data after the school's authorization ends shifts the lawful basis
  to **parental consent**. The offboarding-to-family transition therefore requires clear parent or
  guardian notice and consent to continue, with export-then-delete if the family declines (tracked
  as a near-term control in Section 4).

**Contracts we sign.** In practice districts and hospitals provide their own paper: we sign the
**district's DPA** and operate under its guidelines, and we provide a **BAA to a clinical
institution when it requires one**, rather than signing a BAA with every individual therapist. We
keep our own National Data Privacy Agreement (NDPA) and BAA templates ready for customers who do not
have their own.

---

## 6. Addendum: EU and UK (near-term: Poland)

We are preparing to sell into the EU through a Polish distributor, selling to families and to
schools or agencies. GDPR therefore moves from "someday" to near-term. In that market:

- **Roles.** LingoLinq is the **controller** for family accounts and a **processor** for schools and
  agencies, mirroring the family-owned vs institutional split above.
- **Children's consent.** Poland sets the digital-consent age at 16, so the COPPA under-13 gate is
  not sufficient there. A jurisdiction-aware under-16 parental-consent gate is required before the
  first EU user (Planned, engineering).
- **EU representative.** We appoint an Article 27 EU representative (a purchased service, not a hire)
  before going live.
- **Transfers.** The EU data-transfer mechanism (Standard Contractual Clauses, and reliance on the
  Data Privacy Framework where applicable) couples to the GCP cutover and to the vendor DPAs.
- **AI transparency.** EU AI Act Article 50 transparency disclosures for AI features are due
  2026-08-02 and are tracked separately (`docs/legal/EU_AI_ACT_ARTICLE_50_PLAN.md`).
- **Documents.** The detailed EU controller privacy notice for Polish families and the EU processor
  DPA with SCCs for Polish schools are drafted and held for counsel review, Polish translation, and
  the EU-representative name before use.

Special-category note: for EU purposes the primary legal basis is contract (Art. 6(1)(b)).
Special-category (Art. 9) data arises only from content a user or supervisor stores, from eval
assessment results in a clinical context, or from a clinical deployment, and is then handled by
explicit consent (families) or controller instructions (schools). Voice recordings are the user's
own communication content under consent, not a biometric identifier (we run no voiceprint or speaker
recognition).

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
