# LingoLinq - Beta & Compliance Readiness

> **GENERATED - DO NOT HAND EDIT.**
> Generated from `audit-reports/strategy/*.json` + `audit-reports/FINDINGS.json` by `scripts/readiness-check.rb`.
> Edit the JSON sources and re-render; `--check` enforces sync in CI (audit-artifacts-integrity).
>
> Findings baseline: live from `FINDINGS.json` at render | Risk movement since snapshot: 2026-08-19T05:09:07Z | Strategy generated: 2026-08-11

> ✅ **RATIFIED - all 40 of 40 requirements ratified by Scot** on
> 2026-08-15 (per-row `ratification` objects, completed milestone-by-milestone). This records
> Scot's explicit governance approval, not a GitHub-authenticated one: staging branch protection requires
> no approving reviews and no code-owner review, so CODEOWNERS routing on this path is a convention, not an
> enforced approval boundary. Ratifying the requirement matrix does not decide any pending launch-profile
> decision below - those remain a separate governance action.

**Launch profile:** `adult-beta-initial`  
**Open Critical:** 0  
**Verified Critical closures:** 7  
**Unmapped Critical/High:** 8 🔴 (see governance exception section below)<br>
**Overall posture:** 🟡 Moving toward controlled beta  
**Pending launch decisions:** none

## Operational launch controls

**Controlled Adult / SLP / Teacher beta - minimum admission/participation control** - 🟡 **operational-process, not a technical gate.**

This is a documented OPERATIONAL control (who Scot/the team actually invites, onboards, and permits to do what), not a technically enforced one. See decisionRationale.notes.enforcementVerification: api/users_controller.rb#create has no age/DOB gate, no school-domain restriction, and no invite-code requirement, and no geofencing exists anywhere in app/ or lib/. No DOB collection, geofencing, or new signup architecture has been added or is planned as part of this control - only if operational evidence later shows this process is insufficient (e.g. an actual out-of-scope admission occurs) would a technical backstop become worth considering.

- Participants are individually approved adults.
- Adult SLPs/teachers employed by school districts are allowed to participate.
- Participation is in an individual professional beta-testing capacity, on the participant's own account - not a district-managed deployment.
- No real student/minor accounts.
- No identifiable student data entered as part of the beta.
- No district-provisioned/managed end-user accounts.
- No inviting students into the beta.
- No EU participants in the approved cohort.
- Any request crossing these boundaries is escalated to Scot before proceeding, not resolved unilaterally.

