# LingoLinq Security, Privacy & Compliance Overview

> **DRAFT - awaiting attestation (2026-08-09).** Successor to attested
> `docs/legal/COMPLIANCE_PROGRAM_OVERVIEW.md` (DOC-03cb9fe91f, rev. 2026-08-04-a). Internal use
> only until the CEO attests this file. **Not authorized for external release** until attestation.
>
> **Scope of this draft (PR #721).** Updates the data-lifecycle / voice-recording erasure claims
> (`ButtonSound`, `UserVideo`, S3 `remote_remove`) to match `Flusher.flush_user_content` at HEAD.
> Does not close, downgrade, or re-attest any finding.
>
> Present tense describes controls that exist in the product today. The "Planned" section
> describes controls we intend to add and is written in the future tense on purpose. This
> document deliberately claims only what we actually do.
>
> **Attestation history (predecessor).** First attested for external release 2026-07-09
> (rev. 2026-07-09-c), after a Codex senior-dev re-review reconciled the Sentry scrubber,
> password-hashing, right-to-erasure, WCAG, vendor-list, text-to-speech, recording-delete, and
> IP-geolocation statements against live code. That revision was then superseded by two edits on
> 2026-07-21: PR #649 rewrote the COPPA offboarding section from an open gap to an implemented
> control, and PR #652 rewrote the subprocessor and hosting posture for the Google Cloud cutover.
> Because this document is externally shareable, it was held as unattested in the document
> register until those newer claims were re-verified against live code on 2026-07-22:
> `Organization#remove_user` (`app/models/organization.rb`) calls
> `User#begin_family_offboarding_consents!` (`app/models/user.rb`); parent email is collected at
> next login via `submit_parental_consent_email` (`app/controllers/api/users_controller.rb`,
> `app/models/user.rb`); and full login is genuinely blocked while consent is pending, because the
> device token is only issued `unless coppa_pending`. That re-attestation covered rev. 2026-07-22-a.
>
> **2026-07-23 re-attestation (rev. 2026-07-23-a).** Corrected the text-to-speech statement: Irish
> (Gaeilge) TTS via Abair (`abair.ie`, Trinity College Dublin / ADAPT) was **disabled 2026-07-23**
> (PR #674) because there is no DPA on file, so spoken text is no longer sent to Abair. Google Cloud
> Text-to-Speech has no Irish voice, so there is no covered replacement; Irish cloud TTS is off until
> a DPA/SCCs exists. See the text-to-speech bullet below and `docs/legal/SUBPROCESSORS.md` #17.
>
> **2026-08-04 re-attestation (rev. 2026-08-04-a).** Recorded the runtime AI operational status as
> a closed window rather than an open capability claim: the AI features named in this document ran
> on Anthropic Claude (Haiku 4.5) over AWS Bedrock. **Corrected 2026-08-26** (the substance was first
> drafted 2026-08-19 in PR #827 and is carried forward here): this passage read
> that those features "were not operational from 2026-07-30 until 2026-08-03, were briefly
> operational from 2026-08-03 to 2026-08-04 for a single internal verification call carrying no user
> or student data, and are **not operational as of 2026-08-04**. No customer, user, or student data
> has been sent to a model provider on this path." **The operational-status claim is false.**
> Credentials withdrawn on revision `00014-5rw` (2026-08-04T06:31:46Z) were restored on `00015-9l9`
> 53 minutes later, and the 2026-08-12 production deploy of PR #734 put the path into
> user-attributed use: production `AiApiLog` held **64 application-observed rows through 2026-08-14T21:13:27Z,
> 63 of which carry a `user_global_id`** (`docs/legal/2026-08-16_subprocessor-register.md:99`;
> path verified live and serving revision swept 2026-08-16).
>
> **The second sentence is narrower than it looks and is not simply reversed.** Those 63
> user-attributed calls resolve to two accounts, and all 34 production accounts were confirmed to be
> internal test/QA accounts rather than real users (Scot Wahlquist, 2026-08-24;
> `docs/legal/2026-08-24_ai-governance-memo.md:134`). So scrubbed content HAS reached the processing
> plane, and **no real person is known to have had data sent on this path.** The receiving processor
> is **AWS**: prompts are delivered to Amazon Bedrock under the AWS BAA, and Anthropic supplies the
> model without receiving the payload (`docs/legal/2026-08-16_subprocessor-register.md:99`).
>
> **Evidence limit.** `AiApiLog` is an application-observed floor, not a ledger: `log_ai_call`
> rescues `ActiveRecord::ActiveRecordError` and returns an unsaved record, and `Flusher` destroys
> rows on erasure, so the application-observed counts above are a lower bound.
>
> **Vendor-side confirmation obtained 2026-08-26.** An earlier draft of this correction stated that
> no vendor-side confirmation had been obtained. That is no longer true. CloudWatch `AWS/Bedrock`
> `Invocations` and CloudTrail `InvokeModel` were queried against account `239044785114` for
> 2026-07-01 to 2026-08-27 UTC. They establish three things the application log could not.
> First, the window this passage originally asserted was closed (2026-07-30 to 2026-08-03) contains
> **28 attributed invocations**: 27 on 2026-08-01 UTC and 1 on 2026-08-02 UTC. 26 were issued by
> `lingolinq-bedrock-runtime` and 2 directly by an administrator principal.
> Second, the window described as carrying "a single internal verification call" (2026-08-03 to
> 2026-08-06) carries **8, every one of them the runtime credential**. The only human-issued calls
> anywhere in the range fall on 2026-08-01, two days before that window opens, so the verification
> event this passage describes is recorded on the wrong dates.
> Third, four principals invoke Bedrock, not one: `lingolinq-bedrock-runtime` (121),
> `lingolinq-bedrock-staging` (67), `lingolinq-bedrock-dev` (27), and an administrator (2). Only the
> first writes to production `AiApiLog`, so any figure that pools environments describes a different
> population than the application log does.
>
> Vendor telemetry and the application log therefore cannot be reconciled into a single number, and
> **no ratio between them should be quoted.** The two sources also do not agree with each other
> exactly: CloudWatch reports 222 invocations across the range against 217 attributed by CloudTrail,
> a 5-event variance that is unexplained and does not affect any per-window figure above, all of
> which come from CloudTrail directly. Credential mounts are not monotonic, so these statements are
> true as of their stated dates and do not by themselves establish continuous operation.
>
> The prompts are redacted by `lib/pii_scrubber.rb` before egress, which is
> pseudonymization and not de-identification, so they remain personal data under GDPR/UK-GDPR. The
> operative statements of the flow are `docs/legal/2026-08-25_ai-data-flow-classification.md` and
> `docs/legal/2026-08-16_subprocessor-register.md`. The
> "everything in this section is live" framing was qualified to except controls explicitly marked
> not operational. That is the last attested, externally authorized cut (DOC-03cb9fe91f).
>
> **Purpose:** this is the short, externally shareable overview of our program. It is the
> honest, right-sized replacement for the aspirational 85-page draft. It does not replace the
> internal attested program (`docs/legal/COMPLIANCE_PROGRAM.md`), which remains the internal
> front door and evidence index; this overview is the version we can hand to a family, a
> district, or a partner. Status of every implemented claim is verifiable against live code and
> the findings register (`audit-reports/FINDINGS.json`).
>
> **Owner:** Scot Wahlquist, CEO. External-sharing authorization last covered the 2026-08-04-a
> attested predecessor; this draft is **not** authorized for external release until Scot attests
> it. Prior external-release authorizations on the predecessor: 2026-07-09, 2026-07-22,
> 2026-07-23, 2026-08-04.

---

## 1. What LingoLinq is, and how obligations attach

LingoLinq is an Augmentative and Alternative Communication (AAC) application that supports speech
and language development. **Our default model is user and caregiver owned.** The AAC user, or an
adult caregiver, owns the account, in the same way a family owns a wheelchair or a dedicated AAC
device. A therapist or teacher participates as a *supervisor* on that account. Supervising an
account does not make LingoLinq a healthcare business associate, and it does not transfer ownership
of the data to a clinic or a school.

One practical consequence drives this whole program: in the common family-owned case, **the account
owner (the user or guardian) controls the data and can request that it be permanently deleted**, and
we honor that with a hard delete. Where a district or clinic is the customer, that institution's
signed agreement also governs deletion of the records it owns (Section 5). Because the family holds
the relationship in the common case, our obligations attach to the real deployment, not to a
worst-case assumption that every user is a school-owned record or a clinical patient.

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

Everything in this section is live in the product, except where a control is
explicitly marked not operational.

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
  The data model has no diagnosis, IEP, 504, or clinical-condition column. The eval's optional
  intake does record a coarse etiology category (for example developmental, autism, cerebral palsy,
  acquired, or progressive) to help recommend a starting vocabulary; it is stored with the encrypted
  eval record and is not a diagnosis. In a school deployment these results are education records
  under FERPA; in the EU they are sensitive children's data handled under Section 6.

**AI and PII handling**
- LingoLinq uses AI for word prediction and communication-board generation. The designated model is
  Anthropic Claude (Haiku 4.5) on AWS Bedrock. There is no Google (Gemini) fallback; that path was
  removed on 2026-07-09. **Corrected 2026-08-26: before 2026-08-02 the runtime path was not
  restricted to the designated model.** CloudTrail records 9 invocations of
  `us.anthropic.claude-opus-4-5-20251101-v1:0` and 1 of
  `us.anthropic.claude-sonnet-4-5-20250929-v1:0` by `lingolinq-bedrock-runtime` on 2026-08-01. Both
  are Anthropic models served by Amazon Bedrock under the same AWS BAA, so no processor outside the
  BAA received the payload, but neither was a designated model. The `ALLOWED_RUNTIME_MODELS` gate in
  `lib/ai_client.rb` that now restricts the runtime seams to Haiku 4.5 did not exist until commit
  `5dbc4e478` (2026-08-02T17:03:04-0600). Every invocation after that commit resolves to Haiku 4.5,
  which vendor telemetry independently confirms. **Corrected 2026-08-26: the runtime AI path was operational and carrying
  user-attributed traffic when last verified (application logs through 2026-08-14T21:13:27Z,
  serving-revision sweep 2026-08-16).** This passage read that these features "were not operational from
  2026-07-30 until 2026-08-03, were briefly operational from 2026-08-03 to 2026-08-04 for internal
  verification only, and are **not operational as of 2026-08-04**", and that no user or student data
  had been sent. Credentials withdrawn on `00014-5rw` were restored 53 minutes later on `00015-9l9`
  (2026-08-04T07:25:08Z), and since the 2026-08-12 production deploy of PR #734 production
  `AiApiLog` held **64 application-observed rows through 2026-08-14T21:13:27Z, 63 carrying a
  `user_global_id`**
  (`docs/legal/2026-08-16_subprocessor-register.md:99`). Scrubbed user content HAS reached the
  processing plane, which is **AWS** (Amazon Bedrock is the receiving processor under the AWS BAA;
  Anthropic supplies the model and does not receive the payload). The 63 attributed calls resolve to
  two accounts, and all 34 production accounts were confirmed internal test/QA rather than real
  users (Scot Wahlquist, 2026-08-24), so no real person is known to have had data sent on this path.
  `AiApiLog` is an application-observed floor, not a ledger. Vendor-side confirmation was obtained
  on 2026-08-26 from CloudWatch `AWS/Bedrock` `Invocations` and CloudTrail `InvokeModel`, and it
  places 26 runtime invocations inside the window this passage originally called closed and 8 in the
  window it described as a single verification call. See the re-attestation note above.
- Before text is sent to our external LLM providers for word prediction, board generation, or eval
  narration, our PII scrubber removes identifiers. This is **pseudonymization (scrubbing)**, and we
  describe it accurately: the result is scrubbed data that we still treat as personal data. We do
  not call it de-identified or anonymized.
- Text-to-speech is a separate voice/audio feature. To synthesize spoken audio, the text being
  spoken is sent to the configured TTS provider (Google Text-to-Speech). Irish (Gaeilge) TTS via
  Abair was disabled 2026-07-23 (no DPA on file), so no spoken text is sent to a third-party Irish
  TTS service. This path does not run the LLM PII scrubber, because the text to be spoken is itself
  the payload.
- Our production AI vendors operate under Data Processing Agreements. The Anthropic models we use
  are eligible for zero data retention (no ZDR contract is signed today; see Section 3).
- Runtime, user-facing AI calls (word prediction, board generation, and eval narration) are
  recorded in an audit log (AiApiLog) with the fields needed for AI-governance reporting. **Corrected
  2026-08-26:** this read "Every ... call is recorded". The write is best-effort by design, so the
  log is an application-observed floor rather than a complete ledger; see the evidence limit above. IP
  addresses in that log are automatically redacted on a scheduled 90-day cycle. (An offline
  vocabulary-seed generator that sends no user data is the one AI path outside this log.)
- AI consent is versioned per user. The eval and narration AI paths apply the same COPPA gate, PII
  scrubbing, and logging, and drop client-asserted names.
- Server-side error monitoring (Sentry) runs with a child-data scrubber: for children whose
  parental consent is still pending it strips identifying data from error events and drops their
  performance-trace (transaction) events entirely, and it scrubs sensitive parameters from
  breadcrumb URLs for all users. The frontend integrates no product-analytics SDK such
  as Mixpanel or Segment. A legacy Google Analytics tag is present in the web layout but loads only
  when the analytics environment variables are configured for an environment and the user accepts the
  cookie-consent prompt; when active it sets IP anonymization.

**Authentication and access**
- Accounts use a username and password (salted and hashed with PBKDF2-HMAC-SHA256 via the GoSecure
  library), with Google sign-in and SAML single sign-on also supported.
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
- Erasure removes the account, its configurations, and the board, log, and connection records tied
  to it, plus the user's own voice recordings (`ButtonSound`, including off-board / message-bank
  rows) and videos (`UserVideo`), with Uploadable scheduling removal of the primary S3 object and
  the `MediaObject` concern scheduling removal of the transcription working copy, prior-transcode
  originals, the video thumbnail, and an abandoned/never-confirmed upload's raw object, all on
  destroy. Thumbnail removal additionally needs `s3:ListBucket` on the uploads-bucket credential
  (not yet verified in production, with a bounded best-effort fallback -- the first five thumbnail
  indices only, stopping at the first gap -- if listing fails or is denied). This coverage list is
  not exhaustive: a transcode job whose completion is never recorded (owning record destroyed
  mid-job, or a lost/never-delivered SNS completion notification) leaves its S3 output with no
  persisted application metadata for any sweep to discover, tracked separately as LL-c4566fa37f.
  LL-854b1d3853 remains open pending independent (dual-reviewer) verification of complete
  media-object erasure; account merges transfer license records rather than orphaning them.
- Organizations can set retention policies, and retention enforcement runs on a schedule.

**Voice recordings**
- Some users, particularly those with degenerative conditions, record their own voice for message
  banking so it can be played back on their devices. These recordings are the user's own voice and
  are stored encrypted at rest and in transit so they are available across the user's devices.
- We do not create voiceprints, perform speaker identification, or use these recordings to train
  AI. Users can delete recordings from the application, and account erasure also destroys owned
  `ButtonSound` / `UserVideo` rows, scheduling removal of the primary recording, the transcription
  working copy, prior-transcode originals, the video thumbnail, and an abandoned/never-confirmed
  upload's raw object (see the Data lifecycle and deletion section above for the thumbnail's
  additional `s3:ListBucket` dependency). LL-854b1d3853 remains open pending independent
  (dual-reviewer) verification of complete media-object erasure. They are the user's own
  communication content, not a biometric identifier used for recognition.

**Accessibility**
- As an AAC tool, accessibility is core to the product. We target Web Content Accessibility
  Guidelines (WCAG) 2.1 AA and maintain a draft Accessibility Conformance Report
  (`docs/legal/ACCESSIBILITY_CONFORMANCE_REPORT.md`). On the surfaces assessed so far it rates
  Partially Supports against several criteria; the report is not yet a published, attested
  conformance statement (see also Section 3).

**Vendors and subprocessors**
- We maintain a subprocessor list and sign agreements only with vendors that actually handle our
  data. These include AWS (storage **and the receiving processor for runtime AI prompts via Amazon
  Bedrock**, BAA signed), Anthropic (**model provider only; supplies Claude via Bedrock and does not
  receive the payload**, HIPAA-ready BAA executed), Google
  Cloud Platform (live production hosting on Cloud Run, Cloud SQL, and Memorystore under the
  accepted GCP CDPA / HIPAA BAA / SCCs), Render (superseded primary host, retained temporarily as a
  write-frozen rollback fallback pending decommission), Sentry (error monitoring, configured with
  the child-data scrubber above), and HubSpot (marketing CRM and support, handling customer and
  prospect records only, no student data). When IP geolocation is enabled for registration,
  subscription, or supporter-routing context, iplocate.io receives the IP address for lookup.
  The authoritative register is `docs/legal/2026-08-16_subprocessor-register.md`, which supersedes
  `docs/legal/SUBPROCESSORS.md`; it is updated as services are enabled or retired. **Corrected
  2026-08-26:** this named the superseded file as authoritative.

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
- We keep **no dedicated diagnosis, disability, health-condition, IEP, 504, or medical column**, and
  AAC use is not a proxy for disability. The built-in eval (Section 2) does capture a coarse etiology
  category in its optional intake and produces functional-access assessment results; we treat that
  data as sensitive where it applies but do not represent it as a clinical diagnosis.

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
- **Parental re-consent at offboarding (implemented 2026-07-16).** When a district reclaims a seat,
  `Organization#remove_user` → `User#begin_family_offboarding_consents!` stamps COPPA pending for
  school-authorized / under-13 communicators (optional parent email at remove; otherwise collected
  at next login via `submit_parental_consent_email`) and resets EU under-16 AI consent/prefs.
  Full login stays blocked until a parent grants COPPA consent. **Follow-up:** export-then-delete
  if the family declines or never responds.
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
  to **parental consent**. The offboarding-to-family transition now stamps COPPA pending (and resets
  EU AI consent when applicable) via `User#begin_family_offboarding_consents!` on
  `Organization#remove_user` (both license `release_user!` and legacy detach paths). Parent email may
  be supplied at remove or at the child's next login. **Follow-up:** export-then-delete if the family
  declines (Section 4).

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
  Data Privacy Framework where applicable) is now tied to the live GCP hosting posture and vendor
  DPAs.
- **AI transparency.** EU AI Act Article 50 transparency disclosures for AI features are due
  2026-08-02 and are tracked separately (`docs/legal/EU_AI_ACT_ARTICLE_50_PLAN.md`).
- **Documents.** The detailed EU controller privacy notice for Polish families and the EU processor
  DPA with SCCs for Polish schools are drafted and held for counsel review, Polish translation, and
  the EU-representative name before use.

Special-category note: for EU purposes the primary legal basis is contract (Art. 6(1)(b)).
Special-category (Art. 9) data arises only from content a user or supervisor stores, from eval
assessment results (including the coarse etiology category) in a clinical context, or from a clinical
deployment. For a family-owned account we rely on explicit consent as the Art. 9 condition; in a
school deployment the school holds its own Art. 9 condition and LingoLinq acts as its processor on
documented instructions (Art. 28), which is not itself an Art. 9 condition. Voice recordings are the
user's own communication content under consent, not a biometric identifier (we run no voiceprint or
speaker recognition).

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
