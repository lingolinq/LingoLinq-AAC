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
