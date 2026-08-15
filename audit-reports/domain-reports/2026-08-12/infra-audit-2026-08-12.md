# LingoLinq-AAC Infrastructure & Security (SOC2-style) Audit

**Run date:** 2026-08-12  |  **Finder:** `infra-auditor`  |  **Audited commit:** `d67ed76e0a16` (`scot/feat/code-hygiene-auditor`)

**Open findings in this domain:** 32  (0 CRITICAL · 6 HIGH · 12 MEDIUM · 14 LOW)

> DRAFT view of the findings register (`audit-reports/FINDINGS.json`), the single source of truth. Statuses are verified against live code at the audited commit. Only Scot closes a finding, downgrades severity, or accepts risk. Evidence is code/path only; no student or patient data appears here.

## HIGH (6)

### Production Cloud Run service is deployed with public ingress, so the direct run.app URL bypasses the load balancer and its attached Cloud Armor policy

- **ID:** `LL-0b5443f43b`  |  **ruleKey:** `cloudrun-ingress-all-bypasses-cloud-armor`  |  **confidence:** high
- **Location:** `scripts/gcp/phase5-frontend-lb.sh`:490
- **Frameworks:** SOC2, HIPAA
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- Live service shows ingress=all and allUsers bound to run.invoker; confirmed the run.app URL returns HTTP 200 directly, bypassing the Cloud Armor policy attached only to the LB backend.
- **Remediation:** Run the ingress lockdown that already exists in the repo (phase5-frontend-lb.sh step 3, gated behind CONFIRM_INGRESS_LOCKDOWN=1) so the web service only accepts traffic from the load balancer. The coupling documented at phase5-frontend-lb.sh:465-474 and deploy-cloudrun.yml:498-507 must be resolved in the SAME change or every subsequent deploy goes red fail-closed: the candidate health probe runs from a public GitHub runner against the candidate---* tag URL, and Cloud Run ingress restrictions apply to tag URLs too. Move that probe behind the LB (tag-targeted serverless NEG) or into the VPC first. Decide explicitly which flips first.

### Committed WIF provisioning script omits the assertion.ref branch lock the deploy pipeline names as a control, and reconciles (overwrites) the live provider on every re-run

- **ID:** `LL-1e7b568ef3`  |  **ruleKey:** `wif-provisioning-script-omits-ref-lock`  |  **confidence:** high
- **Location:** `scripts/gcp/phase1-setup.sh`:329
- **Frameworks:** SOC2, HIPAA
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- Live provider's attributeCondition includes the ref/ref_type lock; committed WIF_CONDITION at line 329 does not. Script unconditionally reconciles an existing provider via update-oidc, so a re-run would strip the live lock.
- **Remediation:** Add the ref lock to WIF_CONDITION in phase1-setup.sh so the committed script matches the hardened live provider: append `&& assertion.ref == 'refs/heads/main' && assertion.ref_type == 'branch'`. This matters specifically because the script does NOT skip an existing provider -- it deliberately reconciles it via `gcloud iam workload-identity-pools providers update-oidc` (phase1-setup.sh:333-337), so any re-run of Phase 1 silently REMOVES the branch lock from production. Also close the gap the script itself defers at phase1-setup.sh:492-495: map attribute.environment and bind the deploy SA principalSet to .../attribute.environment/production rather than repo-wide, so the GitHub environment approval becomes a token-minting condition rather than a workflow-file convention.

### No server-side password strength policy exists; the only minimum-length check is a 6-character Ember computed property, bypassable by a direct API call

- **ID:** `LL-5617f4e17d`  |  **ruleKey:** `password-policy-enforced-client-side-only`  |  **confidence:** high
- **Location:** `app/frontend/app/controllers/register.js`:217
- **Frameworks:** SOC2, HIPAA, FERPA
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- register.js:217 is the only length check anywhere; User model has zero validates declarations; api/v1/users#create is exempt from require_api_token. Rack::Attack throttles the endpoint but that is not a strength policy.
- **Remediation:** Enforce the password policy at the Rails layer, where the boundary actually is. Add validation in app/models/concerns/passwords.rb#generate_password (or a User validation) rejecting passwords below a documented minimum -- NIST SP 800-63B calls for at least 8 characters -- and apply it on every write path: registration (api/v1/users create), password change (app/models/user.rb:2542), password reset (users_controller#password_reset:949), valet password generation, and the org/subscription-driven set at app/models/concerns/subscription.rb:645. Consider a breached-password check against a k-anonymity list rather than composition rules, per the same NIST guidance. Then raise the client-side hint to match, so the UX and the boundary agree.

