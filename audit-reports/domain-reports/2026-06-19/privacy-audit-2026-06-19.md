# LingoLinq-AAC Privacy & Data Protection (GDPR / FERPA / COPPA / HIPAA) Audit

**Run date:** 2026-06-19  |  **Finder:** `privacy-auditor`  |  **Audited commit:** `445336592dda` (`staging`)

**Open findings in this domain:** 6  (0 CRITICAL · 1 HIGH · 5 MEDIUM · 0 LOW)

> DRAFT view of the findings register (`audit-reports/FINDINGS.json`), the single source of truth. Statuses are verified against live code at the audited commit. Only Scot closes a finding, downgrades severity, or accepts risk. Evidence is code/path only; no student or patient data appears here.

## HIGH (1)

### Eval narration gates on caller-asserted user_id but egresses an independent, unbound eval_session payload

- **ID:** `LL-11db0dc848`  |  **ruleKey:** `eval-narrate-consent-keyed-to-caller-user-id`  |  **confidence:** high
- **Location:** `app/controllers/api/eval_sessions_controller.rb`:57
- **Frameworks:** COPPA, FERPA, HIPAA
- **First seen:** 2026-06-17  |  **Last seen:** 2026-06-17  |  **Disposition:** fixed
- **Remediation:** Persist the eval server-side against the resolved user and verify ownership of the eval content before egress, rather than trusting the client-supplied eval_session payload. Bind the gate-subject (user_id) to the data actually sent.

## MEDIUM (5)

### DataPolicyEnforcer retention only purges session log sessions

- **ID:** `LL-1890f6a922`  |  **ruleKey:** `data-policy-enforcer-sessions-only`  |  **confidence:** high
- **Location:** `lib/data_policy_enforcer.rb`:14
- **Frameworks:** GDPR, FERPA
- **First seen:** 2026-04-09  |  **Last seen:** 2026-06-12  |  **Disposition:** untriaged
- **Remediation:** Extend retention enforcement to other data types referenced in org data policies (boards, images, notes).

### protected_image accepts user_token via URL parameter

- **ID:** `LL-310b464be4`  |  **ruleKey:** `protected-image-token-in-url`  |  **confidence:** high
- **Location:** `app/controllers/api/users_controller.rb`:871
- **Frameworks:** FERPA
- **First seen:** 2026-04-09  |  **Last seen:** 2026-06-12  |  **Disposition:** untriaged
- **Remediation:** Accept the token via Authorization header or short-lived signed URLs; URL params leak to logs/history/Referer.

### external_reference exposed in license JSON without permission check

- **ID:** `LL-55baae6d40`  |  **ruleKey:** `external-reference-exposed-json`  |  **confidence:** high
- **Location:** `lib/json_api/license.rb`:16
- **Frameworks:** GDPR
- **First seen:** 2026-04-09  |  **Last seen:** 2026-06-12  |  **Disposition:** untriaged
- **Remediation:** Only include external_reference for users with manage permission on the org.

### flush_leftovers is unimplemented (orphan records accumulate)

- **ID:** `LL-991d259b2a`  |  **ruleKey:** `flush-leftovers-unimplemented`  |  **confidence:** high
- **Location:** `lib/flusher.rb`:48
- **Frameworks:** —
- **First seen:** 2026-04-09  |  **Last seen:** 2026-06-12  |  **Disposition:** untriaged
- **Remediation:** Implement incrementally; prioritize stale images (item 1) and orphaned versions (item 7).

### User creation (incl. org start codes) generates no AuditEvent

- **ID:** `LL-d35cbdb313`  |  **ruleKey:** `no-auditevent-user-creation`  |  **confidence:** medium
- **Location:** `app/controllers/api/users_controller.rb`:244
- **Frameworks:** FERPA
- **First seen:** 2026-04-09  |  **Last seen:** 2026-06-12  |  **Disposition:** untriaged
- **Remediation:** Add AuditEvent in the create action for school-context provisioning.


---
_Generated from the register at `445336592ddaf838689df7e578829e94e140890d`. Regenerate with `ruby scripts/render-domain-reports.rb`. Do not edit by hand._
