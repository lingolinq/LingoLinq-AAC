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