### Audited-console wrapper still shells to Heroku CLI; not operative on Render so console access is unaudited

- **ID:** `LL-7f7372e3eb`  |  **ruleKey:** `audit-console-targets-heroku-not-render`  |  **confidence:** high
- **Location:** `bin/audit_console`:7
- **Frameworks:** SOC2, HIPAA
- **First seen:** 2026-06-23  |  **Last seen:** 2026-06-23  |  **Disposition:** accepted
- **Remediation:** Rewrite bin/audit_console to attach to a Render service shell while still exporting USER_KEY so the Rails console records an AuditEvent per session, or replace it with a Render-native audited console path; until then, privileged console access on Render is not captured by this wrapper.

### GCP production project has no Data Access audit log configuration, so Secret Manager value reads and Cloud SQL data access produce no audit record

- **ID:** `LL-b7ccc522b9`  |  **ruleKey:** `gcp-data-access-audit-logs-disabled`  |  **confidence:** high
- **Location:** `scripts/gcp/phase1-setup.sh`:496
- **Frameworks:** SOC2, HIPAA, FERPA
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- gcloud projects get-iam-policy lingolinq-prod returns no auditConfigs key at all. Verified live 2026-08-13.
- **Remediation:** Set an IAM audit config on the production project enabling DATA_READ (and DATA_WRITE where cheap) for secretmanager.googleapis.com and cloudsql.googleapis.com, at minimum. Without it, secretmanager.versions.access -- the operation that returns a plaintext production secret -- is not logged at all, because Data Access logs are off by default and only Admin Activity logs are always-on. Pair with a log sink to a retention-controlled bucket so the evidence outlives the default Cloud Logging retention, and add the audit config to phase1-setup.sh so it is reproducible rather than a console click.

### Production GCP project grants a non-owner human principal project-wide secretmanager.admin, cloudsql.admin and iam.serviceAccountAdmin, contradicting the documented least-privilege design

- **ID:** `LL-c0b3d59f58`  |  **ruleKey:** `gcp-human-principal-holds-project-admin-over-secrets-and-prod-db`  |  **confidence:** high
- **Location:** `scripts/gcp/phase1-setup.sh`:251
- **Frameworks:** SOC2, HIPAA, FERPA
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- Live project IAM grants the roles cited to a non-owner human principal, directly contradicting the script's own documented least-privilege design (comments at lines 250-258). secretmanager.admin subsumes secretAccessor, so this is an inversion of the documented control, not mere drift.
- **Remediation:** Reconcile live project IAM against the design the committed script documents (phase1-setup.sh:243-258: run.developer, artifactregistry.writer, logging/monitoring/secretmanager VIEWER, cloudsql.client -- explicitly no secretAccessor and explicitly not cloudsql.admin). Replace standing secretmanager.admin with secretmanager.viewer plus per-secret secretAccessor only where a human genuinely needs a value, and replace cloudsql.admin with cloudsql.client. If broader access is genuinely required, make it break-glass: time-bound IAM conditions or a documented JIT elevation with an approval record, plus the Data Access audit logs from the companion finding so elevated use is observable. Confirm the workforce authorization and BAA/HIPAA paperwork for any human with standing access to PHI-bearing systems.

## MEDIUM (12)

### Production Cloud SQL instance accepts unencrypted connections (ssl mode allows unencrypted) and is provisioned with no SSL enforcement flag

- **ID:** `LL-0d54bcb32c`  |  **ruleKey:** `cloudsql-server-side-ssl-not-required`  |  **confidence:** high
- **Location:** `scripts/gcp/phase3-data-layer.sh`:252
- **Frameworks:** SOC2, HIPAA
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- Live sslMode=ALLOW_UNENCRYPTED_AND_ENCRYPTED, requireSsl=False; no SSL flag in the provisioning script. Partial mitigation: instance is private-IP-only with no authorizedNetworks, so exposure requires an in-VPC foothold.
- **Remediation:** Set the instance SSL mode to encrypted-only (gcloud sql instances patch --ssl-mode=ENCRYPTED_ONLY) and add the equivalent flag to the create call in phase3-data-layer.sh so the posture is reproducible. The app path is unaffected: Cloud Run reaches the instance over the Cloud SQL connector socket, which is encrypted independently of the client sslmode value. What the change closes is every OTHER path -- any client reaching the private IP from inside the VPC (a bastion, a future workload, a hand-run psql) can currently negotiate a plaintext session carrying PHI.

