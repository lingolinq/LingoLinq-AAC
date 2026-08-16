# LingoLinq Compliance Status Snapshot

**Date:** 2026-08-09
**Owner:** Privacy Office (privacy@lingolinq.com)
**Trigger:** Post–Gate 1 operate-mode maintenance: EU AI Act Article 50 date (2026-08-02) has
passed; the customer-facing Posture Report still claims **8** open High from the 2026-07-23
re-attest while the live register at HEAD reads **12** High; overdue monthly-light audit and
COPPA quarterly retention checks need surfacing.
**Status:** DRAFT - awaiting attestation. Headline counts are re-derived from
`audit-reports/FINDINGS.json` as committed at HEAD `20aab90d3` (publisher convention: `open` +
`remediated-unverified` by severity). Register `meta.auditedSha` remains `20953ab3`
(auditedDate 2026-07-08) and records the last full audit *run*, not the last register edit.
**Related:** `audit-reports/FINDINGS.json` (source of truth),
`docs/legal/2026-08-09_compliance-posture-report_draft.md` (successor draft),
`docs/legal/2026-08-09_compliance-program_draft.md` (successor draft),
`docs/legal/COMPLIANCE_POSTURE_REPORT.md` (attested predecessor, frozen),
`docs/legal/COMPLIANCE_PROGRAM.md` (attested predecessor, frozen),
`docs/legal/AI_GOVERNANCE_MEMO.md`, `docs/legal/SUBPROCESSORS.md`,
`audit-reports/compliance-calendar.md`, `docs/legal/COMPLIANCE_STATUS_2026-06-18.md` (prior
snapshot, superseded).

---

## 1. Executive summary

LingoLinq runs compliance as a continuous findings register. This snapshot records what is done
since the 2026-07-23 Posture Report re-attest and what is still needed. It does not close any
finding or attest any control; only Scot does that.

Headline at HEAD `20aab90d3` (publisher convention):

- **0 open Critical** findings (the gating metric).
- **12 open High** findings (9 `open` + 3 `remediated-unverified`).
- **30** open Medium, **25** open Low. **67** live total (`open` + `remediated-unverified`).
- Across all findings: 62 `open`, 5 `remediated-unverified`, 50 `verified-closed`, 5
  `accepted-risk`, 2 `superseded`.
- `citation-check.rb`: PASS (0 failures) on this branch.

The attested Posture Report (2026-07-23) still shows **8 High / 27 Medium**. That figure was
accurate at an early-2026-07-23 register state and drifted the same day; three further Highs were
promoted from PR review on 2026-08-02/08-04. A Posture Report successor draft
(`docs/legal/2026-08-09_compliance-posture-report_draft.md`) at **0 / 12 / 30 / 25** is
included in this package for Scot's attestation (Path A supersession; attested predecessor left
untouched).

---

## 2. What is done (since 2026-06-18 / 2026-07-23)

Grounded in the register and `docs/legal` history. No finding was closed, downgraded, or
accepted in *this* drafting session.

| Area | Change | Compliance effect |
|---|---|---|
| Gate 1 DNS cutover | 2026-07-22: `app.lingolinq.com` on GCP Cloud Run + Cloud SQL + Memorystore; Render retained as write-frozen rollback. | Production host is GCP; GCP listed as active infrastructure subprocessor. |
| Redis TLS (LL-6619cc1811) | Verified-closed 2026-07-22 with in-context Cloud Run `rediss://` evidence and Scot attestation. | Prior open High closed; no longer a cutover blocker. |
| Eval consent-binding (LL-11db0dc848) | Verified-closed 2026-06-23. | Prior open High residual closed; do not restate as open. |
| GCP BAA / CDPA / SCCs | Accepted and recorded (`docs/legal/GCP_BAA_ACCEPTED.md`; Drive capture 2026-07-14). | HIPAA-eligible infra path on Covered Products; not a Vertex AI / Gemini BAA. |
| Article 50(2) marking | Server-signed provenance marker shipped (`lib/art50_marker.rb`; board gen + word prediction). | Machine-readable marking path exists; 50(2) grace to 2026-12-02 is not headroom for a first EU placement after 2026-08-02. |
| Article 50(1) disclosure UI | Modal + ack + first-AI-use gate built; `article_50_disclosure` remains AVAILABLE-only (`lib/feature_flags.rb`). | Built but not enabled; obligation date passed 2026-08-02. |
| AI Governance Memo | Re-attested 2026-08-04 (git). | Published; branded Drive mirror review date still older. |
| Bedrock / BAA claim correction | 2026-08-01 through 2026-08-07 corpus sweep; LL-1b0d78dbe6 filed. | Unverifiable Bedrock-account assertion retracted; closed operational window documented. |
| Subprocessor quarterly review | Performed 2026-08-08. | Two omissions found (recorded in review notes); list hygiene in progress. |
| Remediation pending verify | Three High + two Medium in `remediated-unverified`. | Code/config changes landed; need fresh-context verification + Scot close. |
| Register hygiene | No `regression: true` findings. Citation-check green. | Evidence anchors for most findings still validate at pinned SHAs. |

