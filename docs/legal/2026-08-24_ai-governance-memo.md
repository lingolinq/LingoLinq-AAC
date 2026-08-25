# LingoLinq AAC AI Governance Memo

> # DRAFT - NOT YET ATTESTED
>
> **This successor carries NO attestation of its own.** It supersedes the CEO-attested
> `docs/legal/AI_GOVERNANCE_MEMO.md` (`DOC-39f37f8200`, ATTESTED 2026-08-04 by Scot Wahlquist, CEO;
> prior attestations 2026-06-19, 2026-07-13, 2026-07-19, 2026-07-22, 2026-07-24, 2026-07-27), which
> remains frozen and byte-identical as the signed record. Every "ATTESTED" and "re-attested"
> statement reproduced anywhere below, including in section headings, amendment trailers and the
> closing paragraph, belongs to **predecessor versions** and is retained as history; none of them
> attests these bytes. See "Corrections in this successor" below for what changed and why.

**Owner:** Scot Wahlquist, CEO
**Supersedes:** `docs/legal/AI_GOVERNANCE_MEMO.md` (`DOC-39f37f8200`), which remains frozen at the
bytes attested 2026-08-04 with its own attestation block unaltered. This dated record is the
operative AI governance memo from 2026-08-24 forward. **The document register
(`audit-reports/DOCUMENT-REGISTER.json`) is the authoritative record of this file's attestation
state.** Where this file describes its own attestation state below, read it as the state at the time
these bytes were written, not as a live status; rule 3 of `docs/legal/README.md` freezes these bytes
on attestation, so a live status written into them could not later be corrected.
**Created:** 2026-06-13 (predecessor lineage); this successor 2026-08-24.

**Reason for supersession -- two independent defect classes, corrected together.**

*First, stale Bedrock runtime status.* In four places the predecessor states or implies that the
runtime AI path has been **not operational since revision `00014-5rw`** (2026-08-04T06:31:46Z) and
that `AiClient.configured?` is false: the section 2 operational-status note, the section 3 BAA
coverage-boundaries bullet, the "Runtime routing update" correction paragraph, and the closing
2026-08-04 attestation trailer. Credentials were re-mounted 53 minutes after that withdrawal, on
`00015-9l9` at 2026-08-04T07:25:08Z, and the runtime path has since carried user-attributed traffic
(63 of 64 `AiApiLog` rows carry a `user_global_id`; `docs/legal/2026-08-16_subprocessor-register.md:99`).
The predecessor's section 2 inventory table also still describes `ANTHROPIC_API_KEY` as required,
which its own "Runtime routing update" section contradicts. This is **at least the seventh** record
in this lineage to carry a runtime-status claim that a later deploy invalidated. Already superseded
for that defect class: `docs/legal/AWS_BAA_ACCEPTED.md`,
`docs/legal/2026-08-11_aws-baa-acceptance-record.md`, the subprocessor register, the Anthropic BAA
acceptance record, the incident-response and breach runbook, and the AI data-flow classification.

*Second, falsified Article 50 status.* The predecessor states that the 50(1) disclosure modal is
"built and staged, gated OFF, not yet enabled for any user", that "the whole path is inert", and
that the modal is "shown to no one in production". A direct audited production read on 2026-08-23
falsified all three: the `article_50_disclosure` flag **IS ENABLED** in production via the
`default_enabled_features` DB `Setting`, which overrides the code constant. See
`docs/legal/2026-08-23_article-50-production-flag-verification.md` (`DOC-6c023a20a0`, an UNATTESTED
evidence record) and the Corrections table below.

**Scope of this revision.** Unlike the 2026-08-19 draft this revision incorporates, whose scope note
read that "section 5.2 (EU AI Act Article 50) was carried forward from the predecessor unchanged and
was NOT re-verified", **section 5.2 IS re-verified here** against the 2026-08-23 production read.
Both defect classes above are corrected in these bytes. What is NOT re-verified: every claim outside
those two classes is carried forward from the predecessor on the predecessor's evidence, and this
record does not re-assert it.

**Attestation history in this file is the predecessor's.** Every attestation date in the banner, in
section headings, in section 8 and in the closing trailer describes
`docs/legal/AI_GOVERNANCE_MEMO.md`, not these bytes. Only Scot attests, and the register row is
where that is recorded.

**Citation repair (claim-neutral), and its stated limit.** The predecessor's four
operational-status cross-references pointed at `docs/legal/AWS_BAA_ACCEPTED.md`, which is now
`superseded` in the register. All four are retargeted here to the operative record,
`docs/legal/2026-08-12_aws-baa-acceptance-record.md` (`DOC-82e90ba16a`). One BAA-designation
citation in the "Runtime routing update" section is likewise retargeted from the superseded
`docs/legal/ANTHROPIC_BAA_ACCEPTED.md` to `docs/legal/2026-08-16_anthropic-baa-acceptance-record.md`.
No claim changed in either retargeting.

**The limit, stated rather than left to be discovered:** five further citations of
`docs/legal/ANTHROPIC_BAA_ACCEPTED.md` remain in this file (the 2026-07-18 addendum, the section 3
HIPAA-basis discussion, and the section 8 amendment trail). They are **deliberately not retargeted**,
because each cites a specific live-verification detail ("Messages API 200, Files API 400") whose
wording was not confirmed to be carried forward into the 2026-08-16 successor, and asserting
otherwise would be exactly the kind of unverified claim this revision exists to remove. Those
citations still resolve: a superseded record keeps its row, its path, and its bytes. Retargeting them
belongs to a review of the Anthropic BAA posture, not to this correction.

