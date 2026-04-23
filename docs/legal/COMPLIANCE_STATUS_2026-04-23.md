# LingoLinq Compliance Status and Plan

**Date:** 2026-04-23
**Owner:** Privacy Office (privacy@lingolinq.com)
**Trigger:** The retirement of the Student Privacy Pledge on 2025-04-25 prompted a review that surfaced several other regulatory shifts during 2024-2026 that the prior April 2026 remediation plan had not accounted for.
**Related:** `COMPLIANCE.md`, `docs/legal/DATA_RETENTION.md`, `docs/legal/SUBPROCESSORS.md`, `docs/legal/BREACH_RUNBOOK.md`

---

## 1. Executive Summary

Three landscape changes since the prior plan was written have material impact on LingoLinq:

1. The Student Privacy Pledge (FPF) was retired on 2025-04-25. FPF's own transition guidance named three alternatives: the CISA K-12 Education Technology Secure by Design Pledge, the SDPC National Data Privacy Agreement, and PRIVO's Student Digital Privacy Assured Program. For 2026 district procurement, the SDPC NDPA v2.2 Resource Registry listing is the dominant trust signal.
2. The amended COPPA Rule's compliance deadline is 2026-04-22. Written data retention policy publication is now mandatory. Biometric identifiers are inside the personal-information definition. Operators must obtain separate verifiable parental consent for third-party disclosures, and the FTC explicitly declined to codify the FERPA school-official exception as a substitute. Written assurances from sub-processors are required.
3. The HIPAA Security Rule NPRM is not yet finalized (targeted May 2026, uncertain under the current administration). OCR's ongoing Risk Analysis Initiative, launched late 2024, is producing multiple six-figure settlements against small business associates in 2025 whose primary cited gap is the absence of a documented annual Security Risk Analysis. That is the single highest-return hospital-readiness control for LingoLinq in 2026.

Alongside these, the EU AI Act's next milestone (high-risk obligations effective 2026-08-02), the September 2026 FIPS 140-2 sunset, New York's October 2025 adoption of NIST CSF 2.0 for Education Law § 2-d, and California AB 2013 (effective 2026-01-01, AI training-data transparency) together raise the 2026 bar for any vendor selling into US districts, US hospitals, or EU schools.

## 2. Current Posture: What LingoLinq Has Already Covered

### 2.1 Merged

- **Regulatory scope and AI de-identification policy** — `COMPLIANCE.md`.
- **Runtime controls** — `lib/pii_scrubber.rb`, `AiApiLog` audit trail for all AI API calls, feature flags in `lib/feature_flags.rb`, data deletion via `lib/flusher.rb` + `DataPolicyEnforcer`.
- **Secrets management** — 1Password five-vault structure, GitHub Actions sync to Render, documented in `docs/RENDER-ENV-MANIFEST.md`.
- **Encryption at rest** — AWS KMS (S3, RDS), TLS 1.2+ in transit.
- **S3 hardening** — BucketOwnerEnforced; `UPLOADS_S3_NO_ACL=1` required on every Render service.

### 2.2 Open pull requests

- **PR #203** — AWS BAA recorded (`docs/legal/AWS_BAA_2026-02.pdf`, `docs/legal/AWS_BAA_ACCEPTED.md`), COMPLIANCE.md correction.
- **PR #204** — CSP in report-only, reporter endpoint at `app/controllers/api/v1/csp_reports_controller.rb`, route at `POST /api/v1/csp-reports`, reporter expanded to current external dependency set.

### 2.3 Drafted on this branch (`docs/compliance-artifacts-april-2026`)

- **`docs/legal/DATA_RETENTION.md`** — 21 categories, retention windows, legal bases, deletion mechanisms. Meets the COPPA Final Rule publication-of-retention-policy requirement at 16 CFR § 312.10 and aligns with GDPR Article 5(1)(e), HIPAA 45 CFR § 164.316(b)(2)(i), FERPA, and SOPPA/SB 1177/Ed Law 2-d.
- **`docs/legal/SUBPROCESSORS.md`** — 14 subprocessors, 30-day change-notification clause, GDPR Article 28 and HIPAA 45 CFR § 164.502(e) alignment. The 2026-04-23 revision corrected the Pusher entry (the `lib/pusher.rb` module is an AWS SNS SMS wrapper inherited from the CoughDrop fork, not a Pusher.com integration).
- **`docs/legal/BREACH_RUNBOOK.md`** — FERPA / HIPAA / GDPR / UK GDPR / COPPA definitions, roles, timelines. Incorporates FERPA 45 days, HIPAA 60 days, GDPR 72 hours, COPPA parental-notification expectations, and key state statutes (Illinois SOPPA, California SB 1177, New York Education Law § 2-d, Texas SB 820).
- **`docs/legal/INCIDENT_LOG.md`** — append-only register with seven-year retention (HIPAA plus state statutes of limitation).

## 3. What Was Outdated in the Prior Plan

