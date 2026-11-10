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

---

# 2026-11-09 continuation: #1145 email items, owner decisions applied

Develop merged in (`d6415147c`; two keep-both conflicts in `scheduler_spec.rb` and the
2026-10 learnings archive). Post-merge: SES, scheduler and user specs 495 examples, 0 failures.
This branch now carries the "Email delivery" section of #1145 only; the other #1145 sections go
to their own branch afterwards (owner decision, 2026-11-09). Their triage is recorded at the end.

## Owner decisions (Traci, 2026-11-09)

1. Complaints: count only (unchanged; follow-up 1 closed as decided).
2. Password reset: always send reset mail to a user whose email was disabled.
3. Inactivity sweep: an `email_disabled` account proceeds on the normal schedule, and each notice
   that was not sent is recorded.

## Learnings consulted

archive 2026-10 "`email_disabled` blocks password reset" (this branch's own entry) and "User settings
writes from scheduled code are not versioned unless whodunnit is set". Applied to A below.

## Fact sheet (on this branch at `d6415147c`)

A. Password reset
- (a) CONFIRMED the only read that blocks reset mail is `users_controller.rb:902`
  (`not_disabled_users = users.select{|u| !u.settings['email_disabled'] }`), before
  `generate_password_reset` (:903). The mail itself is not gated: `UserMailer#forgot_password`
  (`user_mailer.rb:89-93`) -> `mail_message` (`mailers/concerns/general.rb:4-13`) ->
  `channels_for('forgot_password')`, which returns `[named_email]` regardless (`notifiable.rb:14-15`).
- (b) CONFIRMED writers of `settings['email_disabled'] = true`: `UserMailer.bounce_email`
  (`user_mailer.rb:8-14`, called only by `SesEventsWorker` on this branch) and
  `DemoDistrict::Seeder.disable_email!` (`lib/demo_district/seeder.rb:239-246`). Clearer:
  `User#process_params` on a different address (`user.rb:2750-2755`, this branch). Shapes: absent,
  `true` from a bounce, `true` from the demo seeder. Nothing records which.
- (c) CONFIRMED the demo seeder relies on the reset block: its comment (`seeder.rb:232-234`) names
  `forgot_password` as a reader, and it drops `password_resets` in the same write. Demo accounts are
  shared logins on `@demoschooldistrict.org` (`DemoDistrict.demo_email?`). "Always send" as worded
  would let anyone request a reset link for a shared demo login, mailed to that domain.
- CONFIRMED `update_setting` accepts a hash and writes each key (`processable.rb:68-78`).

B. Inactivity sweep
- (a) CONFIRMED the notice is skipped at `general.rb:8` via `channels_for(caller label)` ->
  `[]` when `email_disabled` (`notifiable.rb:17-18`); `general.rb:6` also skips a blank address.
  `deliver_message` (`general.rb:28-35`) then delivers nothing and raises nothing, so the sweep
  (`subscription.rb:1362-1366`) treats the step as sent: no rescue, the step stands, and
  `mail_accepted` is set (:1415-1418).
- (b) Shapes at send time: address present and enabled (sent), `email_disabled` (skipped), blank or
  non-email address (skipped, documented as intended at `subscription.rb:1517-1521`).
- (c) CONFIRMED the existing durable record for a notice-less step is an AuditEvent
  `inactivity_step_kept_without_notice` (`subscription.rb:1384-1387`), asserted in
  `subscription_spec.rb:2580-2597`. Settings on the row are erased when the account is flushed, so a
  settings-only record would vanish exactly when it is needed.

## Proposal

A. Candidates
- A1 (chosen): record why email was disabled. `bounce_email` writes `email_disabled_reason: 'bounce'`
  and `email_disabled_at`; `forgot_password` lets a user through when the reason is `'bounce'`. A flag
  with no reason (demo seeder, or any unknown writer) still blocks. `bounce_email` leaves an account
  alone when it is already disabled for another reason, so a demo address can never be turned into a
  bounce one. `process_params` clears the reason and timestamp with the flag. This is also F2's
  `email_disabled_reason`/`_at` follow-up.
- A2: bypass for everyone except `DemoDistrict.demo_email?`. Rejected: couples the reset controller to
  the demo module, and any future disable writer silently opens reset.
- A3: always send (the decision as worded). Rejected: regresses demo account isolation (fact A c).
- Tests: controller, bounce-disabled user gets `schedule_delivery(:forgot_password, [id])` (mutation:
  keep filtering every disabled user -> red); existing `users_controller_spec.rb:1950` (no reason ->
  blocked) stays unchanged and goes red under "bypass every disabled user". Mailer, `bounce_email`
  writes the reason; leaves a reason-less disabled account untouched (mutation: overwrite -> red).
  User, email change clears reason and timestamp (mutation: clear flag only -> red).

B. Candidates
- B1 (chosen): after a notice that went through without error, when the account is `email_disabled`,
  write AuditEvent `{'type' => 'inactivity_notice_not_sent', 'user_id' => gid, 'step' => mail,
  'reason' => 'email_disabled'}` (ids only, same shape as the kept-without-notice event). The step and
  schedule are unchanged.
- B2: a settings key on the row (`last_inactivity_notice_unsent`). Rejected: erased at flush, and it
  would have to join `inactivity_step_fields`/undo bookkeeping.
- Tests: warning step and deletion step for an `email_disabled` account each write one event and keep
  the step (mutation: drop the audit -> red); an enabled account writes none (mutation: audit always ->
  red).

Risks and unresolved questions
- Blank-address accounts are also skipped silently and are far more numerous (most communicators).
  Not recorded here: the decision named `email_disabled`. Question for the owner.
- An unsent notice still sets `mail_accepted`, which releases held SES rejections (:1415-1418) although
  nothing reached SES. Pre-existing for blank addresses; not changed here. Question for review.
- Production rows with `email_disabled` and no reason, from before this branch, keep blocking reset.
  `bounce_email` has had no caller, so none should be bounce rows; not verified live.

## Adversarial review of the A/B proposal (adversary agent, at `d6415147c`) and what was done

Each finding re-checked before acting.

- High (demo logins can end up 'bounce' and open reset to an unregistered domain): mechanism CONFIRMED
  in code, but the production path is moot: demo districts are created only in a nonprod migrate job
  (`lib/demo_district.rb:130-131`) and the consumer runs only in production (prod-only queue URL), so
  `bounce_email` never meets a demo user. Applied anyway as defence in depth: the seeder writes
  `email_disabled_reason: 'demo'`, overwriting any other reason, and no longer skips a row whose reason
  is not 'demo'. CONFIRMED separately: `demoschooldistrict.org` has no DNS record here (`getent hosts`
  empty); reported to the owner as its own issue (register it, or move seeds to a reserved domain).
- Medium (SES account-level suppression may drop the reset mail): cannot be checked here (no `aws`
  CLI). Not a blocker: A1 is no worse than today. Added to the rollout checklist:
  `aws sesv2 get-account --query SuppressionAttributes`; if BOUNCE is suppressed, decision 2 needs an
  owner follow-up (removing an address from the list from an unauthenticated endpoint is its own
  risk).
- Medium (B1 decided from the stale batch copy; `mail_accepted` set by notices that never went out):
  CONFIRMED (`user.rb:2223-2232` copies only written keys; NullMail delivers nil, actionmailer
  `base.rb:653,658-669`). Changed: the skip reason is read from the fresh locked row through one shared
  predicate, `Notifiable#mail_skip_reason` (same address check and `channels_for` that `mail_message`
  uses); an unsent notice is audited with its reason. (Not done: gating `mail_accepted` on a sent notice
  needs owner approval, see "A and B landed".) Decided from the
  predicate, not `deliver_message`'s return value, because existing specs stub `deliver_message` with
  blocks that return nil. Blank-address accounts are recorded too (`no_address`): same fact, at most 3
  rows per account per cycle. Remaining gap: an `InvalidParameterValue` swallowed by `deliver_message`
  (`general.rb:32-34`) is still treated as sent; it logs `SES delivery failed`, which the new log alert
  covers.
- Low (bounced users now reach `generate_password_reset`'s bare save, lost-update race with an email
  change): PLAUSIBLE, same race every enabled user already has. Accepted, noted.
- Low (`email_disabled_at` churn): applied, written only on the absent-to-true transition.

## A and B landed

- A: `6997ac4b1`. Falsified: M1 bypass every disabled user (2/2 red), M2 block every disabled user
  (2/2), M3 overwrite an existing reason (2 red), M4 clear only the flag (1), M5 seeder skips any
  disabled row (1), M6 seeder writes no reason (2). Touched files: 985 examples, 0 failures.
- B: `7016748db`. Falsified: B1 no audit (3 red), B2 audit always (2), B3 decide from the batch copy
  (1), B4 wrong step (1), B5 predicate ignores email_disabled (2). Every spec file that reaches the
  mail gate: 1473 examples, 0 failures.
- Trace to the read: `forgot_password` decides at `users_controller.rb:905` before
  `generate_password_reset`; the sweep's `skip_reason` is read from the locked row and the audit sits on
  the only path where delivery raised nothing (the rescue branches `next` or `break` first).
- Not done, needs owner approval (Rule 14): gating `mail_accepted` on an actually-sent notice. The
  existing example "counts rejections once a message in the run was accepted"
  (`subscription_spec.rb`, `describe "every message rejected"`) uses a no-address account as its
  accepted message, so that fix would change an existing test's fixture.

## Infra proposal (C send errors, D the #1117 alert, E filtered queue and DLQ)

Facts
- CONFIRMED app send-failure log lines: `[inactivity sweep] mail stopped for this run: ...`
  (`subscription.rb`, the `mail_stopped` branch) and `Mailer <Class>.<method> SES delivery failed`
  (`mailers/concerns/general.rb:33`, the only error `deliver_message` swallows). Other delivery errors
  raise into the Resque job.
- ASSUMED, supported: Rails logs reach Cloud Logging as `textPayload` (plain `ActiveSupport::Logger`
  to STDOUT, `production.rb:116-119`; `dedupe-utility-boards-dryrun.sh:151` reads the job's
  `textPayload`). Not checkable here (no gcloud); the new script's `--check` cannot prove it either, so
  the doc says to confirm with one `gcloud logging read` before relying on it.
- CONFIRMED the proven GCP channel and policy-as-JSON pattern: `prod-scheduler-liveness-alert.{json,sh}`.
- CONFIRMED the events queue is subscribed without raw delivery and without a filter
  (`phase5-ses-config-set-setup.sh` step 5), carries SEND and DELIVERY for every mail, and the worker
  deletes all of them (F3), capping throughput at about 500 mails/hour (F4).
- CONFIRMED the worker re-receives a failed message on the next hourly run (visibility 300s) and
  raises `HandlingFailed`; there is no DLQ (F5).

C/D. One GCP log-match alert policy, `PROD email sending failed`, committed as JSON with a
`--check`/`--apply` script in the liveness script's shape: condition `conditionMatchedLog` on
Cloud Run (`cloud_run_job` or `cloud_run_revision`) `textPayload` containing either line above;
`notificationRateLimit` 1h, `autoClose` 7d, the same channel and `DELIVERY_PROVEN_AT` check. No label
extractors, so no log text is copied into the notification. Covers the #1117 follow-up and the
"send errors" half of the #1145 alarm item. Alternatives: an AWS/SES `Send` volume absence alarm
(rejected: prod has no regular volume yet, it would fire daily); a Reject-count alarm (rejected: Reject
is virus-scan rejection only, not an outage signal). The shared helpers (exact-name policy lookup,
semantic diff, channel check) go in `scripts/gcp/lib/alert-policy.sh`; the liveness script is NOT
moved onto it here (a proven control, not re-provable without gcloud), noted as a follow-up.

E. `scripts/gcp/ses-feedback-queue-setup.sh` (`--dry-run`/`--apply`/`--check`), idempotent like
phase5: DLQ `lingolinq-ses-feedback-dlq` (14 days, SSE-SQS); queue `lingolinq-ses-feedback` (14 days,
SSE-SQS, `RedrivePolicy` maxReceiveCount 5 = five hourly runs); queue policy for the existing topic;
subscription to `lingolinq-ses-events` with `FilterPolicy {"eventType":["Bounce","Complaint"]}`,
`FilterPolicyScope=MessageBody`, raw delivery off (the worker's `SesEvent.unwrap` handles the
envelope). The worker reads the new queue (env var value only, no code change); the original queue
is left unread, so it is again the LL-42a24ee911 per-message record. IAM mirror resource moves to the
new queue ARN. `ses-reputation-alarms.sh`: the stale alarm moves to the new queue, plus
`lingolinq-ses-feedback-dlq-visible` (ApproximateNumberOfMessagesVisible >= 1 on the DLQ). Docs and
rollout order updated. Alternative: add the filter to the existing subscription (rejected: ends the
diagnostic record F3 is about).

Verification possible here: `bash -n`, `--dry-run` output, `jq` validation of the policy JSON. Not
possible: any live apply or check.

## #1145 triage for the follow-up branch (develop `084552a6b`, three read-only subagents, 2026-11-09)

Subagent findings, CONFIRMED by them with `file:line`; not yet re-verified by me. Numbers follow the
issue's order within each section.

- Inactivity sweep: 1 activity clock moved by non-use writes (L, migration), 2 lock released before
  flush (M), 3 transient timeout resends mail (M), 4 stale `inactivity_deletion` record after password
  sign-in (PARTLY: harm not reproduced; S), 5 stale spec comment (S), 6 long comment line (S). All open.
- Rooms and supervision: 7 legacy link stamped `origin='room'` (M; the issue's suggested fix cannot
  work as written), 8 concurrent last-two unlinks keep supporter role (S-M), 9 cycle unlink deadlock (M),
  10 `room_member_removal` rows for every room (S), 11 `remove_as_member` NoMethodError on a destroyed
  org (S), 12 `lookup_key` in audit: ALREADY FIXED by #1162 (`6b8d3abca`; old rows remain, owner
  decision per the issue comment), 13 deleted district's lessons served until cleanup finishes (PARTLY, S).
