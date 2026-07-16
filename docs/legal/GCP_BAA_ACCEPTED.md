# Google Cloud Platform HIPAA BAA + CDPA + SCCs - ACCEPTED

## Acceptance Details

**Agreements accepted:** CDPA + HIPAA BAA on July 12, 2026; SCCs on July 14, 2026
**GCP Project:** LingoLinq Prod (`lingolinq-prod`)
**Accepted by:** scot@lingolinq.com (Google Cloud console, Privacy & Security)
**Status:** **ACTIVE** (agreements accepted in-console)
**Formalizes:** the org-wide Google BAA previously recorded as accepted 2026-06-08

## Agreements Accepted

1. **Cloud Data Processing Addendum (CDPA)** - reviewed and accepted 2026-07-12
2. **Google Cloud HIPAA Business Associate Addendum (BAA)** - reviewed and accepted 2026-07-12
3. **European Data Protection Law - Standard Contractual Clauses (SCCs)** (EU GDPR / UK GDPR / Swiss FDPA) - certified 2026-07-14

## Evidence / Provenance

Google does **not** issue a downloadable countersigned PDF for these agreements; the console
acceptance record (with date and accepting account) is the authoritative evidence. This differs
from the AWS BAA, which has a countersigned PDF (`docs/legal/AWS_BAA_2026-02.pdf`).

- Source screenshots: Drive "Google Cloud Console Agreements 07-14-2026"
- Companion record: Drive "Google Cloud Platform - Accepted Compliance Agreements (captured 2026-07-14)" -- https://docs.google.com/document/d/1CcyQpNfg8aiuY5VA7RHYbYqQEQtzHAdEkjpxcQIhNmM/edit
- Notion "Vendor BAAs & Subprocessor Registry", Google row updated 2026-07-14

## What This Means

- The HIPAA BAA legally binds Google as a Business Associate for the `lingolinq-prod` project, so
  PHI **may** be processed on Google Cloud under BAA terms. A BAA is **necessary but not
  sufficient** for HIPAA compliance: HIPAA-eligible services only, encryption in transit and at
  rest, access controls, and minimum-necessary handling must all be in place (mirrors the AWS BAA
  posture in `AWS_BAA_ACCEPTED.md`).
- The CDPA + SCCs cover GDPR / UK GDPR / Swiss FDPA processing (Article 28 processor terms) and
  international data transfers (Chapter V transfer mechanism).

## Scope Boundary

- **Infrastructure BAA.** Covers Google Cloud infrastructure and HIPAA-eligible services in use or
  planned: Cloud Run, Cloud SQL, Memorystore, and Google's Vertex AI service under Google's terms.
- **Does NOT cover the Anthropic model-provider egress path** (the runtime AI features). That path
  has no BAA and is governed by the PiiScrubber and the no-identifiable-data policy; its HIPAA
  posture is provisional pending CEO review (see `AI_GOVERNANCE_MEMO.md`).
- **Vertex AI is in scope of this BAA but is NOT a live inference path today.** The Gemini/Vertex
  runtime fallback was disabled 2026-07-09 (PR #570); no AI inference reaches Google today. Runtime
  inference is Anthropic-only.

## Subprocessor Status

Google compute becomes an **active** subprocessor in `docs/legal/SUBPROCESSORS.md` only when the
Render-to-GCP cutover carries production personal data; until then it is a **planned** subprocessor.

> **Open verification item:** this planned (not active) classification assumes the `lingolinq-prod`
> project does not already hold tenant personal data via Cloud Logging, backups, or migration
> rehearsal artifacts. If it does, GCP is already a processor and the active-listing plus the
> 30-day customer-notice obligation (SUBPROCESSORS.md section 2) start now, not at cutover. Confirm
> before the 2026-07-20 quarterly review.

## Account Coverage

This BAA applies to the `lingolinq-prod` project. Other GCP projects that process PHI require their
own coverage.

---

**Status:** Agreements accepted. See `docs/legal/SUBPROCESSORS.md` section 5.7, `COMPLIANCE.md`
section 4, and `docs/legal/COMPLIANCE_POSTURE_REPORT.md` for how this is reflected in the posture.
