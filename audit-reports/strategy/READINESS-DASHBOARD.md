# LingoLinq - Beta & Compliance Readiness

> **GENERATED - DO NOT HAND EDIT.**
> Generated from `audit-reports/strategy/*.json` + `audit-reports/FINDINGS.json` by `scripts/readiness-check.rb`.
> Edit the JSON sources and re-render; `--check` enforces sync in CI (audit-artifacts-integrity).
>
> Data as of: 2026-08-11T23:53:23Z | Strategy generated: 2026-08-11

> ⚠️ **PARTIALLY RATIFIED - 10 of 40 requirements ratified by Scot** (per-row
> `ratification` objects; milestone-by-milestone review). Every row without one remains a
> proposal. `meta.ratification.status` flips to `ratified` only when Scot has ratified all rows.

**Launch profile:** `adult-beta-initial`  
**Open Critical:** 0  
**Verified Critical closures:** 7  
**Overall posture:** 🟡 Moving toward controlled beta  
**Pending launch decisions:** aiWordPredictionEnabled; aiFocusWordsEnabled; aiBoardGenerationEnabled; euUsersIncluded; minorsIncluded; schoolManagedAccounts; mvpIncludesMinors

## Current finding baseline

| Metric | Count |
|---|---:|
| Total findings | 125 |
| Open | 62 |
| Open Critical | 0 |
| Open High | 8 |
| Open Medium | 29 |
| Open Low | 25 |
| Remediated, unverified | 5 |
| Accepted risk | 5 |
| Superseded | 2 |
| Verified closed | 51 |
| Verified-closed Critical | 7 |

## Milestones

| Milestone | Direct reqs | Ratified | Inherited blockers | Blocked | Decision needed | In progress | Awaiting verification | Awaiting reconciliation | Done |
|---|---:|---:|---|---:|---:|---:|---:|---:|---:|
| Controlled Adult / SLP / Teacher Beta | 10 | 10 | 0 | 2 | 4 | 3 | 0 | 0 | 0 |
| School / Minor Beta | 8 | 0 | 9 | 1 | 7 | 0 | 0 | 0 | 0 |
| Public MVP | 6 | 0 | 9 (+8 decision-dependent) | 1 | 1 | 3 | 0 | 0 | 0 |
| District Procurement Ready | 9 | 0 | 0 | 0 | 0 | 8 | 0 | 0 | 0 |
| Long-Term Assurance | 7 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 |

Direct requirement total: **40**

Inheritance (computed, never duplicated as rows): school-beta inherits applicable unresolved adult-beta
blockers; public-mvp inherits unresolved adult-beta and school-beta blockers (school-beta portion is
decision-dependent while `mvpIncludesMinors` is undecided).

### Top blockers - Controlled Adult / SLP / Teacher Beta

- 🔴 `adult-beta-terms-ordering` (Blocked) - Intro/onboarding cannot replace required Terms before the user has had the opportunity to review and agree. [LL-53cb93fab1]
- 🔴 `adult-beta-terms-scanning` (Blocked) - Required Terms/consent flow is reachable with switch scanning for the beta cohort. [LL-104bfa61dc]
- 🟡 `adult-beta-ai-cache` (Decision needed) - Raw communication is not retained in an unsafe pre-scrubber or process-global AI cache. [LL-16ef84ad9a]
  - gated by undecided decision(s): aiWordPredictionEnabled
  - underlying evidence state if enabled: done-awaiting-reconciliation (linked finding(s) still open: LL-16ef84ad9a)
- 🟡 `adult-beta-ai-disclosure` (Decision needed) - For users/interactions covered by an applicable direct-interaction AI disclosure obligation, the required disclosure is presented before the covered AI interaction. [LL-a9d6d5a46b]
  - gated by undecided decision(s): euUsersIncluded, aiWordPredictionEnabled, aiFocusWordsEnabled, aiBoardGenerationEnabled
