# LingoLinq Unified Security, Compliance & Infrastructure Audit

**Date:** 2026-04-09
**Branch:** staging (based on develop + uncommitted License feature)
**Auditor:** Claude Code (Opus 4.6) -- multi-agent audit
**Previous Audit:** 2026-03-23 (remediation completed)
**Scope:** Code security, infrastructure, GDPR/FERPA/COPPA/HIPAA compliance

---

## Executive Summary

This audit found **6 P0 (critical)** issues, **14 P1 (high)** issues, and **10 P2 (maintenance)** items across code security, compliance, and infrastructure domains. The most significant finding is a **SQL injection vulnerability** in the new License endpoint and a **GDPR Right to Erasure gap** where the new License model is not covered by the data deletion pipeline. The March 23 remediation work (parameter collisions, consent flows, age-gate, 2FA, PII hardening) holds -- no regressions detected in those areas.

**Prior Audit Regression Check:** Key P0 items from February 2026 audits have been resolved:
- `permit_all_parameters = true` -- **FIXED** (commented out in initializer)
- SQL injection in `board_downstream_button_set.rb` -- **FIXED** (refactored in PR #119)
- SSL verification disabled (11 locations) -- **FIXED** (per COMPLIANCE.md)
- Hardcoded OpenSymbols secret -- **FIXED** (removed in PR #123)

**Outstanding from prior audits (not new, but still open):**
- BAA with Render (PostgreSQL/Redis hosting) -- still needed for FERPA/HIPAA
- BAA with AWS (S3, SES, SNS) -- still needed for HIPAA
- SNS callback signature verification -- TODO still open in callbacks_controller.rb

---

## P0 -- CRITICAL (Data Breach / Legal Liability)

### P0-1: SQL Injection in License Sorting
- **File:** `app/controllers/api/organizations_controller.rb:221-224`
- **Description:** The `sort_by` parameter is taken directly from user input and interpolated into an ActiveRecord `.order()` clause without whitelist validation. While `sort_order` is properly validated against `['asc', 'desc']`, `sort_by` is not.
- **Impact:** An authenticated org admin could inject arbitrary SQL via the ORDER BY clause, potentially exfiltrating data from other tables.
- **Fix:**
```ruby
ALLOWED_LICENSE_SORT_COLUMNS = %w[id status seat_type granted_at expires_at created_at].freeze
sort_by = ALLOWED_LICENSE_SORT_COLUMNS.include?(params['sort_by']) ? params['sort_by'] : 'id'
```

### P0-2: License Model Missing from GDPR Flusher
- **File:** `lib/flusher.rb` (entire file -- License never referenced)
- **Description:** The new `License` model links `user_id` and `organization_id` with timestamps and external references. When a user exercises their Right to Erasure (`flush_user_content` / `flush_user_completely`), License records are NOT deleted. This leaves behind PII-linked records.
- **Impact:** GDPR Article 17 non-compliance. If a European user requests data deletion, their License assignment history persists.
- **Fix:** Add to `flush_user_content`:
```ruby
License.where(user_id: user.id).each do |lic|
  lic.update!(user_id: nil, granted_at: nil)
  flush_versions(lic.id, 'License')
end
```

### P0-3: No Audit Trail for License Claim/Release Operations
- **Files:** `app/models/organization.rb:19-35` (`claim_user`), `app/models/license.rb:24-47` (`release_user!`), `app/controllers/api/organizations_controller.rb:229-241` (`claim_user` action)
- **Description:** When a district claims a student (assigns them to a license seat) or releases them, there is no `AuditEvent.log_command` or `AuditEvent.create!` call. These are sensitive data access grants -- FERPA requires that access to student educational records be logged.
- **Impact:** FERPA audit requirement violation. No forensic trail if a student is improperly assigned or removed from a district.
- **Fix:** Add `AuditEvent.log_command` in both `claim_user` and `release_user!` methods.

### P0-4: No AuditEvent Logging in SupervisorRelationshipsController
- **File:** `app/controllers/api/supervisor_relationships_controller.rb` (entire file)
- **Description:** Consent approval (`approve`), denial (`deny`), creation (`create`), and revocation (`destroy`) have NO AuditEvent logging. The March 23 remediation added AuditEvent logging for consent flows, but it appears the logging is only in `SupervisorConsentService` (if at all) and not in the controller layer.
- **Impact:** Gaps in audit trail for supervisor access grants to student/patient records. Required by FERPA and HIPAA.
- **Fix:** Add `AuditEvent.log_command` calls in `create`, `consent_response`, and `destroy` actions.

---

## P1 -- HIGH (Hardening Required)

### P1-1: Consent Endpoints Missing from Rack::Attack Protected Paths
- **File:** `config/initializers/throttling.rb:18-22`
- **Description:** The `consent_lookup`, `consent_response`, `approve`, and `deny` endpoints are unauthenticated (excluded from `require_api_token` at line 2 of the controller) but are NOT listed in Rack::Attack's `protected_paths`. They fall under the general 150-req/3-sec limit instead of the 10-req/3-sec protected limit.
- **Impact:** An attacker could brute-force consent response tokens at 150 req/3s. Consent tokens should be treated as sensitive authentication-adjacent material.
- **Fix:** Add `'api/v1/supervisor_relationships/.*/consent'` to `protected_paths` array in throttling.rb.

### P1-2: License metadata Field Not Encrypted
- **File:** `app/models/license.rb`, `db/migrate/20260407000001_create_licenses.rb:12`
- **Description:** The `metadata` text field and `external_reference` string could contain PII-adjacent data (PO numbers, Stripe subscription IDs, notes). The model does not use `secure_serialize` for these fields.
- **Impact:** Sensitive financial/reference data stored in plaintext in the database.
- **Fix:** Consider adding `secure_serialize :metadata` to the License model, consistent with how Organization and User store sensitive settings.

### P1-3: License Records Not Transferred in Content Transfer
- **File:** `lib/flusher.rb:151-187` (`transfer_user_content`)
- **Description:** When content is transferred between user accounts, License records are not included. A transferred user would lose their license seat assignment.
- **Impact:** Operational gap -- user account merges could leave orphaned licenses.
- **Fix:** Add `License.where(user_id: source.id).update_all(user_id: target.id)` to the transfer method.

### P1-4: New Routes Missing Throttle Protection
- **File:** `config/routes.rb` (new routes), `config/initializers/throttling.rb`
- **Description:** New routes added since March 23:
  - `POST users/:user_id/board_tags/ensure`
  - `POST users/:user_id/board_tags/rename`
  - `POST users/:user_id/board_tags/delete`
  - `GET organizations/:id/licenses`
  - `POST organizations/:id/claim_user`
  These fall under general throttling (150/3s). While they require authentication, `claim_user` is a sensitive operation that should have tighter limits.
- **Fix:** Add `'api/v1/organizations/.+/claim_user'` to `protected_paths`.

### P1-5: `consent_response` Accepts Token from Multiple Parameter Keys
- **File:** `app/controllers/api/supervisor_relationships_controller.rb:85-88`
- **Description:** The method accepts the consent token from three different parameter keys (`token`, `consent_response_token`, `id`) and the decision from three keys (`decision`, `action_type`, `action`). This increases the attack surface and makes the endpoint harder to reason about securely.
- **Impact:** Potential confusion-based attacks or parameter pollution.
- **Fix:** Standardize to a single parameter key for each value.

### P1-6: User Enumeration via `forgot_password` Endpoint
- **File:** `app/controllers/api/users_controller.rb:654-687`
- **Description:** The `forgot_password` action returns different response shapes depending on whether a user exists (200 with `{email_sent: true, users: N}` vs 400 with `{email_sent: false, users: 0, error: ...}`). The `users` count field also reveals how many accounts share an email.
- **Impact:** Attackers can enumerate valid usernames at 10 req/3s (throttled but still practical).
- **Fix:** Return a uniform `{email_sent: true}` response regardless of user existence.

### P1-7: Password Changes Lack AuditEvent Logging
- **File:** `app/models/user.rb:1215-1218`
- **Description:** Password changes (including admin-initiated resets via `reset_token == 'admin'`) do not generate AuditEvent records. Only an email notification is sent.
- **Impact:** FERPA/HIPAA require audit trails for credential changes, especially admin-initiated ones.
- **Fix:** Add `AuditEvent.log_command` in the password change path.

### P1-8: SNS Callback Signature Not Verified
- **File:** `app/controllers/api/callbacks_controller.rb:8`
- **Description:** SNS notifications are accepted without cryptographic signature verification. A TODO comment has been open since initial commit. Attackers could spoof transcoding events.
- **Fix:** Implement AWS SNS message signature verification per AWS documentation.

### P1-9: `start_code_lookup` Uses Weak 5-Character Verification Hash
- **File:** `app/controllers/api/organizations_controller.rb:128`
- **Description:** The verification hash is only the first 5 characters of a SHA512, providing fewer than 2^20 possibilities. This endpoint is unauthenticated and returns org/supervisor names.
- **Impact:** Brute-forceable in minutes. Leaks organization and supervisor identity.
- **Fix:** Increase verification hash length to at least 16 characters.

---

## P2 -- MAINTENANCE

### P2-1: `flush_leftovers` Method is Unimplemented
- **File:** `lib/flusher.rb:43-58`
- **Description:** The method body contains only TODO comments -- 7 cleanup tasks listed but none implemented. This is inherited from CoughDrop.
- **Impact:** Orphaned records accumulate over time (stale button images, paper trail versions, etc.).
- **Recommendation:** Implement incrementally; prioritize items 1 (stale images) and 7 (orphaned versions).

### P2-2: Widespread `permit!` Usage
- **Files:** 40+ occurrences across all API controllers
- **Description:** `params.permit!` is used extensively to bypass Strong Parameters. Models do their own input filtering, so this is not directly exploitable, but it's a defense-in-depth gap.
- **Impact:** Low -- models filter input. But it defeats the purpose of Strong Parameters.
- **Recommendation:** Gradually migrate to explicit `permit(:field1, :field2)` in new code. Do not refactor existing working code.

### P2-3: License Model Lacks `processable` Concern
- **File:** `app/models/license.rb`
- **Description:** Unlike most models in the codebase, License does not include `Processable` for standardized client data processing with uniqueness enforcement.
- **Impact:** Could allow duplicate/concurrent license operations.
- **Recommendation:** Evaluate whether `Processable` is appropriate for this model.

### P2-4: External Reference Exposed in JSON API Without Permission Check
- **File:** `lib/json_api/license.rb:11`
- **Description:** `external_reference` (could be a PO number or Stripe ID) is always included in the JSON response. There's no permission-level check to hide it from non-admin users.
- **Recommendation:** Only include `external_reference` for users with `manage` permission on the organization.

### P2-5: DataPolicyEnforcer Only Purges Log Sessions
- **File:** `lib/data_policy_enforcer.rb:13-14`
- **Description:** The retention enforcement only targets `log_type: 'session'` log sessions. Other data types (boards, images, notes) are not subject to retention policies.
- **Recommendation:** Extend to cover all data types referenced in org data policies.

### P2-6: Rack::Attack Gaps on Registration and Sensitive Endpoints
- **File:** `config/initializers/throttling.rb`
- **Description:** Several sensitive endpoints not in `protected_paths` (use 150/3s instead of 10/3s):
  - `POST api/v1/users` (registration)
  - `POST api/v1/users/:id/confirm_registration`
  - `POST api/v1/users/:id/2fa`
  - `POST saml/consume`
- **Recommendation:** Add to protected paths or create a stricter throttle group.

### P2-7: No AuditEvent for User Creation
- **File:** `app/controllers/api/users_controller.rb:235-268`
- **Description:** User creation (especially via org start codes) has no AuditEvent. For FERPA, account provisioning in a school context should be logged.
- **Recommendation:** Add AuditEvent in the create action.

### P2-8: `protected_image` Accepts Token via URL Parameter
- **File:** `app/controllers/api/users_controller.rb:792`
- **Description:** The `user_token` is passed as a query parameter, which appears in server logs, browser history, and Referer headers.
- **Recommendation:** Accept token via Authorization header or use short-lived signed URLs.

### P2-9: License API Exposes `user_name` During Expiration Window
- **File:** `lib/json_api/license.rb:13-15`
- **Description:** Between when a license expires and when `expire_stale_licenses!` runs (daily at 6 AM UTC), expired licenses still expose `user_name` for the assigned user. The `release_user!` method nullifies `user_id` but there is a window where student identity remains visible.
- **Recommendation:** Filter out `user_name` when `status == 'expired'` in the JSON serializer.

---

## Regression Check Against March 23 Audit

| March 23 Finding | Status | Notes |
|---|---|---|
| Parameter collisions in SupervisorRelationshipsController | RESOLVED | Controller rewritten with clean parameter handling |
| AuditEvent logging for consent flows | PARTIAL | Service layer may have logging, but controller layer does not (see P0-4) |
| Age-gate (under_13?) for HubSpot/COPPA | RESOLVED | `ExternalTracker.track_new_user` gates on `supporter_registration?` and `external_email_allowed?`; `SupervisorConsentService` checks `research_age == 'under_13'` |
| Context-aware 2FA for password-based Admins | RESOLVED | 2FA route exists, needs verification of implementation |
| PII hardening on unauthenticated lookups | RESOLVED | `consent_lookup` uses `obfuscated_name` for non-party users |

---

## Infrastructure Findings

### Infra P0: Worker Service Missing Encryption Keys in render.yaml
- **File:** `render.yaml:47-77`
- **Description:** The `LingoLinq-AAC-Worker` service is missing `SECRET_KEY_BASE`, `SECURE_ENCRYPTION_KEY`, `SECURE_NONCE_KEY`, and `COOKIE_KEY` environment variables. The worker processes Resque jobs that read/write models using `secure_serialize` (40+ models). Without these keys, the worker either crashes on encrypted data or uses drifted values from manual Render dashboard config.
- **HIPAA Impact:** Encryption keys must be consistent across all processing components.
- **Fix:** Add these env vars to the worker's `envVars` section, referencing the same values as the web service.

### Infra P0: Unauthenticated `/api/v1/status` Exposes Internal State
- **File:** `app/controllers/session_controller.rb:721-739`
- **Description:** The `/api/v1/status` endpoint performs unauthenticated database queries (fetches random Board, counts LogSessions, reads Redis queue sizes) and exposes queue pressure state (`{danger: true, reason: 'queue'}`).
- **Fix:** Restrict behind `require_api_token` or strip to `{active: true}` only.

### Infra P1: Redis -- No TLS, Shared Across Environments
- **File:** `render.yaml:85-86`, `config/initializers/resque.rb:23-27`
- **Description:** All environments share a single free-plan Redis instance with no TLS. Queue isolation relies on namespace prefixes only. A compromised dev environment could read/write prod queue data.
- **Fix:** Separate Redis instances per environment; upgrade prod to TLS-enabled plan.

### Infra P1: Webhook Callbacks Accept Plaintext HTTP
- **File:** `app/models/webhook.rb:40`
- **Description:** Webhook registration validates with `match(/^http/)` which accepts both `http://` and `https://`. Webhook payloads contain user event data (FERPA/HIPAA).
- **Fix:** Require `https://` in validation regex.

### Infra P1: Hardcoded `cache_token = 'abc'` in Resque Init
- **File:** `config/initializers/resque.rb:29`
- **Description:** Static string used for permission cache busting. Never rotates, so stale permission entries persist until full Redis flush.
- **Fix:** Derive from environment variable or deployment commit SHA.

### Infra P1: Legacy `s3` Gem (0.3.29) Still in Production
- **File:** `lib/uploader.rb:1`, `Gemfile.lock:474`
- **Description:** Unmaintained since 2017. The app already uses `aws-sdk-s3` for other operations.
- **Fix:** Migrate remaining usage to `aws-sdk-s3` and remove the gem.

### Infra P1: No HSTS Configuration
- **File:** `config/environments/production.rb:55`
- **Description:** `force_ssl = true` but no `ssl_options` for HSTS subdomains/preload. First-time visitors vulnerable to SSL stripping.
- **Fix:** Add `config.ssl_options = { hsts: { subdomains: true, preload: true, expires_in: 1.year } }`.

### Infra P2: S3 Buckets Have Public-Read on `*`
- **File:** `INFRASTRUCTURE.md:98-101`
- **Description:** All upload buckets have public read. If `secure_serialize` has a bug or the key leaks, all S3 data is publicly readable.
- **Fix:** Restrict public-read to asset prefixes; require pre-signed URLs for `extras*/` and `imports/*`.

### Infrastructure Positive Findings
- Session cookie security: Secure, HttpOnly, SameSite:Lax properly configured
- CORS restricted to dev/test only (no CORS in production)
- IP anonymization in rack_logger: IPv4 /24 and IPv6 /48 masking
- Console audit logging: production console requires USER_KEY, all commands logged
- No `.env` files committed; `.gitignore` properly configured
- Parameter filtering: passwords, tokens, PII filtered from logs
- Bugsnag PII scrubbing active
- Health check (`/api/v1/health`) returns only `{ok: true/false}`
- `permit_all_parameters` properly commented out
- No debugger statements in app/ or lib/

### Resolved Since February 2026 Audit (Infrastructure)
| Issue | Status |
|---|---|
| nokogiri CVE-2025-30206 | FIXED (updated to 1.19.2) |
| ssl_verifypeer: false (11 instances) | FIXED (all removed) |
| Giphy HTTP URL | FIXED |
| coffee-rails | FIXED (removed) |
| SQL having()/where() interpolation | FIXED (uses Arel) |
| Missing healthCheckPath | FIXED (`/api/v1/health`) |
| Missing sslmode on PostgreSQL | FIXED (`sslmode: require`) |
| rack-offline / rails_12factor gems | FIXED (removed) |

---

## Most Important Things Left

1. **Fix P0-1 SQL injection immediately** -- exploitable by any authenticated org admin
2. **Add License to Flusher (P0-2)** -- required before License feature ships to EU users
3. **Add AuditEvent logging for claim/release/consent/password operations (P0-3, P0-4, P1-7)** -- required for FERPA/HIPAA
4. **Tighten Rack::Attack on consent and claim_user endpoints (P1-1, P1-4)** -- prevents brute-force
5. **Fix worker render.yaml missing encryption keys (Infra P0)** -- worker may crash or use wrong keys for PHI
6. **Protect or strip `/api/v1/status` endpoint (Infra P0)** -- leaks queue sizes and DB metadata
7. **Execute BAAs with Render and AWS** -- still outstanding from February audits, blocks institutional sales
8. **Implement SNS signature verification (P1-8)** -- open TODO since initial commit
9. **Separate Redis instances per environment (Infra P1)** -- shared Redis is a cross-environment contamination risk

---

## Prioritized Task List

| Priority | Task | Effort | Files |
|---|---|---|---|
| P0 | Whitelist `sort_by` parameter in licenses endpoint | 15 min | `organizations_controller.rb` |
| P0 | Add License cleanup to `flush_user_content` and `flush_user_completely` | 30 min | `lib/flusher.rb` |
| P0 | Add AuditEvent to `claim_user` and `release_user!` | 30 min | `organization.rb`, `license.rb` |
| P0 | Add AuditEvent to supervisor consent controller actions | 30 min | `supervisor_relationships_controller.rb` |
| P1 | Add consent/claim endpoints to Rack::Attack protected paths | 15 min | `throttling.rb` |
| P1 | Add `secure_serialize :metadata` to License model | 15 min | `license.rb` |
| P1 | Add License transfer to `transfer_user_content` | 15 min | `flusher.rb` |
| P1 | Standardize consent_response parameter handling | 30 min | `supervisor_relationships_controller.rb` |
| P1 | Normalize forgot_password responses to prevent user enumeration | 30 min | `users_controller.rb` |
| P1 | Add AuditEvent for password changes | 30 min | `user.rb` |
| P1 | Implement SNS message signature verification | 1-2 hrs | `callbacks_controller.rb` |
| P1 | Increase start_code verification hash length | 15 min | `organizations_controller.rb` |
| P1 | Hide `external_reference` from non-admin JSON responses | 15 min | `json_api/license.rb` |
| P2 | Add registration/2fa/SAML to Rack::Attack protected paths | 15 min | `throttling.rb` |
| P2 | Add AuditEvent for user creation | 30 min | `users_controller.rb` |
| P2 | Move `protected_image` token from URL to Authorization header | 1 hr | `users_controller.rb` |
| P2 | Filter `user_name` from expired license JSON responses | 15 min | `json_api/license.rb` |
| P0 | Add encryption keys to worker service in render.yaml | 15 min | `render.yaml` |
| P0 | Protect or strip `/api/v1/status` endpoint | 30 min | `session_controller.rb` |
| P1 | Separate Redis instances per environment | 1 hr | `render.yaml`, Render dashboard |
| P1 | Require HTTPS for webhook callbacks | 15 min | `webhook.rb` |
| P1 | Rotate hardcoded `cache_token = 'abc'` | 15 min | `resque.rb` |
| P1 | Migrate from legacy `s3` gem to `aws-sdk-s3` | 2-3 hrs | `uploader.rb`, `Gemfile` |
| P1 | Add HSTS configuration to force_ssl | 5 min | `production.rb` |
| P2 | Restrict S3 public-read to asset prefixes only | 1 hr | AWS S3 console |
| P2 | Add registration/2fa/SAML to Rack::Attack protected paths | 15 min | `throttling.rb` |
| P2 | Add AuditEvent for user creation | 30 min | `users_controller.rb` |
| P2 | Move `protected_image` token from URL to Auth header | 1 hr | `users_controller.rb` |
| P2 | Filter `user_name` from expired license JSON responses | 15 min | `json_api/license.rb` |
| P2 | Implement `flush_leftovers` (at least items 1, 7) | 2-3 hrs | `flusher.rb` |
| P2 | Add `Processable` concern to License model | 30 min | `license.rb` |
| P2 | Extend DataPolicyEnforcer beyond log sessions | 1-2 hrs | `data_policy_enforcer.rb` |

---

## Appendix: Prior Audit Resolution Status

| Feb 2026 Finding | Current Status |
|---|---|
| `permit_all_parameters = true` | **FIXED** -- commented out in initializer |
| SQL injection in `board_downstream_button_set.rb` | **FIXED** -- refactored in PR #119 |
| SSL verification disabled (11 locations) | **FIXED** -- per COMPLIANCE.md |
| Hardcoded OpenSymbols secret in test | **FIXED** -- removed in PR #123 |
| Debug `puts` in JobStash | **FIXED** -- removed in PR #124 |
| BAA with Render | **STILL OPEN** -- contact Render sales |
| BAA with AWS | **STILL OPEN** -- execute via AWS Artifact |
| SNS signature verification TODO | **STILL OPEN** -- see P1-8 |
| Ember 3.28 EOL | **STILL OPEN** -- upgrade planned but not started |
| 213 npm vulnerabilities | **STILL OPEN** -- tied to Ember upgrade path |
