<!-- SSOT banner prepended 2026-06-30 during privacy-map reconciliation. -->

> **SINGLE SOURCE OF TRUTH (technical).** This code-cited map is the authoritative
> source for the three store privacy declarations. Where this file and the
> team-facing narrative in [`privacy-data-flow-map.md`](./privacy-data-flow-map.md)
> disagree, **this file wins** -- every row here is anchored to a `file:line`
> citation. The companion file is retained as plain-English context for reviewers
> who do not read code; treat it as narrative, not as the declaration source.
>
> **Claude-only compliance content. Never route this file or its analysis to
> Codex / DeepSeek / any external model.** (Company rule: compliance content is
> Claude-only.)
>
> **Status:** DRAFT pending Scot sign-off. Reconciled as SSOT 2026-06-30.

# LingoLinq Privacy Data-Flow Evidence Map

**Purpose:** Single authoritative, code-cited source for three store privacy submissions:
- Apple **Privacy Nutrition Label** (App Store Connect)
- Apple **PrivacyInfo.xcprivacy** privacy manifest (required-reason APIs)
- Google Play **Data Safety form**

**Scope:** Backend (Rails 7.2) + Ember 3.28 frontend packaged as native (Cordova/Capacitor) apps. Hosting: Render (migrating to GCP Cloud Run), storage AWS S3.

