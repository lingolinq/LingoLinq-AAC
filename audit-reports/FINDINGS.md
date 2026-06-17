# LingoLinq-AAC Findings Register

> Generated from `audit-reports/FINDINGS.json` by `scripts/citation-check.rb --render`.
> Do not hand-edit; edit the JSON (the source of truth) and re-render.

**Audited:** `origin/staging` @ `d9c74cf7e0263e2a5b2e833ff1ed1ba686ae4403` on 2026-06-16  
**Seed:** audit-reports/unified-audit-2026-04-09.md  
**Headline (open + remediated-unverified):** 1 Critical / 16 High

Statuses are verified against live code at the audited SHA, not copied from the dated report prose. Only Scot closes a finding, downgrades severity, accepts risk, or sets a disposition. Disposition (triage) is orthogonal to status: a finding can be `open` yet `dismissed-false-positive`/`wontfix`/`accepted`; blank reads as `untriaged`.

## Open (40)

| ID | Legacy | Severity | Frameworks | Disposition | Source | Title | Evidence |
|---|---|---|---|---|---|---|---|
| LL-e573a39d2b |  | critical | FERPA, HIPAA, COPPA, GDPR | untriaged | audit-run | Eval narration sends slp_notes/sett (student name + clinical notes) to Anthropic with no PiiScrubber | `lib/eval_narrator.rb`:189 |
| LL-ef5ac1b2a5 |  | high | FERPA, HIPAA | untriaged | audit-run | Eval AI narration creates no AiApiLog entry (no record student eval data was sent to an LLM) | `lib/eval_narrator.rb`:58 |
| LL-d1ea8659c3 |  | high |  | untriaged | audit-run | bootstrap 3.4.1 (EOL/abandoned) bundled into shipped app; reachable Tooltip/Popover & data-* XSS | `app/frontend/package.json`:31 |
| LL-2967f77e6d |  | high | WCAG | untriaged | audit-run | Board-tile symbol image has no alt text (fast_html render path) | `app/frontend/app/utils/button.js`:449 |
| LL-6619cc1811 | Infra-P1-1 | high | HIPAA | untriaged | audit-run | Redis connections without TLS; shared across environments | `config/initializers/resque.rb`:23 |
| LL-1085e59d29 | Infra-P1-2 | high | FERPA, HIPAA | untriaged | audit-run | Webhook callback URL validation accepts plaintext http:// | `app/models/webhook.rb`:42 |
| LL-c6dd65a2aa | Infra-P1-3 | high |  | untriaged | audit-run | Static cache_token='abc' never rotates (stale permission cache) | `config/initializers/resque.rb`:29 |
| LL-9f83617435 | Infra-P1-4 | high |  | untriaged | audit-run | No explicit HSTS ssl_options (subdomains/preload) | `config/environments/production.rb`:62 |
| LL-ca38d4d99e | P1-1 | high | FERPA, HIPAA | untriaged | audit-run | Consent endpoints absent from Rack::Attack protected_paths | `config/initializers/throttling.rb`:18 |
| LL-740bcb10fa | P1-2 | high | GDPR, HIPAA | untriaged | audit-run | License.metadata / external_reference stored unencrypted | `app/models/license.rb`:2 |
| LL-e775d86e6a | P1-3 | high | GDPR | untriaged | audit-run | License not handled in transfer_user_content (orphaned seats on merge) | `lib/flusher.rb`:156 |
| LL-e65d34f109 | P1-4 | high | FERPA | untriaged | audit-run | Sensitive new routes (claim_user) under general throttle only | `config/initializers/throttling.rb`:18 |
| LL-92dc570f30 | P1-5 | high |  | untriaged | audit-run | consent_response accepts token/decision from multiple parameter keys | `app/controllers/api/supervisor_relationships_controller.rb`:86 |
| LL-9a3ee852d5 | P1-6 | high |  | untriaged | audit-run | forgot_password leaks account existence via response shape and users count | `app/controllers/api/users_controller.rb`:705 |
| LL-747bb0e02d | P1-7 | high | FERPA, HIPAA | untriaged | audit-run | Password changes (incl. admin resets) generate no AuditEvent | `app/models/user.rb`:2255 |
| LL-6d8314e37b | P1-8 | high |  | untriaged | audit-run | SNS transcoding callbacks accepted without signature verification | `app/controllers/api/callbacks_controller.rb`:8 |
| LL-4e243f3e16 | P1-9 | high |  | untriaged | audit-run | start_code_lookup uses a brute-forceable 5-char verification hash | `app/controllers/api/organizations_controller.rb`:128 |
| LL-b5c30235d3 |  | medium | SOC2, HIPAA, FERPA | untriaged | audit-run | infra-auditor runtime/CLI evidence relies on instruction-only control against secret/PII leakage | `.claude/agents/infra-auditor.md`:31 |
| LL-52ff2a9a79 |  | medium | SOC2 | untriaged | audit-run | CI security-scan job (Brakeman SAST, bundle-audit, npm audit, gitleaks) is entirely non-blocking | `.github/workflows/ci.yml`:107 |
| LL-27d20047db |  | medium |  | untriaged | audit-run | Integration board_render_url is writable but never serialized back (read/write field-name asymmetry) | `app/frontend/app/models/integration.js`:24 |
| LL-5ff3b22093 |  | medium | WCAG | untriaged | audit-run | Legacy Bootstrap close button labeled only by a times glyph, no aria-label | `app/frontend/app/templates/board-details.hbs`:3 |
| LL-ed914bded3 |  | medium | WCAG | untriaged | audit-run | Raw low-contrast brand token used as text foreground (board-tile language pill) | `app/frontend/app/styles/app.scss`:193 |
| LL-40dd412ed6 |  | medium | WCAG | untriaged | audit-run | Rails application layout html element has no lang attribute | `app/views/layouts/application.html.erb`:2 |
| LL-70abe7d9a9 |  | medium | WCAG | untriaged | audit-run | Icon-only remove button named only by a non-i18n title attribute | `app/frontend/app/templates/share-board.hbs`:101 |
| LL-13ad11eaee |  | medium | WCAG | untriaged | audit-run | Loading status text has no aria-live or role=status | `app/frontend/app/templates/bento.hbs`:14 |
| LL-991d259b2a | P2-1 | medium |  | untriaged | audit-run | flush_leftovers is unimplemented (orphan records accumulate) | `lib/flusher.rb`:48 |
| LL-55baae6d40 | P2-4 | medium | GDPR | untriaged | audit-run | external_reference exposed in license JSON without permission check | `lib/json_api/license.rb`:16 |
| LL-1890f6a922 | P2-5 | medium | GDPR, FERPA | untriaged | audit-run | DataPolicyEnforcer retention only purges session log sessions | `lib/data_policy_enforcer.rb`:14 |
| LL-56f0f19fca | P2-6 | medium |  | untriaged | audit-run | Registration/2fa/SAML endpoints under general throttle only | `config/initializers/throttling.rb`:18 |
| LL-d35cbdb313 | P2-7 | medium | FERPA | untriaged | audit-run | User creation (incl. org start codes) generates no AuditEvent | `app/controllers/api/users_controller.rb`:244 |
| LL-310b464be4 | P2-8 | medium | FERPA | untriaged | audit-run | protected_image accepts user_token via URL parameter | `app/controllers/api/users_controller.rb`:871 |
| LL-97f9001bb4 |  | low | SOC2 | untriaged | audit-run | Audit finder Bash guard is a denylist with residual fetch-and-exec bypass | `.claude/hooks/audit-readonly-guard.sh`:59 |
| LL-3483c28f3c |  | low | SOC2 | untriaged | audit-run | Parallel finders read live infra without synchronization (possible inconsistent snapshot) | `.claude/skills/audit-run/SKILL.md`:33 |
| LL-a2b45c2bcb |  | low | SOC2 | untriaged | audit-run | Finder agent-memory (memory: project) may carry process state across audit runs | `.claude/agents/infra-auditor.md`:7 |
| LL-5f0f4f52f8 |  | low | SOC2 | untriaged | audit-run | Audit system files (.claude/) are not in any finder scan scope (no self-audit) | `.claude/agents/infra-auditor.md`:62 |
| LL-ba0585ab93 |  | low | SOC2, HIPAA, FERPA | untriaged | audit-run | Production Postgres uses sslmode=require (encrypt only), not verify-ca/verify-full | `config/database.yml`:26 |
| LL-41d2d553ab |  | low |  | untriaged | audit-run | Integration JSON emits a debug junk key (asdf) consumed by no Ember model | `lib/json_api/integration.rb`:67 |
| LL-20c48e298c |  | low | WCAG | untriaged | audit-run | Board-tile symbol image has no alt text (edit-mode board-editor path) | `app/frontend/app/templates/board/index.hbs`:123 |
| LL-a97357136e | P2-2 | low |  | untriaged | audit-run | params.permit! bypasses Strong Parameters | `app/controllers/api/organizations_controller.rb`:866 |
| LL-ce00c8d3ad | P2-3 | low |  | untriaged | audit-run | License model lacks Processable concern | `app/models/license.rb`:1 |

