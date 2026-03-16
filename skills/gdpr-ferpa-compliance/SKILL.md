# GDPR/FERPA Compliance Skill

## Purpose
Audit data privacy practices, PII handling, and compliance with GDPR and FERPA requirements. Special focus on AAC user data (communication logs, vocabulary, usage patterns) which is highly sensitive.

## Scan Scope
- `app/models/` — identify all PII fields
- `app/controllers/` — data access patterns
- `app/serializers/` — what data is exposed via API
- `config/` — data retention settings
- `db/migrate/` — schema changes involving PII
- `app/views/` and `app/templates/` — data displayed in UI

## Checklist

### Data Mapping
- [ ] Identify all models containing PII (name, email, DOB, device IDs)
- [ ] Identify all models containing sensitive AAC data (communication logs, vocabulary, usage frequency)
- [ ] Map data flows: collection -> storage -> processing -> deletion
- [ ] Document third-party data sharing (analytics, error tracking, APIs)

### PII Minimization
- [ ] Verify only necessary PII is collected
- [ ] Check for PII in logs (Rails logger, error tracking)
- [ ] Check for PII in caches (Redis, session store)
- [ ] Verify PII is not stored in URLs or query params

### Access Control
- [ ] Role-based access to user data (admin, therapist, caregiver, user)
- [ ] API endpoints require authentication
- [ ] Scoped data access (users can only see their own data)
- [ ] Admin audit trail for data access

### Data Retention
- [ ] Retention periods defined for each data type
- [ ] Automated cleanup for expired data
- [ ] Communication logs have configurable retention
- [ ] Inactive account handling

### Export/Deletion (Right to be Forgotten)
- [ ] User data export endpoint exists (GDPR Article 20)
- [ ] Account deletion removes all PII
- [ ] Deletion cascades to associated records
- [ ] Backup retention respects deletion requests
- [ ] Export format is machine-readable (JSON/CSV)

### FERPA-Specific (Educational Records)
- [ ] Student records properly classified
- [ ] Parental consent mechanisms for minors
- [ ] Directory information opt-out
- [ ] Educational records access logging

## Severity Mapping
- **critical**: PII exposed without authentication, no deletion mechanism
- **high**: Missing access controls, PII in logs, no retention policy
- **medium**: Incomplete data mapping, missing export format
- **low**: Documentation gaps, minor scope issues
- **info**: Best practice recommendations

## Output Format
```json
{
  "skill": "gdpr-ferpa-compliance",
  "findings": [
    {
      "id": "PRIV-001",
      "severity": "critical|high|medium|low|info",
      "category": "data-mapping|pii-minimization|access-control|retention|export-deletion|ferpa",
      "title": "Short description",
      "description": "Detailed finding",
      "file": "path/to/file",
      "line": null,
      "recommendation": "How to fix",
      "regulation": "GDPR Art. X / FERPA section Y"
    }
  ],
  "checklist_completion": "X/Y",
  "risk_rating": "critical|high|medium|low"
}
```
