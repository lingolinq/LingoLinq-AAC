# Draft Minimum-Necessary Privacy, Data Retention, and AI Use Policy: Counsel Review Memorandum

> # DRAFT FOR COUNSEL REVIEW, NOT LEGAL ADVICE
>
> Prepared by LingoLinq staff and repository verification tooling for review by outside counsel.
> This is not legal advice, it is not an attestation, and it reaches no compliance conclusion.
> It carries **no attestation of its own** and **supersedes nothing**. Every attested compliance
> record referenced below remains frozen and unchanged. Where this memorandum disagrees with an
> existing record, the disagreement is recorded here as an open question, not applied to that
> record.

**Prepared:** 2026-08-30
**Prepared for:** Outside privacy and education-technology counsel
**Prepared by:** Scot Wahlquist, CEO
**Repository state verified at:** `origin/staging` commit `8afabd1d2cc37fd88013eb738143758096f52c50`
**Register status:** unattested `draft` row in `audit-reports/DOCUMENT-REGISTER.json`
**Review cycle:** on receipt of counsel's response

---

## 0. How to read this memorandum

Every substantive statement is placed in one of three categories, and the category is stated on
its face.

| Marker | Meaning |
|---|---|
| **IMPLEMENTED** | A behavior that exists in the code at the commit above, cited as `path:line`. A statement in this category is about software, not about legal sufficiency. |
| **PROPOSED** | A policy direction under consideration. Not adopted, not built, not represented to any customer. |
| **QUESTION** | A matter put to counsel. We have deliberately not answered it internally. |

Two rules govern the whole document.

1. **No compliance conclusions.** This memorandum does not say LingoLinq "is HIPAA compliant,"
   "is FERPA compliant," or "is COPPA compliant." Those are legal conclusions about a whole
   organization against a whole framework, they turn on facts outside the code, and they are
   counsel's to reach. What is described here are specific controls and specific gaps.
2. **Absence of code is reported as absence.** Where a control is described in an existing
   internal document but was not found in the repository, this memorandum says so and names what
   was searched. That is a finding about our documentation. It is not a claim that an underlying
   obligation was breached.

---

## 1. Executive summary

LingoLinq is an augmentative and alternative communication (AAC) application. Its users are
people who cannot rely on speech, many of them children with disabilities. Its buyers are US
school districts, US hospitals and clinics, and a small number of European customers. The
product stores the words its users say, which is the most sensitive category of content an
application of this kind can hold.

We are asking counsel to help us settle three things: **our regulatory scope** (which framework
binds us, in which customer configuration, and what changes it), **our retention rules** (we
propose to replace long default windows with short purpose-tied ones), and **our AI-use rules**
(what we must disclose and on what basis we may send user-derived content to a model).

### 1.1 The three findings that prompted this memorandum

**First, two long retention windows rest on legal premises that do not survive a reading of the
text.** A six-year "HIPAA floor" has been applied to AI request logs, citing 45 CFR
164.316(b)(2)(i). That provision applies its six-year period to *documentation required by the
Security Rule*, meaning policies, procedures, and records of actions the rule requires to be
documented. It is not a retention rule for protected health information, for medical records, or
for application logs. Separately, a five-year EU retention window has been attributed to
"EU AI Act Article 50 record-keeping." Article 50 is the AI Act's transparency provision and
contains no record-keeping obligation of any kind.

This is not academic. Our own scheduler states that the ratified general 24-month and children's
12-month purge tiers were deliberately **not built** because a shorter purge "would destroy HIPAA
audit-floor rows early" (`lib/tasks/scheduler.rake:174-181`). If that floor does not reach these
rows, the stated reason for not shipping the shorter tiers falls away, and the amended COPPA
Rule's prohibition on indefinite retention becomes the governing consideration instead.

**Second, our retention documentation describes controls we could not find in the code, and in
one case describes the opposite of what the code does.** Section 4 sets out nine such deltas.
The most serious is that `docs/legal/DATA_RETENTION.md:37` states PaperTrail change history is
retained six years via a scheduled cold-storage archival job; no such job exists, and a scheduled
job deletes those same records after one week, one month, and six months respectively.

**Third, the product's own user-facing privacy notice states that no user content is currently
sent to an AI vendor.** The notice says: *"Today none of these features send any user content to
an AI vendor, because the Bedrock path is inactive"*
(`app/frontend/app/templates/privacy.hbs:67`). There is no "inactive" switch in the code, and our
document register records 63 successful production Bedrock calls. Whether the path is quiet
*today* cannot be established from source; what can be established is that the sentence asserts a
state the code does not guarantee. We treat this as the single most urgent item in this
memorandum and it is question 21.

### 1.2 The one item with a date attached

Everything else in this memorandum is a question of posture. One item is a deadline. EU AI Act
Article 50 has applied since 2 August 2026 and was left untouched by the Digital Omnibus
amendments described in section 11. Generative systems already on the market before that date
appear to have until **2 December 2026** to retrofit the Article 50(2) machine-readable marking of
AI-generated content. Our marking is minted on the generation response but is **not persisted onto
saved, exported, or shared boards**, and the code comment at
`app/controllers/api/boards_controller.rb:635-641` says so in terms. If that grace period reaches
us, we have roughly three months. Question 16 asks counsel to confirm.

---

## 2. Scope, method, and limits

**What was examined.** The LingoLinq-AAC repository at `origin/staging` commit `8afabd1d2`, the
findings register (`audit-reports/FINDINGS.json`), the document register
(`audit-reports/DOCUMENT-REGISTER.json`), and the current text of the authorities in section 15.

**How.** Every IMPLEMENTED statement was read in source at that commit and is cited as
`path:line`. Regulatory text was retrieved on 2026-08-30 from the sources named in section 15.

**What could not be verified.** This memorandum is written from source and configuration. It
does not and cannot establish what data exists in the production database today, whether a
scheduled job ran or what it deleted, the current value of any feature flag in production
(production flags can be overridden by a database `Setting` row that takes precedence over the
code constant), whether a given environment variable is set in production, or anything about our
customers' own configurations. Statements that depend on production state are marked and not
asserted.

**Findings register.** At the audited commit the register showed 0 open Critical and 17 open High
findings. A CEO triage dated 2026-08-29 dispositions nine of those and, if merged, moves the
headline to 0 Critical and 9 open High. That triage sat on an unmerged branch at the time of
writing. Section 13 reflects the post-triage picture and says so per row.

---

# PART A: CURRENT IMPLEMENTATION

*This part describes software. It reaches no legal conclusion about any of it.*

## 3. What personal data the system holds

**IMPLEMENTED.** Two architectural facts frame everything else.

**The schema is deliberately thin on plaintext identifiers.** Roughly 45 models encrypt their
principal data column through the `secure_serialize` concern. The `users` table itself carries
almost no plaintext personal data: the email address is stored only as a keyed SHA-512
`email_hash`, and the rest of the profile lives in an AES-256-CBC encrypted `settings` blob
(`db/schema.rb`, `users`; `app/models/concerns/secure_serialize.rb`). **No full date of birth is
ever collected**; the system stores birth month and birth year only. Logging and geo-logging are
**off by default** (`app/models/user.rb:1797-1798`).

**The exceptions are the newer tables.** Three stores hold user-linked personal data in
plaintext:

- `ai_api_logs` holds `request_summary`, `response_summary`, `ip_address`, `user_global_id`, and
  `organization_global_id` as plaintext columns, regex-scrubbed but not encrypted
  (`db/schema.rb`, `ai_api_logs`).
- `prediction_entries` holds per-user AAC vocabulary as plaintext, indexed `prefix` and
  `next_word` columns (`db/schema.rb`, `prediction_entries`).
- `audit_events` encrypts its `data` payload but keeps `user_key` and a 4096-character `summary`
  in plaintext (`db/schema.rb`, `audit_events`).

**QUESTION raised early, because it colors everything below.** An AAC user's utterance log is a
verbatim record of everything that person has said through the device, including statements about
their health, their body, their needs, and their relationships. Our documents currently assume
FERPA, HIPAA, GDPR, and COPPA all apply to all of it at once. That is conservative but not
operable, because the four frameworks prescribe different retention behavior. Question 1 asks
counsel to classify this material.

## 4. What actually deletes data today

**IMPLEMENTED.** Sixteen retention or deletion mechanisms were found and read in source. The
significant ones:

| Mechanism | What it deletes | Window | Scheduled | Evidence |
|---|---|---|---|---|
| `DataPolicyEnforcer.enforce_retention!` | `LogSession` rows of type `session`, `note`, `assessment`, `eval`, `journal`, plus S3 payloads and versions | Org-configured; **no default** | Daily | `lib/data_policy_enforcer.rb:20-41`; `lib/tasks/scheduler.rake:136-140` |
| `AiApiLog.redact_old_ip_addresses!` | Sets `ip_address` to `[REDACTED]` (redaction, not deletion) | 90 days | Daily | `app/models/ai_api_log.rb:225-229` |
| `AiApiLog.purge_old_eu_logs!` | Rows stamped `jurisdiction = 'EU'` | 5 years | Daily | `app/models/ai_api_log.rb:243-247` |
| `User.flush_old_versions` | PaperTrail change history, above a 300-row threshold | LogSession 1 week, User 1 month, Board 6 months | Daily | `app/models/user.rb:4327-4338`; `lib/tasks/scheduler.rake:127-134` |
| Account hard delete | User, logs, boards, devices, media, AI logs, versions, with S3 cascade | 36-hour grace after confirmed request | Daily sweep | `lib/flusher.rb:317-323, 363-434`; `app/controllers/api/users_controller.rb:466-481` |
| Inactivity deletion | Schedules account deletion after three warnings | **12 months** | Daily | `app/models/concerns/subscription.rb:1176-1245` |
| COPPA export-then-delete | Exports the account, then schedules hard delete | 90-day lookback | Daily | `app/models/user.rb:810-895` |
| `DeletedBoard` purge | Board plus images and sounds | 300 days | Daily | `app/models/deleted_board.rb:63-73` |

