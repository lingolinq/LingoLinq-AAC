# LingoLinq Annual Compliance Audit — 2026-02-23

**Status:** FAIL (critical findings require remediation)
**Auditor:** Claude Code (automated) + manual review required
**Branch:** `security-hotfix-scot`
**Rails:** 6.1.7.10 | Ruby: 3.4.4 | Ember: 3.28

---

## Executive Summary

The audit covered 6 automated sections across MCP inventory, data flows, BAA status, AI features, security posture, and feature flags. **The codebase has strong AI compliance controls** (PII scrubber, audit logging, feature flags with org opt-out) but has **significant gaps in external service documentation and two critical security findings** inherited from the CoughDrop codebase.

| Area | Status | Key Finding |
|------|--------|-------------|
| MCP Connections | WARN | 4 MCPs undocumented in COMPLIANCE.md; antigravity-mcp has production Render write access |
| Data Flows | FAIL | **16 external services undocumented**; HubSpot receives all user PII (not just business contacts) |
| BAA Status | FAIL | **Render and AWS BAAs not yet executed** — required before any school/hospital deployment |
| AI Features | PASS | AI Board Generation fully compliant (PII scrubber + audit log + feature flag + org opt-out) |
| Security Posture | FAIL | **`permit_all_parameters = true` globally disables strong params**; Rails 6.1 is EOL |
| Feature Flags | PASS | All 5 AI flags correctly configured with org-level opt-out mechanism |

---

## Section 1: MCP Connection Inventory

### Inventory

| MCP | Claude | Gemini | COMPLIANCE.md | Zone | Concern |
|-----|:------:|:------:|:-------------:|------|---------|
| github | Yes | Yes | Yes | SAFE | None |
| render | Yes | Yes | Yes | SAFE | None |
| deepwiki | Yes | Yes | Yes | SAFE | None |
| n8n-mcp | Yes | Yes | Yes | CAUTION | None |
| filesystem | Yes | Yes | Yes | SAFE | None |
| sequential-thinking | Yes | Yes | Yes | SAFE | None |
| notion | Yes | Yes | Yes | CAUTION | None |
| perplexity | Yes | Yes | Yes | SAFE | None |
| chrome-devtools | Yes | Yes | Yes | SAFE | None |
| aws-mcp | Yes | Yes | **NO** | — | Not documented |
| postgres-dev | Yes | Yes | **NO** | — | Dev DB only (localhost) — OK but undocumented |
| playwright | Yes | Yes | **NO** | — | Not documented |
| docker | Yes | Yes | **NO** | — | Not documented |
| Hugging Face | Connector | — | **NO** | — | Not documented |
| Slack | — | — | Yes | CAUTION | Documented but not configured (planned) |
| antigravity-mcp | — | — | **NO** | — | **Has Render env var read/write + job trigger** |

### Production Credential Scan: PASS
No hardcoded production DB URLs or API keys in any MCP config. All use `${ENV_VAR}` references.

### Findings
- **MEDIUM:** antigravity-mcp has `get_render_env_vars` (exposes secrets), `update_render_env_var` (writes to prod), and `trigger_render_job` (executes commands on prod). Not currently in any client config but exists in project directory.
- **MEDIUM:** aws-mcp not documented — verify IAM credentials don't have prod S3 read access.
- **LOW:** postgres-dev, playwright, docker, Hugging Face not documented in COMPLIANCE.md Section 5.
- **LOW:** Slack documented but not yet configured.

---

## Section 2: Data Flow Map

### Critical: 16 Undocumented External Services

| Service | Receives User Data | Risk |
|---------|:-:|------|
| **HubSpot** (documented but scope wrong) | YES — all user registrations, not just business contacts | HIGH — sends communicator (student/patient) PII |
| **ipstack** | YES — user IP addresses over plaintext HTTP | HIGH — PII sent unencrypted |
| **Zendesk** | YES — name, email, IP, org in support tickets | HIGH — may contain student/patient info |
| **Google TTS** | YES — user-provided text | MEDIUM |
| **Google STT** | YES — user audio | MEDIUM |
| **Google Translate** | YES — user text (one call over HTTP) | MEDIUM |
| **Google Places** | YES — user lat/long | MEDIUM — location is PII |
| **OpenSymbols** | Queries — user vocabulary terms | LOW |
| **OpenAAC Workshop** | YES — usage log data | MEDIUM |
| **LessonPix** | YES — user credentials | MEDIUM |
| **Pixabay** | Queries only | LOW |
| **Giphy** | Queries only | LOW |
| **Tar Heel Reader** | Queries only | LOW |
| **abair.ie** (Irish TTS) | YES — user text | LOW |
| **Apple App Store** | Receipt data | LOW |
| **Gravatar** | MD5 hash of user email | LOW |

### AI API PiiScrubber Verification: PASS
Only one AI integration exists (AiBoardGenerator). It correctly calls `PiiScrubber.redact_for_ai()` before any AI API request. No other code paths bypass the scrubber.

---

## Section 3: BAA Status

| Service | BAA Required | Status | Action |
|---------|:---:|--------|--------|
| **Render.com** (PostgreSQL, Redis) | YES | **NOT EXECUTED** | **PRIORITY #1** — must execute before school/hospital deploy |
| **AWS** (S3, SES, SNS, Transcoder) | YES | **NOT EXECUTED** | **PRIORITY #2** — confirm BAA covers all 4 services |
| **HubSpot** | EVALUATE | Not needed per docs | **Reassess** — code sends all user PII, not just business contacts |
| **Zendesk** | EVALUATE | Not documented | May need BAA if support tickets contain student/patient info |
| **Google Cloud** (TTS, STT, Translate, Places) | EVALUATE | Not documented | May need BAA — receives user text, audio, location |
| Stripe | No | N/A | PCI-DSS handled by Stripe |
| All others (GitHub, Notion, etc.) | No | N/A | No user data |

