# SOC2-Style Security Auditor Skill

## Purpose
Perform a SOC2-inspired security audit covering access controls, logging, infrastructure security, and operational practices. Not a formal SOC2 audit — a practical security posture assessment.

## Scan Scope
- Application code (all of `app/`)
- Configuration (`config/`, `.env*`, `render.yaml`)
- Infrastructure (Render services via MCP, AWS resources via MCP)
- CI/CD (`.github/workflows/`, `Procfile`, `bin/`)
- Dependencies (`Gemfile.lock`, `package-lock.json`)

## Checklist

### Access Control (CC6)
- [ ] Authentication mechanism exists and is enforced
- [ ] Password policy (minimum length, complexity)
- [ ] Session management (timeout, invalidation)
- [ ] Role-based access control implemented
- [ ] API authentication (tokens, OAuth)
- [ ] Admin panel protected

### Logging & Monitoring (CC7)
- [ ] Application logging exists
- [ ] Authentication events logged (login, logout, failed attempts)
- [ ] Data access events logged
- [ ] Error tracking configured (Sentry, Rollbar, etc.)
- [ ] Logs don't contain PII or secrets
- [ ] Render service logs accessible

### Infrastructure Security
- [ ] HTTPS enforced
- [ ] Database connections encrypted (SSL)
- [ ] Environment variables used for secrets (not hardcoded)
- [ ] No secrets in git history
- [ ] Render services configured securely
- [ ] AWS resources follow least-privilege

### Change Management (CC8)
- [ ] CI/CD pipeline exists
- [ ] Tests run before deploy
- [ ] Branch protection rules
- [ ] Code review required
- [ ] Deployment rollback capability

### Availability (A1)
- [ ] Health check endpoints exist
- [ ] Database backups configured
- [ ] Error handling prevents crashes
- [ ] Rate limiting on API endpoints
- [ ] Render auto-scaling or restart policies

## MCP Data Sources
- **Render MCP**: Use `mcp__render__list_services`, `mcp__render__get_service`, `mcp__render__list_logs` to pull infra state
- **AWS MCP**: Use `mcp__aws-mcp__aws___call_aws` to check AWS resource configuration

## Output Format
```json
{
  "skill": "soc2-auditor",
  "findings": [
    {
      "id": "SOC-001",
      "severity": "critical|high|medium|low|info",
      "category": "access-control|logging|infrastructure|change-mgmt|availability",
      "soc2_criteria": "CC6.1",
      "title": "Short description",
      "description": "Detailed finding",
      "file": "path/to/file or N/A for infra",
      "recommendation": "How to fix",
      "evidence": "What was checked"
    }
  ],
  "posture_score": "0-100",
  "critical_gaps": []
}
```
