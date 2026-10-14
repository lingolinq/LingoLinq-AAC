# 2026-10-14 SES bounce and complaint handling, plus SES alarms

Branch `traci/feat/ses-bounce-handling-and-alarm`, from `origin/develop` at `57c314604`.

## Learnings consulted

Grepped `LEARNINGS.md` and `learnings-archive/` for ses, bounce, email, sqs, mailer.

- LEARNINGS.md:40 "PiiScrubber and `filter_parameters` never touch explicit `Rails.logger`
  interpolation ... log opaque `global_id`s or nothing; the log formatter catches only emails,
  phones, SSNs and IPv4." Applied: the consumer logs counts and event types only.
- LEARNINGS.md:342 / archive 9147: `AWS_KEY`/`AWS_SECRET` is the least-privilege S3/SES
  principal `lingolinq-cloudrun-s3-ses-policy.json`; do not bolt unrelated actions onto it.
  SQS read on the SES events queue is part of the same email surface, so it goes there.
- archive 4525: SES region may come from `AWS_REGION`, not `SES_REGION`. Applied: the SQS
  client uses the same fallback chain as `config/initializers/amazon_ses.rb`.
- archive 7839: mail goes through `schedule_delivery` on the `priority` queue.
- archive 12756 (b): a "flag" claim must be read at the code, not assumed. Applied to
  `email_disabled` below.

## Fact sheet

Each line CONFIRMED (`file:line`, on develop `57c314604`) or ASSUMED.

### Brief claims, re-verified on develop

1. CONFIRMED production sends through aws-sdk-rails `:ses`: `config/environments/production.rb:117`
   (`config.action_mailer.delivery_method = :ses`), registered at
   `config/initializers/amazon_ses.rb:15-22`.
2. CONFIRMED the interceptor adds `X-SES-CONFIGURATION-SET` from `ENV['SES_CONFIGURATION_SET']`:
   `config/initializers/amazon_ses.rb:36-46`. The deploy workflow sets
   `SES_CONFIGURATION_SET=lingolinq-transactional` in `APP_ENV_VARS_STATIC`
   (`.github/workflows/deploy-cloudrun.yml:449`), which is used for EVERY environment, so
   staging sends are tagged too and their events land on the same queue.
3. CONFIRMED the configuration set publishes SEND, REJECT, BOUNCE, COMPLAINT, DELIVERY,
   DELIVERY_DELAY to SNS topic `lingolinq-ses-events`, subscribed by SQS queue
   `lingolinq-ses-events`: `scripts/gcp/phase5-ses-config-set-setup.sh:27-29,151-189`. The
   subscription is created WITHOUT `RawMessageDelivery` (`:155`), so each SQS body is an SNS
   envelope whose `Message` field is the SES event JSON string.
4. CONFIRMED nothing reads the queue: no `Aws::SQS` reference in `app/` or `lib/`.
5. CONFIRMED `UserMailer.bounce_email(email)` at `app/mailers/user_mailer.rb:8-14` sets
   `email_disabled` on every user whose `email_hash` equals `User.generate_email_hash(email)`,
   and has no caller outside `spec/mailers/user_mailer_spec.rb:15-30`.
