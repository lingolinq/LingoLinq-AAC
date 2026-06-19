# LingoLinq-AAC Audit Summary and Progress Comparison

**Run date:** 2026-06-19  |  **Audited commit:** `445336592` (`scot/security/audit-erasure-admin-reads`, staging tip)  |  **Validation:** citation-check green (PASS 73 / FAIL 0)

This is an executive summary of the 2026-06-19 full audit run (all five finder domains) and a comparison against prior audits, showing what has been remediated and what remains. All figures are drawn from the findings register (`audit-reports/FINDINGS.json`), the single source of truth. Evidence is code and path only; no student or patient data appears in any audit artifact.

---

## TL;DR

- **Today: 0 Critical, 5 High open.** Of those 5 High, 3 are already remediated in code (awaiting final verified-close attestation) and only **2 are new, actionable items**, both now triaged as accepted-to-fix.
- **26 findings have been verified-closed**, including **all 6 of the original Critical findings** from the February to April baseline.
- The trend line is strongly downward: from **6 Critical / 14 High** at the April baseline to **0 Critical / 5 High** today.

---

## Progress trajectory (open Critical / High over time)

| Date | Audited scope | Open Critical | Open High | Note |
|---|---|---|---|---|
| 2026-04-09 | Unified audit seed | 6 | 14 | Original baseline (6 P0 / 14 P1 / 10 P2), folded into the register |
| 2026-06-14 | First full register run | 1 | 15 | Migrated audit system, finders re-verified against live code |
| 2026-06-17 | 5-finder run | 1 | 17 | Accessibility finder added; surfaced more frontend items |
| 2026-06-19 (AM) | 5-finder run | 0 | 13 | Last Critical closed |
| **2026-06-19 (this run)** | **5-finder run** | **0** | **5** | **Backlog of Highs attested-closed; 2 new Highs surfaced** |

The jump from 13 open High in the morning to 5 now reflects the remediation work landed during the day (License encryption, AuditEvent coverage, accessibility alt text, callback signature verification, account-enumeration fix), after which the closed Highs were attested out of the open count.

---

## What has been remediated (26 verified-closed)

The register now carries 26 verified-closed findings. Highlights by severity:

**All 6 original Critical findings are closed**, including:

- SQL injection in license sort
- License records skipped by the GDPR flusher
- Missing audit trail on license claim / release
- Missing audit trail on supervisor consent
- Background worker missing encryption keys
- Unauthenticated status endpoint data leak

**Notable High findings closed**, including:

- License metadata now encrypted at rest
- License seats transferred on user merge (no longer orphaned)
- Consent, claim-user, and password-change endpoints throttled and audited
- Forgot-password response made uniform (account-enumeration closed)
- Webhook callback URLs required to be https
- Board-tile symbol images given alt text on all render paths
- SNS signature verification added to transcoding callbacks

Two findings are formally **accepted-risk** and two are **superseded**, each with a recorded decision.

---

## Current posture by domain (49 open findings)

| Domain | Open | Critical | High | Medium | Low |
|---|---|---|---|---|---|
| Privacy and Data Protection | 6 | 0 | 1 | 5 | 0 |
| Infrastructure and Security | 12 | 0 | 2 | 3 | 7 |
| API Contract | 8 | 0 | 0 | 3 | 5 |
| Dependency and CVE | 11 | 0 | 1 | 4 | 6 |
| Accessibility (WCAG 2.1 AA) | 12 | 0 | 1 | 10 | 1 |
| **Total** | **49** | **0** | **5** | **25** | **19** |

Of the 49 open, 44 are untriaged, 3 are remediated (disposition fixed, pending verified-close), and 2 are newly triaged as accepted-to-fix (see below). The 5 open High break down as 3 already-remediated and 2 new.

---

## This run: 7 net-new findings (all adversary-confirmed)

Each new finding was independently re-checked by a red-team adversary pass in a fresh context. All 7 were confirmed; none refuted.

| ID | Severity | Domain | Finding |
|---|---|---|---|
| `LL-aacae48768` | High | Infra | Production Postgres reachable from an all-addresses allowlist (public internet) |
| `LL-9b5d0f1381` | High | Accessibility | Find-a-button search input has no accessible name |
| `LL-b06f063f85` | Medium | Accessibility | Shared modal-dialog wrapper sets role=dialog with no accessible name |
| `LL-8fab55372e` | Medium | Accessibility | Speak-bar remote-modeling button has no accessible name |
| `LL-b0bc6880e6` | Low | Infra | Secret-bearing GitHub workflow declares no least-privilege permissions block |
| `LL-e76d6378b5` | Low | API | Webhook model declares two read attributes Rails never serializes |
| `LL-53ab4ea456` | Low | Dependency | serialize-javascript 4.0.0 vulnerable to CVE-2024-11831 (dev toolchain only) |

The adversary pass also corrected a citation error on the dependency finding (the advisory id and vulnerability class were fixed in the register before it landed), and the orchestrator sanitized the infra High finding so the register PII scrubber would not silently drop it.

---

## Triaged this run: the 2 new High findings

Both new High findings were triaged as **accepted** (confirmed real, to be remediated), owner Scot Wahlquist:

- **`LL-aacae48768` (Infra, prod DB public allowlist).** Production database closure folds into the Render to GCP Cloud SQL cutover (private VPC, no public database exposure). The dev and staging database allowlist can and should be restricted independently and now, since it does not depend on the cutover.
- **`LL-9b5d0f1381` (Accessibility, find-a-button input).** A real WCAG name-role-value defect on a core AAC navigation surface. Fix is small: add an internationalized aria-label to the search input and convert the raw placeholder to the translation helper.

---

## Method and governance

- Five read-only finder agents (privacy, infra, API, dependency, accessibility) scan the code at a single pinned commit. They report; they never edit.
- Findings are reconciled into the register by a deterministic merge that only ever adds findings or marks them open. It never closes, downgrades, or triages.
- Every new finding is adversary-verified in a fresh context before it is treated as real.
- Only the CEO closes a finding, downgrades severity, accepts risk, or sets a disposition. Closures require an attestation signature.
- Snippet evidence is validated against the audited commit, so every citation in these reports resolves to real code at a known revision.

---

_Generated from the findings register at commit `445336592ddaf838689df7e578829e94e140890d` on 2026-06-19. The register is the single source of truth; these reports are draft views of it._