### Live High findings (12)

| ID | Status | Frameworks | Age (d) | Title |
|---|---|---|---|---|
| LL-7f7372e3eb | open | SOC2, HIPAA | 47 | Audited-console control not operative (per-session AuditEvent still missing; title/evidence still mention Heroku and need re-anchor) |
| LL-a95e9c5f7c | remediated-unverified | SOC2 | 37 | Worker 512Mi memory limit / OOM kills |
| LL-705b10bcd7 | remediated-unverified | SOC2 | 37 | BoardDownstreamButtonSet S3 writes fail against KMS bucket |
| LL-90045bb29c | remediated-unverified | FERPA | 34 | Permanent non-expiring `User#user_token` in share URLs |
| LL-f150e0e828 | open | COPPA, GDPR | 31 | District seat reclaim to consumer trial without parental re-consent |
| LL-854b1d3853 | open | GDPR, FERPA, COPPA | 31 | Hard delete leaves UserVideo / off-board ButtonSound |
| LL-104bfa61dc | open | WCAG | 20 | Terms-agree modal unreachable by switch scanning |
| LL-53cb93fab1 | open | GDPR, FERPA | 20 | Terms-agree modal can be replaced by intro before agree |
| LL-a9d6d5a46b | open | WCAG | 18 | AI disclosure full-notice link low-contrast verdigris token |
| LL-1b0d78dbe6 | open | HIPAA | 7 | No check that Bedrock credential resolves to BAA'd AWS account |
| LL-16ef84ad9a | open | FERPA, HIPAA, GDPR | 7 | Word-prediction cache holds raw pre-scrubber utterance globally |
| LL-522c1a6d13 | open | FERPA, HIPAA | 5 | Masquerade produces no AuditEvent |

Six Highs are past the 15-30 day advisory SLA (LL-7f7372e3eb, LL-a95e9c5f7c, LL-705b10bcd7,
LL-90045bb29c, LL-f150e0e828, LL-854b1d3853).

---

## 3. Current posture by framework

Live = `open` + `remediated-unverified` at HEAD. A finding can map to more than one framework, so
rows do not sum to 67. Nine live findings carry no framework tag (engineering / API-contract /
dependency items; none High).

| Framework | Live | Live High | Notes |
|---|---:|---:|---|
| FERPA | 19 | 5 | Includes token share URLs, masquerade audit, deletion residuals, prediction cache. |
| HIPAA | 11 | 4 | Bedrock account binding, masquerade, prediction cache, audited console. |
| GDPR | 13 | 4 | Deletion/erasure, seat reclaim, prediction cache, terms modal. |
| COPPA | 5 | 2 | Seat reclaim (LL-f150e0e828); hard-delete media (LL-854b1d3853). |
| WCAG | 12 | 2 | Terms scanning (LL-104bfa61dc); Article 50 disclosure contrast (LL-a9d6d5a46b). |
| SOC 2 | 24 | 3 | Worker memory, S3 KMS writes, audited console. |

---

## 4. Decisions pending for Scot

Surfaced, not decided. No AI closes a finding, downgrades severity, accepts risk, or attests a
customer-facing doc.

1. **Re-attest the Posture Report** at **0 Critical / 12 High / 30 Medium / 25 Low** (draft refresh
   in this package). Branded Drive mirror (`DOC-ae3f9d06ef`) remains a separate operator refresh.
