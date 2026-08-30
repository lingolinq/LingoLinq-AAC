# LingoLinq Compliance Status Snapshot

**Date:** 2026-08-09 (original); content refreshed 2026-08-20; corrected 2026-08-22 (this successor); register counts updated 2026-08-30 (see "Update 2026-08-30" below)
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
| 3 | Article 50(1) enablement claim: "remains AVAILABLE-only" (:75) and "Overdue since 2026-08-02" (:176) | Restated as the CODE DEFAULT at `64cdccba1`, with the runtime source named, AND flagged as contradicted. The claim stated a RUNTIME fact but rested only on a code listing. `FeatureFlags` resolves the effective list through `SystemFeatureSettings.default_enabled_features` (`lib/system_feature_settings.rb:6-12`), a `Setting` DB row that falls back to the code constant only when unset. Separately, `docs/legal/2026-08-17_ai-data-flow-classification.md:132` -- CEO-attested 2026-08-19 -- records `article_50_disclosure_shown` TRUE on all 63 post-deploy `AiApiLog` rows, a column (`app/models/user.rb:1324-1331` at `64cdccba1`) set by `User#mark_article_50_disclosure_shown!` (`modal_ack` or `admin_backfill`), not independent proof of UI display. Enablement is the 2026-08-23 `Setting.get` / `feature_enabled_for?` read, not this column. **Production flag state WAS read on 2026-08-23: VERIFIED ENABLED. See `docs/legal/2026-08-23_article-50-production-flag-verification.md`.** |

## 1. Executive summary

LingoLinq runs compliance as a continuous findings register. This snapshot records what is done
since the 2026-07-23 Posture Report re-attest and what is still needed. It does not close any
finding or attest any control; only Scot does that.

Headline at staging commit `64cdccba1` (2026-08-20, publisher convention):

- **0 open Critical** findings (the gating metric).
- ~~**20 open High** findings (15 `open` + 5 `remediated-unverified`).~~ **14 as of 2026-08-30** (8 `open` + 6 `remediated-unverified`).
- ~~**52** open Medium, **40** open Low. **112** live total.~~ **61** Medium, **43** Low, **118** live total as of 2026-08-30.
- ~~Across all findings: 104 `open`, 8 `remediated-unverified`, 51 `verified-closed`, 5 `accepted-risk`, 2 `superseded`.~~ As of 2026-08-30: 109 `open`, 9 `remediated-unverified`, 58 `verified-closed`, 5 `accepted-risk`, 3 `superseded` (184 total).
- The 2026-08-12 six-finder full audit run added 40 new findings (9 High / 18 Medium / 13 Low)
  across privacy, infra, api, dependency, accessibility, and code-hygiene -- the single largest
  driver of the count rise since the 2026-08-09 draft. Notably several GCP production-access and
  logging gaps (WIF ref-lock LL-1e7b568ef3, no Data Access audit logging LL-b7ccc522b9, a
  human principal holding project-wide secretmanager/cloudsql admin LL-c0b3d59f58, public Cloud Run
  ingress LL-0b5443f43b).
- `citation-check.rb` status at this refresh: not re-run as part of this content-only pass; last
  known green per the register's run log (2026-08-12 run, PASS 150/FAIL 0/SKIP 15). Re-run before
  attesting if a fresh confirmation is wanted.

