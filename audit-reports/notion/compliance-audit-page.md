# Compliance & Audit (generated)

> 🤖 **GENERATED - DO NOT EDIT.** This page is a one-way mirror of the git findings
> register (`audit-reports/FINDINGS.json`), regenerated after each `/audit-run`. Edits here
> are overwritten on the next publish and are not the source of truth. Do not auto-file this
> page out of the Master Inbox and do not delete it; regenerate in place.
>
> Regenerate: `ruby scripts/compliance-notion-publish.rb`, then push this body to the single
> Notion "Compliance & Audit" page (see `audit-reports/notion/README.md`).

**Audited commit:** `1aa5d2db60e2f0eed9489445b2a37b5e1ad6fc3c`  
**Audited ref:** `scot/compliance/audit-phase4-cadence`  
**Run date:** 2026-06-14  
**Page generated:** 2026-06-14T06:51:27Z

## Headline - open findings

| Critical | High | Medium | Low |
|---|---|---|---|
| **1** | **15** | 9 | 8 |

_Headline is the count of `open` + `remediated-unverified` findings by severity (plan decision 5.9.2: counts, not a synthetic score). Only Scot closes a finding, downgrades severity, or accepts risk._

## Open findings (open + awaiting verification)

| ID | Legacy | Severity | Frameworks | Title | Evidence |
|---|---|---|---|---|---|
| LL-e573a39d2b |  | critical | FERPA, HIPAA, COPPA, GDPR | Eval narration sends slp_notes/sett (student name + clinical notes) to Anthropic with no PiiScrubber | `lib/eval_narrator.rb`:189 |
| LL-d1ea8659c3 |  | high |  | bootstrap 3.4.1 (EOL/abandoned) bundled into shipped app; reachable Tooltip/Popover & data-* XSS | `app/frontend/package.json`:31 |
| LL-ef5ac1b2a5 |  | high | FERPA, HIPAA | Eval AI narration creates no AiApiLog entry (no record student eval data was sent to an LLM) | `lib/eval_narrator.rb`:58 |
| LL-6619cc1811 | Infra-P1-1 | high | HIPAA | Redis connections without TLS; shared across environments | `config/initializers/resque.rb`:23 |
| LL-1085e59d29 | Infra-P1-2 | high | FERPA, HIPAA | Webhook callback URL validation accepts plaintext http:// | `app/models/webhook.rb`:42 |
| LL-c6dd65a2aa | Infra-P1-3 | high |  | Static cache_token='abc' never rotates (stale permission cache) | `config/initializers/resque.rb`:29 |
| LL-9f83617435 | Infra-P1-4 | high |  | No explicit HSTS ssl_options (subdomains/preload) | `config/environments/production.rb`:62 |
| LL-ca38d4d99e | P1-1 | high | FERPA, HIPAA | Consent endpoints absent from Rack::Attack protected_paths | `config/initializers/throttling.rb`:18 |
| LL-740bcb10fa | P1-2 | high | GDPR, HIPAA | License.metadata / external_reference stored unencrypted | `app/models/license.rb`:2 |
| LL-e775d86e6a | P1-3 | high | GDPR | License not handled in transfer_user_content (orphaned seats on merge) | `lib/flusher.rb`:156 |
| LL-e65d34f109 | P1-4 | high | FERPA | Sensitive new routes (claim_user) under general throttle only | `config/initializers/throttling.rb`:18 |
| LL-92dc570f30 | P1-5 | high |  | consent_response accepts token/decision from multiple parameter keys | `app/controllers/api/supervisor_relationships_controller.rb`:86 |
| LL-9a3ee852d5 | P1-6 | high |  | forgot_password leaks account existence via response shape and users count | `app/controllers/api/users_controller.rb`:705 |
| LL-747bb0e02d | P1-7 | high | FERPA, HIPAA | Password changes (incl. admin resets) generate no AuditEvent | `app/models/user.rb`:2255 |
| LL-6d8314e37b | P1-8 | high |  | SNS transcoding callbacks accepted without signature verification | `app/controllers/api/callbacks_controller.rb`:8 |
| LL-4e243f3e16 | P1-9 | high |  | start_code_lookup uses a brute-forceable 5-char verification hash | `app/controllers/api/organizations_controller.rb`:128 |
| LL-27d20047db |  | medium |  | Integration board_render_url is writable but never serialized back (read/write field-name asymmetry) | `app/frontend/app/models/integration.js`:24 |
| LL-52ff2a9a79 |  | medium | SOC2 | CI security-scan job (Brakeman SAST, bundle-audit, npm audit, gitleaks) is entirely non-blocking | `.github/workflows/ci.yml`:107 |
| LL-b5c30235d3 |  | medium | SOC2, HIPAA, FERPA | infra-auditor runtime/CLI evidence relies on instruction-only control against secret/PII leakage | `.claude/agents/infra-auditor.md`:31 |
| LL-991d259b2a | P2-1 | medium |  | flush_leftovers is unimplemented (orphan records accumulate) | `lib/flusher.rb`:48 |
| LL-55baae6d40 | P2-4 | medium | GDPR | external_reference exposed in license JSON without permission check | `lib/json_api/license.rb`:16 |
| LL-1890f6a922 | P2-5 | medium | GDPR, FERPA | DataPolicyEnforcer retention only purges session log sessions | `lib/data_policy_enforcer.rb`:14 |
| LL-56f0f19fca | P2-6 | medium |  | Registration/2fa/SAML endpoints under general throttle only | `config/initializers/throttling.rb`:18 |
| LL-d35cbdb313 | P2-7 | medium | FERPA | User creation (incl. org start codes) generates no AuditEvent | `app/controllers/api/users_controller.rb`:244 |
| LL-310b464be4 | P2-8 | medium | FERPA | protected_image accepts user_token via URL parameter | `app/controllers/api/users_controller.rb`:871 |
| LL-3483c28f3c |  | low | SOC2 | Parallel finders read live infra without synchronization (possible inconsistent snapshot) | `.claude/skills/audit-run/SKILL.md`:33 |
| LL-41d2d553ab |  | low |  | Integration JSON emits a debug junk key (asdf) consumed by no Ember model | `lib/json_api/integration.rb`:67 |
| LL-5f0f4f52f8 |  | low | SOC2 | Audit system files (.claude/) are not in any finder scan scope (no self-audit) | `.claude/agents/infra-auditor.md`:62 |
| LL-97f9001bb4 |  | low | SOC2 | Audit finder Bash guard is a denylist with residual fetch-and-exec bypass | `.claude/hooks/audit-readonly-guard.sh`:59 |
| LL-a2b45c2bcb |  | low | SOC2 | Finder agent-memory (memory: project) may carry process state across audit runs | `.claude/agents/infra-auditor.md`:7 |
| LL-ba0585ab93 |  | low | SOC2, HIPAA, FERPA | Production Postgres uses sslmode=require (encrypt only), not verify-ca/verify-full | `config/database.yml`:26 |
| LL-a97357136e | P2-2 | low |  | params.permit! bypasses Strong Parameters | `app/controllers/api/organizations_controller.rb`:866 |
| LL-ce00c8d3ad | P2-3 | low |  | License model lacks Processable concern | `app/models/license.rb`:1 |

## Notes

- **Source of truth:** the git register. This page is a generated read-only summary; it
  carries no evidence snippets, no finding notes, and no student/patient data.
- **Closed / accepted / superseded findings** are intentionally omitted here; see
  `audit-reports/FINDINGS.md` for the full lifecycle.
- **Compliance Posture Report** (`docs/legal/COMPLIANCE_POSTURE_REPORT.md`) stays **DRAFT /
  unattested** until Scot signs; it is linked, never embedded, and is not published
  externally until attested.
