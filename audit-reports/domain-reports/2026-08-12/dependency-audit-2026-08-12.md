# LingoLinq-AAC Dependency Freshness & CVEs Audit

**Run date:** 2026-08-12  |  **Finder:** `dependency-auditor`  |  **Audited commit:** `d67ed76e0a16` (`scot/feat/code-hygiene-auditor`)

**Open findings in this domain:** 7  (0 CRITICAL · 0 HIGH · 3 MEDIUM · 4 LOW)

> DRAFT view of the findings register (`audit-reports/FINDINGS.json`), the single source of truth. Statuses are verified against live code at the audited commit. Only Scot closes a finding, downgrades severity, or accepts risk. Evidence is code/path only; no student or patient data appears here.

## MEDIUM (3)

### bootstrap 3.4.1 (EOL, no upstream patches) remains a production dependency; supply-chain exposure beyond the already-fixed XSS

- **ID:** `LL-1bb85a2ef5`  |  **ruleKey:** `abandoned-bootstrap-3x-residual`  |  **confidence:** high
- **Location:** `app/frontend/package.json`:36
- **Frameworks:** —
- **First seen:** 2026-07-08  |  **Last seen:** 2026-07-08  |  **Disposition:** untriaged
- **Adversary:** confirmed -- bootstrap ^3.4.1 unconditionally bundled (ember-cli-build.js:40 CSS, :52 JS); actively loaded (caseload.js:417 dropdown plugin, raw_events.js:515, pervasive app.scss classes); 3.4.1 is terminal 3.x (2019-02-13), no upstream patches. Materially distinct from closed XSS LL-d1ea8659c3 (one patched CVE vs standing EOL posture), not a duplicate.
- **Remediation:** Plan migration off Bootstrap 3.x (EOL 2019) to a supported major or a maintained fork; interim, vendor-pin and document the accepted EOL risk. The reachable-XSS vector was already fixed (LL-d1ea8659c3 verified-closed) but the broader no-more-upstream-patches exposure is unfiled.

### moment 2.29.4 is in maintenance-only mode (effectively abandoned) and locked below the latest 2.30 maintenance patch

- **ID:** `LL-65700d9bd8`  |  **ruleKey:** `abandoned-moment-js`  |  **confidence:** high
- **Location:** `app/frontend/package.json`:71
- **Frameworks:** SOC2
- **First seen:** 2026-06-16  |  **Last seen:** 2026-06-16  |  **Disposition:** accepted
- **Adversary:** confirmed. moment 2.29.4, maintenance-only per official project status. dev-only dep (not in Rails backend).
- **Remediation:** moment.js has been in maintenance-only mode since September 2020 with no new features; the team recommends migration to date-fns, Luxon, or Day.js. No security patches are planned; the known ReDoS in moment locale parsing has no fix in 2.x. If locale/format parsing is not in a hot path, accept-risk + add a migration note; otherwise begin migration to date-fns or Luxon (compatible with Ember 3.28).

### lodash 4.18.1 resolved in package-lock.json exceeds all known published 4.x releases (latest 4.17.21)

- **ID:** `LL-6614b7c85a`  |  **ruleKey:** `outdated-lodash-lockfile-drift`  |  **confidence:** medium
- **Location:** `app/frontend/package-lock.json`:22142
- **Frameworks:** SOC2
- **First seen:** 2026-06-18  |  **Last seen:** 2026-06-18  |  **Disposition:** dismissed-false-positive
- **Remediation:** Verify lodash@4.18.1 exists on the public npm registry (run `npm view lodash versions`). The lockfile resolves a real integrity hash + resolved URL for 4.18.1, but that version exceeds the highest known-published 4.x (4.17.21). If 4.18.1 is not on the public registry, delete and regenerate package-lock.json to lock at 4.17.21. lodash-es is also resolved to 4.18.1 (line 22149). No known CVEs in 4.18.x.

## LOW (4)

