---
name: api-contract-audit
description: API contract verification checklist for LingoLinq-AAC. Checks Ember Data models, adapters, and serializers against Rails lib/json_api, controllers, and routes for payload shape, casing, pagination, and error format. Preloaded by the api-auditor agent; emits findings in the canonical register schema. Read-only.
---

# API Contract Verification Audit

## Purpose
Verify that Ember Data models and the Rails JSON API agree on payload shapes, field names,
casing, ID format, pagination, and error responses. Read-only: produce findings, never fix.

## Scan scope
- Ember: `app/frontend/app/models/**/*.js`, `app/frontend/app/adapters/**/*.js`,
  `app/frontend/app/serializers/**/*.js`.
- Rails: `lib/json_api/**` (this repo builds API JSON here, NOT via standard Rails serializers),
  `app/controllers/api/**/*.rb`, `config/routes.rb`, `app/models/**/*.rb` (relationships).

## Checklist
### Model <-> payload alignment
- [ ] Every Ember Data model has a corresponding Rails JSON builder.
- [ ] All Ember model attributes exist in the Rails payload; all relationships serialized.
- [ ] No orphaned builders (Rails emits a shape no Ember model consumes).

### Field naming / casing / IDs
- [ ] Consistent casing convention; transform handled in adapter/serializer, not scattered.
- [ ] ID format consistency. This repo uses custom `global_id` STRINGS (`#shard#_#dbid#`), not
      raw integers, plus protected id-and-nonce for some records. Verify both sides agree.

### Pagination
- [ ] Pagination format agreed; meta fields match; default page size consistent; total/has_more present.

### Error responses
- [ ] Consistent error format; field-level validation detail; correct HTTP status codes;
      Ember error handling matches the Rails error shape.

### Endpoint coverage
- [ ] All Ember model CRUD operations have matching routes; custom actions have endpoints;
      nested routes match relationship definitions.

### Repo-specific shapes
- [ ] Buttons are stored on board objects (not persisted separately): contract reflects that.
- [ ] Large datasets (LogSession, BoardDownstreamButtonSet) live in S3 via `extra_data`:
      payload references vs inline data are consistent with that design.

## Severity mapping
- **critical**: contract break that corrupts/loses data or breaks auth-scoped responses.
- **high**: attribute/relationship mismatch that breaks a feature; casing/ID-format drift.
- **medium**: pagination/meta mismatch; inconsistent error shape.
- **low**: cosmetic naming drift; missing-but-unused field.

## Finding schema (canonical: mirrors audit-reports/FINDINGS.json)
```json
{
  "ruleKey": "stable-kebab-rule-id",
  "title": "one line",
  "severity": "critical|high|medium|low",
  "confidence": "high|medium|low",
  "frameworks": [],
  "status": "open",
  "evidence": { "type": "code", "file": "app/frontend/app/models/...", "line": 10,
                "snippet": "verbatim line at the audited SHA", "sha": "<auditedSha>" },
  "remediation": { "options": "which side changes and how", "timeframe": "advisory" },
  "notes": "reference the counterpart file (the other side of the contract) here"
}
```
Rules:
- Finders emit `status: "open"` ONLY; never `verified-closed` (Scot closes; adversary confirms first).
- Anchor `evidence` to the side that must change; reference the counterpart in `notes`.
- The `snippet` must exist verbatim at `<auditedSha>` (`scripts/citation-check.rb` enforces this).
- `frameworks` is usually `[]`; tag a regulation only if a mismatch leaks regulated data.
- The orchestrator computes the stable `id`, sets timestamps/owner, and reconciles against the
  existing register. No data in findings; snippets are code only.
