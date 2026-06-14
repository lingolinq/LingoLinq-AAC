# LingoLinq AAC AI Governance Memo

> **DRAFT, awaiting attestation.** Phase 3 deliverable. This memo documents how LingoLinq uses
> AI models, the controls that keep identifiable data out of external models, and the EU AI Act
> classification analysis. It is a living document. Every model id and code citation must be
> re-verified against live code before this memo is shared externally. Drafted by the
> compliance-officer; goes through adversary review before reaching Scot.
>
> Draft date: 2026-06-13. Operative reference: NIST AI RMF plus the Generative AI Profile
> (NIST AI 600-1). ISO 42001 certification is not yet a small-vendor expectation and is out of
> scope for now.

## 1. Purpose

LingoLinq is an AI-first AAC tool. AI assists communication (word and phrase prediction) for
people who use the product to speak, including under-13 users, students, and patients. Because
of who relies on it and the data it touches, AI use is governed, not ad hoc. This memo records
the model inventory, the data-handling controls, the human-oversight points, and the regulatory
classification, so that an auditor or a district procurement reviewer can see substantiated
practice rather than a capability claim.

## 2. Model inventory

Verified against code at draft time. Re-verify before publishing.

| Use | Model(s) | Where | Sees user data? | Control |
|---|---|---|---|---|
| Word/phrase prediction (runtime) | Claude Haiku 4.5 (`claude-haiku-4-5-20251001`), Gemini 2.0 Flash fallback | `lib/ai_word_predictor.rb` | Yes, but **scrubbed first** | Every sentence passes `PiiScrubber.redact_for_ai` before the call (line 55); each call logged to `AiApiLog`. Feature-flag gated, COPPA hard block for under-13. |
| Offline prediction dictionary generation | Claude Haiku 4.5, Gemini 2.0 Flash | `lib/ai_prediction_generator.rb` | No | Offline batch job; sends only static word lists, never user sentences or identifiers. |
| Developer code review (internal tooling, not product) | Opus 4.8 (Claude); DeepSeek-V3.2 via OpenRouter (secondary) | dev workflow (`/review-pr`, codex) | No | Sanitized diffs only; no student or patient data. OpenRouter has no BAA and runs ZDR; the PiiScrubber-equivalent here is the no-PHI-in-diffs rule. Never used on any compliance surface. |

Notes:
- The runtime path can call **Google Gemini** as a fallback. Gemini API data-handling terms and
  any Google BAA coverage for that path are tracked on the compliance calendar
  (`rev-gemini-baa-annual`; section 7).
- No persistent or autonomous AI agent runs against production user data. Prediction is
  request-scoped and stateless beyond logging.

### 2.1 COPPA and under-13 AI training disclosure

LingoLinq serves under-13 users. The amended COPPA Rule (compliance deadline **2026-04-22**,
now passed and enforceable) requires **separate verifiable parental consent** for any disclosure
of children's personal information that is not integral to the service, **explicitly including
using children's data to train AI models**.

Current posture (verify at publish time):
- Runtime word prediction is feature-flag gated with a **COPPA hard block for under-13** in
  `lib/ai_word_predictor.rb`, so the external-model path should not run for child accounts.
- Any future change that sends children's data to an external model for training, fine-tuning, or
  feedback loops requires a new consent flow and a calendar update before shipping.
- Quarterly verification is tracked as `rev-coppa-retention-quarterly` and linked from fixed date
  `fix-coppa-2026-04-22`.

## 3. The data-handling backstop: no identifiable data to external models

The governing rule is simple and enforced in code, not just in policy:

> No identifiable student or patient data is sent to any third-party model that lacks a signed
> BAA. The `PiiScrubber` is the real backstop.

- **`lib/pii_scrubber.rb`** redacts identity keys and applies a blocklist before any external
  model call. The runtime predictor invokes it on the user sentence prior to the API request.
- **De-identification, not a BAA, is the HIPAA basis for the scrubbed product path.** Because
  identifiers are removed before the call, the defensible position for hospital data is
  de-identification (HIPAA Safe Harbor style), with the scrubber as the enforced control. Where
  a BAA exists (AWS, on file 2026-02), it adds coverage; where one does not, the scrubber is
  what keeps the path defensible.
