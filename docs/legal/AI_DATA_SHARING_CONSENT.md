# AI Data-Sharing Consent: Rationale and Policy

**Owner:** Privacy Office (privacy@lingolinq.com)
**Created:** 2026-07-09 (VPC Phase 2, Task 02-02.4)
**Status:** Attested by Scot Wahlquist, CEO, 2026-07-09 as a provisional, conservative-default
position (Task 02-02.8); **re-attested 2026-08-04**. Formal outside counsel review is deferred
until the full 5-phase VPC is built and ready for real parents -- see section 9. Not yet reviewed
by outside counsel.
**Attestation history:** first attested (provisional) 2026-07-09; re-attested 2026-08-04. The
**2026-08-04** re-attestation covers the zero-data-retention and training-posture bullets, which
were narrowed to apply only to the direct `api.anthropic.com` path and now expressly disclaim any
ZDR guarantee for the AWS Bedrock route that runtime AI actually uses. That narrows a previously
broader retention representation and aligns this consent record with the shipped runtime
disclosure.
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

- **Models used:** Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) for AI word prediction (also
  used for AI board suggestions, which are Non-personal and not gated by this consent -- see
  section 3); Claude Opus 4.7 (`claude-opus-4-7`, overridable via `EVAL_NARRATOR_MODEL`) for
  AI evaluation narration.
- **Access path:** Anthropic Claude models on **AWS Bedrock** via `lib/ai_client.rb` (default plane:
  classic `bedrock-runtime`; Mantle selectable via `BEDROCK_PLANE` when entitled), never the free
  consumer Claude.ai product. **Corrected 2026-08-02:** this previously read "Anthropic's commercial
  API"; the direct `api.anthropic.com` route was removed by PR #681 and is CI-enforced.
  **Plane wording corrected 2026-08-03:** earlier text said "Bedrock Mantle Messages API" only; the
  account is entitled to classic `bedrock-runtime` (PR #727).
  **Operational status, corrected 2026-08-04 (supersedes the "dormant as of 2026-07-30" statement
  this bullet previously carried).** The Bedrock path was not operational from 2026-07-30T16:37Z
  (revision `00011-l7f`) until 2026-08-03T08:23:02Z, when revision `00013-76w` mounted
  `BEDROCK_AWS_KEY` / `BEDROCK_AWS_SECRET`. It was then operational for approximately 22 hours.
  Exactly one logged seam call completed in that window: an internal verification call on 2026-08-04T05:44:42Z
  (`request_type: word_prediction`, no user attached, no user or student data in the payload),
  recorded as the first and only row in `AiApiLog`. Credentials were withdrawn on
  2026-08-04T06:31:46Z (revision `00014-5rw`); the path is not operational as of that timestamp.
  During the window, `sts:GetCallerIdentity` under the mounted credential returned account
  239044785114 (`user/lingolinq-bedrock-runtime`), satisfying both halves of the verification
  standard defined in `docs/legal/AWS_BAA_ACCEPTED.md`. This statement is scoped to the Bedrock
  path only; see the `AiApiLog` coverage note in that document for what a zero-row result does and
  does not establish.
- **Data-processing basis:** the **AWS account BAA** (2026-02-07, account 2390-4478-5114) governs
  the Bedrock path, since Bedrock inference stays inside AWS's HIPAA-eligible service boundary. The
  executed **Anthropic HIPAA-Ready BAA** (2026-07-18, `docs/legal/ANTHROPIC_BAA_ACCEPTED.md`) covers
  the direct Anthropic path and remains on file. **Corrected 2026-08-02:** this previously cited a
  DPA under Anthropic's Commercial Terms, which the 2026-07-18 BAA superseded. See
  `docs/legal/SUBPROCESSORS.md`.
- **Zero-data-retention (ZDR) status:** **Scoped 2026-08-04. This confirmation applies to the direct
  `api.anthropic.com` path, which is NOT the runtime route.** ZDR was confirmed for these two
  specific models against Anthropic's own data-retention documentation (Anthropic Privacy Center,
  "Data retention practices for [model class]," confirmed 2026-07-06). That confirmation was made
  under Anthropic's **commercial API** terms. The designated runtime route is Anthropic Claude on
  **AWS Bedrock**, where request handling is governed by the AWS account BAA and AWS's own service
  terms, not by Anthropic's commercial-API ZDR tier. **No zero-data-retention guarantee is claimed
  for the Bedrock path**, which is consistent with the shipped runtime disclosure
  (`app/frontend/app/templates/privacy.hbs` and `lib/lingo_linq/ai_consent_disclosures.rb`). The
  confirmation also does **not** extend to any other Anthropic model not used in this product (in
  particular, any future model Anthropic classifies outside its ZDR-eligible tier).