2. **Article 50 position (obligation live since 2026-08-02).** Either enable
   `article_50_disclosure` for EU-resolved users after clearing LL-a9d6d5a46b (and preferably
   LL-104bfa61dc), or record a dated rationale that the current AI surface does not trigger 50(1).
   Silence leaves no defensible record. Plan doc `DOC-771d214850` is still draft with review date
   2026-08-02 (overdue).
3. **Run overdue calendar work:** monthly-light `/audit-run` (due 2026-07-14, 26d overdue) and
   COPPA retention + parental-consent check (due 2026-07-26, 14d overdue). Next *full* audit is
   `rev-audit-run-quarterly-full` on 2026-09-14.
4. **Verification pass on five `remediated-unverified` findings** (three High), then attest closes.
5. **Triage untriaged Highs**, especially LL-522c1a6d13 (masquerade AuditEvent) and LL-16ef84ad9a
   (pre-scrubber utterance cache).
6. **Approve re-anchor of LL-7f7372e3eb** so title/evidence match rewritten `bin/audit_console`
   (finding stays open for the residual Reline / AuditEvent gap).
7. **Calendar row `fix-euaiact-art50-2026-08-02`:** move from `upcoming` to `passed-enforceable`
   with a linked ongoing review (mirrors COPPA pattern). Drafted in this package if accepted.

---

## 5. Open roadmap / what is needed

| Item | Owner | Timing | Notes |
|---|---|---|---|
| Close or disposition the 12 live Highs | Scot / eng | SLA advisory 15-30d (6 already past) | Prioritize data-bearing: LL-16ef84ad9a, LL-522c1a6d13, LL-f150e0e828, LL-854b1d3853. |
| Verify + attest 5 remediated-unverified | Scot | Near-term | LL-90045bb29c, LL-a95e9c5f7c, LL-705b10bcd7, LL-5954bcbbe6, LL-a167848115. |
| Article 50(1) enablement decision | Scot / product | Overdue since 2026-08-02 | Flag AVAILABLE-only; WCAG High LL-a9d6d5a46b is pre-enable blocker. |
| ACR / VPAT attestation | Scot | Before district asks; calendar refresh 2026-12-13 | Git + branded Drive still `draft`. |
| Overdue monthly-light audit | Scot / compliance | Overdue 26d | Register has had no scan stamp since 2026-07-08. |
| Overdue COPPA quarterly check | Scot / privacy | Overdue 14d | Only ongoing verification linked to passed-enforceable COPPA rule. |
| Sept 1 review cluster | Scot | Due 2026-09-01 | FERPA annual, GDPR DPA/RoPA, SOC2 quarterly, ZDR re-verify, Gemini BAA path, secret-rejector build, breach-runbook Drive remirror (2026-08-31). |
| Render decommission / restrict | Scot / infra | Pending explicit go | Retires accepted-risk LL-aacae48768 path and Render-tail of LL-7f7372e3eb once fallback is gone. |
| School SDPA / clinical BAA annexes | Scot / counsel | Draft | Annex A / Annex B still draft in Drive. |

---

## 6. DRAFT artifacts awaiting attestation

From `audit-reports/DOCUMENT-REGISTER.json` (`status: draft`):

- EU AI Act Article 50 Transparency: Implementation Milestone Plan (git)
- Accessibility Conformance Report (ACR / VPAT) (git + branded Drive)
- Compliance Posture Report (branded, 2026-07-16 re-attest) (Drive)
- Anthropic Business Associate Agreement (2026-05-06) (Drive)
- GCP Accepted Compliance Agreements capture (Drive)
- Annex A - Clinical BAA Template (Drive)
- Annex B - US Schools SDPA Package (Drive)

Plus this package: Status snapshot, Posture Report refresh, COMPLIANCE_PROGRAM draft revision.

---

## 7. Attestation

| Field | Value |
|---|---|
| Prepared by | compliance-officer role (draft) |
| Reviewed by | adversary review (pending) |
| Attested by | _Scot Wahlquist (pending signature)_ |
| Attestation date | _pending_ |

_Internal status snapshot. Headline counts are read from the register; every other audit-report
file is a point-in-time snapshot and is not authoritative for status. Only Scot closes findings
or sends customer-facing materials._
