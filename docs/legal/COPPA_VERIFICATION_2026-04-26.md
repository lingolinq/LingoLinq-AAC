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

### P0 PRE-FLAG VERIFICATION

**`lib/ai_word_predictor.rb`** (used live by every sentence-builder request):

(a) **External AI calls? YES.** Anthropic Claude Haiku at `lib/ai_word_predictor.rb:74-85` (`Anthropic::Client#messages.create`) and Gemini via OpenAI-compat endpoint at `lib/ai_word_predictor.rb:87-106`.
(b) **PiiScrubber? NO.** The user's in-progress sentence (`sentence:` arg) is sent verbatim to the model at line 81 (`messages: [{ role: 'user', content: sentence }]`) and to Gemini at line 98. Zero redaction.
(c) **AiApiLog? NO.** No `AiApiLog.log_ai_call` invocation anywhere in the file. The only logging is `Rails.logger.error` at line 48.
(d) **Consent / feature-flag gate? NO.** The module is only gated by env-var presence (`ENV['ANTHROPIC_API_KEY']` / `ENV['GEMINI_API_KEY']` at lines 55-71). Neither `FeatureFlags.ai_feature_enabled_for?` nor `coppa_parental_consent_pending?` is checked. Caller `app/controllers/api/words_controller.rb:51-62` (action `predict`) is in the controller's `:except => [:reachable_core, :lang, :predict]` list at line 2, so it does not even require an API token.
(e) **User data flowing in:** the literal user-typed sentence fragment, plus locale. Cached in-process for 30 min in `CACHE` constant at line 9 (memory-resident PII).

**`lib/ai_prediction_generator.rb`** (offline batch tool):

(a) **External AI calls? YES** at lines 234-260 (Anthropic + Gemini).
(b) **PiiScrubber? NO.** Prompt is built from `lib/core_lists.json` and the hard-coded word arrays at lines 141-172. No user data flows in by design.
(c) **AiApiLog? NO.** Only `puts` to STDOUT.
(d) **Consent gate? NO**, but irrelevant: this is an offline rake-style generator (writes `public/language/ngrams.arpa.trimmed.10.json`). No user-supplied content.
(e) **User data:** none - generic vocabulary lists only.

**Net P0 finding:** `ai_word_predictor` is a live, every-keystroke-class call path that bypasses PII scrubbing, audit logging, the org-level AI opt-out (`FeatureFlags.ai_enabled_for?`), and any COPPA consent check. `ai_prediction_generator` is benign (no live user input). The compliance posture present in `ai_board_generator` is not replicated.

### Item 1 - VPC for AI / Data Sharing

**Code path (Board generation only):**
- Route: `POST /api/v1/boards/generate_labels`
- Controller: `app/controllers/api/boards_controller.rb:394-440` - gates only on `FeatureFlags.feature_enabled_for?('ai_board_generation', @api_user)` at line 395.
- Service: `lib/ai_board_generator.rb#generate_words` - line 29 enforces `FeatureFlags.ai_feature_enabled_for?` (combines feature flag + org-level `disable_ai_features` opt-out per `lib/feature_flags.rb:80-94`); PII scrubbing at line 46 (`PiiScrubber.redact_for_ai`); audit log at lines 108-126 via `AiApiLog.log_ai_call` (`app/models/ai_api_log.rb:41-65`).
- Word-prediction route: `app/controllers/api/words_controller.rb:51-62` calls `AiWordPredictor.predict` with NO flag, NO scrub, NO log, NO consent.

**Hard block vs soft warning before AI call:**
- `ai_board_generator`: **soft gate** - feature-flag and org opt-out short-circuit. There is NO check on `User#coppa_parental_consent_pending?` or any AI-specific VPC. A child with COPPA-consent-pending whose org has not opted out can still trigger the call.
- `ai_word_predictor`: **NO block at all.** Endpoint excluded from `require_api_token` (line 2). Anonymous traffic can hit it.
- `ai_prediction_generator`: not user-callable.

**No "AI sharing" consent flag exists.** `User#coppa_parental_consent_pending?` (`app/models/user.rb:370-375`) records the general COPPA signup consent only (settings hash key `coppa.parent_consent_granted_at`). No second-tier "AI/data sharing" consent column or settings key is referenced anywhere in `lib/`, `app/models/`, or `app/controllers/`.

