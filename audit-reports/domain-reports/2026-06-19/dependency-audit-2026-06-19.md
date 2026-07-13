# LingoLinq-AAC Dependency Freshness & CVEs Audit

**Run date:** 2026-06-19  |  **Finder:** `dependency-auditor`  |  **Audited commit:** `445336592dda` (`scot/security/audit-erasure-admin-reads`)

**Open findings in this domain:** 11  (0 CRITICAL · 1 HIGH · 4 MEDIUM · 6 LOW)

> DRAFT view of the findings register (`audit-reports/FINDINGS.json`), the single source of truth. Statuses are verified against live code at the audited commit. Only Scot closes a finding, downgrades severity, or accepts risk. Evidence is code/path only; no student or patient data appears here.

## HIGH (1)

### bootstrap 3.4.1 (EOL/abandoned) bundled into shipped app; reachable Tooltip/Popover & data-* XSS

- **ID:** `LL-d1ea8659c3`  |  **ruleKey:** `outdated-bootstrap-3`  |  **confidence:** high
- **Location:** `app/frontend/package.json`:31
- **Frameworks:** —
- **First seen:** 2026-06-14  |  **Last seen:** 2026-06-14  |  **Disposition:** fixed
- **Remediation:** Bootstrap 3.x is EOL since 2019 with no security patches; GHSA XSS advisories (Tooltip/Popover sanitizer bypass, data-* injection) have no 3.x backport. The app ships bootstrap.min.js (ember-cli-build.js:109) and calls .tooltip()/.popover() (app-state, utterance, stats components), so the vector is reachable. INDEPENDENT of the pinned Ember 3.28 -> 5.x migration. Options: (1) migrate to Bootstrap 5.x behind a feature flag (AAC UI-disruptive); (2) if deferred, ensure no untrusted HTML reaches title/data-content of tooltip/popover call sites and audit those sites; (3) Scot accepts risk with call sites confirmed to use only app-controlled sanitized strings.

## MEDIUM (4)

### moment 2.29.4 is in maintenance-only mode (effectively abandoned) and locked below the latest 2.30 maintenance patch

- **ID:** `LL-65700d9bd8`  |  **ruleKey:** `abandoned-moment-js`  |  **confidence:** high
- **Location:** `app/frontend/package.json`:71
- **Frameworks:** —
- **First seen:** 2026-06-16  |  **Last seen:** 2026-06-16  |  **Disposition:** untriaged
- **Adversary:** confirmed. moment 2.29.4, maintenance-only per official project status. dev-only dep (not in Rails backend).
- **Remediation:** moment.js has been in maintenance-only mode since September 2020 with no new features; the team recommends migration to date-fns, Luxon, or Day.js. No security patches are planned; the known ReDoS in moment locale parsing has no fix in 2.x. If locale/format parsing is not in a hot path, accept-risk + add a migration note; otherwise begin migration to date-fns or Luxon (compatible with Ember 3.28).

### lodash 4.18.1 resolved in package-lock.json exceeds all known published 4.x releases (latest 4.17.21)

- **ID:** `LL-6614b7c85a`  |  **ruleKey:** `outdated-lodash-lockfile-drift`  |  **confidence:** medium
- **Location:** `app/frontend/package-lock.json`:22142
- **Frameworks:** —
- **First seen:** 2026-06-18  |  **Last seen:** 2026-06-18  |  **Disposition:** untriaged
- **Remediation:** Verify lodash@4.18.1 exists on the public npm registry (run `npm view lodash versions`). The lockfile resolves a real integrity hash + resolved URL for 4.18.1, but that version exceeds the highest known-published 4.x (4.17.21). If 4.18.1 is not on the public registry, delete and regenerate package-lock.json to lock at 4.17.21. lodash-es is also resolved to 4.18.1 (line 22149). No known CVEs in 4.18.x.

### ruby-saml has no minimum version constraint in Gemfile; SAML auth-bypass CVEs fixed in >= 1.17.0

