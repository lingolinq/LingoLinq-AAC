# Security Hotfix Scan — 2026-02-22

**Project:** LingoLinq-AAC
**Ruby:** 3.4.4 | **Rails:** 7.2.3 | **Ember:** 3.28
**Status:** FAIL
**Total findings:** 53 (14 critical, 16 high, 11 medium, 7 low, 5 info)

---

## Critical Findings

| ID | Category | File | Line | Issue | Fix |
|----|----------|------|------|-------|-----|
| SEC-001 | cve | Gemfile.lock | 260 | nokogiri 1.19.0 — CVE-2025-30206 XML C14N failure enables SAML auth bypass | `bundle update nokogiri` to >= 1.19.1 |
| SEC-002 | ssl | lib/uploader.rb | 417,534,624 | `ssl_verifypeer => false` on 3 Typhoeus calls (OpenSymbols, Pixabay) | Remove `ssl_verifypeer => false` |
| SEC-003 | ssl | lib/open_symbols.rb | 49,63,106,122,235 | `ssl_verifypeer: false` on 5 calls including secret token exchange | Remove `ssl_verifypeer: false` |
| SEC-004 | ssl | app/models/button_image.rb | 226 | `ssl_verifypeer => false` on OpenSymbols API call | Remove `ssl_verifypeer => false` |
| SEC-005 | ssl | app/models/board.rb | 1313 | `ssl_verifypeer => false` on OpenSymbols search | Remove `ssl_verifypeer => false` |
| SEC-006 | cve | app/frontend (npm) | - | babel-traverse — GHSA-67hx-6x53-jw92 arbitrary code execution (CVSS 9.4) | Requires ember-cli upgrade |
| SEC-007 | cve | app/frontend/package.json | 55 | lodash >= 4.17.11 — 5 prototype pollution CVEs (CVSS up to 9.1) | Pin to `^4.17.21` |
| SEC-008 | cve | app/frontend (npm) | - | deep-extend — GHSA-hr2v-3952-633q prototype pollution (CVSS 9.8) | Remove ember-cli-update from dependencies |
| SEC-009 | cve | app/frontend (npm) | - | git-diff-apply — GHSA-84cm-v6jp-gjmr OS command injection (CVSS 9.8) | Remove ember-cli-update from dependencies |
| SEC-010 | cve | app/frontend (npm) | - | json-schema — GHSA-896r-f27r-55mw prototype pollution (CVSS 9.8) | Remove ember-cli-update from dependencies |
| SEC-011 | cve | app/frontend (npm) | - | minimist — GHSA-xvch-5gv4-984h prototype pollution (CVSS 9.8) | Remove ember-cli-update from dependencies |
| SEC-012 | cve | app/frontend (npm) | - | rfc6902 — GHSA-p495-jxh2-wrfg prototype pollution (CVSS 9.8) | Remove ember-cli-update from dependencies |
| SEC-013 | cve | app/frontend (npm) | - | form-data — GHSA-fjxv-7rqg-78g4 unsafe random boundary | Remove ember-cli-update from dependencies |
| SEC-014 | cve | app/frontend/package.json | 63 | ember-cli-update in `dependencies` (not devDependencies) — pulls in 6 critical transitive vulns | Move to devDependencies or remove |

## High Findings

| ID | Category | File | Line | Issue | Fix |
|----|----------|------|------|-------|-----|
| SEC-015 | ssl | lib/uploader.rb | 569 | Giphy API called over plaintext `http://` — API key + queries exposed | Change to `https://api.giphy.com` |
| SEC-016 | cve | Gemfile | 38 | coffee-rails 5.0.0 / coffee-script-source 1.12.2 — abandoned since 2017 | Remove; migrate .coffee files to ES6 |
| SEC-017 | cve | Gemfile | 32 | sassc 2.4.0 / sassc-rails 2.1.2 — archived Oct 2025, no security patches | Migrate to dartsass-rails |
| SEC-018 | cve | app/frontend/package.json | 30,41,47 | ember-cli/source/data ~3.28.0 — EOL, 180+ transitive vulns | Plan Ember 5.x migration |
| SEC-019 | cve | app/frontend/package.json | 49 | eslint ^5.16.0 — years past EOL | Upgrade to eslint 9.x |
| SEC-020 | cve | app/frontend (npm) | - | braces < 3.0.3 — uncontrolled resource consumption (CVSS 7.5) | Requires ember-cli upgrade |
| SEC-021 | cve | app/frontend (npm) | - | tar (8 CVEs) — path traversal, arbitrary file overwrite (CVSS 8.8) | Requires ember-cli upgrade |
| SEC-022 | cve | app/frontend (npm) | - | ansi-html < 0.0.8 — uncontrolled resource consumption | Requires ember-cli upgrade |
| SEC-023 | cve | app/frontend (npm) | - | json5 < 1.0.2 — prototype pollution (CVSS 7.1) | Requires ember-cli upgrade |
| SEC-024 | cve | app/frontend (npm) | - | cross-spawn < 6.0.6 — ReDoS (CVSS 7.5) | Requires ember-cli upgrade |
| SEC-025 | cve | app/frontend (npm) | - | semver < 5.7.2 — ReDoS (CVSS 7.5) | Requires ember-cli upgrade |
| SEC-026 | cve | app/frontend (npm) | - | minimatch < 3.0.5 — ReDoS (CVSS 7.5) | Requires ember-cli upgrade |
| SEC-027 | cve | app/frontend/bower.json | - | moment ~2.9.0 — 2015-era, multiple CVEs; bootstrap ~3.3.2 — EOL, XSS CVEs | Remove Bower; upgrade or replace |
| SEC-028 | cve | Gemfile.lock | 447 | s3 0.3.29 — unmaintained, project already uses aws-sdk | Replace with aws-sdk-s3 |
| SEC-029 | cve | Gemfile.lock | 186 | go_secure 0.70 — CoughDrop-era gem, audit for relevance | Audit and update or replace |
| SEC-030 | cve | Gemfile.lock | 297 | permissable-coughdrop 0.3.4 — needs rebrand, limited community review | Republish as permissable-lingolinq |

