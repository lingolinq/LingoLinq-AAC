# LingoLinq Subprocessor Register

**Owner:** Privacy Office (privacy@lingolinq.com)
**Last reviewed:** 2026-04-20 (last full review)
**Last amended:** 2026-07-16 (GCP infrastructure agreements recorded; see change log)
**Next review:** 2026-07-20 (quarterly)
**Related:** `docs/legal/BREACH_RUNBOOK.md`, `docs/legal/DATA_RETENTION.md`, `COMPLIANCE.md`

## 1. Purpose

This register lists every third party that LingoLinq uses to process data in support of the LingoLinq platform. It is maintained to satisfy Article 28 of GDPR, the HIPAA Business Associate obligations at 45 CFR § 164.502(e), and the transparency expectations of US school and hospital customers under FERPA and state student-data-privacy laws.

## 2. Change Notification

LingoLinq will provide customers with at least 30 days advance notice before any change to this subprocessor list that affects their tenant. Customers may object to a proposed change by writing to privacy@lingolinq.com. Notifications are delivered by email to the named privacy contact for each tenant and posted at https://lingolinq.com/legal/subprocessors.

## 3. Legend

- **Student or patient data reaches this vendor?** "Yes" means the vendor can receive identifying or content data tied to a learner or patient — including pseudonymized learner content (scrubbed of direct identifiers by design), which remains personal data under GDPR/UK-GDPR. "No" means the vendor only receives aggregate or LingoLinq corporate data.
- **DPA / BAA status:** "Signed [date]" is executed and on file. "Via standard terms" means the vendor's standard online DPA applies and no custom agreement is negotiated. "Pending" means in progress.

## 4. Active Subprocessors

| # | Subprocessor | Service provided | Data categories | Student or patient data reaches this vendor? | Region | DPA / BAA status | Privacy / security reference |
|---|---|---|---|---|---|---|---|
| 1 | Amazon Web Services, Inc. | S3 object storage, KMS, RDS (if used), CloudFront | User-uploaded media, database backups, application secrets | Yes | us-east-1 | BAA signed 2026-02-07, account 2390-4478-5114 | https://aws.amazon.com/compliance/data-privacy/ |
| 2 | Render Services, Inc. | Application hosting, managed PostgreSQL, managed Redis, scheduler, worker services | Full application data at rest in PostgreSQL; logs; environment | Yes | us-east (Ohio primary) | DPA signed; BAA pending | https://render.com/legal/dpa and https://render.com/security |
| 3 | OpenAI, L.L.C. | GPT models (contracted); NOTE: no active code path sends data to OpenAI as of 2026-07-06 — the in-repo OpenAI SDK clients target Google's Gemini OpenAI-compatible endpoint. Row retained pending Privacy Office review (removal per section 7). | Pseudonymized (scrubbed) prompts only IF used, redacted by lib/pii_scrubber.rb before transmission; still personal data under GDPR/UK-GDPR | Currently none (no active flow); would be Yes — pseudonymized if activated | US | DPA via OpenAI API standard terms | https://openai.com/policies/data-processing-addendum |
| 4 | Anthropic, PBC | Claude models for AI board generation and content | Pseudonymized (scrubbed) prompts only, redacted by lib/pii_scrubber.rb before transmission; still personal data under GDPR/UK-GDPR | Yes — pseudonymized learner content (direct identifiers removed by design) | US | DPA via Anthropic Commercial Terms | https://www.anthropic.com/legal/commercial-terms |
| 5 | Google LLC (Gemini API) | Gemini models for AI board generation and word prediction; NOTE: runtime path DISABLED 2026-07-09 -- the GEMINI_API_KEY fallback was removed from lib/ai_word_predictor.rb, lib/ai_prediction_generator.rb, and lib/ai_board_generator.rb (Gemini Developer/AI-Studio endpoint data-handling terms inadequate for child data). No active code path sends data to Gemini today; a Vertex AI fallback may replace it. Row retained pending reactivation (compliance calendar rev-gemini-baa-annual; removal per section 7). | Pseudonymized (scrubbed) prompts only IF used, redacted by lib/pii_scrubber.rb before transmission; still personal data under GDPR/UK-GDPR | Currently none (runtime path disabled 2026-07-09); would be Yes -- pseudonymized if reactivated | US | DPA via Google Cloud Terms of Service and Data Processing Addendum | https://cloud.google.com/terms/data-processing-addendum |
| 6 | HubSpot, Inc. | Marketing CRM, lifecycle email, customer support | Prospect names, emails, company names, marketing engagement events; no student data | No (LingoLinq customer records only) | US, with EU regional options | DPA via HubSpot Customer DPA | https://legal.hubspot.com/dpa |
| 7 | Functional Software, Inc. (Sentry) | Application error monitoring | Stack traces, request metadata, optional user ID; PII scrubbing filters active | Potentially yes if filters fail; treat as Yes for review | US | DPA via Sentry Customer DPA | https://sentry.io/trust/ |
| 8 | n8n GmbH (self-hosted on LingoLinq Render) | Internal workflow automation | No customer data; operational signals only | No | us-east (same Render infrastructure) | No third-party processing; covered by Render | https://n8n.io/legal/ |
| 9 | Cake.com Inc. (Clockify) | Internal time tracking | LingoLinq employee and contractor time entries; no customer data | No | US | DPA via Clockify standard terms | https://clockify.me/privacy-policy |
| 10 | Render Managed PostgreSQL | Relational database for the production application | All tenant application data at rest | Yes | us-east | Covered by Render DPA, BAA pending | https://render.com/docs/databases |
| 11 | Cloudflare, Inc. | DNS resolution; CDN in front of marketing site where applicable | Request metadata, IP addresses, user agents for traffic to public endpoints | Incidental only (IP and UA for public traffic) | Global anycast | DPA via Cloudflare Customer DPA | https://www.cloudflare.com/cloudflare-customer-dpa/ |
| 12 | Google LLC (Google Workspace) | LingoLinq corporate email, calendar, Drive, Chat | LingoLinq employee and contractor business data | No (corporate productivity only) | US, EU failover | DPA via Google Workspace DPA | https://workspace.google.com/terms/dpa_terms.html |
| 13 | 1Password Corp. | Password and secrets management for LingoLinq staff | LingoLinq internal secrets; no customer data | No | US and Canada | DPA via 1Password standard terms | https://1password.com/legal/data-processing-agreement |
| 14 | GitHub, Inc. | Source code hosting and CI | LingoLinq source code, issue content; customer data is not permitted in this system | No (policy: no customer data) | US | DPA via GitHub Customer DPA | https://docs.github.com/en/site-policy/privacy-policies/github-data-protection-agreement |

