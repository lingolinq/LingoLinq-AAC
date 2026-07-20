---
name: dependency-audit
description: Dependency freshness and vulnerability audit checklist for LingoLinq-AAC. Checks Gemfile/Gemfile.lock and package.json/package-lock.json for outdated, vulnerable, abandoned, and lockfile-drifted dependencies. Preloaded by the dependency-auditor agent; emits findings in the canonical register schema. Read-only.
---

# Dependency Freshness & Vulnerability Audit

## Purpose
Assess dependency freshness, known vulnerabilities, and maintenance health. Read-only:
produce findings, never install/update anything.

## Scan scope
- Ruby: `Gemfile`, `Gemfile.lock`.
- Node: `app/frontend/package.json`, `app/frontend/package-lock.json` (and root `package.json`
  if present).

## Constraints that shape recommendations
- **Node 22 and Ember 5.12 are the current pins.** (Ember 3.28 -> 5.12 shipped in #490,
  2026-07-08; Node 20 -> 22 in #636.) Do NOT recommend jumping Ember majors as a fix; 5.x ->
  6.x is a separate migration effort, and Node 24 is gated behind it (ember-cli adds Node 24
  at 6.7). Flag CVEs and EOL risk, but frame upgrade options within these constraints
  (e.g. backport, patch pin, or "blocked on the Ember 6 migration").

## Checklist
- [ ] List all Ruby gems: current vs latest; flag outdated.
- [ ] List all npm packages: current vs latest; flag outdated.
- [ ] Flag gems/packages with known CVEs (advisory-known or CVE-pattern).
- [ ] Identify abandoned packages (no release in >2 years / no maintainer activity).
- [ ] Check for duplicate/redundant dependencies.
- [ ] Verify lockfile integrity (lockfile matches manifest; no drift).

## Allowed commands (read-only)
Read manifests/lockfiles via Read. You MAY run read-only inspection (`bundle list`, `npm ls`).
You may NOT run installers/updaters (`bundle install/update`, `npm install/update`, `gem install`)
or any mutating command; the PreToolUse guard blocks them.

## Severity mapping
- **critical**: actively-exploited CVE reachable in the app; RCE/auth-bypass in a used path.
- **high**: known CVE in a used dependency; abandoned dependency on a security-sensitive path.
- **medium**: outdated major with no current CVE; lockfile drift.
- **low**: minor staleness; dev-only dependency issues.

## Finding schema (canonical: mirrors audit-reports/FINDINGS.json)
```json
{
  "ruleKey": "cve-<pkg>-<id> or outdated-<pkg>",
  "title": "one line (pkg, version, issue)",
  "severity": "critical|high|medium|low",
  "confidence": "high|medium|low",
  "frameworks": [],
  "status": "open",
  "evidence": { "type": "code", "file": "Gemfile.lock", "line": 88,
                "snippet": "verbatim lockfile line at the audited SHA", "sha": "<auditedSha>" },
  "remediation": { "options": "target version + constraint (respect Node 22 / Ember 5.12)",
                   "timeframe": "advisory" },
  "notes": "advisory link / CVE id"
}
```
Rules:
- Finders emit `status: "open"` ONLY; never `verified-closed` (Scot closes; adversary confirms first).
- Map CVSS / exploitability to the severity scale above.
- `frameworks` is usually `[]`; tag `HIPAA`/`FERPA` only if the CVE plausibly exposes regulated data.
- The `snippet` must exist verbatim in the cited manifest/lockfile at `<auditedSha>`
  (`scripts/citation-check.rb` enforces this).
- The orchestrator computes the stable `id`, sets timestamps/owner, and reconciles against the
  existing register.
