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
text alongside `user_global_id` (`db/schema.rb`). The IP is redacted at 90 days. The summaries are
not, and section 4 establishes that for non-EU rows they persist until account deletion.

**On disclosure.** Article 50(1) disclosure is built and enabled in production through a database
feature-flag override. Article 50 applies from 2 August 2026 and is therefore in force. A recent
fix resolves the disclosure gate's subject from the authenticated session user rather than from
application state (PR #885, in commit `8afabd1d2`). Article 50(2) content marking covers the
transient generation response and persisted focus-word sets, but was **not found** for saved,
exported, or shared boards (`app/controllers/api/boards_controller.rb:634-640`).

### 5.2 The egress paths our AI documents do not cover

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
  source, and question 22 asks about it.

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
| `audit_events` | 6 years **only if** counsel confirms these are Security Rule documentation; otherwise 24 months | Record creation | Question 6 |
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
   Current practice; we propose to keep it as a written rule and to confirm which instrument
   covers the Google paths.

## 10. What we propose to stop saying

**PROPOSED.** None of these is presently a customer representation except the first, which is.

| Statement | Where | Proposed treatment |
|---|---|---|
| "Today none of these features send any user content to an AI vendor, because the Bedrock path is inactive" | `app/frontend/app/templates/privacy.hbs:67` (**live, user-facing**) | Correct or remove. No inactive switch exists and production calls are recorded. See question 21. |
| Communication logs have a "3 years default" retention | `DATA_RETENTION.md:29` | Withdraw. No default exists. Replace once the proposed 24-month default is built. |
| Change history retained 6 years via cold-storage archival | `DATA_RETENTION.md:37` | Withdraw. The job does not exist; the code deletes those versions after weeks. |
| `ClusterLocation` 90-day nightly trim; children's age-18 sweeper; `LogSnapshot` cascade; "raw events 2 years"; 2-year inactivity | `DATA_RETENTION.md:28, 30, 38, 40, 50` | Withdraw or build. Section 4.3. |
| The EU five-year tier is required by "EU AI Act Article 50 record-keeping" | `DATA_RETENTION.md:33`, `AI_DATA_FLOW_CLASSIFICATION.md:231`, `scheduler.rake:147-152` | Withdraw the legal basis. Article 50 imposes no retention duty. |
| A "six-year HIPAA floor" applies to `ai_api_logs` | `ai_api_log.rb:230-238`, `scheduler.rake:150-151, 174-181` | Narrow. 164.316(b)(2)(i) reaches Security Rule documentation, not application logs. |
| "Every AI call is logged in `AiApiLog`" | Multiple | Narrow. False for the offline prediction generator and for all four Google paths. |
| Blanket framing that FERPA, HIPAA, GDPR, and COPPA apply to all data at all times | Multiple | Replace with a per-configuration scope statement counsel approves. |

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

**Where the AI Act's log-retention duty actually sits.** Article 19 requires providers to keep the
logs referred to in Article 12(1) for "a period appropriate to the intended purpose ... of at
least six months, unless provided otherwise in the applicable Union or national law." Article 19
binds **providers of high-risk AI systems**. It is a six-month floor, not a five-year duration,
and it does not reach a system that is not high-risk.

**Proposed conclusion.** The five-year figure has no basis in Article 50, and the only AI Act
retention provision that could apply is both shorter and conditioned on a high-risk
classification we have not established. We propose to withdraw the legal basis. Whether to keep
the mechanism is a separate question, put at question 12.

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
questions 5 and 6 ask directly.

**Where the six-year citation is used correctly.** Our document register applies a "supersession
plus seven years" rule to policy versions and audit evidence, citing 164.530(j) as a floor it
exceeds (`audit-reports/DOCUMENT-REGISTER.json`, `meta.retentionSchedule`). That is precisely the
category the six-year rule was written for. We propose no change and question 10 asks for
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
| 10 | COPPA and EU AI gates pass when the subject user is not resolvable | Gates should fail closed | new |
| 11 | Article 50(2) marking not found for saved, exported, or shared boards | Marking obligation is in force as of 2026-08-02 | new |
| 12 | No accounting of disclosure for supervisor and org-manager reads of utterance logs | If an accounting obligation applies, this is where it fails | new |
| 13 | `PredictionEntry` rows survive account deletion | Erasure incomplete | `LL-e8614c103f` |
| 14 | No self-service full-account portable export | Access and portability rights | new |
| 15 | Uploads receive a `public-read` ACL unless an environment variable is set | Confidentiality of board images and voice recordings | new |
| 16 | Tenant isolation has no database-level constraint | Depth of defense for district-to-district separation | new |
| 17 | District seat reclaim converts an under-13 account to a consumer trial with no parental re-consent | Consent state does not follow the account through a lifecycle change | `LL-f150e0e828`, remediated 2026-08-29 triage, awaiting production verification |
| 18 | No server-side password strength policy | Access control to the record set | `LL-5617f4e17d` |
| 19 | Production GCP audit-log and least-privilege findings | Access accounting for the data store | `LL-b7ccc522b9`, `LL-c0b3d59f58`, both verified closed on a live read in the 2026-08-29 triage |

**Proposed sequencing**, subject to counsel's answers: item 8 immediately, because it is a live
customer-facing statement. Then 3 and 2 together, since 2 cannot be built safely without 3. Then
9 and 10, which are the same class of fix. Then 1 and 4. Then 7, a drafting task that depends on
Part E. Items 5, 6, and 12 can proceed independently.

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
    notice. What must it say about data a school authorised us to collect on the parent's behalf?
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
16. **Article 50(2) marking is not applied to saved, exported, or shared boards.** Given the
    obligation is in force as of 2 August 2026, how quickly must that be closed, and does an
    AI-assisted board that a human then edits remain "artificially generated" content?
17. **Would an AAC utterance log be Article 9 special-category data?** If yes, what lawful basis
    under Article 9(2) should we rely on, and does it change the retention analysis?
18. **Do we need an Article 30 Records of Processing Activities document**, or does the Article
    30(5) derogation reach us given our headcount and the nature of the data?

### 15.5 AI and external egress

19. **Is sending scrubbed but user-linked text to Amazon Bedrock under the AWS BAA a disclosure
    requiring consent, notice, or both**, separately for each of FERPA, COPPA, and GDPR? We
    currently obtain a separate AI data-sharing consent and would like to know whether it is
    necessary, sufficient, or neither.
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

### 15.6 Process

24. **Which corrections in Part C should be applied by superseding the affected attested records,
    and which by a correction note that leaves the attested record frozen?** Our internal rule
    freezes an attested document's bytes permanently and supersedes it with a dated successor. We
    want your view on whether that is the right shape for records that reach customers in a
    diligence bundle.

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
| Regulation (EU) 2024/1689 Article 50 (transparency) | https://artificialintelligenceact.eu/article/50/ |
| Regulation (EU) 2024/1689 Article 19 (automatically generated logs) | https://artificialintelligenceact.eu/article/19/ |
| Regulation (EU) 2024/1689 Article 113 (application dates) | https://artificialintelligenceact.eu/article/113/ |
| Authoritative EU text | https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202401689 |

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
- The Article 113 application timeline retrieved differs from the timeline as originally
  published, indicating subsequent amendment. **The dates in section 11 should be confirmed
  against the consolidated text.**
- State student-privacy retention and deletion duties (for example California AB 1584, New York
  Education Law 2-d, Illinois SOPPA) were **not researched** for this memorandum and are a gap we
  ask counsel to close.

## 17. Governance and register posture

This is a **new review record**. It supersedes nothing, replaces nothing, and modifies no attested
compliance record. It is registered as an unattested `draft` row in
`audit-reports/DOCUMENT-REGISTER.json`.

The corrections proposed in Part C bear on the following records, none of which is changed by this
memorandum: `docs/legal/DATA_RETENTION.md` (attested, superseded) and its dated successor
`docs/legal/2026-08-09_data-retention_draft.md`; `docs/legal/AI_DATA_FLOW_CLASSIFICATION.md`
(attested, superseded) and its dated successors. If counsel accepts the corrections, applying them
is a separate governance act requiring the CEO's attestation, and question 24 asks how it should
be done.

**Author-Model:** opus-5