### Item 2 - Biometric PI Tagging (Voiceprints, Dwell, Eye-Tracking)

**Voice data:**
- Stored as URI strings (third-party TTS voice IDs, not voice samples) in `User#settings['preferences']['devices'][key]['voice']['voice_uris']` (`app/models/user.rb:489, 1452-1474`); also recorded per-session at `app/models/log_session.rb:397`.
- `LogSession` ingestion in `lib/stats.rb:582, 754` aggregates `voice_uri` into device prefs.

**Dwell / gaze data:**
- Server: `User#access_methods` reads `device_prefs['dwell']` and `dwell_type` in {`arrow_dwell`, `mouse_dwell`, `eyegaze`, `head`} at `app/models/user.rb:286-298, 1473-1480`.
- Client: `app/frontend/app/utils/raw_events.js` (lines 113-341 handle `gazelinger`, `dwell_elem`, `dwell_type == 'head'`); `app/frontend/app/utils/scanner.js` for scanning timing.
- Per-button timing recorded into `LogSession` events via `app_state.activate_button` and `LogSession.process_params`.

**Biometric tagging? NONE.**
- No `biometric` flag in any model, no `secure_serialize` field for voiceprints, no separate retention rule.
- Retention falls under generic `LogSession` retention (see Item 3) - not enforced for voice/dwell specifically.

### Item 3 - Retention Policy Enforcement

**Code-enforced:**
- `DataPolicyEnforcer.enforce_retention!` (`lib/data_policy_enforcer.rb:2-23`) deletes only `LogSession` rows where `log_type='session'` for `Organization.where("data_policy_version > 0").sponsored_users`, older than `org.effective_data_policy['retention_months']`. Calls `Flusher.flush_record` (`lib/flusher.rb:30-37`) which destroys + purges PaperTrail.
- Wired into `lib/tasks/scheduler.rake:134-138` (`enforce_data_retention_policies`, daily at 6 AM UTC).
- `Flusher.flush_deleted_users` (`lib/flusher.rb:143-149`) processes `User.schedule_deletion_at` queue. `flush_user_completely` (`flusher.rb:225-233`) cascades through LogSession, ClusterLocation, WeeklyStatsSummary, Boards, Devices, Utterances, NfcTag, UserIntegration, UserGoal, UserBadge, Webhook, UserBoardConnection, UserLink, License. Wired at `scheduler.rake:120-124`.
- `SupervisorConsentExpirationWorker.perform` (`scheduler.rake:140-143`) runs daily.

**Policy-only, NO scheduled enforcement:**
- `AiApiLog.redact_old_ip_addresses!` at `app/models/ai_api_log.rb:108-112` is defined but **NOT referenced** from any rake task, scheduler, worker, or initializer (verified by grep). It will never run on its own. **Confirms COMPLIANCE_STATUS_2026-04-23.md A4 gap.**
- No category-specific deletion for: voice samples, dwell/gaze events, eye-tracking timing, biometric data of any kind. They live inside `LogSession.data` and are deleted only when the entire session is deleted by org data-policy retention or full user deletion.
- No retention enforcement for users in orgs with `data_policy_version == 0` or no managing_organization. **Self-managed users / parents have no automatic deletion.**

### Item 4 - FERPA School-Official-as-COPPA-Substitute Pattern - **DISPUTES Agent A's "SHIPPED"**

`User#coppa_parental_consent_pending?` (`app/models/user.rb:370-375`) returns `true` only if `settings['coppa']['pending_parent_consent']` is set and `parent_consent_granted_at` is absent. It does NOT consult `managing_organization_id`, `authored_organization_id`, or supervisor relationships.

**However**, the only place that initializes the COPPA struct is `User#process_params` at `app/models/user.rb:958`:

```ruby
if !self.id && JsonApi::Json.coppa_parental_consent_enabled? && params['authored_organization_id'].blank?
```