## 5. Data Flow Notes

### 5.1 AI API calls (OpenAI, Anthropic, Google)

All runtime AI API calls that involve user content pass through `lib/pii_scrubber.rb` before transmission. The scrubber applies a pattern, key, and blocklist strategy to redact names, emails, phone numbers, and tenant-identifying tokens. Redacted payloads are logged to `AiApiLog` for audit. Feature flags in `lib/feature_flags.rb` gate which tenants have AI features enabled. (The offline `AiPredictionGenerator` dictionary builder also calls AI APIs, but sends only generic starter words from built-in word lists — no user or tenant content — so it is neither scrubbed nor logged to `AiApiLog`.)

Scrubbed prompts are classified as **pseudonymized personal data, not anonymous or de-identified data**: the scrubber removes direct identifiers, but the payloads remain personal data under GDPR/UK-GDPR and are treated as such in this register. Pseudonymization here is a safeguard (Article 32), not an exemption from data protection obligations.

Scrubbing removes *known* direct identifiers — patterns (emails, phones), account-derived names, and configured blocklists. A free-hand third-party name (family member, peer, school staff) typed into free text that matches none of those sources can evade the scrubber; NER-based coverage remains an open item (see the limitation note in `lib/eval_narrator.rb`). Scrubbing is therefore a strong safeguard, designed to remove direct identifiers, not an absolute guarantee — which is why the AI vendor rows above answer "Yes — pseudonymized" rather than "No".

### 5.2 Render

Render is the hosting platform for every production service: web, worker, scheduler, and n8n. Managed PostgreSQL and managed Redis are provisioned inside the same Render account. BAA negotiation with Render is in progress; until it is executed, LingoLinq does not onboard new hospital tenants that require a formal HIPAA BAA with the hosting provider.

### 5.3 AWS

AWS is used for S3 object storage (board media, recordings, backups) and KMS key management. The AWS BAA covers all HIPAA-eligible services used by LingoLinq and was executed on 2026-02-07 for account 2390-4478-5114.

### 5.4 Sentry PII posture

Sentry SDK configuration in the Rails application must enable `send_default_pii: false` and run the project-level data scrubbing rules. Any incident where Sentry ingests raw PII is treated as a subprocessor breach and handled per `BREACH_RUNBOOK.md`. Configuration is reviewed quarterly.

### 5.5 HubSpot

