# AI Data-Sharing Consent: Rationale and Policy

**Owner:** Privacy Office (privacy@lingolinq.com)
**Created:** 2026-07-09 (VPC Phase 2, Task 02-02.4)
**Status:** DRAFT pending Scot + counsel sign-off (Task 02-02.8 legal review checkpoint, NOT executed
as part of this commit set -- see section 7)
**Related:** `docs/legal/AI_DATA_FLOW_CLASSIFICATION.md`, `docs/legal/AI_GOVERNANCE_MEMO.md`,
`docs/legal/SUBPROCESSORS.md`, `docs/legal/DATA_RETENTION.md`, `app/views/ai_consent/disclosures/v1.html.erb`,
`lib/lingo_linq/ai_consent_disclosures.rb`, `.planning/phases/02-disclosures-content/PLAN.md`

## 1. Why this consent is separate from signup-time COPPA consent

LingoLinq already requires verifiable parental consent (or a FERPA school-official authorization,
for limited non-AI educational use) before a child under 13 can use the product at all. That
consent is NOT sufficient, on its own, to cover sending a child's data to an outside AI company.

The legal basis (per the Phase 2 plan's validation pass, 2026-06-26): the trigger for a second,
separate consent is the *disclosure of a child's personal information to a third party*, not simply
"AI is used." Under the amended COPPA Rule (16 CFR Part 312, compliance deadline 2026-04-22),
sending a child's data to a third party for AI training or inference is never treated as "integral"
to the service, so bundling it into the general signup consent does not satisfy the Rule. LingoLinq
therefore maintains two independent consent records:

- `settings['coppa']` (signup-time, general use) -- existing, Phase 0 of this project's dependency
  chain.
- `settings['ai_consent']` (this project) -- gates AI data sharing specifically, versioned against
  `LingoLinq::AiConsentDisclosures::CURRENT_VERSION`, and revocable independently of the signup
  consent.

A parent can grant the first without the second: **the child can use all of LingoLinq's non-AI
features with only the signup consent.** This is stated explicitly in the disclosure (COPPA
312.4(c)(iv)) and in the `privacy.hbs` addition in this phase.

## 2. Per-vendor sub-processor basis

This section is the load-bearing sub-processor record for the two AI vendors named in the
disclosure. It supplements, and must stay consistent with, `docs/legal/SUBPROCESSORS.md` (the
company-wide subprocessor register, maintained by the Privacy Office on its own review cadence).

### 2.1 Anthropic, PBC

- **Models used:** Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) for AI board suggestions and AI
  word prediction; Claude Opus 4.7 (`claude-opus-4-7`, overridable via `EVAL_NARRATOR_MODEL`) for
  AI evaluation narration.
