# AI Data-Flow Classification

> # DRAFT - NOT YET ATTESTED
>
> **This successor carries NO attestation of its own.** It supersedes
> `docs/legal/2026-08-17_ai-data-flow-classification.md` (`DOC-6d37a68cf4`, ATTESTED 2026-08-19 by
> Scot Wahlquist, CEO), which remains frozen and byte-identical as the signed record. Every
> attestation statement reproduced below belongs to **predecessor versions** and is retained as
> history; none of them attests these bytes. See "Corrections in this successor" below.

**Supersedes:** `docs/legal/2026-08-17_ai-data-flow-classification.md` (`DOC-6d37a68cf4`), which remains frozen at the bytes attested 2026-08-19 with its own attestation block unaltered. This dated record is the operative AI data-flow classification from 2026-08-25 forward. Attestation state is maintained in the document register (`audit-reports/DOCUMENT-REGISTER.json`), which is authoritative.
**Reason for supersession:** The predecessor describes the EU-jurisdiction `AiApiLog` retention tier as **"Enforced"** and **"Now functional ... It matches EU rows"**, and narrates PR #656 as moving that tier "from inert to functional". Tracing the job against the schema shows it deletes nothing: the `ai_api_logs` table was only created 2026-02-21, so no row in it can be five years old before 2031-02-21. The scheduled job is real; the deletion it implies is not. No data flow, gate, or classification changes in this successor -- only the enforcement claim.

## Corrections in this successor

| # | Claim in `2026-08-17_ai-data-flow-classification.md` (attested 2026-08-19) | Correction |
|---|---|---|
| 1 | Attestation-history narrative (:36): PR #656 moved "the EU tier from inert to functional". | Withdrawn as a characterisation. PR #656 wired a scheduled job and a jurisdiction stamp; it did not make any deletion occur. The tier is wired, not enforcing. |
| 2 | Section 6 retention table (:293): EU tier is "**Enforced**" and "Now functional: ... It matches EU rows wherever Phase 4 is deployed". | False as an enforcement claim. `purge_old_eu_logs!` deletes `jurisdiction = 'EU' AND created_at < 5.years.ago` (`app/models/ai_api_log.rb:244-248`). The `ai_api_logs` TABLE was created 2026-02-21 (`db/migrate/20260221000001_create_ai_api_logs.rb`), so no row in it can be five years old before **2031-02-21**; rows stamped at write time cannot qualify before **2031-06-21**, when the `jurisdiction` column (created 2026-06-21, `db/migrate/20260621120000_add_article_50_fields_to_ai_api_logs.rb`) turns five. **Scope of this claim, tightened 2026-08-25:** it rests on the table's own age, not on the stamp alone. A backfill that stamped pre-June-2026 rows could pull the floor back toward 2031-02-21, and a manual `UPDATE` could make a row eligible sooner still; no such backfill exists in the codebase (no `update_all` touching `jurisdiction`). Either way the job matches zero rows today. |

> **Scope note.** This successor corrects an *enforcement* claim: a scheduled job that deletes nothing was described as an operating control. It does **not** assert that any data was retained longer than a rule permits, and it takes **no position on the legal basis**. The predecessor's "Basis" column attributes this tier to "EU AI Act Article 50 record-keeping"; that attribution is inherited unchanged and is **flagged as an open question for counsel**, since Article 50 is the AI Act's transparency provision and this record does not establish that it imposes a five-year `AiApiLog` retention duty. Correcting the basis is out of scope here and is not a change this record is competent to make.

