---
name: compliance-status
description: Surface LingoLinq-AAC's current compliance posture - open Critical/High findings from the register, calendar items due or overdue, register-hygiene flags, and the regulatory-watch delta. User-invoked only (/compliance-status). Read-mostly; drafts artifacts for Scot's attestation, never closes findings or sends anything externally.
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash, Agent
---

# /compliance-status: LingoLinq compliance posture

The user-invoked entry point for the `compliance-officer` agent. It runs in the trusted main
session and dispatches the read-mostly `compliance-officer` to report program state. It never
closes a finding, never edits application code, and never sends anything externally. The
findings register (`audit-reports/FINDINGS.json`) is the single source of truth for status;
only Scot moves a finding to `verified-closed`/`accepted-risk`.

## Run context (dynamic injection)
!`ruby scripts/compliance-status-context.rb`

## Step 1: Preflight
Confirm the register exists and citations are green (`ruby scripts/citation-check.rb`, expect
exit 0). If red, note it - posture cannot be asserted on a broken register.

## Step 2: Dispatch the compliance-officer
Spawn the `compliance-officer` agent with the Agent tool, passing the audited SHA. Ask it to:
1. Read `audit-reports/compliance-calendar.json` and surface items due within 90 days or overdue.
   This includes the audit-run cadence (`rev-audit-run-quarterly-full` = full fan-out + adversary
   verify; `rev-audit-run-monthly-light` = diff-scoped steps 0-5 only). Note which is next due so
   Scot knows whether the upcoming run is heavy or light. Cadence dates are advisory, not a claim.
2. Read the register and flag hygiene issues: findings past severity SLA, recurrences
   (`regression: true`), and stale evidence (citation-check failures).
3. Report the headline: open Critical and High counts (no synthetic score - decision 5.9.2).
4. Summarize the latest regulatory-watch delta notes (write fresh ones only if asked, since
   fresh WebSearch on every status check is wasteful - do a dated refresh on a calendar cadence).
5. List any DRAFT artifacts awaiting Scot's attestation.

## Step 3: Report (read-mostly)
Present the officer's report to Scot:
- **Headline:** open Critical / High from the register, with the audited SHA.
- Calendar items due/overdue (escalate anything inside 90 days).
- Register hygiene flags and recommended next actions (recommendations only).
- DRAFT artifacts awaiting attestation (Posture Report, ACR, AI Governance Memo).
- Reminder: only Scot closes, downgrades, or accepts risk; nothing customer-facing leaves
  without his sign-off; the Notion publish is a separate human-initiated one-way step.

## Guardrails (always)
- Read-mostly: the officer drafts only on the compliance artifact allowlist (`audit-reports/compliance-calendar.*`,
  dated hygiene/regulatory notes, `docs/legal/*.md`); a PreToolUse hook enforces it. Never
  `audit-reports/FINDINGS.json`. No application-code edits, no external sends.
- No student/patient data in any output (code-only evidence; public regulation text).
- Compliance content is Claude-only, never Codex/DeepSeek.
- The register is the only authoritative status; dated reports are point-in-time snapshots.