> **Update 2026-08-30.** The 2026-08-20 counts above are preserved struck through because this
> is a dated snapshot; the current figures follow each. The High count moved 20 -> 14 through a
> CEO triage of the open-High set on 2026-08-29/30 (PR #887): **seven** rows verified-closed
> (LL-7f7372e3eb, LL-854b1d3853, LL-16ef84ad9a, LL-522c1a6d13, LL-8908c7ac6f, LL-b7ccc522b9,
> LL-c0b3d59f58), **one** downgraded to Medium (LL-7d50b089c9), and **two** live Highs added
> since this snapshot (LL-5f0a016e2b; LL-3bfc56ef4b from PR #886). Medium and Low rose because
> that same window added findings at those severities. **LL-f150e0e828 did NOT close**: a
> verified-closed applied 2026-08-30 was retracted the same day because the remediation is not
> in the deployed production image (`a0b9df3ec` is not an ancestor of `origin/main`), so the
> COPPA seat-reclaim defect is live in production until that release ships. It remains
> `remediated-unverified` and is counted in the 14.

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
| Article 50(1) disclosure UI | Modal + ack + first-AI-use gate built; `article_50_disclosure` is AVAILABLE-only, not in `ENABLED_FRONTEND_FEATURES`, in `lib/feature_flags.rb` at `64cdccba1`. Code default only: `FeatureFlags` resolves the effective list from `SystemFeatureSettings.effective_enabled_for` (`lib/feature_flags.rb:132` at `64cdccba1` via `feature_enabled_for?` at `:155-158`), which resolves through `SystemFeatureSettings.default_enabled_features` (`lib/system_feature_settings.rb:6-12`) -- a `Setting` DB row that falls back to the code constant only when unset, a database override no code listing can show. **Production flag state WAS verified 2026-08-23: ENABLED in production via the `default_enabled_features` DB Setting (see `docs/legal/2026-08-23_article-50-production-flag-verification.md`).** | Built AND ENABLED in production, verified by direct read at `2026-08-23T21:04:12Z` (see `docs/legal/2026-08-23_article-50-production-flag-verification.md`). **No evidence establishes the flag's state on or before the 2026-08-02 obligation date**: the containing `Setting` row has no version history and was rewritten 2026-08-13, so this read attests 2026-08-23 only and must NOT be read as compliance across the obligation window. |
| Article 50 disclosure contrast (LL-a9d6d5a46b) | Found already fixed via #694 (2026-07-28, `$brand-verdigris-aa` token, 5.05:1 on white); register had gone stale showing it as open. Corrected to remediated-unverified 2026-08-19. | One of the two pre-enable accessibility blockers is remediated, pending Scot's verified-closed attestation. LL-104bfa61dc remains open. |
| AI Governance Memo | Re-attested 2026-08-04 (git). | Published; branded Drive mirror review date still older. |
| Bedrock / BAA claim correction | 2026-08-01 through 2026-08-07 corpus sweep; LL-1b0d78dbe6 filed, then **verified-closed 2026-08-11**. | Unverifiable Bedrock-account assertion retracted; closed operational window documented; check now landed and verified. |
| Subprocessor quarterly review | Performed 2026-08-08. | Two omissions found (recorded in review notes); list hygiene in progress. |
| 2026-08-12 six-finder full audit run | privacy, infra, api, dependency, accessibility, code-hygiene finders; 40 net-new findings (9 High). | Largest single driver of the count rise since this snapshot's original 2026-08-09 date; not narrated elsewhere in this document until this refresh. |
| Remediation pending verify | Five High + three Medium in `remediated-unverified` (was three High + two Medium at 2026-08-09). | Code/config changes landed; need fresh-context verification + Scot close. |
| Register hygiene | No `regression: true` findings at last full-run citation-check (2026-08-12, PASS 150/FAIL 0/SKIP 15; not re-run for this content-only refresh). | Evidence anchors for most findings still validate at pinned SHAs. |

### Live High findings (20 as of 2026-08-20; **14** as of 2026-08-30)

Ages computed against 2026-08-20. `LL-1b0d78dbe6` (Bedrock account-binding) verified-closed
2026-08-11 and no longer appears here.

**Status column updated 2026-08-30** (PR #887). Rows that left the live-High set are struck
through and annotated in place rather than deleted, so the 2026-08-20 snapshot stays readable.
Two live Highs added after this snapshot are NOT in this table: LL-5f0a016e2b (attested memo
states the Bedrock path is not operational) and LL-3bfc56ef4b (ALLOWED_RUNTIME_MODELS cannot
constrain direct AWS API use, added by PR #886).

| ID | Status | Frameworks | Age (d) | Title |
|---|---|---|---|---|
| LL-7f7372e3eb | ~~open~~ **verified-closed 2026-08-30; the control IS operative (bin/rails pre-boot guard + console/runner AuditEvent hooks). Title text below is the stale pre-closure description** | SOC2, HIPAA | 58 | Audited-console control not operative (per-session AuditEvent still missing; title/evidence still mention Heroku and need re-anchor) |
| LL-a95e9c5f7c | remediated-unverified | SOC2 | 48 | Worker 512Mi memory limit / OOM kills |
| LL-705b10bcd7 | remediated-unverified | SOC2 | 48 | BoardDownstreamButtonSet S3 writes fail against KMS bucket |
| LL-90045bb29c | remediated-unverified | FERPA | 45 | Permanent non-expiring `User#user_token` in share URLs |
| LL-f150e0e828 | **remediated-unverified; STILL LIVE.** A 2026-08-30 closure was retracted the same day: the fix is not deployed to production | COPPA, GDPR | 42 | District seat reclaim to consumer trial without parental re-consent |
| LL-854b1d3853 | ~~open~~ **verified-closed 2026-08-30; Flusher sweeps both record types AND the fix is in the deployed image** | GDPR, FERPA, COPPA | 42 | Hard delete leaves UserVideo / off-board ButtonSound |
| LL-53cb93fab1 | open | GDPR, FERPA | 31 | Terms-agree modal can be replaced by intro before agree |
| LL-104bfa61dc | open | WCAG | 31 | Terms-agree modal unreachable by switch scanning |
| LL-a9d6d5a46b | remediated-unverified | WCAG | 29 | AI disclosure full-notice link low-contrast verdigris token (fix landed 2026-07-28 via #694; register caught up 2026-08-19) |
| LL-16ef84ad9a | ~~open~~ **verified-closed 2026-08-30; cache keyed on scrubbed text and tenant-scoped** | FERPA, HIPAA, GDPR | 18 | Word-prediction cache holds raw pre-scrubber utterance globally |
| LL-522c1a6d13 | ~~open~~ **verified-closed 2026-08-30; masquerade is audit-gated and fail-closed on both branches** | FERPA, HIPAA | 16 | Masquerade produces no AuditEvent |
| LL-e8614c103f | open | GDPR, FERPA, COPPA | 8 | PredictionEntry rows survive account deletion (2026-08-12 run) |
| LL-c0b3d59f58 | ~~open~~ **verified-closed 2026-08-30 on a live IAM policy read** | SOC2, HIPAA, FERPA | 8 | Human principal holds project-wide GCP secretmanager/cloudsql admin (2026-08-12 run) |
| LL-b7ccc522b9 | ~~open~~ **verified-closed 2026-08-30 on a live IAM policy read** | SOC2, HIPAA, FERPA | 8 | GCP production project has no Data Access audit logging (2026-08-12 run) |
| LL-8908c7ac6f | ~~open~~ **verified-closed 2026-08-30 on the egress claim; request_summary residual carried as Low LL-c259638711** | COPPA, FERPA, HIPAA, GDPR | 8 | Client-supplied context.topic reaches Bedrock unscrubbed (2026-08-12 run) |
| LL-7d50b089c9 | ~~open~~ **still open but DOWNGRADED to Medium 2026-08-30; no longer a High** | (none) | 8 | BoardVersion/UserVersion history exposes raw PaperTrail version.id (2026-08-12 run) |
| LL-6af580a23a | remediated-unverified | SOC2, HIPAA, FERPA | 8 | Redis RDB snapshot was tracked in git, shipped in every container image (2026-08-12 run) |
| LL-5617f4e17d | open | SOC2, HIPAA, FERPA | 8 | No server-side password strength policy (2026-08-12 run) |
| LL-1e7b568ef3 | open | SOC2, HIPAA | 8 | Committed WIF provisioning script omits the assertion.ref branch lock (2026-08-12 run) |
| LL-0b5443f43b | open | SOC2, HIPAA | 8 | Production Cloud Run service has public ingress, bypassing Cloud Armor (2026-08-12 run) |

~~Eight Highs are past the 15-30 day advisory SLA (LL-7f7372e3eb, LL-a95e9c5f7c, LL-705b10bcd7,
LL-90045bb29c, LL-f150e0e828, LL-854b1d3853, LL-53cb93fab1, LL-104bfa61dc).~~ **As of 2026-08-30, six of those remain past SLA: LL-a95e9c5f7c, LL-705b10bcd7, LL-90045bb29c, LL-f150e0e828, LL-53cb93fab1, LL-104bfa61dc. LL-7f7372e3eb and LL-854b1d3853 are verified-closed.** The nine findings
from the 2026-08-12 run are ~~all still within SLA (8 days old)~~ **18 days old as of 2026-08-30, i.e. past the 15-day floor of the High SLA band stated above**.

---

## 3. Current posture by framework

Live = `open` + `remediated-unverified` at `64cdccba1`. A finding can map to more than one framework, so
rows do not sum to ~~112~~ **118 (2026-08-30)**. Nineteen live findings carry no framework tag
(engineering / API-contract / dependency items; ~~one High, LL-7d50b089c9~~ **as of 2026-08-30 none
is a High: LL-7d50b089c9 was downgraded to Medium, and all 14 live Highs carry frameworks**).

Counts struck through are 2026-08-20; the figure after each is recomputed 2026-08-30 from
`audit-reports/FINDINGS.json` (live = `open` + `remediated-unverified`). Notes below still
describe the 2026-08-20 composition and are not restated per row.

| Framework | Live | Live High | Notes |
|---|---:|---:|---|
| FERPA | ~~36~~ 31 | ~~11~~ 5 | Includes token share URLs, masquerade audit, deletion residuals, prediction cache, plus several from the 2026-08-12 run. |
| HIPAA | ~~27~~ 26 | ~~10~~ 6 | Bedrock account binding (now closed), masquerade, prediction cache, audited console, plus GCP access/logging gaps from the 2026-08-12 run. |
| GDPR | ~~22~~ 28 | ~~6~~ 3 | Deletion/erasure, seat reclaim, prediction cache, terms modal, Article 50 transparency. |
| COPPA | ~~10~~ 10 | ~~4~~ 2 | Seat reclaim (LL-f150e0e828); hard-delete media (LL-854b1d3853); two new from the 2026-08-12 run (context.topic to Bedrock LL-8908c7ac6f; PredictionEntry deletion residual LL-e8614c103f). |
| WCAG | ~~19~~ 19 | ~~2~~ 2 | Terms scanning (LL-104bfa61dc, open); Article 50 disclosure contrast (LL-a9d6d5a46b, remediated-unverified as of 2026-08-19). |
| SOC 2 | ~~43~~ 44 | ~~9~~ 8 | Worker memory, S3 KMS writes, audited console, plus GCP production-access/logging and public-ingress gaps from the 2026-08-12 run. |

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
   remediated-unverified. **`article_50_disclosure` is already ENABLED in production**, verified
   2026-08-23 by direct read (`docs/legal/2026-08-23_article-50-production-flag-verification.md`):
   present in the `default_enabled_features` DB Setting and resolving true for all 34 of 34 users.
   The enable-or-write-a-rationale choice this snapshot originally posed is **moot: production
   already enabled it.** Three residuals survive that decision, and they are not the ones the
   original either/or anticipated:
   (a) **no dated enablement rationale exists** -- enablement happened without the contemporaneous
   record this paragraph warned was necessary, which is the "silence leaves no defensible record"
   outcome, not the avoidance of it;
   (b) **enabled-since is unrecoverable**, so the gap between the 2026-08-02 obligation date and
   the 2026-08-23 verification cannot be characterised either way;
   (c) **LL-104bfa61dc, named here as a pre-enable prerequisite, was never cleared** -- enablement
   preceded it rather than following it. Note the prerequisite framing itself is weaker than it
   reads: LL-104bfa61dc is scoped to the TERMS-AGREE modal; the AI disclosure modal is opened with `scannable: true` (`app/frontend/app/utils/article50_gate.js:108,141`) and carries `.modal_targets` and a `.btn` (`app/frontend/app/components/ai-disclosure.hbs:51,56`), so treating it as a hard pre-enable blocker for THIS modal is not supported by the code. It remains a shared-component confidence concern pending a runtime switch-scanning check.
   Plan doc `DOC-771d214850` is still draft with review date 2026-08-02 (overdue).
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
   *Done 2026-08-29:* LL-522c1a6d13, LL-16ef84ad9a, LL-b7ccc522b9 and LL-c0b3d59f58 are
   verified-closed; LL-1e7b568ef3 and LL-0b5443f43b were re-verified and remain open at High.
6. ~~**Approve re-anchor of LL-7f7372e3eb**~~ *Resolved 2026-08-29: verified-closed, not
   re-anchored.* The premise of this item is obsolete. The Reline / AuditEvent gap no longer
   exists: the Readline monkeypatch was replaced by line-editor-agnostic Rails `console`/`runner`
   hooks that write a session-open `AuditEvent` fail-closed, and `bin/rails` refuses an un-keyed
   console/runner in production before boot. The surviving residual is narrower and is recorded in
   the finding's closure evidence: `USER_KEY` is self-asserted free text, so the attributed actor
   is spoofable by anyone who already has a shell on the app.
7. **Calendar row `fix-euaiact-art50-2026-08-02`:** move from `upcoming` to `passed-enforceable`
   with a linked ongoing review (mirrors COPPA pattern). Drafted in this package if accepted.

---

## 5. Open roadmap / what is needed

| Item | Owner | Timing | Notes |
|---|---|---|---|
| ~~Close or disposition the 20 live Highs~~ **14 live Highs as of 2026-08-30** | Scot / eng | SLA advisory 15-30d (~~8~~ **6** already past as of 2026-08-30) | Prioritize data-bearing: LL-16ef84ad9a, LL-522c1a6d13, LL-f150e0e828, LL-854b1d3853, plus the 2026-08-12 GCP access/logging set. |
| ~~Verify + attest 8 remediated-unverified~~ **9 as of 2026-08-30** | Scot | Near-term | LL-90045bb29c, LL-a95e9c5f7c, LL-705b10bcd7, LL-a9d6d5a46b, LL-6af580a23a (High); LL-5954bcbbe6, LL-a167848115, LL-6723438462 (Medium). **Added 2026-08-30: LL-f150e0e828 (High)**, restored to remediated-unverified when its 2026-08-30 closure was retracted (the fix is not deployed to production). |
| Article 50(1) enablement decision | Scot / product | **VERIFIED ENABLED IN PRODUCTION 2026-08-23** (~~Overdue since 2026-08-02~~) | **CONTRADICTION RESOLVED 2026-08-23 - PRODUCTION VERIFIED ENABLED.** `docs/legal/2026-08-17_ai-data-flow-classification.md:132`, itself CEO-attested 2026-08-19, records a live production read: `article_50_disclosure_shown` is TRUE on all 63 post-deploy `AiApiLog` rows. That column comes from `User#article_50_disclosure_shown?` (`app/models/user.rb:1324-1331` at `64cdccba1`), which returns true only when the user's `settings['ai_transparency']` carries a `shown_at` AND a matching `disclosures_version`. That bit can also be set by `admin_backfill` or by posting the acknowledgement endpoint; it is not proof the UI rendered, and it is not the evidence for enablement. Enablement is the `Setting.get` / `feature_enabled_for?` read below. (Scope caveat from that same record: the 63 rows come from 2 accounts, consistent with internal pre-tenant testing.) **RESOLVED 2026-08-23 - PRODUCTION VERIFIED ENABLED.** Production was read through the application path: `Setting.get('default_enabled_features')` CONTAINS `article_50_disclosure`, and `FeatureFlags.feature_enabled_for?('article_50_disclosure', user)` resolved TRUE for every user probed at `2026-08-23T21:04:12Z` (`RAILS_ENV=production`, image `web:73a8f633`). No org, beta or canary layer modifies it: production holds 2 organizations, 0 EU-stamped and 0 carrying any feature override, and neither the canary nor the beta `Setting` row exists. Enabled-SINCE date is NOT recoverable - `Setting` carries no PaperTrail history (0 version rows) and `Setting.set` overwrites in place; the containing row was created `2026-08-04T07:19:11Z` and last written `2026-08-13T00:03:56Z`, and nothing records which features the list held at either write. Full record: `docs/legal/2026-08-23_article-50-production-flag-verification.md`. Prior status text follows: Server-side backstop complete (#829/#831); WCAG contrast blocker LL-a9d6d5a46b is now remediated-unverified. LL-104bfa61dc (terms-agree modal switch scanning) remains the open blocker. |
| ACR / VPAT attestation | Scot | Before district asks; calendar refresh 2026-12-13 | Git + branded Drive still `draft`. |
| Overdue monthly-light audit | Scot / compliance | Overdue 26d | Register has had no scan stamp since 2026-07-08. |
| Overdue COPPA quarterly check | Scot / privacy | Overdue 14d | Only ongoing verification linked to passed-enforceable COPPA rule. |
| Sept 1 review cluster | Scot | Due 2026-09-01 | FERPA annual, GDPR DPA/RoPA, SOC2 quarterly, ZDR re-verify, Gemini BAA path, secret-rejector build, breach-runbook Drive remirror (2026-08-31). |
| Render decommission / restrict | Scot / infra | Pending explicit go | Retires accepted-risk LL-aacae48768 path ~~and Render-tail of LL-7f7372e3eb~~ once fallback is gone. (LL-7f7372e3eb verified-closed 2026-08-30; no Render tail remains for it.) |
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
| Reviewed by | Claude Code content-accuracy pass 2026-08-20 (every cited finding ID cross-checked against the live register); adversary review run on PR #838, #845 and #846 (the #846 pass produced the Section 15 fidelity, citation-anchor and provenance corrections recorded above) |
| Attested by | NOT YET ATTESTED - awaiting Scot Wahlquist, CEO |
| Attestation date | pending |

_Internal status snapshot. Headline counts are read from the register; every other audit-report
file is a point-in-time snapshot and is not authoritative for status. Only Scot closes findings
or sends customer-facing materials._