| Prior assumption | Current reality | Corrected action |
|---|---|---|
| Sign the Student Privacy Pledge as a public trust signal | Pledge retired 2025-04-25; signatory list maintained only through 2025-07-31 | Sign the CISA K-12 Secure by Design Pledge (free, ~1 week) and pursue SDPC NDPA v2.2 listings via pilot-district deals. Optionally pursue Common Sense Privacy Seal as a parent-facing differentiator. |
| FERPA school-official exception covers COPPA consent for under-13 users | FTC declined to codify this in the 2025 Final Rule. Existing 1999 FTC FAQ guidance survives but stands on softer ground. | Add an explicit school-vouching workflow OR a parental-consent path for under-13 users before 2026-07-01. |
| Annual Security Risk Analysis can be informal | OCR's 2025 enforcement pattern is to cite absence of a documented annual Risk Analysis as the primary finding in six-figure settlements against small business associates. | Commission a written annual Risk Analysis and Risk Management Plan before courting new hospital tenants. |
| NIST CSF 1.1 alignment is sufficient for New York Education Law § 2-d | NYSED formally adopted NIST CSF 2.0 in October 2025; Part 121 amendments in a 60-day public comment window from 2025-10-22. | Map LingoLinq's existing controls to CSF 2.0 and publish a Data Security and Privacy Plan template for district Exhibits. |
| AAC phrase suggestion is high-risk under the EU AI Act | Annex III does not reach AAC phrase suggestion unless the product adds proctoring, scoring, or eligibility features. | Document the Annex III non-applicability memo and add Article 50 transparency disclosures in the UI. Maintain Article 4 AI-literacy training for staff (already in force). |
| `docs/legal/SUBPROCESSORS.md` listed Pusher Ltd. | `lib/pusher.rb` is an AWS SNS SMS wrapper; LingoLinq is not a Pusher.com customer. | Corrected on 2026-04-23 in this commit. |

## 4. Net-New Items Not Previously Tracked

### 4.1 Tier A — Deadline-driven

| ID | Action | Driver |
|---|---|---|
| A1 | Merge this compliance-artifacts branch so the public data retention policy is published and linked from the Privacy Policy | COPPA Final Rule compliance deadline 2026-04-22 at 16 CFR § 312.10 |
| A2 | Collect written sub-processor assurances from AWS, Render, OpenAI, Anthropic, Google, Sentry (when SDK ships), HubSpot, Cloudflare, 1Password | COPPA Final Rule at 16 CFR § 312.8 |
| A3 | Product: add a separate consent path for under-13 users covering any third-party disclosure (including AI-training use); default is no-training on minor data | COPPA Final Rule separate-consent requirement |
| A4 | Schedule `AiApiLog.redact_old_ip_addresses!` in `lib/tasks/scheduler.rake` (this gap is already cited in `DATA_RETENTION.md` §2) | HIPAA audit-log minimum necessary; GDPR data minimization |
| A5 | Verify AWS KMS module FIPS 140-3 validation; document the CMVP certificate number(s) in `COMPLIANCE.md` | FIPS 140-2 historical-list sunset 2026-09-21 |
| A6 | Verify MFA is enforced for every admin account and for all Render, AWS, 1Password, GitHub, HubSpot admin surfaces | HIPAA Security Rule NPRM; OCR enforcement trend |

### 4.2 Tier B — 2026 district procurement unlocks

| ID | Action | Driver | Est. cost / time |
|---|---|---|---|
| B1 | Sign the CISA K-12 Education Technology Secure by Design Pledge and publish the attestation on lingolinq.com | Replaces SPP slot in public trust signals; FPF-endorsed | $0 / 1-2 weeks |
| B2 | Sign the SDPC NDPA v2.2 with 3-5 pilot districts; request SDPC Resource Registry listing | Dominant 2026 K-12 procurement signal (~130,000 signed DPAs in Registry) | A4L Community membership optional ~$2.5-5K/yr / 4-8 weeks per deal |
| B3 | Commission an annual written Security Risk Analysis and Risk Management Plan | OCR Risk Analysis Initiative; HIPAA 45 CFR § 164.308(a)(1) | $5-15K / 4-6 weeks |
| B4 | Map LingoLinq controls to NIST CSF 2.0; produce a Data Security and Privacy Plan template for district Exhibit E | New York Education Law § 2-d / Part 121 (CSF 2.0); reusable baseline | $3-8K or internal / 4-8 weeks |
| B5 | Publish an AI Transparency Notice covering PiiScrubber methodology, the named upstream LLM providers, and NIST AI RMF 1.0 alignment | California AB 2013; Colorado SB 24-205; district AI addenda; EDPB Opinion 28/2024 | $2-5K / 2-3 weeks |
| B6 | Apply for Common Sense Privacy Seal evaluation | Parent-facing differentiator for AAC; under-10% pass rate | estimate $3-10K / 2-4 months |
| B7 | Commit to an annual third-party penetration test; publish executive summary sharing policy | HIPAA Security Rule NPRM; hospital and district RFPs | $8-20K / 2-3 weeks engagement plus report |