- 🟡 `adult-beta-ai-focus-consent` (Decision needed) - Focus-word generation enforces user, organization, COPPA, EU-under-16, and applicable disclosure gates before a cache hit can return AI output.
  - gated by undecided decision(s): aiFocusWordsEnabled
  - underlying evidence state if enabled: done-awaiting-verification (code-and-runtime verification required; no evidence recorded in LAUNCH-PROFILE evidence)

### Top blockers - School / Minor Beta

- 🔴 `school-beta-accessible-consent` (Blocked) - Parent/student/Terms/consent flows are usable with the relevant AAC access methods for the cohort. [LL-104bfa61dc, LL-53cb93fab1]
- 🟡 `school-beta-child-ai-enforcement` (Decision needed) - COPPA/minor AI restrictions are enforced server-side and cannot be bypassed by direct API use or cached output.
  - gated by undecided decision(s): minorsIncluded, aiWordPredictionEnabled, aiFocusWordsEnabled, aiBoardGenerationEnabled
  - underlying evidence state if enabled: done-awaiting-verification (code-and-runtime verification required; no evidence recorded in LAUNCH-PROFILE evidence)
- 🟡 `school-beta-consent-expiry` (Decision needed) - Declined or expired parental consent leads to a safe, defined account/data outcome rather than indefinite ambiguous access.
  - gated by undecided decision(s): minorsIncluded
- 🟡 `school-beta-hard-delete-media` (Decision needed) - Hard deletion includes UserVideo and standalone/off-board voice recordings and other covered media. [LL-854b1d3853]
  - gated by undecided decision(s): minorsIncluded, schoolManagedAccounts
- 🟡 `school-beta-org-ai-control` (Decision needed) - A school/district organization can disable covered third-party AI processing for its users.
  - gated by undecided decision(s): schoolManagedAccounts, aiWordPredictionEnabled, aiFocusWordsEnabled, aiBoardGenerationEnabled
  - underlying evidence state if enabled: done-awaiting-verification (code-and-runtime verification required; no evidence recorded in LAUNCH-PROFILE evidence)

### Top blockers - Public MVP

- 🔴 `public-mvp-admin-credential` (Blocked) - Seed/test/admin credentials are rotated, removed, disabled, or converted to a governed break-glass posture before customer-facing use. [LL-caaf8e20ec]
- 🟡 `public-mvp-bedrock-account-proof` (Decision needed) - The serving Bedrock credential is demonstrably tied to the BAA-covered AWS account when Bedrock is enabled. [LL-1b0d78dbe6]
  - gated by undecided decision(s): aiWordPredictionEnabled, aiFocusWordsEnabled, aiBoardGenerationEnabled
  - underlying evidence state if enabled: done-awaiting-verification (code-and-runtime verification required; no evidence recorded in LAUNCH-PROFILE evidence)
- 🔴 `public-mvp-high-verification` (invariant) - 3 High remediated-unverified finding(s) awaiting verification: LL-705b10bcd7, LL-90045bb29c, LL-a95e9c5f7c
- 🟡 `public-mvp-incident-runbook` (In progress) - Incident/breach runbook matches current runtime/vendor architecture and is operationally usable.
- 🟡 `public-mvp-privacy-truth` (In progress) - Public privacy, AI, processor, retention, and data-flow disclosures match production behavior and current architecture.

### Top blockers - District Procurement Ready

- 🟡 `district-ready-accessibility` (In progress) - Core AAC paths have documented automated/manual accessibility testing, known limitations, and remediation status.
- 🟡 `district-ready-ai-governance` (In progress) - Districts can understand what AI is used, what data is sent, who processes it, what controls exist, what retention applies, and how AI can be disabled.
- 🟡 `district-ready-email-domain` (In progress) - Production email authentication and domain alignment are verified for the customer-facing mail path. [LL-abd6c88733]
- 🟡 `district-ready-incident-response` (In progress) - Customer-facing incident/breach summary, contacts, notification posture, and response process are current.
- 🟡 `district-ready-retention` (In progress) - Retention/deletion schedule is documented and the material lifecycle controls are operationally verified. [LL-1890f6a922, LL-14edf1a801, LL-caf2528468, LL-3bb2e2eaad]

