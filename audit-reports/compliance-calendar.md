# LingoLinq-AAC Compliance Calendar

> Generated from `compliance-calendar.json` (the source of truth). Do not hand-edit this
> render; regenerate it from the JSON via `ruby scripts/compliance-calendar-render.rb`.
> A review is only "done" when Scot attests; `nextDue` is advisory scheduling, not a compliance claim.
>
> Generated: 2026-08-07 | Owner: compliance-officer (drafts/surfaces); Scot Wahlquist (attests completion)

## Due within 90 days or overdue (surface these first)

| Date | Item | Framework | Cadence |
|---|---|---|---|
| 2026-07-14 | Monthly light /audit-run (diff-since-last-run scope, no full re-scan) | SOC2 | monthly |
| 2026-07-26 | COPPA data-retention enforcement + parental-consent flow check | COPPA | quarterly |
| 2026-08-31 | Re-brand + re-share BREACH_RUNBOOK Drive mirror to v2.2 (DOC-f576f43250) | HIPAA | one-time |
| 2026-09-01 | FERPA vendor-disclosure + directory-info posture review | FERPA | annual |
| 2026-09-01 | GDPR DPA + RoPA + data-residency review | GDPR | annual |
| 2026-09-01 | SOC 2 control review (continuous monitoring posture) | SOC2 | quarterly |
| 2026-09-01 | OpenRouter ZDR re-verification (after every key rotation, plus quarterly) | SOC2 | event-driven + quarterly |
| 2026-09-01 | Google Gemini API fallback path BAA/DPA verification | HIPAA | annual |
| 2026-09-01 | Mechanical secret-shaped-string rejector in audit toolchain (LL-b5c30235d3) | SOC2 | one-time |
| 2026-09-14 | Full /audit-run (4 finders, full scope) + adversary verify - all frameworks | SOC2 | quarterly |

## Recurring reviews (full set)

| Framework | Review | Cadence | Last done | Next due |
|---|---|---|---|---|
| SOC2 | Full /audit-run (4 finders, full scope) + adversary verify - all frameworks | quarterly | 2026-06-14 | 2026-09-14 |
| SOC2 | Monthly light /audit-run (diff-since-last-run scope, no full re-scan) | monthly | 2026-06-14 | 2026-07-14 |
| FERPA | FERPA vendor-disclosure + directory-info posture review | annual | (none) | 2026-09-01 |
| HIPAA | HIPAA Security Rule risk assessment + BAA inventory review | annual | 2026-02-01 | 2027-02-01 |
| GDPR | GDPR DPA + RoPA + data-residency review | annual | (none) | 2026-09-01 |
| GDPR | Subprocessor list review (SUBPROCESSORS.md) | quarterly | 2026-08-08 | 2026-11-08 |
| COPPA | COPPA data-retention enforcement + parental-consent flow check | quarterly | 2026-04-26 | 2026-07-26 |
| SOC2 | SOC 2 control review (continuous monitoring posture) | quarterly | (none) | 2026-09-01 |
| WCAG | Accessibility Conformance Report (ACR/VPAT) refresh | semi-annual | (none) | 2026-12-13 |
| SOC2 | OpenRouter ZDR re-verification (after every key rotation, plus quarterly) | event-driven + quarterly | (none) | 2026-09-01 |
| HIPAA | Google Gemini API fallback path BAA/DPA verification | annual | (none) | 2026-09-01 |
| SOC2 | Mechanical secret-shaped-string rejector in audit toolchain (LL-b5c30235d3) | one-time | (none) | 2026-09-01 |
| FERPA | District DPA / SDPC NDPA renewals + registry listing | per-contract (track renewal dates as they are signed) | (none) | (none) |
| HIPAA | Re-brand + re-share BREACH_RUNBOOK Drive mirror to v2.2 (DOC-f576f43250) | one-time | (none) | 2026-08-31 |

## Review instructions, regulatory watch, and basis

The following details are part of each recurring review record. They are rendered so missed-cycle
context, required work, and the source basis remain visible with the schedule.

### Full /audit-run (4 finders, full scope) + adversary verify - all frameworks

- **Drafts:** Full fan-out: privacy/infra/api/dependency finders over the whole codebase, reconcile into FINDINGS.json via audit-merge.rb, adversary-verify every new/regressed finding in fresh context, citation-check green, render the quarterly unified report. Headline = open Critical/High counts (not a synthetic score).
- **Watch:** Quarterly heavy run catches drift across the full surface. Schedule early in the weekly Pro/Max plan window (heavy parallel Opus consumes weekly caps). First full run on the migrated .claude/ system was 2026-06-14 (audited SHA 1aa5d2db).
- **Basis:** plan 5.1, 9.1 (decision: quarterly full + monthly light); .claude/skills/audit-run cadence section