### davidshimjs-qrcodejs 0.0.2 is abandoned (no release since 2014, >10 years)

- **ID:** `LL-553fdc242b`  |  **ruleKey:** `abandoned-davidshimjs-qrcodejs`  |  **confidence:** high
- **Location:** `app/frontend/package.json`:36
- **Frameworks:** SOC2
- **First seen:** 2026-06-16  |  **Last seen:** 2026-06-16  |  **Disposition:** accepted
- **Adversary:** confirmed abandoned (single 0.0.2 release, stale upstream). Drop the unverifiable exact "since 2014" date. dev-only in lockfile; sanity-check actual runtime QR usage.
- **Remediation:** Replace davidshimjs/qrcodejs (last commit 2014) with an actively maintained QR code library such as qrcode (npm: qrcode, actively maintained, MIT, Node 20 compatible). Audit which components call it before swapping (grep for qrcode or QRCode in the frontend app/).

### indexeddbshim is pinned to a stale major (^6.1.0, ~10 majors behind latest 16.1.0) in the production bundle

- **ID:** `LL-5e7676187f`  |  **ruleKey:** `abandoned-indexeddbshim-shipped`  |  **confidence:** high
- **Location:** `app/frontend/package.json`:70
- **Frameworks:** —
- **First seen:** 2026-07-08  |  **Last seen:** 2026-07-08  |  **Disposition:** untriaged
- **Remediation:** Bump indexeddbshim from ^6.1.0 to the current major (16.x, published 2025-09-01) and re-test the offline path. The package is actively maintained, so this is a routine dependency upgrade, not a vendor-and-freeze. Bundled to production via ember-cli-build.js:44; the shim is inert on modern browsers (capabilities.js gates __useShim on navigator.standalone AND WebSQL present), so blast radius is limited to legacy standalone-mode webviews.

### jquery-minicolors ^2.1.10 (devDependency) appears unmaintained (no upstream release in years, jQuery-plugin era)

- **ID:** `LL-63377adbd2`  |  **ruleKey:** `abandoned-jquery-minicolors`  |  **confidence:** medium
- **Location:** `app/frontend/package.json`:85
- **Frameworks:** —
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- Live npm registry check: jquery-minicolors has exactly one published version (2.1.10, 2015-09-01); the author's maintained fork @claviska/jquery-minicolors stopped at 2.3.6 in 2021-11. No OSV advisories. Bonus: this ships into the production browser bundle via ember-cli-build.js app.import, used in board-editing UI -- not merely a devDependency in effect.
- **Remediation:** No CVE is known against jquery-minicolors, so this is not urgent. When touching the color-picker UI it depends on, evaluate a maintained, framework-agnostic (non-jQuery) color-picker replacement rather than re-pinning the same abandoned plugin; independent of the app's own jQuery-removal effort (already underway per config/optional-features.json disabling jquery-integration) and independent of the Ember 5.12 / Node 22 pins.

### http-proxy 1.18.1 (EOL, last release 2021) has CVE-2024-21943 (ReDoS via Host header); dev-only

- **ID:** `LL-e066ea6fa3`  |  **ruleKey:** `http-proxy-1.18.1-eol-cve-2024-21943`  |  **confidence:** medium
- **Location:** `app/frontend/package.json`:64
- **Frameworks:** SOC2
- **First seen:** 2026-06-18  |  **Last seen:** 2026-06-18  |  **Disposition:** accepted
- **Remediation:** http-proxy 1.x is EOL with no upstream fix for CVE-2024-21943 (ReDoS via crafted Host header). It is a devDependency for the Ember local dev proxy only, not bundled to production. Options: (1) accept-risk with a dated note (impact limited to developer machine); (2) migrate the dev proxy to http-proxy-middleware 3.x when the Ember 5 migration lands.


---
_Generated from the register at `d67ed76e0a161b594fbffa519ab428d0f9b7780b`. Regenerate with `ruby scripts/render-domain-reports.rb`. Do not edit by hand._