### Render blueprint auto-deploys web/worker on every push to staging without requiring CI to pass

- **ID:** `LL-107c9fb665`  |  **ruleKey:** `render-autodeploy-not-gated-on-ci`  |  **confidence:** medium
- **Location:** `render.yaml`:6
- **Frameworks:** SOC2
- **First seen:** 2026-07-08  |  **Last seen:** 2026-07-08  |  **Disposition:** untriaged
- **Adversary:** confirmed -- render.yaml has no autoDeployTrigger/autoDeploy field (web:6, worker:59 both branch:staging); Render default when absent is commit (deploy every push). The opt-in gate autoDeployTrigger:checksPass exists in the blueprint spec but is unused. Field-name uncertainty resolved: correct field is autoDeployTrigger.
- **Remediation:** The web and worker services track branch: staging with no auto-deploy gate, so Render deploys the branch tip on every push independently of the GitHub Actions CI result (ci.yml rspec, build-and-test, secret-detection). A red build or a commit failing the blocking secret-detection gate can still ship. Set the blueprint auto-deploy trigger to deploy only after checks pass (Render autoDeployTrigger, or the dashboard 'Auto-Deploy: After CI Checks Pass'), and/or add branch protection with required status checks on staging. Confirm the live Render auto-deploy setting.

### Failed authentication attempts produce no AuditEvent and no security log line, so credential-stuffing and password-guessing are undetectable after the fact

- **ID:** `LL-1e8abb7d59`  |  **ruleKey:** `failed-authentication-attempts-not-logged`  |  **confidence:** high
- **Location:** `app/controllers/session_controller.rb`:568
- **Frameworks:** SOC2, HIPAA, FERPA
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- Lines 566/568/572 emit no logger call and no AuditEvent; repo-wide AuditEvent grep has no session_controller.rb hit at all, so even the success path lacks an AuditEvent (only a log line).
- **Remediation:** Emit a structured record on every authentication outcome, not just the success path. Successful logins already log one line (session_controller.rb:552) but no AuditEvent; failures log nothing at all. Write an AuditEvent (event_type 'login_failed' / 'login_succeeded') or at minimum a tagged Rails.logger line carrying only non-identifying fields -- global_id when the account resolved, a truncated/hashed source-IP bucket, device_key, and the failure reason -- never the submitted username or password. Cover the sibling credential-checking endpoints too: users_controller#resend_parental_consent:831, #submit_parental_consent_email:876, :1150, and the oauth/SAML paths. Then alert on rate and on distribution across accounts.

### The blocking secret-detection gate downloads and executes an unpinned, unverified gitleaks binary resolved at runtime from the GitHub releases API

- **ID:** `LL-33d756b764`  |  **ruleKey:** `unpinned-unverified-gitleaks-binary-in-blocking-gate`  |  **confidence:** high
- **Location:** `.github/workflows/ci.yml`:266
- **Frameworks:** SOC2
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- ci.yml:253-270 overwrites the pinned URL with the GitHub releases API result, no checksum verification. Confirmed secret-detection is a required branch-protection context on staging, so this runs inside a blocking gate.
- **Remediation:** Use the pinned version as the primary path rather than the fallback, and verify integrity before execution: keep GITLEAKS_VERSION as the source of truth, download only that asset, and check the archive against a committed SHA-256 (or verify the release signature) before extracting and running it. If tracking the latest release is a deliberate goal, do it with a scheduled bump PR that updates the pin and the checksum together, so the change is reviewed rather than silently applied on the next CI run. Pair with the top-level permissions block already tracked as LL-5ae3d7ca2c so the executed binary does not inherit a repo-default read-write GITHUB_TOKEN.

### CI security-scan job (Brakeman SAST, bundle-audit, npm audit, gitleaks) is entirely non-blocking