**This is the bypass:** when an Organization with `edit` permission seeds the user (`authored_organization_id` present, lines 992-998 set `settings['authored_organization_id']` and `settings['pending'] = false`), the entire COPPA branch (the under-13 check at lines 960-988 that sets `pending_parent_consent`, `parent_email`, `parent_consent_token`) is **skipped**. The user is created with no `settings['coppa']` hash at all, so `coppa_parental_consent_pending?` returns `false` permanently - appearing "consented" without VPC ever being recorded. **This is the school-official substitute pattern, implemented as an org-authored signup short-circuit.**

`JsonApi::Json.coppa_parental_consent_enabled?` (`lib/json_api/json.rb:127-128`) reads the domain setting (default **ON** via env; disable with `COPPA_PARENTAL_CONSENT=0|false|no|off`, or per-org override). `JsonApi::User#as_json` at `lib/json_api/user.rb:448` only emits `coppa_parental_consent_pending` when true. `grant_parental_consent!` (`user.rb:378-408`) is the only path that flips the flag for non-org users.

### Item 5 - Pre-Consent Bootstrap Init

**Rails view layer:** `app/views/layouts/application.html.erb:110-138` registers Google Analytics setup. **It is gated** by `localStorage['enable_cookies'] == 'true'` at line 135 - `ga_setup` only fires after explicit cookie opt-in. `anonymizeIp` is set (line 131). No analytics fires before consent.

**Sentry:** referenced only in CSP allow-list (`config/initializers/content_security_policy.rb:12, 61-62`); no actual SDK initialization in Rails or Ember bootstrap.

**No Mixpanel/Heap/Amplitude/PostHog/FullStory** found in `app/frontend/app` or `config/initializers` (grep returned zero matches).

**AI bootstrap:** AI modules are lazy-loaded only inside controller actions (`words_controller.rb:58 require_relative`); `application.rb` does not autoload them.

### Rails-ember-dev coverage summary

| Item | Code Coverage |
|------|---------------|
| 1. AI VPC (board_generator) | **Partial** - feature flag + org opt-out + PII scrub + audit log present, but no AI-specific VPC distinct from signup COPPA. |
| 1. AI VPC (word_predictor) | **None** - no flag, no scrub, no log, no token, no consent. P0 gap. |
| 1. AI VPC (prediction_generator) | N/A - offline tool, no user input. |
| 2. Biometric tagging | **None** - voice URIs and dwell/gaze data are stored without biometric classification or category-specific retention. |
| 3. Retention enforcement | **Partial** - LogSession retention works for org-managed users; `AiApiLog.redact_old_ip_addresses!` defined but unscheduled; no enforcement for self-managed users or biometric-class data. |
| 4. School-official COPPA bypass | **Present and undocumented** - `authored_organization_id.present?` at `user.rb:958` skips the entire COPPA pending-consent branch with no audit trail, no fallback consent check. |
| 5. Pre-consent SDK init | **Full coverage** - GA gated on `enable_cookies` opt-in; no other analytics/AI SDKs initialize before consent. |


---

## Phase 2C: SDK inventory (Explore agent)

**Note on agent disagreement:** Explore classified Bugsnag as GATED via `lib/external_tracker.rb`. Agent A (compliance-auditor) classified Bugsnag as UNCONDITIONAL. `external_tracker.rb` is the HubSpot gate (per its own header comment), not a Bugsnag gate. Per audit policy "default to the more conservative reading", Bugsnag is treated as UNCONDITIONAL for the punch list.

### P0 Findings (UNCONDITIONAL backend SDKs)