### Monthly light /audit-run (diff-since-last-run scope, no full re-scan)

- **Drafts:** Diff-scoped run: finders scan only what changed since the last run (orchestrator steps 0-5), reconcile + adversary-verify new/regressed findings, citation-check green. No quarterly report render unless something material surfaces.
- **Watch:** Light run is steps 0-5 only (no full re-scan, no quarterly report). Catches regressions between heavy runs without burning plan-cap headroom. nextDue is advisory scheduling, not a compliance claim.
- **Basis:** plan 5.1, 9.1; .claude/skills/audit-run cadence section

### FERPA vendor-disclosure + directory-info posture review

- **Drafts:** register hygiene + posture delta for school-district data flows
- **Watch:** FERPA NPRM on vendor-disclosure terms (RIN 1875-AA15) - in motion, nothing final; check quarterly
- **Basis:** plan 1.3

### HIPAA Security Rule risk assessment + BAA inventory review

- **Drafts:** BAA inventory (AWS BAA on file 2026-02; subprocessor BAAs), minimum-necessary review for hospital data
- **Watch:** Proposed HIPAA Security Rule update is still an NPRM, not law - build to the current rule, watch
- **Basis:** plan 1.3; docs/legal/AWS_BAA_ACCEPTED.md

### GDPR DPA + RoPA + data-residency review

- **Drafts:** RoPA refresh, DPA terms review, right-to-deletion path verification for EU clients
- **Watch:** EU AI Act intersects GDPR for EU clients - see fixed dates
- **Basis:** plan 1.3

### Subprocessor list review (SUBPROCESSORS.md)

- **Drafts:** updated subprocessor inventory + change notice draft (GDPR Art. 28(2) prior-notice posture)
- **Watch:** any new third-party data processor added to the stack triggers an off-cycle review. MISSED CYCLE, THEN PERFORMED: lastDone was null and nextDue 2026-09-01 until 2026-08-07, while docs/legal/SUBPROCESSORS.md recorded its last full line-by-line review as 2026-04-20. On a quarterly cadence from 2026-04-20 a cycle fell due 2026-07-20 and was not performed. Re-dating past that gap would have hidden an overdue Article 28 review because, at the time, the renderer surfaced only nextDue and never this field, so the CEO directed on 2026-08-08 that the review be PERFORMED instead. It was: every external host in lib/, app/models/, app/controllers/ and config/ was reconciled against the section 4 table, and it found two active processors absent from the register (Stripe, and iplocate.io, the latter with an ungated call site raised as LL-07f1869d92). Findings are recorded in SUBPROCESSORS.md section 4.1 and its 2026-08-08 change-log entry. lastDone 2026-08-08 reflects that performed review; nextDue 2026-11-08 is one quarter on. Note the many dated amendments in the change log are per-change updates, not the periodic full-register review this item tracks.
- **Basis:** plan 1.3, 2.5; docs/legal/SUBPROCESSORS.md

### COPPA data-retention enforcement + parental-consent flow check

- **Drafts:** verify enforced deletion of children's data per written retention policy; verify separate verifiable parental consent for any disclosure not integral to the service (incl. AI training)
- **Watch:** amended COPPA Rule compliance deadline 2026-04-22 PASSED and is enforceable (~$51.7k/incident/day). Watch FTC enforcement actions.
- **Basis:** plan 1.3, 2.4; docs/legal/COPPA_VERIFICATION_2026-04-26.md; docs/legal/DATA_RETENTION.md

### SOC 2 control review (continuous monitoring posture)

- **Drafts:** control-evidence freshness check; map register findings to SOC 2 CC criteria; flag stale evidence before an auditor sees it
- **Watch:** SOC 2 / ISO 27001 control overlap ~90% - implement once, map to many (plan 1.2)
- **Basis:** plan 1.2, 1.3

### Accessibility Conformance Report (ACR/VPAT) refresh

- **Drafts:** refresh docs/legal/ACCESSIBILITY_CONFORMANCE_REPORT.md against current AAC surfaces; re-test the dual render path (index.hbs + button.js fast_html)
- **Watch:** WCAG 2.1 AA stands; district RFPs flow it down regardless of the extended ADA Title II dates. Also refresh on any major AAC UI change.
- **Basis:** plan 2.5, 6; audit-reports/wcag-modernized-2026-04-11*.md

### OpenRouter ZDR re-verification (after every key rotation, plus quarterly)