6. CORRECTED line number: `email_disabled` is read at `app/models/concerns/notifiable.rb:17`
   and `app/controllers/api/users_controller.rb:843` (the brief said `:902`, which was the
   #1117 branch).
7. CONFIRMED `aws-sdk-sqs 1.106.0` is in `Gemfile.lock:141` as a dependency of
   `aws-sdk-rails 3.13.0` (`Gemfile.lock:124`), and `bundle exec ruby -e 'require "aws-sdk-sqs"'`
   loads it. No Gemfile change is needed today. Risk: it is transitive; a future
   aws-sdk-rails major that drops the SQS dependency would make `require` raise
   `LoadError`. Recommendation for the owner: add `gem 'aws-sdk-sqs', '~> 1'` in a separate
   reviewed change.
8. CONFIRMED a dead mailbox does not raise at send time: `General.deliver_message`
   (`app/mailers/concerns/general.rb:28-35`) rescues only `InvalidParameterValue`; a bounce
   arrives later as an event (AWS docs below).

### (a) Where is `email_disabled` READ?

- `Notifiable#channels_for` (`app/models/concerns/notifiable.rb:11-23`): returns `[]` when set,
  EXCEPT for `email_changed_prior_address`, `password_changed`, `email_changed`,
  `forgot_password`, which always return `[named_email]`.
- `General#mail_message` (`app/mailers/concerns/general.rb:4-13`) does not read the flag
  itself, but it sends one mail per `user.channels_for(channel_type)` entry, and
  `channel_type` defaults to the calling mailer method's name (`:5`). So EVERY
  `mail_message` mail is gated through `channels_for`. The brief's "mail_message does NOT
  check it" is true only literally; in effect it is gated.
- `Api::UsersController#forgot_password` (`app/controllers/api/users_controller.rb:843`):
  disabled users are filtered out before `generate_password_reset`, so a disabled user gets
  NO reset mail (the `channels_for` exemption for `forgot_password` is never reached).

### (b) Every shape `email_disabled` can hold, and its writers

- absent / nil: default. Every user created today.
- `true`: written only by `UserMailer.bounce_email` via `update_setting`
  (`app/mailers/user_mailer.rb:12`). Nothing calls it today, so no production user holds it
  unless set by hand.
- No writer ever sets it back to false or deletes it (`grep -rn email_disabled app lib`).
- `User` has `has_paper_trail :only => [:settings, :user_name]` (`app/models/user.rb:44`), but
  only `:if` whodunnit is set and does not start with `job` (`:45`). CORRECTED after review: the
  scheduler sets no whodunnit, so a bare `bounce_email` from it is NOT versioned. The worker
  sets whodunnit `system:ses-events` around the call.

### (c) Cross-file claims

- CONFIRMED changing the email does NOT clear the flag: `User#process_params`
  (`app/models/user.rb:2618-2630`) appends the old address to `old_emails`, sets
  `@email_changed`, assigns the new email, and never touches `email_disabled`. Other writers of
  `settings['email']`: `app/models/concerns/subscription.rb:642,647` (eval reset). Neither
  clears it.
- CONFIRMED `email_hash` is `MD5(email.to_s.strip.downcase)` of `"none"` when nil
  (`app/models/user.rb:2188-2190`), recomputed on every save in `generate_defaults`
  (`:2145`, `before_save` at `:39`). HAZARD: `bounce_email(nil)` or `bounce_email('')` hashes
  `"none"` / `""` and would disable every user without an email. The consumer must never pass
  a blank address.
- CONFIRMED the scheduler pattern: `lib/tasks/scheduler.rake` `scheduler:dispatch` runs hourly
  tasks through `run_task` (rescues `StandardError, ScriptError`, records failures, exits
  non-zero at the end). Workers called inline from it follow
  `app/workers/supervisor_consent_expiration_worker.rb` (module, `@queue`, `self.perform`
  returning a count). The Job gets the full env and secret set
  (`.github/workflows/deploy-cloudrun.yml:1190-1209`).
- CONFIRMED a hand-set env var on a Cloud Run service is wiped on the next deploy because
  every deploy uses `--set-env-vars` (`deploy-cloudrun.yml:440-448`, the
  `SES_CONFIGURATION_SET` incident). A new per-environment value must be plumbed through
  the workflow's `vars.APP_*` list (`:633-727`).
- CONFIRMED the `[inactivity sweep]` log line is not on develop (`grep` in `app lib` is empty);
  it lives on #1117.

### AWS event shape (cited)

Source: AWS SES Developer Guide, "Contents of event data that Amazon SES publishes to Amazon
SNS", https://docs.aws.amazon.com/ses/latest/dg/event-publishing-retrieving-sns-contents.html
(read 2026-10-14).

- Top level `eventType`: `Bounce`, `Complaint`, `Delivery`, `Send`, `Reject`, `Open`,
  `Click`, `Rendering Failure`, `DeliveryDelay`, `Subscription`. "If you did not set up event
  publishing this field is named `notificationType`." The parser accepts both.
- `bounce.bounceType`: `Undetermined`, `Permanent`, `Transient`. Permanent subtypes:
  `General`, `NoEmail`, `Suppressed`, `OnAccountSuppressionList`, `EmailValidationSuppressed`,
  `OnTenantSuppressionList`. `bounce.bouncedRecipients[].emailAddress`.
- `complaint.complainedRecipients[].emailAddress`; "Most ISPs redact the email addresses of
  recipients who submit complaints. For this reason, the complainedRecipients field includes
  a list of everyone who was sent the email whose address is on the domain that issued the
  complaint notification." `complaintFeedbackType` may be `not-spam` ("used to correct a
  message that was incorrectly tagged ... as spam"). `complaintSubType` may be
  `OnAccountSuppressionList`.
- SNS to SQS without raw delivery wraps the event in an SNS notification whose `Message`
  is the event JSON as a string (standard SNS envelope: `Type: "Notification"`, `Message`).

Thresholds source: AWS SES Developer Guide, "Reputation metrics messages",
https://docs.aws.amazon.com/ses/latest/dg/reputationdashboardmessages.html: bounce "5% or
greater, we automatically place your account under review. If your bounce rate is 10% or
greater, we might pause"; complaint "0.1% or greater ... under review ... 0.5% or greater, we
might pause". CloudWatch `AWS/SES` `Reputation.BounceRate` / `Reputation.ComplaintRate` are
fractions (0.05 = 5%): "Creating reputation monitoring alarms using CloudWatch",
https://docs.aws.amazon.com/ses/latest/dg/reputationdashboard-cloudwatch-alarm.html and
https://repost.aws/knowledge-center/ses-reputation-dashboard-bounce-rate.

## What `email_disabled` gates today (report only, no change in this PR)

Gated (suppressed when set): every mail sent through `mail_message` except the four exempt
channel types. That is: `badge_awarded`, `confirm_registration`, `log_message`,
`log_summary`, `usage_reminder`, `organization_assigned`, `organization_unassigned`,
`valet_password_enabled`, `valet_password_used` (UserMailer); every `mail_message` mail in
SubscriptionMailer (`subscription_resume_failed`, `purchase_bounced`, `purchase_confirmed`,
`eval_purchase_confirmed`, `supporter_purchase_confirmed`, `expiration_approaching`,
`one_day_until_expiration`, `one_week_until_expiration`, `subscription_expired`,
`subscription_expiring`, `gift_seconds_added`, `extras_purchased`, `deletion_warning`,
`account_deleted`); SupervisorMailer `consent_request` (communicator branch), `consent_approved`,
`consent_denied`, `supervisor_revoked`.

Exempt inside `mail_message`: `password_changed`, `email_changed`,
`email_changed_prior_address`, `forgot_password` (but see below).

Blocked a different way: password reset. `users_controller.rb:843` drops disabled users, so
no reset mail is sent at all.

Not gated (call `mail(...)` directly): `new_user_registration`, `login_no_user`,
`utterance_share`, `lesson_assigned`, all `parental_consent_*` and `eu_ai_parental_consent_*`
(to the parent address), AdminMailer (`message_sent`, `beta_feedback_sent`, `opt_out`),
SubscriptionMailer `chargeback_created`, `subscription_pause_failed`, `new_subscription`,
`unsubscribe_reason`, `gift_created`, `gift_redeemed`, `gift_updated`, SupervisorMailer
`consent_request` (direct-address branch).

Policy notes for the owner: (1) `deletion_warning` and `account_deleted` are gated, so a
bounced user gets no deletion notice (moot if the mailbox is dead, not moot after a
complaint); (2) a disabled user cannot self-serve a password reset until the email changes
(which needs a login) or the flag is cleared by support.

## Proposal

### Part 1 design

- `SesEvent` (lib): pure parsing. Input: SQS body string. Unwraps an SNS envelope if present,
  accepts `eventType` or `notificationType`. Output: an action (`:disable` with recipient
  list, `:ignore`) or raises `SesEvent::Malformed`.
- `SesEventsWorker` (app/workers, the `SupervisorConsentExpirationWorker` shape):
  `perform` returns counts; no-op returning `{skipped: true}` when `SES_EVENTS_QUEUE_URL` is
  blank. Up to `MAX_BATCHES = 100` receives of 10 messages (1000 per run), stops early on an
  empty receive. Per message: parse; on `:disable` call `UserMailer.bounce_email` for each
  non-blank address; then delete. Malformed: count, delete. Handler exception (DB down):
  count, do NOT delete; it returns after the visibility timeout and is retried next run.
- Hooked into `scheduler:dispatch` hourly block via `run_task`.
- SUPERSEDED by review F1 below (complaints are now counted, not acted on). Original
  complaint decision: treat like a permanent bounce, except `complaintFeedbackType ==
  'not-spam'` (a correction) which is ignored. Reasoning: SES default account-level
  suppression covers COMPLAINT for accounts created after 2019-11-25 (ASSUMED, the live
  setting cannot be read from here), so the next send would come back as an
  `OnAccountSuppressionList` bounce and disable the user anyway; disabling now saves that
  send and its reputation cost. The cost: a complainer loses self-serve password reset
  (`users_controller.rb:843`); COPPA consent mail goes to the parent address through direct
  `mail(...)` and is unaffected. Documented risk: because ISPs redact, `complainedRecipients`
  can name every recipient of that message on the complaining domain; LingoLinq user mail is
  one recipient per message (`mail_message` sends one `mail(to: path)` per channel), so in
  practice it names the one recipient.
- Re-enable: candidate A, in `User#process_params` where the new email is assigned
  (`user.rb:2629`): delete `email_disabled` when the email HASH changes (so a case-only or
  whitespace edit to the same mailbox does not re-enable). Candidate B, in `generate_defaults`
  when `email_hash_changed?` for a persisted record: covers every writer, but runs inside
  `bounce_email`'s own save, and if a stored `email_hash` were ever stale (a write that skipped
  callbacks) the flag would be cleared in the same save that set it. Choose A: it is the path
  a user or supervisor takes to fix a typo, it cannot interact with `bounce_email`, and the
  eval-reset writer is not a "fix my address" action.
