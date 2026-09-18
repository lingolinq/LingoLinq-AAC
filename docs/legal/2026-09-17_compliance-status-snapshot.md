# LingoLinq Compliance Status Snapshot

> # DRAFT - NOT YET ATTESTED
>
> **This successor carries NO attestation of its own.** It supersedes
> `docs/legal/2026-09-14_compliance-status-snapshot.md` (`DOC-39e71c72ee`, ATTESTED 2026-09-16 by
> Scot Wahlquist, CEO), which remains frozen and byte-identical and was accurate for its date.
>
> **Reason for supersession (2026-09-17).** The predecessor records finding `LL-c0b3d59f58` as
> **verified-closed 2026-08-29 on a live IAM policy read**. That closure was retracted on
> 2026-09-17: the Q3 2026 quarterly full audit run re-surfaced the finding, an independent
> adversary pass confirmed the regression, and the CEO reopened it at High. An attested record
> may not be edited in place, so the correction is made here. The predecessor's other content is
> carried forward and, where the register has moved since, restated at the 2026-09-17 register
> state rather than struck through, because the count set has changed substantially.

**Date:** 2026-09-17 (this successor). Lineage: 2026-08-09 (original), content refreshed
2026-08-20, corrected 2026-08-22, register counts updated 2026-08-30 and 2026-08-31, Render
decommission successor 2026-09-14 (attested 2026-09-16).
**Owner:** Privacy Office (privacy@lingolinq.com)
**Trigger:** Retraction of an attested closure. The Q3 2026 quarterly full `/audit-run`
(audited SHA `a43867de5`, audit date 2026-09-16, recorded in `audit-reports/run-log/runs.jsonl`)
added 35 findings and flagged one regression, `LL-c0b3d59f58`, which the predecessor and one other
record state as closed.
**Status:** DRAFT - awaiting attestation. Successor via Path A supersession to
`docs/legal/2026-09-14_compliance-status-snapshot.md` (`DOC-39e71c72ee`), frozen.
**Derivation:** headline counts are re-derived from `audit-reports/FINDINGS.json` as committed at
the Q3 audit merge (PR #996, develop `853662aa5`) and re-verified against develop `d76081fe9` on
2026-09-17. Register `meta.auditedSha` is `a43867de5aa83d821125892de624fcd1e19f9d81`
(`auditedDate` 2026-09-16), carrying an explicit **PARTIAL COVERAGE** qualifier described in
section 2 below.
**Related:** `audit-reports/FINDINGS.json` (source of truth),
`docs/legal/2026-09-14_compliance-posture-report.md` (ATTESTED 2026-09-16, frozen; its Headline
table's "Live Critical findings: 0" row carries no date and is the superseded gate value, see
correction 6 below),
`docs/legal/2026-09-14_compliance-program.md` (ATTESTED 2026-09-16, frozen; states the 0-Critical
gate explicitly "as of the 2026-08-20 attestation", so it is dated and stands as written),
`docs/legal/2026-08-30_minimum-necessary-privacy-retention-ai-use-counsel-review.md` (draft;
carries the same retracted closure and receives a dated addendum rather than an edit:
`docs/legal/2026-09-17_counsel-review-addendum-closure-retraction.md`),
`docs/legal/2026-08-22_compliance-status-snapshot.md` (frozen, superseded),
`docs/legal/COMPLIANCE_STATUS_2026-08-09.md` (attested 2026-08-20, frozen, superseded),
`audit-reports/compliance-calendar.md`.

---

## Corrections in this successor

| # | Statement in `2026-09-14_compliance-status-snapshot.md` | Correction |
|---|---|---|
| 1 | `LL-c0b3d59f58` shown as "~~open~~ **verified-closed 2026-08-29 on a live IAM policy read**" in the live-High table (:160), and listed under "*Done 2026-08-29*" as verified-closed (:238) | **Closure retracted 2026-09-17. The finding is `open` at High with a `regression: true` flag.** The Q3 2026 audit run re-surfaced it and an independent adversary pass confirmed it. The 2026-08-29 live read was accurate when taken; the condition recurred afterwards. Its disposition is `accepted` in the register, which in house usage means accepted onto the remediation backlog, not accepted risk; the register rationale states this explicitly. |
| 2 | Headline counts (0 Critical / 13 High / 63 Medium / 44 Low, 120 live as of 2026-08-31) | Restated at the 2026-09-17 register state in section 1. The count set moved materially: the 2026-09-02 through 2026-09-16 promotions and the Q3 full run added findings across every severity. |
| 3 | "0 open Critical findings (the gating metric)" (:67) | **No longer true. Two Critical findings are open.** One is a command-injection finding in the sentence-preview worker (`LL-676f91f26b`, first seen 2026-09-05); the other is an organization account-claim authorization weakness (`LL-1baffd92d5`, first seen 2026-09-02). Neither is closed and neither has an accepted risk. A code fix for `LL-676f91f26b` merged in PR #944 (2026-09-06, on `develop` and `main`), but its register row is still `open` and awaits the CEO's verification and closure. |
| 4 | The live-High table and the framework table (:146-194) | Rebuilt from the register at this date. The predecessor's table is a 2026-08-20 snapshot annotated through 2026-08-31 and no longer reflects the live set. |
| 5 | Decisions-pending item 3, "Next *full* audit is `rev-audit-run-quarterly-full` on 2026-09-14" (:228) | The quarterly full run was executed 2026-09-16 at `a43867de5`. The calendar row now reads lastDone 2026-09-16, nextDue 2026-12-16. A dated make-up pass (`rev-audit-run-q3-makeup`, due 2026-10-09) was added because the run had partial coverage; see section 2. |

| 6 | Sibling record: `docs/legal/2026-09-14_compliance-posture-report.md` Headline table, row "Live Critical findings: **0**" (`DOC-110d632550`, ATTESTED 2026-09-16, listed in the grant, school-dpa-package and security-review bundles) | **Not current.** Every other row of that Headline table carries a date qualifier; the Critical row carries none and now reads as a present-tense claim. Both open Criticals (first seen 2026-09-02 and 2026-09-05) predate that attestation. The record is frozen and is not edited; this successor is the correcting statement until the CEO decides whether the posture report gets its own Path A successor (section 4, item 9). Note that per the CEO's 2026-09-17 statement, no compliance record has ever been sent to any recipient, so no correction notice is owed; the repository is public, so the claim is readable. |

Nothing else in the predecessor is corrected. In particular the Render decommission closure, the
Article 50 production-flag verification, and the Article 50(1) enablement history are carried
forward unchanged and remain accurate as written.

## 1. Executive summary

LingoLinq runs compliance as a continuous findings register. This snapshot records the register
state at the Q3 2026 audit and what is still needed. It does not close any finding or attest any
control; only Scot does that.

Headline at register `meta.auditedSha` `a43867de5` (audit date 2026-09-16; register read
2026-09-17):

- **2 open Critical** findings. The predecessor's "0 open Critical" gating metric is no longer
  met. Both are described in section 2.
- **38 live High** (32 `open` + 6 `remediated-unverified`).
- **94 live Medium**, **52 live Low**. **186 live total.**
- Across all 251 findings: 176 `open`, 10 `remediated-unverified`, 57 `verified-closed`,
  5 `accepted-risk`, 3 `superseded`.
- **Two counting conventions appear in LingoLinq records and they differ. State which one you
  mean.** The publisher convention used above counts `open` + `remediated-unverified` as live.
  The `/audit-run` step 6 headline counts `open` only, which gives **2 Critical / 32 High** for
  the same register. Neither is wrong; the 6-High difference is entirely findings whose fix has
  landed but which the CEO has not yet verified and closed.
- The Q3 2026 quarterly full six-finder run added **35** new findings (7 High, 20 Medium, 8 Low)
  and flagged **one regression** (`LL-c0b3d59f58`). Two further findings were filed outside the
  run after independent verification. 33 of the 35 were adversary-verified in fresh context, one
  was verified by the orchestrator, and one came back uncertain and is recorded as such.
- `citation-check.rb` at this state: **PASS 234 / FAIL 0 / SKIP 17.** Green.

## 2. What changed since the predecessor

| Area | Change | Compliance effect |
|---|---|---|
| Q3 2026 quarterly full audit run | Six read-only finders (privacy, infra, api, dependency, accessibility, code-hygiene) at `a43867de5`, 239 commits and 978 files since the prior full-run anchor. 35 new findings, 1 regression. | Largest single driver of the count rise since 2026-08-31. Recorded in `audit-reports/run-log/runs.jsonl`. |
| Audit pointer moved with a PARTIAL COVERAGE qualifier | `meta.auditedSha` advanced to `a43867de5`, and `meta.auditedRef` carries an explicit qualifier, rendered on every derived page. | The pointer must not be read as full-tree assurance for this quarter. The recorded limits are: finders ran without their checklist skills or read-only guard (`LL-c667ec15e3`); no AWS account-level read; no bundle audit, with live advisory checks substituted; accessibility static only; and code-hygiene, api and privacy each sampled part of their scope. |
| Dated make-up pass scheduled | `rev-audit-run-q3-makeup`, due 2026-10-09, added to `audit-reports/compliance-calendar.json`. | The coverage gap is tracked with a date rather than left as prose. |
| Two open Critical findings | `LL-676f91f26b` (command injection through an utterance button label in the sentence-preview worker, first seen 2026-09-05) and `LL-1baffd92d5` (organization account-claim authorization weakness, first seen 2026-09-02). | The 0-Critical gating metric is not met. `LL-676f91f26b` has a merged code fix (PR #944) that the CEO has not yet verified or closed; `LL-1baffd92d5` has a candidate fix under private review. |
| `LL-c0b3d59f58` closure retracted | Reopened at High on 2026-09-17 with `regression: true`. | An attested record's closure statement is now false; this successor and an addendum to the 2026-08-30 counsel review are the corrections. A preventive production control and a least-privilege change were both applied on 2026-09-17; closure awaits the CEO's verification. |
| Security disclosure policy applied to the register | For unresolved security findings, the public register rows carry a status statement, severity, location and closure criteria only. Technical detail is held in a restricted private evidence store until remediation is deployed and verified and disclosure is approved. | This repository is public. Several High rows in the table below therefore read as "details withheld"; that is deliberate minimization, not missing information. |
| Process defect in the audit tooling | Named agent spawns became agent-team members, so the read-only guard, the examination logger and the per-domain checklist skills did not apply to the finders (`LL-c667ec15e3`). | Recorded as a finding with the make-up pass as its remediation. The run's code findings remain mechanically validated by citation-check. |

### Live Critical and High findings (40: 2 Critical, 38 High)

Derived from `audit-reports/FINDINGS.json` at this date. Live = `open` +
`remediated-unverified`. Rows marked "details withheld" are minimized under the disclosure policy
described above.

| ID | Severity | Status | Frameworks | First seen | Title |
|---|---|---|---|---|---|
| LL-1baffd92d5 | Critical | open | FERPA, COPPA, GDPR, SOC2 | 2026-09-02 | Organization account-claim authorization weakness (details withheld) |
| LL-676f91f26b | Critical | open | FERPA, HIPAA | 2026-09-05 | Command injection via utterance button label in the sentence-preview worker |
| LL-a95e9c5f7c | High | remediated-unverified | SOC2 | 2026-07-03 | Worker memory limit too small for image and button-set jobs |
| LL-705b10bcd7 | High | remediated-unverified | SOC2 | 2026-07-03 | Button-set S3 writes fail against the KMS-encrypted bucket |
| LL-90045bb29c | High | remediated-unverified | FERPA | 2026-07-06 | Permanent non-expiring user token serialized on login and embedded in URLs |
| LL-f150e0e828 | High | remediated-unverified | COPPA, GDPR | 2026-07-09 | District seat reclaim converts an under-13 account to a consumer trial with no parental re-consent |
| LL-104bfa61dc | High | open | WCAG | 2026-07-20 | Terms-agree modal is unreachable by switch scanning |
| LL-53cb93fab1 | High | open | GDPR, FERPA | 2026-07-20 | Terms-agree modal can be silently replaced by intro before the user agrees |
| LL-a9d6d5a46b | High | remediated-unverified | WCAG | 2026-07-22 | AI disclosure full-notice link uses a low-contrast token |
| LL-e8614c103f | High | open | GDPR, FERPA, COPPA | 2026-08-12 | Prediction rows survive account deletion, retaining per-user vocabulary sequences |
| LL-c0b3d59f58 | High | open, regression | SOC2, HIPAA, FERPA | 2026-08-12 | Production GCP least-privilege regression for human principals (details withheld) |
| LL-0b5443f43b | High | open | SOC2, HIPAA | 2026-08-12 | Production Cloud Run service has public ingress, bypassing Cloud Armor |
| LL-5617f4e17d | High | open | SOC2, HIPAA, FERPA | 2026-08-12 | No server-side password strength policy |
| LL-6af580a23a | High | remediated-unverified | SOC2, HIPAA, FERPA | 2026-08-12 | A Redis persistence snapshot was tracked in git and shipped in container images |
| LL-5f0a016e2b | High | open | SOC2, HIPAA | 2026-08-25 | Attested AI Governance Memo states the Bedrock path is not operational, contradicted by production calls |
| LL-3bfc56ef4b | High | open | HIPAA, SOC2 | 2026-08-30 | The runtime model allowlist cannot constrain direct AWS API use |
| LL-4f1eb5fd0a | High | open | SOC2 | 2026-09-02 | Lesson URL check fetches a user-supplied URL with unbounded redirect following |
| LL-135ee6ca59 | High | open | COPPA, GDPR, FERPA | 2026-09-02 | The separate AI data-sharing consent mechanism has no runtime caller |
| LL-c7bbfa452a | High | open | COPPA, FERPA | 2026-09-02 | School-authorized account creation skips the COPPA block, so the flag is never written |
| LL-933e61efd7 | High | open | GDPR, FERPA, COPPA | 2026-09-02 | Five retention and deletion promises on the public privacy page have no implementing mechanism |
| LL-400adcead5 | High | open | GDPR, COPPA | 2026-09-02 | AI, Article 50, COPPA and retention disclosures were machine-translated without legal review |
| LL-3e36a18199 | High | open | GDPR, FERPA, HIPAA, SOC2 | 2026-09-02 | Production scheduler dispatch has no missed-run liveness detection |
| LL-06d36ffeeb | High | open | GDPR, FERPA, COPPA, HIPAA | 2026-09-04 | Board translation writes raw user-authored label text into the global dictionary |
| LL-10409152d2 | High | open | GDPR, FERPA, COPPA, HIPAA, SOC2 | 2026-09-04 | The quarterly subprocessor review's completeness claim is not supported |
| LL-a8351c5b00 | High | open | GDPR, HIPAA, FERPA | 2026-09-04 | Log redaction never matches E.164 phone numbers, contrary to its own documentation |
| LL-cb9f9c865a | High | open | GDPR, HIPAA, FERPA | 2026-09-04 | Remote-target rows survive account deletion, retaining a phone-number hash |
| LL-a6be800a86 | High | open | COPPA, FERPA, GDPR | 2026-09-06 | Full user export archive is stored under a predictable S3 key |
| LL-ed9316b6d9 | High | open | FERPA, COPPA, GDPR | 2026-09-07 | Word-prediction selections are stored under device-global keys and sync across accounts |
| LL-89b97af30f | High | open | SOC2 | 2026-09-13 | Lesson permission grant lets a viewer self-grant edit |
| LL-5d856983bf | High | open | SOC2 | 2026-09-13 | Lesson URL handling lacks destination restrictions (details withheld) |
| LL-57bb9f1af4 | High | open | SOC2 | 2026-09-13 | An unvalidated string is passed to constantize during lesson permission handling |
| LL-c11cc12f66 | High | open | COPPA, FERPA | 2026-09-16 | COPPA parental consent flow control weakness (details withheld) |
| LL-9e145637b9 | High | open | GDPR | 2026-09-16 | EU under-16 AI parental consent flow control weakness (details withheld) |
| LL-57fa21cfc2 | High | open | COPPA, FERPA | 2026-09-16 | Under-13 offboarding consent-pending enforcement gap (decision pending; details withheld) |
| LL-e981aad7a6 | High | open | COPPA, FERPA | 2026-09-16 | Supervisor-access consent routing for under-13 communicators (details withheld) |
| LL-dbc950d96d | High | open | GDPR, COPPA, FERPA | 2026-09-16 | Supervisor-relationship rows are never erased when either account is deleted |
| LL-85b32935c2 | High | open | SOC2, FERPA, HIPAA | 2026-09-16 | Device session token strength (details withheld) |
| LL-7bf58a4c53 | High | open | WCAG | 2026-09-16 | Classic speak-view chrome has icon-only controls with no accessible name |
| LL-a4b5fb1445 | High | open | FERPA, GDPR, SOC2 | 2026-09-17 | Organization membership authorization weakness in supervisor-key processing (details withheld) |
| LL-1f83f4e778 | High | open | FERPA, SOC2 | 2026-09-17 | Lesson access-control defect, fixed in code; residual-access verification pending (details withheld) |

Age note: twelve of these were first seen on or before 2026-08-12 and are past the 30-day
advisory SLA ceiling. The 2026-09-16 and 2026-09-17 rows are within the 15-day floor.

---

## 3. Current posture by framework

Live = `open` + `remediated-unverified`, derived at this date. A finding can map to more than one
framework, so rows do not sum to 186. Twenty-seven live findings carry no framework tag
(engineering, API-contract and dependency items); none of them is a Critical or High.

| Framework | Live | Live Critical + High |
|---|---:|---:|
| SOC 2 | 69 | 18 |
| FERPA | 59 | 25 |
| GDPR | 49 | 17 |
| HIPAA | 42 | 13 |
| WCAG | 34 | 3 |
| COPPA | 25 | 15 |

---

## 4. Decisions pending for Scot

Surfaced, not decided. No AI closes a finding, downgrades severity, accepts risk, or attests a
customer-facing document.

1. **The 0-Critical gating metric is not met.** Two Critical findings are open. `LL-1baffd92d5`
   has a candidate fix under private review that does not yet close it; technical detail is
   withheld under the disclosure policy. `LL-676f91f26b` has a merged code fix (PR #944, on
   `develop` since 2026-09-06 and on `main`), but its register row is still `open` with no
   disposition and no PR reference: it needs the CEO's verification and closure, or a
   `remediated-unverified` entry if verification is deferred.
2. **`LL-c0b3d59f58` remediation.** Both controls were applied on 2026-09-17: a preventive
   control that caused no operational disruption, and the least-privilege change that replaces
   the project-wide role on the non-owner human principals with a per-service set. A live IAM
   policy read on 2026-09-17 confirms that no non-owner human principal holds a project-wide
   primitive role. Closure still requires the CEO's verification and attestation; only the CEO
   closes a finding. Further detail stays in the private evidence store under the disclosure
   policy.
3. **`LL-1f83f4e778` residual-access verification.** The code fix merged (develop 2026-09-13,
   main 2026-09-15). The remaining step is a production data review to confirm no stale access
   persists. Note that the audited runner path writes an audit event, so this review is
   read-mostly rather than read-only and needs explicit authorization.
4. **Verification pass on ten `remediated-unverified` findings**, then attest closes. Six are
   High: `LL-a95e9c5f7c`, `LL-705b10bcd7`, `LL-90045bb29c`, `LL-f150e0e828`, `LL-a9d6d5a46b`,
   `LL-6af580a23a`.
5. **Triage the Q3 run's 35 new findings.** All are `open` and `untriaged` by construction. Nine
   carried an adversary severity-downgrade recommendation; those recommendations are recorded in
   the findings' notes and are not applied.
6. **Disclosure decision on two Q3 rows left in the clear.** `LL-dbc950d96d` (High) and
   `LL-232129d521` (Medium) still carry their full technical trace in the public register. Both
   are non-exploit classes whose underlying facts are readable in this public repository, so they
   were not minimized. Confirm that this is the intended treatment or direct minimization. Note
   also that two attested, frozen records describe the nature of `LL-c0b3d59f58` in one clause
   each, in pre-policy wording (`2026-09-14_compliance-posture-report.md`, "a human principal
   holding project-wide secretmanager/cloudsql admin"; `2026-09-14_compliance-program.md`,
   "project-wide admin on a human principal"). The minimization applies to register rows and to
   records created after 2026-09-17; those two clauses remain readable at HEAD, not only in
   history.
7. **Successor records for this retraction.** This document supersedes the 2026-09-14 snapshot.
   The 2026-08-30 counsel review memorandum receives a dated addendum rather than an edit. Its
   bytes are not frozen (it is a draft and unattested, so an in-place edit would be permitted);
   it is left as prepared because it is a review record for counsel and the register's
   `LL-c0b3d59f58` row directs successor-or-addendum handling. The memorandum has not been sent
   to counsel, so the addendum travels with it. Decision: insert a one-line pointer to the
   addendum under the memorandum's header now (a permitted edit of an unattested draft), or
   hold until the memorandum next changes. Both records need review; only the CEO attests.
8. **Run the make-up pass** (`rev-audit-run-q3-makeup`, due 2026-10-09) to close the partial
   coverage recorded on the audit pointer, and render the Q3 domain reports.
9. **Posture report successor.** The attested 2026-09-14 posture report's undated "Live Critical
   findings: 0" row is not current (correction 6). It is the most widely bundled of the three
   sibling records. Decide whether it gets a Path A successor now, or at its next natural
   revision, with this snapshot as the interim correcting statement.

---

## 5. Open roadmap

| Item | Owner | Timing | Notes |
|---|---|---|---|
| Close the two open Criticals | Scot / eng | Immediate | Neither is verified closed. One has a merged fix awaiting the CEO's verification (PR #944); the other has a candidate fix under private review. |
| Disposition or close the 38 live Highs | Scot / eng | SLA advisory 15 to 30 days | Twelve are already past the 30-day ceiling. Prioritize the data-bearing deletion and consent rows. |
| Verify and attest 10 `remediated-unverified` | Scot | Near-term | Fixes have landed; verification and closure are the CEO's act. |
| Verify and close `LL-c0b3d59f58` | Scot | Near-term | Both controls applied 2026-09-17 and confirmed by a live policy read; closure is the CEO's act. |
| Q3 make-up audit pass | Scot / compliance | Due 2026-10-09 | Closes the partial-coverage qualifier on the audit pointer. |
| Fix the finder guard and skill wiring | eng | Before the next run | `LL-c667ec15e3`. Without it, future runs repeat the same coverage gap. |
| Purge the pre-minimization public history | Scot | Requested | Detailed write-ups for two authorization findings were briefly public. Removing unreachable commits requires a vendor support request. |
| ACR / VPAT attestation | Scot | Before a district asks | Still draft in git and in the branded Drive mirror. |
| School SDPA / clinical BAA annexes | Scot / counsel | Draft | Annex A and Annex B still draft in Drive. |

---

## 6. Attestation

| Field | Value |
|---|---|
| Prepared by | Drafted by Claude Code (Opus 5) on 2026-09-17 on the CEO's instruction to correct the retracted closure without editing attested records; corrected and re-derived against develop `d76081fe9` by Claude Code (Fable 5.1) the same day |
| Reviewed by | Counts and every finding id in this document derived programmatically from `audit-reports/FINDINGS.json` at develop `d76081fe9` (2026-09-17); `citation-check.rb` green at PASS 234 / FAIL 0 / SKIP 17 on that commit; the `LL-c0b3d59f58` remediation state confirmed by a read-only IAM policy read on 2026-09-17 |
| Attested by | NOT YET ATTESTED - awaiting Scot Wahlquist, CEO |
| Attestation date | pending |

_Internal status snapshot. Headline counts are read from the register; every other audit-report
file is a point-in-time snapshot and is not authoritative for status. Only Scot closes findings
or sends customer-facing materials._