- **Access path:** Anthropic's commercial API, not the free consumer Claude.ai product.
- **Data-processing basis:** DPA via Anthropic's Commercial Terms
  (https://www.anthropic.com/legal/commercial-terms), per `docs/legal/SUBPROCESSORS.md`.
- **Zero-data-retention (ZDR) status:** Confirmed for these two specific models, verified against
  Anthropic's own data-retention documentation (Anthropic Privacy Center, "Data retention practices
  for [model class]," confirmed 2026-07-06). This confirmation does **not** extend to any other
  Anthropic model not used in this product (in particular, it does not cover any future model
  Anthropic classifies outside its ZDR-eligible tier).
- **Training posture:** Anthropic does not use ZDR-tier commercial API traffic to train its models.
  This is stated in the disclosure scoped narrowly to these two models, not as a blanket claim about
  Anthropic or about AI vendors generally.
- **BAA status:** Not applicable as a HIPAA Business Associate Agreement in the traditional sense;
  the operative control for hospital-linked (HIPAA) accounts is the PiiScrubber pre-egress filter
  plus the ZDR posture above, consistent with `AI_GOVERNANCE_MEMO.md` section 3 ("de-identification,
  not a BAA, is the HIPAA basis for the scrubbed product path").

### 2.2 Google LLC (Gemini Developer API) -- conditional fallback, OPEN ITEM

- **Model used:** Gemini 2.5 Flash.
- **Access path:** Confirmed via direct code audit (`.env.example` line 92: `GEMINI_API_KEY` is
  sourced "from aistudio.google.com") to be the **Gemini Developer API** (the AI-Studio-compatible
  endpoint, `generativelanguage.googleapis.com`), **not** Google's enterprise Vertex AI path.
- **Activation:** Automatic and conditional. `lib/ai_board_generator.rb` and
  `lib/ai_word_predictor.rb` prefer Anthropic and fall back to this Gemini path only when
  `ANTHROPIC_API_KEY` is unset and `GEMINI_API_KEY` is set. Never used for AI evaluation narration
  (`lib/eval_narrator.rb` is Anthropic-only).
- **Data-processing basis:** `docs/legal/SUBPROCESSORS.md` lists a DPA via Google Cloud Terms of
  Service; the applicability of that specific DPA to the Gemini Developer/AI-Studio endpoint
  (versus Vertex AI, which is the product the Google Cloud DPA is more clearly written for) is
  **unconfirmed**.
- **Training posture:** **Unconfirmed and not disclosed as either trained-on or not-trained-on.**
  This is a real open governance item, not a new finding of this phase:
  `docs/legal/AI_GOVERNANCE_MEMO.md` section 7 already carries "Confirm Google Gemini API
  data-handling terms for the runtime fallback path, and whether any Google BAA covers it," tracked
  as `rev-gemini-baa-annual`, attested open by Scot on 2026-06-19.
- **This phase's position:** Name the vendor (it is real, live code, and the attested governance
  memo already includes it in the model inventory), but make no unconfirmed claim about its
  data-handling terms. State plainly in the disclosure that the same PiiScrubber filter applies to
  this path and that LingoLinq has not yet confirmed Google's terms for it.
- **MUST resolve before Task 02-02.8 sign-off:** one of (a) migrate this fallback to Vertex AI with
  a signed DPA, (b) obtain and confirm a Gemini Developer API business/enterprise tier with adequate
  data-handling terms, or (c) remove the fallback from the code entirely if it cannot be made
  compliant. Until resolved, a silent production change to `GEMINI_API_KEY` would make the current
  disclosure under-inclusive of vendor risk with no version bump forcing re-consent.

### 2.3 Vendors NOT used (truthfulness note)

OpenAI is not named as a vendor. Every `OpenAI::Client.new` call site in this codebase
(`lib/ai_board_generator.rb`, `lib/ai_word_predictor.rb`, `lib/ai_prediction_generator.rb`) is
configured with `uri_base: 'https://generativelanguage.googleapis.com/v1beta/openai/'`, i.e. the
`openai` gem is used purely as an OpenAI-compatible transport client aimed at Google's Gemini
endpoint. There is no code path in this product that sends data to OpenAI's actual API.

## 3. The four-bucket classification (summary; full detail in AI_DATA_FLOW_CLASSIFICATION.md)

| Bucket | Treatment |
|---|---|
| Non-personal | No second-tier gate; signup consent + feature flag suffice |
| Scrubbed personal (pseudonymized) | Conservatively personal; gated unless counsel confirms an exemption; never called "de-identified" |
| Regulated PII | Second-tier verifiable parental consent required |
| Never send externally | Blocked unless an explicit approved legal + vendor basis exists |

AI board suggestions are classified **Scrubbed-personal** (conservative default, gated pending the
open counsel question in section 7). AI word prediction and AI evaluation narration are both
classified **Regulated PII** (highest sensitivity: the child's own expressive communication content,
and clinical evaluation data, respectively) and require the second-tier consent under all
circumstances contemplated by this phase.

## 4. Versioning policy

- `LingoLinq::AiConsentDisclosures::CURRENT_VERSION` is the canonical version. A user's consent
  record (`settings['ai_consent']['disclosures_version']`) must equal `CURRENT_VERSION` for
  `User#ai_consent_granted?` to return true (Phase 1, D-03; defaulted to `CURRENT_VERSION` as of
  this phase, see the `feat(02-01.6)` commit).
- **A material change to the disclosure content bumps `CURRENT_VERSION` and forces re-consent.**
  "Material" means: a new or removed vendor, a changed data category, a changed retention window, or
  a changed training/inference posture claim. A purely cosmetic copy edit (wording, formatting) does
  not require a version bump.
- **Content-hash integrity check:** `LingoLinq::AiConsentDisclosures.metadata(version)['content_hash']`
  is a SHA256 digest of the structured metadata (vendor list, tiers, data categories, retention
  windows) for that version, not the literal rendered HTML (see the module's header comment for the
  full rationale). It changes whenever the structured facts change, independent of `CURRENT_VERSION`,
  and is intended as a mechanical signal to catch a substantive edit that was not paired with a
  version bump. It is a check, not a substitute for human review before shipping a new version.
- Each new version gets its own frozen view file (`app/views/ai_consent/disclosures/v2.html.erb`,
  etc.); prior versions are never edited in place, so a user who consented at an old version can
  still see exactly what they agreed to.

### 4.1 `es` (Spanish) is a hard gate before enforcement, not a loose follow-up

`config/locales` currently has only `en.yml`; there is no `es.yml`. The Ember-side locale JSONs
(`public/locales/es.json` and 11 others) carry auto-translated `***`-prefixed placeholder text that
has never been human-reviewed, including for the new keys added by the `privacy.hbs` edit in this
phase (`feat(02-02.1)`).

**Binding rule:** a machine-translated, unreviewed Spanish disclosure does not meet the "clearly
understandable" notice standard COPPA requires for a Spanish-speaking parent. Human-reviewed
Spanish coverage for BOTH the disclosure content (a future `config/locales/es.yml` mirroring the
`ai_consent_disclosures.v1.*` key structure in `config/locales/en.yml`) AND the `privacy.hbs`
additions (the 12 new keys in `public/locales/es.json`, currently placeholder-only) is a
**BLOCKING dependency before any enforcement is turned on for `es`-locale users** (VPC Phase 4 and
Phase 5 rollout). This is not a "nice to have" tracked loosely; it gates go-live for Spanish-locale
accounts specifically, the same way Task 02-02.8 legal sign-off gates go-live generally.

**Architecture note (a real gap, not yet solved):** the vendor names, tiers, model lists, and
training-posture sentences rendered in `v1.html.erb` come from
`LingoLinq::AiConsentDisclosures::REGISTRY` (Ruby data), not from `config/locales/en.yml`, and are
therefore English-only with no i18n routing at all today, distinct from the surrounding prose
(which does go through `t()` and can be translated). Proper names ("Anthropic," "Claude Haiku 4.5")
would not be translated regardless, but the full sentences (for example the ZDR `training_note` and
the Gemini `training_note`) currently would NOT be translated even after a human-reviewed
`config/locales/es.yml` exists, because they never reach the i18n layer. Resolving this (most likely
by moving those sentence-level fields into `config/locales/en.yml`/`es.yml` as translatable strings,
keyed by vendor, and leaving only the proper nouns and structured retention numbers in the Ruby
module) is unsolved and should be picked up before `es` enforcement, alongside the rest of this
section.

## 5. Revocation semantics

A parent (or the account holder, once old enough) can withdraw AI data-sharing consent at any time.
On revocation:

- `User#revoke_ai_consent!` (Phase 1) records the revocation; future calls to
  `ai_consent_granted?` return false for that account.
- LingoLinq stops sending any further data from that account to any AI vendor for board
  suggestions, word prediction, or evaluation narration (wiring the actual call-site hard-fail is
  VPC Phase 4; this phase documents the intended behavior the disclosure describes).
- Revocation **cannot** retract or delete anything already sent to a vendor before the withdrawal.
  Under Anthropic's ZDR terms, already-sent data is not retained by Anthropic beyond serving the
  original request, which is the practical mitigation for this limitation, but LingoLinq cannot
  compel deletion of a response already returned and possibly cached client-side.
- Every other part of LingoLinq (boards, sync, messaging, non-AI features) continues to work
  normally after revocation.

## 6. The school/FERPA-authorized pathway

Mirrors the live policy language at `privacy.hbs` (`privacy_special_coppa_v2`, unchanged by this
phase): LingoLinq accepts a FERPA school-official authorization **in place of** direct parental
consent only for limited, school-curriculum use with **no AI features, no profiling, and no
advertising**. A school-official authorization does **not** cover AI data sharing. Any use of AI
board suggestions, AI word prediction, or AI-drafted evaluation narration by a child under 13
requires verifiable parental consent under 16 CFR Part 312, regardless of school enrollment. This
is a hard boundary: a school cannot authorize a child's data going to an AI vendor on a parent's
behalf.

## 7. Open counsel questions (block Task 02-02.8 sign-off)

These two questions are unresolved and are explicitly why the Task 02-02.8 legal review checkpoint
is NOT executed as part of this commit set. They require Scot + counsel, not an engineering
decision:

1. **Can scrubbed, neutral AI board generation ever be treated as Non-personal (exempt from the
   second-tier gate), or must it always stay in the Scrubbed-personal (gated) bucket?** The
   conservative default in this document and in `AI_DATA_FLOW_CLASSIFICATION.md` is: always gated,
   no exemption, until counsel confirms otherwise. A parent or SLP can still type identifying detail
   into a free-text board topic (e.g. "board for Aiden's IEP meeting"), so the code does not
   structurally prevent personal content from entering this feature.
2. **Which verifiable-parental-consent method satisfies COPPA for this specific disclosure (AI
   data sharing to a third party)?** Email-plus / text-plus methods, which the existing
   `parental_consents_controller.rb` flow was modeled on, are explicitly excluded by the amended
   COPPA Rule for third-party disclosure consent. The gated features need a stronger method (for
   example: knowledge-based authentication, a credit-card transaction, or a government-ID match).
   **This phase's copy stays method-agnostic on purpose** ("using the method described in your
   consent request") and does not imply a one-click email link suffices. See section 8 for the
   cross-phase escalation this creates for VPC Phase 3.

## 8. Cross-phase escalation: Phase 3 consent-method pre-decision (HIGH priority)

Recorded here, and in this plan's SUMMARY.md, per the Phase 2 task instructions (STATE.md is
updated centrally by the orchestrator, not by this phase's execution).

**Finding:** VPC Phase 3 ("Parent UX") was modeled on the existing email-link parental-consent flow
(`parental_consents_controller.rb`). Per the amended COPPA Rule, email-plus and text-plus consent
methods are **not adequate** to consent to third-party disclosure, which is exactly what granting AI
data-sharing consent is. Building Phase 3 UX around a one-click email link, without first deciding
question 2 in section 7 above, risks shipping a consent flow whose grants are legally invalid --
"a perfect versioned disclosure gating an invalidly-obtained consent protects nothing."

**Action required before VPC Phase 3 begins implementation:** Scot decides the verifiable-consent
method for the AI-data-sharing gate specifically (distinct from the existing signup-time COPPA
consent method, which is unaffected). This phase's disclosure copy is deliberately written to be
compatible with any outcome of that decision.

## 8.1 No-regress guards (binding acceptance criteria for Phase 2 and Phase 4)

Two invariants were already correct on `staging` before this phase, and Phase 2 and Phase 4 work
must not regress them. Both already have executable RSpec coverage; this phase adds no new
duplicate tests for them, but records the existing coverage here so it is not accidentally deleted
or weakened later:

1. **`Api::BoardsController` threads `user:` into `AiBoardGenerator.generate_words`**, so the
   per-user COPPA gate, org-level `disable_ai_features` opt-out, and `AiApiLog` audit attribution
   all apply to AI board generation requests. Covered by
   `spec/controllers/api/boards_controller_spec.rb`, `describe "generate_labels"`, the example
   "should pass the authenticated user through to the generator" (asserts `captured[:user]` is
   present and matches the authenticated user).
2. **`AiApiLog` scrubs BOTH `request_summary` and `response_summary`** via
   `before_validation :scrub_summary_columns` (`app/models/ai_api_log.rb`), so a vendor response
   that echoes an identifier from the prompt does not leak into the audit log. Covered extensively
   by `spec/models/ai_api_log_spec.rb` (email, SSN, and already-redacted-value cases for both
   columns).

Codex's outside review of an earlier draft of this plan flagged both of these as potential gaps,
based on a stale `main`-branch read; both are confirmed fixed on `staging` (this phase's branch
point, commit `c595f6304a545a6a10de80924edd99951eb41aa5`) by direct inspection of the specs above.

## 9. Attestation

| Field | Value |
|---|---|
| Prepared by | Claude Code (GSD plan executor), VPC Phase 2 |
| Status | DRAFT -- Task 02-02.8 legal review checkpoint NOT executed |
| Reviewed by | Not yet reviewed |
| Attested by | **Pending Scot + counsel sign-off** |
| Attestation date | Not yet attested |

This document, `AI_DATA_FLOW_CLASSIFICATION.md`, `app/views/ai_consent/disclosures/v1.html.erb`,
and the `privacy.hbs` edits in this phase are all DRAFT pending the same sign-off. None of them
should be treated as a final, counsel-approved legal position until Task 02-02.8 is explicitly
completed by Scot and counsel.