**Audit basis:** Read against the primary checkout at `/mnt/c/Users/scotw/projects/LingoLinq-AAC` (currently on `main`). Per the documented main-vs-staging trap, the three privacy-sensitive remediations the brief flagged for re-check (Sentry `CoppaSentryScrub`, AI-predictor gating, `AiApiLog` IP-redaction schedule) were verified **present in this checkout** and corroborated by the audit register (PR #225 Sentry swap, PR #222 IP-redaction cron). They are reported as **remediated, not gaps**. `git show origin/staging:<path>` could not be run in this session (no shell tool); staging is at parity-or-ahead per the register, so no main-only false gaps are asserted below.

**Date:** 2026-06-30

---

## Legend

- **Linked to identity?** = whether the data is tied to a user account (Apple/Google both ask this per-type).
- **Child-data note** = whether the flow can carry under-13 / student data and how it is gated.
- File:line citations point at the collection/egress site.

---

## 1. Data-type evidence table

### 1.1 Account / contact identifiers

| Data type | Collected where | Stored where | Egresses to | Linked to identity? | Purpose | Apple category | Google category | Child-data note |
|---|---|---|---|---|---|---|---|---|
| **Email** | User registration; stored in `users.settings['email']` (secure_serialize JSON) | Postgres (encrypted via `secure_serialize` / GoSecure) + `email_hash` column (MD5, identity index) | AWS SES (transactional mail); HubSpot for **supporter/marketing registrants only** (`lib/external_tracker.rb`, gated) | Yes | App functionality (login, notifications); marketing only for supporters | Contact Info > Email Address | Personal info > Email address | Child accounts are typically org/supervisor-managed; student email may be absent or a district alias. Never sent to AI (PiiScrubber identity-key redaction). |
| **Name / full_name** | `users.settings['name']`, `['full_name']` | Postgres (encrypted) | AWS SES (email rendering, e.g. supervisor mailer); HubSpot (supporters only) | Yes | App functionality | Contact Info > Name | Personal info > Name | Student names are real educational-record PII. Redacted before any AI call (`IDENTITY_KEYS`, blocklist of the user's own name in `ai_board_generator.rb:48-53`). |
| **Username (user_name)** | Registration; `User#user_name` | Postgres | Used in board keys, supervisor emails | Yes | App functionality | Identifiers > User ID | Personal info > User IDs | Username often embeds a student handle; redacted to `[REDACTED_USERNAME]` for AI. |
| **Phone (cell_phone)** | `users.settings['cell_phone']` | Postgres (encrypted) | AWS SNS (SMS, where used) | Yes | App functionality (2FA/SMS) | Contact Info > Phone Number | Personal info > Phone number | Rare for students; supervisor/parent contact. Redacted for AI. |
| **Location/address (free text)** | `users.settings['location']` | Postgres (encrypted) | None by default | Yes | Profile | Contact Info > Physical Address | Personal info > Address | Optional; redacted for AI. |
| **old_emails, owner_email, avatar_url** | `users.settings` | Postgres (encrypted); avatar image on S3 | S3 (avatar) | Yes | Account history, avatar | Contact Info / User Content | Personal info / Photos | Avatar may be a child photo if uploaded. |

### 1.2 AAC content (the app's core, and its most sensitive data)

| Data type | Collected where | Stored where | Egresses to | Linked to identity? | Purpose | Apple category | Google category | Child-data note |
|---|---|---|---|---|---|---|---|---|
| **Board content / button labels / vocabulary** | Board editing (client) -> `Board.process_buttons`; offloaded large sets via `ExtraData` | Postgres (`BoardContent`) + S3 (`extra_data` offload) + client IndexedDB/SQLite | S3 (storage/CDN); **AI board generation** prompt context (anonymized) when org opts in | Yes | App functionality | User Content > Other User Content | App activity / Files and docs | Communication vocabulary can reveal disability, medical, and personal context. Person-name buttons are mapped to `[PERSON_n]` and personal images stripped before AI (`PiiScrubber.anonymize_board`, `lib/pii_scrubber.rb:88-127`). |
| **Communication events / utterances (what the user "said")** | Logged client-side, posted to `LogSession`; events incl. `utterance.text`, button presses, spelling | `LogSession.data` (secure_serialize -> Postgres encrypted; large data offloaded to S3 via ExtraData) (`app/models/log_session.rb:25,75-79`) | S3 (extra_data); **never** sent to AI in current paths | Yes (belongs_to :user, :author) | App functionality (therapy logs, reports) | User Content > Other; Sensitive Info (reveals health) | App activity > In-app actions | This is the highest-sensitivity child data: actual utterances of a disabled student. Stays in encrypted Postgres/S3; not egressed to third-party models. PaperTrail keeps destroy-only versions (`log_session.rb:24`). |
| **Button images / symbols / uploaded photos** | Image search + user upload (`content_grabbers.js`, `lib/uploader.rb`) | AWS S3 (presigned PUT/GET, `uploader.rb:37-44`) | AWS S3; AWS CloudFront (CDN); OpenSymbols/Google image search on lookup | Yes (image belongs to user board) | App functionality | User Content > Photos or Videos | Photos and videos | A user-uploaded image may be a child's photo. `anonymize_button` drops non-library `image_id` before AI (`pii_scrubber.rb:473-477`). |
| **Audio recordings (button sounds, recorded speech)** | Client recording via `recordrtc` / Cordova media; `capabilities.record_audio` (`capabilities.js:755`); transcoded | S3 (`ButtonSound`), transcoded via AWS Elastic Transcoder (`lib/transcoder.rb:14-25`) | AWS S3; AWS Elastic Transcoder | Yes | App functionality | User Content > Audio Data | Audio > Voice or sound recordings | A recording can be a child's voice. Stored in S3; transcoder is AWS (covered by AWS infra). |
| **Video (UserVideo)** | Upload/record; transcoded | S3, AWS Elastic Transcoder (`transcoder.rb:26-31`) | AWS S3 + Elastic Transcoder | Yes | App functionality | User Content > Photos or Videos | Photos and videos | May depict a child. |

### 1.3 Usage, diagnostics, location, device

| Data type | Collected where | Stored where | Egresses to | Linked to identity? | Purpose | Apple category | Google category | Child-data note |
|---|---|---|---|---|---|---|---|---|
| **Session / usage logs (counts, durations, word stats)** | `LogSession#generate_defaults/generate_stats` (`log_session.rb:14-15,74-79`); aggregated in `lib/stats.rb` | Postgres (encrypted `data`) + S3 | S3; aggregate-only stats may inform AI (`PiiScrubber.aggregate_usage`, counts only, no records) | Yes | App functionality + therapy analytics | Usage Data > Product Interaction | App activity > App interactions, In-app search | Student usage is a FERPA educational record. Aggregation path returns counts only (`pii_scrubber.rb:135-193`). |
| **Precise location (GPS)** | `navigator.geolocation.getCurrentPosition/watchPosition`, gated behind `permissions.assert('geolocation')` (`_stashes.js:386-408`); `capabilities.js:763` | `LogSession.data['geo']` + `ClusterLocation` (lat/long) (`log_session.rb:56-63`) | None third-party; clustered server-side | Yes | App functionality (location of use, therapy context) | Location > Precise Location | Location > Precise location | **Org data policy can disable**: if `effective_data_policy['geo_logging_allowed'] == false`, geo + IP are stripped on save (`log_session.rb:65-72`). For child/student orgs this should be off by default (policy gap, see Section 4). |
| **IP address (+ city/region geo)** | Request IP captured into `LogSession.data['ip_address']`, `readable_ip_address` (`log_session.rb:60-63`); `ClusterLocation` | Postgres (encrypted); `ClusterLocation` raw IP | iplocate.io (IP geo lookup) + HubSpot city/region for **supporters only** (`external_tracker.rb`); AWS infra | Yes | Functionality + abuse/geo | Identifiers / Coarse Location | Device or other IDs / Location (approx) | Rack request logs are /24-masked upstream; `AiApiLog.ip_address` auto-redacted after 90 days (`ai_api_log.rb:225-229`, scheduled `scheduler.rake:140-143`). Org geo-off also drops IP. |
| **Device identifier (device_id)** | `LogSession belongs_to :device`; client device record | Postgres | None third-party | Yes | Multi-device sync | Identifiers > Device ID | Device or other IDs | Redacted for AI (`IDENTITY_KEYS`). |
| **Installed-apps list (Android)** | `capabilities.apps.all` -> Cordova `LingoLinqMisc.listApps` (`capabilities.js:676-687`), Android + installed app only | Client-side only (used to launch AAC-integration apps) | Not stored/egressed | No (device-scoped) | App functionality (launch other apps) | n/a (declare under App functionality) | App info / "Installed apps"-adjacent | Android-only, gated to installed native app. Declare on Google Play if the list is read; confirm it is not transmitted (it is not, per code). |
| **Crash / diagnostics (errors, performance traces)** | Server-side `sentry-ruby` / `sentry-rails` (`config/initializers/sentry.rb`) | Sentry (third-party) | **Sentry** | Pseudonymous (scrubbed) | App diagnostics | Diagnostics > Crash Data, Performance Data | App info and performance > Crash logs, Diagnostics | `send_default_pii = false` (`sentry.rb:310`). `CoppaSentryScrub` fully drops user/IP/body/cookies/traces for COPPA-pending children (`sentry.rb:11-264`). No frontend Sentry SDK in `package.json`, so crash reporting is server-side only today. |
| **Payment / subscription info** | Stripe checkout; `lib/purchasing.rb` (Stripe gem) | Card data held by **Stripe** (not in our DB); subscription state in Postgres | **Stripe** | Yes | App functionality (subscriptions) | Purchases > Purchase History; Financial Info (Stripe-held) | Financial info > Payment info, Purchase history | Purchases are made by adults/orgs, not child accounts. No card PAN stored locally. No Stripe.js in frontend `package.json`. **v1 native decision (2026-06-30): B2B invoicing only, NO in-app purchases declared; individual subs deferred to v1.1** (see IAP-DECISION-BRIEF.md). Section 4 item 3 resolved. |
| **AI request audit metadata** | `AiApiLog` rows on each AI call (`app/models/ai_api_log.rb:74-130`) | Postgres | None (internal audit); daily digest to n8n (redacted) | Yes (user_global_id) | Compliance/audit | Usage Data | App activity | Stores only summaries (PII-scrubbed on assignment, `ai_api_log.rb:20-42`), token counts, hashes, IP (90-day redaction). No raw prompts/responses. |

---

## 2. Third-party / SDK inventory (declare these on the forms)

Derived from `Gemfile`, `app/frontend/package.json`, and config.

**Backend services / SDKs (Gemfile):**
- **AWS SDKs** -- `aws-sdk-s3`, `aws-sdk-ses`, `aws-sdk-sns`, `aws-sdk-elastictranscoder`, `aws-sdk-cloudfront`, `aws-sdk-rails`. Roles: S3 storage (boards, images, audio, video, log extra_data), SES email, SNS SMS/notifications, Elastic Transcoder media, CloudFront CDN. Data egress: account PII (email render), user content (images/audio/video), usage logs.
- **Sentry** -- `sentry-ruby`, `sentry-rails`. Crash/error + performance. **This is the only crash/error reporter.** Bugsnag and New Relic are **not present** (confirmed: no matches in `Gemfile.lock`; Bugsnag was replaced by Sentry per PR #225, `sentry.rb:8-10`). `send_default_pii=false`, COPPA scrub active.
- **Stripe** -- `stripe` gem, `lib/purchasing.rb`. Payment processor; card data is Stripe-held.
- **Anthropic** -- `anthropic` gem (Claude). AI board generation (opt-in, scrubbed). See Section 3.
- **OpenAI client** -- `ruby-openai`, used for the **Gemini** OpenAI-compatible endpoint (`ai_board_generator.rb:13`, `GEMINI_MODEL`). Google is the actual processor.
- **Google** -- `googleauth`; runtime use of Google APIs (Places, Translate, Maps, TTS per project config) for symbol/translation/TTS features; iplocate.io for IP geo (external_tracker).
- **HubSpot** -- via `lib/external_tracker.rb` (HTTP). Marketing CRM; **gated to supporter/marketing registrants**, not student/communicator accounts (gate caveat in Section 4).
- **Geokit** -- `geokit` gem, geo math (no third-party egress by itself).

**Frontend (`app/frontend/package.json`):**
- **recordrtc** -- microphone/camera capture for recordings.
- **chart.js / chartjs-chart-sankey / wordcloud** -- local rendering, no egress.
- **puppeteer** -- devDependency (test only), not shipped.
- **No analytics SDK, no Stripe.js, no Sentry JS, no Firebase/Segment/Mixpanel/Amplitude/Google Analytics** in the manifest. All `package.json` entries are under `devDependencies`; runtime DOM/native bridges come through Cordova plugins (camera `CanvasCamera`, clipboard, file, permissions, printer, launcher) referenced in `capabilities.js`.

**Native (Cordova/Capacitor) permission-bearing bridges (from `capabilities.js`):**
- Camera (`CanvasCamera`, lines 519, 585) -- photo capture for buttons.
- Microphone (`record_audio`, line 755; `getUserMedia` in `eval_access_detect.js:73`).
- Geolocation (line 763; `_stashes.js`).
- Clipboard (lines 1167, 1234).
- File storage (Cordova file plugin).
- Installed-apps list (Android, line 676) and app launcher.

---

## 3. AI-API egress + PiiScrubber posture

**What reaches an external AI model:** Only the **AI board-generation prompt** path (`lib/ai_board_generator.rb`). Providers: **Anthropic Claude** (default `claude-haiku-4-5`) or **Google Gemini** (`gemini-2.5-flash`) fallback. The payload is a vocabulary-generation prompt (topic context + grid size + locale), **not** utterances, not log sessions, not raw board exports.

**Gating in front of the call (all three must pass):**
1. **Org AI opt-out** -- `FeatureFlags.ai_feature_enabled_for?('ai_board_generation', user)` must be true (`ai_board_generator.rb:31-36`). FERPA/HIPAA orgs can disable AI entirely.
2. **COPPA hard-gate** -- `FeatureFlags.coppa_blocks_ai_for?(user)` blocks any under-13 account awaiting parental consent (`ai_board_generator.rb:39-44`).
3. **PiiScrubber.redact_for_ai** on the prompt (`ai_board_generator.rb:55-58`), plus a per-user **blocklist** seeded with the user's own `user_name` and `full_name` (`ai_board_generator.rb:48-53`).

**Scrubber coverage (`lib/pii_scrubber.rb`):** identity **keys** redacted wholesale (name/email/phone/SSN/IP/global_id/device_id, lines 26-66); pattern redaction for email/phone/SSN/IP/global_id in free text (lines 507-518); blocklist-name redaction; `anonymize_board` maps person-name buttons to `[PERSON_n]` and strips personal `image_id`/keys (lines 88-127, 455-480). `AiApiLog` re-scrubs both request and **response** summaries on assignment so raw model output cannot be persisted (`ai_api_log.rb:20-42`).

**Plain statement:** In the current codebase, **identifiable child/student communication content cannot reach an external model through a supported path.** Utterances and log sessions are never sent. The only egress is a vocabulary prompt that is (a) blocked for consent-pending minors, (b) blocked for AI-opted-out orgs, and (c) passed through key-, pattern-, and blocklist-based redaction. **Residual risk** is heuristic-scrubber-shaped: free-text prompt context a supervisor types could contain a name not on the blocklist and not matching a pattern (e.g. an uncommon first name with no separators). This is a known limitation of regex/blocklist scrubbing, mitigated but not eliminated. BAA/ZDR posture with Anthropic/Google is a contract question, not a code question (see Section 4).

---

## 4. Open questions / gaps the forms will surface

1. **Retention/deletion path for several data types is incomplete (Flusher gaps).** `lib/flusher.rb` user deletion has historically missed models (License, UserVideo, UserExtra, AiApiLog, ContactMessage, LogSnapshot, HubSpot cleanup per audit memory). Both stores ask "can users request deletion?" -- confirm every data-bearing model above is reachable by deletion before answering "yes" unconditionally. **Action:** re-verify Flusher completeness against the current model list, especially `UserVideo`/`ButtonSound` (S3 audio/video) and `LogSession` extra_data on S3.

2. **Geo-logging default for child/student orgs.** Precise location is collected by default and only stripped when `effective_data_policy['geo_logging_allowed'] == false` (`log_session.rb:65-72`). The forms (and FERPA/COPPA) favor location **off by default** for minors. **Action:** confirm the default data policy for school/under-13 orgs disables geo, or the Nutrition Label must declare precise location as collected for those users.

3. ~~**Native purchase surface vs. store policy.**~~ **RESOLVED 2026-06-30.** Decision: v1 native builds declare **NO in-app purchases** -- B2B invoicing only, no StoreKit / Play Billing / Stripe.js surface in-app. Individual self-serve subscriptions are deferred to a v1.1 fast-follow. The three privacy forms declare **no "Purchases"** data type for v1. When v1.1 adds subscriptions, re-open this row and add the Purchases declaration + StoreKit/Play Billing. See IAP-DECISION-BRIEF.md.

4. **Android installed-apps list.** `capabilities.apps.all` reads the installed-app list (`capabilities.js:676-687`). Google Play treats app inventory as sensitive and restricts `QUERY_ALL_PACKAGES`. **Action:** confirm whether the shipped Android build actually invokes this (AAC app-launch feature) and, if so, justify the permission in the Play declaration; it is not transmitted off-device per code.

5. **HubSpot marketing gate is exclude-by-blocklist, not allowlist.** `supporter_registration?` excludes known student/communicator types over a free-form `registration_type`; a self-registered user mislabeling their type could slip the gate and have email/IP/city sent to HubSpot (issue #383). **Action:** confirm none of the data sent to HubSpot can ever be a minor's before declaring HubSpot egress as adult-only on the forms.

6. **Crash reporting is server-side only today.** No frontend Sentry SDK is in `package.json`. If native builds add a client crash SDK (Sentry/Crashlytics) later, the Nutrition Label / Data Safety crash-data declarations and the `xcprivacy` required-reason API list must be updated, and `CoppaSentryScrub`-equivalent child scrubbing must be re-implemented client-side. **Action:** keep this row "server-side only" until a client SDK is deliberately added.

7. **`xcprivacy` required-reason APIs.** This map covers data flows but not the iOS required-reason API list (e.g. `UserDefaults`, file-timestamp, system-boot-time, disk-space APIs) that Cordova/Capacitor plugins pull in. **Action:** generate the required-reason declarations from the actual native plugin set (file, device, network) when assembling `PrivacyInfo.xcprivacy`; this code-read does not enumerate them.

8. **Email index uses MD5 (`email_hash`).** Not a store-form blocker, but a security weakness noted for completeness; the user-facing `anonymized_identifier` correctly uses per-user HMAC.

---

## Cross-references
- Team-facing narrative companion: [`privacy-data-flow-map.md`](./privacy-data-flow-map.md) (context only; this file is authoritative)
- Scrubber + AI gate: `lib/pii_scrubber.rb`, `lib/ai_board_generator.rb`, `app/models/ai_api_log.rb`
- Logging/location: `app/models/log_session.rb`, `app/frontend/app/utils/_stashes.js`
- Sentry child-scrub: `config/initializers/sentry.rb`
- Media/storage: `lib/uploader.rb`, `lib/transcoder.rb`
- Retention schedule: `lib/tasks/scheduler.rake:140-159`
- Native bridges/permissions: `app/frontend/app/utils/capabilities.js`