- PII: logs carry counts and event-type names. No address, no payload, no user ids in logs.
  The settings change is versioned by PaperTrail on `User` (only with whodunnit set; see W1).
- IAM: add a statement to `lingolinq-cloudrun-s3-ses-policy.json` for
  `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:GetQueueAttributes` on
  `arn:aws:sqs:us-west-2:239044785114:lingolinq-ses-events`.
- Env plumbing: per-environment GitHub var `APP_SES_EVENTS_QUEUE_URL` -> runtime
  `SES_EVENTS_QUEUE_URL`, optional, following the existing `V_*` shape check. Production
  only: staging events share the queue, and two consumers would split it.

### Risks and open questions

- Staging-tagged sends land on the same queue (fact 2). The production consumer will apply
  a staging bounce to a production user with the same address. Accepted: a permanent bounce
  is a property of the mailbox, not of the environment.
- First run will drain up to 14 days of backlog (`MessageRetentionPeriod=1209600`). Bounces
  in it are real and will disable users.
- Unresolved: live account-level suppression reasons (needs `aws sesv2 get-account`).

### Tests and the mutation each must fail under

- parser specs per event type -> mutate the bounceType check.
- permanent bounce disables user -> drop the `bounce_email` call.
- transient bounce no-op -> treat all bounces as permanent.
- malformed deleted + counted -> skip delete on malformed.
- unset URL no-op -> remove the guard.
- delete only after success -> delete before handling.
- email change re-enables -> remove the clear.

