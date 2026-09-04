# LingoLinq Compliance Status Snapshot

**Date:** 2026-06-18
**Owner:** Privacy Office (privacy@lingolinq.com)
**Trigger:** Compliance program maintenance after the 2026-06-17/18 merges (eval-narration AI
gating, Redis TLS enabler, register reconcile/re-stamp, GCP Memorystore flag fix) and continued
progress on the Render-to-GCP Cloud Run migration.
**Status:** SUPERSEDED (historical snapshot, retained for the record). The figures below were the
point-in-time state on 2026-06-18 and are no longer current. The next internal snapshot is
`docs/legal/COMPLIANCE_STATUS_2026-08-09.md` (DRAFT). Live posture is read from
`audit-reports/FINDINGS.json` at HEAD (publisher convention); as of 2026-08-09 that derivation is
**0 Critical / 12 High / 30 Medium / 25 Low**. This snapshot is not attested as a current statement.
**Related:** `audit-reports/FINDINGS.json` (source of truth), `docs/legal/COMPLIANCE_POSTURE_REPORT.md`,
`docs/legal/AI_GOVERNANCE_MEMO.md`, `docs/legal/SUBPROCESSORS.md`, `audit-reports/compliance-calendar.md`,
`docs/legal/COMPLIANCE_STATUS_2026-08-09.md` (successor snapshot),
`docs/legal/COMPLIANCE_STATUS_2026-04-23.md` (prior snapshot).

---

## 1. Executive summary

LingoLinq now runs compliance as a continuous findings register rather than periodic
point-in-time reports. The audit/compliance modernization (Phases 1 through 4) has shipped; the
program is in operate mode. This snapshot records where the register stands and what today's
merges changed. It does not close any finding or attest any control; only Scot does that.

Headline, read directly from the register at audited SHA `59e20439e` (auditedDate 2026-06-18):

- **0 open Critical** findings (the gating metric).
- **16 open High** findings, all currently untriaged.
- 18 open Medium, 14 open Low. 48 open total. 12 verified-closed, 2 superseded.

The register was re-stamped from `d72463c7` to the staging tip `59e20439e` on 2026-06-18 with
Scot's sign-off. The only intervening commit (#416, a GCP Memorystore AUTH flag fix) touched a
single provisioning script and added no findings, so no finding status changed and no evidence
anchor moved.

## 2. What changed since the prior snapshots

Since `COMPLIANCE_STATUS_2026-04-23.md` and the 2026-06-13 posture-report draft:

| Area | Change | Compliance effect |
|---|---|---|
| Eval-narration AI surface | #411/#412 gated the comprehensive assessment narrator: PiiScrubber before egress, AiApiLog per call, COPPA hard block for under-13, opt-in external narration with the egress payload bound to the server-resolved user. | Three findings verified-closed in #413 (one Critical PiiScrubber gap, two High: AiApiLog and COPPA). One residual stays open: LL-11db0dc848 (consent binding to the gate subject). |
| Redis transport | #410 added the ability to speak `rediss://` TLS to a managed Redis. | Enabler only. The live Render environment still runs plaintext `redis://`, so LL-6619cc1811 (HIPAA) stays open; closure is gated on the GCP Memorystore cutover. |
| Register hygiene | #413 closed the eval findings with attestation and added the consent-binding residual; #415 reconciled and re-stamped to `d72463c75`; this PR re-stamps to the staging tip `59e20439e` (2026-06-18, Scot sign-off). | Register is the single source of truth; FINDINGS.md, the compliance calendar, and the Notion page are deterministic renders of it. |
| GCP migration | #414 added worktree isolation config; #416 fixed the Memorystore AUTH provisioning flag. Phase 3 (Cloud SQL, Memorystore, VPC) is drafted but inert. | No production data is on GCP yet. GCP/Cloud Run is flagged as a planned subprocessor, not an active one (SUBPROCESSORS.md section 5.7). |

The High-count rise from 13 (2026-06-13) to 16 reflects wider scan coverage (the second full
audit run plus the accessibility finder), not new regressions in shipped behavior.

## 3. Current posture by framework

Open-finding distribution from the register (a finding can map to more than one framework, so the
rows do not sum to 48; 21 open findings carry no framework tag):

| Framework | Open | Open High | Notes |
|---|---:|---:|---|
| FERPA | 10 | 5 | Student data isolation, access scoping, audit-trail gaps. |
| HIPAA | 8 | 6 | PHI handling, BAA coverage. AWS BAA on file; Render BAA pending; GCP BAA to confirm/file. |
| GDPR | 4 | 2 | Subprocessor posture, deletion/export paths. |
| COPPA | 1 | 1 | The one open High is the eval-narration consent-binding residual (LL-11db0dc848). |
| WCAG | 8 | 1 | Standing accessibility domain; ACR in draft. |
| SOC 2 | 7 | 0 | Control-evidence and audit-system hardening. |

## 4. Decisions pending for Scot

These are surfaced, not decided. No AI closes a finding, downgrades severity, accepts risk, sets
a disposition, or attests a customer-facing doc.

1. ~~Re-stamp the register to `59e20439e`?~~ **DECIDED 2026-06-18:** re-stamped to the staging tip
   in this PR with Scot's sign-off. The audited SHA now matches the staging tip.
2. **DeepSeek vs the compliance surface (AI Governance Memo section 4.1).** The memo says DeepSeek
   is never used on any compliance surface, but the n8n PR-review bot still runs its DeepSeek
   adversary pass on register-only diffs (#413/#415). No PHI or student data left the boundary,
   but the wording and the automation disagree. Fix the bot to skip `audit-reports/**` and
   `docs/legal/**`, or revise the memo wording. Scot's call.
3. ~~**Triage the 16 open High findings.**~~ **DECIDED 2026-06-18:** dispositioned in #419, 14
   fixed-intent / 2 accepted. All 16 received a structured disposition (decidedBy "Scot Wahlquist").
   Nothing was closed; every finding stays status:"open" at the same severity. Disposition records
   intent only.

## 5. Open roadmap

| Item | Owner | Timing | Notes |
|---|---|---|---|
| Redis TLS closure (LL-6619cc1811) | Scot / infra | Gated on GCP Memorystore cutover (migration Phase 3) | Capability shipped (#410); close on cutover, do not fix twice. |
| Eval consent-binding remediation (LL-11db0dc848) | Scot / backend | Server-side eval persistence follow-up (Phase 1B) | Bind the consent gate subject to the eval content actually egressed. |
| Triage of 16 open High findings | Scot | DONE 2026-06-18 (#419) | Dispositioned: 14 fixed-intent / 2 accepted. Remediation PRs in flight for the fixed-intent set; findings stay open until verified + attested. |
| EU AI Act Article 50 transparency | Scot / product | Due 2026-08-02 | Decide synthetic-content marking applicability; add AI-assisted disclosure for EU-facing deployments. Tracked `fix-euaiact-art50-2026-08-02`. |
| DeepSeek / memo reconciliation | Scot | Near-term | See section 4 item 2. |
| GCP / Cloud Run subprocessor onboarding | Scot / infra | At cutover | File the infrastructure BAA, add the subprocessor row, give 30-day change notice. |

## 6. Attestation

| Field | Value |
|---|---|
| Prepared by | compliance-officer role (draft) |
| Reviewed by | adversary review (pending) |
| Attested by | _Scot Wahlquist (pending signature)_ |
| Attestation date | _pending_ |

_Internal status snapshot. Headline counts are read from the register; every other audit-report
file is a point-in-time snapshot and is not authoritative for status._
