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

### Compliance finding (details withheld until remediation is verified)

- **ID:** `LL-c0b3d59f58`  |  **ruleKey:** `minimized-finding-ll-c0b3d59f58`
- **Current status:** see `audit-reports/FINDINGS.json`.
- **Amended 2026-11-05:** this section was replaced with a pointer under the security disclosure policy (Scot Wahlquist). The rest of this report is as generated on 2026-08-12.

## MEDIUM (12)

### Compliance finding (details withheld until remediation is verified)

- **ID:** `LL-0d54bcb32c`  |  **ruleKey:** `minimized-finding-ll-0d54bcb32c`
- **Current status:** see `audit-reports/FINDINGS.json`.
- **Amended 2026-11-05:** this section was replaced with a pointer under the security disclosure policy (Scot Wahlquist). The rest of this report is as generated on 2026-08-12.

### Render blueprint auto-deploys web/worker on every push to staging without requiring CI to pass

- **ID:** `LL-107c9fb665`  |  **ruleKey:** `render-autodeploy-not-gated-on-ci`  |  **confidence:** medium
- **Location:** `render.yaml`:6
- **Frameworks:** SOC2
- **First seen:** 2026-07-08  |  **Last seen:** 2026-07-08  |  **Disposition:** untriaged
- **Adversary:** confirmed -- render.yaml has no autoDeployTrigger/autoDeploy field (web:6, worker:59 both branch:staging); Render default when absent is commit (deploy every push). The opt-in gate autoDeployTrigger:checksPass exists in the blueprint spec but is unused. Field-name uncertainty resolved: correct field is autoDeployTrigger.
- **Remediation:** The web and worker services track branch: staging with no auto-deploy gate, so Render deploys the branch tip on every push independently of the GitHub Actions CI result (ci.yml rspec, build-and-test, secret-detection). A red build or a commit failing the blocking secret-detection gate can still ship. Set the blueprint auto-deploy trigger to deploy only after checks pass (Render autoDeployTrigger, or the dashboard 'Auto-Deploy: After CI Checks Pass'), and/or add branch protection with required status checks on staging. Confirm the live Render auto-deploy setting.

### Compliance finding (details withheld until remediation is verified)

- **ID:** `LL-1e8abb7d59`  |  **ruleKey:** `minimized-finding-ll-1e8abb7d59`
- **Current status:** see `audit-reports/FINDINGS.json`.
- **Amended 2026-11-05:** this section was replaced with a pointer under the security disclosure policy (Scot Wahlquist). The rest of this report is as generated on 2026-08-12.

### Compliance finding (details withheld until remediation is verified)

- **ID:** `LL-33d756b764`  |  **ruleKey:** `minimized-finding-ll-33d756b764`
- **Current status:** see `audit-reports/FINDINGS.json`.
- **Amended 2026-11-05:** this section was replaced with a pointer under the security disclosure policy (Scot Wahlquist). The rest of this report is as generated on 2026-08-12.

### CI security-scan job: the Brakeman and npm audit steps are advisory, and security-scan is not a required check on develop

- **ID:** `LL-52ff2a9a79`  |  **ruleKey:** `ci-security-gates-non-blocking`
- **Current status:** see `audit-reports/FINDINGS.json`.
- **Amended 2026-11-06:** this section was replaced with a pointer after Scot re-scoped the row on 2026-11-05 (Scot Wahlquist). The rest of this report is as generated on 2026-08-12.

### Compliance finding (details withheld until remediation is verified)

- **ID:** `LL-69a7f62551`  |  **ruleKey:** `minimized-finding-ll-69a7f62551`
- **Current status:** see `audit-reports/FINDINGS.json`.
- **Amended 2026-11-05:** this section was replaced with a pointer under the security disclosure policy (Scot Wahlquist). The rest of this report is as generated on 2026-08-12.

### Compliance finding (details withheld until remediation is verified)

- **ID:** `LL-7181a16033`  |  **ruleKey:** `minimized-finding-ll-7181a16033`
- **Current status:** see `audit-reports/FINDINGS.json`.
- **Amended 2026-11-05:** this section was replaced with a pointer under the security disclosure policy (Scot Wahlquist). The rest of this report is as generated on 2026-08-12.

### Compliance finding (details withheld until remediation is verified)

- **ID:** `LL-7296ada5da`  |  **ruleKey:** `minimized-finding-ll-7296ada5da`
- **Current status:** see `audit-reports/FINDINGS.json`.
- **Amended 2026-11-05:** this section was replaced with a pointer under the security disclosure policy (Scot Wahlquist). The rest of this report is as generated on 2026-08-12.

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

