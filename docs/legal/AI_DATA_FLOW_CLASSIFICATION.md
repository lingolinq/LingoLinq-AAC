# AI Data-Flow Classification

**Owner:** Privacy Office (privacy@lingolinq.com)
**Created:** 2026-07-09 (VPC Phase 2, Task 02-01.1)
**Status:** Attested (provisional) by Scot Wahlquist, CEO, 2026-07-09 -- formal outside counsel
review deferred until the full 5-phase VPC is built. See `AI_DATA_SHARING_CONSENT.md` section 9.
**Related:** `docs/legal/AI_DATA_SHARING_CONSENT.md`, `docs/legal/AI_GOVERNANCE_MEMO.md` (attested
2026-06-19, the authoritative live model inventory), `docs/legal/SUBPROCESSORS.md`,
`docs/legal/DATA_RETENTION.md`, `.planning/phases/02-disclosures-content/PLAN.md`

## 1. Purpose

This document is the gating input for the AI data-sharing disclosure (`/ai_consent/disclosures/1`)
and the privacy policy edits in VPC Phase 2. For every AI feature it records precisely what
user-derived data is sent to which vendor, model, and API tier, post-scrubber, whether any account
identifier rides in the payload, and which of the four data-sharing buckets defined by the Phase 2
plan's `[V2]` validation note applies. **The conservative default governs**: when it is unclear
whether a feature's output is Non-personal or Scrubbed-personal, this document treats it as
Scrubbed-personal (gated) and does not self-grant an exemption. Only Scot + counsel can move a
feature to Non-personal.

### The four buckets (from the Phase 2 plan)

| Bucket | Treatment |
|---|---|
| Non-personal | No second-tier gate; signup consent + feature flag suffice |
| Scrubbed personal (pseudonymized) | Conservatively personal; gated unless counsel confirms an exemption; never called "de-identified" |
| Regulated PII | Second-tier verifiable parental consent required |
| Never send externally | Blocked unless an explicit approved legal + vendor basis exists |

## 2. Ground truth verified 2026-07-09 (this classification's audit basis)

Verified directly against the runtime source at the commit this phase branched from
(`c595f6304a545a6a10de80924edd99951eb41aa5`, `origin/staging`), cross-checked against the CEO-attested
`docs/legal/AI_GOVERNANCE_MEMO.md` (2026-06-19). Where the two agree, this document cites both.

Also verified: every `OpenAI::Client.new` call site in the codebase (`lib/ai_board_generator.rb`,
`lib/ai_word_predictor.rb`, and `lib/ai_prediction_generator.rb`) is configured with
`uri_base: 'https://generativelanguage.googleapis.com/v1beta/openai/'`, i.e. all three point at
Google's Gemini endpoint through the OpenAI-compatible client library. None call OpenAI's actual
API. `lib/ai_prediction_generator.rb` is an offline batch job that builds the static prediction
dictionary from built-in word lists only (no user or tenant content, per `AI_GOVERNANCE_MEMO.md`
section 2), so it is out of scope for this disclosure and is not in the table below.

## 3. Feature classification table