- **Drafts:** confirm the OpenRouter ZDR account toggle is still on after any API-key rotation; PiiScrubber is the real backstop, ZDR is operator-maintained and unenforceable from config
- **Watch:** ZDR is NOT a BAA. Re-verify the toggle after every key rotation - nothing else checks it (plan 2.4 item 7).
- **Basis:** plan 1.8, 2.4; ZDR verification SOP (Phase 1)

### Google Gemini API fallback path BAA/DPA verification

- **Drafts:** Confirm Gemini API data-handling terms and whether any Google BAA covers the runtime fallback in lib/ai_word_predictor.rb; document result in AI Governance Memo section 7
- **Watch:** Until resolved, PiiScrubber remains the controlling backstop for the Gemini path
- **Basis:** docs/legal/AI_GOVERNANCE_MEMO.md section 7; lib/ai_word_predictor.rb Gemini fallback

### Mechanical secret-shaped-string rejector in audit toolchain (LL-b5c30235d3)

- **Drafts:** Build scripts/audit-merge.rb or scripts/citation-check.rb rejector for secret/PII-shaped runtime evidence snippets
- **Watch:** Instruction-only control on infra-auditor until this ships; tagged HIPAA/FERPA in register
- **Basis:** audit-reports/self-findings-triage-2026-06-13.md; LL-b5c30235d3

### District DPA / SDPC NDPA renewals + registry listing

- **Drafts:** NDPA v2.2 posture responses; CAIQ pre-fill; SDPC registry listing maintenance
- **Watch:** SDPC NDPA v2.2 (Nov 2025) is the de facto K-12 vendor contract; registry listing is the highest-leverage sales artifact (plan 1.3). nextDue is null until contracts with renewal dates exist.
- **Basis:** plan 1.2, 1.3, 2.5

### Re-brand + re-share BREACH_RUNBOOK Drive mirror to v2.2 (DOC-f576f43250)

- **Drafts:** The git-canonical runbook docs/legal/BREACH_RUNBOOK.md is v2.2-attested (2026-07-28, hash 0ee1b92e); the branded Drive mirror DOC-f576f43250 (Google Doc 1aaJ9sXq4Y-SpX2d2rzOY2qUKN5NYXhOVgI3uZdMM2po) still carries v2.1-era content. Regenerate the branded Google Doc from the v2.2 markdown and re-share it into the school-dpa-package, soc2-evidence, and baa bundles, then confirm the refresh in DOCUMENT-REGISTER.json.
- **Watch:** document-register-render --check is structurally blind to Drive (Drive hashes are operator-supplied), so this drift never fails CI and must be tracked here. Sequence AFTER PR #703 merges so the Drive doc is re-branded from the final attested bytes. No hard regulatory deadline (pre-MVP, no real district users yet); nextDue is advisory.
- **Basis:** senior-dev content-integrity review of PR #703 (finding M4); docs/legal/BREACH_RUNBOOK.md; DOCUMENT-REGISTER.json DOC-f576f43250

## Fixed regulatory dates

| Date | Status | Obligation | Framework |
|---|---|---|---|
| **2026-04-22** | **passed enforceable** | Written data-retention policy with enforced deletion; written information security program; expanded PI (voiceprints,... | COPPA |
| **2026-08-02** | **passed enforceable** | Disclose AI interaction to users; label synthetic/AI-generated content; deepfake identification. Applies to ANY in-sc... | EU AI Act |
| 2026-12-02 | upcoming | The 2026-12-02 grace on the Article 50(2) machine-readable marking sub-obligation comes from the Digital Omnibus on A... | EU AI Act |
| 2027-04-24 | upcoming | WCAG 2.1 AA for web content of large public entities (April-2026 IFR extended the date). Small entities: 2028-04. Lin... | WCAG |
| 2027-12-02 | upcoming | High-risk obligations for Annex III systems (deferred from earlier by the Digital Omnibus). An AAC word predictor is ... | EU AI Act |
| (conditional) | conditional | EAA enforceable since 2025-06. LingoLinq is likely inside the microenterprise exemption (<10 staff AND <EUR 2M turnov... | EAA |
| (conditional) | conditional | docs/legal/SUBPROCESSORS.md §2 commits to 30 days advance notice before any subprocessor change that affects a tenant... | GDPR |

## How to read this

- **Source of truth is `compliance-calendar.json`.** This file is a render.
- Every cached regulatory date is "verify before relying." The `compliance-officer` runs a
  fresh regulatory-watch lookup on a calendar cadence and writes dated delta notes.
- Passed-enforceable fixed dates (e.g. COPPA 2026-04-22) stay visible for context; ongoing
  compliance is tracked via linked recurring reviews (`nextDue` on the fixed entry when set).
- Only Scot attests that a review was completed. `nextDue` is scheduling, not a claim.
