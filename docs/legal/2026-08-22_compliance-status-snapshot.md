# LingoLinq Compliance Status Snapshot

**Date:** 2026-08-09 (original); content refreshed 2026-08-20; corrected 2026-08-22 (this successor)
**Owner:** Privacy Office (privacy@lingolinq.com)
**Trigger:** Post–Gate 1 operate-mode maintenance: EU AI Act Article 50 date (2026-08-02) has
passed; the customer-facing Posture Report still claims **8** open High from the 2026-07-23
re-attest while the live register at `64cdccba1` reads **20** High (up from 12 at the 2026-08-09
draft, almost entirely from the 2026-08-12 six-finder full audit run); overdue monthly-light audit
and COPPA quarterly retention checks need surfacing.
**Status:** DRAFT - awaiting attestation. Successor via Path A supersession to attested
`docs/legal/COMPLIANCE_STATUS_2026-08-09.md` (ATTESTED 2026-08-20 by Scot Wahlquist, CEO),
correcting the defects listed in "Corrections in this successor" below, which include the
Article 50(1) enablement claim. Headline counts are re-derived from
`audit-reports/FINDINGS.json` as committed at staging commit `64cdccba1` (2026-08-20; publisher
convention: `open` + `remediated-unverified` by severity). Register `meta.auditedSha` is
`59f502aa4` (auditedDate 2026-08-18, a monthly light-run restamp) with the last full 6-finder scan
at `d67ed76e0a1` (auditedDate 2026-08-12); it records the last full audit *run*, not the last
register edit.
**Related:** `audit-reports/FINDINGS.json` (source of truth),
`docs/legal/2026-08-20_compliance-posture-report.md` (ATTESTED 2026-08-20, same transaction as
this snapshot's PREDECESSOR's attestation; this successor is unattested),
`docs/legal/2026-08-20_compliance-program.md` (ATTESTED 2026-08-20, same transaction),
`docs/legal/2026-08-09_compliance-posture-report_draft.md` (unattested, superseded by the above),
`docs/legal/2026-08-09_compliance-program_draft.md` (unattested, superseded by the above),
`docs/legal/COMPLIANCE_POSTURE_REPORT.md` (attested 2026-07-23, frozen, superseded),
`docs/legal/COMPLIANCE_PROGRAM.md` (attested 2026-08-04, frozen, superseded),
`docs/legal/AI_GOVERNANCE_MEMO.md`, `docs/legal/SUBPROCESSORS.md`,
`audit-reports/compliance-calendar.md`, `docs/legal/COMPLIANCE_STATUS_2026-06-18.md` (prior
snapshot, superseded).

---

## Corrections in this successor

This successor exists only to correct defects carried by its predecessor. Every count, finding
id and framework figure is otherwise unchanged, and the snapshot boundary is still `64cdccba1` --
these corrections do not move the derivation to a later commit. The one substantive claim that
IS corrected is the Article 50(1) enablement claim; see the row for it below.

| # | Defect in `COMPLIANCE_STATUS_2026-08-09.md` | Correction |
|---|---|---|
| 1 | "added 46 new findings (9 High / 22 Medium / 15 Low)" (:43) and "46 net-new findings (9 High)" (:80) | 40 (9 / 18 / 13). Verified against `firstSeen: 2026-08-12` in the register and `audit-reports/run-log/runs.jsonl` (`"new": 40`, 40-element `newIds`). Wrong at every commit. |
| 2 | "the live register at HEAD now reads **20** High" (:7) and "Live = `open` + `remediated-unverified` at HEAD" (:120) | pinned to `` `64cdccba1` ``. Values unchanged. |
| 3 | Article 50(1) enablement claim: "remains AVAILABLE-only" | Restated as the CODE DEFAULT at `64cdccba1`, with the runtime source named, AND flagged as contradicted | The claim stated a RUNTIME fact but rested only on a code listing. `FeatureFlags` resolves the effective list through `SystemFeatureSettings.default_enabled_features` (`lib/system_feature_settings.rb:6-12`), a `Setting` DB row that falls back to the code constant only when unset. Separately, `docs/legal/2026-08-17_ai-data-flow-classification.md:132` -- CEO-attested 2026-08-19 -- records `article_50_disclosure_shown` TRUE on all 63 post-deploy `AiApiLog` rows, a column (`app/models/user.rb:1532-1539`) that is true only after an actual modal acknowledgement. **Production flag state must be read before this document is attested.** | (:88), and "Overdue since 2026-08-02" (:189)