## Medium Findings

| ID | Category | File | Line | Issue | Fix |
|----|----------|------|------|-------|-----|
| SEC-031 | sql-injection | lib/worker.rb | 40 | `having("COUNT(user_id) > #{cutoff}")` — interpolation in HAVING clause | Use `having("COUNT(user_id) > ?", cutoff)` |
| SEC-032 | sql-injection | lib/exporter.rb | 17 | `group()` and `count()` with constant interpolation — pattern risk | Add whitelist validation on LOG_DIVIDER |
| SEC-033 | ssl | spec/**/*.rb | - | 30+ test expectations codify `ssl_verifypeer: false` behavior | Update tests when fixing SSL-001..004 |
| SEC-034 | ssl | render.yaml | - | No `healthCheckPath` configured for web service | Add `healthCheckPath: /api/v1/health` |
| SEC-035 | ssl | render.yaml / database.yml | - | No explicit `sslmode` for PostgreSQL connection | Add `?sslmode=require` to DATABASE_URL |
| SEC-036 | ssl | session_controller.rb | 601 | `LLWEBSOCKET_URL` not validated for `wss://` protocol | Add server-side `wss://` validation |
| SEC-037 | cve | app/frontend/package.json | 63 | ember-cli-update ^0.48.2 in dependencies — should be devDependencies | Move to devDependencies |
| SEC-038 | cve | app/frontend (npm) | - | @babel/runtime < 7.26.10 — RegExp complexity (CVSS 6.2) | Requires ember-cli upgrade |
| SEC-039 | cve | app/frontend (npm) | - | ajv < 6.12.3 — prototype pollution + ReDoS | Requires ember-cli upgrade |
| SEC-040 | cve | app/frontend (npm) | - | micromatch < 4.0.8 — ReDoS (CVSS 5.3) | Requires ember-cli upgrade |
| SEC-041 | cve | app/frontend (npm) | - | bn.js < 5.2.3 — infinite loop (CVSS 5.3) | Requires ember-cli upgrade |

## Low Findings

| ID | Category | File | Line | Issue | Fix |
|----|----------|------|------|-------|-----|
| SEC-042 | sql-injection | app/models/board_downstream_button_set.rb | 690 | `where("id > #{start_id}")` — internal method but not parameterized | Use `where("id > ?", start_id)` |
| SEC-043 | ssl | app/models/webhook.rb | 40 | Webhook callbacks accept `http://` — no HTTPS requirement | Require `https://` for callbacks |
| SEC-044 | ssl | app/frontend/tests/ | - | `http://` S3 URLs in test fixtures | Update to `https://` |
| SEC-045 | ssl | N/A | - | No staging.rb environment file | Document staging RAILS_ENV |
| SEC-046 | cve | Gemfile.lock | 332 | rack-offline 0.6.4 — stale, service workers are modern replacement | Remove gem |
| SEC-047 | cve | Gemfile.lock | 493 | ttfunk 1.7.0 — pinned to old version, current is 1.8.x | Update pin to ~> 1.8 |
| SEC-048 | cve | Gemfile.lock | 296 | pdf-core 0.9.0 — stale, current is 0.10.x | Update via prawn upgrade |

## Info Findings

| ID | Category | File | Line | Issue | Fix |
|----|----------|------|------|-------|-----|
| SEC-049 | ssl | config/environments/production.rb | 54 | `force_ssl = true` OK — but no `ssl_options` for HSTS tuning | Add `ssl_options: { hsts: { subdomains: true, preload: true } }` |
| SEC-050 | cve | Gemfile | 46 | rails_12factor 0.0.3 — Heroku-era gem, unnecessary on Render | Remove gem |
| SEC-051 | cve | app/frontend/package.json | 59 | qunit-dom ^0.8.4 — very outdated test dep | Upgrade to 3.x |
| SEC-052 | cve | Gemfile.lock | 137 | boy_band 0.1.16 — CoughDrop ecosystem, limited oversight | Audit for necessity |
| SEC-053 | sql-injection | N/A | - | No critical SQL injection patterns found — codebase uses parameterized queries well | Maintain current practices |