- Board access and caching: 1 chain walk uncapped (M), 2 author stamp moved with no deep share (S),
  3 whole row loaded (S), 4 truncated-home sharees not expired (M), 5 pending deep sharee spec missing
  (S), 6 depth-5 re-track limitation (L), 7 org home-board keys race (M). All open.
- Uploads: 8 first-run thumbnail delete keeps no retry row (S), 9 daily full sweep for 3 months (M),
  10 purge keyed on `created_at` (S-M). All open.
- Frontend offline revocation: 1 snapshot mark not cleared (S-M), 2 and 3 import and call placement
  (S; need a human-approved `.eslint-todo` re-baseline; two more bottom imports in the persistence
  files), 4 supervisee cap of 10 hides removals (M, backend plus frontend). All open.
- Most items touch deletion, permissions, visibility or sync, so they need /fix-proposal. Quick wins
  without it: sweep 5, 6; rooms 10, 11, 13; boards 5.

## Adversarial review of the infra proposal (adversary agent, at `7016748db`/`813c50d58`) and what was done

- High (filter missed the Resque worker pool): CONFIRMED (`deploy-cloudrun.yml:1246`,
  `PHASE5-CUTOVER-RUNBOOK.md:987`). Added `cloud_run_worker_pool`.
- High (most queued-mail failures log nothing): CONFIRMED (`general.rb:32-34`, `lib/worker.rb:8-13`,
  no Resque logging or Sentry integration). Not fixed here: a job-failure log line is app code on every
  job. The alert and INFRASTRUCTURE.md say plainly what it does not cover. Proposed to the owner as its
  own change.