HubSpot receives data via `lib/external_tracker.rb`. The code path gates on `supporter_registration?`, `external_email_allowed?`, and `cookies_opted_out?`. Student and patient accounts never reach HubSpot; only marketing-qualified supporters and paying customer contacts do. COPPA review of the registration flow is in progress.

### 5.6 AWS SNS (SMS delivery)

The `lib/pusher.rb` module is an internal naming relic from the CoughDrop fork; it is an `aws-sdk-sns` wrapper used to deliver transactional SMS (supervisor consent invitations, two-factor codes, password resets). Phone numbers and short message bodies are transmitted to AWS SNS; no communication content or board data is sent. This flow is covered by the AWS BAA executed on 2026-02-07 and is listed under subprocessor #1 (Amazon Web Services).

### 5.7 Planned: Google Cloud Platform / Cloud Run (migration in progress, NOT yet an active subprocessor)

LingoLinq is migrating production compute from Render to Google Cloud Run, with object storage and email staying on AWS (project: Render-to-GCP Cloud Run migration). When that cutover lands, GCP becomes a subprocessor that processes tenant application data at rest and in compute (Cloud Run, Cloud SQL, Memorystore over a private VPC), and Google must be added to the table in section 4 as an active subprocessor.

This has not happened yet, so Google compute is **deliberately not listed as an active subprocessor today**. Two items gate that listing; as of 2026-07-14 the first is closed and the second remains open:

1. **Executed agreements on file -- SATISFIED 2026-07-12/14.** The Google Cloud data-processing and HIPAA terms for project `lingolinq-prod` were reviewed and accepted in the GCP console by scot@lingolinq.com: the Cloud Data Processing Addendum (CDPA) and the Google Cloud HIPAA Business Associate Addendum (BAA) on 2026-07-12, and the European Data Protection Law Standard Contractual Clauses (EU GDPR, UK GDPR, Swiss FDPA) certified 2026-07-14. This formalizes at the `lingolinq-prod` project level the org-wide Google BAA previously accepted 2026-06-08. Under the HIPAA BAA, PHI is permitted on Google Cloud subject to BAA terms, which are necessary but not sufficient (HIPAA-eligible services only, encryption in transit and at rest, access controls, minimum necessary). Google issues no countersigned PDF for these; the console acceptance record is the authoritative evidence and is captured in-repo at `docs/legal/GCP_BAA_ACCEPTED.md` (parity with `AWS_BAA_ACCEPTED.md`). Evidence: Google Drive "Compliance Audits" folder, "Google Cloud Platform - Accepted Compliance Agreements (captured 2026-07-14)" plus the source console screenshots; Notion "Vendor BAAs & Subprocessor Registry" Google row updated 2026-07-14. Scope boundary: this is an **infrastructure** BAA covering the products on Google's HIPAA Covered Products list in use or planned for hosting (Cloud Run, Cloud SQL, Memorystore); it does not extend to Vertex AI as a whole, so any future Vertex AI or Gemini inference path requires per-product covered-service verification before PHI or child data. It does **not** cover the Anthropic model-provider egress path, which remains governed separately by the PiiScrubber and the no-identifiable-data policy (see `AI_GOVERNANCE_MEMO.md`); the compliance-calendar Gemini-path item (`rev-gemini-baa-annual`) is likewise a separate model-provider concern.
2. **Cutover actually carries data -- still open.** Phase 3 of the migration (Cloud SQL, Memorystore, VPC) is drafted, but the live production environment still runs on Render; the `rediss://` TLS capability (#410) is shipped but is not yet the live path. Until production tenant data actually runs on GCP, Google compute remains a **planned** subprocessor, not an active one. At cutover, add the GCP row to section 4, give 30 days advance change notice per section 2, and log the change below.

   This planned (not active) classification depends on the `lingolinq-prod` project not already holding tenant personal data through Cloud Logging, database backups, or migration-rehearsal artifacts; if it did, GCP would already be a processor under Article 28 and the active-listing plus the 30-day customer-notice clock would start now, not at cutover. **Confirmed by Scot Wahlquist 2026-07-16: `lingolinq-prod` has no real users and no tenant (student/patient) personal data yet; any data present is synthetic/test.** GCP is therefore not yet processing personal data and correctly remains a planned (not active) subprocessor. Re-confirm at the 2026-07-20 quarterly review and immediately before cutover, when production tenant data begins to flow.

Consistency note (2026-07-12 Two-Plane AI Architecture decision): that decision's target of production inference via Vertex AI would first require confirming that Vertex AI (or the specific Vertex/Gemini product used) is a Google HIPAA Covered Service; the infrastructure BAA does not by itself extend to it. It is a direction, not a live path -- the runtime today is Anthropic-only, and the Google Gemini/Vertex inference fallback was disabled 2026-07-09 (PR #570). No AI inference reaches Google today.

Google LLC already appears in the table for the **Gemini API** (#5, disabled runtime path) and **Google Workspace** (#12, corporate productivity). The Cloud Run / infrastructure relationship is distinct from both and will be a separate row.

## 6. Pseudonymized (Scrubbed) Data Standard

For any subprocessor marked as receiving only pseudonymized data, LingoLinq applies the scrubbing pipeline documented in `lib/pii_scrubber.rb`. Scrubbed payloads must not include names, email addresses, phone numbers, street addresses, precise geolocation, tenant names, or any free-text field that has not been passed through the scrubber. A quarterly sampling audit verifies scrubber coverage.

Scrubbed payloads remain **personal data** under GDPR/UK-GDPR (pseudonymized, per Article 4(5)): the removal of direct identifiers reduces risk but does not render the data anonymous, and all processor obligations continue to apply to vendors receiving it. This register previously described these flows as "de-identified"; that language was corrected on 2026-07-06 (classification only — the data flows themselves are unchanged).

## 7. Exit Criteria

When LingoLinq ends a subprocessor relationship, the Privacy Contact confirms that:

- All LingoLinq data has been deleted or returned per the DPA
- Written confirmation of deletion has been obtained
- The vendor is removed from the register with a dated note in the change log below
- Customers are notified in the next subprocessor change bulletin

## 8. Change Log

| Date | Change | Notified to customers |
|---|---|---|
| 2026-04-20 | Register established, 14 subprocessors recorded | Bulletin planned for 2026-05-20 |
| 2026-04-23 | Removed Pusher Ltd. entry: `lib/pusher.rb` is an AWS SNS SMS wrapper, not a Pusher.com integration. SMS flow is now described under AWS (subprocessor #1). | Bulletin planned for 2026-05-20 |
| 2026-06-18 | Added section 5.7 flagging the planned GCP / Cloud Run migration. Google compute is NOT yet an active subprocessor; the row is added at cutover once the infrastructure BAA is filed. No change to the active list. | No customer notice yet (no active change) |
| 2026-07-06 | Reclassified AI vendor rows 3-5 (OpenAI, Anthropic, Google Gemini) from "de-identified" to "pseudonymized (scrubbed) personal data", and corrected the reaches-vendor column from "No" to "Yes — pseudonymized" for the active AI flows (pseudonymized learner content remains student personal data under GDPR/UK-GDPR). Row 3 annotated: no active code path sends data to OpenAI as of this date (in-repo OpenAI SDK clients target Gemini's endpoint); removal per section 7 pending Privacy Office review. Section 6 renamed and scrubber-limitation language qualified ("removes known direct identifiers by design", not a guarantee). Classification correction only; no change to actual data flows or vendor contracts. | Privacy Office to confirm at the 2026-07-20 quarterly review whether a clarification bulletin is warranted (no vendor or flow change) |
| 2026-07-12 | Reclassified AI vendor row 5 (Google Gemini API) from an active AI flow to DISABLED / historical, correcting the register to match runtime state. The runtime Gemini fallback was removed on 2026-07-09 (lib/ai_word_predictor.rb, lib/ai_prediction_generator.rb, lib/ai_board_generator.rb; the Gemini Developer/AI-Studio endpoint's data-handling terms are inadequate for child data). Row 5 reaches-vendor changed from "Yes -- pseudonymized" to "Currently none (no active flow)"; row retained pending reactivation (rev-gemini-baa-annual). This removes a stale active-flow claim; no new data flow is introduced. | Privacy Office to note at the 2026-07-20 quarterly review; no customer notice (removal of a flow, not a new one) |
| 2026-07-16 | Recorded execution of the Google Cloud **infrastructure** agreements for project `lingolinq-prod`: CDPA + HIPAA BAA accepted 2026-07-12 and SCCs certified 2026-07-14, formalizing the org-wide Google BAA of 2026-06-08 (section 5.7 blocker 1 marked satisfied; PHI now permitted on GCP under BAA terms). Google compute remains a **planned**, not active, subprocessor until the Render-to-GCP cutover carries production data (blocker 2 still open), so no change to the active list in section 4. Does not extend to the Anthropic AI-egress path. | No customer notice yet (no active change; the 30-day notice is due at cutover per section 2) |