- **Training posture:** Anthropic does not use ZDR-tier **commercial API** traffic to train its
  models. **Scoped 2026-08-04:** this statement is about the direct Anthropic commercial-API path
  and is narrow to these two models; it is not a claim about the AWS Bedrock route, nor a blanket
  claim about Anthropic or about AI vendors generally. Training and retention posture for the
  Bedrock route is governed by the AWS terms referenced in `docs/legal/AWS_BAA_ACCEPTED.md`.
- **BAA status:** **Corrected 2026-08-02.** This bullet previously read "Not applicable as a HIPAA
  Business Associate Agreement in the traditional sense", with the PiiScrubber and ZDR posture named
  as the operative HIPAA control, and quoted `AI_GOVERNANCE_MEMO.md` section 3 for
  "de-identification, not a BAA, is the HIPAA basis". That is stale on both counts. An **Anthropic
  HIPAA-Ready BAA was executed 2026-07-18** on the runtime-dedicated LingoLinq, LLC API org
  (`docs/legal/ANTHROPIC_BAA_ACCEPTED.md`), and the memo language quoted above no longer exists:
  section 3 now records that the HIPAA legal basis for the Anthropic path rests on that BAA and that
  the prior "no signed BAA covers the model-provider egress path" gap is closed. The PiiScrubber is
  retained as a GDPR data-minimization control and as defense in depth, **not** as the HIPAA basis.
  For the Bedrock route the governing instrument is the **AWS account BAA** instead, as stated in
  the Data-processing basis bullet above.

### 2.2 Google LLC (Gemini Developer API) -- disabled 2026-07-09, historical record only

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
- **Resolved 2026-07-09 (Scot):** option (c). The fallback is disabled in code
  (`scot/compliance/disable-gemini-ai-studio-fallback`, PR #570) -- `resolve_api_config` in all
  three files no longer returns a `:gemini` config, so AI board generation, word prediction, and
  the offline prediction-dictionary generator all fail closed to Anthropic-only. A Vertex AI
  fallback with a signed DPA (option a) may replace this in a future change; option (b) was not
  pursued. **This vendor entry has been removed from `LingoLinq::AiConsentDisclosures::REGISTRY`
  and `app/views/ai_consent/disclosures/v1.html.erb` in this same commit set** (v1 had not shipped
  to any real parent yet, so no `CURRENT_VERSION` bump / forced re-consent was needed to make this
  correction -- see the module's versioning-policy comment in section 4 below for when a bump IS
  required going forward).

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

**AI board suggestions are classified Non-personal (reclassified 2026-07-09, Scot)** -- not gated
by this consent. Typical usage (a topic prompt like "the zoo") contains no personal information
about the child, and `PiiScrubber` was hardened with a common first-name gazetteer
(`PiiScrubber::COMMON_FIRST_NAMES`) specifically to close the residual risk of a name entered into
that free-text field. Full rationale, the scope of what the hardened scrubber does and does not
catch, and the residual-risk acceptance are in `AI_DATA_FLOW_CLASSIFICATION.md` section 4.2 -- this
was the conservative default in the original 2026-06-26 plan validation and stayed that way until
this reclassification; it is not the plan's original position. AI word prediction and AI evaluation
narration are both classified **Regulated PII** (highest sensitivity: the child's own expressive
communication content, and clinical evaluation data, respectively) and require the second-tier
consent under all circumstances contemplated by this phase.

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
accounts specifically, independent of Task 02-02.8 (resolved, see section 9) -- `es` is its own
open gate, not covered by the English-language provisional attestation.

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

## 7. Open questions -- resolved 2026-07-09 by Scot's provisional attestation

These two questions blocked Task 02-02.8. Per Scot's 2026-07-09 decision, they are resolved by his
own business-risk judgment as a **provisional** position, not by outside counsel. Formal counsel
review, if engaged at all, happens once the full 5-phase VPC is built and ready for real parents
(see section 9) -- this is consistent with how `AI_GOVERNANCE_MEMO.md`'s open items are already
tracked and accepted without outside counsel involvement at this stage.

1. **Can scrubbed, neutral AI board generation ever be treated as Non-personal (exempt from the
   second-tier gate), or must it always stay in the Scrubbed-personal (gated) bucket?**
   **Initially resolved (provisional, same session): stays gated, no exemption**, on the theory
   that a parent or SLP could still type identifying detail into the free-text board topic (e.g.
   "board for Aiden's IEP meeting") and the pre-2026-07-09 scrubber could not reliably catch an
   arbitrary name.
   **Superseded later the same day: reclassified Non-personal.** Scot's follow-up challenge was
   direct -- COPPA's trigger is disclosure of personal information, not "AI is used," and typical
   board-gen usage ("the zoo," "fox in sox") contains no personal information at all, so gating the
   whole feature regardless of content was broader than the legal trigger requires. Rather than
   reclassify on the existing scrubber's coverage, `PiiScrubber` was hardened first (a ~1,656-entry
   common first-name gazetteer, `PiiScrubber::COMMON_FIRST_NAMES`, sourced from public-domain SSA
   baby-name data, added to the AI-egress path), THEN board generation was reclassified
   Non-personal. See `AI_DATA_FLOW_CLASSIFICATION.md` section 4.2 for the full rationale, what the
   hardened scrubber does and does not catch (first names only; not last names, addresses, or
   school names), and the residual-risk acceptance. This is the CURRENT, final position -- section 3
   above reflects it.