## Adversarial review of the proposal (adversary agent), and what was done

Each finding re-checked against the code before acting.

- W1 (PaperTrail claim wrong): CONFIRMED `user.rb:44-45`. Fixed: `SesEventsWorker.with_whodunnit`
  sets `system:ses-events` (no PII) and restores the prior value. Reason/timestamp fields not
  added (follow-up).
- W2 (retry wording): the queue default visibility is 30s (phase5 `:53-55` sets none); the
  worker passes 300s on every receive, so a failed message returns on the NEXT run. Comment
  corrected.
- F1 High (complaint -> silent password-reset lockout across every account on the address;
  anyone can register an account with someone else's address; the decision leaned on an
  ASSUMED suppression setting): CONFIRMED `users_controller.rb:843-853`, `user_mailer.rb:9-13`.
  Changed: complaints are counted and deleted, NOT acted on. Owner decision required (Scot)
  before complaints disable anything; check `aws sesv2 get-account` SuppressionAttributes.
  Permanent bounces still disable: that is the brief, and the same lockout applies to them
  (reported as a policy follow-up, not changed: brief item 4).
- F2 (no way back to the same address, no undo, no per-domain cap, no kill switch): accepted
  as follow-ups. Kill switch today = unset the GitHub var and redeploy.
- F3 (the consumer deletes Send/Delivery events, ending the queue's use as the
  LL-42a24ee911 per-message diagnostic record): CONFIRMED. Not changed; documented. Better
  design, follow-up: a second queue subscribed with an SNS filter policy on
  `eventType` in [Bounce, Complaint] (`FilterPolicyScope=MessageBody`), leaving the
  diagnostic queue unread. This also removes F4.