### Compliance finding (details withheld until remediation is verified)

- **ID:** `LL-d3f41e7a67`  |  **ruleKey:** `minimized-finding-ll-d3f41e7a67`
- **Current status:** see `audit-reports/FINDINGS.json`.
- **Amended 2026-11-05:** this section was replaced with a pointer under the security disclosure policy (Scot Wahlquist). The rest of this report is as generated on 2026-08-12.

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

### ci.yml declares no top-level permissions block; GITHUB_TOKEN inherits repo-default scope for all jobs

- **ID:** `LL-5ae3d7ca2c`  |  **ruleKey:** `ci-workflow-no-permissions-block`
- **Current status:** see `audit-reports/FINDINGS.json`.
- **Amended 2026-11-06:** this section was replaced with a pointer under rule 4 (Scot Wahlquist). The rest of this report is as generated on 2026-08-12.

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

### Compliance finding (details withheld until remediation is verified)

- **ID:** `LL-97f9001bb4`  |  **ruleKey:** `minimized-finding-ll-97f9001bb4`
- **Current status:** see `audit-reports/FINDINGS.json`.
- **Amended 2026-11-05:** this section was replaced with a pointer under the security disclosure policy (Scot Wahlquist). The rest of this report is as generated on 2026-08-12.

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

### Compliance finding (details withheld until remediation is verified)

- **ID:** `LL-c226391436`  |  **ruleKey:** `minimized-finding-ll-c226391436`
- **Current status:** see `audit-reports/FINDINGS.json`.
- **Amended 2026-11-05:** this section was replaced with a pointer under the security disclosure policy (Scot Wahlquist). The rest of this report is as generated on 2026-08-12.

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


## Remediated (awaiting verification) (4)

Forward-fix applied and independently re-inspected, but not yet independently verified/closed -- still requires Scot's sign-off to close. If a residual is recorded in `closureEvidence.verifierNote`, this finding is NOT fully resolved.

### A Redis RDB persistence snapshot was tracked in git and shipped in every production container image for ~6 months; removed from HEAD (2026-08-14) but the blob remains fully retrievable from public git history at ced829ba1 on both staging and main

- **ID:** `LL-6af580a23a`  |  **ruleKey:** `redis-rdb-snapshot-committed-to-repository`  |  **severity:** high
- **Location:** runtime: `bash:git ls-files / git log / redis-server (isolated scratch instance, localhost-only) -- TTL-indifferent re-inspection 2026-08-16, correcting the 2026-08-14 pass`
- **Residual:** Residual, accepted 2026-08-17 (Scot), not remediated: dump.rdb (blob 4c38846c751ebed1ef1c8095aaa9682af47783d3) remains fully retrievable from public git history at commit ced829ba1 (2026-01-30), which is an ancestor of both origin/staging and origin/main in a PUBLIC GitHub repo (verified 2026-08-16 via `git merge-base --is-ancestor` and `gh repo view --json visibility`). git rm --cached only stops future commits from tracking it; it does not remove it from history. This will not change going forward -- a history rewrite was considered and explicitly declined. 'remediated-unverified' describes the forward-fix (ignored going forward) and the content inspection (confirmed clean); it does NOT describe the historical exposure, which is now a permanently accepted risk rather than a pending item. Kept at status 'remediated-unverified' / severity 'high' rather than moved to 'accepted-risk' or closed, so the residual stays visible in the register rather than disappearing -- that was the specific recommendation Scot ratified, not a status change.

### BoardDownstreamButtonSet S3 writes fail against KMS-encrypted bucket: 'Requests specifying Server Side Encryption with AWS KMS managed keys require AWS Signature Version 4'

