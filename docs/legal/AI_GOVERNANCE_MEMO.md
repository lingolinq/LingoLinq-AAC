# LingoLinq AAC AI Governance Memo

> **ATTESTED 2026-06-19 by Scot Wahlquist, CEO.** Phase 3 deliverable. This memo documents how
> LingoLinq uses AI models, the controls that keep identifiable data out of external models, and
> the EU AI Act classification analysis. It is a living document; model ids and code citations are
> point-in-time and were re-verified against live code on 2026-06-19 prior to attestation (see the
> note at section 8). Drafted by the compliance-officer; adversary-reviewed; attested by the CEO.
> One governance item (the DeepSeek-vs-compliance-surface discrepancy, section 4.1) was
> documented-open at the 2026-06-19 attestation and was RESOLVED on 2026-07-12 by Scot's
> ratified two-tier AI data-routing policy (see section 4.1: the bot already skips DeepSeek on
> compliance-path diffs; the policy reframes that skip as a permitted confidentiality preference,
> not a hard mandate). This resolution post-dates the attestation and should be re-attested
> (section 8) at the next memo refresh.
>
> Draft date: 2026-06-13. Refreshed 2026-06-18 (eval narration added to the inventory after
> #411/#412/#413; DeepSeek-on-compliance-surface discrepancy flagged in section 4). Re-verified
> and attested 2026-06-19. Refreshed 2026-07-12 (section 4.1 discrepancy resolved via Scot's
> ratified two-tier AI data-routing policy; re-attestation pending). Operative reference: NIST AI RMF plus the Generative AI Profile
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
| Word/phrase prediction (runtime) | Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) only -- Gemini fallback disabled 2026-07-09 | `lib/ai_word_predictor.rb` | Yes, but **scrubbed first** | Every sentence passes `PiiScrubber.redact_for_ai` before the call (line 55); each call logged to `AiApiLog`. Feature-flag gated, COPPA hard block for under-13. `ANTHROPIC_API_KEY` is now required; there is no automatic fallback provider. |
| Offline prediction dictionary generation | Claude Haiku 4.5 only -- Gemini fallback disabled 2026-07-09 | `lib/ai_prediction_generator.rb` | No | Offline batch job; sends only static word lists, never user sentences or identifiers. |
| Comprehensive eval narration (runtime, product) | Claude Opus 4.7 (`claude-opus-4-7` default, `EVAL_NARRATOR_MODEL` override), Anthropic | `lib/eval_narrator.rb`, `app/controllers/api/eval_sessions_controller.rb` | Yes, but **scrubbed first** | `PiiScrubber.redact_for_ai` on the payload before egress; every call logged to `AiApiLog`; COPPA hard block (`FeatureFlags.coppa_blocks_ai_for?`) for under-13; external narration is opt-in and the egress payload is bound to the server-resolved user (client-asserted student name dropped); org opt-out via the `comprehensive_eval_ai` feature flag. Residual consent-binding gap tracked as LL-11db0dc848. Brought under governance by #411/#412; three findings verified-closed in #413. |
| Developer code review (internal tooling, not product) | Opus 4.8 (Claude); DeepSeek-V3.2 via OpenRouter (secondary) | dev workflow (`/review-pr`, codex) | No | Sanitized diffs only; no student or patient data. OpenRouter has no BAA and runs ZDR; the PiiScrubber-equivalent here is the no-PHI-in-diffs rule. PII-free compliance *documents* (the audit register: status/severity/IDs, code/path evidence) are **Tier 2** and may be reviewed; the boundary is data-bearing content (fixtures/seeds/cassettes/etc.), enforced by `codex-review-guard.sh`, not the compliance-surface label. See section 4.1 (resolved 2026-07-12). |

Notes:
- The runtime path's **Google Gemini** fallback was **disabled 2026-07-09** (`GEMINI_API_KEY`
  fallback removed from `lib/ai_word_predictor.rb`, `lib/ai_prediction_generator.rb`, and
  `lib/ai_board_generator.rb`; historical record in `docs/legal/AI_DATA_SHARING_CONSENT.md`
  section 2.2). `rev-gemini-baa-annual` on the compliance calendar is retained as a reactivation
  gate, not a live runtime concern (section 7).
- No persistent or autonomous AI agent runs against production user data. Prediction is
  request-scoped and stateless beyond logging.
