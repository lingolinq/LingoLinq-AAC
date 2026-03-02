# Full Audit Workflow

## Overview
Complete end-to-end audit of the LingoLinq-AAC codebase and infrastructure.

## Pre-Flight
1. Verify working directory is `LingoLinq-AAC/`
2. Verify Notion MCP is available (test with `notion-search`)
3. Verify Render MCP is available (test with `list_services`)
4. Create `audit-reports/` directory if it doesn't exist

## Step 1: Launch Domain Subagents (Parallel)
Launch all 6 domain subagents simultaneously using the Task tool:

```
Task(subagent_type="general-purpose", prompt=<subagents/ember-auditor.md>)
Task(subagent_type="general-purpose", prompt=<subagents/rails-auditor.md>)
Task(subagent_type="general-purpose", prompt=<subagents/api-auditor.md>)
Task(subagent_type="general-purpose", prompt=<subagents/privacy-auditor.md>)
Task(subagent_type="general-purpose", prompt=<subagents/dependency-auditor.md>)
Task(subagent_type="general-purpose", prompt=<subagents/infra-auditor.md>)
```

All 6 run in parallel. Wait for all to complete.

## Step 2: Aggregate Results
Collect JSON outputs from all 6 subagents into a single object:
```json
{
  "ember": "<ember-auditor output>",
  "rails": "<rails-auditor output>",
  "api": "<api-auditor output>",
  "privacy": "<privacy-auditor output>",
  "dependencies": "<dependency-auditor output>",
  "infrastructure": "<infra-auditor output>"
}
```

## Step 3: Compute MVP Readiness
Launch the MVP Readiness Auditor with the aggregated results:
```
Task(subagent_type="general-purpose", prompt=<subagents/mvp-readiness-auditor.md> + aggregated JSON)
```

## Step 4: Generate Unified Report
Combine all findings into a single report:
- Write to `audit-reports/audit-YYYY-MM-DD.json` (machine-readable)
- Write to `audit-reports/audit-YYYY-MM-DD.md` (human-readable summary)

Report structure:
1. Executive Summary (MVP score, top 5 blockers)
2. Domain Reports (one section per auditor)
3. Cross-Cutting Findings (issues that span domains)
4. Prioritized Action Items

## Step 5: Sync to Notion
Follow the procedure in `skills/notion-sync/SKILL.md`:
1. Create/find the page hierarchy
2. Push the full report to Engineering -> Audits
3. Push compliance findings to Compliance -> GDPR/FERPA
4. Push MVP score to Product -> MVP Readiness
5. Push infra findings to Infrastructure -> Security

## Step 6: Summary
Present to the user:
- MVP readiness score
- Count of findings by severity
- Top 5 blockers
- Links to Notion pages
- Path to local report files
