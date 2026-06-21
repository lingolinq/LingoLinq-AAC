# Open-findings verification pass - 2026-06-21

Verification of all **48 open findings** in `FINDINGS.json` against the current
working-tree code (branch `scot/compliance/findings-register-catchup`). Read-only
fan-out, conservative verdicts (a false "fixed" on a compliance finding is worse
than a false "open"). Per governance, only Scot closes/attests - this pass
verifies code state and proposes; it does not self-attest.

## Tally

| Verdict | Count | Meaning |
|---|---|---|
| **FIXED** | 5 | Already remediated in current code |
| **NEEDS_HUMAN** | 5 | Depends on live infra state or your risk-acceptance judgment |
| **STILL_OPEN** | 38 | Genuinely still present, real outstanding work |

Result: 4 unambiguous closures applied to the register (status to `verified-closed`,
**attestation pending Scot**); open backlog 48 to 44.

---

## A. Closed this pass (4) - awaiting your attestation

These are flipped to `verified-closed` with a code-cited `verifierNote`, but
`closureEvidence.attestation` is blank. Add your `Scot Wahlquist 2026-06-21`
attestation line to each (same as your "attest early closures" backfill) to make
the closure governance-complete and populate the board's "Closed/decided by".

| ID | Finding | Why it's fixed |
|---|---|---|
| LL-a25d930f21 | ember-cli-mirage 2.x abandoned | Upgraded to maintained 3.0.4 |
| LL-53ab4ea456 | serialize-javascript CVE-2024-11831 | Package fully removed from lockfile (terser-webpack-plugin 5.5.0) |
| LL-20c48e298c | board-tile symbol img missing alt | `alt` now present on **both** render paths (index.hbs + button.js fast_html) |
| LL-56f0f19fca | registration/2fa/SAML not throttled | Now in `PROTECTED_PATHS` (throttling.rb:33-36) |

## B. Judgment call (1) - eslint

| ID | Finding | Situation |
|---|---|---|
| LL-257c696fe0 | `eol-eslint-5x` | The cited v5.16.0 **is gone** (now 8.57.1), so the 5.x finding is technically resolved, **but** 8.57.1 is itself deprecated/EOL. |

**Your call:** close `eol-eslint-5x` (v5 condition met) and optionally file a new
"eslint 8 EOL" finding, OR keep open and re-scope. I did not auto-close it.

## C. NEEDS_HUMAN (5) - your decisions

**Infra-state (cannot be closed from repo code, needs a live read):**
- **LL-6619cc1811** redis-no-tls-shared: code now supports `rediss://` TLS, but whether TLS is in force depends on the live `REDIS_URL` on each Render service. (Consistent with: this is the Memorystore-cutover item, not a clean close.)
- **LL-aacae48768** render-postgres-public-ip-allowlist: `render.yaml` commits no `ipAllowList` (public default); confirm/close by reading the live Render Postgres `ipAllowList` on prod + dev/staging.

**Audit-system self-findings (interim mitigation done; structural fix deferred, your risk-acceptance call):**
- **LL-97f9001bb4** audit-guard denylist: now blocks pipe-to-shell/eval; structural allowlist/sandbox is Phase 3.
- **LL-a2b45c2bcb** finder-agent memory cross-run: memory policy now documented in-file; `memory: project` persistence retained.
- **LL-5f0f4f52f8** audit-system not self-audited: self-audit scope added to infra-auditor checklist; automated meta-audit pass is Phase 4.

## D. STILL_OPEN (38) - real work

Genuinely still present in current code. Notable **partial fixes** (small added
work would close them, good next targets):

- **LL-d35cbdb313** AuditEvent on user creation: added, but only for the `school_official` basis; general/start-code creation still emits none.
- **LL-52ff2a9a79** CI security gates: gitleaks is now a blocking job, but Brakeman/bundle-audit/npm-audit `security-scan` is still `continue-on-error: true`.
- **LL-11db0dc848** eval narration consent: the no-user-no-egress hole is closed and the payload is PII-scrubbed, but the eval content egressed is still not verified to belong to the supervised user.

Full STILL_OPEN list: 8 dependency (bootstrap-3, braces 2.3.2, moment, qrcodejs,
lodash 4.18.1 drift, ruby-saml floor, http-proxy, puma constraint), 8 API-contract
(serializer/Ember field mismatches), 10 accessibility/WCAG, 7 security/infra,
5 misc/data-handling. See `FINDINGS.md` (filter Status = open) for the full set.

---

_Method: 5 read-only verifier agents, one per domain, each citing current-code
evidence. Verdicts defaulted to STILL_OPEN absent concrete proof of the fix._