---

## Verified as Patched (No Action Required)

| Package | Version | Status |
|---------|---------|--------|
| rails | 7.2.3 | Patched (CVE-2025-24293) |
| rack | 2.2.21 | Patched (CVE-2025-27610) |
| puma | 7.1.0 | No known CVEs |
| ruby-saml | 1.18.1 | Patched (CVE-2025-25291/25292/25293) |
| rexml | 3.4.4 | Patched (CVE-2025-58767) |
| uri | 1.1.1 | Patched (CVE-2025-61594) |
| redis | 5.4.1 | Current |
| loofah | 2.25.0 | Current |
| rails-html-sanitizer | 1.6.2 | Patched |
| rack-cors | 2.0.2 | Current |
| stripe | 18.0.0 | Current |
| pg | 1.6.3 | Current |
| newrelic_rpm | 9.23.0 | Current |
| aws-sdk-core | 3.237.0 | Current |

---

## Remediation Plan

### Day 1 — Critical (must-fix)

- [ ] **SEC-001**: `bundle update nokogiri` (SAML auth bypass risk)
- [ ] **SEC-002..005**: Remove all `ssl_verifypeer => false` from 4 files (11 locations total):
  - `lib/uploader.rb` (lines 417, 534, 624)
  - `lib/open_symbols.rb` (lines 49, 63, 106, 122, 235)
  - `app/models/button_image.rb` (line 226)
  - `app/models/board.rb` (line 1313)
- [ ] **SEC-033**: Update ~30 test expectations to match
- [ ] **SEC-007**: Pin lodash to `^4.17.21` in package.json
- [ ] **SEC-014/037**: Move ember-cli-update to devDependencies (eliminates SEC-008..013)
- [ ] **SEC-015**: Change Giphy URL from `http://` to `https://`

### Days 2-3 — High priority

- [ ] **SEC-016**: Remove coffee-rails, migrate .coffee to ES6
- [ ] **SEC-017**: Replace sassc-rails with dartsass-rails
- [ ] **SEC-028**: Replace `s3` gem with `aws-sdk-s3`
- [ ] **SEC-031**: Fix SQL `having()` interpolation in lib/worker.rb
- [ ] **SEC-042**: Fix SQL `where()` interpolation in board_downstream_button_set.rb
- [ ] **SEC-032**: Add whitelist validation on LOG_DIVIDER in lib/exporter.rb
- [ ] **SEC-035**: Add `sslmode=require` to DATABASE_URL
- [ ] **SEC-034**: Add `healthCheckPath` to render.yaml
- [ ] **SEC-050**: Remove rails_12factor gem

### Days 4-5 — Medium priority and hardening

- [ ] **SEC-036**: Validate LLWEBSOCKET_URL for `wss://`
- [ ] **SEC-043**: Require `https://` for webhook callbacks
- [ ] **SEC-027**: Remove Bower; replace moment/bootstrap with modern alternatives
- [ ] **SEC-046..048**: Remove rack-offline, update ttfunk/pdf-core
- [ ] **SEC-049**: Add HSTS options to `config.ssl_options`
- [ ] **SEC-029/030/052**: Audit CoughDrop-era gems (go_secure, permissable-coughdrop, boy_band)

### Ongoing — Ember 5.x migration (resolves ~180 npm vulns)

- [ ] **SEC-018**: Upgrade ember-cli, ember-source, ember-data to 5.x
- [ ] **SEC-019**: Upgrade eslint to 9.x
- [ ] **SEC-020..026, SEC-038..041**: Resolved by Ember 5.x upgrade

---

## Summary

**14 critical** findings require immediate action. The highest-urgency items are:

1. **nokogiri 1.19.0** (CVE-2025-30206) — enables SAML authentication bypass when combined with ruby-saml. One-command fix: `bundle update nokogiri`.

2. **11 instances of disabled SSL verification** across 4 production files — all Typhoeus calls to OpenSymbols/Pixabay APIs with `ssl_verifypeer: false`. Exposes API tokens and user search queries to MITM attacks.

3. **213 npm vulnerabilities** (20 critical) — the majority stem from the Ember 3.28 toolchain and `ember-cli-update` being incorrectly listed in `dependencies`. Moving it to `devDependencies` and pinning lodash eliminates the most dangerous immediate risks.

The codebase is in **good shape** for SQL injection — Rails parameterized queries are used consistently. Only 2 medium-risk patterns found (non-user-facing code), plus 5 low/false-positive findings.

The Ember 5.x migration remains the single most impactful long-term fix, resolving approximately 180 of 213 npm vulnerabilities.