**Owner:** Privacy Office (privacy@lingolinq.com)
**Predecessor lineage (inherited text, describes the 2026-08-17 record, not this one):** the 2026-08-17 record superseded `docs/legal/AI_DATA_FLOW_CLASSIFICATION.md`, which remains frozen at the bytes attested 2026-08-08. **This** record supersedes the 2026-08-17 record; see the Supersedes line above, which is authoritative.
**Predecessor's reason for supersession (inherited text -- why the 2026-08-17 record superseded the 2026-08-08 one; NOT this record's reason, which is stated above):** The predecessor's section 3 operational-status note states **"Status re-verified 2026-08-07: credentialled, carrying no traffic"**, cites serving revision `lingolinq-web-00017-n65`, and records production `AiApiLog` as holding **a single row with no `user_global_id`**. All three were overtaken by the 2026-08-12 production deploy of PR #734. **The classification's operative fact changes: user-attributed prompts now reach the vendor.** See the corrected note in section 3.
**Created:** 2026-07-09 (VPC Phase 2, Task 02-01.1)
**Status:** Maintained in `audit-reports/DOCUMENT-REGISTER.json` for this record's row, which is authoritative. The predecessor's status line, which read "Re-attested 2026-08-08 (provisional)", described the predecessor's bytes and is retained there rather than restated here. Formal outside counsel review remains deferred until the full 5-phase VPC is built. See `AI_DATA_SHARING_CONSENT.md` section 9.

**Attestation of this record:** none. This dated successor is a draft. Attestation state lives only in `audit-reports/DOCUMENT-REGISTER.json` (THIS record's row is `DOC-48adac383b`; `DOC-6d37a68cf4` is the PREDECESSOR's row). The dates below are the predecessor's history; they are not a review of these bytes.

**Predecessor attestation history** (frozen on `docs/legal/AI_DATA_FLOW_CLASSIFICATION.md`, `DOC-90b5d33227`): first attested (provisional) 2026-07-09; re-attested 2026-07-22;
re-attested 2026-08-04; re-attested 2026-08-06; **re-attested 2026-08-08**. The predecessor's 2026-08-08
revision covers two corrections. First, the runtime operational-status note in section 3,
which asserted the Bedrock path had been not operational since `00014-5rw` (2026-08-04T06:31:46Z);
credentials were in fact re-mounted 53 minutes later and have been continuously present since, so
that claim was false from 2026-08-04T07:25:08Z and was corrected against live infrastructure on
2026-08-07. Second, a stale cross-reference in the Related line below, which described
`AI_GOVERNANCE_MEMO.md` as "attested 2026-06-19" when that memo had been re-attested on 2026-07-22,
2026-07-24, 2026-07-27 and 2026-08-04 since. The **2026-08-06** re-attestation covers the
section 8 correction: the board-generation bullet stated the superseded "stays gated" position as
the outcome, contradicting the predecessor's own section 3 table and section 4.2,
`AI_DATA_SHARING_CONSENT.md` section 7, and the shipped implementation in
`lib/lingo_linq/ai_consent_disclosures.rb`. That revision corrected the description only; no
classification, gate, or data flow changed. Those bytes were corrected before merge and never
reached `staging`.
The **2026-08-04** re-attestation covers the runtime-row status paragraph,
rewritten from "dormant as of 2026-07-30" to the closed operational window (not operational through
revision `00012-x8z`; operational 2026-08-03T08:23Z to 2026-08-04T06:31Z on `00013-76w`, carrying
one internal verification call with no user or student data; not operational since `00014-5rw`).
That last clause was superseded within the hour it was written and is corrected in the 2026-08-07
revision; see the status note in section 3.
The predecessor entered the 2026-08-04 re-attestation set during the third review round of PR #725.
The 2026-07-09 attestation covered an
earlier revision: PR #656 (2026-07-22) rewrote the AI-log retention tiers, moving the children and
general tiers from "Decided, rolling out" to "Decided, not yet enforced" with the blocker named, and
the EU tier from "inert" to "functional" -- a characterisation this successor withdraws (see Corrections, row 1). The 2026-07-22 re-attestation was taken only after the changed
claims were re-verified against live code -- **but that verification checked only that the CODE EXISTS, not that it ever matches a row; see Corrections row 1, which withdraws the "functional" characterisation this sentence reports**: `AiApiLog.purge_old_eu_logs!(years: 5)`
(`app/models/ai_api_log.rb`) is dispatched from `lib/tasks/scheduler.rake`, and
`LingoLinq::Article50CallContext.for(user)` stamps jurisdiction at exactly the three AI call sites
(`lib/eval_narrator.rb`, `lib/ai_word_predictor.rb`, `lib/ai_board_generator.rb`).
**Related:** `docs/legal/AI_DATA_SHARING_CONSENT.md`, `docs/legal/AI_GOVERNANCE_MEMO.md` (the
authoritative live model inventory; first attested 2026-06-19, most recently re-attested
2026-08-04, so check its own attestation block rather than relying on a date quoted here),
`docs/legal/2026-08-16_subprocessor-register.md` (operative subprocessor register; `docs/legal/SUBPROCESSORS.md` is the frozen 2026-08-08 predecessor),
`docs/legal/2026-08-09_data-retention_draft.md` (operative retention schedule; `docs/legal/DATA_RETENTION.md` is the frozen 2026-07-23 predecessor), `.planning/phases/02-disclosures-content/PLAN.md`

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

