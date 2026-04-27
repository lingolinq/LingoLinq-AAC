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

_(Pending - to be filled after agent reports.)_

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
