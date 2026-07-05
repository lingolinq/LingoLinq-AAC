# LingoLinq Subprocessor Register

**Owner:** Privacy Office (privacy@lingolinq.com)
**Last reviewed:** 2026-04-20
**Next review:** 2026-07-20 (quarterly)
**Related:** `docs/legal/BREACH_RUNBOOK.md`, `docs/legal/DATA_RETENTION.md`, `COMPLIANCE.md`

## 1. Purpose

This register lists every third party that LingoLinq uses to process data in support of the LingoLinq platform. It is maintained to satisfy Article 28 of GDPR, the HIPAA Business Associate obligations at 45 CFR § 164.502(e), and the transparency expectations of US school and hospital customers under FERPA and state student-data-privacy laws.

## 2. Change Notification

LingoLinq will provide customers with at least 30 days advance notice before any change to this subprocessor list that affects their tenant. Customers may object to a proposed change by writing to privacy@lingolinq.com. Notifications are delivered by email to the named privacy contact for each tenant and posted at https://lingolinq.com/legal/subprocessors.

## 3. Legend

- **Student or patient data reaches this vendor?** "Yes" means the vendor can receive identifying or content data tied to a learner or patient. "No" means the vendor only receives pseudonymized (scrubbed), aggregate, or LingoLinq corporate data with no direct identifiers. Pseudonymized data remains personal data under GDPR/UK-GDPR; "No" in this column means no *direct identifiers* reach the vendor, not that the data is anonymous.
- **DPA / BAA status:** "Signed [date]" is executed and on file. "Via standard terms" means the vendor's standard online DPA applies and no custom agreement is negotiated. "Pending" means in progress.

## 4. Active Subprocessors

| # | Subprocessor | Service provided | Data categories | Student or patient data reaches this vendor? | Region | DPA / BAA status | Privacy / security reference |
|---|---|---|---|---|---|---|---|
| 1 | Amazon Web Services, Inc. | S3 object storage, KMS, RDS (if used), CloudFront | User-uploaded media, database backups, application secrets | Yes | us-east-1 | BAA signed 2026-02-07, account 2390-4478-5114 | https://aws.amazon.com/compliance/data-privacy/ |
| 2 | Render Services, Inc. | Application hosting, managed PostgreSQL, managed Redis, scheduler, worker services | Full application data at rest in PostgreSQL; logs; environment | Yes | us-east (Ohio primary) | DPA signed; BAA pending | https://render.com/legal/dpa and https://render.com/security |
| 3 | OpenAI, L.L.C. | GPT models for AI board generation and language support | Pseudonymized (scrubbed) prompts only, redacted by lib/pii_scrubber.rb before transmission; still personal data under GDPR/UK-GDPR | No (pseudonymized; no direct identifiers) | US | DPA via OpenAI API standard terms | https://openai.com/policies/data-processing-addendum |
| 4 | Anthropic, PBC | Claude models for AI board generation and content | Pseudonymized (scrubbed) prompts only, redacted by lib/pii_scrubber.rb before transmission; still personal data under GDPR/UK-GDPR | No (pseudonymized; no direct identifiers) | US | DPA via Anthropic Commercial Terms | https://www.anthropic.com/legal/commercial-terms |
| 5 | Google LLC (Gemini API) | Gemini models for AI board generation | Pseudonymized (scrubbed) prompts only, redacted by lib/pii_scrubber.rb before transmission; still personal data under GDPR/UK-GDPR | No (pseudonymized; no direct identifiers) | US | DPA via Google Cloud Terms of Service and Data Processing Addendum | https://cloud.google.com/terms/data-processing-addendum |
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

All AI API calls pass through `lib/pii_scrubber.rb` before transmission. The scrubber applies a pattern, key, and blocklist strategy to redact names, emails, phone numbers, and tenant-identifying tokens. Redacted payloads are logged to `AiApiLog` for audit. Feature flags in `lib/feature_flags.rb` gate which tenants have AI features enabled.

Scrubbed prompts are classified as **pseudonymized personal data, not anonymous or de-identified data**: the scrubber removes direct identifiers, but the payloads remain personal data under GDPR/UK-GDPR and are treated as such in this register. Pseudonymization here is a safeguard (Article 32), not an exemption from data protection obligations.

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

This has not happened yet, so Google compute is **deliberately not listed as an active subprocessor today**. Two items must close before it is:

1. **Executed BAA on file.** The migration record indicates a Google BAA was pursued in Phase 1, but no executed artifact is in `docs/legal/`, and the only Google BAA item currently tracked in the compliance calendar is the Gemini API path (`rev-gemini-baa-annual`). Confirm and file the Cloud Run / GCP infrastructure BAA before any production tenant data reaches GCP.
2. **Cutover actually carries data.** Phase 3 of the migration (Cloud SQL, Memorystore, VPC) is drafted but inert. The `rediss://` TLS capability (#410) is shipped, but the live environment still runs on Render. Add the GCP row, give 30 days advance change notice per section 2, and log the change below at cutover.

Google LLC already appears in the table for the **Gemini API** (#5, pseudonymized prompts) and **Google Workspace** (#12, corporate productivity). The Cloud Run / infrastructure relationship is distinct from both and will be a separate row.

## 6. Pseudonymized (Scrubbed) Data Standard

For any subprocessor marked as receiving only pseudonymized data, LingoLinq applies the scrubbing pipeline documented in `lib/pii_scrubber.rb`. Scrubbed payloads must not include names, email addresses, phone numbers, street addresses, precise geolocation, tenant names, or any free-text field that has not been passed through the scrubber. A quarterly sampling audit verifies scrubber coverage.

Scrubbed payloads remain **personal data** under GDPR/UK-GDPR (pseudonymized, per Article 4(5)): the removal of direct identifiers reduces risk but does not render the data anonymous, and all processor obligations continue to apply to vendors receiving it. This register previously described these flows as "de-identified"; that language was corrected on 2026-07-05 (classification only — the data flows themselves are unchanged).

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
| 2026-07-05 | Reclassified AI vendor rows 3-5 (OpenAI, Anthropic, Google Gemini) from "de-identified" to "pseudonymized (scrubbed) personal data"; scrubbed prompts have no direct identifiers but remain personal data under GDPR/UK-GDPR. Section 6 renamed and updated to match. Classification correction only; no change to data flows or vendors. | No customer notice required (no vendor or flow change) |