## Verified closed (9)

| ID | Legacy | Severity | Frameworks | Disposition | Source | Title | Evidence |
|---|---|---|---|---|---|---|---|
| LL-c5fe9e2e3e | Infra-P0-1 | critical | HIPAA | untriaged | audit-run | Worker service missing encryption keys in render.yaml | `render.yaml`:84 |
| LL-90137ca466 | Infra-P0-2 | critical | SOC2 | untriaged | audit-run | Unauthenticated /api/v1/status exposed internal queue/db state | `app/controllers/session_controller.rb`:944 |
| LL-fbe07e6a1b | P0-1 | critical | FERPA, HIPAA | untriaged | audit-run | SQL injection via unwhitelisted sort_by in licenses endpoint | `app/controllers/api/organizations_controller.rb`:221 |
| LL-37caf162eb | P0-2 | critical | GDPR | untriaged | audit-run | License records not deleted by GDPR flusher (Right to Erasure gap) | `lib/flusher.rb`:224 |
| LL-3ccbf9b54a | P0-3 | critical | FERPA | untriaged | audit-run | No AuditEvent on license claim/release (FERPA access-log gap) | `app/controllers/api/organizations_controller.rb`:238 |
| LL-46fd4aa824 | P0-4 | critical | FERPA, HIPAA | untriaged | audit-run | No AuditEvent on supervisor consent create/respond/revoke | `app/controllers/api/supervisor_relationships_controller.rb`:52 |
| LL-c5bd616242 | Prior-BAA-AWS | high | HIPAA | untriaged | audit-run | BAA with AWS (S3/SES/Transcoder/SNS) for HIPAA | `docs/legal/AWS_BAA_ACCEPTED.md` |
| LL-2ea0b804e7 | Infra-P2-1 | medium | HIPAA | untriaged | audit-run | S3 buckets public-read on * (legacy ACL) | `docs/INFRASTRUCTURE.md`:101 |
| LL-7a8effae8a | P2-9 | medium | FERPA | untriaged | audit-run | user_name exposed for expired licenses during expiration window | `lib/json_api/license.rb`:17 |

## Superseded / obsolete (2)

| ID | Legacy | Severity | Frameworks | Disposition | Source | Title | Evidence |
|---|---|---|---|---|---|---|---|
| LL-3076d244a6 | Infra-P1-5 | high |  | untriaged | audit-run | Legacy s3 gem (0.3.29) in production | `Gemfile`:59 |
| LL-8c911f5cfd | Prior-BAA-Render | high | HIPAA, FERPA | untriaged | audit-run | BAA with Render (Postgres/Redis hosting) for FERPA/HIPAA | (attestation) |

---

_51 findings total. Re-run `ruby scripts/citation-check.rb` to validate every active citation._
