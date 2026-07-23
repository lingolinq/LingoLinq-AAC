# LingoLinq Subprocessor Register

**Owner:** Privacy Office (privacy@lingolinq.com)
**Last reviewed:** 2026-04-20 (last full review)
**Last amended:** 2026-07-22 (two amendments this day: (1) Gate 1 GCP cutover recorded -- Google Cloud Platform infrastructure host added as #19; (2) localization/speech re-scope + covered-service confirmation -- added Google Cloud Speech-to-Text (#18), an automatic upload of user VOICE-RECORDING audio the 2026-07-21 pass missed; confirmed all three Google localization/speech services are BAA covered products (independently verified against Google's HIPAA covered-products list); flagged the residual that all Cloud TTS calls use the Pre-GA `v1beta1` endpoint, which the BAA excludes for PHI (repoint to GA `v1`); DRAFT pending Privacy Office / CEO sign-off; see change log)
**Next review:** 2026-10-20 (quarterly)
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
| 2 | Render Services, Inc. | Superseded primary application host; retained temporarily as write-frozen rollback fallback pending decommission | Frozen production database copy, logs, environment, and fallback app services until deleted or restricted | Yes until decommission | us-east (Ohio primary) | DPA signed; BAA pending; no new hospital tenants relying on Render fallback | https://render.com/legal/dpa and https://render.com/security |
| 3 | OpenAI, L.L.C. | GPT models (contracted); NOTE: no active code path sends data to OpenAI as of 2026-07-06 — the in-repo OpenAI SDK clients target Google's Gemini OpenAI-compatible endpoint. Row retained pending Privacy Office review (removal per section 7). | Pseudonymized (scrubbed) prompts only IF used, redacted by lib/pii_scrubber.rb before transmission; still personal data under GDPR/UK-GDPR | Currently none (no active flow); would be Yes — pseudonymized if activated | US | DPA via OpenAI API standard terms | https://openai.com/policies/data-processing-addendum |
| 4 | Anthropic, PBC | Claude models for AI board generation, word prediction, and eval-narrative drafting | Pseudonymized (scrubbed) prompts only, redacted by lib/pii_scrubber.rb before transmission; still personal data under GDPR/UK-GDPR | Yes — pseudonymized learner content (direct identifiers removed by design) | US | **HIPAA-Ready BAA executed + HIPAA readiness enabled 2026-07-18** (runtime-dedicated LingoLinq, LLC API org; see docs/legal/ANTHROPIC_BAA_ACCEPTED.md); supersedes the prior Commercial-Terms-DPA-only basis | https://www.anthropic.com/legal/commercial-terms |
| 5 | Google LLC (Gemini API) | Gemini models for AI board generation and word prediction; NOTE: runtime path DISABLED 2026-07-09 -- the GEMINI_API_KEY fallback was removed from lib/ai_word_predictor.rb, lib/ai_prediction_generator.rb, and lib/ai_board_generator.rb (Gemini Developer/AI-Studio endpoint data-handling terms inadequate for child data). No active code path sends data to Gemini today; a Vertex AI fallback may replace it. Row retained pending reactivation (compliance calendar rev-gemini-baa-annual; removal per section 7). | Pseudonymized (scrubbed) prompts only IF used, redacted by lib/pii_scrubber.rb before transmission; still personal data under GDPR/UK-GDPR | Currently none (runtime path disabled 2026-07-09); would be Yes -- pseudonymized if reactivated | US | DPA via Google Cloud Terms of Service and Data Processing Addendum | https://cloud.google.com/terms/data-processing-addendum |
| 6 | HubSpot, Inc. | Marketing CRM, lifecycle email, customer support | Prospect names, emails, company names, marketing engagement events; no student data | No (LingoLinq customer records only) | US, with EU regional options | DPA via HubSpot Customer DPA | https://legal.hubspot.com/dpa |
| 7 | Functional Software, Inc. (Sentry) | Application error monitoring | Stack traces, request metadata, optional user ID; PII scrubbing filters active | Potentially yes if filters fail; treat as Yes for review | US | DPA via Sentry Customer DPA | https://sentry.io/trust/ |
| 8 | n8n GmbH (self-hosted on LingoLinq Render) | Internal workflow automation | No customer data; operational signals only | No | us-east (same Render infrastructure) | No third-party processing; covered by Render | https://n8n.io/legal/ |
| 9 | Cake.com Inc. (Clockify) | Internal time tracking | LingoLinq employee and contractor time entries; no customer data | No | US | DPA via Clockify standard terms | https://clockify.me/privacy-policy |
| 10 | Render Managed PostgreSQL | Superseded production database retained as write-frozen rollback fallback pending decommission | Frozen production data copy until deleted or restricted | Yes until decommission | us-east | Covered by Render DPA, BAA pending | https://render.com/docs/databases |
| 11 | Cloudflare, Inc. | DNS resolution; CDN in front of marketing site where applicable | Request metadata, IP addresses, user agents for traffic to public endpoints | Incidental only (IP and UA for public traffic) | Global anycast | DPA via Cloudflare Customer DPA | https://www.cloudflare.com/cloudflare-customer-dpa/ |
| 12 | Google LLC (Google Workspace) | LingoLinq corporate email, calendar, Drive, Chat | LingoLinq employee and contractor business data | No (corporate productivity only) | US, EU failover | DPA via Google Workspace DPA | https://workspace.google.com/terms/dpa_terms.html |
| 13 | 1Password Corp. | Password and secrets management for LingoLinq staff | LingoLinq internal secrets; no customer data | No | US and Canada | DPA via 1Password standard terms | https://1password.com/legal/data-processing-agreement |
| 14 | GitHub, Inc. | Source code hosting and CI | LingoLinq source code, issue content; customer data is not permitted in this system | No (policy: no customer data) | US | DPA via GitHub Customer DPA | https://docs.github.com/en/site-policy/privacy-policies/github-data-protection-agreement |
| 15 | Google LLC (Cloud Translation API) | Machine translation of board button labels and word entries (Cloud Translation API v2). Code: `app/models/word_data.rb#query_translations`, reached from `Board#translate_set`, `boards_controller#translate`, `users_controller#translate`, `lib/spanish_library_boards.rb`. | **Raw, UNSCRUBBED user-authored button-label / word text** -- does NOT pass through `lib/pii_scrubber.rb`; a personalized label can carry a child's, family member's, teacher's, or school name. See §5.8. | Yes -- raw user content (prod currently synthetic/test only, pre-MVP; flow is live, gated on `GOOGLE_TRANSLATE_TOKEN`, which is set) | US (googleapis.com) | Covered by the Google Cloud CDPA + entity BAA recorded in §5.7 (accepted 2026-07-12/14 for `lingolinq-prod`; org-wide 2026-06-08). HIPAA covered-service **CONFIRMED 2026-07-22** (Google HIPAA covered-products list, independently verified). Endpoint is Translation API **v2 (GA)** -- no Pre-GA caveat. | https://cloud.google.com/terms/data-processing-addendum |
| 16 | Google LLC (Cloud Text-to-Speech) | Speech-audio generation for spoken text and board auto-sound. Code: `lib/tts.rb#generate_google`, `app/controllers/api/search_controller.rb`. | **Raw, UNSCRUBBED text being spoken** (AAC utterance content) -- not scrubbed; can contain typed identifiers. See §5.8. | Yes -- raw user content (prod currently synthetic/test only, pre-MVP; flow is live) | US (googleapis.com) | Same Google Cloud CDPA + entity BAA as #15 (§5.7). Product covered-service **CONFIRMED 2026-07-22** (Google HIPAA covered-products list). **CAVEAT: all 6 call sites use the Pre-GA `v1beta1` endpoint, which the BAA EXCLUDES for PHI** ("Do not use Pre-GA offerings ... in connection with PHI"). Repoint to GA `v1` (drop-in; identical `input`/`voice`/`audioConfig` shape, verified) before PHI. Tracked in LL-a167848115. | https://cloud.google.com/terms/data-processing-addendum |
| 17 | Trinity College Dublin -- ADAPT Centre (abair.ie) | Irish-language (Gaeilge) text-to-speech synthesis. Code: `lib/tts.rb#generate_irish` to `https://abair.ie/aac_irish`. | **Raw, UNSCRUBBED text being spoken** in Irish TTS -- not scrubbed. See §5.8. | Yes -- raw user content (prod currently synthetic/test only, pre-MVP) | Ireland (EU) | **Pending -- NO DPA on file.** Academic/research endpoint; needs a DPA/SCCs, or disable Irish TTS until one exists (finding LL-a167848115). | https://abair.ie |
| 18 | Google LLC (Cloud Speech-to-Text) | Transcription of user-recorded button-sound audio (Speech-to-Text v1 `speech:recognize`). Code: `app/models/button_sound.rb#schedule_transcription`, fired automatically by the `after_save :schedule_transcription` hook whenever a recorded sound has a `secondary_url` and no transcription yet. Uses `GOOGLE_TRANSLATE_TOKEN` (set). | **Raw user VOICE RECORDING (audio blob), the highest-sensitivity flow in this register** -- an actual recording of a communicator or caregiver, uploaded whole. Audio **cannot** be run through `lib/pii_scrubber.rb` (the scrubber only redacts text); voice is biometric-adjacent and may be GDPR Art. 9 special-category data. See §5.8. | Yes -- raw user voice audio (prod currently synthetic/test only, pre-MVP; flow is live and automatic) | US (googleapis.com) | Same Google Cloud CDPA + entity BAA as #15/#16 (§5.7). Covered-service **CONFIRMED 2026-07-22** (Google HIPAA covered-products list). Endpoint is Speech-to-Text **v1 (GA)** -- no Pre-GA caveat. | https://cloud.google.com/terms/data-processing-addendum |
| 19 | Google LLC (Google Cloud Platform infrastructure) | Live production application hosting on Cloud Run, Cloud SQL PostgreSQL, Memorystore Redis, load balancing, and supporting logs for project `lingolinq-prod` | Full tenant application data in compute and database; operational logs; secrets surfaced through GCP Secret Manager | Yes | US | CDPA + HIPAA BAA accepted 2026-07-12; SCCs certified 2026-07-14 | https://cloud.google.com/terms/data-processing-addendum and `docs/legal/GCP_BAA_ACCEPTED.md` |

## 5. Data Flow Notes

### 5.1 AI API calls (OpenAI, Anthropic, Google)

All runtime AI API calls that involve user content pass through `lib/pii_scrubber.rb` before transmission. The scrubber applies a pattern, key, and blocklist strategy to redact names, emails, phone numbers, and tenant-identifying tokens. Redacted payloads are logged to `AiApiLog` for audit. Feature flags in `lib/feature_flags.rb` gate which tenants have AI features enabled. (The offline `AiPredictionGenerator` dictionary builder also calls AI APIs, but sends only generic starter words from built-in word lists — no user or tenant content — so it is neither scrubbed nor logged to `AiApiLog`.)

Scrubbed prompts are classified as **pseudonymized personal data, not anonymous or de-identified data**: the scrubber removes direct identifiers, but the payloads remain personal data under GDPR/UK-GDPR and are treated as such in this register. Pseudonymization here is a safeguard (Article 32), not an exemption from data protection obligations.

Scrubbing removes *known* direct identifiers — patterns (emails, phones), account-derived names, and configured blocklists. A free-hand third-party name (family member, peer, school staff) typed into free text that matches none of those sources can evade the scrubber; NER-based coverage remains an open item (see the limitation note in `lib/eval_narrator.rb`). Scrubbing is therefore a strong safeguard, designed to remove direct identifiers, not an absolute guarantee — which is why the AI vendor rows above answer "Yes — pseudonymized" rather than "No".

### 5.2 Render

Render was the production hosting platform before the 2026-07-22 Gate 1 DNS cutover. It is now
superseded as the active branded-domain host by Google Cloud Platform, but remains online as a
write-frozen rollback fallback at `https://lingolinq-prod.onrender.com` until a separately
authorized decommission. Managed PostgreSQL and managed Redis in Render therefore remain in this
register until deletion or restriction is verified. BAA negotiation with Render is no longer the
hosting path for new production traffic, and LingoLinq does not onboard new hospital tenants that
would rely on the Render fallback.

### 5.3 AWS

AWS is used for S3 object storage (board media, recordings, backups) and KMS key management. The AWS BAA covers all HIPAA-eligible services used by LingoLinq and was executed on 2026-02-07 for account 2390-4478-5114.

### 5.4 Sentry PII posture

Sentry SDK configuration in the Rails application must enable `send_default_pii: false` and run the project-level data scrubbing rules. Any incident where Sentry ingests raw PII is treated as a subprocessor breach and handled per `BREACH_RUNBOOK.md`. Configuration is reviewed quarterly.

### 5.5 HubSpot

HubSpot receives data via `lib/external_tracker.rb`. The code path gates on `supporter_registration?`, `external_email_allowed?`, and `cookies_opted_out?`. Student and patient accounts never reach HubSpot; only marketing-qualified supporters and paying customer contacts do. COPPA review of the registration flow is in progress.

### 5.6 AWS SNS (SMS delivery)

The `lib/pusher.rb` module is an internal naming relic from the CoughDrop fork; it is an `aws-sdk-sns` wrapper used to deliver transactional SMS (supervisor consent invitations, two-factor codes, password resets). Phone numbers and short message bodies are transmitted to AWS SNS; no communication content or board data is sent. This flow is covered by the AWS BAA executed on 2026-02-07 and is listed under subprocessor #1 (Amazon Web Services).

### 5.7 Google Cloud Platform / Cloud Run (active production infrastructure)

LingoLinq completed the Gate 1 DNS cutover on 2026-07-22. `app.lingolinq.com` now serves from
Google Cloud Platform, with production compute on Cloud Run, relational data on Cloud SQL
PostgreSQL, and Redis/Resque on Memorystore over TLS. Object storage and email remain on AWS.
Google Cloud Platform infrastructure is now listed as active subprocessor #19.

The Google Cloud data-processing and HIPAA terms for project `lingolinq-prod` were reviewed and
accepted in the GCP console by scot@lingolinq.com: the Cloud Data Processing Addendum (CDPA) and the
Google Cloud HIPAA Business Associate Addendum (BAA) on 2026-07-12, and the European Data Protection
Law Standard Contractual Clauses (EU GDPR, UK GDPR, Swiss FDPA) certified 2026-07-14. This
formalizes at the `lingolinq-prod` project level the org-wide Google BAA previously accepted
2026-06-08. Under the HIPAA BAA, PHI is permitted on Google Cloud subject to BAA terms, which are
necessary but not sufficient (HIPAA-eligible services only, encryption in transit and at rest, access
controls, minimum necessary). Google issues no countersigned PDF for these; the console acceptance
record is the authoritative evidence and is captured in-repo at `docs/legal/GCP_BAA_ACCEPTED.md`.
Evidence: Google Drive "Compliance Audits" folder, "Google Cloud Platform - Accepted Compliance
Agreements (captured 2026-07-14)" plus the source console screenshots; Notion "Vendor BAAs &
Subprocessor Registry" Google row updated 2026-07-14 and cutover status updated 2026-07-22.

Scope boundary: this is an **infrastructure** BAA covering the products on Google's HIPAA Covered
Products list in use for hosting (Cloud Run, Cloud SQL, Memorystore); it does not extend to Vertex
AI as a whole, so any future Vertex AI or Gemini inference path requires per-product covered-service
verification before PHI or child data. It does **not** cover the Anthropic model-provider egress
path, which is covered by Anthropic's own HIPAA-Ready BAA (executed 2026-07-18; see
`ANTHROPIC_BAA_ACCEPTED.md`) with the PiiScrubber and no-identifiable-data policy retained as
defense-in-depth. The compliance-calendar Gemini-path item (`rev-gemini-baa-annual`) is likewise a
separate model-provider concern.

