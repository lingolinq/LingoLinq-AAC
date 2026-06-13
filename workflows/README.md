> **DEPRECATED (2026-06, Audit/Compliance Modernization Phase 2).** `full-audit.md` is replaced
> by the `/audit-run` orchestrator skill (`.claude/skills/audit-run/SKILL.md`), which fans out
> the read-only finder agents, reconciles into `audit-reports/FINDINGS.json` via
> `scripts/audit-merge.rb`, runs the `adversary` agent as verifier, and validates with
> `scripts/citation-check.rb`. The Notion-sync step is deferred to Phase 3 (one-way generated
> publish). This folder is kept for history only. See the repo CLAUDE.md "Audit Orchestration
> System" section.

# LingoLinq Audit Workflows

Workflows orchestrate skills and subagents into end-to-end audit pipelines.

## Available Workflows

### Full Audit (`full-audit.md`)
Runs all subagents in parallel, aggregates results, computes MVP readiness, and syncs to Notion.

### Team Orchestrator (`team-orchestrator.md`)
Defines the "LingoLinq Audit Team" coordination pattern with team roles and shared task management.

## How to Run
Read the workflow `.md` file and follow its steps. The orchestrator (you, Claude Code) executes each step.
