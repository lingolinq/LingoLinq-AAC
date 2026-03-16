# LingoLinq Audit Team Orchestrator

## Team Members & Roles

| Role | Responsibility | Skill(s) | Subagent |
|------|---------------|-----------|----------|
| Team Lead | Orchestrate, merge findings, resolve conflicts | Full-Stack Auditor | mvp-readiness-auditor |
| Ember Specialist | Frontend audit | Ember Stabilization | ember-auditor |
| Rails Specialist | Backend audit | Rails Upgrade | rails-auditor |
| API Specialist | Contract verification | API Contract | api-auditor |
| Privacy Specialist | Compliance audit | GDPR/FERPA | privacy-auditor |
| Infra Specialist | Security & ops audit | SOC2 Auditor | infra-auditor |

## Coordination Rules

### Parallel Exploration
- All specialists run simultaneously
- No specialist depends on another's output
- Team Lead runs AFTER all specialists complete

### Shared Task List
Use Claude Code's TaskCreate/TaskUpdate tools to maintain a shared task list:
- Each specialist creates tasks for findings that need cross-domain review
- Team Lead triages cross-domain tasks
- Tasks track: finding ID, severity, owner, status

### Shared Audit Report
All specialists contribute to `audit-reports/audit-YYYY-MM-DD.md`:
- Each specialist writes their domain section
- Team Lead writes executive summary and cross-cutting findings

### No Code Changes
- NO specialist may modify code
- Findings are documented, not fixed
- Code changes require explicit "apply fixes" command from user
- Always show diffs before proposing changes

## Running the Team
1. Read `workflows/full-audit.md` and execute its steps
2. The Team Lead role is played by the main Claude Code session
3. Specialists are played by subagents launched via Task tool
4. After all subagents return, Team Lead aggregates and syncs