- **ID:** `LL-52ff2a9a79`  |  **ruleKey:** `ci-security-gates-non-blocking`  |  **confidence:** high
- **Location:** `.github/workflows/ci.yml`:107
- **Frameworks:** SOC2
- **First seen:** 2026-06-14  |  **Last seen:** 2026-06-14  |  **Disposition:** accepted
- **Remediation:** The whole security-scan job is continue-on-error: true (ci.yml:107), and every tool inside also soft-passes (Brakeman '|| true', npm audit '|| true', gitleaks '--exit-code 1 || true'). SAST, dependency-CVE, and secret-detection can never fail a PR, so a regression or a committed secret merges green. Make at least gitleaks secret-detection and high-severity bundle-audit/Brakeman blocking on PRs to staging/main; pair with branch protection requiring the gate.

### Brute-force protection on login is per-source-IP only at roughly 400 attempts/minute, with no per-account lockout, backoff, or velocity control

- **ID:** `LL-69a7f62551`  |  **ruleKey:** `no-per-account-lockout-or-velocity-control`  |  **confidence:** medium
- **Location:** `config/initializers/throttling.rb`:6
- **Frameworks:** SOC2, HIPAA, FERPA
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- Single throttle keyed on req.ip only; no lockout/failed_attempts counters anywhere in app/lib/config. Bonus: period_proc is a dead ternary (both branches return 3.seconds), so protected paths get no tighter window than general traffic.
- **Remediation:** Add an account-keyed control alongside the existing IP-keyed one: a Rack::Attack throttle discriminated on the normalized username for /token, oauth2/token/login and the SAML/consent credential endpoints, plus exponential backoff or a temporary lock after N consecutive failures on one account (a pattern the codebase already uses elsewhere -- see the per-user Redis throttle at users_controller.rb:840-850). Pair it with the failed-auth logging finding so the lock is observable. Separately, verify empirically what Rack::Attack's req.ip resolves to behind the Cloud Run load balancer before tuning any IP-keyed limit.

### No scheduled reconciler detects Cloud Run configuration drift introduced outside the deploy workflow, the exact path that once silently disabled the Bedrock BAA account assertion

- **ID:** `LL-7181a16033`  |  **ruleKey:** `cloudrun-runtime-config-drift-no-reconciler`  |  **confidence:** high
- **Location:** `.github/workflows/deploy-cloudrun.yml`:270
- **Frameworks:** SOC2, HIPAA
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- assert-runtime-secrets.sh is referenced exactly once repo-wide (the deploy workflow itself); none of the repo's four scheduled workflows invoke it. Line 270 is the workflow's own comment admitting the gap.
- **Remediation:** Run scripts/gcp/assert-runtime-secrets.sh on a schedule (a cron workflow, or Cloud Scheduler invoking a job) against the currently-serving revision, not only as the last step of a deploy. It already takes --required and --required-literal and already reads back the live revision, so the reconciler is mostly a trigger away. Alert on failure to a channel someone watches, and consider adding an org policy or IAM condition that discourages hand-run gcloud run deploy against the production service so the CI path is the only one that materially changes it.

### The admin_token cookie that gates the Resque admin console is set without HttpOnly, so any XSS can steal an admin console session

- **ID:** `LL-7296ada5da`  |  **ruleKey:** `admin-console-cookie-not-httponly`  |  **confidence:** high
- **Location:** `app/controllers/session_controller.rb`:250
- **Frameworks:** SOC2, HIPAA, FERPA
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- Line 250 sets a bare cookie value with no options hash, unlike session_store.rb's app cookie. force_ssl already adds `secure` in production, so the residual gap is specifically httponly and same_site.
- **Remediation:** Set the cookie with explicit security attributes, matching what config/initializers/session_store.rb:6-10 already does for the app session cookie: cookies[:admin_token] = { value: admin_token, httponly: true, secure: Rails.env.production?, same_site: :lax, expires: 2.hours.from_now }. Consider also scoping path: '/jobby' so the token is not attached to every request to the app, and shortening the 2-hour Redis TTL for an admin console session.

### infra-auditor runtime/CLI evidence relies on instruction-only control against secret/PII leakage

- **ID:** `LL-b5c30235d3`  |  **ruleKey:** `infra-auditor-runtime-evidence-secret-leak`  |  **confidence:** medium
- **Location:** `.claude/agents/infra-auditor.md`:31
- **Frameworks:** SOC2, HIPAA, FERPA
- **First seen:** 2026-06-13  |  **Last seen:** 2026-06-13  |  **Disposition:** accepted
- **Remediation:** Free-text runtime/CLI evidence snippets could carry secret values or PII; today this is enforced only by agent instruction and citation-check skips runtime evidence. Phase 3: schema-restrict or scrub runtime snippets; add a check that rejects secret-shaped strings in findings.

