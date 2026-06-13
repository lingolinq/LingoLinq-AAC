> **DEPRECATED (2026-06, Audit/Compliance Modernization Phase 2).** This top-level `skills/`
> directory is legacy and tooling-invisible. The audit system now lives in the supported
> Claude Code layout: domain checklists are at `.claude/skills/<domain>-audit/SKILL.md`, the
> finder agents at `.claude/agents/*-auditor.md`, and the orchestrator is the `/audit-run`
> skill (`.claude/skills/audit-run/`). `ember-stabilization` and `rails-upgrade` were retired
> from the fan-out; `full-stack-auditor`'s 0-100 score was replaced by open Critical/High
> counts; `notion-sync` is deferred to Phase 3. This folder is kept for history only. See the
> repo CLAUDE.md "Audit Orchestration System" section.

# LingoLinq Audit Skills

Skills are structured audit procedures stored as SKILL.md files. Each defines:
- **Purpose**: What it audits
- **Scan Scope**: Files, patterns, and directories to inspect
- **Checklist**: Specific items to verify
- **Output Format**: Structured findings schema
- **Severity Levels**: critical / high / medium / low / info

## Available Skills

1. **Full-Stack Auditor** — Master orchestrator, MVP readiness scoring
2. **GDPR/FERPA Compliance** — Data privacy, PII handling, retention
3. **Ember Stabilization** — Deprecated APIs, addon compat, template errors
4. **Rails Upgrade** — Gem matrix, deprecated APIs, CVEs, migration blockers
5. **API Contract Verification** — Ember Data models vs Rails serializers
6. **SOC2 Auditor** — Security controls, access management, logging, infra
7. **Notion Sync** — Push results to Notion via MCP

## How Skills Are Used
Skills are loaded by subagents (see `/subagents`) or referenced directly in conversation.
To use a skill: read its SKILL.md and follow the procedure.
