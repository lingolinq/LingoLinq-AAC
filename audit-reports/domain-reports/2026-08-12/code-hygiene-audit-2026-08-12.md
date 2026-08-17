# LingoLinq-AAC Dead Code & AI-Slop Audit

**Run date:** 2026-08-12  |  **Finder:** `code-hygiene-auditor`  |  **Audited commit:** `d67ed76e0a16` (`scot/feat/code-hygiene-auditor`)

**Open findings in this domain:** 7  (0 CRITICAL · 0 HIGH · 3 MEDIUM · 4 LOW)

> DRAFT view of the findings register (`audit-reports/FINDINGS.json`), the single source of truth. Statuses are verified against live code at the audited commit. Only Scot closes a finding, downgrades severity, or accepts risk. Evidence is code/path only; no student or patient data appears here.

## MEDIUM (3)

### lib/purchasing2.rb is a 206-line orphaned, apparently unfinished Stripe module with zero live call sites

- **ID:** `LL-47935e1a5b`  |  **ruleKey:** `dead-code-orphaned-file`  |  **confidence:** high
- **Location:** `lib/purchasing2.rb`:1
- **Frameworks:** —
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- Independent grep across *.rb/*.rake/*.yml/*.erb/*.js confirms zero live references. Swept every constantize/const_get/safe_constantize call site in the repo; none can resolve to Purchasing2. purchase_prep would NameError if ever invoked (references undefined user/active_sale?).
- **Remediation:** delete, or finish and wire in if a Stripe Checkout Session migration is still intended

### stats/parts-of-speech-flow.js + .hbs (Google Charts Sankey component) is orphaned, apparently superseded by stats/parts-of-speech-pie

- **ID:** `LL-71f2ba5536`  |  **ruleKey:** `dead-code-orphaned-file`  |  **confidence:** high
- **Location:** `app/frontend/app/components/stats/parts-of-speech-flow.js`:1
- **Frameworks:** —
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- Confirmed zero references; stats.hbs wires PartsOfSpeechPie and a separate SankeyPartsOfSpeech instead. Same dynamic-invocation check as num-rows applies (namespace-scoped elsewhere).
- **Remediation:** delete both files (78-line .js + .hbs), or confirm intent to re-adopt the Sankey view and wire it into stats.hbs

### Four Ember stats components (stats/num-rows1..4.js) have no template and zero references anywhere

- **ID:** `LL-e0ea356243`  |  **ruleKey:** `dead-code-orphaned-file`  |  **confidence:** high
- **Location:** `app/frontend/app/components/stats/num-rows1.js`:7
- **Frameworks:** —
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- Confirmed zero references. Specifically checked the dynamic-invocation escape hatch: the only {{component ...}} call in the whole template tree is namespace-scoped to setup/, so no string-built path can reach stats/num-rows*.
- **Remediation:** delete all four files

## LOW (4)

### dbman.js swallows three different IndexedDB errors with a bare `debugger;` and no other handling

- **ID:** `LL-208e8f1317`  |  **ruleKey:** `slop-dead-debug-artifact`  |  **confidence:** high
- **Location:** `app/frontend/app/utils/dbman.js`:390
- **Frameworks:** —
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- Confirmed all three catch(e){debugger;} sites in the live (non-sqlite) IndexedDB path. A fourth bare debugger (no semicolon) at line 663 in the sqlite open_error handler was not counted by the finder. 'no-debugger' is disabled repo-wide in .eslintrc.js.
- **Remediation:** replace each catch(e) { debugger; } with real error handling/logging appropriate to store/remove/lastSync failure

### Bare `debugger;` statement left in a live persistence-sync promise-rejection handler

- **ID:** `LL-30236919f6`  |  **ruleKey:** `slop-dead-debug-artifact`  |  **confidence:** high
- **Location:** `app/frontend/app/utils/persistence.js`:2402
- **Frameworks:** —
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- Confirmed the debugger; at line 2402 is real. Additional context: utils/persistence.js is proxied to a services/persistence.js twin with the identical swallow pattern at its own line 2390 (not a duplicate finding -- different file, out of this run's scope). Undercounted: each of the two files actually carries five debugger statements total, not one; .eslintrc.js:34 sets 'no-debugger':'off' so none are lint-gated.
- **Remediation:** remove the debugger statement (replace with a real error handler or a console.warn, or leave the rejection silently swallowed only if that's intentional)

### setup/extra-supervisors.js + .hbs component has zero references anywhere

- **ID:** `LL-c95c637f00`  |  **ruleKey:** `dead-code-orphaned-file`  |  **confidence:** high
- **Location:** `app/frontend/app/components/setup/extra-supervisors.js`:3
- **Frameworks:** —
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- This IS the one component with a real reflective path (setup.hbs's dynamic {{component this.setupComponent}}), and it still doesn't reach: setup.js's order/extra_order allowlists never include 'extra-supervisors'. Confirmed dead, but for a different reason than the finder stated (it checked template references, not the dynamic-dispatch allowlist -- got the right answer without checking the actual risk path). Bonus: setup/extra-reports.js and setup/done.js are dead by the identical mechanism and were not flagged this run.
- **Remediation:** delete both files, or wire into the onboarding/setup flow if the supervisor-explainer copy in the .hbs was meant to ship

### create-board route always redirects in beforeModel, making its own template permanently unreachable

- **ID:** `LL-ebb4be7b73`  |  **ruleKey:** `dead-code-unreachable-branch`  |  **confidence:** high
- **Location:** `app/frontend/app/routes/create-board.js`:13
- **Frameworks:** —
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- Confirmed unconditional redirect with no loop-back. Checked every templateName override in the repo; none renders create-board, so the template has no second entry point.
- **Remediation:** delete app/frontend/app/templates/create-board.hbs (and drop the /create-board route entry in router.js if the redirect-only behavior is no longer needed for old bookmarked links)


---
_Generated from the register at `d67ed76e0a161b594fbffa519ab428d0f9b7780b`. Regenerate with `ruby scripts/render-domain-reports.rb`. Do not edit by hand._
