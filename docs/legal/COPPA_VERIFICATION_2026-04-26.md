# COPPA Final Rule Code Verification

**Date:** 2026-04-27
**Auditor:** Claude Code (Opus 4.7), routed via /lingo
**Branch:** compliance/coppa-final-rule-audit-2026-04-27
**Source prompt:** ~/ai-company-brain/docs/FOLLOWUPS-2026-04-26.md Section 1
**Goal:** Verify the running Rails + Ember code enforces the five COPPA Final Rule (effective 2026-04-22) requirements. PR #211 was documentation only. Penalties up to $53,088 per violation.

> **Note on plan file:** `.claude/plans/we-are-working-eager-phoenix.md` referenced by the restart prompt was not found on disk. Working from the verbatim five items in `FOLLOWUPS-2026-04-26.md` Section 1 instead. Team selection per restart prompt: compliance-auditor + rails-ember-dev + Explore (medium thoroughness).

---

## Audit Methodology

- Read-only inspection. No source code edits in this session.
- Three agents run in parallel after a baseline scan, with results saved + committed after each agent reports (crash-resilience).
- For each item: SHIPPED, PARTIAL, or TODO with file:line evidence and one-sentence rationale.
- Where compliance-auditor and rails-ember-dev disagree, default to the more conservative reading.
- AI APIs never see user-identifiable data. Any path that bypasses `lib/pii_scrubber.rb` is a P0 finding.

---

## The Five Verification Items (verbatim from FOLLOWUPS-2026-04-26.md)

1. **Separate verifiable parental consent (VPC) for AI/data sharing**, distinct from the general parental consent at signup. The FTC's position (per Akin, FPF, PIPC) is that AI training AND inference disclosures are never "integral" - bundled "I agree to all" modals will not survive enforcement. Verify a hard block exists before any user audio, board content, or symbol selection is sent to OpenAI, Gemini, or Anthropic. Trace the path through `lib/ai_board_generator.rb` and any other AI call site (`lib/pii_scrubber.rb` is the audit point).

2. **Biometric PI tagging for voiceprints and dwell/eye-tracking timing.** Per Hintze and Finnegan, voice samples and dwell/gaze data that enable identification ARE biometric PI under the Final Rule. For an AAC app this is dead-center. Verify the data model tags these as biometric, that retention enforces deletion (not indefinite S3 storage), and that a VPC record exists before capture.

3. **Written retention policy disclosure inside the privacy notice itself** (per Fenwick, linking out is insufficient). Confirm the privacy policy copy embeds the section 312.10 policy from `docs/legal/DATA_RETENTION.md`, and that a scheduled job actually deletes child records on the stated timeline (including derived AI logs, voice clips, school-tenant data when a district contract ends).

4. **Removal of any "FERPA school-official as substitute for parental consent" pattern.** The 1999 school-consent guidance survives only when the service is used solely for school benefit with NO AI training, advertising, or profiling. Find any code that treats FERPA school-official status as a COPPA substitute and flag it.

5. **SDK audit (Apitor Sep 2025 settlement vector):** every third-party SDK in the Rails and Ember bundles that could silently transmit kid data without VPC. Inventory analytics, crash, push, ads. Confirm each is gated behind under-13 detection or removed.

---

## Phase 1: Baseline Scan

Scanned `lib/` and `app/` (excluding `node_modules` / `bower_components` / specs).

### AI API call sites (Rails)

| File | Goes through PiiScrubber? | Logs to AiApiLog? |
|------|---------------------------|-------------------|
| `lib/ai_board_generator.rb` | YES (grep hit) | YES (grep hit) |
| `lib/ai_word_predictor.rb` | NO grep hit | NO grep hit |
| `lib/ai_prediction_generator.rb` | NO grep hit | NO grep hit |