### lingolinq_admin site-admin account carries a simple, memorable seeded password (deliberate for pre-cutover hands-on testing); must be rotated, disabled, or replaced with a break-glass admin procedure before the GCP environment is customer-facing

- **ID:** `LL-caaf8e20ec`  |  **ruleKey:** `seeded-admin-credential-weak-prod`  |  **confidence:** high
- **Location:** runtime: `GCP cutover two-gate decision (2026-07-16), Gate 2 (customer-facing/onboarding). db/seeds.rb sets the lingolinq_admin account from the SEED_ADMIN_PASSWORD env via the seed_password helper (dev default is weak). The live prod/rehearsal account was given a deliberately simple, memorable value for multi-device hands-on testing before cutover (Scot's call, 2026-07-03), acceptable only because the current prod DB holds no real user data (PR #483, project_prod_no_real_users). It has NOT been rotated. lingolinq_admin is a live site-admin on the live prod app path, which is why this is tracked as operational security rather than ordinary housekeeping.`
- **Frameworks:** SOC2
- **First seen:** 2026-07-16  |  **Last seen:** 2026-07-16  |  **Disposition:** untriaged
- **Remediation:** Before onboarding any real district/clinic to the GCP environment: (1) rotate lingolinq_admin to a strong secret stored ONLY in 1Password 'LingoLinq Prod' (never write the value into any repo file), OR (2) disable/delete the account, OR (3) replace the standing shared admin with an explicit break-glass admin procedure (short-lived, audited elevation). Not a DNS-cut blocker; blocks treating the environment as customer-ready.

### Masquerade shows no on-screen indication of whose account is being operated

- **ID:** `LL-cde54765c6`  |  **ruleKey:** `masquerade-no-operator-indicator`  |  **confidence:** high
- **Location:** `app/controllers/application_controller.rb`:182
- **Frameworks:** FERPA, HIPAA, SOC2
- **First seen:** 2026-08-04  |  **Last seen:** 2026-08-04  |  **Disposition:** untriaged
- **Remediation:** Cheapest path (template only, no server change): render the already-stashed operator identity beside the existing Stop Masquerading controls. session.original_user_name is set at masquerade start (app/frontend/app/components/masquerade.js:61, app/frontend/app/controllers/organization.js:48), restored at app/frontend/app/services/session.js:510, and already read by the isMasquerading computed at app/frontend/app/controllers/application.js:52,56 with a stash fallback at :62. Option 2, only if the server must be authoritative: serialize the acting operator via lib/json_api. Scope of @true_user (set at app/controllers/application_controller.rb:182,196): the private_logging checks in app/controllers/api/logs_controller.rb, the PaperTrail whodunnit at :185/:199, and the authorization plus audit-attribution actor in app/controllers/concerns/api/schema_explorer.rb:90,103 and app/controllers/concerns/api/system_settings_access.rb:7. It never reaches lib/json_api. PR #714 (staging, 2026-07-30) added persistent Stop Masquerading controls (app/frontend/app/components/app-navbar-authenticated-inner.hbs:64,183,211; app/frontend/app/templates/application.hbs:928,1276,1304), which signal THAT a masquerade is active but not WHOSE record is open.

### Production Cloud SQL instance has deletion protection disabled and is provisioned without it, while automated deploys apply migrations with no pre-migration backup step

- **ID:** `LL-d3f41e7a67`  |  **ruleKey:** `cloudsql-prod-no-deletion-protection`  |  **confidence:** high
- **Location:** `scripts/gcp/phase3-data-layer.sh`:255
- **Frameworks:** SOC2, HIPAA, FERPA
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- Live instance reports deletionProtectionEnabled=False; create-flag list has no --deletion-protection. PITR + 7 retained backups exist, so this is recoverability-degrading rather than data-destroying.
- **Remediation:** Add --deletion-protection to the gcloud sql instances create call in phase3-data-layer.sh (the flag list at :241-255 ends without it) and enable it on the live instance. Consider also raising retained-backups above the 7-day default given FERPA/HIPAA restoration expectations, and adding an on-demand backup step to deploy-cloudrun.yml immediately before the migration Job -- the pipeline currently runs rake db:migrate against production with no snapshot taken in the same run (deploy-cloudrun.yml:417-457), so PITR is the only recovery path for a bad migration. The cutover runbook already carries this as an unchecked box (scripts/gcp/PHASE5-CUTOVER-RUNBOOK.md:45).

