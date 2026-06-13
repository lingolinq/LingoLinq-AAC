---
name: soc2-security-audit
description: SOC2-style security and infrastructure audit checklist for LingoLinq-AAC. Access control, logging, infra security, change management, availability across code, config, and live Render/AWS/GCP read state. Preloaded by the infra-auditor agent; emits findings in the canonical register schema. Read-only.
---

# SOC2-Style Security & Infrastructure Audit

## Purpose
A practical, SOC2-inspired security posture assessment (not a formal SOC2 audit) covering
access controls, logging, infrastructure security, change management, and availability.
Read-only: produce findings, never change code or infrastructure.

## Scan scope
- Application code (`app/`), configuration (`config/`, `.env*`, `render.yaml`, Cloud Run config).
- Infrastructure via read-only access (Render MCP read tools; `gcloud`/`aws` read CLI).
- CI/CD (`.github/workflows/`, `Procfile`, `bin/`); dependencies (`Gemfile.lock`, lockfiles).

## Checklist
### Access control (CC6)
- [ ] Authentication exists and is enforced; password policy; session timeout/invalidation.
- [ ] RBAC implemented; API authentication (tokens/OAuth); admin panel protected.

### Logging & monitoring (CC7)
- [ ] Application logging exists; auth events logged (login, logout, failed attempts).
- [ ] Data-access events logged (`AuditEvent`); error tracking configured (Sentry).
- [ ] **Logs contain no PII or secrets** (cross-check the PII scrubber on log/error paths).

### Infrastructure security
- [ ] HTTPS enforced; DB connections use SSL.
- [ ] Secrets from env / Secret Manager, never hardcoded; no secrets in git history.
- [ ] Render/AWS/GCP services follow least-privilege. (Repo is mid Render -> GCP Cloud Run
      migration: check both legacy `render.yaml`/Procfile and any Cloud Run / Secret Manager /
      Workload Identity Federation config that exists.)

### Change management (CC8)
- [ ] CI/CD exists; tests run before deploy; branch protection; code review required; rollback.

### Availability (A1)
- [ ] Health-check endpoints; DB backups configured; error handling; rate limiting.

## Live-infra access rules (read-only)
Use ONLY read tools: Render MCP `list_*`/`get_*`, and `gcloud/aws ... describe|list|get`.
Never call write tools or write CLI verbs (the PreToolUse guard blocks them). Never read or
echo secret VALUES; confirm sourcing and cite the reference line, not the secret.

## Severity mapping
- **critical**: secret in code/history; no auth on a sensitive endpoint; PII/secret in logs.
- **high**: missing RBAC; no HTTPS/SSL enforcement; no error tracking; no backups.
- **medium**: weak session policy; missing rate limiting; partial CI gating.
- **low**: hardening/best-practice gaps.

## Finding schema (canonical: mirrors audit-reports/FINDINGS.json)
```json
{
  "ruleKey": "stable-kebab-rule-id",
  "title": "one line",
  "severity": "critical|high|medium|low",
  "confidence": "high|medium|low",
  "frameworks": ["SOC2","HIPAA","FERPA"],
  "status": "open",
  "evidence": { "type": "code", "file": "config/...", "line": 12,
                "snippet": "verbatim line at the audited SHA", "sha": "<auditedSha>" },
  "remediation": { "options": "how to fix", "timeframe": "advisory SLA" },
  "notes": "optional"
}
```
Rules:
- Finders emit `status: "open"` ONLY; never `verified-closed` (Scot closes; adversary confirms first).
- **Anchor to a committed config/code file whenever possible** (`evidence.type: "code"`); the
  `snippet` must exist verbatim at `<auditedSha>` (`scripts/citation-check.rb` enforces this).
- For a purely-live observation with no committed file, use
  `evidence: { "type": "runtime", "source": "render-mcp:get_service", "snippet": "what was
  checked + observed, no secrets/PII" }` and omit `file`. citation-check SKIPs non-`code`/`doc`
  evidence types, so the register stays green; these are re-verified by re-running the live check.
- The orchestrator computes the stable `id`, sets `firstSeen`/`lastSeen`/`owner`, and reconciles
  against the existing register. No customer data in any field; evidence is config/code only.
