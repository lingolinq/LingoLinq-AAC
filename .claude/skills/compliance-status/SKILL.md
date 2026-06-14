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
- Audited commit:  !`git rev-parse HEAD`
- Audited ref:     !`git rev-parse --abbrev-ref HEAD`
- Register present?  !`test -f audit-reports/FINDINGS.json && echo yes || echo "NO - run Phase 1 first"`
- Open Critical/High (register):  !`ruby -rjson -e 'd=JSON.parse(File.read("audit-reports/FINDINGS.json")); o=d["findings"].select{|f| %w[open remediated-unverified].include?(f["status"])}; c=o.count{|f| f["severity"]=="critical"}; h=o.count{|f| f["severity"]=="high"}; puts "critical=#{c} high=#{h}"' 2>/dev/null || echo "unavailable"`
- Calendar present?  !`test -f audit-reports/compliance-calendar.json && echo yes || echo "no (Phase 3 deliverable)"`

## Step 1: Preflight
Confirm the register exists and citations are green (`ruby scripts/citation-check.rb`, expect
exit 0). If red, note it - posture cannot be asserted on a broken register.

## Step 2: Dispatch the compliance-officer
Spawn the `compliance-officer` agent with the Agent tool, passing the audited SHA. Ask it to:
1. Read `audit-reports/compliance-calendar.json` and surface items due within 90 days or overdue.
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
- Read-mostly: the officer drafts only under `audit-reports/` and `docs/legal/`; a PreToolUse
  hook enforces it. No application-code edits, no external sends.
- No student/patient data in any output (code-only evidence; public regulation text).
- Compliance content is Claude-only, never Codex/DeepSeek.
- The register is the only authoritative status; dated reports are point-in-time snapshots.