- **ID:** `LL-6f1977944f`  |  **ruleKey:** `ruby-saml-no-explicit-floor`  |  **confidence:** high
- **Location:** `Gemfile.lock`:490
- **Frameworks:** FERPA, HIPAA
- **First seen:** 2026-06-18  |  **Last seen:** 2026-06-18  |  **Disposition:** untriaged
- **Remediation:** Locked 1.18.1 is >= 1.17.0 so CVE-2025-25291 and CVE-2025-25292 (XML signature-wrapping auth bypass) are covered. But Gemfile line 84 is `gem 'ruby-saml'` with no constraint, so a future `bundle update ruby-saml` could resolve a breaking 2.x or compromised version without alert. Add an explicit `>= 1.17.0` security floor. SAML is used for school-district SSO (FERPA scope).

### braces 2.3.2 in npm tree is vulnerable to CVE-2024-4068 (ReDoS)

- **ID:** `LL-a46e5c6b69`  |  **ruleKey:** `cve-braces-2024-4068`  |  **confidence:** high
- **Location:** `app/frontend/package-lock.json`:8315
- **Frameworks:** —
- **First seen:** 2026-06-16  |  **Last seen:** 2026-06-16  |  **Disposition:** untriaged
- **Adversary:** confirmed. Root node_modules/braces resolves 2.3.2 (package-lock.json:8316); fixed >=3.0.3. Seven other nested copies already 3.0.3. dev-only dep, no package.json override masks it.
- **Remediation:** braces >= 3.0.3 fixes CVE-2024-4068. braces 2.3.2 is a transitive dep of legacy ember-cli toolchain (micromatch 3.x -> braces 2.x). The override block in package.json can be extended to force braces >= 3.0.3 independently. Risk is build-time dev toolchain only (no production server process runs braces); ReDoS requires attacker-controlled glob patterns reaching the build.

## LOW (6)

### eslint 5.16.0 is EOL (v5 end-of-life 2019); dev toolchain running unsupported linter

- **ID:** `LL-257c696fe0`  |  **ruleKey:** `eol-eslint-5x`  |  **confidence:** high
- **Location:** `app/frontend/package-lock.json`:18085
- **Frameworks:** —
- **First seen:** 2026-06-16  |  **Last seen:** 2026-06-16  |  **Disposition:** untriaged
- **Adversary:** confirmed. eslint 5.16.0 (package-lock.json:18086), long EOL. dev-tooling only, no runtime exposure.
- **Remediation:** eslint v5 has been EOL since 2019; latest stable is v9.x. Upgrading eslint within Ember 3.28 is constrained by ember-cli-eslint ^5.1.0 which requires eslint 5.x. eslint upgrade is effectively blocked on Ember 3.28 -> Ember 5 migration. Mitigation: run npm audit in CI and treat any eslint advisory as high-priority.

### Puma Gemfile constraint permits 7.2.0 which predates the CVE-2026-47736/47737 fix; floor unset

- **ID:** `LL-2695434541`  |  **ruleKey:** `puma-constraint-allows-pre-patch`  |  **confidence:** high
- **Location:** `Gemfile`:62
- **Frameworks:** —
- **First seen:** 2026-06-18  |  **Last seen:** 2026-06-18  |  **Disposition:** untriaged
- **Remediation:** Tighten `gem 'puma', '~> 7.2'` to also require `'>= 7.2.1'` so `bundle update puma` cannot resolve back to 7.2.0. Gemfile.lock already pins 7.2.1 (line 349), so there is no current exposure; this is defense-in-depth against future re-resolution undoing the CVE fix.

### serialize-javascript 4.0.0 vulnerable to CVE-2024-11831 (XSS); dev toolchain only