> **P0 candidate (item #1):** Two of three Ruby AI call sites do not surface in PiiScrubber or AiApiLog grep results. If confirmed by the agents, this is a hard violation of the audit invariant "AI APIs never see user-identifiable data." Phase 2 agents will verify.

### COPPA infrastructure already present

The grep surfaced an existing parental consent path:

- `app/controllers/parental_consents_controller.rb` (one-click consent completion via tokenized URL)
- `app/controllers/api/users_controller.rb` (registration gating via `coppa_parental_consent_pending?`, throttled resend at `:719`)
- `app/controllers/session_controller.rb:107-108, 524-525` (login-time gate returns `awaiting_parental_consent`)
- `lib/json_api/json.rb:100-157` (env-driven feature flag `COPPA_PARENTAL_CONSENT`, org override)
- `lib/json_api/user.rb:447-448` (exposes `coppa_parental_consent_pending` to client)
- `lib/external_tracker.rb:2-3` (HubSpot gated behind supporter-only FERPA/COPPA/GDPR check)

This is the **general signup-time** parental consent. Item #1 asks for a **separate** VPC for AI/data sharing, distinct from this. Phase 2 agents must confirm whether AI-call paths hard-block on a second VPC record or only on this signup-time flag.

### Hardcoded secrets scan

No actual hardcoded secrets found in source. All `api_key` / `secret` / `token` references are either: (a) reading from `config[:api_key]` / Rails credentials, (b) Stripe purchase tokens (not secrets), (c) AWS credential wrappers in `lib/uploader.rb` reading from config, or (d) request param accessors. CLEAN.

### Hardcoded PII / IP scan

No hardcoded user emails, phone numbers, or production IPs found in `lib/` or `app/`. The "email" grep hits in Ember files were Ember computed-property `@each.X` chains (false positives, not PII). CLEAN.

### Frontend AI call sites

Phase 2C (Explore) will inventory the full `app/frontend/package.json` for any client-side AI/analytics/crash SDKs.



---

## Phase 2A: compliance-auditor findings

### P0: AI bypass of PiiScrubber - CONFIRMED

`lib/ai_word_predictor.rb` and `lib/ai_prediction_generator.rb` make live calls to Anthropic and OpenAI clients with **zero references** to `PiiScrubber`, `redact_for_ai`, or `AiApiLog`.

- `lib/ai_word_predictor.rb:76` `client = Anthropic::Client.new(api_key: config[:api_key])`
- `lib/ai_word_predictor.rb:89` `client = OpenAI::Client.new(...)`
- `lib/ai_prediction_generator.rb:236, 247` same pattern, plus Gemini path
- grep for `PiiScrubber|AiApiLog|redact_for_ai` returned ZERO matches in either file

These are kid-facing prediction features. Under the Final Rule (FTC, Akin, FPF), unredacted child input flowing to OpenAI/Anthropic/Gemini without VPC for AI sharing is a per-violation event at up to $53,088 each. **Treat as ship blocker.**

### Item 1 - Separate VPC for AI/data sharing - **TODO**

**Evidence:**
- `lib/ai_board_generator.rb:29` gate is only `FeatureFlags.ai_feature_enabled_for?('ai_board_generation', user)` (a feature flag, not a VPC record).
- `lib/feature_flags.rb:80-92` `ai_enabled_for?` checks org `disable_ai_features` setting only. No second consent record.
- `app/controllers/parental_consents_controller.rb` only handles ONE token: `coppa_parental_consent_pending?`. No `ai_consent`, `ai_data_sharing_consent`, or biometric consent paths exist (grep returned zero).
- `lib/ai_word_predictor.rb` and `lib/ai_prediction_generator.rb` have NO consent or feature-flag check before LLM calls.

**Rationale:** No second, separately-presented VPC exists for AI data sharing. The single signup-time consent bundled with general use violates the FTC's "AI inference and training are never integral" position (Akin/FPF/PIPC commentary).

**Gap:** Add `ai_data_sharing_consent` token + parent-facing modal listing OpenAI/Anthropic/Gemini as recipients; hard-fail every AI call site (board generator, word predictor, prediction generator, future sites) when consent is absent OR `coppa_parental_consent_pending?` is true.

### Item 2 - Biometric PI tagging (voiceprints, dwell/gaze) - **TODO**

**Evidence:**
- `app/models/button_sound.rb` stores user audio (URL on S3) with no biometric flag, no retention TTL, no tagged-as-biometric column. `db/schema.rb` confirms no `biometric_*` fields anywhere.
- `app/models/user.rb:1476-1480` and `:292-293` recognize `dwell_type == 'eyegaze'` for runtime behavior, but no model column tags gaze/dwell timing as biometric, and `LogSession` stores button event timestamps in the `data` blob (`log_session.rb:526`) without biometric classification.
- `lib/data_policy_enforcer.rb` enforces org `retention_months` policies but does not scope `ButtonSound` deletion or dwell-event redaction.
- No VPC record check anywhere before voice capture (`button_sound.rb:228` `ButtonSound.new(user: user, settings: {})`).

**Rationale:** Hintze/Finnegan analysis is clear that voice samples and dwell/gaze timing in an identification-capable AAC context ARE biometric PI under the Final Rule. The data model has no column, no consent gate, and no enforced TTL for these.

**Gap:** Add `biometric: true` flag to `ButtonSound` and dwell/gaze fields, require a separate biometric VPC token before save, and extend `DataPolicyEnforcer` to delete biometric records on the stated TTL.

### Item 3 - Written retention policy embedded + scheduled deletion - **PARTIAL**

**Evidence:**
- `app/views/shared/_privacy.html.erb:67-70` embeds a retention statement: "active accounts indefinitely. Accounts inactive for 12 months are flagged for automatic deletion." This is in-policy text, satisfying Fenwick's "do not link out" point at a coarse level.
- `lib/tasks/scheduler.rake:134-136` schedules `DataPolicyEnforcer.enforce_retention!` daily.
- The embedded text does NOT cover: derived AI logs (`AiApiLog`), voice clips (`ButtonSound`), school-tenant deletion on contract end, or biometric data. The 312.10 categories required by the Final Rule are incomplete.
- `lib/data_policy_enforcer.rb` enforces org-policy retention months but does not delete `AiApiLog`, `ButtonSound`, or downstream LLM-vendor data.

**Rationale:** A retention statement is in the policy and a scheduled job runs, but the scope is too narrow to satisfy 312.10's category-by-category disclosure.

**Gap:** Update `_privacy.html.erb` to enumerate retention windows for: AI logs, voice/audio recordings, dwell/gaze data, school-tenant data on contract end. Wire `DataPolicyEnforcer` to actually delete those record types on the stated cadence.

### Item 4 - FERPA school-official as COPPA substitute - **SHIPPED (compliance-auditor read)**

> Note: Agent B (rails-ember-dev) DISAGREES with this read. See Phase 2B section. Conservative reconciliation in Phase 3.

**Evidence:**
- Grep across `app/` and `lib/` for `school_official|FERPA.*consent|in_loco|district.*consent|coppa.*school` returned zero code paths treating school-official status as a COPPA bypass.
- `app/controllers/api/users_controller.rb:262, 284, 661, 672, 735` and `session_controller.rb:107, 524-525` consistently enforce `coppa_parental_consent_pending?` regardless of org/district context.
- One soft mention exists in policy copy at `app/views/shared/_privacy.html.erb:52` ("parent, guardian, or authorized school official") - this is doc only, not code.

**Gap:** Tighten the privacy policy copy at line 52 to clarify that school-official consent applies only when the service is used solely for school benefit with no AI/profiling/ads.

### Item 5 - SDK audit (Apitor settlement vector) - **PARTIAL**

**Evidence:**
- `Gemfile`: `bugsnag` (6.28.0) and `newrelic_rpm` (9.23.0) ship in production. Bugsnag transmits user_id, error context, IP. NewRelic transmits request paths and timing. Neither is gated by under-13 detection.
- `lib/external_tracker.rb` HubSpot path is correctly gated to supporters only (confirmed in baseline).
- `app/frontend/package.json`: grep for sentry/mixpanel/amplitude/google-analytics/firebase/hotjar/fullstory/onesignal/appsflyer returned no matches. Frontend appears clean of consumer-analytics SDKs.

**Rationale:** Backend ships Bugsnag and NewRelic that can transmit child-associated identifiers/IPs to third parties without VPC or under-13 gating. This is the exact Apitor pattern.

**Gap:** Either (a) configure Bugsnag/NewRelic to scrub user_id and IP for users under 13, (b) gate them off entirely for child users, or (c) document in DPA/privacy notice as service providers and obtain VPC. A `before_notify` callback on Bugsnag and a NewRelic attribute filter are the minimum fixes.

### Compliance-auditor totals

- SHIPPED: 1 (item 4 - **disputed by Agent B**)
- PARTIAL: 2 (items 3, 5)
- TODO: 2 (items 1, 2)
- P0 ship blocker: AI predictor bypass of PiiScrubber/AiApiLog


---

## Phase 2B: rails-ember-dev findings

_(Pending - to be filled after agent reports.)_

---

## Phase 2C: SDK inventory (Explore agent)

_(Pending - to be filled after agent reports.)_

---

## Phase 3: Reconciliation

### Agent disagreements

_(Pending.)_

### Punch list

| # | Item | Status | File:line | Owner / Next step |
|---|------|--------|-----------|-------------------|

_(Pending.)_

### Recommended GSD routing per TODO

_(Pending.)_

---

## Phase 4: Final summary

- SHIPPED count: TBD
- PARTIAL count: TBD
- TODO count: TBD
- Item #1 VPC blocker assessment for AI board generator: TBD
- Estimated time per TODO follow-up: TBD
- Branch pushed: TBD
