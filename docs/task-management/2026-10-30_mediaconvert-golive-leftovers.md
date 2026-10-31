# MediaConvert go-live leftovers (#981)

Date: 2026-10-30. Branch `traci/fix/mediaconvert-golive-leftovers` from develop `fd514a167`
(#1239 merged). Line numbers in the fact sheets are at `fd514a167`, before this branch's edits. Traci: "make sure the issues in 981 are still real and fully fix them".

LEARNINGS consulted: `LEARNINGS.md:38` (PiiScrubber and `filter_parameters` never touch explicit
`Rails.logger` lines; Cloud Run ships stdout to Cloud Logging; log opaque ids or nothing).

## Every open #981 item, re-checked against develop

| Item | State on develop | Verdict |
|---|---|---|
| Cause 1: `mp3_settings`/`mp4_settings` rejected by the SDK | `mp_3_settings`/`mp_4_settings` (`transcoder.rb:299,336`, #1016) | Done |
| Audio 1040 duplicate output paths | `extension: 'mp3'`/`'wav'` (`transcoder.rb:291,313`, `4ddfa51b8`) | Done in code; no COMPLETE observed yet |
| Cause 2: output paths read from GetJob | read from the COMPLETE event (#1239, `fd514a167`) | Done |
| Video predicted to hit 1040 | not established (`2026-10-29_transcoder-complete-event-paths.md`, triage item 4) | No change; the staging video decides |
| Deploy wiring `SNS_ARNS`/`SNS_REGION`, prod queue guard | `deploy-cloudrun.yml:649-653,692` (#997) | Done |
| IAM policy files and README | `scripts/gcp/iam/` | Done |
| Scheduler logs record inspects, not a count | REAL, see fix 1 | Fix here |
| (found 2026-10-30) callback logs the whole MediaConvert body | REAL, see fix 2 | Fix here |
| (found 2026-10-30, adversary) the AWS SDK logs every request's params | REAL, see fix 3 | Fix here (shared config approved by Traci 2026-10-30) |
| (LL-fba170716e, part) the SMS branch logs the body before verifying; the confirm branch logs the token | REAL, see fix 4 | Fix here |
| (adversary) a job is queued before the upload exists (`sounds_controller.rb:37` -> `uploadable.rb:52-60` save -> `media_object.rb:89`) | PLAUSIBLE: depends on upload time vs. MediaConvert start | The staging smoke test with a multi-MB video decides; its own PR if real |
| (adversary) prod has already used both retries: `schedule_transcoding(true)` counts an attempt even when `convert_*` returns false unconfigured (`media_object.rb:83-96`, `button_sound.rb:149`) | CONFIRMED by reading | Feeds the backfill decision: a backfill must reset `extra_transcoding_attempts` and `transcoding_in_progress` |
| Dead-letter queue on the nonprod subscription before the smoke test (`2026-10-29_...:189`) | ops | Not code |
| Staging smoke test (sound, video); prod Cloud Armor, prod subscription, prod role; #965 retries | ops (AWS/GCP admin; no `gcloud`/`aws` on this machine) | Not code |
| Widen the `schedule_missing_transcodings` window | a decision | Traci |
| Subprocessor register names neither MediaConvert nor EventBridge | `2026-09-14_subprocessor-register.md` is approved/attested by Scot | Scot (`/re-attest-record`) |

## Fix 1: the daily sweep logs an array of records

Fact sheet:
- (a) Read: `lib/tasks/scheduler.rake:62` `puts "done, #{count} scheduled"` and `:153`
  `"#{count} scheduled"`. CONFIRMED.
- (b) Shapes: `ButtonSound.schedule_missing_transcodings` (`button_sound.rb:147-167`) ends on
  `UserVideo.where(...).each`, which returns the Array of every UserVideo in the window. Its
  interpolation is `Array#inspect`. Rails 7.2 inspect truncates long strings and filters
  `user_id`, but prints `id` and `nonce` for each video, i.e. its protected global_id
  (adversary, `filter_probe.rb`; the red run showed exactly that). CONFIRMED. The harm is a
  misleading log line with record ids, not a key leak: the codebase already logs nonce'd ids
  (`transcoder.rb:82,93`).
- (c) Only the two scheduler lines read the return value; `scheduler_spec.rb:27` stubs it to 0;
  no spec asserts it. CONFIRMED (adversary grep of app, lib, spec, config, bin, scripts, .github).

Fix: return the number of records actually queued: the else branch, and only when
`settings['full_filename']` is present (otherwise `schedule_transcoding` queues nothing,
`media_object.rb:85`). Red test (as shipped, after the second review): sounds 2 due, 1 at max
attempts, 1 in progress, 1 with no full_filename; videos 2 due, 1 at max, 2 in progress, 1 with
no full_filename; expect 4 and `Worker.schedule` exactly 4 times.
Mutations: end on the `.each` again; count without the full_filename check.

## Fix 2: the MediaConvert callback logs the whole notification

Fact sheet:
- (a) Read: `callbacks_controller.rb:31` `Rails.logger.warn(json_body.to_json)`, after the
  verifier and before `handle_event` (which calls GetJob at `transcoder.rb:17`). CONFIRMED.
- (b) Shapes: the SNS envelope's `Message` is a JSON string. A COMPLETE carries
  `outputFilePaths` and `userMetadata` (`audio_id`/`video_id`, `transcoding_key`); an ERROR
  carries `errorMessage` (held an S3 path on 2026-09-19). A key's unguessable part is the
  128-hex `file_prefix` digest (`uploadable.rb:67-70`); buckets are public-read
  (`docs/INFRASTRUCTURE.md:171`). The scheme is not the secret: `scrub_probe.rb` leaked the hex
  in 5 of 7 forms under a scheme regex and in none under a long-hex regex. CONFIRMED.
- (c) No spec asserts the line. CONFIRMED.

Fix (best practice: keep what diagnosis needs, drop what grants access, log before the remote
call, never let logging fail the request):
- `Transcoder.loggable_event(json_body)`: parse `Message` when it is JSON, rebuild the hashes
  and arrays (the caller's body is never changed), replace
  every run of 32+ hex characters in any string with `[hex]`, replace any `transcoding_key`
  value with `[redacted]`, `to_json` (escapes newlines, so no log-line injection), cap at 4000
  characters. Rescues everything and returns a fixed marker string.
- The controller logs that at `:31`, so ERROR, in-progress and GetJob-raising events still log.
- `handle_event` logs one line with the job id and a reason at each `return false`.

Red tests: realistic COMPLETE (distinct `transcoding_key`, real-shaped hex keys) and ERROR with
a path in `errorMessage`, through the controller with a StringIO logger: the hex and the
`transcoding_key` are absent; job id, status and path shape present. A `handle_event` that
raises (stubbed) still leaves the line. Mutations: restore `json_body.to_json`; drop the `transcoding_key`
redaction; log after `handle_event`.

## Fix 3: the AWS SDK logs request parameters

Fact sheet:
- (a) `aws-sdk-rails` 3.13.0 sets `Aws.config[:logger] = ::Rails.logger`
  (`railtie.rb:14,46`); the SDK's default formatter logs `operation(request_params)` at info
  (`aws-sdk-core` 3.257.0 `log/formatter.rb:212-221`); production logs at info
  (`production.rb:66`). CONFIRMED; the local dev log has 357 `[Aws::S3::Client ...]
  get_object(bucket:...,key:...)` lines, and the 2026-09-19 log quotes a staging worker
  `[Aws::MediaConvert::Client 201 ... create_job(...)]` line.
- (b) Eight clients (`uploader.rb:126,222`, `transcoder.rb:109`, `pusher.rb:45` (SMS
  `publish(phone_number:, message:)`), `callbacks_controller.rb:17`, `ai_client.rb:571`,
  `ai_prediction_generator.rb:98`, `curated_vocabulary_sources.rb:172`); none sets its own
  `log_formatter`. CONFIRMED.
- (c) Nothing reads SDK log lines (adversary: no spec or tool parses them). CONFIRMED.
- Corrections from the second review: the SNS `phone_number` was already filtered by the SDK
  (`PublishInput::SENSITIVE`); the SMS `message` text was not. The client list missed the one
  that matters most: `Aws::Rails::SesMailer` builds an SES client per email
  (`production.rb:117`, `amazon_ses.rb`) and `send_raw_email` logged the first 1000 characters
  of every raw email, which can hold a password-reset code. App lines still log some keys on
  failure (`uploader.rb:272,410,479,501`) and Sentry breadcrumbs may carry URLs; this fix does
  not claim keys vanish from every log.

Fix: `config/initializers/aws_logging.rb` sets `Aws.config[:log_formatter]` to the SDK's own
pattern minus `:request_params` and `:error_message` (the `short` preset plus retries). Shared
config, approved by Traci 2026-10-30. Red test: a stubbed S3 `head_object` and a stubbed SNS
`publish` with a StringIO logger log the operation but not the key, the email's contents or the
SMS message (the SDK already filtered `phone_number`).
Mutation: remove the initializer line.

## Fix 4: the SMS and confirmation branches (part of LL-fba170716e)

- SMS (`callbacks_controller.rb:40-46`): verify first, then log only "INBOUND SMS
  NOTIFICATION"; never the body (sender E.164 number and text).
- Confirmation (`:15`): drop the `json_body.to_json` line (Token, SubscribeURL). Keep the topic
  ARN line.
- Not done: a signature check on SubscriptionConfirmation (a forged one cannot subscribe
  anyone: only `events.amazonaws.com` may publish to the topics, and subscribing needs AWS
  permissions), and a body size cap (no harm path found). Closure of LL-fba170716e is Scot's.

Red tests: an inauthentic SMS notification logs nothing with the phone number or text; an
authentic one logs neither; a confirmation logs no token. Mutation: restore each log line.

LL-fba170716e's remediation text ("mirror the transcoding branch") goes stale with fix 2;
flag it for Scot, do not edit the register.

## Second adversary review (revised proposal) and what changed

No Critical; one High (SES raw emails, above), Lows: fix 1 fixture symmetric (made uneven:
expect 4, no subtotal or relation size equals it); fix 2 rejection lines unpinned (pinned:
fixed reason strings, the job id only after GetJob found the job, and a test); the
phone-number and "keys disappear" claims (corrected above). 24+ hex vs 32+: kept 32+ plus
`transcoding_key` by name, so record ids stay in the line for the smoke test, consistent with
how the code already logs ids.

## Implementation

- `9dfee350d` `config/initializers/aws_logging.rb`: the SDK pattern without `:request_params`
  and `:error_message`. Red first (S3 key, SES reset code, SMS text all logged), then green.
- `2371c4d48` `ButtonSound.schedule_missing_transcodings` returns the number queued.
- `607dc68f7` `Transcoder.loggable_event`/`redact_for_log` (logged before `handle_event`),
  `Transcoder.reject_event` at each false return, the SMS branch verifies before it logs and
  logs no body, the confirmation branch no longer logs the token.

Mutations (each restored from a copy; all killed): sweep ignores full_filename in the video
loop; sweep returns the video relation size; full body logged; no `transcoding_key` redaction;
log after `handle_event`; silent no-mp3 return; SMS body logged before verify; token logged;
hex rule disabled. The SDK fix's red run before the initializer is its mutation.

Local run: callbacks, transcoder, button_sound, user_video, media_object, scheduler, pusher,
uploader, `spec/initializers`, `spec/mailers`: 605 examples, 0 failures, 4 pending (none added).

## For Scot (not changed here)

- **Note, no action needed (Traci, 2026-10-30).** Until this deploys, Cloud Logging may hold
  SDK lines with S3 keys, the first 1000 characters of raw SES emails (reset codes are valid 3
  hours, `passwords.rb:64`, so long expired) and outbound SMS text. No purge: Traci decided the
  lines already logged need no action. Not read from here: no `gcloud` on this machine.
- **Register.** The SDK leak is not in FINDINGS.json. LL-fba170716e's SMS logging part is fixed
  here; its confirmation-signature and body-size parts are not, and its remediation text
  ("mirror the transcoding branch") is stale. Closure and wording are Scot's.
- **Subprocessor register** `2026-09-14_subprocessor-register.md` (attested) names neither
  MediaConvert nor EventBridge.

## Still open on #981 after this

Staging smoke test (one synthetic sound; one multi-MB video, which also decides the 1040 and
submit-before-upload questions); a dead-letter queue on the nonprod subscription first; prod
Cloud Armor admits `POST /api/v1/callback`, prod topic subscribed, prod role ARN set; #965
retries; the backfill decision (it must reset `extra_transcoding_attempts` and
`transcoding_in_progress`, since unconfigured prod used both retries).

## Implementation reviews (2026-10-30)

`REVIEWED=range origin/develop (fd514a16775c5f38b81eb15779c2087be04c2783) ... HEAD
(f1d9f7e5247cbfa3edc1d932344aed774718858c)`. Senior-dev: Approve with comments, Lows only.
Adversary: ship with conditions, no Critical/High. Each checked by hand. Fixed in `a517019f7`:
- invalid UTF-8 (a JSON-escaped lone surrogate) made the redaction raise and blanked the line:
  strings are scrubbed first, and the fallback keeps a job-id-shaped id;
- `Signature`, `SigningCertURL`, `UnsubscribeURL` are left out of the line (UnsubscribeURL can
  unsubscribe an endpoint confirmed without authentication);
- the cap and the fallback had no test; the confirmation example now restores `SNS_ARNS`
  through `env_wrap`; the logging examples also assert no 32+ hex run;
- the `reject_event` comment said "never event-supplied text"; the id is the event's, accepted
  by GetJob, and the comment now says so. Fact-sheet corrections above.
Mutations, all killed: no scrub; keep the dropped fields; no cap; no job id in the fallback; an
unsanitized fallback id.
Not done: the count copies `schedule_transcoding`'s full_filename guard instead of using its
result (`schedule_transcoding` returns true either way; the spec pins today's rule); file:line
citations in comments (the repo's own convention).
Pre-existing, Traci to decide: a genuinely signed SNS message from any AWS account, replayed with
an `sms_inbound` header, reaches `RemoteTarget.process_inbound` (the verifier does not bind the
topic). `SNS_ARNS` cannot hold the SMS topic (one ARN per environment), so the fix would bind the
signed `TopicArn` to our account and the SMS name.