Also verified **at that commit**: every `OpenAI::Client.new` call site then in the codebase
(`lib/ai_board_generator.rb`, `lib/ai_word_predictor.rb`, and `lib/ai_prediction_generator.rb`) was
configured with `uri_base: 'https://generativelanguage.googleapis.com/v1beta/openai/'`, i.e. all
three pointed at Google's Gemini endpoint through the OpenAI-compatible client library. None called
OpenAI's actual API.

> **Superseded as a statement of current code, re-verified 2026-08-19.** That paragraph describes
> the audit basis at `c595f6304`, which predates PR #570 (the same-day removal of the Gemini
> fallback noted in section 3). **There are now no `OpenAI::Client.new` call sites in the
> repository at all**, and `lib/ai_board_generator.rb`, `lib/ai_word_predictor.rb` and
> `lib/eval_narrator.rb` each `require_relative 'ai_client'` and route through `lib/ai_client.rb`
> to AWS Bedrock. The `ruby-openai` gem is still declared in the Gemfile, commented as a Gemini
> fallback, with no caller; its removal is tracked in PR #826. The paragraph is retained because
> it is this classification's dated audit basis, not because it describes the code today — read in
> the present tense it would wrongly suggest this product ships an OpenAI SDK aimed at Gemini. `lib/ai_prediction_generator.rb` is an offline batch job that builds the static prediction
dictionary from built-in word lists only (no user or tenant content, per `AI_GOVERNANCE_MEMO.md`
section 2), so it is out of scope for this disclosure and is not in the table below.

## 3. Feature classification table