- **`AiApiLog`** records external model calls for audit. **`AuditEvent`** records privileged
  console access.

## 4. Zero data retention is a privacy control, not a legal one

The OpenRouter route used by the developer code reviewer runs with zero data retention (ZDR).
The stance LingoLinq takes, and that this memo records:

- ZDR is a privacy control. It is **not** a Business Associate Agreement and does not substitute
  for one. OpenRouter has no HIPAA BAA.
- ZDR is operator-maintained and unenforceable from configuration. It can lapse on a key
  rotation or an account change with no signal. For that reason it is re-verified on a calendar
  cadence and after every key rotation (compliance calendar item `rev-zdr-reverify-on-rotation`),
  and it is **never** the only thing standing between user data and an external model. The
  no-PHI-in-diffs rule, and for the product path the PiiScrubber, are the real controls.
- This is why the developer reviewer is restricted to sanitized diffs and is barred from every
  audit and compliance surface.

## 5. EU AI Act classification memo

### 5.1 Annex III (high-risk) classification

**Position: the AAC word predictor is plausibly NOT a high-risk system under Annex III.** This
is a documented analysis, not an assumption.

- Annex III point 3 (education) covers systems that determine admission, assess learning
  outcomes, or proctor. The LingoLinq predictor does none of these. It suggests words and
  phrases to help a person communicate; it does not gate education access, grade, or monitor.
- High-risk obligations for Annex III systems were deferred to 2027-12-02 by the May-2026
  Digital Omnibus, which gives time to revisit if product scope changes.
- **Trigger to revisit:** if the product moves toward education-gating functions (assessment,
  admission, proctoring, or outcome scoring), re-run this classification before shipping.

### 5.2 Article 50 transparency plan (action before 2026-08-02)

Article 50 transparency obligations apply from **2026-08-02** and are not limited to high-risk
systems. They cover disclosing AI interaction to users and labeling synthetic or AI-generated
content. For systems already on the market, the machine-readable marking requirement under
Article 50(2) has a grace period to **2026-12-02** (Digital Omnibus).

Plan before 2026-08-02:
1. Decide whether the AAC predictor's output meets the synthetic-content marking trigger. A
   word suggestion that the user selects and speaks is arguably the user's own communication,
   not machine-generated content presented as fact. Document this analysis.
2. Implement any required user-facing disclosure that the prediction feature is AI assisted,
   for EU-facing deployments.
3. If marking is deemed required, resolve it before the 2026-12-02 grace date.

This is tracked on the compliance calendar (`fix-euaiact-art50-2026-08-02`).

## 6. Human oversight

- AI drafts, collects, and flags. Humans review, attest, accept risk, and sign. No AI closes a
  compliance finding, downgrades severity, or accepts risk.
- The product predictor never auto-sends or auto-acts; the user always selects what to say.
- Customer-facing compliance artifacts (this memo, the Posture Report, the ACR) are AI-drafted
  and human-attested, never published on an AI decision.

## 7. Open governance items (to resolve)

- [ ] Confirm Google Gemini API data-handling terms for the runtime fallback path, and whether
      any Google BAA covers it (`rev-gemini-baa-annual` on the compliance calendar). Until
      resolved, the PiiScrubber is the controlling backstop.
- [ ] Per-feature data-flow documentation for each of the AI-gated features (feature flags
      enumerate the surface; the data-flow docs are the gap).
- [ ] Vendor terms on file for every model provider in the inventory (Anthropic, Google,
      OpenRouter), with renewal tracking.
- [ ] Finalize the Article 50 applicability decision before 2026-08-02.
- [ ] Model inventory kept current as models are upgraded (the ids above are point-in-time).

## 8. Attestation

| Field | Value |
|---|---|
| Prepared by | compliance-officer agent (draft) |
| Reviewed by | adversary agent (pending) |
| Attested by | _Scot Wahlquist (pending signature)_ |
| Attestation date | _pending_ |

_Phase 3 deliverable of the Audit/Compliance System Modernization (plan section 6, sections 1.3
and 1.8). Model ids and code citations are point-in-time and must be re-verified at publish._
