# LingoLinq-AAC Findings Register

> Generated from `audit-reports/FINDINGS.json` by `scripts/citation-check.rb --render`.
> Do not hand-edit; edit the JSON (the source of truth) and re-render.

**Audited:** `origin/staging` @ `56da75814c2c88216404f08352e4fe9f6bbbaa8a` on 2026-06-12  
**Seed:** audit-reports/unified-audit-2026-04-09.md  
**Headline (open + remediated-unverified):** 0 Critical / 13 High

Statuses are verified against live code at the audited SHA, not copied from the dated report prose. Only Scot closes a finding, downgrades severity, or accepts risk.

## Open (21)

| ID | Legacy | Severity | Frameworks | Title | Evidence |
|---|---|---|---|---|---|
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
| LL-991d259b2a | P2-1 | medium |  | flush_leftovers is unimplemented (orphan records accumulate) | `lib/flusher.rb`:48 |
| LL-55baae6d40 | P2-4 | medium | GDPR | external_reference exposed in license JSON without permission check | `lib/json_api/license.rb`:16 |
| LL-1890f6a922 | P2-5 | medium | GDPR, FERPA | DataPolicyEnforcer retention only purges session log sessions | `lib/data_policy_enforcer.rb`:14 |
| LL-56f0f19fca | P2-6 | medium |  | Registration/2fa/SAML endpoints under general throttle only | `config/initializers/throttling.rb`:18 |
| LL-d35cbdb313 | P2-7 | medium | FERPA | User creation (incl. org start codes) generates no AuditEvent | `app/controllers/api/users_controller.rb`:244 |
| LL-310b464be4 | P2-8 | medium | FERPA | protected_image accepts user_token via URL parameter | `app/controllers/api/users_controller.rb`:871 |
| LL-a97357136e | P2-2 | low |  | params.permit! bypasses Strong Parameters | `app/controllers/api/organizations_controller.rb`:866 |
| LL-ce00c8d3ad | P2-3 | low |  | License model lacks Processable concern | `app/models/license.rb`:1 |

## Verified closed (9)

| ID | Legacy | Severity | Frameworks | Title | Evidence |
|---|---|---|---|---|---|
| LL-c5fe9e2e3e | Infra-P0-1 | critical | HIPAA | Worker service missing encryption keys in render.yaml | `render.yaml`:84 |
| LL-90137ca466 | Infra-P0-2 | critical | SOC2 | Unauthenticated /api/v1/status exposed internal queue/db state | `app/controllers/session_controller.rb`:944 |
| LL-fbe07e6a1b | P0-1 | critical | FERPA, HIPAA | SQL injection via unwhitelisted sort_by in licenses endpoint | `app/controllers/api/organizations_controller.rb`:221 |
| LL-37caf162eb | P0-2 | critical | GDPR | License records not deleted by GDPR flusher (Right to Erasure gap) | `lib/flusher.rb`:224 |
| LL-3ccbf9b54a | P0-3 | critical | FERPA | No AuditEvent on license claim/release (FERPA access-log gap) | `app/controllers/api/organizations_controller.rb`:238 |
| LL-46fd4aa824 | P0-4 | critical | FERPA, HIPAA | No AuditEvent on supervisor consent create/respond/revoke | `app/controllers/api/supervisor_relationships_controller.rb`:52 |
| LL-c5bd616242 | Prior-BAA-AWS | high | HIPAA | BAA with AWS (S3/SES/Transcoder/SNS) for HIPAA | `docs/legal/AWS_BAA_ACCEPTED.md` |
| LL-2ea0b804e7 | Infra-P2-1 | medium | HIPAA | S3 buckets public-read on * (legacy ACL) | `docs/INFRASTRUCTURE.md`:101 |
| LL-7a8effae8a | P2-9 | medium | FERPA | user_name exposed for expired licenses during expiration window | `lib/json_api/license.rb`:17 |

## Superseded / obsolete (2)

| ID | Legacy | Severity | Frameworks | Title | Evidence |
|---|---|---|---|---|---|
| LL-3076d244a6 | Infra-P1-5 | high |  | Legacy s3 gem (0.3.29) in production | `Gemfile`:59 |
| LL-8c911f5cfd | Prior-BAA-Render | high | HIPAA, FERPA | BAA with Render (Postgres/Redis hosting) for FERPA/HIPAA | (attestation) |

---

_32 findings total. Re-run `ruby scripts/citation-check.rb` to validate every active citation._