- **ID:** `LL-53ab4ea456`  |  **ruleKey:** `cve-serialize-javascript-2024-11831`  |  **confidence:** high
- **Location:** `app/frontend/package-lock.json`:26437
- **Frameworks:** —
- **First seen:** 2026-06-19  |  **Last seen:** 2026-06-19  |  **Disposition:** untriaged
- **Adversary:** confirmed substance (serialize-javascript@4.0.0 dev-only, fix >=6.0.2, LOW) but CORRECTED two citation errors: GHSA-76p7-773f-r4q5 is the debug-package ReDoS (CVE-2017-16137), NOT serialize-javascript; correct advisory is GHSA-76p7-773f-r4q5 and the vuln class is XSS, not ReDoS.
- **Remediation:** Upgrade serialize-javascript to >= 6.0.2 (fixes CVE-2024-11831 / GHSA-76p7-773f-r4q5 XSS). It is a transitive dev dep of the ember-cli/terser toolchain; add an `overrides` entry in package.json: serialize-javascript >= 6.0.2. Dev-only: not bundled to browsers, no production server exposure. Note the lockfile version (4.0.0) already matched the caret-4 range; the override must force the major bump.

### davidshimjs-qrcodejs 0.0.2 is abandoned (no release since 2014, >10 years)

- **ID:** `LL-553fdc242b`  |  **ruleKey:** `abandoned-davidshimjs-qrcodejs`  |  **confidence:** high
- **Location:** `app/frontend/package.json`:36
- **Frameworks:** —
- **First seen:** 2026-06-16  |  **Last seen:** 2026-06-16  |  **Disposition:** untriaged
- **Adversary:** confirmed abandoned (single 0.0.2 release, stale upstream). Drop the unverifiable exact "since 2014" date. dev-only in lockfile; sanity-check actual runtime QR usage.
- **Remediation:** Replace davidshimjs/qrcodejs (last commit 2014) with an actively maintained QR code library such as qrcode (npm: qrcode, actively maintained, MIT, Node 20 compatible). Audit which components call it before swapping (grep for qrcode or QRCode in the frontend app/).

### ember-cli-mirage 2.4.0 is abandoned for Ember 3.x (no active maintenance, last meaningful release 2021)

- **ID:** `LL-a25d930f21`  |  **ruleKey:** `abandoned-ember-cli-mirage-2x`  |  **confidence:** medium
- **Location:** `app/frontend/package-lock.json`:12501
- **Frameworks:** —
- **First seen:** 2026-06-16  |  **Last seen:** 2026-06-16  |  **Disposition:** untriaged
- **Adversary:** confirmed stale (2.4.0; current 3.0.4, two majors behind). Recommend rewording "abandoned" -> "two majors behind/superseded" (project continued via miragejs). dev/test-only.
- **Remediation:** ember-cli-mirage 2.x targets Ember 3.x but has seen no active security or maintenance releases since ~2021. It is used in test environments only (no production bundle inclusion). Consider migrating to MSW (Mock Service Worker) or Pretender directly when the Ember 5 migration lands.

### http-proxy 1.18.1 (EOL, last release 2021) has CVE-2024-21943 (ReDoS via Host header); dev-only

- **ID:** `LL-e066ea6fa3`  |  **ruleKey:** `http-proxy-1.18.1-eol-cve-2024-21943`  |  **confidence:** medium
- **Location:** `app/frontend/package.json`:64
- **Frameworks:** —
- **First seen:** 2026-06-18  |  **Last seen:** 2026-06-18  |  **Disposition:** untriaged
- **Remediation:** http-proxy 1.x is EOL with no upstream fix for CVE-2024-21943 (ReDoS via crafted Host header). It is a devDependency for the Ember local dev proxy only, not bundled to production. Options: (1) accept-risk with a dated note (impact limited to developer machine); (2) migrate the dev proxy to http-proxy-middleware 3.x when the Ember 5 migration lands.


---
_Generated from the register at `445336592ddaf838689df7e578829e94e140890d`. Regenerate with `ruby scripts/render-domain-reports.rb`. Do not edit by hand._