Five observations follow. Each is a statement about code.

### 4.1 There is no default retention window for communication logs

`DataPolicyEnforcer.enforce_retention!` iterates only organizations where
`data_policy_version > 0`, then skips any organization whose `retention_months` is absent or zero
(`lib/data_policy_enforcer.rb:22-26`). `Organization#effective_data_policy` supplies no default;
it returns what was explicitly set, inheriting only a *more restrictive* parent value where one
exists (`app/models/organization.rb:105-123`).

The consequence: an organization that never configures a policy has no retention window, and an
account with no sponsoring organization is never reached by this job under any configuration.
There is also **no per-user retention path**; `User` delegates to its organization and returns an
empty policy when there is none (`app/models/user.rb:3204-3208`).

`docs/legal/DATA_RETENTION.md:29` states a "3 years default, configurable per user or
organization." **Neither the default nor the per-user path was found.**

### 4.2 The change-history claim is inverted

`docs/legal/DATA_RETENTION.md:37` states PaperTrail change history is retained for "6 years" via a
"scheduled archival job" migrating older versions "to cold storage," attributed to HIPAA.

**No archival job exists.** What exists is `User.flush_old_versions`, which deletes LogSession
versions older than one week, User versions older than one month, and Board versions older than
six months, whenever more than 300 such rows are present (`app/models/user.rb:4327-4338`). It is
scheduled daily (`lib/tasks/scheduler.rake:127-134`). A separate unscheduled task,
`db:prune_versions`, would delete all versions older than 30 days
(`lib/tasks/db_maintenance.rake:1-7`).

This is worth stating plainly: if a six-year audit-history obligation did bind these records, the
code would be defeating it at one-week granularity. We do not believe it binds them, for the
reasons in Part C, but the contradiction should be resolved either way.

### 4.3 Four documented retention controls do not exist, and three exist with no caller

Verified by grep at the audited commit:

| Documented control | Status |
|---|---|
| `ClusterLocation` 90-day trim via a "nightly job" (`DATA_RETENTION.md:40`) | **Not found.** `app/models/cluster_location.rb` defines no purge method. Geolocation and IP cluster records persist for the life of the account. |
| Children's "automatic purge at age 18 or after 2 years of inactivity" via an "age-threshold sweeper" (`DATA_RETENTION.md:50`) | **Not found.** No age-threshold code exists. The only inactivity path is the generic 12-month one. |
| `LogSnapshot` "cascading delete with LogSession" (`DATA_RETENTION.md:30`) | **Not found.** `LogSnapshot` associates to `user`, not to `LogSession`; it survives a log purge and is removed only on full account erasure. |
| `AuditEvent` retention | **Not found**, and undocumented. The table grows indefinitely. |
| "Raw events 2 years" (`DATA_RETENTION.md:38`) | `TelemetryEvent.flush` exists at a 6-month window and **has no caller**. |
| `ApiCall` request-row purge | Code exists at a 2-month window and **has no caller**, while `ApiCall.log` runs on every request (`app/controllers/application_controller.rb:84`). The table grows unbounded. |
| Account inactivity "2 years" (`DATA_RETENTION.md:28`) | Code implements **12 months**. |

### 4.4 The EU five-year purge is wired, correct, and deletes nothing

`AiApiLog.purge_old_eu_logs!` deletes rows where `jurisdiction = 'EU'` and
`created_at < 5.years.ago` (`app/models/ai_api_log.rb:243-247`), verified end to end by
`spec/models/ai_api_log_spec.rb:550-586`. It matches no production rows for two independent
reasons: the `jurisdiction` column was created 2026-06-21, so no stamped row can be five years
old before 2031, and the stamp is written only where the resolver confirms an EU user, which as
of the last audited read was true of no production account.

This is a working control with no eligible data, not a broken control. Whether the five-year
window has any legal basis is a separate matter, addressed at section 10. The in-repo comment at
`lib/tasks/scheduler.rake:147-186` describes this accurately; `DATA_RETENTION.md:33`, which still
says "enforced" and "now functional," does not.

### 4.5 Deletion on request is real; portable export is not self-service

A user with `delete` permission can request account deletion, which sets `schedule_deletion_at`
36 hours out (`app/controllers/api/users_controller.rb:466-481`); a scheduled sweep then runs
`Flusher.flush_user_completely` (`lib/flusher.rb:317-323`), which cascades to S3. A logs-only
flush is separately available and requires the caller to echo both the username and the global id
(`app/controllers/api/users_controller.rb:453-463`). Both write `AuditEvent` records.

Export is narrower. A **logs-only** export exists at `GET /api/v1/logs/obl`, supervisor-
permissioned (`app/controllers/api/logs_controller.rb:332-362`). A full-account export routine
exists (`lib/exporter.rb:72-97`) but its **only caller is the COPPA offboarding worker**
(`app/models/user.rb:826`). There is no product path by which a user, parent, or district can
obtain a complete portable copy of an account.

One erasure residual remains open: `PredictionEntry` rows survive account deletion, retaining
per-user AAC vocabulary (`LL-e8614c103f`). A second, off-board voice recordings and video records
surviving deletion (`LL-854b1d3853`), is recorded as fixed and deployed in the 2026-08-29 triage.

## 5. What the AI path actually does

### 5.1 The Bedrock path, and the gating around it

**IMPLEMENTED.** Four features call a model with user-derived content: word prediction, board
generation, focus-word generation, and evaluation narration. All route through Amazon Bedrock
rather than a model vendor's own API, which makes AWS the receiving processor and the AWS
Business Associate Agreement the operative instrument for that leg (`lib/ai_client.rb`).

The gating on word prediction is representative (`lib/ai_word_predictor.rb:60-113`):

1. Returns empty if no API configuration resolves.
2. Returns empty if the organization opted out, the per-user AI preference is off, or the feature
   flag is not enabled for this user (`FeatureFlags.ai_feature_enabled_for?`,
   `lib/feature_flags.rb:242-250`).
3. Returns empty if the user is under 13 and parental consent is pending, revoked, or declined.
   On by default; disabled only by an environment variable (`lib/feature_flags.rb:277-284`).
4. Returns empty if the user is an EU resident under 16 without active parental consent for AI
   (`lib/feature_flags.rb:292-298`).
5. Loads the user's own name into a redaction blocklist and passes the utterance and any
   client-supplied topic through `PiiScrubber.redact_for_ai` **before** the prediction cache key
   is computed, so unredacted text never becomes a cache key (`lib/ai_word_predictor.rb:74-101`).
6. Verifies the Bedrock credential belongs to the BAA-covered AWS account before egress
   (`AiClient.available?`, `lib/ai_word_predictor.rb:112`).

**This is a substantially stronger control set than our older documents describe, and we record
that affirmatively.** Four limits matter:

- The COPPA and EU gates both return `false` when `user` is `nil` (`lib/feature_flags.rb:280,
  291`). A call site that does not pass the subject user **passes the gates by default rather
  than failing closed**.
- Evaluation narration checks the feature flag against the **speech-language pathologist**, not
  the student, and the **student's own AI preference is not checked**, though the student's org,
  COPPA, and EU gates are (`lib/eval_narrator.rb:113-119, 146-153`). The payload includes
  `slp_notes`, free clinical prose.
- `PiiScrubber` is a redaction safeguard, not a legal de-identification method. It performs
  neither HIPAA Safe Harbor nor Expert Determination, and scrubbed output still linked to a
  `user_global_id` remains linked to an identified person. Our vocabulary should be "scrubbed" or
  "pseudonymised," never "de-identified." The product's privacy page already gets this right.
- Focus-word generation persists the supporter's prompt into a table that is not tenant-scoped
  (`app/models/ai_focus_word_set.rb:42-48`).

**On logging.** `ai_api_logs` stores `request_summary` and `response_summary` as plaintext free
text alongside `user_global_id` (`db/schema.rb`). The summaries are not redacted on any schedule,
and section 4 establishes that for non-EU rows they persist until account deletion. Evaluation
narration writes the **full, untruncated clinical narrative** into `response_summary`
(`lib/eval_narrator.rb:219`); nothing truncates it at write time.

A correction to a control we have described elsewhere: the 90-day IP redaction job operates on a
column **the AI call sites never populate**. `AiApiLog.log_ai_call` accepts an `ip_address`
parameter (`app/models/ai_api_log.rb:91`), but none of the four in-app call sites passes one. The
redaction is real and scheduled; it currently has nothing to redact. The same is true of
`organization_global_id`.

**On consent, an orphaned control.** A versioned verifiable-consent mechanism exists in full:
`ai_consent_granted?`, `grant_ai_consent!`, `revoke_ai_consent!`, versioned disclosures, and
`AuditEvent` records on grant and revoke. A grep of `app/` and `lib/` finds **no runtime caller
for the grant, revoke, or query methods** outside `app/models/user.rb` itself. One piece of the
mechanism does run: `lib/lingo_linq/ai_consent_disclosures.rb` is a live runtime dependency, not
a comments file. `AiConsent::DisclosuresController` calls its `known_version?` and `metadata`
methods (`app/controllers/ai_consent/disclosures_controller.rb:25,29`) to serve the versioned
disclosure text at `GET /ai_consent/disclosures/:version` (`config/routes.rb:48`), a page that is
unauthenticated by design so a parent can read it before logging in, and that the privacy page
links to (`privacy.hbs:76`). So the disclosure half of the mechanism is published and readable;
what is written by nothing and read by nothing at runtime is the consent **record**: nothing
outside `user.rb` ever grants, revokes, or checks it. The gates that actually run are the org
switch, the COPPA block, the EU under-16 block, and the per-user preference described above.
Question 19 asks what this means for the consent basis we have been describing.