## 1. Executive summary

LingoLinq runs compliance as a continuous findings register. This snapshot records what is done
since the 2026-07-23 Posture Report re-attest and what is still needed. It does not close any
finding or attest any control; only Scot does that.

Headline at staging commit `64cdccba1` (2026-08-20, publisher convention):

- **0 open Critical** findings (the gating metric).
- **20 open High** findings (15 `open` + 5 `remediated-unverified`).
- **52** open Medium, **40** open Low. **112** live total (`open` + `remediated-unverified`).
- Across all findings: 104 `open`, 8 `remediated-unverified`, 51 `verified-closed`, 5
  `accepted-risk`, 2 `superseded`.
- The 2026-08-12 six-finder full audit run added 40 new findings (9 High / 18 Medium / 13 Low)
  across privacy, infra, api, dependency, accessibility, and code-hygiene -- the single largest
  driver of the count rise since the 2026-08-09 draft. Notably several GCP production-access and
  logging gaps (WIF ref-lock LL-1e7b568ef3, no Data Access audit logging LL-b7ccc522b9, a
  human principal holding project-wide secretmanager/cloudsql admin LL-c0b3d59f58, public Cloud Run
  ingress LL-0b5443f43b).
- `citation-check.rb` status at this refresh: not re-run as part of this content-only pass; last
  known green per the register's run log (2026-08-12 run, PASS 150/FAIL 0/SKIP 15). Re-run before
  attesting if a fresh confirmation is wanted.