> **Predecessor attestation history** (frozen on `docs/legal/AI_GOVERNANCE_MEMO.md`,
> `DOC-39f37f8200`): attested 2026-06-19, re-attested most recently 2026-08-04 by Scot Wahlquist,
> CEO; the intermediate re-attestations are recorded in section 8 and in that row's
> `priorAttestations`. Phase 3 deliverable. This memo documents how
> LingoLinq uses AI models, the controls that keep identifiable data out of external models, and
> the EU AI Act classification analysis. It is a living document; model ids and code citations are
> point-in-time and were re-verified against live code on 2026-06-19 prior to original attestation
> (see the note at section 8). Drafted by the compliance-officer; adversary-reviewed; attested by
> the CEO.
> One governance item (the DeepSeek-vs-compliance-surface discrepancy, section 4.1) was
> documented-open at the 2026-06-19 attestation and was RESOLVED on 2026-07-12 by Scot's
> ratified two-tier AI data-routing policy (see section 4.1: the bot already skips DeepSeek on
> compliance-path diffs; the policy reframes that skip as a permitted confidentiality preference,
> not a hard mandate). This resolution is covered by the 2026-07-13 re-attestation in section 8.
>
> Draft date: 2026-06-13. Refreshed 2026-06-18 (eval narration added to the inventory after
> #411/#412/#413; DeepSeek-on-compliance-surface discrepancy flagged in section 4). Re-verified
> and attested 2026-06-19. Refreshed 2026-07-12 (section 4.1 discrepancy resolved via Scot's
> ratified two-tier AI data-routing policy). Re-attested 2026-07-13. Refreshed 2026-07-18/19 (Anthropic HIPAA-Ready BAA recorded; section 3 HIPAA conclusion for the model-call path updated to BAA-covered; eval narration classified NOT a Healthcare Activity; model inventory updated). Re-attested 2026-07-19. Refreshed 2026-07-22 (Art50 Phase 5: section 5.2 rewritten to record that the 50(1) disclosure modal, ack endpoint, and first-AI-use gate are built and staged, gated OFF behind the `article_50_disclosure` flag registered AVAILABLE-only **[CORRECTION 2026-08-25: that 2026-07-22 description was falsified by the 2026-08-23 production read -- the flag IS ENABLED in production via the `default_enabled_features` DB Setting. See the Corrections table.]**; Phase 4 jurisdiction stamping shipped and un-inerts the EU log-retention purge; retention tiers reconciled). Re-attested 2026-07-22 by Scot Wahlquist, CEO (see section 8, 2026-07-22 amendment). Operative reference: NIST AI RMF plus the Generative AI Profile
> (NIST AI 600-1). ISO 42001 certification is not yet a small-vendor expectation and is out of
> scope for now.
>
> **ADDENDUM 2026-07-18 (posture change; flagged for re-attestation).** Since the last attestation,
> the Anthropic runtime egress path moved from "no model-provider BAA / provisional pending CEO
> review" to a **signed HIPAA-Ready BAA with HIPAA readiness enabled** on the runtime-dedicated
> LingoLinq, LLC Anthropic API org (executed and verified live 2026-07-18; see
> `docs/legal/ANTHROPIC_BAA_ACCEPTED.md`). PHI is now permitted to Anthropic over the Messages API
> under BAA terms (in-scope models only, no excluded features, no ZDR required), with the PiiScrubber
> retained as defense-in-depth. The eval-narration seam was reviewed against Anthropic's
> Healthcare-Activity conditions and classified (Scot, 2026-07-19) as an assistive-technology access /
> feature-match assessment (find-the-target tasks at shrinking grid sizes producing a hit/miss access
> recommendation), NOT a HIPAA "Healthcare Activity" - it does not diagnose, treat, or produce
> charting/billing/coding/claims. Anthropic Healthcare-Activity condition (iii) (licensed-clinician
> restriction) therefore does not apply, and there is no licensed-clinician gate on this path (see
> `docs/legal/ANTHROPIC_BAA_ACCEPTED.md` and audit-reports/FINDINGS.json LL-3a1c317a88). The applicable
> controls (Messages-API-only, PII scrub + student-name drop + etiology minimization, the
> EVAL_NARRATOR_MODEL exact-ID allowlist, COPPA gate, opt-in, org opt-out) shipped in the
> eval-narrator runtime-gates security PR (#632, merged 2026-07-19). The memo body below has been
> updated to this posture and re-attested 2026-07-19 (see section 8, 2026-07-19 amendment).

## Corrections in this successor

This successor exists only to correct claims the predecessor carries that a direct production read
falsified on 2026-08-23. Everything else is unchanged, and the predecessor's own historical
amendment narratives are retained verbatim as the record of what was believed and recorded at each
prior attestation.

| # | Claim in `AI_GOVERNANCE_MEMO.md` (attested 2026-08-04) | Correction |
|---|---|---|
| 1 | Section 5.2: the disclosure modal "is **built and staged, gated OFF**, not yet enabled for any user" (:261) | The flag is AVAILABLE-only in **code**, but production overrides the code constant through the `default_enabled_features` DB `Setting` and the flag **IS ENABLED** there. Verified 2026-08-23 by direct production read (`docs/legal/2026-08-23_article-50-production-flag-verification.md`, DOC-6c023a20a0, an UNATTESTED evidence record). |
| 2 | Section 5.2: "so it is **OFF for everyone by default and the whole path is inert** until the flag is enabled" (:266-268) | Not inert. `EuJurisdiction.disclosure_required?` is `status(user) != :non_eu` (`lib/eu_jurisdiction.rb:57-59`), fail-safe OPEN, so `:unknown` requires disclosure. In production `EuJurisdiction.status` is `:unknown` for **34 of 34** accounts and 29 of 34 were gated at the five AI ingresses as of `2026-08-23T23:23:41Z`. The path is maximal, not inert. |
| 3 | Section 8, 2026-07-22 amendment: "the modal is therefore **shown to no one** in production" (:426-428) | Overtaken by the same read. Retained verbatim as the historical record of the Phase 5 handoff, with a dated correction marker appended in place. |
| 4 | Population scope, stated by the predecessor only as a forward-looking deferral rationale ("prod carries no real EU users (internal/test accounts only)") | The 34 accounts above are **test/QA accounts, not real users** (confirmed by Scot, 2026-08-24). Production has no real user population. So the corrected posture is that the disclosure is **correctly configured and live**, and separately that **no real person has encountered an undisclosed AI interaction** - a stronger statement than the logs alone support, and one the predecessor could not make either way. |
| 5 | Stale **Bedrock runtime status**, in four places: the section 2 operational-status note, the section 3 BAA coverage-boundaries bullet, the "Runtime routing update" paragraph, and the closing 2026-08-04 trailer. All state or imply the runtime AI path has been not operational since revision `00014-5rw`. | False since 2026-08-04T07:25:08Z. Credentials were re-mounted 53 minutes after the withdrawal, on `00015-9l9`, and the path has since carried user-attributed traffic (63 of 64 `AiApiLog` rows carry a `user_global_id`). Corrections incorporated from the 2026-08-19 Bedrock truth-up (PR #827), which is superseded by this record and closed. |
| 6 | Section 5.2 and section 8: the Phase 4 jurisdiction helper "**un-inerts the EU log-retention purge**", which "now matches `jurisdiction = 'EU'` rows". | It does not. The stamp writes `'EU'` only for a CONFIRMED `:eu` user; `EuJurisdiction.status` is `:unknown` for 34 of 34 production accounts, so the stamp writes nothing and `purge_old_eu_logs!` matches nothing. The purge remains **inert**. This claim was falsified by the same 2026-08-23 read that falsified rows 1-3, and was missed by the first correction pass. |
| 7 | Section 5.2 described the deliverable as the "**EU-gated** AI-interaction disclosure modal". | The gate is fail-safe OPEN: `EuJurisdiction.disclosure_required?` is `status(user) != :non_eu` (`lib/eu_jurisdiction.rb:57-59`), so the modal is required for every account not authoritatively `:non_eu`, not for an EU subset. The "EU-gated" framing invited reasoning from the org histogram (0 of 2 EU orgs) rather than from the resolver, and is itself part of what made "shown to no one" plausible. |
| 8 | Section 5.2 carried a 2026-08-19 marker stating the section was "carried forward unverified" and that "**the production flag state was not read**". | Withdrawn. The production flag state WAS read on 2026-08-23. That marker's stated caution turned out to be exactly correct (a DB override can enable a flag registered AVAILABLE-only), so the predecessor's claim is not merely unchecked, it is false. |

**Enabled-since is NOT recoverable.** `Setting` carries no version history and `Setting.set` overwrites
in place, so no claim is made here about when the flag became enabled, nor about the flag's state on
or before the 2026-08-02 Article 50 obligation date.

---

## 1. Purpose

LingoLinq is an AI-first AAC tool. AI assists communication (word and phrase prediction) for
people who use the product to speak, including under-13 users, students, and patients. Because
of who relies on it and the data it touches, AI use is governed, not ad hoc. This memo records
the model inventory, the data-handling controls, the human-oversight points, and the regulatory
classification, so that an auditor or a district procurement reviewer can see substantiated
practice rather than a capability claim.

## 2. Model inventory

Verified against code at draft time. Re-verify before publishing.

> **Operational status, corrected 2026-08-19. The runtime AI path is OPERATIONAL for word
> prediction and board generation.** Those are the only two request types observed in the evidence
> (57 `word_prediction`, 7 `board_generation`). **Eval narration is NOT operational** and no call on
> that path is recorded: on the classic Bedrock plane only `anthropic.claude-haiku-4-5` has an
> inference-profile mapping, so Claude Opus 4.7 is not invokable and the seam falls back to its
> deterministic local template (see the plane correction in the "Runtime routing update" section).
> Do not read the headline as PHI-bearing assessment content egressing today. This
> supersedes the predecessor's "Operational status, corrected 2026-08-04" note, which closed with
> "credentials were withdrawn on 2026-08-04T06:31:46Z (revision `00014-5rw`) and
> `AiClient.configured?` is false again as of that timestamp." That sentence was true for 53
> minutes. Credentials were re-mounted on `00015-9l9` at 2026-08-04T07:25:08Z and were present on
> **every revision through `lingolinq-web-00020-per`, swept 2026-08-16**
> (`docs/legal/2026-08-16_anthropic-baa-acceptance-record.md` section 2.2 carries that per-revision
> mount table and records that **no revision numbered `00019` exists**, the numbering gap following
> from an aborted deploy). **No revision created after `00020-per` has been checked**, by that sweep
> or by this revision. An earlier draft of this sentence cited
> `docs/legal/2026-08-12_aws-baa-acceptance-record.md` section 2.1, whose sweep ends at `00018-cup`
> and which states that no newer revision existed at its evidence time; that citation could not
> support a claim about `00020-per` and was corrected on review.
>
> **History, retained because the mount history is not monotonic.** The runtime rows were not
> operational from 2026-07-30T16:37Z until 2026-08-03T08:23:02Z. Revision `00013-76w` mounted
> `BEDROCK_AWS_KEY` / `BEDROCK_AWS_SECRET` at 2026-08-03T08:23:02Z and the path ran for roughly 22
> hours, carrying exactly one internal verification call (`word_prediction`, no user attached, no
> user or student data). Credentials were withdrawn on `00014-5rw` at 2026-08-04T06:31:46Z and
> restored on `00015-9l9` at 2026-08-04T07:25:08Z. A credential-presence claim about a Cloud Run
> service is a claim about one revision at one instant; state the revision and the observation time,
> and sweep every revision rather than checking the newest one.
>
> **What the evidence for this correction establishes.** The serving revision verified in the
> evidence for this correction was **`lingolinq-web-00020-per`**, and its Bedrock credentials
> (`BEDROCK_AWS_KEY`, `BEDROCK_AWS_SECRET`) were **Secret-Manager-backed** references rather than
> literals. Production `AiApiLog` held **64 application-observed rows through 2026-08-14T21:13:27Z**.
> **Zero non-null `organization_global_id` values were observed** on those rows. That last point is
> itself a correction: an earlier reading of this evidence was reported as traffic from "two orgs",
> which conflated the count of organizations then present in production with organization
> attribution on the log rows. No row carried an organization attribution.
> **User attribution, recorded here because the header asserts it:** 63 of the 64 rows carry a
> `user_global_id`, 63 were written since the 2026-08-12 production deploy of PR #734, and by type
> the rows are 57 `word_prediction` and 7 `board_generation`
> (`docs/legal/2026-08-16_subprocessor-register.md:99`). That sibling record states all 64 calls
> succeeded; this record does not repeat that, because success per call is a vendor-side fact and
> the limits below apply.
>
> **What the evidence does NOT establish, stated rather than glossed.**
> - **No AWS-side or vendor-side confirmation was obtained.** No CloudWatch `AWS/Bedrock`
>   `Invocations` metric and no CloudTrail `bedrock:InvokeModel` record was retrieved. Every count
>   above is application-observed, from LingoLinq's own database.
> - **Mounted credentials and current configuration do not prove traffic.** A credential on a
>   revision proves the path *can* be exercised, not that it *is* being exercised, not that traffic
>   is continuous, and not that any individual call succeeded. Read "operational" as "credentialled
>   and observed to have carried logged calls," nothing stronger.
> - **`AiApiLog` is a floor, not a ledger.** `AiApiLog.log_ai_call` rescues
>   `ActiveRecord::ActiveRecordError` and returns an unsaved record (`app/models/ai_api_log.rb`), and
>   `Flusher.flush_user_logs` destroys rows by `user_global_id` on user erasure (`lib/flusher.rb`),
>   so the table can under-record active egress.
> - **A `configured?` result read from the migration job is not evidence about the web runtime.** An
>   `AiClient.configured? == false` result obtained from the `lingolinq-migrate` Cloud Run job is
>   **non-representative of the serving web runtime**: the job and the web service carry separate
>   container configurations, and prod job images are known to drift from the web image. That result
>   must not be cited as evidence that runtime AI was inactive.
>
> **How this evidence was gathered.** Read-**mostly**, not read-only. The Rails runner used to
> collect the aggregates above created **three framework `AuditEvent` session-open rows** as a
> side effect of opening console sessions. It changed no application record, no `AiApiLog` row, no
> document, no feature flag, no secret, and no Cloud Run configuration. Calling that pull "read-only"
> would be wrong, so it is not called that here.
>
> The direct `api.anthropic.com` route was removed by PR #681 and is CI-enforced. Read the
> "Sees user data?" column as *when the path is live*, which it now is. The routing and credential
> detail below is further superseded by the "Runtime routing update" section later in this memo. See
> also `docs/legal/2026-08-12_aws-baa-acceptance-record.md` (operative AWS BAA acceptance record)
> and `docs/legal/2026-08-17_ai-data-flow-classification.md` (operative classification of the flow).

| Use | Model(s) | Where | Sees user data? | Control |
|---|---|---|---|---|
| Word/phrase prediction (runtime) | Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) only -- Gemini fallback disabled 2026-07-09 | `lib/ai_word_predictor.rb` | Yes, but **scrubbed first** | Every sentence passes `PiiScrubber.redact_for_ai` before the call (line 55); each call logged to `AiApiLog`. Feature-flag gated, COPPA hard block for under-13. **Corrected 2026-08-19:** this cell read "`ANTHROPIC_API_KEY` is now required", which the "Runtime routing update" section below has contradicted since 2026-07-24. Runtime credentials are `BEDROCK_AWS_KEY` / `BEDROCK_AWS_SECRET`, read by `lib/ai_client.rb`; no runtime seam reads `ANTHROPIC_API_KEY`, and `scripts/ai-endpoint-guard.sh` fails CI if one starts to. There is no automatic fallback provider. |
| Offline prediction dictionary generation | Claude Haiku 4.5 only -- Gemini fallback disabled 2026-07-09 | `lib/ai_prediction_generator.rb` | No | Offline batch job; sends only static word lists, never user sentences or identifiers. |
| Comprehensive eval narration (runtime, product) | Claude Opus 4.7 (`claude-opus-4-7` default; `EVAL_NARRATOR_MODEL` override **pinned to an exact-ID allowlist**), Anthropic under the HIPAA-Ready BAA (2026-07-18) | `lib/eval_narrator.rb`, `app/controllers/api/eval_sessions_controller.rb` | Yes, but **scrubbed first** | `PiiScrubber.redact_for_ai` on the payload before egress, plus a structural student-name drop and **`etiology` (medical-cause) minimization**; model pinned to an exact-ID allowlist (`ALLOWED_MODELS`, refuses Covered/unknown models); every call logged to `AiApiLog`; COPPA hard block (`FeatureFlags.coppa_blocks_ai_for?`) for under-13; external narration is opt-in and the egress payload is bound to the server-resolved user; org opt-out via the `comprehensive_eval_ai` feature flag. **Classified NOT a HIPAA Healthcare Activity** (assistive-technology access assessment; Scot 2026-07-19; register LL-3a1c317a88), so no licensed-clinician gate applies. Consent-binding was tracked as LL-11db0dc848, **verified-closed** (disposition `fixed`, decided by Scot 2026-06-18); corrected 2026-08-19, the predecessor still described it as an open residual gap. Brought under governance by #411/#412 (#413), BAA + gates by #631/#632. |
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
  written against the category, not the two current names. The `EVAL_NARRATOR_MODEL` override in
  `lib/eval_narrator.rb` (default `claude-opus-4-7`) is now **pinned to an exact-ID allowlist**
  (`EvalNarrator::ALLOWED_MODELS`, enforced fail-closed at call time and best-effort at boot; #632),
  so it structurally refuses any Covered Model or unrecognized id rather than relying on policy
  alone. For any **other** model-override env var, none may ever be pointed at an Anthropic Covered
  Model, current or future-designated; confirm against the Privacy Center page above before
  repointing. The current runtime AI inventory (Claude Haiku 4.5, Claude Opus 4.7) is unaffected: it
  is now covered by the Anthropic HIPAA-Ready BAA (2026-07-18), under which the Messages API is
  HIPAA-eligible with no ZDR required.

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
- **The Anthropic runtime egress path is now covered by a signed BAA (executed 2026-07-18); the
  scrubber is defense-in-depth on top of it, not the sole control.** Anthropic's HIPAA-Ready BAA
  was executed and HIPAA readiness enabled on the runtime-dedicated LingoLinq, LLC Anthropic API
  org (verified live: Messages API 200, Files API 400; see `docs/legal/ANTHROPIC_BAA_ACCEPTED.md`).
  All three product AI seams (word prediction, board generation, eval narration) call only the
  Messages API on that org's key, which is HIPAA-eligible with no ZDR required, so the model
  provider receiving the call is now a signed Business Associate. This **closes the prior open gap**
  (previously recorded here as "no signed BAA covers the model-provider egress path / the scrubber
  is the only control"): the HIPAA legal basis for the Anthropic path now rests on the BAA, and the
  PiiScrubber becomes a data-minimization control layered on top.
- **The scrubber remains necessary even with the BAA, but for a different reason.** It is
  **pseudonymization, not de-identification**: it removes known direct identifiers before the call,
  but the result does not meet HIPAA Safe Harbor (all 18 identifier categories) or Expert
  Determination, and under GDPR/UK-GDPR pseudonymized data is still personal data. So the scrubber
  is retained as the GDPR data-minimization control and defense-in-depth, not as the HIPAA legal
  basis (which is now the BAA).
- **Coverage boundaries.** The AWS BAA on file (2026-02) covers HIPAA-eligible AWS services in use
  under account 2390-4478-5114, including S3/KMS/RDS **and Amazon Bedrock** (the designated runtime
  AI route as of 2026-07-24 and, **corrected 2026-08-19, operational in production** (this bullet
  read "**not operational in production** as of 2026-08-04, having been operational only
  2026-08-03T08:23Z to 2026-08-04T06:31Z for internal verification"; see the 2026-08-19
  operational-status note in section 2 for the evidence and, importantly, its limits); Fable/Mythos
  excluded). It does **not** by itself cover a *direct*
  third-party model endpoint outside AWS (e.g. `api.anthropic.com`); that direct path is covered by
  the Anthropic HIPAA-Ready BAA when used, and is unused at runtime today. The Google Cloud BAA
  (2026-07-12) covers Google **infrastructure**, not a model-provider egress path. **Google (Gemini)
  as a model provider has no BAA**, but its runtime fallback was disabled 2026-07-09 (no AI inference
  reaches Google today); if it is ever reactivated, a covered-service / BAA check is required first
  (see section 7, `rev-gemini-baa-annual`). No un-BAA'd model-provider egress path is live.
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
is covered by Scot's 2026-07-13 re-attestation in section 8.**

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

### 5.2 Article 50 transparency (decided position)

> **RE-VERIFIED 2026-08-23 (marker replaced 2026-08-25).** An earlier marker here, added by the
> 2026-08-19 Bedrock-scoped revision, said this section was "carried forward unverified" and that
> "**the production flag state was not read**". **That is no longer true and the marker is
> withdrawn.** The production flag state WAS read, by direct audited production query on
> 2026-08-23, and this section is corrected against it. The caution that marker raised turned out
> to be exactly right: the `article_50_disclosure` flag is registered AVAILABLE-only in
> `lib/feature_flags.rb`, and production DOES serve it from a `default_enabled_features` database
> override that enables it. So the predecessor's "off for everyone" claim was false, not merely
> unchecked. Evidence: `docs/legal/2026-08-23_article-50-production-flag-verification.md`
> (`DOC-6c023a20a0`, an UNATTESTED evidence record). What remains unverified in this section is
> everything outside the flag-state question, which is carried forward on the predecessor's
> evidence.

Article 50 transparency obligations apply from **2026-08-02** and are not limited to high-risk
systems. They cover disclosing AI interaction to users (50(1)) and marking synthetic or
AI-generated content (50(2)). This section states LingoLinq's **decided** applicability
position; it supersedes the earlier "plan/decide" framing (see the 2026-07-13 amendment note in
section 8, re-attested 2026-07-14). Full analysis with code citations:
`docs/legal/EU_AI_ACT_ARTICLE_50_PLAN.md` (sections 8 and 9) and the readiness brief
`ai-company-brain/outputs/docs/2026-07-13-eu-ai-act-art50-readiness-brief.md`.

**Article 50(2) -- machine-readable marking of synthetic output:**
- **Board generation, AI focus words, and comprehensive eval narration are in scope and are
  marked.** Marking shipped via `lib/art50_marker.rb` (HMAC-SHA512 provenance attestation
  persisted at `board.settings['ai_generated']`, re-verified server-side on every read; a marker
  that fails verification is treated as unmarked, i.e. failure is toward under-claiming).
  Delivered in PRs #505/#507/#511 (board gen), #573 (focus words + eval narration), and
  **released to `main`/prod via PR #584 on 2026-07-13** -- `main` and `staging` are byte-identical
  on the marking surfaces.
- **Word/phrase prediction is OUT of 50(2) scope, via the assistive-function carve-out.** Art.
  50(2) "shall not apply to the extent the AI systems perform an assistive function for standard
  editing or do not substantially alter the input data provided by the deployer or the semantics
  thereof." `AiWordPredictor.predict` returns candidate next words that the user then selects
  into their own utterance; suggestions are never persisted (in-memory LRU, 30-min TTL). The only
  durable output is the user's own human-authored communication, so marking it would falsely
  label human speech (often a COPPA-covered child's) as AI-generated -- a harm, not compliance.
  This decision is **test-locked** (`spec/lib/ai_word_predictor_spec.rb`) so it cannot silently
  regress. Code: `lib/ai_word_predictor.rb:91-104`.
- **50(3) emotion recognition / biometric categorisation and 50(4) deep fakes / public-interest
  text are N/A** -- LingoLinq runs none.

**The 2026-12-02 marking grace does NOT give LingoLinq headroom.** The grace comes from the
**Digital Omnibus on AI amending regulation** (Council final adoption 2026-06-29; OJ publication
expected July 2026, in force on the third day after publication -- re-verify at EUR-Lex before
citing to counsel or a customer), **not** the original Regulation (EU) 2024/1689. It defers only
the 50(2) marking sub-obligation, and **only for AI systems already placed on the EU market
before 2026-08-02.** A system first placed on the EU market from 2026-08-02 onward must mark
immediately, with no grace. LingoLinq has no EU deployment today, so its first EU deployment is a
"new" system with no December grace -- and in any case the in-scope surfaces are already marked,
so no grace is needed for them.

**Article 50(1) -- disclosure of AI interaction:**
- Board generation and word prediction implicate 50(1) (disclose that the feature is AI). The
  deliverable is the **AI-interaction disclosure modal** shown before first AI generation. (It was described here as "EU-gated"; that framing was itself part of the defect corrected 2026-08-25. `EuJurisdiction.disclosure_required?` is fail-safe OPEN, so the modal is required for every account whose jurisdiction is not an authoritative `:non_eu`, not for an EU subset.)
  It is **built, staged, and ENABLED IN PRODUCTION** (corrected 2026-08-24; the predecessor said
  "gated OFF, not yet enabled for any user", which a direct production read falsified on
  2026-08-23 - see "Corrections in this successor"). Shipped to `staging`:
  the shared, accessible modal component (`app/frontend/app/components/ai-disclosure.{hbs,js}`), the
  acknowledgement endpoint (`POST .../article_50_disclosure_ack` -> `users#article_50_disclosure_ack`,
  `User#mark_article_50_disclosure_shown!`), and the shared first-AI-use gate
  (`app/frontend/app/utils/article50_gate.js`) wired at the board-generation and eval-narration call
  sites (PR #646, Phase 3). The gate reads a single input,
  `appState.feature_flags.article_50_disclosure`; that flag is registered in
  `AVAILABLE_FRONTEND_FEATURES` only (Phase 5, RLL-01). **That is a statement about CODE, not about
  production.** `FeatureFlags` resolves the effective list through
  `SystemFeatureSettings.default_enabled_features`, a `Setting` DB row that falls back to the code
  constant only when unset - and in production that row is SET and contains
  `article_50_disclosure`. The flag is therefore **ON**, and because
  `EuJurisdiction.disclosure_required?` is fail-safe open (`:eu` and `:unknown` both require
  disclosure) the modal is required for every account, not a subset. Corrected 2026-08-24; the
  predecessor read "OFF for everyone by default and the whole path is inert until the flag is
  enabled". Note the delivered flag name is
  `article_50_disclosure` (the earlier plan named it `article_50_disclosure_modal`).
- **The flag is ENABLED in production.** Verified 2026-08-23 by direct read
  (`docs/legal/2026-08-23_article-50-production-flag-verification.md`, DOC-6c023a20a0). Enabling
  **was** the hard 2026-08-02 release gate, on Scot's explicit sign-off after the production deploy
  of Phases 3-5; that gate is discharged for the current production `Setting`. This documentation
  change records the verified state. It does not itself enable or disable the flag. Enabled-since
  remains unrecoverable (`Setting` has no version history), so this is not a claim about the flag's
  state on or before 2026-08-02.
- **The 2026-07-09 interim deferral is dated history, not current posture.** That fallback memo
  accepted keeping the flag OFF short of 2026-08-02 because prod carried no real EU users
  (internal/test accounts only), and treated onboarding a real EU customer as the trigger to enable.
  Those sentences were current operational instructions through the 2026-07-22 Phase 5 rewrite. They
  are **withdrawn as live guidance** as of the 2026-08-23 production read: the flag is ON via the
  `default_enabled_features` DB `Setting`, and because `EuJurisdiction.disclosure_required?` is
  fail-safe open the modal is required for every account. Production still has no real users
  (test/QA only, confirmed 2026-08-24); that fact limits what the gating figures demonstrate. It
  does not restore an OFF posture.

**Ownership -- the 50(1) modal originated on the VPC track.** Build and delivery of the Article
50(1) disclosure modal belonged to the **VPC (Verifiable Parental Consent) GSD project** as a phase
on that track, not to any standalone Article 50 effort or compliance-doc thread. Its linchpin
dependency -- a shared call-context helper (`LingoLinq::Article50CallContext.for`) that stamps
`jurisdiction:` at the three AI call sites (board generation, word prediction, eval narration) --
**shipped as Phase 4 (PR #635)**, and that same helper was described as un-inerting the EU log-retention purge
(`AiApiLog.purge_old_eu_logs!`). **[CORRECTION 2026-08-25: it does not. The stamp writes
`jurisdiction = 'EU'` only for a CONFIRMED `:eu` user. Production has zero confirmed EU users
(`EuJurisdiction.status` is `:unknown` for 34 of 34), so the stamp writes nothing and
`purge_old_eu_logs!` matches nothing. The purge remains inert. See
`docs/legal/2026-08-23_article-50-production-flag-verification.md` section 4 item 1.]** The helper is
deployed wherever Phase 4 is
deployed (staged; effective in production after the Phase 4/5 prod deploy). Boundary rules that
remain in force: **(1)** only the code track edits the three AI call sites, the
`article_50_disclosure` flag, and the 50(1) paragraph of this section; **(2)** this section 5.2 is the
shared contract -- any Article 50 thread reads it first and updates it last; **(3)** this section was
re-written by the Phase 5 shipping thread on modal delivery and, as written at that time, awaited
Scot's re-attestation per section 6. **[Discharged 2026-07-22: Scot Wahlquist, CEO, re-attested the
Phase 5 section 5.2 rewrite on that date; see the 2026-07-22 amendment in section 8. The clause is
retained as the historical record of the Phase 5 handoff. No re-attestation of this section was
outstanding as of 2026-08-04, when the PREDECESSOR (`docs/legal/AI_GOVERNANCE_MEMO.md`) was last
attested. **Corrected 2026-08-19:** that final clause read "the document's current attestation is
2026-08-04", which described the predecessor and does not describe this successor; see the scope
statement in the header for what an attestation of this record covers.]**
Compliance-posture documentation (this memo, the calendar) remains a separate, non-code workstream
and never edits the call sites.

Tracked on the compliance calendar (`fix-euaiact-art50-2026-08-02`,
`fix-euaiact-art50-2-2026-12-02`).

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
- [x] **RESOLVED 2026-07-18 (raised by Codex review of PR #579):** the Anthropic model-provider
      egress path now has a signed BAA. Anthropic's HIPAA-Ready BAA was executed and HIPAA readiness
      enabled on the runtime-dedicated LingoLinq, LLC org 2026-07-18, verified live (Messages API
      200, Files API 400); see `docs/legal/ANTHROPIC_BAA_ACCEPTED.md` and the updated section 3.
      Google (Gemini) as a model provider still has no BAA, but its runtime fallback is disabled and
      that residual is held by the `rev-gemini-baa-annual` reactivation gate above. Covered by
      Scot's 2026-07-19 re-attestation in section 8.
- [ ] Per-feature data-flow documentation for each of the AI-gated features (feature flags
      enumerate the surface; the data-flow docs are the gap).
- [ ] Vendor terms on file for every model provider in the inventory, with renewal tracking:
      Anthropic HIPAA-Ready BAA on file (2026-07-18); OpenRouter is terms-only / ZDR (Tier 2 dev
      reviewer, no BAA); Google (Gemini) model-provider terms still pending (runtime path disabled).
- [x] Finalize the Article 50 applicability decision before 2026-08-02: DECIDED 2026-07-13, now
      stated in section 5.2 (board gen / focus words / eval narration in scope + marked + on
      prod; word prediction out of scope via the assistive-function carve-out; 50(3)/50(4) N/A;
      50(1) EU modal deferred-with-ratified-fallback on the COPPA VPC track). The section 5.2
      restatement was **re-attested 2026-07-14** (see section 8, 2026-07-13/07-14 amendment). The
      50(1) modal build is owned by the VPC GSD project as VPC Phase 4+ (see section 5.2 ownership
      note).
- [ ] Model inventory kept current as models are upgraded (the ids above are point-in-time).
- [ ] Resolve the eval-narration consent-binding residual (LL-11db0dc848): bind the COPPA/consent
      gate subject to the eval content actually egressed, via server-side eval persistence
      (migration follow-up Phase 1B). Until then the control gates on a caller-asserted user_id.
- [x] Resolve the DeepSeek-vs-compliance-surface discrepancy in section 4.1: RESOLVED 2026-07-12
      via Scot's ratified two-tier policy (Option 2 -- PII-free compliance documents are Tier 2).
      Covered by Scot's 2026-07-13 re-attestation in section 8.
- [ ] **Dormant `ANTHROPIC_API_KEY` credential: decommission is incomplete (added 2026-08-19).**
      Tracked separately from the runtime-status correction above, because it is an infrastructure
      item and not a claim about whether AI is operational. The key had been inert since the Bedrock
      cutover: no code under `app/`, `lib/`, or `config/` reads it, and `lib/ai_client.rb` never
      constructs a direct `api.anthropic.com` client. **PR #805 is MERGED (2026-08-17T22:43:36Z)**
      and removed `ANTHROPIC_API_KEY` from `NON_BOOT_SECRETS` in
      `.github/workflows/deploy-cloudrun.yml`, so new revisions do not mount it; the removal is
      recorded in the comment at `.github/workflows/deploy-cloudrun.yml:227-232`. That comment reads
      "REMOVED from this list on 2026-08-15", which is the date the change was authored; it merged
      2026-08-17T22:43:36Z. Two honest limits.
      (1) The revision named in the section 2 evidence, `lingolinq-web-00020-per`, still carried the
      dormant mount; whether a post-#805 revision is now serving without it was **not re-queried in
      this revision**. (2) Removing the mount is not a decommission: the credential is still an
      actively-provisioned app secret (`scripts/gcp/phase1-setup.sh:101`,
      `scripts/gcp/phase4-seed-app-secrets.sh:66,78`) and is still in the Render sync manifest
      (`scripts/sync-render-env.js:145`), and it has not been revoked. That residual is register
      finding **`LL-94e57af291`** (low, open). The structurally identical `GEMINI_API_KEY` mount is
      still present in that same list and is register finding **`LL-bdc3344942`** (low, open);
      `scripts/ai-endpoint-guard.sh` guards the Anthropic seam but not the Gemini one.

## 8. Attestation

> **THIS SUCCESSOR IS NOT ATTESTED.** The table below records the attestation history of the
> **predecessor** (`docs/legal/AI_GOVERNANCE_MEMO.md`, DOC-39f37f8200), which remains the signed
> record. No row in it attests these bytes. If Scot attests this successor, a new statement dated to
> that attestation must be written here first.

| Field | Value |
|---|---|
| Prepared by | compliance-officer agent (draft); this successor drafted by Claude Code 2026-08-24 |
| Reviewed by | adversary agent (predecessor); this successor pending dual review |
| **Attested by (THIS document, v2026-08-24)** | **NOT YET ATTESTED - awaiting Scot Wahlquist, CEO** |
| **Attestation date (THIS document)** | **pending** |
| Attested by (PREDECESSOR versions only) | Scot Wahlquist, CEO |
| Original attestation date (predecessor) | 2026-06-19 |
| Latest re-attestation date (predecessor) | 2026-08-04 |
| Prior re-attestation dates (predecessor) | 2026-07-13; 2026-07-14; 2026-07-19; 2026-07-22; 2026-07-24; 2026-07-27 |

_Attestation-block realignment, 2026-08-05._ Until this revision three places in this memo named
three different "latest" dates: the header banner said 2026-07-27, the table row above said
2026-07-24, and the closing trailer recorded the 2026-08-04 re-attestation. The register
(`audit-reports/DOCUMENT-REGISTER.json`) had pinned this document at 2026-08-04 throughout. The
table and banner are now aligned to 2026-08-04 and the superseded dates are preserved in the row
above rather than dropped. No claim in the body changed.

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
memo's HIPAA-defensibility conclusion for the model-call path and is covered by Scot's 2026-07-13
re-attestation**; section 3 is the current attested position **of the predecessor** (`DOC-39f37f8200`; these bytes are unattested), per the same governance the memo
requires of every other open item (section 6: AI drafts and flags, humans attest and accept risk)._

_Amended 2026-07-13, re-attested 2026-07-14: section 5.2 was rewritten from a "plan/decide"
outline into LingoLinq's **decided** Article 50 applicability position, and the section 7 open
item "Finalize the Article 50 applicability decision" was marked resolved. This is a
**substantive** change to the attested EU AI Act analysis (it records decisions -- board
generation / focus words / eval narration in 50(2) scope and marked; word prediction out of
50(2) scope via the assistive-function carve-out; 50(1) EU modal deferred with a ratified
fallback). Per section 6 (AI drafts and flags, humans attest and accept risk), Scot reviewed and
**re-attested this section on 2026-07-14**; section 5.2 is now the current attested Article 50 position **of the predecessor** (`DOC-39f37f8200`; these bytes are unattested)
position. Code and legal citations re-verified against live `origin/staging` and
`origin/main` on 2026-07-13; the 2026-12-02 Digital Omnibus grace basis was corrected (it does
not give LingoLinq headroom -- see section 5.2). Supporting analysis:
`ai-company-brain/outputs/docs/2026-07-13-eu-ai-act-art50-readiness-brief.md`._

_Re-attested 2026-07-13 by Scot Wahlquist, CEO: covers the 2026-07-11 HIPAA-basis correction in
section 3 and the 2026-07-12 DeepSeek-vs-compliance-surface resolution in section 4.1. The original
2026-06-19 attestation remains the Phase 3 baseline; this re-attestation accepts the post-baseline
corrections and resolves the pending markers above._

_Amended 2026-07-18/19, re-attested 2026-07-19 by Scot Wahlquist, CEO: **substantive full-body
update recording the executed Anthropic HIPAA-Ready BAA and the eval-narration classification.**
(1) Section 3's HIPAA conclusion for the model-call path is **reversed** from the 2026-07-11 "no
signed BAA covers the model-provider egress path / scrubber-only open gap" to **BAA-covered**:
Anthropic's HIPAA-Ready BAA was executed and HIPAA readiness enabled on the runtime-dedicated
LingoLinq, LLC Anthropic API org on 2026-07-18, verified live (Messages API 200; Files API 400,
"not available for HIPAA-regulated organizations without Zero Data Retention"); see
`docs/legal/ANTHROPIC_BAA_ACCEPTED.md`. The PiiScrubber is reframed as the GDPR data-minimization /
defense-in-depth control rather than the HIPAA legal basis, which now rests on the BAA. The section
7 open item raised by Codex on PR #579 ("no signed BAA covers the Anthropic egress path") is marked
resolved. (2) Eval narration is classified **NOT a HIPAA Healthcare Activity** (an
assistive-technology access / feature-match assessment; register `LL-3a1c317a88`), so no
licensed-clinician gate applies; the `EVAL_NARRATOR_MODEL` exact-ID allowlist and `etiology` egress
minimization shipped in #632. The model inventory (section 2) and its Covered-Model note were
updated accordingly. This is a **substantive** change to the attested HIPAA analysis; per section 6
(AI drafts and flags, humans attest and accept risk), Scot reviewed and re-attested it on
2026-07-19. Code, BAA, and classification citations were verified against `origin/staging` (PRs
#631 and #632 merged 2026-07-19) and the live Anthropic API._

_Amended 2026-07-22, re-attested 2026-07-22 by Scot Wahlquist, CEO: **EU AI Act Article 50 Phase 5
refresh.** Section 5.2 was rewritten to record that the Art. 50(1) user-facing AI-interaction
disclosure modal, its acknowledgement endpoint, and the first-AI-use gate are **built and staged
but gated OFF** behind the `article_50_disclosure` frontend flag, which is registered in
`AVAILABLE_FRONTEND_FEATURES` only (not enabled for any user); the modal is therefore shown to no
one in production, and enabling it for EU accounts is the 2026-08-02 release gate on the CEO's
explicit sign-off after the production deploy. **[CORRECTION 2026-08-25: the two claims in the
preceding sentence - "not enabled for any user" and "shown to no one in production" - were true of
the code default and are FALSE of production. A direct read on 2026-08-23 found the flag enabled via
the `default_enabled_features` DB Setting. This paragraph is retained verbatim as the historical
record of what the 2026-07-22 amendment stated; it is not a live claim. The closing sentence of
this amendment ("Nothing in this refresh goes live in production until Phases 3-5 deploy and the
flag is enabled") is the same class of overtaken instruction. See "Corrections in this
successor".]** Phase 4 jurisdiction stamping (`Article50CallContext`
stamps `jurisdiction = 'EU'` at the three AI call sites, merged to staging) was described as
un-inerting the EU `AiApiLog` 5-year retention purge (`purge_old_eu_logs!`) wherever Phase 4 is
deployed. **[CORRECTION 2026-08-25: it does not un-inert it. The stamp fires only for a CONFIRMED
`:eu` user and production has none, so `purge_old_eu_logs!` matches nothing and the purge is still
inert.]** The
`AiApiLog` retention tiers were reconciled to a single wording across the memo, `DATA_RETENTION.md`,
`AI_DATA_FLOW_CLASSIFICATION.md`, and `scheduler.rake` (EU 5-year and 90-day IP redaction enforced;
children 12-month and general 24-month **decided, not yet enforced** pending a per-row
retention-class marker; HIPAA 6-year floor open). No new external data egress or model routing is
introduced. This is a **substantive** change to the attested Article 50 position; per section 6 (AI
drafts and flags, humans attest and accept risk), Scot reviewed and re-attested it on 2026-07-22.
Nothing in this refresh goes live in production until Phases 3-5 deploy and the flag is enabled._

## Runtime routing update - 2026-07-24 (predecessor re-attested 2026-07-24; NOT an attestation of these bytes)

_Runtime AI routing moved from the direct `api.anthropic.com` endpoint to **Claude on AWS Bedrock**
(`lib/ai_client.rb`). This is a routing change, not a change of model provider or model: the same
Anthropic models (Claude Haiku 4.5, Claude Opus 4.7) are named in the inventory._

_**Plane corrected 2026-08-04.** This section previously said the route was "the Bedrock Mantle
Messages API". That is wrong and has been since PR #727: the default plane is **classic
`bedrock-runtime`**, selected by `AiClient.bedrock_plane` unless `BEDROCK_PLANE=mantle`. The account
is **not entitled to the mantle plane** (every model returns 403 "not available for this account",
entitlement request open with AWS), so mantle is not a route this product can use today. This has a
consequence the old wording hid: on the classic plane only `anthropic.claude-haiku-4-5` has an
inference-profile mapping, so Claude Opus 4.7 (eval narration) is **not invokable** and falls back
to its deterministic template._

_**Corrected 2026-08-01, re-corrected 2026-08-04, corrected again 2026-08-19:** this section
first described the move as completed egress, was then over-corrected to say the path had never been
operational, and was then bounded to a closed window ending 2026-08-04 that closed the wrong way.
The routing change shipped. The Bedrock path was operational 2026-08-03T08:23Z to 2026-08-04T06:31Z
on revision `00013-76w`, carrying one internal verification call with no user or student data; the
credential was restored on `00015-9l9` at 2026-08-04T07:25:08Z, and **the path is operational
today**. The clause "**not operational as of 2026-08-04**" was false from 2026-08-04T07:25:08Z
onward and is withdrawn. See the 2026-08-19 operational-status note in section 2, including what
that evidence does not establish, and
`docs/legal/2026-08-12_aws-baa-acceptance-record.md`._

- **Governing BAA for runtime egress, which is live, is the AWS account BAA**
  (`docs/legal/2026-08-12_aws-baa-acceptance-record.md`), because Amazon Bedrock is a HIPAA-eligible
  AWS service (excluding Fable/Mythos) and inference stays inside AWS's HIPAA boundary. **Corrected
  2026-08-19:** this bullet read "once egress resumes"; egress has resumed. The executed Anthropic
  HIPAA-Ready BAA (2026-07-18, `docs/legal/2026-08-16_anthropic-baa-acceptance-record.md`) remains
  on file as a still-available direct path but is no longer the designated runtime route.
- The **runtime inventory table above is superseded for routing/credential detail**: runtime seams no
  longer require `ANTHROPIC_API_KEY` and no longer construct a direct Anthropic client (enforced by
  `scripts/ai-endpoint-guard.sh` in CI); model ids egress in Bedrock form
  (`anthropic.claude-haiku-4-5`, `anthropic.claude-opus-4-7`). The scrub / allowlist / COPPA / opt-out
  / AiApiLog controls in that table are unchanged.
- Operative condition: Bedrock calls must run under the BAA'd AWS account (2390-4478-5114). **This
  condition was UNVERIFIED from 2026-07-27 through the 2026-08-01 evidence gather, and the
  2026-07-27 statement that it had been verified is retracted** and stays retracted: no
  `lingolinq-web` revision from `00001-2vn` through `00012-x8z` carried a Bedrock credential, so no
  Bedrock call could be made in that period. **Verified 2026-08-04**, during the `00013-76w` window
  (2026-08-03T08:23Z to 2026-08-04T06:31Z): `sts:GetCallerIdentity` under the mounted credential
  returned account 239044785114, principal `user/lingolinq-bedrock-runtime`. That is a separate,
  correctly-dated finding and does not revive the retracted 2026-07-27 claim. **Corrected
  2026-08-19:** the clause that followed read "Credentials were withdrawn on `00014-5rw`, so the
  condition is again unverifiable and must be re-verified on any future mount." Credentials were
  restored on `00015-9l9` at 2026-08-04T07:25:08Z, so that clause was false from that timestamp.
  The condition is now asserted in code rather than left to manual re-verification: `AiClient` reads
  `BEDROCK_EXPECTED_AWS_ACCOUNT` (`lib/ai_client.rb:90`), calls `sts:GetCallerIdentity` under the
  exact Bedrock credential in `account_verified?` (`lib/ai_client.rb:508`), and refuses to return a
  client when the account does not match (`lib/ai_client.rb:321`, inside `build`). The seam-facing
  predicate `available?` (`lib/ai_client.rb:371`) is gated on the same check. The deploy workflow sets
  that variable as a literal and refuses to deploy without it
  (`.github/workflows/deploy-cloudrun.yml:281`, `:406-419`, `:726-732`). That control closed
  register finding `LL-1b0d78dbe6`. **Two limits on that control, stated because the point of this
  bullet is what is and is not verified.** First, `account_verified?` returns `true` when
  `BEDROCK_EXPECTED_AWS_ACCOUNT` is unset (`lib/ai_client.rb:510`), so an absent variable skips the
  assertion rather than failing closed; a misconfigured one does fail closed. Second, whether the
  currently-serving revision carries that variable is a live-infrastructure fact that this revision
  did **not** re-query: as of the 2026-08-12 evidence in
  `docs/legal/2026-08-12_aws-baa-acceptance-record.md` section 2.1, no revision carried it. Treat the
  account binding as verified historically under the `00013-76w` credential and as
  code-enforced-on-deploy going forward, not as re-verified on today's serving revision. See
  `docs/legal/2026-08-12_aws-baa-acceptance-record.md`.
- Section 3's older "AWS BAA covers infrastructure only, not model-provider egress" wording is
  superseded for the **designated** runtime path by this Bedrock routing: Bedrock inference is an
  in-AWS HIPAA-eligible service under the account BAA. That older wording still correctly describes
  the *direct* third-party Anthropic endpoint (now unused at runtime; covered by the Anthropic BAA
  if re-enabled) and any non-AWS model provider.

_Re-attested 2026-07-24 by Scot Wahlquist, CEO (Bedrock runtime routing). Prose corrected 2026-07-27
to remove a contradictory "re-attestation owed" banner left in the bytes that attestation covered._

_Corrected 2026-08-01 by Claude Code to remove the stale completed-egress framing and the retracted
operative-condition verification, and re-corrected 2026-08-04 to bound the over-corrected
"never operational" language to the window it actually covers. Those corrections are not
attestations; only Scot attests._

_**Re-attested 2026-08-04 by Scot Wahlquist, CEO** (on the predecessor,
`docs/legal/AI_GOVERNANCE_MEMO.md`, whose bytes remain frozen at that attestation). The earlier
"re-attestation pending" state was discharged on that record. That attestation covered a
closed-window operational status: not operational through `00012-x8z`, operational 2026-08-03T08:23Z
to 2026-08-04T06:31Z on `00013-76w` (one logged seam call, internal verification, no user or student
data), **not operational since `00014-5rw`** -- and that final clause is the claim this successor
withdraws._

_**Corrected 2026-08-19 by Claude Code (Cycle C). Not an attestation; only Scot attests.** This
successor withdraws the "not operational since `00014-5rw`" claim in all four places the predecessor
carried it, corrects the section 2 inventory table's `ANTHROPIC_API_KEY` requirement claim, records
the operational status against the serving revision `lingolinq-web-00020-per` with Secret-Manager-backed
Bedrock credentials, records 64 application-observed `AiApiLog` rows through 2026-08-14T21:13:27Z with
zero non-null `organization_global_id` values, and states plainly that no AWS-side or vendor-side
confirmation was obtained and that mounted credentials do not prove continuous traffic or individual
call success. The evidence pull behind it was read-**mostly**: it created three framework
`AuditEvent` session-open rows and nothing else. **Re-attestation of this successor is owed and is
deliberately blocked**: section 5.2 (Article 50) was out of scope here, was not re-verified, and is
the subject of a separate production-status truth-up. A separately-tracked infrastructure item is
noted in section 7._