Consistency note (2026-07-12 Two-Plane AI Architecture decision): that decision's target of production inference via Vertex AI would first require confirming that Vertex AI (or the specific Vertex/Gemini product used) is a Google HIPAA Covered Service; the infrastructure BAA does not by itself extend to it. It is a direction, not a live path -- the runtime today is Anthropic-only, and the Google Gemini/Vertex inference fallback was disabled 2026-07-09 (PR #570). No AI inference reaches Google today.

Google LLC also appears in the table for the **Gemini API** (#5, disabled runtime path) and
**Google Workspace** (#12, corporate productivity). The Cloud Run / infrastructure relationship is
distinct from both and is listed separately as row #19.

### 5.8 Localization and speech flows are NOT scrubbed (open remediation item)

Four runtime flows send **raw, unscrubbed user content** to a third party and, unlike the AI rows in §5.1, do **not** pass through `lib/pii_scrubber.rb`:

- **Cloud Translation** (#15) -- board button labels / word strings, `app/models/word_data.rb#query_translations`.
- **Cloud Text-to-Speech** (#16) -- spoken text, `lib/tts.rb#generate_google` and `app/controllers/api/search_controller.rb`.
- **Abair Irish TTS** (#17) -- spoken text, `lib/tts.rb#generate_irish`.
- **Cloud Speech-to-Text** (#18) -- a **user voice recording (audio blob)**, `app/models/button_sound.rb#schedule_transcription`, fired automatically by an `after_save` hook. This is the highest-sensitivity flow here and the one added in the 2026-07-22 re-scope.

**Why "scrub it" is the wrong frame for most of these.** Text scrubbing is deliberately absent because redacting a label or utterance corrupts the very output the feature produces (you cannot translate or speak a name you have removed), and for the audio flow (#18) scrubbing is not even possible -- `pii_scrubber.rb` operates on text, not on a voice recording. The correct primary control for the Google flows (#15/#16/#18) is therefore **not** a scrubber but (a) each being a **covered service under the existing Google Cloud BAA** recorded in §5.7, plus (b) disclosure (this register). **Covered-service status was CONFIRMED 2026-07-22** against Google's canonical HIPAA covered-products list (cloud.google.com/security/compliance/hipaa, independently verified): Cloud Translation, Speech-to-Text, and Text-to-Speech are all listed. Where the BAA covers the service, raw content is contractually permitted the same way it is for any covered Cloud processor.

**One concrete residual remains** even after covered-service confirmation: Google's BAA **excludes Pre-GA offerings from PHI** ("Do not use Pre-GA offerings ... in connection with PHI"). Cloud Translation (v2) and Speech-to-Text (v1) call the GA endpoints, so they are clear. But **all six Cloud Text-to-Speech call sites (`lib/tts.rb`, `app/controllers/api/search_controller.rb`) use the Pre-GA `v1beta1` endpoint**, which falls under that exclusion. The remediation is a drop-in repoint of those six sites to the GA `v1` endpoint (verified: `v1` supports the same `text:synthesize` `input`/`voice`/`audioConfig` shape and `voices.list?languageCode=`). Tracked in LL-a167848115. Remaining hardening options open with the CEO: a per-flow COPPA-consent gate, and a feature flag to disable a flow per tenant. The gap is tracked as findings **LL-c38e7da48e** (translation), **LL-a167848115** (TTS: Google TTS + Abair), and **LL-1eb9a2435b** (voice-audio transcription, #18). Until confirmed these rows answer "Yes -- raw" rather than "Yes -- pseudonymized". As of 2026-07-16 `lingolinq-prod` carries only synthetic/test data (§5.7), so no real learner content transits these flows yet, but the code paths are live.

Two flows have **no contractual basis at all** and are the clear-cut removals, independent of the covered-service question above:

- `app/controllers/api/search_controller.rb:408` posts arbitrary text to `translate.google.com/translate_tts`, the **unauthenticated consumer** Google endpoint (not a contracted Cloud service). It has no DPA basis. It is only reached when `GOOGLE_TTS_TOKEN` is unset, and that token **is** set in prod, so this fallback is effectively dead in prod today -- it should be removed rather than documented as an approved subprocessor. Part of finding LL-a167848115.
- **Abair** (#17) has no DPA on file; it is the only EU-hosted flow and needs a DPA/SCCs or an Irish-TTS disable. This is a product tradeoff (disabling removes Irish-language speech) and is a CEO call. Part of finding LL-a167848115.

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
| 2026-07-21 | Recorded three previously-omitted **active** data flows that send raw, unscrubbed user-authored content to third parties: Google Cloud Translation (#15), Google Cloud Text-to-Speech (#16), and Trinity College Dublin / ADAPT `abair.ie` Irish TTS (#17). These correct an omission -- the flows exist in code today (see §5.8) -- and are distinct from the AI (scrubbed) rows and the planned GCP infrastructure row. Abair has **no DPA on file** (status Pending). DRAFT pending Privacy Office / CEO sign-off; the covered-service status of Cloud Translation/TTS under the Google BAA, and the egress-scrubbing decision, remain open (findings LL-c38e7da48e, LL-a167848115). | No customer notice (prod carries only synthetic/test data pre-MVP per §5.7; 30-day notice under §2 is due before real tenant data flows) |
| 2026-07-22 | Covered-service confirmation. Verified all three Google flows (#15 Translation, #16 TTS, #18 Speech-to-Text) are **BAA covered products** against Google's canonical HIPAA covered-products list (cloud.google.com/security/compliance/hipaa), independently confirmed. Recorded one concrete residual: Google's BAA excludes Pre-GA offerings from PHI, and all six Cloud **TTS** call sites use the Pre-GA `v1beta1` endpoint (Translation v2 and STT v1 are GA and clear). Remediation is a drop-in repoint to GA `v1` (shape-compatible, verified), tracked in LL-a167848115. Rows #15/#16/#18 and §5.8 updated. | No customer notice (documentation/verification only; no data-flow or contract change) |
| 2026-07-22 | Re-scope after a full egress-surface trace while designing the localization/speech control. Added Google Cloud Speech-to-Text (#18): `app/models/button_sound.rb#schedule_transcription` uploads a **user voice-recording audio blob** to `speech.googleapis.com/v1/speech:recognize` automatically via an `after_save` hook -- the highest-sensitivity flow in this register and one the 2026-07-21 pass missed entirely. Rewrote §5.8 to correct the control framing: for the Google flows the primary control is **BAA covered-service confirmation + disclosure**, not text scrubbing (which cannot apply to audio at all and would corrupt translation/TTS output); the two no-contract flows (consumer `translate_tts`, effectively dead in prod; and DPA-less Abair) are the clear-cut removals. Opened a distinct finding for #18. DRAFT pending Privacy Office / CEO sign-off. | No customer notice (prod carries only synthetic/test data pre-MVP per §5.7; 30-day notice under §2 is due before real tenant data flows) |
| 2026-07-18 | Row 4 (Anthropic) contract basis updated from Commercial-Terms DPA to an executed **HIPAA-Ready BAA with HIPAA readiness enabled** on the runtime-dedicated LingoLinq, LLC API org (verified live: Messages API 200, Files API 400; see docs/legal/ANTHROPIC_BAA_ACCEPTED.md). This is a contract-basis upgrade for an existing flow, not a new flow or a new vendor; the pseudonymized-personal-data classification and reaches-vendor="Yes" are unchanged. PHI is now permitted to Anthropic over the Messages API under BAA terms. All four runtime seams are in-scope; eval narration is classified as an assistive-technology access assessment, not a Healthcare Activity (Scot 2026-07-19), so no licensed-clinician gate applies (see docs/legal/ANTHROPIC_BAA_ACCEPTED.md). | No customer notice required (no new subprocessor and no new data flow; contract-basis strengthening only). Privacy Office to note at the 2026-07-20 quarterly review. |
| 2026-07-22 | Gate 1 DNS cutover completed: `app.lingolinq.com` is live on GCP Cloud Run, with Cloud SQL PostgreSQL and Memorystore Redis carrying production traffic. Added Google Cloud Platform infrastructure as active subprocessor #15. Updated Render rows #2 and #10 from active primary hosting/database to superseded write-frozen rollback fallback pending decommission. Render remains listed until its production fallback data and services are deleted or restricted. (Row number reconciled to #19 on merge with the localization/speech re-scope PR, which had independently claimed #15-#18.) | Customer subprocessor notice required per section 2; record bulletin timing before external publication. |