## LOW (14)

### Parallel finders read live infra without synchronization (possible inconsistent snapshot)

- **ID:** `LL-3483c28f3c`  |  **ruleKey:** `audit-run-parallel-finder-race`  |  **confidence:** medium
- **Location:** `.claude/skills/audit-run/SKILL.md`:33
- **Frameworks:** SOC2
- **First seen:** 2026-06-13  |  **Last seen:** 2026-06-13  |  **Disposition:** wontfix
- **Remediation:** Concurrent finders reading live Render/AWS/GCP state may observe a moving target. Phase 3/4: snapshot live infra once in the orchestrator and pass it to finders, or stamp a single read window.

### Sentry release tagging reads a Render-only environment variable, so production error events on Cloud Run carry no release attribution

- **ID:** `LL-40f3571b19`  |  **ruleKey:** `sentry-release-tag-render-only-after-gcp-cutover`  |  **confidence:** high
- **Location:** `config/initializers/sentry.rb`:367
- **Frameworks:** SOC2
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- Checked the live serving revision's env vars directly: neither RENDER_GIT_COMMIT nor SENTRY_RELEASE is present. .dockerignore excludes .git so the SDK's own git fallback can't fire either.
- **Remediation:** Fall back to a Cloud Run identifier the way config/initializers/resque.rb:130-135 already does for the cache token: prefer an explicit release/commit variable, then ENV['K_REVISION'] (Cloud Run injects it), then RENDER_GIT_COMMIT for the frozen fallback environment. Better still, pass the deployed image's git SHA as an env var from deploy-cloudrun.yml (github.sha is already the image tag) so the Sentry release maps directly to a commit rather than to a revision name.

### Developer key expiration policy is undecided; DeveloperKey records never age out (item 3)

- **ID:** `LL-45bdcc73c9`  |  **ruleKey:** `developer-key-expiry-policy-undecided`  |  **confidence:** medium
- **Location:** `lib/flusher.rb`:48
- **Frameworks:** SOC2
- **First seen:** 2026-07-04  |  **Last seen:** 2026-07-04  |  **Disposition:** untriaged
- **Remediation:** DeveloperKey has no expires_at column, settings-based expiry, or expired? method anywhere in the codebase today; it is a permanent OAuth client registration. Before writing any deletion/expiry logic, decide as a product/security question whether developer keys should expire at all (and on what basis - inactivity, fixed TTL, manual revocation only), since inventing an unreviewed criterion risked destroying live client credentials and was deliberately avoided in PR #514.

### ci.yml declares no top-level permissions block; GITHUB_TOKEN inherits repo-default scope for all jobs (incl. one running downloaded gitleaks)

- **ID:** `LL-5ae3d7ca2c`  |  **ruleKey:** `ci-workflow-no-permissions-block`  |  **confidence:** high
- **Location:** `.github/workflows/ci.yml`:1
- **Frameworks:** SOC2
- **First seen:** 2026-07-08  |  **Last seen:** 2026-07-08  |  **Disposition:** untriaged
- **Adversary:** confirmed -- zero occurrences of permissions: in ci.yml, neither top-level nor per-job across all five jobs; GITHUB_TOKEN inherits repo-default scope on every push/PR.
- **Remediation:** ci.yml (runs on push and pull_request, including a secret-detection job that curls+executes the gitleaks binary using github.token) has no permissions: block, so the workflow GITHUB_TOKEN takes the repository default, which may be read-write. Add a top-level permissions: contents: read and grant per-job elevations only where needed (mirroring deploy-cloudrun.yml, which already sets contents: read). Set the org/repo default workflow token to read-only.

### Audit system files (.claude/) are not in any finder scan scope (no self-audit)

- **ID:** `LL-5f0f4f52f8`  |  **ruleKey:** `audit-system-not-self-audited`  |  **confidence:** high
- **Location:** `.claude/agents/infra-auditor.md`:62
- **Frameworks:** SOC2
- **First seen:** 2026-06-13  |  **Last seen:** 2026-06-13  |  **Disposition:** accepted
- **Remediation:** The finder scan scopes cover app code/config/infra but not the audit system itself (.claude/agents, .claude/skills, .claude/hooks). Phase 3: add a meta-audit pass so the audit system is reviewed by its own discipline.

### eslint 8.57.1 is EOL (v8 end-of-life); dev toolchain on an unsupported linter