- **No Anthropic "Covered Model" is ZDR-eligible; none may ever carry identifiable student or
  patient data.** Anthropic requires 30-day retention on its designated "Covered Models" for
  safety review, overriding any org-wide zero-data-retention agreement (confirmed 2026-07-06
  against Anthropic's own Privacy Center: [Data retention practices for Mythos-class models](https://privacy.claude.com/en/articles/15425996-data-retention-practices-for-mythos-class-models)).
  The Covered Models designated as of this writing are Fable 5 and Mythos 5, but the category is
  defined by Anthropic and expands whenever Anthropic designates a new one, so this control is
  written against the category, not the two current names. It applies specifically to the
  `EVAL_NARRATOR_MODEL` override in `lib/eval_narrator.rb:102` (default `claude-opus-4-7`,
  env-overridable) and to any other model-override env var: none may ever be pointed at any
  Anthropic Covered Model, current or future-designated. Before repointing any model-override
  env var at a new Anthropic model, confirm it is not a Covered Model against the Privacy Center
  page above. The current runtime AI inventory (Claude Haiku 4.5, Claude Opus 4.7) is unaffected
  and remains ZDR-eligible.

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
- **Pseudonymization (the scrubber) is a risk-reduction control, not a HIPAA safe harbor -- and
  no signed BAA currently covers the model-provider egress path.** The scrubber removes direct
  identifiers before the call, but the result is **pseudonymized, not de-identified**: it does
  not meet HIPAA Safe Harbor (removal of all 18 identifier categories) or Expert Determination,
  and under GDPR/UK-GDPR pseudonymized data is still personal data. The AWS BAA on file
  (2026-02) covers AWS infrastructure (S3, KMS, RDS) -- it does **not** extend to Anthropic or
  Google as model providers, and neither currently has a signed BAA with LingoLinq (see
  `docs/legal/AI_DATA_SHARING_CONSENT.md` section 2). For hospital/PHI data, the scrubber is
  therefore the only technical control on the model-call path today; a defensible HIPAA position
  for that path requires either a signed BAA with the actual model provider receiving the call,
  or no hospital/PHI egress to that provider at all. This is a real open gap, not fully closed
  by the scrubber alone.
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
- This is why the developer reviewer is restricted to sanitized diffs and is barred from
  identifiable and data-bearing content. PII-free compliance *documents* (the audit register)
  are Tier 2 and may be reviewed; the boundary is data-bearing content, enforced by
  `codex-review-guard.sh` (see section 4.1, resolved 2026-07-12).

### 4.1 RESOLVED (2026-07-12): DeepSeek and the audit register

**Status: RESOLVED 2026-07-12 by Scot's ratified two-tier AI data-routing policy. This resolution
post-dates the 2026-06-19 attestation and should be re-attested (section 8) at the next memo
refresh.**

**Historical discrepancy** (documented-open at the 2026-06-19 attestation): this memo stated that
the DeepSeek/OpenRouter reviewer is "never used on any compliance surface," but at that time the
n8n PR-review bot (workflow `lbyA52atQjQ8MCqy`) ran a DeepSeek adversary pass on **every** PR
diff, and recent compliance PRs (#413 register reconcile, #415 register re-stamp) were
register-only diffs. The register carries no student or patient data and the diffs were code and
JSON only, so no PHI or student data left the boundary, but a register-only diff **is** a
compliance surface, so as worded the policy and the running automation disagreed.

**Current behavior** (as of this memo refresh): the n8n PR-review bot now **skips** the DeepSeek
adversary pass when a PR touches `docs/legal/**` or `audit-reports/**`; only the Claude senior-dev
pass reviews the change. (This PR, #593, is an example: its sticky bot comment records the
DeepSeek pass skipped as a compliance-path diff.) So the running automation no longer sends
compliance-path diffs to the no-BAA OpenRouter endpoint. This implemented the old "fix the bot"
option.

**New policy** (the two-tier model): the canonical two-tier AI data-routing policy
(`instructions/shared/compliance.md` in the ai-company-brain) makes routing turn on whether user
data can be in the stream, not on the compliance-surface label. Tier 1 (runtime / user-data
paths) stays on BAA/ZDR-verified models. Tier 2 (code diffs, CI output, and PII-free compliance
documents) **permits** any approved reviewer -- a DeepSeek or Codex pass included -- but does
**not require** one. The hard boundary (no identifiable or data-bearing content on a no-BAA
route) is enforced by `scripts/codex-review-guard.sh`, which blocks fixtures / seeds / factories /
migrations / cassettes / data dumps, NOT `audit-reports/**` or `docs/legal/**`.

**Net effect:** the current bot skip on compliance-path diffs is now a permitted **confidentiality
preference**, not a policy requirement. Either running or skipping an approved reviewer on a
PII-free compliance document is compliant. (Follow-up, out of scope for this memo: the bot's
skip-reason comment still frames the skip as a hard "Claude-only" rule; it could be reworded to
"confidentiality preference" to match this policy.)

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

- [ ] `rev-gemini-baa-annual` (Google Gemini API data-handling terms/BAA) is now a
      **reactivation gate** rather than a live runtime item: the Gemini fallback was disabled
      2026-07-09. Resolve before any future PR re-enables `GEMINI_API_KEY` fallback.
- [ ] **New, raised by Codex review of PR #579:** no signed BAA currently covers the Anthropic
      or Google model-provider egress path (the AWS BAA on file covers infrastructure only).
      Decide whether to pursue a BAA with Anthropic, restrict hospital/PHI accounts from the AI
      features entirely, or accept the scrubber-only risk-reduction posture as sufficient --
      Scot's call, do not self-resolve.
- [ ] Per-feature data-flow documentation for each of the AI-gated features (feature flags
      enumerate the surface; the data-flow docs are the gap).
- [ ] Vendor terms on file for every model provider in the inventory (Anthropic, Google,
      OpenRouter), with renewal tracking.
- [ ] Finalize the Article 50 applicability decision before 2026-08-02.
- [ ] Model inventory kept current as models are upgraded (the ids above are point-in-time).
- [ ] Resolve the eval-narration consent-binding residual (LL-11db0dc848): bind the COPPA/consent
      gate subject to the eval content actually egressed, via server-side eval persistence
      (migration follow-up Phase 1B). Until then the control gates on a caller-asserted user_id.
- [x] Resolve the DeepSeek-vs-compliance-surface discrepancy in section 4.1: RESOLVED 2026-07-12
      via Scot's ratified two-tier policy (Option 2 -- PII-free compliance documents are Tier 2).
      Follow-up: re-attest the memo (section 8) to cover this post-attestation resolution.

## 8. Attestation

| Field | Value |
|---|---|
| Prepared by | compliance-officer agent (draft) |
| Reviewed by | adversary agent |
| Attested by | **Scot Wahlquist, CEO** |
| Attestation date | **2026-06-19** |

_Phase 3 deliverable of the Audit/Compliance System Modernization (plan section 6, sections 1.3
and 1.8). Model ids and code citations were re-verified against live code on 2026-06-19 prior to
attestation (confirmed: `claude-haiku-4-5-20251001`, `gemini-2.5-flash`, `claude-opus-4-7` with
the `EVAL_NARRATOR_MODEL` override; `PiiScrubber.redact_for_ai` at `lib/ai_word_predictor.rb:55`;
LL-11db0dc848 and LL-6619cc1811 open). They remain point-in-time and must be re-verified at each
future publish._

_Amended 2026-07-08: added an Anthropic "Covered Model" ZDR-exclusion guardrail note to section
2 (model inventory), written against the Covered-Model category (Fable 5 / Mythos 5 today, plus
any Anthropic later designates) rather than the two current names. This is non-substantive
preventive-control documentation; it does not alter
the attested scope, controls, or claims, so no full re-attestation is required per the
living-document policy in the header. The new code citation (`lib/eval_narrator.rb:102`,
`EVAL_NARRATOR_MODEL` override) was re-verified against live code on 2026-07-08._

_Amended 2026-07-11: corrected two stale claims surfaced by Codex review of PR #579. (1) The
model inventory (section 2) and its notes no longer list Google Gemini as an active runtime
fallback -- the `GEMINI_API_KEY` fallback was disabled 2026-07-09 across
`lib/ai_word_predictor.rb`, `lib/ai_prediction_generator.rb`, and `lib/ai_board_generator.rb`
(historical record: `docs/legal/AI_DATA_SHARING_CONSENT.md` section 2.2); `rev-gemini-baa-annual`
is reframed as a reactivation gate in section 7. (2) Section 3's HIPAA-basis wording is
corrected: the AWS BAA on file covers AWS infrastructure only, not Anthropic or Google as model
providers, and neither has a signed BAA with LingoLinq today -- the scrubber is a risk-reduction
control on that path, not a safe harbor and not BAA-backed. **This second correction changes the
memo's HIPAA-defensibility conclusion for the model-call path and has not yet been re-attested by
Scot** -- treat section 3 as provisional pending his review, per the same governance the memo
requires of every other open item (section 6: AI drafts and flags, humans attest and accept
risk)._
