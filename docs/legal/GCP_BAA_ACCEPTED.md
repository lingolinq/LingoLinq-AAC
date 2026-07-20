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

- **Infrastructure BAA.** Covers the Google Cloud infrastructure and HIPAA-eligible services in use
  or planned for hosting: Cloud Run, Cloud SQL, and Memorystore. Google's HIPAA BAA extends only to
  the products on Google's published Covered Products list, so any future Vertex AI or Gemini
  inference path requires per-product covered-service verification before it may carry PHI or child
  data (Vertex AI is not covered as a whole; only specific products such as Vertex AI Workbench are
  listed as covered).
- **Does NOT cover the Anthropic model-provider egress path** (the runtime AI features). This GCP
  infrastructure BAA never extended to Anthropic; that path is now covered by **Anthropic's own
  HIPAA-Ready BAA**, executed and enabled 2026-07-18 on the runtime-dedicated LingoLinq, LLC API org
  (see `ANTHROPIC_BAA_ACCEPTED.md`), with the PiiScrubber and no-identifiable-data policy retained as
  defense-in-depth. (The earlier "no BAA / provisional pending CEO review" language here is
  superseded by that record.)
- **No Google inference path is live today, and BAA coverage of any future one is unverified.** The
  Gemini/Vertex runtime fallback was disabled 2026-07-09 (PR #570); no AI inference reaches Google
  today, and runtime inference is Anthropic-only. If a Vertex AI or Gemini inference path is ever
  reactivated, confirm the specific product is a Google HIPAA Covered Service before any PHI or
  child data flows to it.

> **Correction (2026-07-16):** An earlier version of this record listed Vertex AI among the
> services covered by the infrastructure BAA and stated Vertex AI was "in scope." Google's HIPAA
> BAA covers only products on its published Covered Products list, which does not include Vertex AI
> as a whole (only specific products such as Vertex AI Workbench). The scope language above was
> narrowed accordingly. This correction post-dates the 2026-07-16 attestation and is flagged for
> re-attestation.

## Subprocessor Status

Google compute becomes an **active** subprocessor in `docs/legal/SUBPROCESSORS.md` only when the
Render-to-GCP cutover carries production personal data; until then it is a **planned** subprocessor.

> **Verification (resolved 2026-07-16):** Scot Wahlquist confirmed that `lingolinq-prod` has no
> real users and no tenant (student/patient) personal data yet (any data present is synthetic /
> test). GCP is therefore not yet processing personal data and correctly remains a planned (not
> active) subprocessor; the active-listing and 30-day customer-notice obligations
> (SUBPROCESSORS.md section 2) begin at cutover, when production tenant data starts to flow.
> Re-confirm at the 2026-07-20 quarterly review and immediately before cutover.

## Account Coverage

This BAA applies to the `lingolinq-prod` project. Other GCP projects that process PHI require their
own coverage.

---

**Status:** Agreements accepted. See `docs/legal/SUBPROCESSORS.md` section 5.7, `COMPLIANCE.md`
section 4, and `docs/legal/COMPLIANCE_POSTURE_REPORT.md` for how this is reflected in the posture.