- **ID:** `LL-941001ca58`  |  **ruleKey:** `eol-eslint-8x`  |  **confidence:** high
- **Location:** `app/frontend/package.json`:64
- **Frameworks:** SOC2
- **First seen:** 2026-06-21  |  **Last seen:** 2026-06-21  |  **Disposition:** accepted
- **Remediation:** Upgrade to eslint 9 (flat config). Entangled with the broader Ember 3.28 toolchain modernization, so not a standalone bump; dev-toolchain only (not shipped to users).

### Audit finder Bash guard is a denylist with residual fetch-and-exec bypass

- **ID:** `LL-97f9001bb4`  |  **ruleKey:** `audit-guard-denylist-residual-bypass`  |  **confidence:** high
- **Location:** `.claude/hooks/audit-readonly-guard.sh`:59
- **Frameworks:** SOC2
- **First seen:** 2026-06-13  |  **Last seen:** 2026-06-13  |  **Disposition:** wontfix
- **Remediation:** Primary read-only control is the no-Edit/Write tools allowlist; the Bash denylist is defense-in-depth and now blocks pipe-to-shell/eval. A determined novel obfuscation can still slip through. Phase 3: consider an allowlist-based command filter or a sandboxed finder shell.

### Finder agent-memory (memory: project) may carry process state across audit runs

- **ID:** `LL-a2b45c2bcb`  |  **ruleKey:** `finder-agent-memory-cross-run-state`  |  **confidence:** medium
- **Location:** `.claude/agents/infra-auditor.md`:7
- **Frameworks:** SOC2
- **First seen:** 2026-06-13  |  **Last seen:** 2026-06-13  |  **Disposition:** accepted
- **Remediation:** memory: project persists across invocations; confirm it holds process knowledge only (never findings/PII/snippets). Phase 3: document the memory policy, consider memory: local or a periodic reset.

### params.permit! bypasses Strong Parameters

- **ID:** `LL-a97357136e`  |  **ruleKey:** `widespread-permit-bang`  |  **confidence:** high
- **Location:** `app/controllers/api/organizations_controller.rb`:866
- **Frameworks:** SOC2
- **First seen:** 2026-04-09  |  **Last seen:** 2026-06-12  |  **Disposition:** wontfix
- **Remediation:** Migrate call sites to explicit permit(:fields) in new code; do not refactor working code wholesale (April guidance).

### Prod SES mail has no custom MAIL FROM domain, so SPF does not align with the From: domain and DMARC rests on DKIM alone; no Authentication-Results headers have ever been captured to confirm the SPF/DKIM/DMARC result on a delivered message

- **ID:** `LL-abd6c88733`  |  **ruleKey:** `ses-spf-alignment-header-capture-unverified`  |  **confidence:** high
- **Location:** runtime: `GCP cutover Gate 1 rehearsal (2026-07-19/20), Rehearsal step 3. A prod SES send via config set 'lingolinq-transactional' was ACCEPTED by SES and manual inbox receipt was confirmed, which closed the earlier delivery question (LL-42a24ee911, verified-closed). Two things that decision did NOT establish remain open: (a) the Authentication-Results headers on a delivered message were never captured, so the actual SPF/DKIM/DMARC evaluation result is unverified; (b) no custom MAIL FROM domain is configured, so the SPF-checked domain is the Amazon SES bounce domain rather than the From: domain, leaving SPF unaligned under DMARC and DKIM as the sole passing alignment mechanism. Verification was blocked in-session by a tooling mismatch, not a delivery failure: the mailtest targets the operator's personal mailbox while the available Gmail connector is authenticated as a Workspace user, so headers could not be read from that session.`
- **Frameworks:** SOC2
- **First seen:** 2026-07-20  |  **Last seen:** 2026-07-20  |  **Disposition:** untriaged
- **Remediation:** Before relying on prod SES for customer-facing transactional mail or alerting: (1) capture the Authentication-Results header from a delivered prod message and record the spf=/dkim=/dmarc= results as closure evidence -- read it from a mailbox the available connector can authenticate against, or via an SES configuration-set event destination (SNS / Firehose / EventBridge) rather than aggregate CloudWatch metrics; AND (2) configure a custom MAIL FROM subdomain on the SES identity with the required MX and SPF records so SPF aligns with the From: domain and DMARC no longer depends on DKIM alone. Not a Gate 1 DNS-cut blocker (accepted for Gate 1 by Scot, 2026-07-19); blocks treating prod mail as customer-ready.