- **`newrelic_rpm`** (`Gemfile:74`): Loads at Rails boot unconditionally. Transmits perf/error metrics including request paths, transaction names, and (by default) custom attributes. No age-gating detected.
- **`bugsnag`** (`Gemfile:69`): Loads at Rails boot unconditionally. Transmits user_id, error context, IP. **Conservative reading** (Explore's "GATED via external_tracker.rb" claim is unsupported - that file gates HubSpot only).

### Inventory

| SDK | Where | Status | Gate | Notes |
|---|---|---|---|---|
| bugsnag | `Gemfile:69` | UNCONDITIONAL (P0) | no gate | Conservative reconciliation. Explore claimed GATED via external_tracker.rb but that file targets HubSpot. |
| newrelic_rpm | `Gemfile:74` | UNCONDITIONAL (P0) | no gate | APM agent loads at Rails boot; transmits perf data + IP |
| stripe | `Gemfile:70` | GATED (effectively) | Account/payment context | Payments only; assumed adult-account context |
| anthropic | `Gemfile` | INTERNAL | n/a | Used by `lib/ai_board_generator.rb` (PiiScrubber-gated) AND `lib/ai_word_predictor.rb` (NOT gated, see Item 1 P0) |
| ruby-openai | `Gemfile` | INTERNAL | n/a | Same dual-use pattern as anthropic |
| HubSpot tracker | not a gem; HTTP via `lib/external_tracker.rb` | GATED | `lib/external_tracker.rb:2-3` | Supporter-only enforcement confirmed |
| Google Analytics | `app/views/layouts/application.html.erb:110-138` | GATED | `localStorage['enable_cookies'] == 'true'` (line 135); `anonymizeIp` set | Verified by Agent B |
| sentry, mixpanel, amplitude, firebase, segment, branch, onesignal, intercom, hotjar, fullstory, facebook pixel, twitter widget, pusher.com, rollbar, honeybadger, scout_apm | not present | REMOVED | n/a | grep across `Gemfile` and `app/frontend/package.json` returned zero matches |

### Native wrapper repo

The native wrapper repo for the Cordova/Capacitor mobile build is **not in this repo and not findable via the Explore pass** in `~/lingolinq-aac-mobile/` or via casual `gh repo list lingolinq` inspection. The Cordova plugin set could carry SDKs not visible here. **Item 5 SDK inventory is partial pending mobile wrapper inspection** (this is a known scoping gap also flagged by FOLLOWUPS-2026-04-26.md Section 5).

### Counts

- GATED: 4 (HubSpot, Google Analytics, Stripe, AI internal-only paths via `ai_board_generator`)
- UNCONDITIONAL P0: 2 (bugsnag, newrelic_rpm)
- INTERNAL but bypass-via-other-call-site: 2 (anthropic + ruby-openai used by `ai_word_predictor` without scrubbing - Item 1 P0)
- Verified absent: 16 high-risk consumer SDKs
- Native wrapper SDKs: NOT YET INVENTORIED (mobile wrapper repo not located)

### Recommendation per UNCONDITIONAL finding

- **bugsnag**: Add `Bugsnag.configure { |c| c.before_notify { |event| event.user = nil if user_under_13?(event) } }` initializer, or treat Bugsnag as a sub-processor in the privacy notice and obtain VPC for sub-processor disclosure.
- **newrelic_rpm**: Configure `newrelic.yml` to scrub user_id and IP for child users, OR disable transaction attributes entirely for routes serving under-13 traffic.


---

## Phase 3: Reconciliation

### Agent disagreements (resolved conservatively)

| # | Disagreement | Agent A | Agent B | Conservative resolution |
|---|--------------|---------|---------|--------------------------|
| 1 | Item 4 (school-official COPPA bypass) | SHIPPED. No code path treats school-official status as substitute. | TODO. `app/models/user.rb:958` short-circuits the entire COPPA branch when `authored_organization_id` is present, so org-authored users have NO consent record. | **TODO.** Agent B's reading is supported by direct file:line citation. The org-authored signup path is a de facto school-official bypass. |
| 2 | Item 5 Bugsnag gating | UNCONDITIONAL (no gate) | (Explore agent) GATED via `lib/external_tracker.rb` | **UNCONDITIONAL.** `external_tracker.rb` is the HubSpot gate per its own header. No Bugsnag-specific gating evidence. |

### Punch list

P0 = ship-blocker for COPPA Final Rule compliance. P1 = required for compliance posture but not the immediate enforcement vector. P2 = privacy-policy copy or documentation only.

| # | Item | Status | File:line | Severity | Owner / Next step |
|---|------|--------|-----------|----------|-------------------|
| 1a | AI predictor bypass of PiiScrubber/AiApiLog | TODO | `lib/ai_word_predictor.rb:74-106` (no scrub, no log, no consent, no token gate) | **P0** | **/gsd-fast** if just adding `PiiScrubber.redact_for_ai` + `AiApiLog.log_ai_call` + auth + flag wraps `predict`. /gsd-new-project if it requires designing a new shared `AiCallContext` helper used by all three call sites. |
| 1b | Separate VPC for AI/data sharing (distinct from signup COPPA) | TODO | None - feature does not exist; needed at `parental_consents_controller.rb`, new settings key on `User`, all AI call sites | **P0** | **/gsd-new-project** - schema change, new modal UX, new tokenized email flow, hard block at every AI call site, plus existing-user backfill plan. Cross-cutting. |
| 1c | Hard block on `coppa_parental_consent_pending?` before AI calls in `ai_board_generator` | TODO | `lib/ai_board_generator.rb:29` (only checks feature flag, not consent state) | **P0** | **/gsd-fast** - one-line addition to the gate, but requires deciding what to do with already-running tenants whose flag is enabled. |
| 2 | Biometric PI tagging for voice + dwell/gaze + retention | TODO | `app/models/button_sound.rb` (no biometric flag), `app/models/log_session.rb` (dwell timing in `data` blob), `lib/data_policy_enforcer.rb` (no scoped biometric deletion) | **P0** | **/gsd-new-project** - schema migration, model concern, retention worker scoping, VPC token check before save. |
| 3a | Privacy notice 312.10 categories incomplete | PARTIAL | `app/views/shared/_privacy.html.erb:67-70` | P1 | **/gsd-fast** - copy update enumerating AI logs, voice, dwell/gaze, school-tenant data retention windows. |
| 3b | `AiApiLog.redact_old_ip_addresses!` defined but unscheduled | PARTIAL | `app/models/ai_api_log.rb:108-112` (defined), `lib/tasks/scheduler.rake` (not wired) | P1 | **/gsd-fast** - one rake task entry. Same gap also flagged by `COMPLIANCE_STATUS_2026-04-23.md` action A4. |
| 3c | No retention enforcement for self-managed users / parents (`data_policy_version == 0`) | PARTIAL | `lib/data_policy_enforcer.rb:2-23` only sweeps `Organization.where("data_policy_version > 0")` | P1 | **/gsd-new-project** - retention defaults for self-managed users have policy implications (need to decide TTL for non-org accounts), then code change. |
| 4 | Org-authored signup skips COPPA consent branch (`authored_organization_id.present?`) | TODO | `app/models/user.rb:958` (skip), `:992-998` (sets `pending=false`) | **P0** | **/gsd-new-project** - decide whether org-authored signups should still record VPC (likely yes for under-13), what backfill looks like for existing org-authored users, and reconcile with NDPA / school-official 1999 FAQ guidance. |
| 4b | Privacy policy copy mentions "authorized school official" without AI/profiling carve-out | n/a | `app/views/shared/_privacy.html.erb:52` | P2 | **/gsd-fast** - copy update. |
| 5a | Bugsnag unconditional load, no under-13 gate | TODO | `Gemfile:69`; no `before_notify` filter; no `config/initializers/bugsnag.rb` scrubbing | **P0** | **/gsd-fast** - initializer with `before_notify` callback + DPA / sub-processor disclosure. |
| 5b | NewRelic unconditional load, no under-13 gate | TODO | `Gemfile:74`; `newrelic.yml` not configured for child PII scrubbing | **P0** | **/gsd-fast** - `newrelic.yml` attribute filter + DPA / sub-processor disclosure. |
| 5c | Native mobile wrapper SDK inventory missing | TODO | wrapper repo not located; package.json + Gemfile clean of consumer-analytics SDKs but mobile may carry more | P1 | **Find wrapper repo** (per FOLLOWUPS Section 5), then re-run SDK pass against its config. |

### Recommended GSD routing per TODO

| TODO id | Recommended route | Justification |
|---------|-------------------|---------------|
| 1a | /gsd-fast | One-shot wrap of `AiWordPredictor.predict` with scrub + log + consent gate |
| 1b | /gsd-new-project | Multi-phase: schema, parent UX, email flow, gate at every site, backfill |
| 1c | /gsd-fast | Single gate addition, low LOC |
| 2 | /gsd-new-project | Migration, model concern, worker, consent UX |
| 3a | /gsd-fast | Privacy policy copy edit |
| 3b | /gsd-fast | Single rake task entry |
| 3c | /gsd-new-project | Policy decision required before code |
| 4 | /gsd-new-project | Touches signup flow, has backfill implications |
| 4b | /gsd-fast | Copy edit |
| 5a | /gsd-fast | Single Bugsnag initializer |
| 5b | /gsd-fast | Single newrelic.yml change |
| 5c | Investigation thread, not GSD | Find wrapper repo first (depends on Section 5 of FOLLOWUPS) |

### Estimated time per follow-up

| Item | Effort estimate | Notes |
|------|----------------|-------|
| 1a | 1 to 2 hours | Wrap predict in PiiScrubber + AiApiLog + auth + flag |
| 1b | 4 to 8 weeks (multi-phase) | Schema, modal, email, gate at all sites, backfill |
| 1c | 30 minutes | Add `coppa_parental_consent_pending?` short-circuit |
| 2 | 4 to 6 weeks | Migration + retention worker + UX |
| 3a | 30 minutes | Copy edit |
| 3b | 30 minutes | One rake task |
| 3c | 2 to 4 weeks | Policy decision then code |
| 4 | 3 to 5 weeks | Reconcile NDPA, school-official guidance, backfill |
| 4b | 15 minutes | Copy edit |
| 5a | 1 hour | Bugsnag initializer + DPA update |
| 5b | 1 hour | newrelic.yml + DPA update |
| 5c | 1 to 2 hours investigation | Find wrapper repo, then separate SDK pass |


---

## Phase 4: Final summary

### Tallies (after conservative reconciliation)

- **SHIPPED:** 0 of 5 verbatim items (Item 4 reclassified TODO based on Agent B finding)
- **PARTIAL:** 1 of 5 verbatim items (Item 3 - retention; some pieces enforced, scope incomplete)
- **TODO:** 4 of 5 verbatim items (Items 1, 2, 4, 5)
- **Punch list rows:** 12 (some items split into sub-rows for routing)
- **P0 ship-blockers:** 6 sub-items (1a, 1b, 1c, 2, 4, 5a, 5b)
- **P1 important:** 3 sub-items (3a, 3b, 3c, 5c)
- **P2 doc/copy:** 1 sub-item (4b)

### Item #1 VPC blocker assessment

**Yes - Item #1 (separate VPC for AI/data sharing) blocks the AI board generator from running compliantly.** Specifically:

1. The board generator at `lib/ai_board_generator.rb` already routes through PiiScrubber + AiApiLog. That part is good.
2. But the only consent gate is the org-level `disable_ai_features` setting (a feature flag), not a VPC record specific to AI data sharing.
3. The FTC's Akin/FPF/PIPC commentary on the Final Rule is explicit: AI inference and AI training are NEVER "integral" to a service, so they cannot ride on the bundled signup-time COPPA consent.
4. Additionally, child users with `coppa_parental_consent_pending?` true can still trigger the AI call if their org has not opted out (no consent-pending short-circuit on the gate).

This means Section 5 of FOLLOWUPS-2026-04-26.md (AI board generator revenue audit) cannot proceed to "drive more usage" recommendations until Item 1b (separate AI VPC) is at least scoped, and Item 1c (consent-pending hard-block) is shipped. Sequencing: Section 1 follow-up #1c must ship before Section 4 can recommend usage growth.

### P0 Ship-blocker summary

| ID | Severity | Description | Why P0 |
|----|----------|-------------|--------|
| 1a | P0 | `AiWordPredictor.predict` sends user sentences verbatim to Anthropic and Gemini with no PiiScrubber, no AiApiLog, no auth, no flag, no consent | Per-keystroke-class call path; up to $53,088 per violation under FTC Final Rule |
| 1b | P0 | No "AI/data sharing" VPC record distinct from signup COPPA | FTC position: AI is never "integral"; bundled consent will not survive enforcement |
| 1c | P0 | `ai_board_generator` does not short-circuit on `coppa_parental_consent_pending?` | Children awaiting parental consent can still trigger AI calls in opted-in orgs |
| 2 | P0 | No biometric tagging on voice recordings or dwell/gaze timing; no scoped retention | AAC voice + gaze are dead-center biometric PI per Hintze; Final Rule covers these |
| 4 | P0 | `user.rb:958` skips entire COPPA consent branch for org-authored signups | De facto FERPA-school-official-as-COPPA-substitute pattern in code; FTC declined to codify this |
| 5a | P0 | Bugsnag loads unconditionally without scrubbing under-13 user_id/IP | Apitor settlement vector |
| 5b | P0 | NewRelic loads unconditionally without scrubbing under-13 user_id/IP | Apitor settlement vector |

### Compliance posture against the 2026-04-22 deadline

The deadline has passed (today is 2026-04-27, +5 days). Item 1c, 1a, 5a, 5b can ship within a week. Items 1b, 2, 4 are multi-week projects. **The company is currently non-compliant on the running-code dimension; documentation in `docs/legal/` is in better shape than the running code.** A risk-mitigation note acknowledging this gap should go to legal counsel.

### Branch information

- **Branch:** `compliance/coppa-final-rule-audit-2026-04-27`
- **Branched from:** `staging` at `d3c75a5a1`
- **Safety tag:** `local-staging-pre-coppa-recovery-2026-04-27`
- **Phase commits:** Phase 1 baseline, Phase 2A compliance-auditor, Phase 2B rails-ember-dev, Phase 2C Explore SDK, Phase 3 reconciliation, Phase 4 summary
- **Push status:** Pushed to origin on 2026-04-27. PR-create URL: https://github.com/lingolinq/LingoLinq-AAC/pull/new/compliance/coppa-final-rule-audit-2026-04-27
- **No PR opened in this session** - per audit policy, each TODO becomes its own follow-up thread.

### Estimated time for follow-up sessions

See punch list above. Aggregate:
- **Quick wins** (≤2 hr each, /gsd-fast): 1a, 1c, 3a, 3b, 4b, 5a, 5b, 5c-investigation. Total roughly 1 to 1.5 working days.
- **Multi-phase** (/gsd-new-project): 1b, 2, 3c, 4. Total roughly 12 to 22 weeks of single-engineer effort, or run 1b and 4 in parallel since they share consent UX work.

### Items where agents disagreed

- Item 4: SHIPPED vs TODO - **resolved TODO** (Agent B's `user.rb:958` citation is concrete code, Agent A's negative grep missed it).
- Item 5 Bugsnag: GATED vs UNCONDITIONAL - **resolved UNCONDITIONAL** (Explore's claimed gate at `external_tracker.rb` does not actually cover Bugsnag, that file is the HubSpot gate per its header).

---

## Re-verification: 2026-04-27 (independent re-run)

This audit was independently re-run on 2026-04-27 from a fresh session via `/lingo` plan-then-execute. Three new agent instances (compliance-auditor, rails-ember-dev, Explore) re-traced the same five items with no knowledge of this prior file. **All findings confirmed identically:**

- Item 1 TODO -- VPC absence reconfirmed at `lib/feature_flags.rb:80-94` and `lib/ai_board_generator.rb:29`. `Api::WordsController#predict` (`words_controller.rb:51-62`) is not even gated by `ai_word_prediction` flag (worse than board generator). All three call sites independently re-found.
- Item 2 TODO -- Re-confirmed no `biometric` column in `db/schema.rb`. `recordrtc` ungated. Privacy-policy line 39 contradiction with S3-stored voice clips re-flagged as Section 5 deception risk.
- Item 3 PARTIAL -- `redact_old_ip_addresses!` still unscheduled; privacy text (`privacy.hbs:81-84`) still single-line generic. Flusher still does not cascade to AiApiLog.
- Item 4 TODO -- `user.rb:958` `authored_organization_id.blank?` short-circuit re-found. Privacy template `privacy.hbs:66` still endorses "authorized school official" pattern.
- Item 5 PARTIAL -- Bugsnag and NewRelic still load unconditionally. New observation: Google Fonts (`index.html:89-91`) and jsDelivr CDN (`index.html:95-98`) leak child-user IP/UA on every page load. Native wrapper repo still not searched (separate audit thread per FOLLOWUPS Section 5).

**Aggregate:** 0 SHIPPED, 2 PARTIAL, 3 TODO. The 2026-04-22 deadline remains missed; the running-code posture has not changed since the prior audit was filed. **This file should be treated as load-bearing for the remediation work.**

Re-verified by: compliance-auditor + rails-ember-dev + Explore agents, run 2026-04-27 from `/home/scotw` via plan `we-are-working-eager-phoenix.md`.

