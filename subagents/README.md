> **DEPRECATED (2026-06, Audit/Compliance Modernization Phase 2).** These plain-prompt
> subagents are replaced by real Claude Code agents at `.claude/agents/*-auditor.md`
> (privacy-auditor, infra-auditor, api-auditor, dependency-auditor), which are read-only by
> construction (`tools: Read, Grep, Glob, Bash` + a PreToolUse write-blocker hook) and are
> spawned by the `/audit-run` orchestrator. `ember-auditor`, `rails-auditor`, and
> `mvp-readiness-auditor` were retired (migration-era / score replaced by open Critical/High
> counts). This folder is kept for history only. See the repo CLAUDE.md "Audit Orchestration
> System" section.

# LingoLinq Audit Subagents

Subagents are isolated audit workers launched via Claude Code's `Task` tool. Each runs in its own context window, scans only its domain, and returns structured findings.

## Available Subagents

| Subagent | Skill(s) Used | Scope |
|----------|---------------|-------|
| ember-auditor | Ember Stabilization | Ember app code, templates, addons |
| rails-auditor | Rails Upgrade | Rails app code, gems, config |
| api-auditor | API Contract Verification | Models, serializers, routes |
| privacy-auditor | GDPR/FERPA Compliance | All code touching PII |
| dependency-auditor | (standalone) | Gemfile.lock, package-lock.json |
| mvp-readiness-auditor | Full-Stack Auditor | Aggregates all domain scores |
| infra-auditor | SOC2 Auditor | Render MCP, AWS MCP, config |

## How to Launch
Each `.md` file contains the full prompt to pass to the Task tool. Example:

```
Task(subagent_type="general-purpose", prompt=<contents of ember-auditor.md>)
```

## Rules
- Subagents NEVER modify code
- Subagents return structured JSON findings
- Subagents scan only their declared scope
- All findings include file paths and line numbers where possible
