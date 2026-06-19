# LingoLinq-AAC Infrastructure & Security (SOC2-style) Audit

**Run date:** 2026-06-19  |  **Finder:** `infra-auditor`  |  **Audited commit:** `445336592dda` (`staging`)

**Open findings in this domain:** 10  (0 CRITICAL · 1 HIGH · 3 MEDIUM · 6 LOW)

> DRAFT view of the findings register (`audit-reports/FINDINGS.json`), the single source of truth. Statuses are verified against live code at the audited commit. Only Scot closes a finding, downgrades severity, or accepts risk. Evidence is code/path only; no student or patient data appears here.

## HIGH (1)

### Redis connections without TLS; shared across environments

- **ID:** `LL-6619cc1811`  |  **ruleKey:** `redis-no-tls-shared`  |  **confidence:** high
- **Location:** `config/initializers/resque.rb`:23
- **Frameworks:** HIPAA
- **First seen:** 2026-04-09  |  **Last seen:** 2026-06-17  |  **Disposition:** fixed
- **Remediation:** Use TLS (rediss) and per-environment instances. Being overtaken by the GCP Memorystore migration (private VPC egress); reconcile rather than fix twice.

## MEDIUM (3)

### CI security-scan job (Brakeman SAST, bundle-audit, npm audit, gitleaks) is entirely non-blocking

- **ID:** `LL-52ff2a9a79`  |  **ruleKey:** `ci-security-gates-non-blocking`  |  **confidence:** high
- **Location:** `.github/workflows/ci.yml`:107
- **Frameworks:** SOC2
- **First seen:** 2026-06-14  |  **Last seen:** 2026-06-14  |  **Disposition:** untriaged
- **Remediation:** The whole security-scan job is continue-on-error: true (ci.yml:107), and every tool inside also soft-passes (Brakeman '|| true', npm audit '|| true', gitleaks '--exit-code 1 || true'). SAST, dependency-CVE, and secret-detection can never fail a PR, so a regression or a committed secret merges green. Make at least gitleaks secret-detection and high-severity bundle-audit/Brakeman blocking on PRs to staging/main; pair with branch protection requiring the gate.

### Registration/2fa/SAML endpoints under general throttle only

- **ID:** `LL-56f0f19fca`  |  **ruleKey:** `registration-endpoints-not-throttled`  |  **confidence:** high
- **Location:** `config/initializers/throttling.rb`:18
- **Frameworks:** —
- **First seen:** 2026-04-09  |  **Last seen:** 2026-06-12  |  **Disposition:** untriaged
- **Remediation:** Add POST api/v1/users, confirm_registration, 2fa, saml/consume to protected_paths or a stricter group.

### infra-auditor runtime/CLI evidence relies on instruction-only control against secret/PII leakage

- **ID:** `LL-b5c30235d3`  |  **ruleKey:** `infra-auditor-runtime-evidence-secret-leak`  |  **confidence:** medium
- **Location:** `.claude/agents/infra-auditor.md`:31
- **Frameworks:** SOC2, HIPAA, FERPA
- **First seen:** 2026-06-13  |  **Last seen:** 2026-06-13  |  **Disposition:** untriaged
- **Remediation:** Free-text runtime/CLI evidence snippets could carry secret values or PII; today this is enforced only by agent instruction and citation-check skips runtime evidence. Phase 3: schema-restrict or scrub runtime snippets; add a check that rejects secret-shaped strings in findings.

## LOW (6)

### Parallel finders read live infra without synchronization (possible inconsistent snapshot)

- **ID:** `LL-3483c28f3c`  |  **ruleKey:** `audit-run-parallel-finder-race`  |  **confidence:** medium
- **Location:** `.claude/skills/audit-run/SKILL.md`:33
- **Frameworks:** SOC2
- **First seen:** 2026-06-13  |  **Last seen:** 2026-06-13  |  **Disposition:** untriaged
- **Remediation:** Concurrent finders reading live Render/AWS/GCP state may observe a moving target. Phase 3/4: snapshot live infra once in the orchestrator and pass it to finders, or stamp a single read window.

### Audit system files (.claude/) are not in any finder scan scope (no self-audit)

- **ID:** `LL-5f0f4f52f8`  |  **ruleKey:** `audit-system-not-self-audited`  |  **confidence:** high
- **Location:** `.claude/agents/infra-auditor.md`:62
- **Frameworks:** SOC2
- **First seen:** 2026-06-13  |  **Last seen:** 2026-06-13  |  **Disposition:** untriaged
- **Remediation:** The finder scan scopes cover app code/config/infra but not the audit system itself (.claude/agents, .claude/skills, .claude/hooks). Phase 3: add a meta-audit pass so the audit system is reviewed by its own discipline.

### Audit finder Bash guard is a denylist with residual fetch-and-exec bypass

- **ID:** `LL-97f9001bb4`  |  **ruleKey:** `audit-guard-denylist-residual-bypass`  |  **confidence:** high
- **Location:** `.claude/hooks/audit-readonly-guard.sh`:59
- **Frameworks:** SOC2
- **First seen:** 2026-06-13  |  **Last seen:** 2026-06-13  |  **Disposition:** untriaged
- **Remediation:** Primary read-only control is the no-Edit/Write tools allowlist; the Bash denylist is defense-in-depth and now blocks pipe-to-shell/eval. A determined novel obfuscation can still slip through. Phase 3: consider an allowlist-based command filter or a sandboxed finder shell.

### Finder agent-memory (memory: project) may carry process state across audit runs

- **ID:** `LL-a2b45c2bcb`  |  **ruleKey:** `finder-agent-memory-cross-run-state`  |  **confidence:** medium
- **Location:** `.claude/agents/infra-auditor.md`:7
- **Frameworks:** SOC2
- **First seen:** 2026-06-13  |  **Last seen:** 2026-06-13  |  **Disposition:** untriaged
- **Remediation:** memory: project persists across invocations; confirm it holds process knowledge only (never findings/PII/snippets). Phase 3: document the memory policy, consider memory: local or a periodic reset.

### params.permit! bypasses Strong Parameters

- **ID:** `LL-a97357136e`  |  **ruleKey:** `widespread-permit-bang`  |  **confidence:** high
- **Location:** `app/controllers/api/organizations_controller.rb`:866
- **Frameworks:** —
- **First seen:** 2026-04-09  |  **Last seen:** 2026-06-12  |  **Disposition:** untriaged
- **Remediation:** Migrate call sites to explicit permit(:fields) in new code; do not refactor working code wholesale (April guidance).

### Production Postgres uses sslmode=require (encrypt only), not verify-ca/verify-full

- **ID:** `LL-ba0585ab93`  |  **ruleKey:** `db-ssl-require-no-cert-verify`  |  **confidence:** high
- **Location:** `config/database.yml`:26
- **Frameworks:** SOC2, HIPAA, FERPA
- **First seen:** 2026-06-14  |  **Last seen:** 2026-06-14  |  **Disposition:** untriaged
- **Remediation:** sslmode=require encrypts but does NOT validate the server certificate/hostname, so it does not defend against an active MITM. For PHI/FERPA in transit, move to sslmode=verify-full (or verify-ca) with the provider CA bundle once the GCP Cloud SQL cutover lands (Cloud SQL connector over VPC already gives a verified path), reconciling with the migration rather than fixing Render twice. Until cutover, set verify-full against Render's Postgres CA if available, else accept-risk with a dated note.


---
_Generated from the register at `445336592ddaf838689df7e578829e94e140890d`. Regenerate with `ruby scripts/render-domain-reports.rb`. Do not edit by hand._
