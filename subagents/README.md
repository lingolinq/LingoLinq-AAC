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
