# Compliance & Audit (generated)

> 🤖 **GENERATED - DO NOT EDIT.** This page is a one-way mirror of the git findings
> register (`audit-reports/FINDINGS.json`), regenerated after each `/audit-run`. Edits here
> are overwritten on the next publish and are not the source of truth. Do not auto-file this
> page out of the Master Inbox and do not delete it; regenerate in place.
>
> Regenerate: `ruby scripts/compliance-notion-publish.rb`, then push this body to the single
> Notion "Compliance & Audit" page (see `audit-reports/notion/README.md`).

**Audited commit:** `445336592ddaf838689df7e578829e94e140890d`  
**Audited ref:** `scot/security/audit-erasure-admin-reads`  
**Run date:** 2026-06-19  
**Page generated:** 2026-07-05T23:56:18Z

## Headline - open findings

| Critical | High | Medium | Low |
|---|---|---|---|
| **0** | **4** | 22 | 19 |

_Headline is the count of `open` + `remediated-unverified` findings by severity (plan decision 5.9.2: counts, not a synthetic score). Only Scot closes a finding, downgrades severity, or accepts risk._

## Open findings (open + awaiting verification)

| ID | Legacy | Severity | Frameworks | Title | Evidence |
|---|---|---|---|---|---|
| LL-705b10bcd7 |  | high | SOC2 | BoardDownstreamButtonSet S3 writes fail against KMS-encrypted bucket: 'Requests specifying Server Side Encryption with AWS KMS managed keys require AWS Signature Version 4' | (attestation) |
| LL-7f7372e3eb |  | high | SOC2, HIPAA | Audited-console wrapper still shells to Heroku CLI; not operative on Render so console access is unaudited | `bin/audit_console`:7 |
| LL-a95e9c5f7c |  | high | SOC2 | lingolinq-worker's 512Mi memory limit is too small for ButtonImage/BoardDownstreamButtonSet jobs, causing continuous OOM kills that land as Resque::Failure instead of being requeued | (attestation) |
| LL-6619cc1811 | Infra-P1-1 | high | HIPAA | Redis connections without TLS; shared across environments | `config/initializers/resque.rb`:23 |
| LL-0c6e931f47 |  | medium | WCAG | Sentence box (utterance bar) symbol chip images have no alt attribute | `app/frontend/app/templates/components/button-list.hbs`:21 |
| LL-13ad11eaee |  | medium | WCAG | Loading status text has no aria-live or role=status | `app/frontend/app/templates/bento.hbs`:14 |
| LL-35e6b7a3d6 |  | medium | WCAG | Dashboard search overlay text input has no programmatic label (placeholder only) | `app/frontend/app/templates/components/dashboard/authenticated-view.hbs`:588 |
| LL-40dd412ed6 |  | medium | WCAG | Rails application layout html element has no lang attribute | `app/views/layouts/application.html.erb`:2 |
| LL-52ff2a9a79 |  | medium | SOC2 | CI security-scan job (Brakeman SAST, bundle-audit, npm audit, gitleaks) is entirely non-blocking | `.github/workflows/ci.yml`:107 |
| LL-5954bcbbe6 |  | medium | SOC2 | Pre-existing Resque background-job failures: ImageMagick identify missing in Cloud Run image, stale job_stash lookups, and a call to a removed Board method | (attestation) |
| LL-5ff3b22093 |  | medium | WCAG | Legacy Bootstrap close button labeled only by a times glyph, no aria-label | `app/frontend/app/templates/board-details.hbs`:3 |
| LL-65700d9bd8 |  | medium | SOC2 | moment 2.29.4 is in maintenance-only mode (effectively abandoned) and locked below the latest 2.30 maintenance patch | `app/frontend/package.json`:71 |
| LL-6614b7c85a |  | medium | SOC2 | lodash 4.18.1 resolved in package-lock.json exceeds all known published 4.x releases (latest 4.17.21) | `app/frontend/package-lock.json`:22142 |
| LL-6f1977944f |  | medium | FERPA, HIPAA | ruby-saml has no minimum version constraint in Gemfile; SAML auth-bypass CVEs fixed in >= 1.17.0 | `Gemfile.lock`:490 |
| LL-70abe7d9a9 |  | medium | WCAG | Icon-only remove button named only by a non-i18n title attribute | `app/frontend/app/templates/share-board.hbs`:101 |
| LL-8fab55372e |  | medium | WCAG | Speak-bar remote-modeling (#reply_icon) button has no accessible name | `app/frontend/app/templates/application.hbs`:148 |
| LL-a46e5c6b69 |  | medium | SOC2 | braces 2.3.2 in npm tree is vulnerable to CVE-2024-4068 (ReDoS) | `app/frontend/package-lock.json`:8315 |
| LL-ab88513735 |  | medium |  | User model declares is_admin attribute but Rails JSON builder never emits it | `app/frontend/app/models/user.js`:40 |
| LL-b06f063f85 |  | medium | WCAG | Shared modal-dialog wrapper sets role=dialog/aria-modal but no accessible name | `app/frontend/app/templates/components/modal-dialog.hbs`:6 |
| LL-b5c30235d3 |  | medium | SOC2, HIPAA, FERPA | infra-auditor runtime/CLI evidence relies on instruction-only control against secret/PII leakage | `.claude/agents/infra-auditor.md`:31 |
| LL-caf2528468 |  | medium | GDPR, FERPA | UserExtra/UserLink profile-history caches are not invalidated when the source profile LogSession is deleted | `app/models/user_extra.rb`:58 |
| LL-e08bd45a9f |  | medium | WCAG | Sentence box / utterance bar vocalize control is an anchor with no button role or accessible name | `app/frontend/app/templates/application.hbs`:86 |
| LL-ed914bded3 |  | medium | WCAG | Raw low-contrast brand token used as text foreground (board-tile language pill) | `app/frontend/app/styles/app.scss`:193 |
| LL-1890f6a922 | P2-5 | medium | GDPR, FERPA | DataPolicyEnforcer retention only purges session log sessions | `lib/data_policy_enforcer.rb`:14 |
| LL-d35cbdb313 | P2-7 | medium | FERPA | User creation (incl. org start codes) generates no AuditEvent | `app/controllers/api/users_controller.rb`:244 |
| LL-310b464be4 | P2-8 | medium | FERPA | protected_image accepts user_token via URL parameter | `app/controllers/api/users_controller.rb`:871 |
| LL-2695434541 |  | low | SOC2 | Puma Gemfile constraint permits 7.2.0 which predates the CVE-2026-47736/47737 fix; floor unset | `Gemfile`:62 |
| LL-3483c28f3c |  | low | SOC2 | Parallel finders read live infra without synchronization (possible inconsistent snapshot) | `.claude/skills/audit-run/SKILL.md`:33 |
| LL-42a24ee911 |  | low | SOC2 | A diagnostic SES send to a personal Gmail address never arrived (inbox or spam); a same-account send to a Workspace-internal address arrived immediately | (attestation) |
| LL-45bdcc73c9 |  | low | SOC2 | Developer key expiration policy is undecided; DeveloperKey records never age out (item 3) | `lib/flusher.rb`:48 |
| LL-553fdc242b |  | low | SOC2 | davidshimjs-qrcodejs 0.0.2 is abandoned (no release since 2014, >10 years) | `app/frontend/package.json`:36 |
| LL-57e9beb87f |  | low | GDPR, FERPA | Flusher.flush_leftovers has no usage-based orphan check for orphaned ButtonImage/ButtonSound media records (item 1) | `lib/flusher.rb`:57 |
| LL-5a173ce87f |  | low |  | Utterance Rails builder emits created_at but Ember model declares timestamp instead | `app/frontend/app/models/utterance.js`:15 |
| LL-5d7197fa7d |  | low | HIPAA, FERPA | PaperTrail versions with unconstantizable item_type are detected but retention disposition is undecided | `lib/flusher.rb`:116 |
| LL-5f0f4f52f8 |  | low | SOC2 | Audit system files (.claude/) are not in any finder scan scope (no self-audit) | `.claude/agents/infra-auditor.md`:62 |
| LL-6447a21503 |  | low |  | Organization model declares total_extras attribute but Rails builder never emits it | `app/frontend/app/models/organization.js`:42 |
| LL-97f9001bb4 |  | low | SOC2 | Audit finder Bash guard is a denylist with residual fetch-and-exec bypass | `.claude/hooks/audit-readonly-guard.sh`:59 |
| LL-a2b45c2bcb |  | low | SOC2 | Finder agent-memory (memory: project) may carry process state across audit runs | `.claude/agents/infra-auditor.md`:7 |
| LL-b0bc6880e6 |  | low | SOC2 | sync-render-secrets.yml (holds RENDER_API_KEY + 1Password token) declares no permissions: block, inheriting default write GITHUB_TOKEN | `.github/workflows/sync-render-secrets.yml`:14 |
| LL-ba0585ab93 |  | low | SOC2, HIPAA, FERPA | Production Postgres uses sslmode=require (encrypt only), not verify-ca/verify-full | `config/database.yml`:26 |
| LL-e066ea6fa3 |  | low | SOC2 | http-proxy 1.18.1 (EOL, last release 2021) has CVE-2024-21943 (ReDoS via Host header); dev-only | `app/frontend/package.json`:64 |
| LL-e76d6378b5 |  | low |  | Webhook model declares notifications and content_type attrs that Rails never serializes | `app/frontend/app/models/webhook.js`:12 |
| LL-941001ca58 | Dep-eslint-8-eol | low | SOC2 | eslint 8.57.1 is EOL (v8 end-of-life); dev toolchain on an unsupported linter | `app/frontend/package.json`:64 |
| LL-a97357136e | P2-2 | low | SOC2 | params.permit! bypasses Strong Parameters | `app/controllers/api/organizations_controller.rb`:866 |
| LL-ce00c8d3ad | P2-3 | low |  | License model lacks Processable concern | `app/models/license.rb`:1 |

## Notes

- **Source of truth:** the git register. This page is a generated read-only summary; it
  carries no evidence snippets, no finding notes, and no student/patient data.
- **Closed / accepted / superseded findings** are intentionally omitted here; see
  `audit-reports/FINDINGS.md` for the full lifecycle.
- **Compliance Posture Report** (`docs/legal/COMPLIANCE_POSTURE_REPORT.md`) is **CEO-attested**
  (Scot Wahlquist, 2026-06-19); it is linked from this summary, never embedded. External
  distribution remains the CEO's decision at attestation time.