- F4 (throughput: Send+Delivery per mail, so ~500 mails/hour ceiling at 1000 msgs/run):
  PLAUSIBLE, volume unknown. The stale-age alarm catches it; F3 removes it.
- F5 (failures silent): fixed. `perform` raises `HandlingFailed` after the run when any
  message failed, so `run_task` records it and the execution exits 1. DLQ with redrive is a
  follow-up (infra).
- F6 (a repo-scope `APP_SES_EVENTS_QUEUE_URL` falls back into staging/dev): CONFIRMED
  `deploy-cloudrun.yml:164-167`. Fixed: the workflow errors if the var resolves in any
  environment other than `production`.
- F7 (staging complaint disabling a prod account): moot now that complaints are not acted on.
- F8 IAM: `sqs:GetQueueAttributes` kept because the brief asks for it (useful for
  `--check`-style reads); diff the live policy before `create-policy-version` (documented).
  Whether staging's `AWS_KEY` is the prod user: INFRASTRUCTURE.md says nonprod uses
  `lingolinq-app`; NOT verified live.
- F9 (a `StaleObjectError` deferred `update_setting` can re-disable after an email change):
  PLAUSIBLE, narrow (`processable.rb:85-90`). Follow-up.

## Verification

- Red first: the re-enable spec failed for the right reason before the fix
  (`expected: nil, got: true`); the parser/worker specs failed with NameError before the
  classes existed. Self-inflicted error 1: my first two guard specs used a stale in-memory
  user after `bounce_email` and failed for the wrong reason; fixed with `u.reload`.
- Falsification (mutation, run, restore from a scratch copy): every mutation went red.
  M1 remove clear (1 fail), M10 always clear (1), M2 all bounces permanent (3), M7 drop
  not-spam check (1), M8 drop address filter (2), M3 drop bounce_email (3), M4 keep
  malformed (1), M5 drop URL guard (2), M6 delete before handling (2), M9 not scheduled (1),
  N1 complaints disable (3), N2 no raise on failure (1), N3 no whodunnit (1).
  Self-inflicted error 2: M11 (remove the batch limit) turned `perform` into an infinite
  loop against a stub that always returns a message; the run hung and I killed it. That
  proves the limit is load-bearing but the spec cannot fail cleanly on it (it hangs).
  Two errors -> stopped widening scope per Rule 13.
- Final runs: new and touched specs (`ses_event_spec`, `ses_events_worker_spec`,
  `scheduler_spec`, `user_mailer_spec`, `ses_configuration_set_interceptor_spec`,
  `user_spec`): 531 examples, 0 failures, 10 pending (all pre-existing "Not yet
  implemented"/Typhoeus pendings).
- `scripts/gcp/ses-reputation-alarms.sh`: `bash -n` clean; `--dry-run` prints the five AWS
  calls and calls nothing; missing recipient exits 2. Not run against AWS. shellcheck is not
  installed here.

## GCP log-based alert for the #1117 `[inactivity sweep] mail stopped` line

Not added. The existing pattern (`prod-scheduler-liveness-alert.*`) is a metric-absence
policy on a Cloud Run system metric with a committed JSON plus `--check`/`--apply`; a
log-match policy is a different condition type, and the line it would match is not on
develop. Follow-up after #1117 merges: a `conditionMatchedLog` policy on
`textPayload:"[inactivity sweep] mail stopped"` for the scheduler job, in the same
JSON + `--check`/`--apply` shape, on the same proven channel.

## Follow-ups (owner decisions or separate PRs)

1. Complaint policy (Scot): act on complaints or not; and whether `forgot_password` should
   still send to an `email_disabled` user (it is exempt in `channels_for` but filtered in the
   controller).
2. Filtered bounce/complaint queue (F3/F4), DLQ with redrive (F5).
3. `email_disabled_reason`/`_at`, admin clear action, per-domain cap, runtime kill switch (F2).
4. `gem 'aws-sdk-sqs', '~> 1'` as a direct Gemfile entry (today it is transitive via
   aws-sdk-rails 3.13.0).
5. The #1117 log-based alert above.