2. **Which verifiable-parental-consent method satisfies COPPA for this specific disclosure (AI
   data sharing to a third party)?** Email-plus / text-plus methods, which the existing
   `parental_consents_controller.rb` flow was modeled on, are explicitly excluded by the amended
   COPPA Rule for third-party disclosure consent.
   **Resolved: government-ID match.** See section 8.

## 8. Phase 3 consent-method decision: government-ID match (resolved 2026-07-09)

**Finding:** VPC Phase 3 ("Parent UX") was modeled on the existing email-link parental-consent flow
(`parental_consents_controller.rb`). Per the amended COPPA Rule, email-plus and text-plus consent
methods are **not adequate** to consent to third-party disclosure, which is exactly what granting AI
data-sharing consent is. Building Phase 3 UX around a one-click email link would have risked shipping
a consent flow whose grants are legally invalid -- "a perfect versioned disclosure gating an
invalidly-obtained consent protects nothing."

**Decision (Scot, 2026-07-09): government-ID match.** Phase 3 builds a verifiable-parental-consent
flow around a government-issued-ID match for the AI-data-sharing gate specifically (distinct from
the existing signup-time COPPA consent method, which is unaffected and stays email-based). This
phase's disclosure copy was deliberately written method-agnostic ("using the method described in
your consent request") so it needs no further change to remain accurate under this decision. Phase
3 planning still needs to select and vet a specific ID-verification vendor/integration -- that
selection is Phase 3 scope, not decided here.

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
| Status | Attested (provisional) -- outside counsel review deferred |
| Reviewed by | gsd-verifier agent (engineering/factual accuracy, 2026-07-09), not legal review |
| Attested by | **Scot Wahlquist, CEO** |
| Attestation date | **2026-08-04** (first attested 2026-07-09) |
| Attestation scope | Provisional business-risk sign-off on the conservative-default position (section 7) and the government-ID-match consent method (section 8). The 2026-08-04 re-attestation additionally covers the ZDR/training-posture narrowing to the direct `api.anthropic.com` path, with no ZDR guarantee claimed for the AWS Bedrock runtime route. NOT a formal outside-counsel legal opinion. |
| Deferred to | Formal outside counsel review, once the full 5-phase VPC (Phases 1-5) is built and ready to go live for real parents. |

This document, `AI_DATA_FLOW_CLASSIFICATION.md`, `app/views/ai_consent/disclosures/v1.html.erb`,
and the `privacy.hbs` edits in this phase reflect Scot's provisional attestation above and may be
built upon for Phase 3/4/5 work. They are not yet a formal, counsel-reviewed legal position --
that review is intentionally deferred (see "Deferred to" above), consistent with how
`AI_GOVERNANCE_MEMO.md` section 7's open items are already tracked and accepted without blocking
build. Do not represent this content to a real parent, regulator, or auditor as counsel-reviewed
until that formal review happens.