## Invariants (computed this generation)

- ✅ `adult-beta-no-critical` - 0 open Critical finding(s)
- ❌ `public-mvp-high-verification` - 3 High remediated-unverified finding(s) awaiting verification: LL-705b10bcd7, LL-90045bb29c, LL-a95e9c5f7c

## Pending launch-profile decisions

| Decision | Current value | Requirements gated |
|---|---|---|
| aiWordPredictionEnabled | undecided | `adult-beta-ai-cache`, `adult-beta-ai-master-consent`, `adult-beta-ai-disclosure`, `school-beta-org-ai-control`, `school-beta-child-ai-enforcement`, `public-mvp-bedrock-account-proof` |
| aiFocusWordsEnabled | undecided | `adult-beta-ai-master-consent`, `adult-beta-ai-focus-consent`, `adult-beta-ai-disclosure`, `school-beta-org-ai-control`, `school-beta-child-ai-enforcement`, `public-mvp-bedrock-account-proof` |
| aiBoardGenerationEnabled | undecided | `adult-beta-ai-master-consent`, `adult-beta-ai-disclosure`, `school-beta-org-ai-control`, `school-beta-child-ai-enforcement`, `public-mvp-bedrock-account-proof` |
| euUsersIncluded | undecided | `adult-beta-ai-disclosure` |
| minorsIncluded | undecided | `school-beta-parent-consent`, `school-beta-seat-reclaim`, `school-beta-consent-expiry`, `school-beta-hard-delete-media`, `school-beta-child-ai-enforcement` |
| schoolManagedAccounts | undecided | `school-beta-seat-reclaim`, `school-beta-hard-delete-media`, `school-beta-org-ai-control`, `school-beta-school-authorization` |
| mvpIncludesMinors | undecided | - |

Undecided applicability renders **⚪ Decision needed**, never silently blocked or not-required.

## Risk movement

First snapshot recorded; no prior snapshot to diff against.
Run `ruby scripts/readiness-check.rb --snapshot` after register changes to build the movement series.

## Work delivered (seeded ledger - representative, not exhaustive)

| Metric | Count |
|---|---:|
| Ledger records | 16 |
| Distinct control/capability clusters | 13 |
| Preventive controls added | 5 |
| Findings moved out of open (latest snapshot) | 0 |
| Superseded-evidence records (claim later disproved; correction linked) | 1 |

