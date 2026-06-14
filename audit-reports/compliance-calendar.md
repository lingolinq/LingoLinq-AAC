# LingoLinq-AAC Compliance Calendar

> Generated from `compliance-calendar.json` (the source of truth). Do not hand-edit this
> render; regenerate it from the JSON via the `compliance-officer` agent. A review is only
> "done" when Scot attests; `nextDue` is advisory scheduling, not a compliance claim.
>
> Generated: 2026-06-13 | Owner: compliance-officer (drafts/surfaces), Scot Wahlquist (attests)

## Due within 90 days or overdue (surface these first)

| Date | Item | Framework | Cadence |
|---|---|---|---|
| **2026-07-26** | COPPA data-retention enforcement + parental-consent flow check | COPPA | quarterly |
| **2026-08-02** | **EU AI Act Article 50 transparency obligations apply** (nearest hard regulatory date) | EU AI Act | fixed |
| 2026-09-01 | FERPA vendor-disclosure + directory-info posture review | FERPA | annual |
| 2026-09-01 | GDPR DPA + RoPA + data-residency review | GDPR | annual |
| 2026-09-01 | Subprocessor list review | GDPR | quarterly |
| 2026-09-01 | SOC 2 control review (continuous monitoring) | SOC2 | quarterly |
| 2026-09-01 | OpenRouter ZDR re-verification (also on every key rotation) | SOC2 | event + quarterly |

## Recurring reviews (full set)

| Framework | Review | Cadence | Last done | Next due |
|---|---|---|---|---|
| FERPA | Vendor-disclosure + directory-info posture | annual | (none) | 2026-09-01 |
| HIPAA | Security Rule risk assessment + BAA inventory | annual | 2026-02-01 | 2027-02-01 |
| GDPR | DPA + RoPA + data-residency | annual | (none) | 2026-09-01 |
| GDPR | Subprocessor list review | quarterly | (none) | 2026-09-01 |
| COPPA | Data-retention enforcement + parental-consent flow | quarterly | 2026-04-26 | 2026-07-26 |
| SOC2 | Control review (continuous monitoring) | quarterly | (none) | 2026-09-01 |
| WCAG | Accessibility Conformance Report (ACR/VPAT) refresh | semi-annual | (none) | 2026-12-13 |
| SOC2 | OpenRouter ZDR re-verification | event + quarterly | (none) | 2026-09-01 |
| FERPA | District DPA / SDPC NDPA renewals + registry listing | per-contract | (none) | (no contracts yet) |

## Fixed regulatory dates

| Date | Status | Obligation | Framework |
|---|---|---|---|
| 2026-04-22 | **passed, enforceable** | Amended COPPA Rule: enforced deletion, security program, voiceprint/audio scope, separate verifiable parental consent (incl. AI training). Up to ~$51.7k/incident/day. | COPPA |
| **2026-08-02** | upcoming | EU AI Act Article 50: disclose AI interaction, label synthetic content. Applies to any in-scope system, not only high-risk. | EU AI Act |
| 2026-12-02 | upcoming | EU AI Act Article 50(2): machine-readable marking grace ends for pre-existing generative systems (Digital Omnibus). | EU AI Act |
| 2027-04-24 | upcoming | ADA Title II WCAG 2.1 AA, large public entities (small: 2028-04). District RFPs flow WCAG down today regardless. | WCAG |
| 2027-12-02 | upcoming | EU AI Act Annex III high-risk obligations. AAC predictor plausibly not Annex III, but document the memo. | EU AI Act |
| (conditional) | conditional | EAA microenterprise exemption vanishes if staff reaches 10 OR turnover reaches EUR 2M. | EAA |

## How to read this

- **Source of truth is `compliance-calendar.json`.** This file is a render.
- Every cached regulatory date is "verify before relying." The `compliance-officer` runs a
  fresh regulatory-watch lookup on a calendar cadence and writes dated delta notes.
- `nextDue` dates with `(none)` for `lastDone` are first-cycle defaults seeded 2026-06-13.
  They establish the cadence; Scot's first attestation sets the real `lastDone`.
- Escalate to Scot anything due within 90 days or overdue (the top table).

_Phase 3 "Compliance posture + governance" of the Audit/Compliance System Modernization.
See `outputs/plans/2026-06-11-audit-compliance-modernization-plan.md` (ai-company-brain) sections 1.3, 6._