| Feature | Code location | Vendor / model / tier | Data sent (post-scrubber) | Account identifier in payload? | Bucket | 2nd-tier VPC gate? | What the disclosure must say |
|---|---|---|---|---|---|---|---|
| AI board suggestion + "focus" refinement | `lib/ai_board_generator.rb` (`generate_words`, `generate_focus_words`) | Primary: Anthropic Claude Haiku 4.5 (`claude-haiku-4-5-20251001`), commercial API. Gemini fallback disabled 2026-07-09 (PR #570). | The topic/prompt text a parent, SLP, or communicator types to request a board (e.g. "make a board about the zoo"), plus cell count and locale. Scrubbed via `PiiScrubber.redact_for_ai` before egress -- as of 2026-07-09 this includes a common first-name gazetteer pass (`PiiScrubber::COMMON_FIRST_NAMES`, ~1,656 US SSA names), not just the account holder's own name. | No. `user:` is threaded into the call for the COPPA gate, org opt-out check, and `AiApiLog` audit attribution ONLY; it is not placed in the vendor-bound prompt payload. | **Non-personal -- reclassified 2026-07-09 (Scot).** Was Scrubbed-personal (conservative default); see section 4.2 for the reclassification rationale and residual-risk acceptance. | **No -- reclassified 2026-07-09.** See section 4.2. | Board generation may be omitted from the second-tier AI-data-sharing disclosure entirely, or listed as a non-gated feature, depending on Phase 2/3 copy conventions -- Anthropic (Haiku 4.5) is still named in the general privacy policy as an AI sub-processor regardless of gating status. |
| AI word / next-word prediction | `lib/ai_word_predictor.rb` | Same vendor/model/tier and same conditional fallback as above. | The communicator's in-progress sentence or utterance text, i.e. the words the AAC user is actively composing, scrubbed via `PiiScrubber.redact_for_ai` before egress. | No, same pattern as above (`user:` threaded for gating/audit only). | Regulated PII. This is the highest-sensitivity runtime AI feature: it is literally the child or patient's own expressive communication content, sent per keystroke-class interaction, not a one-off prompt. Even scrubbed, small-cohort or context-specific phrasing can be re-identifying. | Yes, highest priority. | Must explicitly say that word prediction sends the words/phrases the user is actively typing or selecting, not just a topic. |
| Comprehensive / targeted / quick-screen AI evaluation narrative drafting | `lib/eval_narrator.rb`, `app/controllers/api/eval_sessions_controller.rb` | Anthropic Claude Opus 4.7 (`claude-opus-4-7`, overridable via `EVAL_NARRATOR_MODEL`), commercial API. No Gemini fallback in this path (Anthropic-only). | SETT framework fields, intake (age band, etiology, communication profile, suspected access channel), recommendation data (access method, grid size, symbol library, communicator stage, vocabulary band), SLP free-text notes, and dynamic-assessment scores. The free-text student name is structurally dropped from the egress payload before scrubbing (`payload_for_prompt`), and a blocklist seeded with the student's account name(s) plus the SETT free-text name is applied via `PiiScrubber.redact_for_ai`. | No (same client-name-dropped + blocklist pattern; the "name" defense here is stronger than the other two features). | Regulated PII, highest sensitivity. This is clinical evaluation / IEP-adjacent data. Small-cohort re-identification risk is real: a rare etiology or diagnosis combined with an age band and school context can be re-identifying even with the name removed. | Yes, highest priority, plus explicit small-cohort risk flag. | Must name it as clinical evaluation data; note it is opt-in per session (the SLP clicks "Generate AI Narrative," `use_anthropic == true`) and gated on COPPA + org AI opt-out for the STUDENT, not the requesting clinician. |
| `AiApiLog` (internal audit storage) | `app/models/ai_api_log.rb` | Not a vendor; LingoLinq's own database. | Stores `request_summary` / `response_summary` derived from the payloads above, itself re-scrubbed a second time at write (`before_validation :scrub_summary_columns`), defense in depth against a vendor response echoing an identifier from the prompt. | Yes: `user_global_id` / `organization_global_id` columns, by design (audit trail requirement). | N/A (internal retention artifact, not an external send). | N/A | This is LingoLinq's OWN retention window, distinct from vendor-side retention. See section 5 and `docs/legal/DATA_RETENTION.md`. |

## 4. Vendor-truthfulness finding: the Gemini fallback (resolved 2026-07-09)

`lib/ai_board_generator.rb` and `lib/ai_word_predictor.rb` both prefer Anthropic and fall back to
Google Gemini automatically when `ANTHROPIC_API_KEY` is unset and `GEMINI_API_KEY` is set. Per
`.env.example` line 92, `GEMINI_API_KEY` is sourced from `aistudio.google.com`, i.e. the **Gemini
Developer API** (the AI-Studio-compatible endpoint, `generativelanguage.googleapis.com`), not
Google's enterprise Vertex AI path. This is not a new finding: `docs/legal/AI_GOVERNANCE_MEMO.md`
section 7 already carries it as an open governance item ("Confirm Google Gemini API data-handling
terms for the runtime fallback path, and whether any Google BAA covers it," tracked as
`rev-gemini-baa-annual`), attested by Scot on 2026-06-19 and still unresolved as of this phase.

Because the memo's own inventory table (section 2) already names Gemini 2.5 Flash as a real runtime
fallback, this classification and the resulting disclosure copy **name Google Gemini**, consistent
with the attested memo, rather than either (a) silently omitting a real code path, or (b) asserting
an unconfirmed Vertex AI / BAA status. The disclosure states the fallback exists, that the same
PiiScrubber filter applies to it, and that LingoLinq has not yet confirmed Google's data-handling
terms for that specific path (see `AI_DATA_SHARING_CONSENT.md` section 4 and the disclosure view
itself).

**Resolved 2026-07-09 (Scot):** the fallback is disabled in code
(`scot/compliance/disable-gemini-ai-studio-fallback`, PR #570) rather than migrated or confirmed --
`resolve_api_config` in all three files now fails closed to Anthropic-only. A Vertex AI fallback
with a signed DPA may replace this later. See `AI_DATA_SHARING_CONSENT.md` section 2.2 for the full
resolution note.

## 4.1 Vendor-truthfulness constraints applied (Task 02-02.3)

Every claim in `lib/lingo_linq/ai_consent_disclosures.rb`, the v1 disclosure view, and the
`privacy.hbs` edits in this phase was checked against the following binding constraints from the
plan's `[V2]` validation note before being written:

| Constraint | How it is satisfied |
|---|---|
| Confirm Google uses Vertex AI, not the free AI Studio tier, before relying on it for child data | Resolved 2026-07-09 by disabling the fallback instead (PR #570) -- see section 4 above. There is no longer a live path to the AI-Studio tier. |
| Never claim "never trains" unqualified | The copy scopes the no-training claim narrowly to "these two specific models on Anthropic's commercial API," never as a blanket vendor-wide or product-wide claim. Asserted by `spec/lib/lingo_linq/ai_consent_disclosures_spec.rb` ("does not claim unqualified 'never trains'"). |
| Do not claim "no identifiers are sent" | The copy states LingoLinq "filters out common identifying details it can detect" and explicitly says the filter "is not perfect" and "free-typed text may still contain identifying details." No claim of zero identifiers ever appears. |
| Anthropic ZDR is not publicly documented as of the 2026-06-26 validation pass; do not claim or disclaim without confirmation | Superseded by a later, dated company-level confirmation (2026-07-06, verified against Anthropic's own Privacy Center documentation) that Claude Haiku 4.5 and Claude Opus 4.7 specifically are ZDR-eligible. The copy states this ZDR confirmation is scoped to these two models only, and does not extend it to any other Anthropic model. |
| Never say "de-identified" unless the HIPAA Safe Harbor / Expert Determination standard is met (it is not) | The word never appears in the module, the view, or the privacy.hbs additions; asserted by the module spec. Copy uses "scrubbed" / "pseudonymized" and explicitly contrasts that with "the formal legal standard for removing all identifying information." |
| Named vendors must match the actual runtime payload path, not a speculative list | Verified directly against `lib/ai_board_generator.rb` and `lib/ai_word_predictor.rb` (section 2-4 above) and cross-checked against the attested `AI_GOVERNANCE_MEMO.md` inventory. OpenAI is NOT named (the `openai` gem in this codebase is a transport client aimed at Gemini's OpenAI-compatible endpoint, not an actual call to OpenAI's API; there is no code path that sends data to OpenAI). |

## 4.2 AI board generation reclassified to Non-personal (2026-07-09)

**Original conservative default:** Scrubbed-personal, gated, on the theory that the free-text
topic field is user-authored and could carry identifying detail even though typical usage does
not (e.g. "make a board about the zoo" contains no information about the child at all).

**Scot's challenge (2026-07-09):** COPPA's VPC trigger is the *disclosure of personal information*
to a third party, not "AI is used" -- this document has said so since section 1. Typical board-gen
usage (topic-only prompts) contains no personal information about the child, so gating the entire
feature regardless of content is broader than the legal trigger actually requires.

**Where the real risk sits:** not "most usage shares PII" (it doesn't) but that the pre-2026-07-09
scrubber (`PiiScrubber.redact_for_ai`) could not reliably catch the rare case where a parent/SLP
*does* type a name into the topic field -- it only recognized the account holder's own name (via
`configure_blocklist`), not an arbitrary child's, sibling's, or classmate's name. COPPA enforcement
does not care about the 95% case; it cares whether a specific disclosure of personal information
happened.

**Resolution:** hardened the scrubber first, then reclassified, rather than reclassifying on the
existing scrubber's coverage:

1. `PiiScrubber::COMMON_FIRST_NAMES` -- a ~1,656-entry gazetteer of common US first names (source:
   Social Security Administration public-domain baby-name data, names given to at least 1,000
   babies in a single year, 1880-present) is now scanned against every AI-egress payload
   (`redact_for_ai` / `scan_for_pii`), in addition to the existing account-holder blocklist. This
   catches a bare first name typed into free text -- e.g. "Bobby" in "create a board about Bobby
   Smith who lives in Salt Lake City" -- that the blocklist alone would miss. See
   `lib/pii_scrubber.rb` and `spec/lib/pii_scrubber_spec.rb`.
2. With that hardening in place, AI board suggestion + focus refinement (section 3 table, row 1)
   moves from Scrubbed-personal (gated) to **Non-personal (no second-tier AI-data-sharing consent
   gate)**.

**Explicit scope of the hardening (residual risk, stated plainly, not overclaimed):**
- **First names only.** Last names, street addresses, city/school names, and other identifying
  detail are NOT covered by this pass. In the "Bobby Smith, Salt Lake City" example, "Bobby" is
  now redacted; "Smith" and "Salt Lake City" are not. A last name alone, or a common city name
  alone, is a much weaker identifier than a full name, but this is not a claim that every possible
  identifying detail is caught.
- **Common-name coverage, not exhaustive.** The gazetteer covers first names common enough to
  appear at least 1,000 times in a single US birth-year; an unusual or non-US name could still slip
  through, same limitation the account-holder blocklist always had.
- **Deliberately biased toward over-redaction.** A common English word that is also a name (e.g.
  "Grace", "Hope", "Will") is redacted even when used as an ordinary word in a topic prompt. This
  is the same tradeoff already accepted elsewhere in `pii_scrubber.rb` for the SSN pattern
  (catching real PII outweighs occasionally over-matching a non-PII token).
- **Word prediction and eval narration are unaffected and stay Regulated PII.** They are
  fundamentally different data: word prediction sends the child's own in-progress communication
  content (not a topic string), and eval narration is inherently clinical/IEP-adjacent data. This
  reclassification applies ONLY to AI board generation.

This is Scot's own provisional business-risk decision (same status as the rest of this document --
see `AI_DATA_SHARING_CONSENT.md` section 9), not a counsel-reviewed legal opinion.

## 5. Two distinct retention concepts (do not conflate in copy)

1. **Vendor-side retention**: how long Anthropic keeps the payload after the API call. For
   Anthropic Claude Haiku 4.5 and Claude Opus 4.7, LingoLinq operates under Anthropic's
   zero-data-retention (ZDR) terms for these specific models (confirmed against Anthropic's own
   data-retention documentation; this does not extend to any other Anthropic model not used in the
   product). The Gemini fallback is disabled as of 2026-07-09 (section 4 above); its vendor-side
   retention terms are no longer a live concern for this product.
2. **LingoLinq's own `AiApiLog` retention**: the audit record LingoLinq itself keeps of the
   scrubbed request/response summaries, independent of what the vendor does. See section 6.

## 6. Retention reconciliation (binding on this phase's copy)

Per the 2026-07-09 resume brief, three retention numbers exist for `AiApiLog` and must be
reconciled in every place this phase writes retention copy:

| Scope | Window | Status | Basis |
|---|---|---|---|
| EU-jurisdiction accounts | 5 years | **Enforced** (`AiApiLog.purge_old_eu_logs!(years: 5)`, shipped PR #553, runs via `scheduler:dispatch`). Currently inert in practice because jurisdiction is not yet stamped on accounts (VPC Phase 4 wires that). | EU AI Act Article 50 record-keeping |
| Children (under-13) accounts | 12 months, rolling, independent of account status | **Decided, rolling out** (not yet enforced in code as of this commit) | 2026-07-09 ratified decision |
| General (non-EU, non-child) accounts | 24 months | **Decided, rolling out** (not yet enforced in code beyond the 90-day IP redaction below) | 2026-07-09 ratified decision, GDPR Article 5(1)(e) storage limitation |
| All `AiApiLog` records, IP address field only | 90 days | **Enforced today** (`AiApiLog.redact_old_ip_addresses!(days: 90)`, live via `scheduler:dispatch`) | GDPR data minimization |
| HIPAA-linked accounts | Up to 6 years may be required for audit-floor purposes | **Open, deferred.** This is why a single blanket non-EU purge job was not shipped alongside the EU one. | HIPAA 45 CFR 164.316(b)(2)(i) |
| Account-lifecycle deletion | The `AiApiLog` rows tied to a user account are deleted when that account is deleted | **Enforced today** (Flusher cascade) | Contract / FERPA |

The disclosure and the privacy policy state the account-lifecycle rule (already live, per PR #559)
and the enforced 90-day IP redaction as **currently enforced**, and state the EU/children/general
windows as the current **retention policy the company is rolling out**, being explicit about which
of those three is already live in code (EU only) versus decided-but-not-yet-enforced (children,
general). See `docs/legal/DATA_RETENTION.md`, which is corrected in this same commit set to carry
the same breakdown instead of the stale flat "2 years" figure.

## 7. i18n strategy for the disclosure content (Task 02-01.5)

`i18n_generator.rb` only scans `app/frontend/app/**/*.js` and `app/frontend/app/**/*.hbs`; it does
not read Rails ERB views. The `[V2]` design decision made the disclosure a server-rendered Rails
view (`app/views/ai_consent/disclosures/v1.html.erb`) precisely so the legal copy lives in one
place rather than being re-keyed into 13 Ember locale JSON files, so this is expected, not a gap:
the disclosure's strings live in `config/locales/en.yml` under `ai_consent_disclosures.v1.*` and
are resolved with the standard Rails `t()` helper, the same pattern already used for the
`parental_consent` mailer and controller copy in that file.

Running `ruby i18n_generator.rb` before any Ember template changes in this phase confirms a clean
baseline (0 dups, 0 missing, 7701 total strings) so any dup/missing count reported after the
`privacy.hbs` edit in Task 02-02.1 is attributable to that edit alone.

`es` coverage for the disclosure itself does not yet exist (`config/locales` currently has only
`en.yml`); a human-reviewed `config/locales/es.yml` mirroring the same key structure is required
before this disclosure can be shown to a Spanish-speaking parent, tracked alongside the `es` hard
gate for `privacy.hbs` (Task 02-02.6) as a blocking pre-enforcement dependency, not a loose
follow-up.

## 8. What is explicitly OUT of scope for Phase 2

- Wiring any of this into an actual consent gate at the AI call sites (VPC Phase 4).
- Building the general non-EU / children's-data purge jobs described in section 6 (separate ticket,
  tracked in `docs/legal/DATA_RETENTION.md` and this project's `PROJECT.md`).
- ~~Resolving the Gemini/Vertex AI open item in section 4~~ -- resolved 2026-07-09 (disabled, PR #570).
- ~~Deciding whether scrubbed neutral board-gen can ever move to the Non-personal bucket~~ --
  resolved 2026-07-09 (Scot's provisional attestation: stays gated). See `AI_DATA_SHARING_CONSENT.md`
  section 7.
- Selecting and vetting a specific government-ID-verification vendor/integration for Phase 3 (the
  *method* -- gov-ID match -- is decided; the vendor is not).
- Formal outside-counsel legal review of this document and the disclosure content (deferred to
  pre-launch, see `AI_DATA_SHARING_CONSENT.md` section 9).