- Medium (stale alarm blind to a repeatedly failing message; `--check` ignored dimensions): applied.
  DLQ alarm added, alarm text corrected, `--check` compares dimensions (JMESPath expression tested with
  the Ruby `jmespath` gem: one dimension and none).
- Medium (rollout loses the old queue's backlog; IAM move gives one AccessDenied run): applied. IAM
  lists both queues; rollout drains the old queue first, then switches, then drops the old ARN.
- Medium (no DLQ runbook): applied (`start-message-move-task`), and maxReceiveCount raised from 5 to 24.
- Low (SNS delivery failures unwatched): applied (`NumberOfNotificationsFailed` alarm; `--check` verifies
  the queue policy, filter scope, filter and raw delivery).

Commits: `af79f6580` (queue, DLQ, alarms, IAM, docs), `d998f5602` (GCP log alert). Verification: `bash -n`
on every script, `--dry-run` output, JSON validated, usage and bad-argument exits. Nothing applied; no
live `--check` was possible (no `aws`, `gcloud` or `jq` on this machine).

## Open follow-ups (2026-11-09)

1. Owner approval needed (Rule 14): gate `mail_accepted` on a notice that was actually sent; changes the
   fixture of "counts rejections once a message in the run was accepted".
2. Owner decision: a PII-free log line for failed Resque jobs (exception class and job class only), so
   the send-failure alert covers queued mail.
3. Owner action: `demoschooldistrict.org` is unregistered (no DNS record). Register it or move the demo
   seeds to a reserved domain.
4. Rollout step 3: read the SES suppression setting before relying on the reset for bounced users.
5. Still open from F2: an admin action to clear `email_disabled` (UI), a per-domain cap and a runtime
   kill switch for the consumer; F9 (a deferred `update_setting` re-disabling after an email change);
   `aws-sdk-sqs` as a direct Gemfile entry (shared config: propose first).
6. Move `prod-scheduler-liveness-alert.sh` onto `scripts/gcp/lib/alert-policy.sh` when its `--check`
   can be re-run live.

## Senior-dev review (/review-pr, fresh agent on the preflight DIFF_FILE)

REVIEWED=range 084552a6bcd2c59c1386f93b0637b6251674eede (084552a6bcd2c59c1386f93b0637b6251674eede) ... HEAD (643c86deb2e10b97fe118cd694c48dd860cbe30d) in /home/tracid/LingoLinq-AAC-ses
Verdict: Approve with comments (no Critical or High). Done:
- Medium, email change cleared the flag for every reason (a demo login could become resettable): the
  clear now runs only for reason 'bounce'; red-first spec in `user_spec.rb`.
- Medium, `bounce_email` ignored a failed `update_setting`, so the worker deleted an unapplied bounce:
  raises `UserMailer::BounceNotSaved` (a deferred 'pending' write counts as done); red-first specs.
- Medium, resets to dead mailboxes can cost reputation if BOUNCE is not suppressed: rollout step 3 is now
  a gate with the owner (resets are capped at 6 per account per window, `passwords.rb:22`).
- Medium, this log contradicted the code on `mail_accepted`: corrected.
- Low: stale comments in `ses_event.rb` and `user_spec.rb`; seeder drops a bounce's `email_disabled_at`;
  `--email` with no value now exits 2 with a message. Not done: the JMESPath email filter (operator input),
  SNS signature verification (queue policy limits SendMessage to the topic), scheduler spec depth.

## Adversary review of the final branch (/adversary-review, at `dc6e95640`)

- High (forged bounce from any principal in the account allowed to publish to the topic; the consumer
  trusts any well-formed event): PLAUSIBLE, live policy not readable here. Applied the counter-measure,
  which makes the question moot: `ses-feedback-queue-setup.sh` merges a topic-policy Deny on
  `SNS:Publish` unless `aws:SourceArn` is the configuration set, and `--check` asserts it. Rollout step 1
  now confirms SES events still arrive after it.
- Medium (a bounce write moved `updated_at`, the sweep's activity clock, so the sweep's own bounced
  warning pushed deletion back 12 months or cancelled a schedule): CONFIRMED red first (`updated_at`
  moved 13 months). `bounce_email` writes through `User.update_settings_locked(touch: false)` and reads
  the row back to confirm the flag landed (it raises `BounceNotSaved` otherwise). This also removes the
  deferred 'pending' path, so the write is always versioned under the worker's whodunnit (the Low).
  Self-inflicted error 1: I first detected a failed save with `changed?`, which the in-place settings
  mutation does not reliably show; the spec caught it and the read-back replaced it.
- Medium (bounced recipients not checked against the mail's recipients; a DSN's Final-Recipient is
  written by the bouncing server): applied. Addresses not in `mail.destination` are dropped; none left
  -> ignored as `Bounce:Mismatch`. Red-first specs in `ses_event_spec.rb`.
- Low, subtypes from SES heuristics (`EmailValidationSuppressed`) also disable: not changed (the brief
  disables every Permanent subtype); follow-up if SES auto-validation is ever turned on.
- Low, `--check` claims more than it checks: wording narrowed in `ses-feedback-queue-setup.sh`;
  `ses-reputation-alarms.sh --check` still compares namespace, metric, threshold, statistic, actions and
  dimensions only (noted).

## Owner decisions, 2026-11-09 (second round) and what was done

- `mail_accepted` (approved): a skipped notice no longer releases held SES rejections. The existing
  example "counts rejections once a message in the run was accepted" now uses an account with an address
  (owner-approved fixture change); new example "does not take a notice that was not sent as an accepted
  message" failed first. Falsified: dropping `|| skip_reason` turns it red. Subscription spec 256/0.
- Job-failure log line (approved): `lib/job_failure_log.rb`, a Resque `on_failure_log` hook extended by
  `Worker` and `SlowWorker` (Resque runs every `on_failure*` class method from `Job#fail`), logging
  `[job failed] <class> . <method>[ (<mail type>)] <error class>` and nothing else. Loaded with
  `require_relative` like `lib/legacy_links.rb`. The GCP alert also matches it for mailers. Specs run
  the hook through a real `Resque::Job#fail`. Self-inflicted error 2: my new spec first expected hook
  names as symbols (Resque returns strings). With two errors this session, I stopped after this unit
  (Rule 13).
- Found, unrelated and pre-existing: the app does not boot with `RESQUE_WORKER=true` on develop either
  (`config/environment.rb:33`, `uninitialized constant AppSearcher`), so that setting is unused in
  production. Not changed here.
