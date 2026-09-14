---
name: ai-feature-legal-review
description: >-
  Pre-ship legal/compliance review for any LingoLinq AI feature that could touch children's,
  student, or patient data (board generation, word prediction, reports, voice, future LLM
  features, native apps). Runs a structured COPPA-2025 + FERPA + HIPAA + GDPR + EU-AI-Act-Art.50
  checklist, classifies the feature's data flow into four buckets, and returns a GO /
  GO-WITH-ADJUSTMENTS / NEEDS-REWORK verdict with prioritized findings. Use before building or
  shipping an AI feature, before a disclosure/consent change, or when asked "is this AI feature
  compliant / does it need parental consent / can we send this to the model."
---

# AI Feature Legal Review

A repeatable gate for AI features that may process regulated data. It does not replace counsel; it
makes the engineering decisions defensible and surfaces the few questions that genuinely need a
lawyer. Built 2026-06-26 from primary-source research (FTC / eCFR / vendor trust pages); re-verify
dates on the live sources when SaaS terms or rules may have moved.

## When to run

- Before designing or building any AI feature reachable by an under-13, student, or patient user.
- Before changing a disclosure, consent flow, vendor, or what data leaves to a model.
- When reviewing a plan/PR and asked whether an AI data flow is compliant.
- As the acceptance gate for the AI Data-Sharing VPC project's Phase 2 (and successor phases).

Pair with the `compliance-auditor` agent for codebase-grounded verification, and (for the holistic
risk pass) the `adversary` agent. This skill is the checklist; those agents do the digging.

## Core principle (read first)

The legal trigger for second-tier verifiable parental consent is **disclosure of a child's PERSONAL
INFORMATION to a third party**, not "AI was used." But:

- **A scrubber is a safeguard, not proof of legal de-identification.** Scrubbed output is
  *pseudonymized*, which under GDPR/ICO remains personal data. LingoLinq's `PiiScrubber` is
  regex + blocklist: it catches emails/phones/SSNs/IPs/global_ids/blocklisted names, and does NOT
  catch arbitrary free-text first names or small-cohort context.