The Posture Report attested at the time this snapshot was first drafted (2026-07-23) showed
**8 High / 27 Medium**; the currently attested one is `docs/legal/2026-08-20_compliance-posture-report.md`
at 0 / 20 / 52 / 40. That figure was
accurate at an early-2026-07-23 register state and drifted the same day; three further Highs were
promoted from PR review on 2026-08-02/08-04, then the 2026-08-12 six-finder run added 9 more. The
Posture Report successor now in this package for Scot's attestation is
`docs/legal/2026-08-22_compliance-posture-report.md` at the same 0 / 20 / 52 / 40; the
2026-08-09 draft it descends from is superseded (Path A
supersession; attested predecessor left untouched).

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
| Article 50(1) server-side backstop | All 5 AI ingresses now call `require_article_50_disclosure!` (#829, #831, 2026-08-19), up from 2 of 5. LL-6723438462 moved open -> remediated-unverified. | Enabling the flag would no longer produce silent partial enforcement. |
| Article 50(1) disclosure UI | Modal + ack + first-AI-use gate built; `article_50_disclosure` is AVAILABLE-only, not in `ENABLED_FRONTEND_FEATURES`, in `lib/feature_flags.rb` at `64cdccba1`. Code default only: `FeatureFlags` resolves the effective list from `SystemFeatureSettings.effective_enabled_for` (`lib/feature_flags.rb:132` via `feature_enabled_for?` at `:155-158`), which resolves through `SystemFeatureSettings.default_enabled_features` (`lib/system_feature_settings.rb:6-12`) -- a `Setting` DB row that falls back to the code constant only when unset, a database override no code listing can show. **Production flag state must be verified before attestation.** | Built; runtime enablement NOT verified. Production state must be checked before attestation. Obligation date passed 2026-08-02. |
| Article 50 disclosure contrast (LL-a9d6d5a46b) | Found already fixed via #694 (2026-07-28, `$brand-verdigris-aa` token, 5.05:1 on white); register had gone stale showing it as open. Corrected to remediated-unverified 2026-08-19. | One of the two pre-enable accessibility blockers is remediated, pending Scot's verified-closed attestation. LL-104bfa61dc remains open. |
| AI Governance Memo | Re-attested 2026-08-04 (git). | Published; branded Drive mirror review date still older. |
| Bedrock / BAA claim correction | 2026-08-01 through 2026-08-07 corpus sweep; LL-1b0d78dbe6 filed, then **verified-closed 2026-08-11**. | Unverifiable Bedrock-account assertion retracted; closed operational window documented; check now landed and verified. |
| Subprocessor quarterly review | Performed 2026-08-08. | Two omissions found (recorded in review notes); list hygiene in progress. |
| 2026-08-12 six-finder full audit run | privacy, infra, api, dependency, accessibility, code-hygiene finders; 40 net-new findings (9 High). | Largest single driver of the count rise since this snapshot's original 2026-08-09 date; not narrated elsewhere in this document until this refresh. |
| Remediation pending verify | Five High + three Medium in `remediated-unverified` (was three High + two Medium at 2026-08-09). | Code/config changes landed; need fresh-context verification + Scot close. |
| Register hygiene | No `regression: true` findings at last full-run citation-check (2026-08-12, PASS 150/FAIL 0/SKIP 15; not re-run for this content-only refresh). | Evidence anchors for most findings still validate at pinned SHAs. |

### Live High findings (20)

Ages computed against 2026-08-20. `LL-1b0d78dbe6` (Bedrock account-binding) verified-closed
2026-08-11 and no longer appears here.

| ID | Status | Frameworks | Age (d) | Title |
|---|---|---|---|---|
| LL-7f7372e3eb | open | SOC2, HIPAA | 58 | Audited-console control not operative (per-session AuditEvent still missing; title/evidence still mention Heroku and need re-anchor) |
| LL-a95e9c5f7c | remediated-unverified | SOC2 | 48 | Worker 512Mi memory limit / OOM kills |
| LL-705b10bcd7 | remediated-unverified | SOC2 | 48 | BoardDownstreamButtonSet S3 writes fail against KMS bucket |
| LL-90045bb29c | remediated-unverified | FERPA | 45 | Permanent non-expiring `User#user_token` in share URLs |
| LL-f150e0e828 | open | COPPA, GDPR | 42 | District seat reclaim to consumer trial without parental re-consent |
| LL-854b1d3853 | open | GDPR, FERPA, COPPA | 42 | Hard delete leaves UserVideo / off-board ButtonSound |
| LL-53cb93fab1 | open | GDPR, FERPA | 31 | Terms-agree modal can be replaced by intro before agree |
| LL-104bfa61dc | open | WCAG | 31 | Terms-agree modal unreachable by switch scanning |
| LL-a9d6d5a46b | remediated-unverified | WCAG | 29 | AI disclosure full-notice link low-contrast verdigris token (fix landed 2026-07-28 via #694; register caught up 2026-08-19) |
| LL-16ef84ad9a | open | FERPA, HIPAA, GDPR | 18 | Word-prediction cache holds raw pre-scrubber utterance globally |
| LL-522c1a6d13 | open | FERPA, HIPAA | 16 | Masquerade produces no AuditEvent |
| LL-e8614c103f | open | GDPR, FERPA, COPPA | 8 | PredictionEntry rows survive account deletion (2026-08-12 run) |
| LL-c0b3d59f58 | open | SOC2, HIPAA, FERPA | 8 | Human principal holds project-wide GCP secretmanager/cloudsql admin (2026-08-12 run) |
| LL-b7ccc522b9 | open | SOC2, HIPAA, FERPA | 8 | GCP production project has no Data Access audit logging (2026-08-12 run) |
| LL-8908c7ac6f | open | COPPA, FERPA, HIPAA, GDPR | 8 | Client-supplied context.topic reaches Bedrock unscrubbed (2026-08-12 run) |
| LL-7d50b089c9 | open | (none) | 8 | BoardVersion/UserVersion history exposes raw PaperTrail version.id (2026-08-12 run) |
| LL-6af580a23a | remediated-unverified | SOC2, HIPAA, FERPA | 8 | Redis RDB snapshot was tracked in git, shipped in every container image (2026-08-12 run) |
| LL-5617f4e17d | open | SOC2, HIPAA, FERPA | 8 | No server-side password strength policy (2026-08-12 run) |
| LL-1e7b568ef3 | open | SOC2, HIPAA | 8 | Committed WIF provisioning script omits the assertion.ref branch lock (2026-08-12 run) |
| LL-0b5443f43b | open | SOC2, HIPAA | 8 | Production Cloud Run service has public ingress, bypassing Cloud Armor (2026-08-12 run) |

Eight Highs are past the 15-30 day advisory SLA (LL-7f7372e3eb, LL-a95e9c5f7c, LL-705b10bcd7,
LL-90045bb29c, LL-f150e0e828, LL-854b1d3853, LL-53cb93fab1, LL-104bfa61dc). The nine findings
from the 2026-08-12 run are all still within SLA (8 days old).

---

## 3. Current posture by framework

Live = `open` + `remediated-unverified` at `64cdccba1`. A finding can map to more than one framework, so
rows do not sum to 112. Nineteen live findings carry no framework tag (engineering / API-contract /
dependency items; one High, LL-7d50b089c9).

| Framework | Live | Live High | Notes |
|---|---:|---:|---|
| FERPA | 36 | 11 | Includes token share URLs, masquerade audit, deletion residuals, prediction cache, plus several from the 2026-08-12 run. |
| HIPAA | 27 | 10 | Bedrock account binding (now closed), masquerade, prediction cache, audited console, plus GCP access/logging gaps from the 2026-08-12 run. |
| GDPR | 22 | 6 | Deletion/erasure, seat reclaim, prediction cache, terms modal, Article 50 transparency. |
| COPPA | 10 | 4 | Seat reclaim (LL-f150e0e828); hard-delete media (LL-854b1d3853); two new from the 2026-08-12 run (context.topic to Bedrock LL-8908c7ac6f; PredictionEntry deletion residual LL-e8614c103f). |
| WCAG | 19 | 2 | Terms scanning (LL-104bfa61dc, open); Article 50 disclosure contrast (LL-a9d6d5a46b, remediated-unverified as of 2026-08-19). |
| SOC 2 | 43 | 9 | Worker memory, S3 KMS writes, audited console, plus GCP production-access/logging and public-ingress gaps from the 2026-08-12 run. |

---

## 4. Decisions pending for Scot

Surfaced, not decided. No AI closes a finding, downgrades severity, accepts risk, or attests a
customer-facing doc.

1. ~~**Re-attest the Posture Report** at **0 Critical / 20 High / 52 Medium / 40 Low**~~ **DONE
   2026-08-20**, in the same attestation transaction as this snapshot's PREDECESSOR: `docs/legal/2026-08-20_compliance-posture-report.md`
   and `docs/legal/2026-08-20_compliance-program.md` (Path A supersession off the unattested
   `_draft` files, per the grandfathered-`_draft` transition rule in `docs/legal/README.md`).
   Branded Drive mirror (`DOC-ae3f9d06ef`) remains a separate operator refresh.
2. **Article 50 position (obligation live since 2026-08-02).** The server-side disclosure backstop
   now covers all 5 AI ingresses (#829/#831), and the contrast blocker (LL-a9d6d5a46b) is
   remediated-unverified. Either enable `article_50_disclosure` for EU-resolved users after
   clearing LL-104bfa61dc (the remaining open blocker) and attesting the two remediated-unverified
   findings closed, or record a dated rationale that the current AI surface does not trigger 50(1).
   Silence leaves no defensible record. Plan doc `DOC-771d214850` is still draft with review date
   2026-08-02 (overdue).
3. **Run overdue calendar work:** the 2026-08-12 six-finder run and 2026-08-18 monthly-light
   restamp have both landed since this snapshot was originally drafted, so the audit-cadence
   overdue items from the 2026-08-09 version are resolved. Next *full* audit is
   `rev-audit-run-quarterly-full` on 2026-09-14; confirm COPPA retention + parental-consent check
   cadence separately, as it is tracked on its own schedule, not the audit-run cadence.
4. **Verification pass on eight `remediated-unverified` findings** (five High: LL-90045bb29c,
   LL-a95e9c5f7c, LL-705b10bcd7, LL-a9d6d5a46b, LL-6af580a23a; three Medium: LL-5954bcbbe6,
   LL-a167848115, LL-6723438462), then attest closes.
5. **Triage untriaged Highs**, especially LL-522c1a6d13 (masquerade AuditEvent), LL-16ef84ad9a
   (pre-scrubber utterance cache), and the new 2026-08-12 GCP production-access/logging Highs
   (LL-1e7b568ef3, LL-b7ccc522b9, LL-c0b3d59f58, LL-0b5443f43b).
6. **Approve re-anchor of LL-7f7372e3eb** so title/evidence match rewritten `bin/audit_console`
   (finding stays open for the residual Reline / AuditEvent gap).
7. **Calendar row `fix-euaiact-art50-2026-08-02`:** move from `upcoming` to `passed-enforceable`
   with a linked ongoing review (mirrors COPPA pattern). Drafted in this package if accepted.

---

## 5. Open roadmap / what is needed

| Item | Owner | Timing | Notes |
|---|---|---|---|
| Close or disposition the 20 live Highs | Scot / eng | SLA advisory 15-30d (8 already past) | Prioritize data-bearing: LL-16ef84ad9a, LL-522c1a6d13, LL-f150e0e828, LL-854b1d3853, plus the 2026-08-12 GCP access/logging set. |
| Verify + attest 8 remediated-unverified | Scot | Near-term | LL-90045bb29c, LL-a95e9c5f7c, LL-705b10bcd7, LL-a9d6d5a46b, LL-6af580a23a (High); LL-5954bcbbe6, LL-a167848115, LL-6723438462 (Medium). |
| Article 50(1) enablement decision | Scot / product | **UNVERIFIED - may already be enabled** (~~Overdue since 2026-08-02~~) | **CONTRADICTED BY ATTESTED EVIDENCE - DO NOT REPEAT UNTIL RESOLVED.** `docs/legal/2026-08-17_ai-data-flow-classification.md:132`, itself CEO-attested 2026-08-19, records a live production read: `article_50_disclosure_shown` is TRUE on all 63 post-deploy `AiApiLog` rows. That column comes from `User#article_50_disclosure_shown?` (`app/models/user.rb:1532-1539`), which returns true only when the user's `settings['ai_transparency']` carries a `shown_at` AND a matching `disclosures_version` -- i.e. only after an actual modal acknowledgement. A disclosure never enabled cannot produce that. (Scope caveat from that same record: the 63 rows come from 2 accounts, consistent with internal pre-tenant testing.) Resolve by reading `SystemFeatureSettings.default_enabled_features` in production before this document is attested. Prior status text follows: Server-side backstop complete (#829/#831); WCAG contrast blocker LL-a9d6d5a46b is now remediated-unverified. LL-104bfa61dc (terms-agree modal switch scanning) remains the open blocker. |
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
| Prepared by | compliance-officer role (draft, 2026-08-09); content refreshed by Claude Code 2026-08-20 |
| Reviewed by | Claude Code content-accuracy pass 2026-08-20 (every cited finding ID cross-checked against the live register); adversary review not separately run |
| Attested by | NOT YET ATTESTED - awaiting Scot Wahlquist, CEO |
| Attestation date | pending |

_Internal status snapshot. Headline counts are read from the register; every other audit-report
file is a point-in-time snapshot and is not authoritative for status. Only Scot closes findings
or sends customer-facing materials._