---

## Section 4: AI Feature Audit — PASS

| Feature | Flag | PiiScrubber | AiApiLog | Documented | Status |
|---------|:----:|:-----------:|:--------:|:----------:|--------|
| AI Board Generation | YES | YES | YES | YES | **COMPLIANT** |
| AI Word Prediction | YES | N/A | N/A | N/A | Flag only — no code yet |
| AI Board Suggestions | YES | N/A | N/A | N/A | Flag only — no code yet |
| AI Symbol Search | YES | N/A | N/A | N/A | Flag only — no code yet |
| AI Compliance Logging | YES | N/A | N/A | N/A | Flag only — no code yet |

### One Issue Found
**MEDIUM:** `boards_controller.rb` `generate_labels` action does not pass `user: @api_user` to `AiBoardGenerator.generate_words`. This means:
- Audit logs lack user attribution (`user_global_id: nil`)
- The org-level AI opt-out is bypassed (generator receives `nil` user, returns `true`)

Fix: add `user: @api_user` to the `generate_words` call.

---

## Section 5: Security Posture

### Passing Checks
- No hardcoded secrets, API keys, passwords, or private keys in source
- All initializers use ENV vars
- Password hashing via GoSecure (bcrypt-based)
- Data-at-rest encryption via SecureSerialize
- AiApiLog does not store raw PII
- `force_ssl = true` in production
- Session cookies: secure + httponly + samesite:lax
- Rate limiting via Rack::Attack (3 tiers)
- Console audit logging with USER_KEY required
- Bugsnag PII filtering
- `.env` correctly gitignored

### Critical Findings

**1. `permit_all_parameters = true` (CRITICAL)**
File: `config/initializers/permit_all_parameters.rb`
Strong parameters are globally disabled. Every controller accepts every parameter. Combined with `constantize` in `Progress.perform_action`, this creates a remote code execution chain.

**2. Rails 6.1.7.10 is end-of-life (CRITICAL)**
Support ended 2024-10-01. No security patches being issued. Brakeman flags this as CWE-1104.

**3. Mandatory admin 2FA disabled (MEDIUM)**
Commented out at `app/models/concerns/passwords.rb:79-84` with a TODO to re-enable.

### Brakeman Summary
18 warnings: 7 high confidence (5 redirects, 1 CSRF, 1 EOL Rails), 10 medium (2 SQL injection, 5 command injection, 1 RCE, 1 ReDoS, 1 redirect), 1 weak.

---

## Section 6: Feature Flags — PASS

44 total flags. 5 AI-related. All AI flags correctly listed in `AI_FEATURES` constant.

Org-level opt-out mechanism verified:
- `ai_enabled_for?(user)` checks `org.settings['disable_ai_features']`
- `ai_feature_enabled_for?(feature, user)` layers: AI whitelist → org opt-out → feature flag

---

## Items Requiring Manual Review

These cannot be automated and need human action:

| # | Item | What to Do |
|---|------|-----------|
| 1 | Execute Render BAA | Contact Render sales, execute BAA covering PostgreSQL + Redis |
| 2 | Execute AWS BAA | Contact AWS, confirm BAA covers S3 + SES + SNS + Transcoder |
| 3 | Notion/HubSpot/Slack spot check | Search each platform for accidentally stored user data |
| 4 | Seed data review | Verify dev DB contains only synthetic data, no real users |
| 5 | Incident response drill | Tabletop: simulate a SEV-2 and walk through response plan |
| 6 | HubSpot scope review | Decide: filter communicator accounts from HubSpot, or execute BAA |
| 7 | AWS IAM key permissions | Verify dev key AKIA...RI72 has minimal permissions (dev bucket only) |

---

## Prioritized Remediation Plan

### Immediate (before any institutional deployment)
- [ ] Execute BAAs with Render and AWS
- [ ] Fix `permit_all_parameters = true` — add strong params to all controllers
- [ ] Pass `user: @api_user` in `boards_controller.rb` `generate_labels`

### Week 1
- [ ] Document all 16 undiscovered external services in COMPLIANCE.md Section 4
- [ ] Document 4 undocumented MCPs in COMPLIANCE.md Section 5
- [ ] Fix ipstack to use HTTPS (`lib/external_tracker.rb`, mailers)
- [ ] Fix Google Translate TTS to use HTTPS (`search_controller.rb`)
- [ ] Enable mandatory admin 2FA
- [ ] Review antigravity-mcp Render write tools for production safety

### Week 2-4
- [ ] Plan Rails 7.x upgrade (EOL Rails 6.1 is a critical gap)
- [ ] Evaluate HubSpot/Zendesk/Google Cloud BAA needs
- [ ] Parameterize SQL in `lib/worker.rb:40` and `board_downstream_button_set.rb:690`
- [ ] Sanitize shell commands in `uploadable.rb` and `sentence_pic.rb`
- [ ] Add missing ENV vars to `.env.example`

### Ongoing
- [ ] Ember → React migration (resolves ~180 npm vulns)
- [ ] Remove CoughDrop-era gems
- [ ] Remove coffee-rails, replace sassc-rails