### 4.3 Tier C — Hospital and EU readiness (pipeline-gated)

| ID | Action | Driver | Est. cost / time |
|---|---|---|---|
| C1 | Execute Render BAA (currently negotiating) | Gate on all hospital sales | ongoing |
| C2 | SOC 2 Type II audit | Mid-market health SaaS entry ticket; covers ~70% of district asks | $25-50K year one / 6-9 months |
| C3 | HITRUST e1 (44 controls) | Only when a specific hospital RFP rejects SOC 2 alone | ~$35K / 3-6 months (defer to Year 2) |
| C4 | EU entry stack: SCCs in Customer DPA, DPF self-certification at commerce.gov, Article 27 EU Representative appointment | First EU deal | $2-6K plus ~EUR 1-3K/yr EU Rep / 3-4 weeks |
| C5 | DPIA for the AI phrase-suggestion feature covering children, disability, and third-party LLM use | EDPB Opinion 28/2024; Article 35 GDPR; EU AI Act Article 27 if selling to public-sector deployers | $3-8K / 2-4 weeks |
| C6 | EN 301 549 v3.2.1 / WCAG 2.1 AA accessibility conformance audit; publish an ACR | European Accessibility Act, enforceable since 2025-06-28 | $5-15K / 2-6 weeks |
| C7 | AI Act classification memo documenting why LingoLinq phrase suggestion is not Annex III high-risk; add Article 50 AI-disclosure UI | EU AI Act high-risk obligations 2026-08-02 | internal / 1-2 weeks |
| C8 | UK ICO Children's Code self-assessment and gap remediation | Data (Use and Access) Act 2025; Children's Code remains operative | internal / 1-2 weeks |

## 5. Procurement Gate Matrix

| Requirement | US K-12 | US hospitals | EU schools / clinics |
|---|---|---|---|
| Signed AWS BAA (executed 2026-02-07) | not applicable | required | required |
| Signed Render BAA | not applicable | required | required |
| SDPC NDPA v2.2 (per district or via state alliance) | primary signal | not applicable | not applicable |
| CISA Secure by Design Pledge | strong free signal | minor | minor |
| Common Sense Privacy Seal | parent-facing differentiator | not applicable | useful |
| COPPA-compliant public retention policy | mandatory as of 2026-04-22 | not applicable | satisfied via GDPR Article 5(1)(e) |
| NIST CSF 2.0 mapped DSPP | required for New York districts | nice-to-have | indirect |
| Annual Security Risk Analysis | growing ask | OCR priority | implicit via GDPR Article 32 |
| SOC 2 Type II | increasingly asked | entry ticket | nice-to-have |
| HITRUST e1 / i1 / r2 | no | e1 in Year 2 if pipeline demands | no |
| SCCs + DPF + Article 27 EU Representative | no | no | mandatory |
| DPIA for AI + children + disability | useful | useful | mandatory |
| EN 301 549 / WCAG 2.1 AA audit | Section 508 overlap | indirect | mandatory (EAA) |
| Sub-processor 30-day change notification | NDPA requires | BAA requires | GDPR Article 28 requires |

## 6. Immediate Next Actions (week of 2026-04-23)

1. Push this branch and open PR for merge to staging.
2. Sign the CISA K-12 Secure by Design Pledge at `cisa.gov/securebydesign/k-12-education-technology-pledge`.
3. Open SDPC NDPA v2.2 conversations with three pilot districts.
4. Queue Tier A tasks (A2 through A6) in the issue tracker so they do not drift.
5. Review Tier B prioritization in the next product planning session and commit timelines.

## 7. Sources

- Future of Privacy Forum Student Privacy Pledge retirement, `fpf.org/student-privacy-pledge/`
- CISA K-12 Education Technology Secure by Design Pledge, `cisa.gov/securebydesign/k-12-education-technology-pledge`
- SDPC National Data Privacy Agreement v2.2, `privacy.a4l.org/national-dpa/`
- Amended COPPA Rule, Federal Register 2025-05904 (published 2025-04-22)
- FTC press release on the amended COPPA Rule, 2025-01-16
- HHS OCR HIPAA Security Rule NPRM, Federal Register 2024-30983 (published 2025-01-06)
- NYSED Education Law § 2-d / Part 121 proposed amendment (2025-10-22)
- California AB 2013 (Generative AI Training Data Transparency Act), effective 2026-01-01
- Colorado SB 24-205 (Colorado AI Act), effective 2026-02-01, extended to 2026-06-30
- EU Regulation 2024/1689 (AI Act), Article 4, Article 5, Annex III, Article 50
- EDPB Opinion 28/2024 on AI models
- European Accessibility Act (Directive 2019/882), effective 2025-06-28
- UK Data (Use and Access) Act 2025 (Royal Assent 2025-06-19)
- NIST CSRC FIPS 140-3 transition, 140-2 historical list 2026-09-21
- HHS 405(d) HICP and HPH Cybersecurity Performance Goals