- **FERPA PII includes indirect / linkable identifiers**, not just names
  (https://studentprivacy.ed.gov/content/personally-identifiable-information-education-records).
  A "nonverbal second grader in Ms. Smith's rural classroom who uses a feeding tube" can be
  identifying even with no name.
- **Conservative default until counsel signs off:** treat any scrubbed-but-user-linked prompt, AI
  output, or report as personal/regulated. Do not self-grant an exemption.
- Keep the **"what the vendor receives" vs "what we store internally (user-linked logs)"**
  distinction explicit; they are governed by different obligations.
- **Terminology rule:** say "scrubbed/pseudonymized," never "de-identified," unless the HIPAA Safe
  Harbor or Expert Determination standard is actually met.

## Step 1 - Data-flow classification (do this first)

For each data path the feature creates, document what user-derived data leaves to which vendor AND
endpoint/tier, post-scrubber, and whether any identifier rides in the payload or request metadata.
Sort each path into one bucket:

| Bucket | Example | Treatment |
|---|---|---|
| **Non-personal** | "Generate a Halloween board" -- no user/org/child/health/school/rare-context detail | No second-tier gate; existing signup consent + feature flag suffice |
| **Scrubbed personal (pseudonymized)** | identifiers stripped but record still user-linked or internally re-identifiable | Conservatively personal; gate unless counsel confirms; never "de-identified" |
| **Regulated PII** | child/student/patient-linked prompts, AI outputs, reports; data joinable to user/org/timestamps/diagnoses/classroom; small-cell aggregates | Second-tier verifiable parental consent required |
| **Never send externally** | raw identifiers, therapy notes, evaluations, diagnoses, real student/patient records | Blocked unless an explicit approved legal + vendor basis exists |

The bucket decides whether the feature needs the second-tier consent gate and what the disclosure
must say. Reports become Regulated PII fast: flag any join to user/org IDs, timestamps, prompts,
outputs, unique-user counts, board vocabulary, diagnoses, AAC goals, or school/classroom context;
small-cell aggregates need suppression before they are "safe."

## Step 2 - Checklist

### A. Scope
- [ ] Reachable by an under-13 user? (COPPA) a student? (FERPA) a patient? (HIPAA) an EU user? (GDPR / EU AI Act)
- [ ] Processes "personal information" per 16 CFR 312.2 (now includes biometric identifiers:
      voiceprints, faceprints) or FERPA education-record data?
- [ ] Does the feature interact directly with users or generate outputs about them? -> EU AI Act
      Art. 50 transparency applies (generally applicable 2026-08-02).
- [ ] Is a DPIA / AI impact assessment warranted (systematic processing of children's data, new tech)?

### B. Disclosure completeness (COPPA 16 CFR 312.4(c), 7 elements)
- [ ] (i) what is collected/used + the disclosure opportunities if the parent consents
- [ ] (ii) consent is required; nothing collected/used/disclosed without it
- [ ] (iii) the specific items collected + how used
- [ ] (iv) third-party identities/categories + purposes, AND the explicit "you may consent to the
      core service WITHOUT consenting to third-party AI disclosure" statement
- [ ] (v) link to the full privacy notice
- [ ] (vi) the means to provide verifiable consent (the method)
- [ ] (vii) deletion-if-no-consent-within-a-reasonable-time
- [ ] Plain language, target Flesch-Kincaid grade 6-8; vendors named WITH tier; no "never trains"
      unqualified; no "de-identified" unless the HIPAA standard is met; no "no identifiers sent"
      when a regex scrubber can leak free text.
- [ ] Surfaced at or before first use of the feature (not buried; EU AI Act Art. 50 prohibits
      footer-snippet / faint-label disclosure).

### C. Consent flow
- [ ] Per-purpose, not bundled with terms-of-service acceptance (COPPA 2025 separate-consent rule;
      GDPR Art. 7(2)).
- [ ] Inference vs training are separate consent items if both are ever possible.
- [ ] No pre-checked boxes; "decline / skip" is as prominent as "accept."
- [ ] **Method adequacy:** for under-13 third-party disclosure, email-plus and text-plus are NOT
      adequate. Use KBA, credit/debit-card transaction, gov-ID match, signed form, or video. A
      one-time persisted "OK" is fine UX, but the OK must verify it is the PARENT.
- [ ] Revocation is in-product (not email-only) and propagates to all downstream stores within the
      committed window.

### D. Consent-record integrity
- [ ] Record stores: parent/guardian id (encrypted), ISO-8601 UTC timestamp, disclosure version id,
      content hash of the disclosure text, consent method, per-purpose scope, revocation field.
- [ ] Append-only (re-consent archives the prior record, does not overwrite).
- [ ] Retained >= 3 years post-processing; PII in the log encrypted + access-controlled.
- [ ] A material change to disclosed practices bumps the version and forces re-consent (vs
      notice-only for cosmetic changes).

### E. Vendor due diligence
- [ ] DPA executed with every named vendor; BAA where HIPAA applies (company rule: no identifiable
      data to external models without a BAA).
- [ ] Vendor commitment, by exact product and tier, that API data is not used for training. Record
      the live source/contract and verification date; do not carry a marketing-page claim forward as
      a durable assurance. For Google, do not treat paid Gemini API as equivalent to Vertex AI:
      current Gemini API terms prohibit API clients directed to or likely accessed by anyone under
      18 even on paid service. Use Vertex AI only after contract/DPA/BAA review confirms the specific
      child-directed and healthcare use case; unpaid Gemini services also use submitted content to
      improve Google products.
- [ ] ZDR status confirmed in writing where claimed (Anthropic ZDR is not publicly documented).
- [ ] Vendor sub-processor list reviewed for fourth-party / residency exposure.

### F. Retention & deletion
- [ ] Retention period defined per purpose, not indefinite (COPPA 312.10 written policy; bars
      indefinite retention, incl. for model training).
- [ ] Every stated retention number is ENFORCED by a real job (do not state a limit nothing deletes
      against -- e.g. verify any "AiApiLog 2-year" claim has a purge, not just 90-day IP redaction).
- [ ] Deletion pipeline covers primary store, backups, vendor copies, derived artifacts; audited.

### G. Ongoing monitoring
- [ ] Re-run this review before adding a new vendor or changing the data flow.
- [ ] Annual sub-processor-list review against live contracts.
- [ ] Sign-off gates: product + engineering + Scot + counsel, recorded in the decision log.

## Step 3 - Verdict & output

Return:
1. **Verdict:** GO / GO-WITH-ADJUSTMENTS / NEEDS-REWORK.
2. **Data-flow classification table** (Step 1).
3. **Prioritized findings:** each tagged must-fix / should-fix / nice-to-have, with file/line cites
   where code-grounded, and the checklist item it maps to.
4. **Open counsel questions** the team cannot resolve itself (e.g. "is scrubbed neutral input a
   disclosure?", "which consent method?").
5. Cite every external legal/vendor claim with a URL + date; flag anything unverified rather than
   asserting.

## Reference anchors (LingoLinq)

- `lib/pii_scrubber.rb` -- regex + blocklist; free-text/small-cohort residual risk.
- `app/models/ai_api_log.rb` -- audit log; scrubs request+response summaries; 90-day IP redaction.
- Outbound AI egress paths and runtime configuration -- do NOT trust this list as static; re-derive
  on every review with
  `git grep -nE 'AiClient|BedrockMantleClient|bedrock-mantle|BEDROCK_(PLANE|AWS_KEY|AWS_SECRET|AWS_REGION|EXPECTED_AWS_ACCOUNT)|ANTHROPIC_API_KEY|GEMINI_API_KEY|api\.anthropic\.com|generativelanguage\.googleapis\.com|aiplatform\.googleapis\.com|api\.openai\.com|draft_via_anthropic|call_anthropic|call_openai' -- 'lib/**' 'app/**' 'config/**' '.github/workflows/**' 'scripts/ai-endpoint-guard.sh' 'scripts/sync-render-env.js' 'scripts/gcp/**' '.env.op.template'`
  so new AI modules, provisioning paths, or deployment seams cannot silently escape the gate.
  The pathspec recurses into subdirs and `.rake` files (a top-level `lib/*.rb` glob would miss
  `lib/tasks/generate_predictions.rake`) and explicitly includes the runtime provisioning sources:
  `scripts/sync-render-env.js`, `scripts/gcp/**`, `.env.op.template`, the Cloud Run and Render
  workflows, and the endpoint guard. Reviewer-only credential scripts are intentionally outside
  this runtime scan. The pattern covers both the sanctioned Bedrock clients and direct vendor
  endpoints, so widen it whenever a new vendor or naming convention lands. At the current `develop`
  head, the designated runtime surface is:
  - `lib/ai_client.rb` -- the sanctioned construction point. `BEDROCK_PLANE` selects the classic
  `Anthropic::BedrockClient` or `Anthropic::BedrockMantleClient` (`bedrock-mantle`) path.
  - `lib/ai_board_generator.rb` -- board generation; thread `user:`.
  - `lib/ai_word_predictor.rb` -- word prediction; scrubbed sentence input.
  - `lib/ai_prediction_generator.rb` -- batch prediction generation (callers in
    `lib/tasks/generate_predictions.rake`, which also uploads results to S3).
  - `lib/eval_narrator.rb` (`draft_via_anthropic`, the `comprehensive_eval_ai` SLP-narrative flow;
    external entry `EvalNarrator.draft_narrative` at `app/controllers/api/eval_sessions_controller.rb:75`,
    internal dispatch at `lib/eval_narrator.rb:37`)
    -- HIGHEST SENSITIVITY: drafts evaluation narratives from assessment data, which Step 1
    classifies as "Never send externally." Treat any change here as never-send by default.
  The designated runtime provider is **Anthropic Claude on AWS Bedrock** via `AiClient`, using
  `BEDROCK_AWS_KEY` and `BEDROCK_AWS_SECRET`; `BEDROCK_EXPECTED_AWS_ACCOUNT` pins the allowed AWS
  account. `ANTHROPIC_API_KEY` and `GEMINI_API_KEY` are not runtime credentials or fallback paths.
  Designated does not mean active: verify the serving revision's Bedrock secret linkage, a
  controlled successful request, and its corresponding `AiApiLog` row as internal corroboration.
  `AiApiLog` can under-record, so it is not a durable egress ledger; when making a production
  egress claim, also seek vendor-side CloudTrail, CloudWatch, or equivalent evidence and state any
  evidence gap. If these checks are absent, describe the path as designated or configured only.
  The evaluation narration surface remains "Never send externally" unless an explicit approved
  legal and vendor basis exists, regardless of the designated code path.
- `lib/feature_flags.rb` -- `ai_feature_enabled_for?`, `coppa_blocks_ai_for?` (signup-COPPA gate).
- `User#ai_consent_granted?(disclosures_version:)/grant_ai_consent!(disclosures_version:, granted_by:, source:)/revoke_ai_consent!`
  -- second-tier consent (Phase 1). Consent is scoped to a disclosure version: `ai_consent_granted?`
  is NOT a versionless boolean, and `grant_ai_consent!` raises `ArgumentError` on an unlisted
  `source`. Ties to checklist item D: a material change bumps the version and forces re-consent.
- Project: `.planning/` AI Data-Sharing VPC; this skill is its Phase 2 acceptance gate.

## Primary sources (re-verify dates on use)

- FTC COPPA 2025 Final Rule (90 FR 16977, 2025-04-22; compliance deadline 2026-04-22):
  https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule
- 16 CFR Part 312 (current): https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312
- FTC COPPA FAQ: https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions
- ED/PTAC PII in education records: https://studentprivacy.ed.gov/content/personally-identifiable-information-education-records
- HHS HIPAA de-identification: https://www.hhs.gov/hipaa/for-professionals/special-topics/de-identification/index.html
- ICO pseudonymisation: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-sharing/anonymisation/pseudonymisation/
- EU AI Act, official text (Art. 50; generally applicable 2026-08-02):
  https://eur-lex.europa.eu/eli/reg/2024/1689/oj
- Anthropic Commercial Terms: https://www.anthropic.com/legal/commercial-terms
- OpenAI Enterprise Privacy: https://openai.com/enterprise-privacy/
- Google Gemini API terms (effective 2026-03-23; re-check before use):
  https://ai.google.dev/gemini-api/terms
- Google Cloud HIPAA offering (scope alone is not approval for a use case):
  https://cloud.google.com/security/compliance/hipaa