Release duplicates and smoke PRs never inflate distinct-cluster counts; records sharing a cluster count once.
Superseded evidence preserved, never laundered: `WORK-2026-07-30-PR697` (Record Bedrock BAA operative conditions (logging OFF + creds in BAA'd account) - central credential claim later retracted) was corrected by `WORK-2026-08-04-PR725` (Retract the unverifiable Bedrock credential attestation and reconcile the corpus).

## Six readiness cards

### Security & Privacy - 🟡
**Strengths:** Infrastructure hardening; Dependency/security controls; Evidence governance; Deployment assertions  
**Gaps:** AI cache finding awaiting register reconciliation (fix merged in #788); Privileged-access residuals; Verification debt  
**Next:** Close/verify launch-relevant Highs and confirm beta configuration

### AI Trust - 🟡
**Strengths:** Bedrock routing; Model allowlists and endpoint controls; Org/user/child consent enforcement  
**Gaps:** Word-prediction cache reconciliation/verification (LL-16ef84ad9a fix merged, register row still open); Bedrock account-proof runtime verification; Final disclosure applicability/enablement  
**Next:** Resolve launch-profile decisions and verify runtime controls

### Accessibility - 🟡
**Strengths:** Major Ember/accessibility modernization; Accessible AI disclosure work  
**Gaps:** Terms switch scanning; Terms ordering; Launch-relevant core AAC accessibility Mediums  
**Next:** Cohort-specific switch/eye-gaze/keyboard/screen-reader verification

### Student Data Lifecycle - 🟠
**Strengths:** Parent-consent and offboarding architecture exists  
**Gaps:** Seat-reclaim/re-consent cluster; Hard-delete media completeness  
**Next:** Verify the #737/#721 class of lifecycle fixes before school/minor beta

### District Trust Pack - 🟠
**Strengths:** Compliance document program with attestation and register governance exists  
**Gaps:** Internal/external Drive overview copies marked SUPERSEDED 2026-08-11; cleanup drafts pending re-attestation; Publication/index freshness; Trust-pack coherence  
**Next:** Re-attest the 2026-08-11 cleanup drafts, then regenerate the trust pack from canonical current sources

### Evidence of Value - 🟠
**Strengths:** Technical beta readiness improving  
**Gaps:** Structured AAC-user/SLP/teacher outcomes still immature  
**Next:** Collect beta usability and outcome evidence deliberately

## Workstreams

No developer ranking or leaderboard; owners listed for accountability only.

| Workstream | Accountable humans | Clusters advanced |
|---|---|---|
| ai-trust | Melissa O, Scot Wahlquist | `ai-consent-enforcement`, `art50-disclosure`, `bedrock-baa-routing`, `org-ai-control` |
| audit-governance | Scot Wahlquist | `attestation-integrity`, `capability-ledger` |
| children-school | Melissa O, Scot Wahlquist | `coppa-offboarding`, `jurisdiction-age-gating`, `telemetry-coppa-failclose` |
| data-lifecycle | Melissa O | `hard-delete-completeness` |
| privacy-security | Scot Wahlquist | `masquerade-accountability` |
| supply-chain | Melissa O, Scot Wahlquist | `ci-eslint-baseline`, `ci-security-scan-blocking` |

AI tools are implementation/review tools, never accountable owners.

## Source freshness

Ages are relative to the data-as-of reference date (2026-08-11); external sources are
last-observed historical fixtures in v0.2 (no live Notion/Drive connectors; live checks are never faked).

| Source | State | Detail |
|---|---|---|
| Canonical Git findings (audit-reports/FINDINGS.json) | 🟢 | last observed 2026-08-11 (0d before reference date). Source of truth; read live at every render. |
| Git strategy inputs (audit-reports/strategy/) | 🟢 | last observed 2026-08-11 (0d before reference date). This layer; requirement matrix PROPOSED, not yet ratified. |
| Notion findings data source | 🟢 | last observed 2026-08-11 (0d before reference date). Matches canonical status buckets: 125 total / 62 open / 8 High / 29 Medium / 25 Low / 51 verified-closed. |
| Notion Compliance Home | 🔴 | numeric contradiction with canonical state (overrides age). Still shows 118 total / 54 open / 7 awaiting QA / 50 verified closed - a numeric contradiction with the canonical register; contradiction overrides freshness age. |
| Drive internal Compliance & Security Program | 🔴 | canonical copy marked SUPERSEDED; successor still draft (overrides age). The 2026-08-04 attested copy is now renamed SUPERSEDED; a 2026-08-11 cleanup draft exists (DRAFT - DO NOT SHARE). No current attested copy. |
| Drive external Security, Privacy & Compliance Overview | 🔴 | canonical copy marked SUPERSEDED; successor still draft (overrides age). The 2026-08-04 attested / 2026-08-06 published copy is now renamed SUPERSEDED / DO NOT SHARE; a 2026-08-11 cleanup draft exists. No current attested copy. |
| Drive Compliance Publication Status index | 🔴 | last observed 2026-07-23 (19d before reference date). Last known generated 2026-07-23; stale relative to subsequent attestations. |
| Production revision/config evidence | 🟡 | no explicit observation recorded; never inferred. Must be explicitly captured per observation; never inferred. No observation recorded yet. |

---
Generated output must not be hand-edited.