- **ID:** `LL-705b10bcd7`  |  **ruleKey:** `s3-sigv4-required-kms-sse-boarddownstream`  |  **severity:** high
- **Location:** runtime: `Resque::Failure diagnostics via a throwaway lingolinq-diagcheck2 Cloud Run Job (rails runner, cloned from lingolinq-web's image/SA/VPC/Cloud SQL/secrets), 2026-07-03`
- **Residual:** Code-remediated on scot/fix/worker-pool-oom-sigv4: Uploader.remote_upload_params (lib/uploader.rb:293-336, formerly hand-signed SigV2) rewritten to build an Aws::S3::PresignedPost(credentials, region, bucket_name, key:, content_type:, content_length_range:, success_action_status:, acl:) directly, producing an AWS4-HMAC-SHA256-signed POST policy (x-amz-credential/x-amz-algorithm/x-amz-date/x-amz-signature fields) that satisfies SSE-KMS buckets' SigV4 requirement, exactly matching the remediation option's guidance (Aws::S3::PresignedPost, not the nonexistent Presigner#presigned_post). Codex review of this PR (#521) caught a follow-on regression in the first pass (commit 77233fb19): returning the PresignedPost's own regional endpoint as upload_url broke every consumer that pattern-matches a stored self.url against the static global s3.amazonaws.com form (valid_import_bundle_url?, removable_remote_url?, fronted_url, remote_remove, and every *_controller.rb upload_success action). Fixed in afe03d2de: remote_upload_params now returns both upload_url (unchanged canonical global form, for URL construction/matching) and a new post_url (the regional SigV4 POST target); the three Typhoeus.post call sites and two frontend POST targets (content-grabbers.js, beta-feedback-form.js, with a post_url || upload_url fallback) now use post_url. spec/lib/uploader_spec.rb and spec/models/concerns/uploadable_spec.rb updated to assert the split shape; full uploader/uploadable/button_sound/beta_feedback_recording/extra_data/logs/sounds spec suites green except two pre-existing unrelated test-DB-pollution failures (ButtonImage.count inflated by orphaned committed rows; an unrelated GoSecure OpenSSL 'bad decrypt' on cached_copy; a boards_controller_spec BoardLocale.count leak - all three reproduce in isolation on main, unrelated to this change). Not yet live-verified: requires redeploying the rehearsal image and confirming Resque::Failure stops accumulating the KMS-SSE SigV4 error on the next BoardDownstreamButtonSet run, plus a bucket-policy check that SSE-KMS enforcement on this bucket is actually intended. LIVE-VERIFIED 2026-07-05 on the GCP rehearsal stack: root cause was three stacked AWS-side blockers on lingolinq-prod-uploads (SSE-KMS default encryption with CMK d5a1a377-8f55-469d-a0ab-4a86481dba67 + BucketOwnerEnforced + Block Public Access), not residual code error. Fixes applied with Scot's approval: IAM policy lingolinq-cloudrun-s3-ses v2 (adds kms:GenerateDataKey/kms:Decrypt on the CMK, matching scripts/gcp/iam/lingolinq-cloudrun-s3-ses-policy.json) set as default for user lingolinq-cloudrun-prod; UPLOADS_S3_NO_ACL=1 applied live to lingolinq-web (rev 00003-5t9) and the lingolinq-worker pool and added to deploy-cloudrun.yml via PR #531. End-to-end synthetic verification: a real ButtonImage (id 840) processed by the live worker pool landed in the bucket (224566 bytes, image/png, ServerSideEncryption aws:kms under the expected CMK); record destroy also removed the S3 object. Read path: CloudFront distribution E2X2HAS6Y1L2MI (OAC, bucket-policy + KMS key-policy grants scoped to the distribution ARN) fronts the bucket; UPLOADS_S3_CDN set on both stacks 2026-07-05. Awaiting Scot's verified-closed call. Independently re-confirmed 2026-07-09: same full-failure-log scan used to verify LL-a95e9c5f7c also covers this finding's KMS-SSE SigV4 error class -- NEW_SINCE_DEPLOY=0 since 2026-07-04T22:00:00Z, no new S3 InvalidArgument/SigV4 failures. Still awaiting Scot's verified-closed call.

### lingolinq-worker's 512Mi memory limit is too small for ButtonImage/BoardDownstreamButtonSet jobs, causing continuous OOM kills that land as Resque::Failure instead of being requeued

- **ID:** `LL-a95e9c5f7c`  |  **ruleKey:** `cloudrun-workerpool-oom-sigkill-jobloss`  |  **severity:** high
- **Location:** runtime: `Resque::Failure crosstab (klass x error category) via a throwaway lingolinq-diagcheck3 Cloud Run Job, cross-referenced against gcloud logging read on resource.type=cloud_run_worker_pool for lingolinq-worker, 2026-07-03. Superseded an earlier draft of this finding that incorrectly attributed the failures to the worker-pool scale-down transition (Codex review of PR #516 caught the arithmetic - 833 could not be a subset of 740 new failures - and the unverified crosstab claim).`
- **Residual:** Code-remediated on scot/fix/worker-pool-oom-sigv4: added `--memory 2Gi` to the `gcloud beta run worker-pools deploy lingolinq-worker` step in .github/workflows/deploy-cloudrun.yml (matching the web service's existing --memory 2Gi), matching the OOM-kill-count evidence exactly. Not yet live-verified: requires a redeploy of lingolinq-worker and a follow-up gcloud logging read / Resque::Failure crosstab confirming OOM events and SIGKILL/SIGSEGV failures stop accumulating. The separate open question (whether OOM-killed forked children should trigger BoyBand auto-requeue) is unaddressed and remains for a future finding if OOM still recurs at 2Gi under peak load. LIVE-VERIFIED 2026-07-09: `gcloud beta run worker-pools describe lingolinq-worker --project lingolinq-prod` confirms `resources.limits.memory: 2Gi` is live on the currently-serving image (20953ab3d, tip of staging). Ran a fresh read-only `Resque::Failure` scan (throwaway `lingolinq-resquecheck` Cloud Run Job, Scot's explicit approval per-invocation) over the full failure log (914 entries) filtering `failed_at > 2026-07-04T22:00:00Z` (the redeploy time): TOTAL_FAILURES=914 (unchanged from the 2026-07-03 pre-fix baseline), NEW_SINCE_DEPLOY=0 -- zero OOM-driven SIGKILL/SIGSEGV failures have occurred since the 2Gi limit went live, across 5 days including at least one real ButtonImage processing run. Awaiting Scot's verified-closed call.

### Pre-existing Resque background-job failures: ImageMagick identify missing in Cloud Run image, stale job_stash lookups, and a call to a removed Board method

- **ID:** `LL-5954bcbbe6`  |  **ruleKey:** `resque-imagemagick-identify-missing-jobstash-stale`  |  **severity:** medium
- **Location:** runtime: `Resque::Failure diagnostics via a throwaway lingolinq-diagcheck2 Cloud Run Job (rails runner, cloned from lingolinq-web's image/SA/VPC/Cloud SQL/secrets), 2026-07-03`
- **Residual:** Partially code-remediated on scot/fix/worker-pool-oom-sigv4, root-cause (a) confirmed and fixed: the Cloud Run image's Dockerfile apt-get list (final `ruby:3.4.4-slim` stage) never installed imagemagick or ghostscript, confirming the 16 'No such file or directory - identify' failures - `identify` is shelled out directly in app/models/concerns/uploadable.rb:275 (`identify -verbose #{file.path}`) and `convert` in lib/sentence_pic.rb:43/45. Added `imagemagick` and `ghostscript` (ImageMagick's PDF/PS delegate) to the Dockerfile's apt-get install list; web and worker share this one Dockerfile so both are fixed by the same change. (b) and (c) investigated, not code bugs: Board:update_privacy IS present in current code (app/models/board.rb:2700), so the 1 'method not found' failure was version skew during that day's deploy, not a live gap - no enqueue site needs fixing. The 3 job_stash 'stash not found: 1_1/1_2/1_3' failures reference suspiciously low sequential JobStash global_ids consistent with a freshly reset/seeded Postgres (this is a clean-DB rehearsal stack, scripts/gcp/PHASE5-CLEAN-DB-REHEARSAL.md) while Resque's Redis-backed queue was NOT cleared across that reset - i.e. stale retry jobs (Processable#update_setting's ActiveRecord::StaleObjectError retry path, app/models/concerns/processable.rb:86-92) referencing JobStash rows from a prior DB generation. This is a rehearsal-process gap (flush stale Resque queues alongside any DB reset), not an application code bug; JobStash.flush_old_records only expires rows after 2 weeks so ordinary TTL expiry doesn't explain it. LIVE-VERIFIED 2026-07-04 (Phase 5 step 0a follow-up, scot/docs/phase5-0a-status-v2): built a fresh image from origin/staging (efb758284, includes this fix at 77233fb19) via Cloud Build, ran db:migrate, then redeployed both lingolinq-web (revision lingolinq-web-00002-g7b) and lingolinq-worker (revision lingolinq-worker-00002-gp4). A throwaway Cloud Run Job running `identify -version` directly against the new image confirmed the binary is present and functional (ImageMagick 6.9.11-60 Q16). Post-deploy, Resque::Failure.count is unchanged at 914 and all 16 identify-related failures still carry their original 2026-06-29 failed_at timestamps -- zero new identify failures since the redeploy. Residual: this confirms the binary is present and no regressions occurred in the ~20 minutes since deploy, but no real ButtonImage upload has hit the new image yet, so 'under normal upload load' (the remediation's original bar) is not yet exercised -- watch Resque::Failure for any new identify errors once real board-image traffic resumes. Status left at remediated-unverified pending Scot's attestation per repo policy (only Scot closes/downgrades a register finding), not because of any remaining technical doubt about the fix itself.


---
_Generated from the register at `d67ed76e0a161b594fbffa519ab428d0f9b7780b`. Regenerate with `ruby scripts/render-domain-reports.rb`. Do not edit by hand._