**On disclosure.** Article 50(1) disclosure is built and enabled in production through a database
feature-flag override. A recent fix resolves the disclosure gate's subject from the authenticated
session user rather than from application state (PR #885, in commit `8afabd1d2`). Article 50(2)
content marking is minted for the transient generation response and for persisted focus-word
sets, but was **not found** for saved, exported, or shared boards. The code says so itself: the
comment at `app/controllers/api/boards_controller.rb:635-641` records that durable persistence of
the marker onto `board.settings` at save time, and its propagation through `copy_for`, "are NOT
yet implemented," so "saved/exported/shared boards are not yet marked."

**This carries a dated deadline.** Article 50 has applied since 2 August 2026, and the Digital
Omnibus did not amend it. Generative systems already on the market before that date received a
narrow grace period specifically for retrofitting the Article 50(2) machine-readable marking,
running to **2 December 2026**. If LingoLinq's board generation was on the market before 2 August
2026, that is approximately three months from this memorandum. Question 16 asks counsel to confirm
whether the grace period reaches us and what "on the market" means for a feature behind a flag.

### 5.2 International transfer of EU and UK personal data to Bedrock

**IMPLEMENTED, and a correction to how we have been describing this.** We have described the AI
path as going to "Bedrock in us-west-2." That is not accurate. `lib/ai_client.rb` invokes the
inference profile `us.anthropic.claude-haiku-4-5-20251001-v1:0`, which is a **US geo
cross-region profile**, not a single region. Called from us-west-2 it may route to us-east-1,
us-east-2, or us-west-2, and AWS's documentation states that with a cross-region profile "your
input prompts and output results may be stored in the opt-in Regions for abuse detection
purposes." Any transfer description must name the geo profile and its destination set, not one
region.

**The governing instruments, read from the documents themselves.**

| Element | What applies | Source |
|---|---|---|
| Governing DPA | The **AWS Data Processing Addendum**, which supplements the AWS Customer Agreement and applies automatically. No separate signature. AWS acts as processor to us; we may act as controller or processor (DPA 1.1) | `AWS_GDPR_DPA.pdf` |
| EU mechanism, main case | **SCCs, Module Three (processor to processor)**. DPA 12.2.2: "When Customer is acting as a processor, the Processor-to-Processor Clauses will apply to a Data Transfer" | DPA 12.2.2, definitions |
| EU mechanism, secondary case | **SCCs, Module Two (controller to processor)**, for any slice where we act as controller rather than processor | DPA 12.2.1 |
| SCC instrument | Commission Implementing Decision (EU) 2021/914 of 4 June 2021, incorporated by reference; "Nothing in this document varies or modifies the Standard Contractual Clauses" | DPA 16, definitions |
| UK mechanism | The same Module Two or Module Three clauses **as amended by the International Data Transfer Addendum**, the ICO template laid before Parliament under s.119A Data Protection Act 2018 on **2 February 2022**. Governed by the laws of England and Wales | `UK_GDPR_Addendum_to_AWS_data_processing_addendum.pdf`, Annex A |
| Adequacy / DPF | AWS is a covered entity under the **Amazon.com, Inc.** EU-US Data Privacy Framework certification, which is active, with the UK Extension and Swiss-US DPF. **But the AWS DPA does not mention the DPF and does not rely on it**; it defaults to SCCs, and 12.3 displaces them only if AWS adopts Binding Corporate Rules or "an alternative recognised compliance standard" | AWS DPF page; DPA 12.3 |
| Government access | AWS will attempt to redirect a governmental demand to us, and will give reasonable notice unless legally prohibited | DPA 3 |
| Sub-processors | Listed at `aws.amazon.com/compliance/sub-processors/`; 30 days' notice; objection remedies include **moving the data to another Region** | DPA 6.1 |

**A flow-down obligation we currently owe and may not be meeting.** DPA 12.2.2 continues: because
AWS has no relationship with our controllers, "**Customer will fulfil AWS's obligations to
Customer's controllers under the Processor-to-Processor Clauses**." Under Module Three we are the
data exporter, and AWS's obligations toward the school or hospital run through us. Our customer
DPAs need to carry that. Question 27 asks counsel to check them.

**An available supplementary measure, correctly scoped.** AWS publishes an **EU geo inference
profile for the exact model we run**: `eu.anthropic.claude-haiku-4-5-20251001-v1:0`. Called from
an EU source region it routes only to EU destination regions (Frankfurt, Stockholm, Milan, Spain,
Ireland, Paris), and AWS states that a geo-scoped profile's "destination Region list will never
change."

**What that would and would not achieve, stated precisely because an earlier draft of this
section overstated it.** Routing the Bedrock leg to EU regions would relocate **model inference**
into the EEA. It would **not** make LingoLinq's processing EU-resident and it would **not**
eliminate the international transfer, because the application itself is not in the EEA. Our Cloud
Run services, Cloud SQL database, and Redis instance all run in GCP `us-central1`
(`scripts/gcp/phase3-data-layer.sh:67`). EU and UK personal data is therefore already in the
United States before any Bedrock call is made. The Chapter V transfer that matters is the one
from the EU controller into our US-hosted application, and it is untouched by the choice of
Bedrock region.

The honest framing is that EU Bedrock routing removes **one onward transfer leg** and narrows the
surface a Transfer Impact Assessment has to cover. It is worth doing on those terms. It is not a
repatriation of the data, and we should not describe it to a customer as one. Any assessment of
whether the overall data path can be made EU-resident would have to take in hosting, database,
backups, logging, and error telemetry, not just inference. Question 29 asks counsel how to
prioritise that.

**Two blockers, both ours.** We cannot route by jurisdiction today, because
`EuJurisdiction.status` resolves to `:unknown` for essentially every production account (section
4.4), and region selection is a single environment-derived value in `lib/ai_client.rb` rather than
a per-request decision. Making EU inference routing real is a code change, listed as gap 20. The
larger question of EU-resident hosting is not scoped anywhere and is listed as gap 22.

### 5.3 The egress paths our AI documents do not cover

**IMPLEMENTED.** Our AI governance documents describe the Bedrock path. Four other paths carry
user content to third parties and are governed differently or not at all.

| Path | Destination | What is sent | Scrubbed | In `AiApiLog` | Gate | Evidence |
|---|---|---|---|---|---|---|
| **Google Speech-to-Text** | `speech.googleapis.com` | **Raw recorded human voice audio**, frequently a child's | No | No | Only the org `external_ai_processing` switch, which defaults to allow. No COPPA gate, no EU gate, no Article 50 disclosure, no user preference | `app/models/button_sound.rb:44-72` |
| Google Text-to-Speech | `texttospeech.googleapis.com` | Board button label and vocalization text | No | No | **None found** | `lib/tts.rb:47-57` |
| Google Cloud Translation | Google Translate API | Board words submitted for translation | No | No | **None found.** Explicitly not gated by `external_ai_processing` (`app/controllers/api/users_controller.rb:1148`) | `lib/word_data.rb:665-709` |
| OpenSymbols | `www.opensymbols.org` | User-typed symbol search query | No | No | **None found** | `lib/open_symbols.rb:42` |
| Sentry | `*.ingest.sentry.io` | Exception events plus approximately 5% of transactions, including user id, IP, headers, cookies, and request body. `send_default_pii=false`; user id is SHA-512 of the IP | Partial. Full drop **only** for COPPA-pending children | No | Production and staging only | `config/initializers/sentry.rb:5-40, 136-141` |

The Speech-to-Text path deserves emphasis. It sends a recording of a child's voice to a third
party. Under 16 CFR 312.2 a voice recording of a child is itself personal information. It is
gated by a different, coarser switch than every Bedrock path, and it produces no AI log record.

We also note two paths that our documents mention and that **do not exist**: no Bugsnag
integration and no New Relic integration are present in the Gemfile or in `config/`.

## 6. Access control, audit, and encryption

**IMPLEMENTED, favorable.** Access to a communicator's utterance history is genuinely layered.
A "modeling-only" supporter is structurally excluded from log data
(`app/models/user.rb:63-68, 83-84`). A communicator can set `private_logging`, a per-supervisor
`logging_cutoff`, and a `logging_code`, giving real granular control over who sees history and how
far back (`app/controllers/api/logs_controller.rb:36-45`). Console and `runner` access is
audited and **fail-closed in production**, and cannot be disabled by an environment variable
(`lib/audit/console_guard.rb`; `config/initializers/auditing.rb`). Marketing egress to HubSpot
and IP-geolocation is gated three ways and structurally excludes communicators, students, and
patients (`lib/external_tracker.rb:6-10, 85-105`). Where a license expires with no age
attestation, the system **defaults to treating the user as under 13**.

**IMPLEMENTED, gaps.** Three are material to a minimum-necessary policy:

- **No accounting of disclosure for ordinary reads.** A supervisor or organization manager who
  reads or exports a communicator's utterance log writes no audit record. Only four
  administrative and database-explorer read paths are audited. If an accounting-of-disclosures
  obligation applies to us, this is where it fails.
- **Tenant isolation has no database-level guarantee.** There is no `organization_id` column on
  `boards` or `log_sessions`. Isolation is a Ruby-evaluated permission graph over `user_links`,
  cached in Redis for 30 minutes (`app/models/concerns/permissions.rb:23-28`).
- **Uploaded board images and sounds are given a `public-read` S3 ACL** unless the upload is
  marked private or the `UPLOADS_S3_NO_ACL` environment variable is set
  (`lib/uploader.rb:482, 491`). Whether that variable is set in production is not knowable from
  source, and question 24 asks about it.

Two smaller items: `settings['old_emails']` retains every prior address indefinitely, and
`saved phrases` and `contacts` are exposed at the `model` permission level rather than
`supervise` (`lib/json_api/user.rb:36, 49, 67`), which we flag as a design question rather than a
defect.

---

# PART B: PROPOSED POLICY

*Nothing in this part is adopted, implemented, or represented to any customer.*

## 7. Proposed principles

**PROPOSED.** Five principles, in priority order.

1. **Collect the minimum necessary for a stated purpose, and state the purpose.** Every stored
   field should map to a purpose nameable in a privacy notice. Fields that cannot be mapped are
   removed rather than justified.
2. **Retain for the shortest period that serves the purpose, and delete on a schedule.** A
   retention window that exists only as a customer-configurable option is not a retention policy.
3. **Describe controls, not conformance.** No "HIPAA compliant" or "FERPA compliant" language in
   customer-facing material, in the product, or in internal records offered as evidence.
4. **Longer retention requires a named obligation whose citation reaches the specific records.**
   A framework being generally applicable to the company is not a reason to keep a table forever.
5. **External egress of user content is gated by consent and by subject age, and fails closed.**
   The Bedrock gates are the model; the work is making every other path match them.

## 8. Proposed retention schedule for user data

**PROPOSED.** A starting position for counsel to correct, not a decision.

| Record class | Proposed window | Trigger | Rationale relied on |
|---|---|---|---|
| Communication logs (`LogSession`) | 24 months default, customer-configurable shorter, not longer | Last activity | Purpose is therapy progress tracking and reporting, an annual to biennial cycle |
| Communication logs, accounts known to be under 13 | 12 months, rolling | Record creation | 16 CFR 312.10 bars indefinite retention and requires a stated deletion timeframe |
| Prediction history (`PredictionEntry`) | Life of account, deleted on account deletion | Account deletion | Purpose is personalisation of that user's own predictions only |
| `ai_api_logs` content fields (`request_summary`, `response_summary`) | 90 days | Row creation | These exist for debugging and abuse investigation, not for a record-keeping duty |
| `ai_api_logs` metadata fields | 24 months | Row creation | Retains the trail of *that a call happened* without retaining what was said |
| `ai_api_logs`, accounts known to be under 13 | 12 months | Row creation | Same COPPA basis |
| `cluster_locations` (geolocation, IP clusters) | 90 days | Record creation | Matches what the current documentation already claims; the job needs building |
| `api_calls`, `telemetry_events` | 90 days and 6 months respectively | Record creation | Purge code already exists at those windows; it needs a caller |
| `audit_events` | 6 years **only if** counsel confirms these are Security Rule documentation; otherwise 24 months | Record creation | Question 7 |
| PaperTrail change history | Current behavior, documented honestly | Existing thresholds | We propose correcting the document rather than building the archival job it describes, unless counsel identifies an obligation the current behavior defeats |

**PROPOSED, deliberately absent.** We propose to **remove** the five-year EU tier and the
six-year general floor rather than shorten them, because we have found no obligation requiring
either for these records. If counsel identifies one, we will reinstate it with the citation
attached to the specific table it reaches.

**PROPOSED, on overrides.** A customer with its own longer retention obligation should be able to
instruct us to hold longer under a documented instruction naming that obligation, recorded per
organization. It should not be the default.

## 9. Proposed AI and external-egress rules

**PROPOSED.**

1. **No user-derived content reaches any external processor without an active consent state for
   that subject.** Where the subject is under 13, that means verified parental consent. Where the
   subject is an EU resident under 16, parental consent for AI specifically. Both gates exist for
   Bedrock; the proposal is to (a) make them fail closed when the subject user is not resolvable
   and (b) extend them to Speech-to-Text, Text-to-Speech, Translation, and OpenSymbols.
   **Error telemetry is the awkward case and we are not hiding it.** Sentry currently receives
   user ids, IPs, headers, cookies, and request bodies for every user who is not a COPPA-pending
   child. A consent gate is the wrong instrument for crash reporting, so either this principle is
   narrowed to exclude operational telemetry on a separate lawful basis that counsel states, or
   the Sentry payload is minimised until it no longer carries user-derived content. We are not
   choosing between those here; question 25 asks.
2. **A child's voice recording is treated as the most sensitive class we hold**, and
   Speech-to-Text is gated at least as strictly as Bedrock.
3. **Scrubbing is a safeguard, never a legal characterisation.** "Scrubbed" or "pseudonymised" in
   all copy. "De-identified" and "anonymised" reserved for data meeting a named standard.
4. **Model content is not a record we keep.** Prompt and response summaries are retained for a
   short debugging window and then removed; the metadata row survives.
5. **Disclosure is unconditional.** Users are told they are interacting with an AI system
   regardless of jurisdiction. A jurisdiction resolver that returns "unknown" for essentially
   every account should not be what decides whether a person is told the truth.
6. **No student or patient content to any route lacking a BAA or an equivalent instrument.**
   We propose this as a written rule. We are **not** presenting it as settled current practice,
   because we cannot show it holds today: the Google paths are understood to sit under the Google
   Cloud data processing terms, but a repository-wide search finds **no OpenSymbols entry in any
   subprocessor register and no recorded DPA, BAA, or equivalent instrument**, while
   `lib/open_symbols.rb:42` sends a user-typed search query. Question 26 asks counsel what that
   route needs before the rule can honestly be described as practice.

### 9.1 Proposed statement on international transfers

**PROPOSED, subject to counsel's confirmation at questions 27 to 29.** We propose the document
state the following, and nothing broader:

> Where LingoLinq processes personal data subject to the EU GDPR or UK GDPR and that data is
> transferred to Amazon Web Services in the United States for model inference, the transfer is
> made under the **Standard Contractual Clauses adopted by Commission Implementing Decision (EU)
> 2021/914 of 4 June 2021**, incorporated by reference into the AWS Data Processing Addendum,
> which forms part of the AWS Customer Agreement.
>
> **Module Three (processor to processor)** applies where LingoLinq acts as a processor for a
> school, district, or healthcare customer, which is the ordinary case. **Module Two (controller
> to processor)** applies to the limited categories for which LingoLinq acts as controller.
> LingoLinq is the data exporter and AWS is the data importer.
>
> For personal data subject to the UK GDPR, the same clauses apply **as amended by the
> International Data Transfer Addendum** issued by the Information Commissioner under section
> 119A of the Data Protection Act 2018 on 2 February 2022, governed by the laws of England and
> Wales.
>
> LingoLinq does **not** rely on the EU-US Data Privacy Framework as its transfer mechanism for
> this path. AWS is a covered entity under an active Amazon.com, Inc. DPF certification, and
> LingoLinq treats that as supporting evidence in its transfer risk assessment rather than as the
> transfer basis, because the AWS Data Processing Addendum itself provides for the Standard
> Contractual Clauses.
>
> [**CONDITIONAL, DO NOT PUBLISH UNTIL TRUE.** The following sentence asserts a control that does
> not exist today. No Transfer Impact Assessment has been written (gap 21). It may be included
> only once one is completed and approved, and it is set out here so counsel can review the
> wording, not so it can be lifted into a customer-facing document in the meantime.]
>
> LingoLinq maintains a Transfer Impact Assessment for this transfer, reviewed at least annually
> and on any change of region, model, or subprocessor.

The bracketed caveat is deliberate. This memorandum's third principle is that we describe controls
rather than conformance, and section 4 catalogues seven places where our documents already assert
controls we do not have. A proposed statement that quietly repeated that error would undercut the
whole document.

**Why we propose naming SCCs rather than the DPF.** Two reasons. The AWS DPA is the contract we
actually have, and it provides for SCCs; it does not mention the DPF. And a DPF-based statement
would have to be re-examined every time the adequacy decision is challenged, whereas an
SCC-based statement with a live Transfer Impact Assessment survives that. This is a **proposed
position, not a legal conclusion**: AWS holds an active DPF certification and its DPA also carries
an alternative-mechanism clause at 12.3, so the choice between the two is counsel's to make and
cannot be settled mechanically from the documents. Question 28 asks.

**Supplementary measures we propose to state**, in descending order of actual effect: TLS in
transit and encryption at rest; `PiiScrubber` redaction before egress, described as
pseudonymisation and never as de-identification; Bedrock model-invocation logging disabled,
verified across three regions; no model-provider access to prompt content and no training on
inputs; and AWS's contractual commitment to redirect and to notice government demands. Routing EU
and UK inference to the EU geo profile belongs on this list once built, but as a measure that
removes one onward transfer leg, **not** as one that ends the transfer; see section 5.2. We
propose **not** to claim zero data retention, because AWS applies abuse-detection processing to
this model and the account retention setting resolves to the model default.

## 10. What we propose to stop saying

**IMPLEMENTED.** The Where column below records, per row, the verified instances at the audited
commit `8afabd1d2` and marks the user-facing ones **live**. Rows reached customers on three
surfaces: the privacy page (`app/frontend/app/templates/privacy.hbs`), the unauthenticated AI
data-sharing disclosure at `/ai_consent/disclosures/1` (rendered from the
`ai_consent_disclosures` block of `config/locales/en.yml` via
`app/views/ai_consent/disclosures/v1.html.erb`), and the unauthenticated Article 50 disclosure
at `/ai_consent/disclosures/art50_v1` (rendered from the separate `art50_disclosures` block via
`art50_v1.html.erb`). Correction status: PR #888, merged to `staging` as `558de5919` on
2026-08-30 (statements about that commit are verified there, not at the audited commit),
corrected `privacy.hbs:24,35,67,99-101` and the `retention_eu` / `retention_hipaa` keys of both
disclosure blocks. Still live and uncorrected at `558de5919`: `privacy.hbs:22` (blanket
framing), `privacy.hbs:76` (question 19), `privacy.hbs:98` and `en.yml:189` (IP redaction), and
`en.yml:185` ("each AI request").

**PROPOSED.** The treatment column.

| Statement | Where | Proposed treatment |
|---|---|---|
| "Today none of these features send any user content to an AI vendor, because the Bedrock path is inactive" | `app/frontend/app/templates/privacy.hbs:67` (**live, user-facing**) | Correct or remove. No inactive switch exists and production calls are recorded. See question 21. |
| The "Private Thoughts" guarantee: "we never log your private conversations"; "never logs, collects, or analyzes verbatim transcripts" | `privacy.hbs:24,35` (**live**) | Correct (done in PR #888). False at the audited commit: `lib/ai_word_predictor.rb:165` writes up to 200 characters of the composed sentence to `ai_api_logs` in plaintext (section 4). Its correction discloses a previously undisclosed collection; see question 32. |
| A separate, second AI data-sharing consent is asked for | `privacy.hbs:76` (**live**) | Resolve with question 19: wire the consent mechanism, or correct the representation. |
| IP addresses on AI records are redacted after 90 days, presented as in effect | `privacy.hbs:98` (**live**), `en.yml:189` (**live**, `/ai_consent/disclosures/1`) | Correct or build. No call site passes `ip_address` to `AiApiLog.log_ai_call`, so the scheduled redaction has nothing to redact (section 4). |
| Communication logs have a "3 years default" retention | `DATA_RETENTION.md:29` | Withdraw. No default exists. Replace once the proposed 24-month default is built. |
| Change history retained 6 years via cold-storage archival | `DATA_RETENTION.md:37` | Withdraw. The job does not exist; the code deletes those versions after weeks. |
| `ClusterLocation` 90-day nightly trim; children's age-18 sweeper; `LogSnapshot` cascade; "raw events 2 years"; 2-year inactivity | `DATA_RETENTION.md:28, 30, 38, 40, 50` | Withdraw or build. Section 4.3. |
| The EU five-year tier is required by "EU AI Act Article 50 record-keeping" | `DATA_RETENTION.md:33`, `AI_DATA_FLOW_CLASSIFICATION.md:231`, `scheduler.rake:147-152`; **live**: `privacy.hbs:99`, `en.yml:217` (`art50_disclosures`, `/ai_consent/disclosures/art50_v1`); the five-year window without the Article 50 attribution also at `en.yml:186` (`/ai_consent/disclosures/1`) | Withdraw the legal basis. Article 50 imposes no retention duty. |
| A "six-year HIPAA floor" applies to `ai_api_logs` | `ai_api_log.rb:230-238`, `scheduler.rake:150-151, 174-181`; **live**: `en.yml:218` (`art50_disclosures`, `/ai_consent/disclosures/art50_v1`) | Narrow. 164.316(b)(2)(i) reaches Security Rule documentation, not application logs. |
| "Every AI call is logged in `AiApiLog`" | Multiple; **live**: `en.yml:185` ("a summary of each AI request", `/ai_consent/disclosures/1`) | Narrow. False for the offline prediction generator and for all four Google paths. |
| Blanket framing that FERPA, HIPAA, GDPR, and COPPA apply to all data at all times | Multiple; **live**: `privacy.hbs:22` | Replace with a per-configuration scope statement counsel approves. |

---

# PART C: CORRECTIONS TO PRIOR INTERNAL RECORDS

*Recorded for counsel's review. Not applied to any attested record by this memorandum.*

## 11. The Article 50 retention theory is withdrawn

**Prior position.** Our records attribute a five-year retention rule for EU-jurisdiction AI logs
to "EU AI Act Article 50 record-keeping" (`docs/legal/DATA_RETENTION.md:33`;
`docs/legal/AI_DATA_FLOW_CLASSIFICATION.md:231`; `app/models/ai_api_log.rb:230-232`). A prior
successor record already flagged this attribution as inherited and unendorsed
(`docs/legal/2026-08-25_ai-data-flow-classification.md:21`) without correcting it.

**What Article 50 says.** Article 50 of Regulation (EU) 2024/1689 is the AI Act's transparency
article. Paragraph 1 requires providers to design systems intended to interact directly with
natural persons so those persons are informed they are interacting with an AI system. Paragraph 2
requires machine-readable marking of synthetic content. Paragraphs 3 and 4 impose disclosure
duties on deployers of emotion-recognition, biometric-categorisation, and deepfake systems.
Paragraph 5 fixes timing. **No paragraph imposes any record-keeping, logging, or retention
obligation.**

**Where the AI Act's log-retention duty actually sits.** Article 12 requires that a high-risk
system be technically capable of automatically recording events. Article 19 then requires
providers to keep those logs "to the extent such logs are under their control," for "a period
appropriate to the intended purpose ... of at least six months, unless provided otherwise in the
applicable Union or national law." Article 26(6) places a parallel six-month floor on deployers.
All three bind **high-risk** systems only. The duty is a six-month floor, not a five-year
duration, and it does not reach a system that is not high-risk.

**The timeline has moved, and it matters here.** The Digital Omnibus, Regulation (EU) 2026/1744,
entered into force on 27 July 2026. It deferred the stand-alone Annex III high-risk obligations
from 2 August 2026 to **2 December 2027**, and the Annex I product-embedded obligations to
2 August 2028. It did **not** amend Article 50, whose transparency duties took effect on schedule
on 2 August 2026, subject only to the 2 December 2026 marking grace period described in section
5.1. So the practical position today is that Article 50 binds us now, while any Article 19
obligation would not attach before December 2027 even on the assumption that we are high-risk,
which we do not assume. Question 14 asks counsel to test that assumption.

**Proposed conclusion.** The five-year figure has no basis in Article 50, and the only AI Act
retention provision that could apply is both shorter and conditioned on a high-risk
classification we have not established. We propose to withdraw the legal basis. Whether to keep
the mechanism is a separate question, put at question 13.

## 12. The six-year HIPAA floor is narrowed

**Prior position.** A six-year floor citing 45 CFR 164.316(b)(2) has been applied to
`ai_api_logs` on the reasoning that "these rows double as a HIPAA audit trail"
(`app/models/ai_api_log.rb:235-238`). That floor is the stated reason the ratified 24-month
general tier and 12-month children's tier were never implemented
(`lib/tasks/scheduler.rake:174-181`), and the reason an earlier ratified decision to adopt a flat
24-month window and drop the HIPAA citation was retired in July 2026.

**What the regulation says.** 45 CFR 164.316(b)(1) requires a covered entity or business
associate to maintain in written form the policies and procedures implemented to comply with the
Security Rule, and to maintain a written record of any action, activity, or assessment the
subpart requires to be documented. 164.316(b)(2)(i) then requires it to "[r]etain the
documentation required by paragraph (b)(1) of this section for 6 years from the date of its
creation or the date when it last was in effect, whichever is later." The Privacy Rule's
counterpart at 164.530(j)(2) is worded identically as to the material listed at 164.530(j)(1).

The six-year period therefore attaches to **the documentation of the compliance program**:
policies, procedures, designations, and records of the actions the rule requires to be
documented. It does not attach to protected health information, to medical records, or to an
application's operational logs. We were unable to locate any provision of 45 CFR Parts 160 or 164
imposing a retention period on medical or treatment records themselves. Retention of those
records is conventionally understood to be governed by state law, and we flag that as a matter
for counsel rather than asserting it.

**What we are not saying.** We are not saying no argument exists. 164.312(b) requires audit
controls and 164.308(a)(1)(ii)(D) requires regular review of information system activity, so it
can be argued that records generated to satisfy those become records of an action or activity
required to be documented under 164.316(b)(1)(ii). We think that argument, if it succeeds,
reaches our `audit_events` table rather than `ai_api_logs`, because `audit_events` records access
and administrative action while `ai_api_logs` records feature usage. We are not confident, and
questions 6 and 7 ask directly.

**Where the six-year citation is used correctly.** Our document register applies a "supersession
plus seven years" rule to policy versions and audit evidence, citing 164.530(j) as a floor it
exceeds (`audit-reports/DOCUMENT-REGISTER.json`, `meta.retentionSchedule`). That is precisely the
category the six-year rule was written for. We propose no change and question 11 asks for
confirmation.

## 13. Consequence for the unshipped tiers

If sections 11 and 12 are right, the general 24-month and children's 12-month tiers were blocked
by two obligations that do not reach these records. The amended COPPA Rule points the opposite
way. 16 CFR 312.10 provides that personal information collected online from a child "may not be
retained indefinitely," requires the operator to "establish, implement, and maintain a written
data retention policy" stating the purposes, the business need, and "a timeframe for deletion,"
and requires that policy to be disclosed in the online notice under 312.4(d).

**This is not prospective.** The FTC's amendments to the COPPA Rule were published in the Federal
Register on 22 April 2025 (RIN 3084-AB20, document 2025-05904), and regulated entities were given
365 days from publication to comply, with limited exceptions at 312.11(d)(1), (d)(4), and (g).
That full-compliance date fell on **22 April 2026**, roughly four months before this memorandum.
Counsel should confirm the distinction between the rule's own effective date and that
full-compliance date, and tell us whether any of the exceptions changes the analysis.

We have no such written, published retention policy, and for non-EU rows we have no purge at all.
That is the largest single gap this memorandum identifies.

**A second COPPA point, because we rely on it in the product.** Our privacy notice states that we
accept a FERPA school-official authorization in place of direct parental consent, limited to
school-curriculum use with no AI features, no profiling, and no advertising
(`app/frontend/app/templates/privacy.hbs:74`). That is a careful framing, but counsel should know
what it rests on. The FTC **declined to codify** the school-authorization pathway in the 2025
amendments, stating that it was "not finalizing the proposed amendments to the Rule related to ed
tech and the role of schools at this time" in order to avoid conflict with potential changes to
the Department of Education's FERPA regulations. The school-consent doctrine therefore remains
**1999 FTC staff guidance rather than Rule text**, valid only for collection for the use and
benefit of the school and for no other commercial purpose. Question 10 asks whether our framing
holds and what we must do to keep it holding.

The same notice promises that any use of AI word prediction or AI-drafted evaluation summaries by
a child under 13 "requires verifiable parental consent under 16 CFR Part 312." What actually gates
those features is the **account-activation** parental consent
(`coppa_parental_consent_blocks_access?`), not a separate AI-specific consent. The separate
AI-consent mechanism exists in code and, as section 5.1 records, has no runtime caller.
Question 19 asks whether account-level consent satisfies what the notice promises, given that the
2025 amendments require separate verifiable parental consent for disclosure of a child's personal
information to third parties.

---

# PART D: IMPLEMENTATION GAPS

## 14. What the proposed policy would require us to build

Status as of commit `8afabd1d2`. Register identifiers given where a finding already tracks the
item; "2026-08-29 triage" marks rows dispositioned on the unmerged CEO triage branch.

| # | Gap | Why it blocks the proposed policy | Register |
|---|---|---|---|
| 1 | No default retention window for communication logs; the job reaches only opted-in organizations and never unsponsored users | Principle 2 fails at the default | new |
| 2 | No general or children's purge for `ai_api_logs`; only the EU tier exists and it matches nothing | Direct conflict with 16 CFR 312.10 | new |
| 3 | `ai_api_logs` carries no per-row retention-class marker | A tiered purge cannot be written safely without one; schema plus call-site change | new |
| 4 | `request_summary` and `response_summary` persist for the life of the row | Model-facing user content retained indefinitely for non-EU rows | new |
| 5 | No retention mechanism for `audit_events` | Indefinite retention of a plaintext summary field | new |
| 6 | Four documented retention controls do not exist; three exist with no caller | Documentation states controls we do not have; `api_calls` grows unbounded | new |
| 7 | No written, published children's data retention policy | 16 CFR 312.10 requires one, in the 312.4(d) notice | new |
| 8 | Live privacy notice states no user content goes to an AI vendor | Customer-facing accuracy | new, **urgent** |
| 9 | Speech-to-Text, Text-to-Speech, Translation, and OpenSymbols carry user content with no COPPA, EU, Article 50, or user-preference gate, and no AI log record | Principle 5; a child's voice recording is COPPA personal information | new |
| 9a | Sentry receives exception events plus roughly 5 percent of transactions, including user id, IP, headers, cookies, and request body, suppressed in full only for COPPA-pending children | Same principle. This is a live production egress path that the proposed rule as first drafted did not reach | new |
| 10 | COPPA and EU AI gates pass when the subject user is not resolvable | Gates should fail closed | new |
| 11 | Article 50(2) marking not persisted onto saved, exported, or shared boards | Marking obligation in force since 2026-08-02; the retrofit grace period for pre-existing generative systems appears to end **2026-12-02** | new, **dated** |
| 11a | The versioned verifiable-AI-consent mechanism has no runtime caller | A built consent control that nothing invokes; the notice promises consent the gates do not separately collect | new |
| 11b | No AI call site writes `ip_address` or `organization_global_id`, so the 90-day IP redaction has nothing to redact | Not a privacy exposure, but a control we have described as active that is inert | new |
| 12 | No accounting of disclosure for supervisor and org-manager reads of utterance logs | If an accounting obligation applies, this is where it fails | new |
| 13 | `PredictionEntry` rows survive account deletion | Erasure incomplete | `LL-e8614c103f` |
| 14 | No self-service full-account portable export | Access and portability rights | new |
| 15 | Uploads receive a `public-read` ACL unless an environment variable is set | Confidentiality of board images and voice recordings | new |
| 16 | Tenant isolation has no database-level constraint | Depth of defense for district-to-district separation | new |
| 17 | District seat reclaim converts an under-13 account to a consumer trial with no parental re-consent | Consent state does not follow the account through a lifecycle change | `LL-f150e0e828`, remediated 2026-08-29 triage, awaiting production verification |
| 18 | No server-side password strength policy | Access control to the record set | `LL-5617f4e17d` |
| 19 | Production GCP audit-log and least-privilege findings | Access accounting for the data store | `LL-b7ccc522b9`, `LL-c0b3d59f58`, both verified closed on a live read in the 2026-08-29 triage |
| 20 | Cannot route EU or UK users to the EU geo inference profile. The jurisdiction resolver returns `:unknown` for essentially every account, and region is a single environment value rather than a per-request decision | Blocks the supplementary measure that would relocate model inference into the EEA. Per section 5.2 this removes ONE onward transfer leg; it does not end the Chapter V transfer, because the application is US-hosted | new |
| 21 | No Transfer Impact Assessment exists for the Bedrock transfer | Required when relying on SCCs rather than adequacy. Until one exists, the proposed customer statement in section 9.1 cannot be published in full | new |
| 22 | The whole data path is US-resident (Cloud Run, Cloud SQL, and Redis in GCP `us-central1`), so EU personal data is in the United States before any AI call. Whether it can be made EU-resident is not scoped anywhere | Determines whether EU inference routing is worth building on its own, or is a partial measure inside a larger unaddressed question | new |

**Proposed sequencing**, subject to counsel's answers: item 8 immediately, because it is a live
customer-facing statement. Then item 11, because it is the only gap with a date attached and that
date may be 2 December 2026. Then 3 and 2 together, since 2 cannot be built safely without 3.
Then 9 and 10, which are the same class of fix. Then 1 and 4. Then 7, a drafting task that depends
on Part E. Items 5, 6, 11a, 11b, and 12 can proceed independently.

---

# PART E: QUESTIONS FOR COUNSEL

## 15. Specific questions

Ordered by how much downstream work each unblocks. We have deliberately not answered any of them
internally.

### 15.1 Regulatory scope

1. **How should an AAC utterance log be classified?** It is a verbatim record of everything a
   person has said through the device, including statements about their health, body, needs, and
   relationships. Is it an education record under FERPA when district-sponsored, protected health
   information when clinic-sponsored, GDPR Article 9 special-category data because it reveals
   health information about a disabled data subject, or some combination that varies with the
   sponsoring organization?
2. **Under what customer configurations is LingoLinq a business associate?** Does a signed BAA
   with a hospital customer make us a business associate as to all accounts on the platform, only
   accounts sponsored by that customer, or only the data flows named in the agreement?
3. **When we serve a school district, are we a school official under the district's direct
   control** within 34 CFR 99.31(a)(1)(i)(B)? What contractual and operational facts must we
   establish, and what does "direct control with respect to the use and maintenance of education
   records" require us to give the district that section 4.5 shows we may not be giving it, for
   example a district-initiated export or deletion capability?
4. **Does FERPA impose any retention obligation on us**, or only restrictions on use, disclosure,
   and destruction while a request is pending? We believe the latter and would like confirmation.
5. **For our European customers, are we a processor under GDPR Article 28 in every case**, or is
   there a configuration in which we act as controller, for example for adult supporters'
   marketing-lead data, which is collected on a legitimate-interest basis with analytics cookies
   defaulting on for classic email signups?

### 15.2 The six-year question

6. **Does 45 CFR 164.316(b)(2)(i) reach our `ai_api_logs` table?** Our reading is that it does
   not, because that table records feature usage rather than a Security Rule action, activity, or
   assessment. Do you agree?
7. **Does it reach our `audit_events` table?** That table records administrative and access
   events including console sessions, masquerade, data-policy changes, and deletions. If it does,
   we will adopt a six-year rule for `audit_events` specifically and say so.
8. **Is there any federal HIPAA obligation to retain protected health information itself** for a
   fixed period, as distinct from documentation? If not, which state retention laws should we be
   tracking for hospital and clinic customers, and is that our obligation or theirs?

### 15.3 Retention windows

9. **Are the proposed windows in section 8 defensible?** In particular, is 24 months defensible
   as a default for AAC communication logs given that they support longitudinal therapy progress
   reporting, and is 12 months defensible for under-13 accounts?
10. **Will you draft the 16 CFR 312.10 written retention policy, or review our draft?** It must
    state purposes, business need, and a deletion timeframe, and be published in the 312.4(d)
    notice. Relatedly: **does our school-authorization framing hold?** Our notice accepts a FERPA
    school-official authorization in place of direct parental consent for school-curriculum use
    with no AI, no profiling, and no advertising. The FTC declined to codify that pathway in the
    2025 amendments, so it rests on 1999 staff guidance rather than Rule text. Is the framing
    sound, and what must we do to keep it sound?
11. **Is "supersession plus seven years" the right treatment for our compliance records**, or
    should we match 164.530(j) at six years?
12. **Should a customer be able to instruct us to retain longer than our default?** If so, what
    must that instruction contain to protect us, and does it affect our controller or processor
    characterisation?

### 15.4 EU and AI Act

13. **Do you agree Article 50 imposes no retention obligation**, and that the five-year EU tier
    should lose its stated basis? If we withdraw the basis, should we keep the mechanism?
14. **Is LingoLinq's AI functionality plausibly within Annex III high-risk?** LLM-assisted word
    prediction, board generation, and evaluation narration for a communication aid used in
    schools and clinics. We assert no view. If it is, Article 19's six-month log floor and the
    Chapter III obligations become live for us, and our answer to question 13 changes in the
    opposite direction from the one proposed.
15. **Is our disclosure posture right?** Our EU jurisdiction resolver returns "unknown" for
    essentially every production account. We propose disclosing to everyone and stamping
    jurisdiction only when confirmed. Does that create a problem we have not seen?
16. **Article 50(2) marking is not applied to saved, exported, or shared boards**, and the code
    says so itself. Generative systems already on the market before 2 August 2026 appear to have
    until **2 December 2026** to retrofit machine-readable marking. Does that grace period reach
    us, and what does "already on the market" mean for a feature that has shipped behind a flag?
    Separately, does an AI-assisted board that a human then edits remain "artificially generated"
    content for marking purposes?
17. **Would an AAC utterance log be Article 9 special-category data?** If yes, what lawful basis
    under Article 9(2) should we rely on, and does it change the retention analysis?
18. **Do we need an Article 30 Records of Processing Activities document?** We are not assuming
    the Article 30(5) small-organisation derogation covers us. That derogation is lost if the
    processing is likely to risk data subjects' rights, **or** is not occasional, **or** includes
    Article 9 special categories. Our processing of student and patient communication data is
    continuous rather than occasional, and question 17 asks whether it is special-category. On
    that reading the derogation is unlikely to apply regardless of headcount. Do you agree, and
    if so will you specify the record's contents for a processor in our position?

### 15.5 AI and external egress

19. **Is sending scrubbed but user-linked text to Amazon Bedrock under the AWS BAA a disclosure
    requiring consent, notice, or both**, separately for each of FERPA, COPPA, and GDPR? Two
    specifics. First, our AI features are gated by the **account-activation** parental consent,
    not by a separate AI consent; the separate AI-consent mechanism is built but has no runtime
    caller. Does account-level consent satisfy the 2025 amendments' requirement of separate
    verifiable parental consent for third-party disclosure, and does it satisfy what our own
    notice promises? Second, if a separate consent is required, we will wire the existing
    mechanism up rather than build a new one, and would like your view on the disclosure text.
20. **What is required for the Google Speech-to-Text path?** It sends a recording of a child's
    voice to Google, gated only by a coarse organization switch that defaults to allow, with no
    COPPA gate and no log record. Under 16 CFR 312.2 a child's voice recording is itself personal
    information. What consent, what contract, and what disclosure does this need, and should it be
    disabled until those are in place?
21. **What must we do about the live privacy notice?** `privacy.hbs:67` currently tells users
    that no user content is sent to an AI vendor "because the Bedrock path is inactive," while our
    register records production Bedrock calls. We propose to correct it immediately. Does the
    correction carry any notification obligation to users, districts, or clinics, and does the
    period during which the statement stood create exposure we should address affirmatively?
22. **Is our current characterisation of evaluation narration** as an assistive-technology access
    assessment rather than a health care activity sustainable? It determines whether that path is
    a HIPAA flow at all.
23. **What may we say publicly?** We would like language you approve for the website, RFP
    responses, and district security questionnaires, consistent with principle 3's rule against
    claiming conformance. The product's privacy page currently states that we "operate as a
    Business Associate" and "act as a School Official"
    (`app/frontend/app/templates/privacy.hbs:72-73`); we would like your view on both.

24. **Uploaded board images and voice recordings receive a `public-read` S3 ACL** unless the
    upload is marked private or the `UPLOADS_S3_NO_ACL` environment variable is set
    (`lib/uploader.rb:482, 491`). We cannot tell from source whether that variable is set in
    production. Assuming it is not, what is the exposure for a communicator's recorded voice or a
    board image containing a child's photograph, and does it change the analysis under FERPA,
    COPPA, or Article 32 GDPR?
25. **What is the right treatment for error telemetry?** Sentry receives user ids, IPs, headers,
    cookies, and request bodies for every user who is not a COPPA-pending child
    (`config/initializers/sentry.rb:5-40`). A consent gate is the wrong instrument for crash
    reporting. Should we rely on a separate lawful basis for operational telemetry, which we would
    like you to state, or minimise the payload until it carries no user-derived content?
26. **What does the OpenSymbols route need?** `lib/open_symbols.rb:42` sends a user-typed symbol
    search query to a third party. We find no OpenSymbols entry in any subprocessor register and no
    recorded DPA, BAA, or equivalent instrument. Is one required, is the query low-risk enough that
    it is not, and should the route be disabled until the answer is known?

### 15.6 International transfers

27. **Is Module Three the right module, and do our customer DPAs carry the flow-down?** We read
    the ordinary case as LingoLinq acting as processor for a school or hospital, making the
    LingoLinq-to-AWS leg a processor-to-processor transfer under Module Three, which the AWS DPA
    applies automatically. AWS also pushes its Module Three obligations toward our controllers
    onto us (DPA 12.2.2). Do our school and hospital DPAs actually carry that, and what language
    do they need? Relatedly, is the EU-controller-to-LingoLinq leg separately papered under
    Module Two in those same agreements?
28. **Should we state SCCs or the EU-US Data Privacy Framework as the transfer basis?** AWS is a
    covered entity under an active Amazon.com, Inc. DPF certification, but the AWS DPA does not
    mention the DPF and provides for SCCs. We propose to state SCCs and treat the DPF as
    supporting evidence in the Transfer Impact Assessment. Do you agree, and does relying on SCCs
    where an adequacy route arguably exists create any problem?
29. **What must the Transfer Impact Assessment cover, and will you review ours?** Specific facts
    we think it has to address: the data is verbatim communication content from children with
    disabilities, which may be Article 9 special-category data (question 17); the model runs on a
    **US geo cross-region profile** that may route to three US regions with prompts and outputs
    stored in those regions for abuse detection; `PiiScrubber` is pseudonymisation, not
    de-identification; and AWS commits to redirect and to notice government demands but cannot
    promise to resist them. Separately, on scope: our application, database, and cache run in GCP
    `us-central1`, so EU personal data is already in the United States before any Bedrock call.
    **Routing inference to the EU geo profile therefore removes one onward leg rather than the
    transfer itself.** Is that worth doing on its own terms, or is the only meaningful question
    whether the whole data path (hosting, database, backups, logging, error telemetry) can be made
    EU-resident? We would rather hear that the answer is the larger project than spend effort on a
    measure that reads better than it works.

### 15.7 US state student-privacy law

We did a first-pass survey only, from secondary compliance summaries rather than statute text, so
these are framed as questions rather than positions.

30. **Which state student-privacy regimes bind us today, and which are contract-driven?** Our
    first pass suggests three patterns we would need to satisfy:
    - **California**, SOPIPA (Bus. & Prof. Code 22584) plus AB 1584 (Ed. Code 49073.1). SOPIPA
      bars sale, targeted advertising, and profiling of K-12 student data and requires compliance
      with school deletion requests; AB 1584 works through required contract clauses, commonly
      including deletion of all student data and backups on contract termination with proof.
    - **New York**, Education Law 2-d. Appears to impose an explicit **30-day** clock to securely
      delete or destroy all student data remaining in the vendor's possession after contract
      expiry or termination, with obligations surviving termination and flowing to subcontractors.
    - **Illinois**, SOPPA (105 ILCS 85). Deletion after a defined period and on parent request
      routed through the school, conditioned by other records-retention law.

    Do these bind us directly, only through customer contracts, or both? Is the New York 30-day
    clock the tightest deletion obligation we face, and should we simply build to it as the
    default rather than maintaining per-state behavior? And which other states should be on this
    list that our first pass missed?

### 15.8 Process

31. **Which corrections in Part C should be applied by superseding the affected attested records,
    and which by a correction note that leaves the attested record frozen?** Our internal rule
    freezes an attested document's bytes permanently and supersedes it with a dated successor. We
    want your view on whether that is the right shape for records that reach customers in a
    diligence bundle.
32. **Must existing users re-acknowledge the corrected privacy policy?** On 2026-08-30 we
    corrected the privacy page and both AI disclosure pages (PR #888, merged to `staging` as
    `558de5919`; the citations in this question are verified at that commit, not at the audited
    commit above). With that change we bumped the signup consent version constant,
    `User::PRIVACY_POLICY_VERSION`, from `'2026-07-09'` to `'2026-08-30'` (`user.rb:29`). New
    signups acknowledge the new version (`user.rb:2368`); when a parent completes an emailed
    consent token, the parent's stamp on the child's behalf records it too (`user.rb:964`) and
    it is written into an immutable `AuditEvent` (`user.rb:978`). Existing users' acknowledgment
    records keep `'2026-07-09'`. **The position we have taken, pending your answer, is
    notice-only: no forced re-acknowledgment**, on the reasoning that a correction in the user's
    favor is not the kind of material change that requires fresh consent. Two facts cut against
    that position, and we put them in front of you rather than resolve them ourselves. First,
    one of the corrected statements was the "Private Thoughts" guarantee (`privacy.hbs:24,35`
    at the audited commit): its correction is not only a narrowing but the disclosure of a
    previously undisclosed collection, because `lib/ai_word_predictor.rb:165` writes up to 200
    characters of the composed sentence to `ai_api_logs` in plaintext. Second, the version is
    read at **grant time**, not at solicitation: `grant_parental_consent!` (`user.rb:930`)
    stamps whatever `PRIVACY_POLICY_VERSION` holds when the parent completes the token, and
    nothing pins the version when the token is issued, so a consent email sent before the bump
    and completed after it records the parent as acknowledging a policy revision that did not
    exist when they were solicited. Do you agree with notice-only; does the answer differ for
    under-13 verifiable parental consent; and must the acknowledged version be captured at
    solicitation rather than at grant?
    Since this question was drafted we have established a further fact that bears directly on
    it. `PRIVACY_POLICY_VERSION` has **no reader**: it is written at `user.rb:964`, `:978` and
    `:2368`, and the acknowledgment key is deleted at `:2456`, but no code path anywhere
    compares a stored `policy_version` against the current constant. There is no re-prompt, no
    notification, and no mechanism that could produce either, so the notice-only position is at
    present implemented as no notice at all. We have recorded that gap as an open finding,
    `LL-ac1d12bf3f`. If your answer is that re-acknowledgment is required, the mechanism to
    deliver it does not yet exist and would have to be built.
33. **Does the public visibility of this memorandum's pull request matter?** This memorandum was
    prepared on a branch of our public source repository and is carried by pull request #889,
    held open but deliberately unmerged; the copy you receive is delivered out-of-band. Because
    the repository is public, the branch diff is already visible regardless of merge state, and
    closing the pull request or deleting the branch would NOT unpublish it: GitHub retains the
    pull request's ref and every commit remains reachable by its hash. With that understood,
    should we close #889 and delete the branch, leave both as they are, or does the distinction
    carry no weight for privilege or any other purpose once the text has been publicly visible
    at all?
34. **Was the disclosure correction a correction in place of version 1, or a new version?** On
    2026-08-30 and 2026-08-31 we corrected both AI disclosure surfaces (PR #888, merged as
    `558de5919`; PR #895, merged as `f9620af8d`; the citations in this question are verified at
    `origin/staging` commit `164e1c6c8`, not at the audited commit above). Two legal bases were
    retracted as incorrect: EU AI Act Article 50 cited as a record-keeping requirement, and
    45 CFR 164.316(b)(2) cited as a retention floor. Retention windows previously presented as
    being in effect are now marked as not yet in effect. The Spanish text of the Article 50
    notice carried both retracted claims until PR #895 and is served without authentication at
    `/ai_consent/disclosures/art50_v1?locale=es`. **The position we have taken, pending your
    answer, is correction in place**: the version constant remains `1` in all three places it is
    recorded, `AiConsentDisclosures::CURRENT_VERSION`
    (`lib/lingo_linq/ai_consent_disclosures.rb:51`), `Article50Disclosures::CURRENT_VERSION`
    (`lib/lingo_linq/article50_disclosures.rb:85`), and `ART50_CURRENT_VERSION`
    (`app/frontend/app/utils/article50_gate.js:33`). Three facts cut against that position.
    First, both gates compare only the stored integer, `ai_consent_granted?` (`user.rb:1364`)
    and `article_50_disclosure_shown?` (`user.rb:1554`), so every consent and acknowledgment
    captured before the correction remains current, and no one who already acknowledged
    version 1 will ever be shown the corrected notice. Second, the content fingerprint we
    render into the page as the identity of what the user saw has now moved twice under the
    same version number, so the version alone no longer resolves what a given parent consented
    to. Third, a parent consented partly on the strength of retention statements that we now
    mark as not yet in effect. Cutting the other way, production carries no live users today,
    so publishing a new version and prompting everyone again would cost almost nothing now and
    steadily more after launch. May the existing consents stand against the corrected
    version 1, or does the material change standard at 16 CFR 312.5(c) require re-notice or
    re-consent; and does the answer differ between the Article 50 notice, which records
    display, and the AI consent disclosure, which records agreement?

---

## 16. Sources consulted

Retrieved 2026-08-30. Where a source could not be retrieved, that is stated rather than filled
from memory.

| Authority | Source |
|---|---|
| 45 CFR 164.316 (Security Rule documentation, six-year period) | https://www.law.cornell.edu/cfr/text/45/164.316 |
| 45 CFR 164.530(j) (Privacy Rule documentation, six-year period) | https://www.law.cornell.edu/cfr/text/45/164.530 |
| 16 CFR 312.10 (COPPA data retention and deletion) | https://www.law.cornell.edu/cfr/text/16/312.10 |
| COPPA Rule amendments, Federal Register 2025-04-22 (RIN 3084-AB20) | https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule |
| FTC announcement of the final COPPA amendments | https://www.ftc.gov/news-events/news/press-releases/2025/01/ftc-finalizes-changes-childrens-privacy-rule-limiting-companies-ability-monetize-kids-data |
| 34 CFR 99.31(a)(1) (FERPA school-official exception) | https://www.law.cornell.edu/cfr/text/34/99.31 |
| 34 CFR 99.10(e) (FERPA, the only destruction rule in Part 99) | https://www.law.cornell.edu/cfr/text/34/99.10 |
| 45 CFR 164.502(b), 164.514(d) (HIPAA minimum necessary and its exceptions) | https://www.law.cornell.edu/cfr/text/45/164.502 |
| Regulation (EU) 2024/1689 Article 50 (transparency) | https://artificialintelligenceact.eu/article/50/ |
| Regulation (EU) 2024/1689 Articles 12, 19, 26 (logging, high-risk only) | https://artificialintelligenceact.eu/article/19/ |
| Regulation (EU) 2024/1689 Article 113 and Annex III | https://artificialintelligenceact.eu/article/113/ ; https://artificialintelligenceact.eu/annex/3/ |
| Authoritative EU text | https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202401689 |
| Digital Omnibus, Regulation (EU) 2026/1744, deferring Annex III high-risk to 2027-12-02 while leaving Article 50 on its original date | https://www.goodwinlaw.com/en/insights/publications/2026/08/alerts-technology-dpc-eu-ai-act-transparency-obligations-now-in-force ; https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/ ; https://www.whitecase.com/insight-alert/eu-ai-omnibus-enters-force-amending-ai-act |
| Article 50(2) marking grace period to 2026-12-02 | https://labs.cloudsecurityalliance.org/research/csa-research-note-eu-ai-act-article-50-transparency-20260729/ |
| FTC declining to codify the ed-tech / school-authorization pathway in the 2025 amendments | https://www.lw.com/en/insights/ftc-publishes-updates-to-coppa-rule |
| AWS Data Processing Addendum (transfer clauses at 12.2, definitions, government access at 3) | https://d1.awsstatic.com/legal/aws-gdpr/AWS_GDPR_DPA.pdf |
| AWS Processor-to-Processor SCCs (Module Three) | https://d1.awsstatic.com/Processor_to_Processor_SCCs.pdf |
| AWS Controller-to-Processor SCCs (Module Two) | https://d1.awsstatic.com/Controller_to_Processor_SCCs.pdf |
| AWS UK GDPR Addendum, incorporating the ICO International Data Transfer Addendum of 2022-02-02 | https://d1.awsstatic.com/legal/aws-gdpr/UK_GDPR_Addendum_to_AWS_data_processing_addendum.pdf |
| AWS EU-US Data Privacy Framework position | https://aws.amazon.com/compliance/eu-us-data-privacy-framework/ |
| AWS subprocessor list | https://aws.amazon.com/compliance/sub-processors/ |
| Bedrock Claude Haiku 4.5 model card: US and EU geo inference profile IDs and destination regions | https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-4-5.html |
| Bedrock cross-region inference, including storage in destination regions for abuse detection | https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html |

**Retrieval limitations, stated rather than papered over.**

- The eCFR renderer for 45 CFR 164.316 redirected to an access-control page and its API returned
  404 for the section. Both HIPAA provisions were read from Cornell's Legal Information Institute
  mirror of the CFR. **Counsel should confirm the quoted language against eCFR before relying on
  it.**
- The HHS FAQ on medical-record retention returned 404 at its previously published URL. Section 12
  therefore relies on the regulation text and on the absence of a retention provision in Parts 160
  and 164, not on HHS guidance.
- The 16 CFR 312.10 text was retrieved from the Cornell mirror and carried no amendment date on
  its face. The Federal Register publication date (2025-04-22) and the 365-day compliance period
  were confirmed separately against ftc.gov and federalregister.gov. **We did not separately
  verify the rule's own effective date**, which differs from the full-compliance date, and
  counsel should confirm both.
- **The EU AI Act timeline in section 11 was confirmed against EUR-Lex on the second pass.**
  Regulation (EU) 2026/1744 (CELEX:32026R1744) was retrieved directly. Its Article 1(38) inserts
  the transitional provision into Article 111 of Regulation (EU) 2024/1689, giving providers who
  placed generative systems on the market before 2 August 2026 a **four-month** period to comply
  with the Article 50(2) marking obligation, which lands on **2 December 2026**. Article 1(40)
  amends Article 113 to set 2 December 2027 for Annex III and 2 August 2028 for Annex I.
  **Residual caution:** the retrieved wording reads as recital language, so counsel should read
  Article 111 as amended in the consolidated text before we treat 2 December 2026 as a hard date.
- **GDPR Article 9(1) and Article 30(5) were read from convenience mirrors, not EUR-Lex**, whose
  page truncated. One retrieved Article 9(1) extract appeared to omit enumerated categories
  (biometric data for unique identification, and sexual orientation), so nothing in this
  memorandum quotes Article 9(1) verbatim. Counsel should work from the authoritative text.
- **State student-privacy law in section 15.6 is a first-pass survey from secondary compliance
  summaries, not from statute text.** Cal. Bus. & Prof. Code 22584, Cal. Ed. Code 49073.1, NY
  Education Law 2-d and 8 NYCRR Part 121, and 105 ILCS 85 were not independently retrieved. Treat
  the New York 30-day figure in particular as unconfirmed.

## 17. Governance and register posture

This is a **new review record**. It supersedes nothing, replaces nothing, and modifies no attested
compliance record. It is registered as an unattested `draft` row in
`audit-reports/DOCUMENT-REGISTER.json`.

The corrections proposed in Part C bear on the following records, none of which is changed by this
memorandum: `docs/legal/DATA_RETENTION.md` (attested, superseded) and its dated successor
`docs/legal/2026-08-09_data-retention_draft.md`; `docs/legal/AI_DATA_FLOW_CLASSIFICATION.md`
(attested, superseded) and its dated successors. If counsel accepts the corrections, applying them
is a separate governance act requiring the CEO's attestation, and question 31 asks how it should
be done.

**Author-Model:** opus-5
