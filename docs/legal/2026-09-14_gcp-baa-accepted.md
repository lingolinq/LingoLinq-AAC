# Google Cloud Platform HIPAA BAA + CDPA + SCCs - ACCEPTED

> # DRAFT - NOT YET ATTESTED
>
> **This successor carries NO attestation of its own.** It supersedes
> `docs/legal/GCP_BAA_ACCEPTED.md` (`DOC-5b14b08908`, ATTESTED 2026-07-23 by Scot Wahlquist, CEO),
> which remains frozen and byte-identical as the signed record. Every attestation statement
> reproduced below belongs to that predecessor.
>
> **Reason for supersession (2026-09-14).** The predecessor instructed the reader that Render
> remained listed "until the write-frozen rollback fallback is deleted or restricted". It was
> deleted on 2026-09-09. Only that paragraph changes; the BAA acceptance record itself is
> untouched. The attester must confirm the deletion date against the vendor record.

## Acceptance Details

**Agreements accepted:** CDPA + HIPAA BAA on July 12, 2026; SCCs on July 14, 2026
**GCP Project:** LingoLinq Prod (`lingolinq-prod`)
**Accepted by:** scot@lingolinq.com (Google Cloud console, Privacy & Security)
**Status:** **ACTIVE** (agreements accepted in-console)
**Attested:** 2026-07-16; **re-attested 2026-07-23** by Scot Wahlquist, CEO, against the current
revision. The 2026-07-16 attestation predated this file's creation on 2026-07-17 (PR #622) and the
later Vertex-scope correction, Anthropic-BAA cross-reference, and cutover subprocessor update.
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
- **Does NOT cover the runtime AI egress path.** This GCP infrastructure BAA never extended to it.
  **CORRECTED 2026-09-14:** the predecessor said that path was covered by Anthropic's own
  HIPAA-Ready BAA. That attribution was overtaken by the 2026-08-16 determination in the
  subprocessor register and is wrong as stated. `lib/ai_client.rb` calls
  `bedrock-runtime.<region>.amazonaws.com` over SigV4, so **Amazon Bedrock is the plane that
  RECEIVES runtime AI prompts and AWS is the processing party**. Anthropic, PBC is the **model
  provider, not the receiving processor**, and **the AWS BAA of 2026-02-07 is the operative
  instrument for this flow** (see `docs/legal/2026-09-14_subprocessor-register.md`, rows 1 and 4,
  and its 2026-08-16 change-log entry). The Anthropic HIPAA-Ready BAA of 2026-07-18 remains on file
  for the model-provider relationship and the historical direct-API route, but it does not govern
  the receiving processor. The PiiScrubber and no-identifiable-data policy are retained as
  defense-in-depth. This correction predates the Render decommission: the contradiction has stood
  since 2026-08-16 and was surfaced by the dual review on this PR.
- **No Google inference path is live today, and BAA coverage of any future one is unverified.** The
  Gemini/Vertex runtime fallback was disabled 2026-07-09 (PR #570); no AI inference reaches Google
  today, and runtime inference is Anthropic-only. If a Vertex AI or Gemini inference path is ever
  reactivated, confirm the specific product is a Google HIPAA Covered Service before any PHI or
  child data flows to it.

> **Correction (2026-07-16):** An earlier version of this record listed Vertex AI among the
> services covered by the infrastructure BAA and stated Vertex AI was "in scope." Google's HIPAA
> BAA covers only products on its published Covered Products list, which does not include Vertex AI
> as a whole (only specific products such as Vertex AI Workbench). The scope language above was
> narrowed accordingly. This correction post-dated the 2026-07-16 attestation; it is covered by the
> 2026-07-23 re-attestation recorded below, along with the Anthropic BAA and Gate 1 cutover updates
> made on 2026-07-19 and 2026-07-21.

## Subprocessor Status

Google Cloud Platform infrastructure became an **active** subprocessor on 2026-07-22, when the Gate
1 DNS cutover put `app.lingolinq.com` live on Cloud Run with Cloud SQL and Memorystore carrying
production traffic. This supersedes the earlier "planned subprocessor" posture recorded on
2026-07-16, when `lingolinq-prod` still held only synthetic/test data.

Render was decommissioned on 2026-09-09: the workspace was deleted (0 services, 0 databases,
0 disks). The subprocessor register retains the Render rows with an end date, as history. The
original caveat here said not to treat the GCP active-listing as a Render decommission; that
caveat has been satisfied by the actual decommission, not by the GCP listing. **Render-tail
findings are still not closed by this document.** Only the CEO records a disposition and
`audit-reports/FINDINGS.json` remains authoritative.

## Account Coverage

This BAA applies to the `lingolinq-prod` project. Other GCP projects that process PHI require their
own coverage.

---

**Status:** Agreements accepted; GCP infrastructure active for production hosting as of 2026-07-22.
See `docs/legal/SUBPROCESSORS.md` section 5.7, `COMPLIANCE.md` section 4, and
`docs/legal/COMPLIANCE_POSTURE_REPORT.md` for how this is reflected in the posture.