> **Vendor-plane correction, 2026-08-17.** The vendor/model column below has now been REWRITTEN to
> name AWS as the processing plane and Anthropic as the model provider. It previously named the
> direct commercial API and dated model ids (`claude-haiku-4-5-20251001`).
>
> Note what happened here, because it is the defect pattern this document keeps reproducing: the
> 2026-08-02 note below **correctly identified that the table was stale**, and the table was then
> left wrong anyway for two weeks, through two re-attestations. A correction note was added instead
> of correcting the thing the note described, and the note's presence made the document look
> maintained. Correct the artifact, not just the margin.
>
> **Status correction, 2026-08-02 (retained as written).** The vendor/model column below names the
> direct commercial API and dated model ids (`claude-haiku-4-5-20251001`). That is stale in two ways.
> The runtime route is now Anthropic Claude on **AWS Bedrock** in bare-alias form
> (`anthropic.claude-haiku-4-5`), via
> `lib/ai_client.rb`; the direct `api.anthropic.com` route was removed by PR #681 and is CI-enforced
> by `scripts/ai-endpoint-guard.sh`. **Operational status corrected 2026-08-04** (this previously
> read "every runtime row here is dormant as of 2026-07-30: no `lingolinq-web` revision carries a
> Bedrock credential"). Accurate statement: not operational from 2026-07-30T16:37Z through
> `00012-x8z`; operational 2026-08-03T08:23Z to 2026-08-04T06:31Z on `00013-76w`, in which one
> word-prediction call completed (internal verification, no user or student data); credentials
> withdrawn 2026-08-04T06:31:46Z (`00014-5rw`) and **re-mounted 53 minutes later** on `00015-9l9`
> (2026-08-04T07:25:08Z), where they have remained continuously ever since. (That sentence
> originally ended "through the serving revision `lingolinq-web-00017-n65`", which was the
> serving revision when the 2026-08-04 correction was written; it is `lingolinq-web-00020-per`
> as of 2026-08-17. The revision name is deliberately no longer pinned in this historical
> paragraph, because naming a live revision inside a frozen correction note is precisely how
> this document went stale.)
> **Status re-verified live 2026-08-17: ACTIVE and carrying user-attributed traffic.** This
> supersedes the predecessor's "credentialled, carrying no traffic" reading and its citation of
> serving revision `lingolinq-web-00017-n65`. The serving revision is now
> **`lingolinq-web-00020-per`** (100% of traffic), mounting both `BEDROCK_AWS_KEY` and
> `BEDROCK_AWS_SECRET` from Secret Manager. Production `AiApiLog` holds **64 rows**, of which
> **63 were written since the 2026-08-12 production deploy of PR #734** and **63 carry a
> `user_global_id`**. All 64 succeeded, all on inference profile
> `us.anthropic.claude-haiku-4-5-20251001-v1:0` via provider `claude`; by type, 57
> `word_prediction` and 7 `board_generation`; 17,221 prompt tokens in total. The 63
> user-attributed calls come from **2 distinct accounts** of the 34 then present in production,
> consistent with internal pre-tenant testing rather than tenant traffic; this document reads
> that from `AiApiLog` attribution alone and does not independently certify those accounts as
> non-real. `article_50_disclosure_shown` is true on all 63 post-deploy rows and false only on
> the single 2026-08-04 internal verification call. `pii_detected` is false on all 64 and
> `ip_address` is null on all 64. **`jurisdiction` is null on all 64 rows**, so no row is
> stamped for the EU retention purge and that purge currently matches nothing -- a pre-existing
> gap, recorded here because this is the document that classifies the flow.
> **This is the fourth document in this lineage to carry a runtime-status claim that a later deploy
> invalidated** (the others: the subprocessor register, the Anthropic BAA record, and the breach
> runbook). Nothing in CI compares a compliance document's runtime claims against the running
> service, so any runtime sentence in this file is true only as of its stated verification date.
> **Evidentiary limit:** `AiApiLog` is not a durable egress ledger. `log_ai_call` rescues
> `ActiveRecord::ActiveRecordError` and returns an unsaved record (`app/models/ai_api_log.rb`), and
> `Flusher.flush_user_logs` destroys rows by `user_global_id` on user erasure (`lib/flusher.rb`), so
> the table can under-record **active** egress. The 63 user-attributed rows counted above are a
> lower bound, not a complete ledger. Durable vendor-side confirmation (CloudWatch `AWS/Bedrock`
> `Invocations` / CloudTrail `bedrock:InvokeModel`) has not been obtained; the available IAM
> principal is denied `cloudwatch:GetMetricStatistics`. Treat the 2026-08-17 production count as
> best-available evidence of egress, not a guarantee that every call was logged. **Correction 2026-08-07:** this note previously ended "not operational
> since `00014-5rw` (2026-08-04T06:31:46Z), so `AiClient.configured?` is false again today." That
> was true for 54 minutes and false from 2026-08-04T07:25:08Z onward. **The 2026-08-07 clause that
> "the no-egress conclusion still holds, but it now rests on the absence of calls rather than the
> absence of credentials" is itself superseded by the 2026-08-17 live re-verification above:
> user-attributed prompts now reach Bedrock.** No classification bucket in the table below changes:
> the rows describe what each feature sends. The Gemini fallback referenced in these rows was
> removed 2026-07-09 (PR #570). Read the table as the designated classification of live traffic.
> `docs/legal/AWS_BAA_ACCEPTED.md` carries the same superseded "no traffic" claim and is corrected
> separately.

| Feature | Code location | Vendor / model / tier | Data sent (post-scrubber) | Account identifier in payload? | Bucket | 2nd-tier VPC gate? | What the disclosure must say |
|---|---|---|---|---|---|---|---|
| AI board suggestion + "focus" refinement | `lib/ai_board_generator.rb` (`generate_words`, `generate_focus_words`) | Primary: Claude Haiku 4.5, wire-resolved to inference profile `us.anthropic.claude-haiku-4-5-20251001-v1:0`. Model provider **Anthropic, PBC**; **processing plane AWS**. Served by **Amazon Bedrock** (`bedrock-runtime.<region>.amazonaws.com`, SigV4), so the payload is delivered to **AWS**, not to Anthropic. The direct `api.anthropic.com` commercial-API route was removed by PR #681 and is CI-enforced. Gemini fallback disabled 2026-07-09 (PR #570). | The topic/prompt text a parent, SLP, or communicator types to request a board (e.g. "make a board about the zoo"), plus cell count and locale. Scrubbed via `PiiScrubber.redact_for_ai` before egress -- as of 2026-07-09 this includes a common first-name gazetteer pass (`PiiScrubber::COMMON_FIRST_NAMES`, ~1,656 US SSA names), not just the account holder's own name. | No. `user:` is threaded into the call for the COPPA gate, org opt-out check, and `AiApiLog` audit attribution ONLY; it is not placed in the vendor-bound prompt payload. | **Non-personal -- reclassified 2026-07-09 (Scot).** Was Scrubbed-personal (conservative default); see section 4.2 for the reclassification rationale and residual-risk acceptance. | **No -- reclassified 2026-07-09.** See section 4.2. | Board generation may be omitted from the second-tier AI-data-sharing disclosure entirely, or listed as a non-gated feature, depending on Phase 2/3 copy conventions -- Anthropic (Haiku 4.5) is still named in the general privacy policy as an AI sub-processor regardless of gating status. |
| AI word / next-word prediction | `lib/ai_word_predictor.rb`, `app/controllers/api/word_suggestions_controller.rb` | Same vendor/model/tier and same conditional fallback as above. | Two user-derived fields reach Bedrock. (1) The communicator's in-progress sentence or utterance text -- the words the AAC user is actively composing. (2) The optional client-supplied `context.topic` string, forwarded by `Api::WordSuggestionsController` and interpolated into `AiWordPredictor.system_prompt` as `Topic context:`. Both are passed through `PiiScrubber.redact_for_ai` in `predict` before the cache key is built and before egress. The scrubber is regex + first-name gazetteer + account-name blocklist, not de-identification. Optional `context.time_of_day` is also interpolated when not `unspecified`; it is an enumerated client string, not scrubbed. The current Ember Speak Mode path (`POST /api/v1/words/predict`) does not send a topic; `POST /api/v1/word_suggestions` does. | No, same pattern as above (`user:` threaded for gating/audit only). | Regulated PII. This is the highest-sensitivity runtime AI feature: it is literally the child or patient's own expressive communication content, sent per keystroke-class interaction, not a one-off prompt. Even scrubbed, small-cohort or context-specific phrasing can be re-identifying. | Yes, highest priority. | Must explicitly say that word prediction sends the words/phrases the user is actively typing or selecting, and that an optional topic-context string may also be sent, post-scrubber. |
| Comprehensive / targeted / quick-screen AI evaluation narrative drafting | `lib/eval_narrator.rb`, `app/controllers/api/eval_sessions_controller.rb` | Claude Opus 4.7 (`claude-opus-4-7`, overridable via `EVAL_NARRATOR_MODEL`). Model provider **Anthropic, PBC**; **processing plane AWS**. Served by **Amazon Bedrock** (`bedrock-runtime.<region>.amazonaws.com`, SigV4), so the payload is delivered to **AWS**, not to Anthropic. The direct `api.anthropic.com` commercial-API route was removed by PR #681 and is CI-enforced. No Gemini fallback in this path. **No call on this path is recorded in production:** `AiApiLog` contains only `word_prediction` (57) and `board_generation` (7) as of 2026-08-17, so this row describes a code path, not observed egress. | `payload_for_prompt` (`lib/eval_narrator.rb`) builds the vendor JSON. **Excluded before egress:** SETT `student` (any key casing) and intake `etiology` (any key casing; local deterministic template still uses etiology; it is not sent to Bedrock). **Sent:** remaining SETT fields; remaining intake (age band, communication profile, suspected access channel); eval mode; SLP free-text notes; session duration; and the **full** `payload['recommendation']` object, not a field subset. That object includes access method, grid size, symbol library, communicator stage, vocabulary band, starter-board spec, confidence, and next action, and -- when present for targeted/comprehensive modes -- nested `targeted_report` (adaptive grid, library 3-way tallies, access co-trial summaries, syntax-probe scores, motor-map hit locations) and `comprehensive_report` (dynamic-assessment scores, literacy-probe results, SETT companion, nested targeted report). After the structural drops, a blocklist seeded with the student's account name(s) plus the SETT free-text name is applied via `PiiScrubber.redact_for_ai`. | No (same client-name-dropped + blocklist pattern; the "name" defense here is stronger than the other two features). | Regulated PII, highest sensitivity. This is clinical evaluation / IEP-adjacent data. Etiology is not in the vendor payload, but small-cohort re-identification risk remains: age band, communication profile, SETT environment/task, literacy and syntax scores, and school context can be re-identifying even with the name and etiology removed. | Yes, highest priority, plus explicit small-cohort risk flag. | Must name it as clinical evaluation data; note it is opt-in per session (the SLP clicks "Generate AI Narrative," `use_anthropic == true`) and gated on COPPA + org AI opt-out for the STUDENT, not the requesting clinician. |
| `AiApiLog` (internal audit storage) | `app/models/ai_api_log.rb` | Not a vendor; LingoLinq's own database. | Stores `request_summary` / `response_summary` derived from the payloads above, itself re-scrubbed a second time at write (`before_validation :scrub_summary_columns`), defense in depth against a vendor response echoing an identifier from the prompt. | Yes: `user_global_id` / `organization_global_id` columns, by design (audit trail requirement). | N/A (internal retention artifact, not an external send). | N/A | This is LingoLinq's OWN retention window, distinct from vendor-side retention. See section 5 and `docs/legal/2026-08-09_data-retention_draft.md`. |

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
| Never claim "never trains" unqualified | The copy scopes the no-training claim narrowly to "these two specific models as served through AWS Bedrock" (the copy must not say "Anthropic's commercial API", which is no longer the route), never as a blanket vendor-wide or product-wide claim. Asserted by `spec/lib/lingo_linq/ai_consent_disclosures_spec.rb` ("does not claim unqualified 'never trains'"). |
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

1. **Vendor-side retention**: how long the receiving processor keeps the payload. **The receiving
   processor is AWS, not Anthropic.** Runtime inference goes to Amazon Bedrock
   (`bedrock-runtime.<region>.amazonaws.com`), where AWS serves the Claude model weights inside AWS
   infrastructure; prompts are not delivered to Anthropic, PBC on this path. Retention is therefore
   governed by **AWS Bedrock settings under the AWS BAA** (Bedrock is a HIPAA-eligible AWS service;
   see `docs/legal/AWS_BAA_ACCEPTED.md`), NOT by Anthropic commercial terms.

   Verified account state: the Bedrock account-level data-retention setting is **`inherit`**, which
   resolves to the **model default (`default`)** for Claude Haiku 4.5. A `none` mode exists in the
   model's `allowed_modes` but is **not currently selected**. Bedrock model-invocation logging has
   **no destination configured** in `us-west-2`, `us-east-1`, or `us-east-2`.

   **No zero-data-retention guarantee is claimed for this flow.** A previous revision of this
   document stated that LingoLinq "operates under Anthropic's zero-data-retention (ZDR) terms for
   these specific models." That was written for the direct commercial-API route, which PR #681
   removed; carrying it forward onto the Bedrock path named the wrong processor, the wrong contract,
   and a retention posture the account does not have. The Anthropic HIPAA-Ready BAA of 2026-07-18
   remains executed and is recorded in `docs/legal/ANTHROPIC_BAA_ACCEPTED.md`, but it is **not the
   operative instrument for this flow**; the AWS BAA is.

   The Gemini fallback is disabled as of 2026-07-09 (section 4 above); its vendor-side retention
   terms are no longer a live concern for this product.
2. **LingoLinq's own `AiApiLog` retention**: the audit record LingoLinq itself keeps of the
   scrubbed request/response summaries, independent of what the vendor does. See section 6.

## 6. Retention reconciliation (binding on this phase's copy)

Per the 2026-07-09 resume brief, three retention numbers exist for `AiApiLog` and must be
reconciled in every place this phase writes retention copy:

| Scope | Window | Status | Basis |
|---|---|---|---|
| EU-jurisdiction accounts | Up to 5 years | **Wired, currently a no-op.** `AiApiLog.purge_old_eu_logs!(years: 5)` (PR #553) is dispatched daily via `scheduler:dispatch`, and `LingoLinq::Article50CallContext` stamps `jurisdiction` at the three AI call sites. It nonetheless deletes nothing: `purge_old_eu_logs!` deletes `jurisdiction = 'EU' AND created_at < 5.years.ago` (`app/models/ai_api_log.rb:244-248`). The `ai_api_logs` TABLE was created 2026-02-21 (`db/migrate/20260221000001_create_ai_api_logs.rb`), so no row in it can be five years old before **2031-02-21**; rows stamped at write time cannot qualify before **2031-06-21**, when the `jurisdiction` column (created 2026-06-21, `db/migrate/20260621120000_add_article_50_fields_to_ai_api_logs.rb`) turns five. **Scope of this claim, tightened 2026-08-25:** it rests on the table's own age, not on the stamp alone. A backfill that stamped pre-June-2026 rows could pull the floor back toward 2031-02-21, and a manual `UPDATE` could make a row eligible sooner still; no such backfill exists in the codebase (no `update_all` touching `jurisdiction`). Either way the job matches zero rows today. **CORRECTED 2026-08-25**; previously read "**Enforced** ... Now functional ... It matches EU rows wherever Phase 4 is deployed." | EU AI Act Article 50 record-keeping **The date is not the operative reason.** The stamp writes `'EU'` ONLY for a user `EuJurisdiction` resolves to a confirmed `:eu`; `:unknown` and `:non_eu` both map to `nil` (`lib/eu_jurisdiction.rb`, deliberate, to avoid mislabelling under the HIPAA six-year floor). As of the 2026-08-23 audited read, `EuJurisdiction.status` is `:unknown` for **34 of 34** production accounts, and `jurisdiction` is null on all 64 `AiApiLog` rows. So the purge matches zero rows because **nothing has ever been stamped**, not merely because stamped rows are too young. Under the current resolver and population the control is structurally dormant; it does not begin operating in 2031 by the passage of time. This matches `lib/tasks/scheduler.rake:153-164` and `docs/legal/2026-08-24_ai-governance-memo.md:485-490`, which state it the same way. **Legal basis flagged, not endorsed:** the "EU AI Act Article 50 record-keeping" attribution in the Basis column is INHERITED. Article 50 is the AI Act's transparency provision, and nothing here establishes that it imposes a five-year `AiApiLog` retention duty. Open question for counsel; this record corrects only the enforcement claim. |
| Children (under-13) accounts | 12 months, rolling, independent of account status | **Decided, not yet enforced.** No purge job: `ai_api_logs` has no per-row child-subject marker, so this tier cannot be carved out from the 6-year HIPAA floor without a write-time stamp (schema + call-site change). | 2026-07-09 ratified decision |
| General (non-EU, non-child) accounts | 24 months | **Decided, not yet enforced** (beyond the 90-day IP redaction below). Same blocker: a safe non-EU purge needs the HIPAA-covered vs non-covered distinction stamped per row first; a flat 24-month delete is deliberately not shipped. | 2026-07-09 ratified decision, GDPR Article 5(1)(e) storage limitation |
| All `AiApiLog` records, IP address field only | 90 days | **Enforced today** (`AiApiLog.redact_old_ip_addresses!(days: 90)`, live via `scheduler:dispatch`) | GDPR data minimization |
| HIPAA-linked accounts | Up to 6 years may be required for audit-floor purposes | **Open, deferred.** This is why a single blanket non-EU purge job was not shipped alongside the EU one. | HIPAA 45 CFR 164.316(b)(2)(i) |
| Account-lifecycle deletion | The `AiApiLog` rows tied to a user account are deleted when that account is deleted | **Enforced today** (Flusher cascade) | Contract / FERPA |

The disclosure and the privacy policy state the account-lifecycle rule (already live, per PR #559)
and the enforced 90-day IP redaction as **currently enforced**, and state the EU/children/general
windows as the current **retention policy the company is rolling out**, being explicit about which
of those three is already live in code (EU only) versus decided-but-not-yet-enforced (children,
general). See `docs/legal/2026-08-09_data-retention_draft.md` (operative; predecessor `docs/legal/DATA_RETENTION.md` remains frozen), which carries the same breakdown instead of the stale flat "2 years" figure.

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
  tracked in `docs/legal/2026-08-09_data-retention_draft.md` and this project's `PROJECT.md`).
- ~~Resolving the Gemini/Vertex AI open item in section 4~~ -- resolved 2026-07-09 (disabled, PR #570).
- ~~Deciding whether scrubbed neutral board-gen can ever move to the Non-personal bucket~~ --
  resolved 2026-07-09 (Scot's provisional attestation). **Final position: reclassified
  Non-personal, no second-tier AI-data-sharing consent gate.** An initial position taken earlier the
  same session ("stays gated, no exemption") was **superseded later that same day** and is retained
  here only as history: it rested on the pre-2026-07-09 scrubber, which could not reliably catch an
  arbitrary name typed into the free-text board topic. `PiiScrubber` was hardened first (the
  ~1,656-entry `PiiScrubber::COMMON_FIRST_NAMES` gazetteer added to the AI-egress path), and only
  then was board generation reclassified. See section 4.2 above for the rationale and the stated
  residual risk, the section 3 table (row 1: Non-personal, gate column "No"), and
  `AI_DATA_SHARING_CONSENT.md` section 7, which records the Non-personal reclassification as the
  current, final position. This reclassification covers AI board generation ONLY: word prediction
  and eval narration remain Regulated PII and stay gated.
  Confirmed in shipped code, not only in these documents: board generation is deliberately absent
  from the second-tier disclosure inventory in `lib/lingo_linq/ai_consent_disclosures.rb` (see the
  comment at the `data_categories` boundary, which cites section 4.2 by name), and the user-facing
  copy at `config/locales/en.yml` (`board_suggestions_note`) tells parents that board suggestions
  "are not covered by this consent."
  **[Correction 2026-08-06.** This bullet previously read "resolved 2026-07-09 (Scot's provisional
  attestation: stays gated)", stating the superseded initial position as the outcome. That
  contradicted this document's own section 3 table and section 4.2, `AI_DATA_SHARING_CONSENT.md`
  section 7, and the shipped implementation cited immediately above. The decision itself is
  unchanged; only this document's description of it is corrected.**]**
- Selecting and vetting a specific government-ID-verification vendor/integration for Phase 3 (the
  *method* -- gov-ID match -- is decided; the vendor is not).
- Formal outside-counsel legal review of this document and the disclosure content (deferred to
  pre-launch, see `AI_DATA_SHARING_CONSENT.md` section 9).
