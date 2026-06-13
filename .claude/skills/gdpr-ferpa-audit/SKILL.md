---
name: gdpr-ferpa-audit
description: Privacy/compliance audit checklist for LingoLinq-AAC (GDPR, FERPA, COPPA, HIPAA). PII handling, access control, retention, export/deletion, and consent. Preloaded by the privacy-auditor agent; emits findings in the canonical register schema. Read-only.
---

# GDPR / FERPA / COPPA / HIPAA Audit

## Purpose
Audit data-privacy practices and PII handling for LingoLinq-AAC. Special focus on AAC user
data (communication logs, vocabulary, usage patterns), which is highly sensitive and often
belongs to minors. This is a read-only finder: produce findings, never fix.

## Scan scope
- `app/models/` PII fields and sensitive AAC data; `secure_serialize` usage.
- `app/controllers/` access patterns, authentication, scoped access (`allowed?`, permissions).
- `lib/json_api/` and any serialization: what data is exposed via the API.
- `lib/pii_scrubber.rb` + AI/LLM call sites: PII must never reach external models lacking a BAA.
- `config/` retention settings; `db/migrate/` schema changes involving PII.
- Logging/error tracking (`Rails.logger`, Sentry / `CoppaSentryScrub`).

## Checklist
### Data mapping
- [ ] All models containing PII (name, email, DOB, device IDs) identified.
- [ ] All models containing sensitive AAC data (communication logs, vocabulary, usage) identified.
- [ ] Data flows mapped: collection -> storage -> processing -> deletion.
- [ ] Third-party data sharing documented (analytics, error tracking, AI APIs).

### PII minimization
- [ ] Only necessary PII collected.
- [ ] No PII in logs (Rails logger, error tracking) and no PII in caches (Redis, sessions).
- [ ] No PII in URLs or query params.
- [ ] PiiScrubber actually invoked on every external-model path (not just defined).

### Access control
- [ ] Role-based access (admin, therapist, caregiver, user).
- [ ] API endpoints require authentication; users see only their own data.
- [ ] Admin access to user data is audit-logged (`AuditEvent`).

### Data retention
- [ ] Retention periods defined per data type; automated cleanup for expired data.
- [ ] Communication logs have configurable retention; inactive-account handling defined.

### Export / deletion (right to be forgotten)
- [ ] User data export endpoint exists (GDPR Art. 20), machine-readable format.
- [ ] Account deletion removes all PII and cascades to associated records.
- [ ] Backup retention respects deletion requests.

### FERPA / COPPA (minors and educational records)
- [ ] Student records classified; educational-record access logged.
- [ ] Parental / separate consent mechanisms for under-13 users (`ai_consent` path).
- [ ] Directory-information opt-out.

## Severity mapping
- **critical**: PII exposed without authentication; no deletion mechanism; identifiable data sent to an external model with no BAA and no scrub.
- **high**: missing access controls; PII in logs; no retention policy; broken consent gate.
- **medium**: incomplete data mapping; missing export format; partial scoping.
- **low**: documentation gaps; minor scope issues.

## Finding schema (canonical: mirrors audit-reports/FINDINGS.json)
Emit each finding as:
```json
{
  "ruleKey": "stable-kebab-rule-id",
  "title": "one line",
  "severity": "critical|high|medium|low",
  "confidence": "high|medium|low",
  "frameworks": ["FERPA","COPPA","HIPAA","GDPR"],
  "status": "open",
  "evidence": { "type": "code", "file": "app/...", "line": 123,
                "snippet": "verbatim source line at the audited SHA", "sha": "<auditedSha>" },
  "remediation": { "options": "how to fix", "timeframe": "advisory SLA" },
  "notes": "optional cross-refs"
}
```
Rules:
- Finders emit `status: "open"` ONLY. Never `verified-closed`: only Scot closes a finding,
  and the adversary verifier confirms it first.
- The `snippet` MUST appear verbatim in the cited file at `<auditedSha>` (`scripts/citation-check.rb` enforces this).
- The orchestrator computes the stable `id` (`LL-` + first 10 hex of `sha256(ruleKey + "|" + file)`),
  sets `firstSeen`/`lastSeen`/`owner`, tags `regulation` detail in `notes`, and reconciles
  against the existing register so a recurring issue keeps its id.
- **No student/patient data in any field. Snippets are code only.** If a risky pattern lives in
  a fixture/seed with real-looking rows, cite the file:line and column shape, never row values.