### Production Postgres uses sslmode=require (encrypt only), not verify-ca/verify-full

- **ID:** `LL-ba0585ab93`  |  **ruleKey:** `db-ssl-require-no-cert-verify`  |  **confidence:** high
- **Location:** `config/database.yml`:26
- **Frameworks:** SOC2, HIPAA, FERPA
- **First seen:** 2026-06-14  |  **Last seen:** 2026-06-14  |  **Disposition:** accepted
- **Remediation:** sslmode=require encrypts but does NOT validate the server certificate/hostname, so it does not defend against an active MITM. For PHI/FERPA in transit, move to sslmode=verify-full (or verify-ca) with the provider CA bundle once the GCP Cloud SQL cutover lands (Cloud SQL connector over VPC already gives a verified path), reconciling with the migration rather than fixing Render twice. Until cutover, set verify-full against Render's Postgres CA if available, else accept-risk with a dated note.

### Content-Security-Policy is report-only (nothing blocked) and script-src permits unsafe-inline + unsafe-eval

- **ID:** `LL-c226391436`  |  **ruleKey:** `csp-report-only-unsafe-inline-eval`  |  **confidence:** high
- **Location:** `config/initializers/content_security_policy.rb`:114
- **Frameworks:** SOC2
- **First seen:** 2026-07-08  |  **Last seen:** 2026-07-08  |  **Disposition:** untriaged
- **Adversary:** confirmed -- content_security_policy_report_only=true is unconditional (no env guard); script_src includes :unsafe_inline (line 42) and :unsafe_eval (line 43); no separate enforced CSP header exists in config/ or app/.
- **Remediation:** The CSP is emitted as Content-Security-Policy-Report-Only, so no directive is enforced; script-src also includes unsafe_inline and unsafe_eval (lines 41-43). Documented as a deliberate phased rollout (docs/security/csp-rollout-plan.md) pending per-request nonces for the Ember 3.28 bootstrap. Track to completion: after the clean-report window, flip report_only to false and replace unsafe-inline/unsafe-eval with per-request nonces. Until then CSP provides no active control.

### The Notion sync workflows declare no permissions block, so jobs holding a third-party Notion API token inherit the repository-default GITHUB_TOKEN scope

- **ID:** `LL-dbdcfb466c`  |  **ruleKey:** `ci-workflow-no-permissions-block`  |  **confidence:** high
- **Location:** `.github/workflows/sync-findings-to-notion.yml`:31
- **Frameworks:** SOC2
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- Confirmed no permissions: block in either Notion sync workflow while 6 other workflows in the repo do declare one. Impact is capped by the repo's default_workflow_permissions already being read-only, so this is defense-in-depth, not a live gap today.
- **Remediation:** Add permissions: contents: read at the top of both sync-findings-to-notion.yml and sync-document-register-to-notion.yml (neither needs any write scope -- each only checks out the repo and POSTs to Notion), and set the repository/organization default workflow token permission to read-only so an omitted block fails safe. deploy-cloudrun.yml:144 and sync-render-secrets.yml already model the correct pattern.

### Finder agents are given a project-memory write policy they cannot execute, because the read-only toolset and the PreToolUse guard both block the write

- **ID:** `LL-e14ca0ff04`  |  **ruleKey:** `finder-agent-memory-policy-unimplementable`  |  **confidence:** high
- **Location:** `.claude/agents/infra-auditor.md`:4
- **Frameworks:** SOC2
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- Verified the guard denies Edit/Write/NotebookEdit/MultiEdit unconditionally and also blocks Bash write-escape patterns. Same dead memory declaration exists in all six finder agents (accessibility, api, code-hygiene, dependency, ember-upgrade, privacy), not just infra.
- **Remediation:** Pick one and make the config say it. Either (a) drop memory: project and the memory-policy section from the read-only finder agents, since a finder that cannot write cannot maintain a map -- and the map is better maintained as a committed doc reviewed like any other file; or (b) if the process map is genuinely wanted, have the orchestrator (which is not read-only) write it after the fan-out, from the finder's returned output, so exactly one trusted writer owns it. Option (b) also removes the trust question of a finder writing state that a later finder reads.


---
_Generated from the register at `d67ed76e0a161b594fbffa519ab428d0f9b7780b`. Regenerate with `ruby scripts/render-domain-reports.rb`. Do not edit by hand._