Decided by Scot Wahlquist on 2026-08-16 (PR #792 draft-review instruction (Codex-relayed operational-control pass, following the ratified 40/40 matrix and the launch-profile decisions)).

## ⚠️ Unmapped Critical/High findings (governance exception)

8 open Critical/High finding(s) are linked to **no** requirement and therefore drive
**no** milestone card, blocker list, or inherited-blocker count above or below. Each remains open in
the canonical register with reconciliation owed, regardless of any engineering work already merged
against it, until it is either linked to an applicable requirement or Scot explicitly assesses it as
not launch-relevant (a governance decision this layer never makes on its own).

| Finding | Severity | Disposition | Title |
|---|---|---|---|
| `LL-0b5443f43b` | high | untriaged | Production Cloud Run service is deployed with public ingress, so the direct run.app URL bypasses the |
| `LL-1e7b568ef3` | high | untriaged | Committed WIF provisioning script omits the assertion.ref branch lock the deploy pipeline names as a |
| `LL-5617f4e17d` | high | untriaged | No server-side password strength policy exists; the only minimum-length check is a 6-character Ember |
| `LL-7d50b089c9` | high | untriaged | BoardVersion/UserVersion history payloads use raw PaperTrail `version.id` instead of the repo's `glo |
| `LL-8908c7ac6f` | high | untriaged | Client-supplied context.topic reaches Bedrock unscrubbed and is absent from the AiApiLog egress reco |
| `LL-b7ccc522b9` | high | untriaged | GCP production project has no Data Access audit log configuration, so Secret Manager value reads and |
| `LL-c0b3d59f58` | high | untriaged | Production GCP project grants a non-owner human principal project-wide secretmanager.admin, cloudsql |
| `LL-e8614c103f` | high | untriaged | PredictionEntry rows survive account deletion, retaining per-user AAC vocabulary sequences indefinit |

## Current finding baseline

| Metric | Count |
|---|---:|
| Total findings | 170 |
| Open | 105 |
| Open Critical | 0 |
| Open High | 15 |
| Open Medium | 50 |
| Open Low | 40 |
| Remediated, unverified | 6 |
| Accepted risk | 5 |
| Superseded | 2 |
| Verified closed | 52 |
| Verified-closed Critical | 7 |

### Open findings not linked to any requirement (informational)

92 of 105 open findings are linked to no requirement row (0 critical / 8 high / 45 medium / 39 low).
The milestone cards are a readiness lens, never a complete risk inventory - `FINDINGS.md` remains the
full register. Critical/High items in this count are the same ones called out as a governance
exception above; Medium/Low items are informational only and **never** automatically become a
milestone blocker - blocking status is a property of a linked, ratified requirement, not of a
finding's severity by itself.

## Milestones

| Milestone | Direct reqs | Ratified | Inherited blockers | Blocked | Decision needed | In progress | Awaiting verification | Awaiting reconciliation | Done | Other |
|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---|
| Controlled Adult / SLP / Teacher Beta | 10 | 10 | 0 | 2 | 0 | 3 | 2 | 1 | 0 | 1 not-required; 1 invariant-holding |
| School / Minor Beta | 8 | 8 | 8 | 1 | 0 | 0 | 0 | 0 | 0 | 7 not-required |
| Public MVP | 6 | 6 | 8 | 1 | 0 | 3 | 1 | 0 | 0 | 1 invariant-failing |
| District Procurement Ready | 9 | 9 | 0 | 0 | 0 | 9 | 0 | 0 | 0 | 0 |
| Long-Term Assurance | 7 | 7 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 5 future |

Direct requirement total: **40**

Inheritance (computed, never duplicated as rows): school-beta inherits applicable unresolved adult-beta
blockers; public-mvp inherits unresolved adult-beta and school-beta blockers (school-beta portion is
excluded, since `mvpIncludesMinors` is decided false).

### Top blockers - Controlled Adult / SLP / Teacher Beta

- 🔴 `adult-beta-terms-ordering` (Blocked) - Intro/onboarding cannot replace required Terms before the user has had the opportunity to review and agree. [LL-53cb93fab1]
- 🔴 `adult-beta-terms-scanning` (Blocked) - Required Terms/consent flow is reachable with switch scanning for the beta cohort. [LL-104bfa61dc]
- 🟡 `adult-beta-ai-cache` (Done, awaiting reconciliation) - Raw communication is not retained in an unsafe pre-scrubber or process-global AI cache. [LL-16ef84ad9a]
  - linked finding(s) still open: LL-16ef84ad9a
- 🟡 `adult-beta-ai-focus-consent` (Done, awaiting verification) - Focus-word generation enforces user, organization, COPPA, EU-under-16, and applicable disclosure gates before a cache hit can return AI output.
  - code-and-runtime verification required; code/test evidence recorded, but no distinguishable deployed-runtime evidence yet
- 🟡 `adult-beta-ai-master-consent` (Done, awaiting verification) - Unreadable or invalid AI master preference fails closed.
  - code-and-runtime verification required; code/test evidence recorded, but no distinguishable deployed-runtime evidence yet

### Top blockers - School / Minor Beta

- 🔴 `school-beta-accessible-consent` (Blocked) - Parent/student/Terms/consent flows are usable with the relevant AAC access methods for the cohort. [LL-104bfa61dc, LL-53cb93fab1]

### Top blockers - Public MVP

- 🔴 `public-mvp-admin-credential` (Blocked) - Seed/test/admin credentials are rotated, removed, disabled, or converted to a governed break-glass posture before customer-facing use. [LL-caaf8e20ec]
- 🟡 `public-mvp-bedrock-account-proof` (Done, awaiting verification) - The serving Bedrock credential is demonstrably tied to the BAA-covered AWS account when Bedrock is enabled. [LL-1b0d78dbe6]
  - code-and-runtime verification required; no evidence recorded in LAUNCH-PROFILE evidence
- 🔴 `public-mvp-high-verification` (invariant) - 4 High remediated-unverified finding(s) awaiting verification: LL-6af580a23a, LL-705b10bcd7, LL-90045bb29c, LL-a95e9c5f7c
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
- ❌ `public-mvp-high-verification` - 4 High remediated-unverified finding(s) awaiting verification: LL-6af580a23a, LL-705b10bcd7, LL-90045bb29c, LL-a95e9c5f7c

## Pending launch-profile decisions

None - all launch-profile decisions are made.

## Risk movement

| Signal | Since prior snapshot |
|---|---|
| New known risks | 41 (LL-0b5443f43b, LL-0d54bcb32c, LL-171938b2b9, LL-1e7b568ef3, LL-1e8abb7d59, LL-208e8f1317, LL-30236919f6, LL-33d756b764, LL-40f3571b19, LL-4574005612, LL-47935e1a5b, LL-5617f4e17d, LL-59bfd6f482, LL-5d2436fce2, LL-63377adbd2, LL-6723438462, LL-69a7f62551, LL-6cea3b4787, LL-7181a16033, LL-71f2ba5536, LL-7296ada5da, LL-779490b63e, LL-7d50b089c9, LL-8908c7ac6f, LL-8990c53bad, LL-8bc8f025a7, LL-92ae18cc4e, LL-959d76ecfc, LL-b7ccc522b9, LL-c0b3d59f58, LL-c4566fa37f, LL-c95c637f00, LL-d3f41e7a67, LL-dbdcfb466c, LL-e0ea356243, LL-e14ca0ff04, LL-e8614c103f, LL-ebb4be7b73, LL-f171af92ff, LL-f6be45aec6, LL-fba16b6fd7) |
| Findings moved out of open | 1 (LL-522c1a6d13) |
| Reopened | 0 |
| Severity changes | 0 |
| Net open movement (supporting metric only) | 62 -> 102 |

A rising known-risk count is not automatically negative; it may reflect improved discovery coverage.

## Work delivered (seeded ledger - representative, not exhaustive)

| Metric | Count |
|---|---:|
| Ledger records | 16 |
| Distinct control/capability clusters | 13 |
| Preventive controls added | 5 |
| Findings moved out of open (latest snapshot) | 1 |
| Superseded-evidence records (claim later disproved; correction linked) | 1 |

Release duplicates and smoke PRs never inflate distinct-cluster counts; records sharing a cluster count once.
Superseded evidence preserved, never laundered: `WORK-2026-07-30-PR697` (Record Bedrock BAA operative conditions (logging OFF + creds in BAA'd account) - central credential claim later retracted) was corrected by `WORK-2026-08-04-PR725` (Retract the unverifiable Bedrock credential attestation and reconcile the corpus).

## Six readiness cards (curated)

These cards are hand-authored judgment maintained in `READINESS-MILESTONES.json` - their traffic
lights are NOT computed from the data above. For computed state, read the milestone table and
invariants sections; where they disagree, the computed sections govern.

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

Ages are relative to the data-as-of reference date (2026-08-19); external sources are
last-observed historical fixtures in v0.2 (no live Notion/Drive connectors; live checks are never faked).

| Source | State | Detail |
|---|---|---|
| Canonical Git findings (audit-reports/FINDINGS.json) | 🟢 | read live from the repository at every render. Source of truth; read live at every render. |
| Git strategy inputs (audit-reports/strategy/) | 🟢 | read live from the repository at every render. This layer; requirement matrix PROPOSED, not yet ratified. |
| Notion findings data source | 🔴 | numeric contradiction with canonical state (overrides age). Historical snapshot from 2026-08-11 claimed 125 total / 62 open / 8 High / 29 Medium / 25 Low / 51 verified-closed; canonical register has since moved to 167 total / 102 open / 15 High - numeric contradiction with canonical register; contradiction overrides freshness age. Needs re-observation before this source can be trusted again. |
| Notion Compliance Home | 🔴 | numeric contradiction with canonical state (overrides age). Still shows 118 total / 54 open / 7 awaiting QA / 50 verified closed - a numeric contradiction with the canonical register; contradiction overrides freshness age. |
| Drive internal Compliance & Security Program | 🔴 | canonical copy marked SUPERSEDED; successor still draft (overrides age). The 2026-08-04 attested copy is now renamed SUPERSEDED; a 2026-08-11 cleanup draft exists (DRAFT - DO NOT SHARE). No current attested copy. |
| Drive external Security, Privacy & Compliance Overview | 🔴 | canonical copy marked SUPERSEDED; successor still draft (overrides age). The 2026-08-04 attested / 2026-08-06 published copy is now renamed SUPERSEDED / DO NOT SHARE; a 2026-08-11 cleanup draft exists. No current attested copy. |
| Drive Compliance Publication Status index | 🔴 | last observed 2026-07-23 (27d before reference date). Last known generated 2026-07-23; stale relative to subsequent attestations. |
| Production revision/config evidence | 🟡 | no explicit observation recorded; never inferred. Must be explicitly captured per observation; never inferred. No observation recorded yet. |

---
Generated output must not be hand-edited.
