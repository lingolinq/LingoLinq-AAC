# SMS texting: handoff to Melissa

**Status:** ready to start. App-side work has NO AWS dependency and can begin today.
**Author:** Scot (via Claude), 2026-09-04.
**Read with:** `2026-09-03_sms-optin-stop-help-gaps.md` (the original proposal, now
partly superseded, marked BLOCKED) and `2026-09-03_sms-dual-review-findings.md`
(21 findings from a two-reviewer pass, the authoritative record).

## The one-paragraph version

Two-way texting was never provisioned anywhere: no phone number, no registration,
and until last week the app's IAM identity could not even call `sns:Publish`. It
looks configured because `SMS_ENCRYPTION_KEY` is set on all 8 services, but that is
only a hashing salt, not a credential. Before it can be turned on, the recipient of
a text needs to consent for themselves, which the app has never asked for, and a
latent argument-order bug would let one STOP disable texting for every user on the
platform. Scot has decided on a redesign. **The app work is buildable now and blocks
the AWS work, not the other way round.**

## Decisions already made. Please do not reopen these.

| Decision | Made by | Consequence |
|---|---|---|
| The RECIPIENT opts in for themselves | Scot, 2026-09-04 | An account holder ticking a box on someone else's behalf is not consent under TCPA/CTIA and is what carrier vetting rejects. |
| Consent is collected on a WEB PAGE, not by texting the recipient | Scot, 2026-09-04 | No text is ever sent to a number that has not consented. Also means this whole flow is buildable with zero AWS access. |
| AWS and the carrier own STOP and HELP. Self-managed opt-outs stays OFF. | Scot, 2026-09-04 | The app writes NO keyword handling. See "the trap" below. |
| No grandfather clause for contacts predating consent | Scot, 2026-09-03 | The guard blocks unconditionally. No migration, no backfill, no `created_at` comparison. |

**Two AWS settings that sound like one, and are not.** Two-way SMS must be **ENABLED**
(it is what delivers ordinary replies back to the app, which is the entire feature).
Self-managed opt-outs must stay **OFF** (so AWS answers STOP/HELP itself). With that
combination, normal inbound messages still reach `RemoteTarget.process_inbound`;
only keywords are intercepted upstream and never seen by us.

## The trap. Please read this before touching `remote_target.rb`.

`RemoteTarget.canonical_target(type, target_str)` is called with its arguments
**reversed** at exactly two sites, and they are precisely the two implementing the
STOP block list:

```
app/models/remote_target.rb:137   canonical_target(<phone>, 'sms')   REVERSED
lib/pusher.rb:13                  canonical_target(<phone>, 'sms')   REVERSED
lib/pusher.rb:17                  canonical_target('sms', <phone>)   correct
```

Both reversed calls fall into the `else` branch at `remote_target.rb:73-75` and
return the literal string `'sms'`. So `block_cell!('sms')` and `blocked_cell?('sms')`
match each other, and one STOP from any single person would suppress outbound SMS for
every user on the platform. There is no unblock method anywhere in the codebase.

**Do not fix this by swapping the arguments.** It reads like a one-line correction
and the correction is wrong. Because opt-out on a US toll-free number is managed at
the carrier level, `Setting.blocked_cells` is a second, competing opt-out list. It is
append-only (`app/models/setting.rb:63-68`, no delete path), and AWS honors START and
UNSTOP to re-opt someone in, which we never see. Repairing the arguments makes that
divergent list *work*, permanently suppressing people who have lawfully opted back
in. Broken it does nothing; fixed it does the wrong thing forever.

**Delete the write at `app/models/remote_target.rb:136-138`, and delete the check at
`lib/pusher.rb:13-15`.** AWS will not deliver to an opted-out number regardless, so
the carrier is the single authority. If we later want defensive suppression, source
it from AWS `describe-opted-out-numbers`, never from our own table.

Note also that CTIA revocation became cross-campaign on 2026-04-11: a STOP against
one message type must apply to every automated message type from the same sender.
That is another reason to have exactly one opt-out authority rather than two.

## What to build

### 1. The consent record

**Do not hang consent off the contact hash in `user.settings['contacts']`.** This was
the original proposal and the dual review refuted it. `Utterance#deliver_message` has
**two** callers:

- `app/models/utterance.rb:212` via `deliver_to`, which passes `contact['cell_phone']`. A contact exists.
- `app/models/user.rb:4229` via `handle_notification('utterance_shared')`, where `pref` comes from `settings['preferences']['share_notifications']`. **No contact exists on this path at all**; `utterance.rb:273-274` falls through to `recipient_user.settings['cell_phone']`.

A contact-keyed guard therefore either fails open on the second path, or fails closed
and silently kills text notifications for every supporter who chose that preference.
There is no third outcome.

**Key the consent on the phone number itself, in its own table**, so the guard works
on every path because it keys on the value the send actually reads.

Use the existing hashing primitive rather than a new one. `RemoteTarget.salted_hash`
(`app/models/remote_target.rb:56-59`) as a CLASS method defaults its salt to
`ENV['SMS_ENCRYPTION_KEY']` and its ref to `'global'`, which gives a stable,
globally-keyed digest you can look up by. Two cautions:

- Canonicalize first, with `RemoteTarget.canonical_target('sms', number)`, arguments in that order.
- **Do NOT copy the per-row `salt` column pattern from `remote_targets`.** Storing a row's own salt beside its hash is what makes those rows recoverable by exhaustive search, and it is now an open register finding (`LL-cb9f9c865a`). Use the global key and store no per-row salt.

Record at minimum: the hashed number, the state, the timestamp, the request IP, and
**the version of the disclosure text that was displayed.** The version is what turns
a boolean into evidence. If the wording changes later you must still be able to say
what each person actually agreed to.

Write an immutable `AuditEvent` (`app/models/audit_event.rb`) alongside it. PaperTrail
cannot serve as the audit trail here because `settings` is `secure_serialize`d and
`reify` raises on it.

### 2. The consent page

Model the link on the existing no-login primitive rather than inventing one:
`config/routes.rb:104` maps `get 'u/:reply_code'` to
`BoardsController#utterance_redirect` (`app/controllers/boards_controller.rb:56-65`),
which parses a nonce, enforces a 7-day expiry, and redirects into an Ember route with
no session required. The consent link should follow that shape.

The page must display, and the recorded disclosure version must capture:

- who is asking, by name, and that the messages come from their communication device
- message frequency, stated honestly
- "Message and data rates may apply"
- links to Terms and Privacy Policy
- "Reply STOP to opt out, HELP for help"
- a field where the recipient confirms their own number
- an explicit, unchecked-by-default agreement checkbox

**A screenshot of this page is the `optInImage` the toll-free registration requires**,
so building it is what unblocks the AWS filing. That is why this is first.

i18n: every string is user-facing, so double quotes with a translation key, and the
page is served unauthenticated, which means `es.yml` needs the same keys. The Article
50 notice was caught by exactly this gap before; the guard spec pins `en.yml` only.

Feature flag: this is a genuinely new user-facing capability, so it needs one per the
repo convention.

### 3. The guard

Place it at **`app/models/utterance.rb:273`**, immediately after `cell` is resolved at
`:274`, keyed on the resolved `cell` value.

It must sit **before `RemoteTarget.find_or_assert` at `:288`**, not merely before the
`Worker.schedule_for` at `:301`. Between those two points the code writes
`last_outbound_at = Time.now` and calls `target.save` (`:292-297`), so a guard at
`:301` still leaves a routing row claiming an outbound message happened.

Write the red test FIRST, before the guard exists, and cover BOTH callers. A test
through `deliver_to` proves nothing about the `user.rb:4229` path. Then falsify it:
revert the guard from a copy you made yourself (never `git checkout`, it destroys
uncommitted work), confirm the test goes red, restore.

**Have the guard record a negative attempt**, something like
`sms_attempts << {pushed: false, reason: 'no_consent'}`. Without it a blocked send
leaves no trace anywhere and affected contacts are unfindable later.

### 4. The silent-failure problem, which is separate and real

The "message sent" note is written **synchronously** in `share_with`
(`app/models/utterance.rb:127-137`), before `deliver_to` is even enqueued at
`:111-115`. So a communicator's own log reads "message sent to Grandma" while the
worker later declines to send it. That is true today for any failed send and the
consent guard makes it reachable far more often. For an AAC user, being told a
message was delivered when it was not is a serious product failure, not a logging
detail. Worth its own fix and its own test.

## AWS tasks

Already done, do not redo: SNS topic `LingoLinqSMSInbound` and IAM policy
`lingolinq-app-sms-send`, attached to group `LingoLinq_app_service`. Verified by
policy simulation, not just by the attach succeeding.

Remaining:

1. **Get the authoritative field list from the API, not from documentation.** The docs pages do not render reliably. Run `aws pinpoint-sms-voice-v2 describe-registration-field-definitions --registration-type US_TOLL_FREE_NUMBER_REGISTRATION`. Note the type string is `US_TOLL_FREE_NUMBER_REGISTRATION`; a similar-looking 10DLC value exists and is not this one.
2. Request a toll-free number.
3. File the registration, using the consent-page screenshot as `optInImage` (PNG/JPG/PDF, 500 KB max).
4. Confirm two-way SMS ENABLED and self-managed opt-outs OFF, and record that you confirmed it. No code asserts this setting, so it is invisible from the repo.
5. Subscribe the SNS topic to `POST /api/v1/callback` (singular, `config/routes.rb:161`).
6. Open the support case to exit the SMS sandbox.
7. Raise the monthly spend limit, which is still at the untouched $1 default.
8. Set `SMS_ORIGINATORS`, `SNS_ARNS` and `SNS_REGION`. They are absent from all 8 services. **On Cloud Run, `--set-env-vars` replaces the entire environment**, so use `--update-env-vars` or you will silently drop the other ~45 variables.

## Sequencing

The dependency runs app-first, which is the opposite of what it looks like:

```
consent page  ->  screenshot  ->  registration  ->  number  ->  sandbox exit  ->  send path
   (no AWS)                          (Melissa, AWS)                              (app + AWS)
```

Steps 1 through 3 of "What to build" need no AWS access at all. Do them first.

## Please do not walk into these

Each was confirmed against live code during the review.

- `lib/pusher.rb:10-11` recurses for comma-separated numbers and **drops** `origination_number`, and turns a blocked child's `[]` into `nil`. Also, `user.rb:2953` preserves commas in `ref`, so one contact can fan out to N recipients under one consent record. Per-number opt-in is a hard carrier requirement, so commas need rejecting at entry.
- `lib/pusher.rb:26` sets `MaxPrice` to `"1.0"`, a dollar per message, with no per-user rate limit. The $1 monthly account cap is currently doing all the work and is the first thing removed at go-live.
- `app/models/remote_target.rb:143-152` assigns `res = LogSession.message(...)`, never checks it, and returns `true` regardless. `log_session.rb:1261` returns false when `device` is nil, and `device: sharer.devices[0]` is nil whenever the sharer has no device. The message is discarded, `{handled: true}` is rendered, and SNS never retries. Three of five `process_inbound` specs mock `LogSession.message` while passing `device: nil`, so they pass against this bug.
- `record.data['sms_attempts']` is written at `utterance.rb:305-311` and read **only** in specs. Nothing dedupes, and `deliver_to` is itself a queued job, so a requeue re-enqueues the send.
- `app/frontend/app/controllers/organization/extras.js:36` reads `res.emails` while `organizations_controller.rb:779` renders `{cells: ...}`. Moot once the block list is deleted, but note the endpoint returns the list over the wire regardless of what the UI renders.
- The original proposal cites `add_contact` at `user.rb:2785-2818`. **Those citations do not resolve.** There is no such Ruby method; it is an action string handled inline at `user.rb:2937-2971`, with contact type inferred at `:2944` by the presence of `@` alone and no validation.

## Two register findings that overlap this work

Both are filed, open, and NOT gated on SMS provisioning. Neither is yours to close.

- `LL-cb9f9c865a` — `RemoteTarget` is missing from `lib/flusher.rb`'s deletion sweep, and the rows keep the hash beside its own salt. Relevant because your consent table must not repeat the pattern.
- `LL-a8351c5b00` — `PiiScrubber`'s `LOG_PHONE_PATTERN` (`lib/pii_scrubber.rb:37`) never matches E.164, which is exactly the format `Pusher.sms` normalizes to. Relevant because SMS will generate the one shape the log backstop cannot see. Compounds with open finding `LL-fba170716e`, where the SNS callback logs its payload before verifying the signature.

## Still open, and not engineering questions

- **Counsel:** is LingoLinq's use conversational/transactional rather than marketing? CTIA requires double opt-in for marketing programs, and the answer changes what the consent page must say. A student texting a family member is arguably conversational, but that needs a ruling, not an assumption.
- **Counsel:** the FCC one-to-one consent rule took effect January 2026. Does it reach this use case?
- **Scot and counsel:** a communicator may be under 13. The consent here is the *recipient's*, but the *sender* can be a child. Whether that raises anything under COPPA has not been assessed, and it is the kind of thing that is much cheaper to answer now than after launch.

## Repo conventions

Branch from `staging`, target `staging`. Name it `melissa/<type>/<kebab>` or
`<type>/melissa-<kebab>`. Node 22. RSpec for backend, QUnit for frontend, both
required. Per RULE #0 item 12, write the candidate fixes down and get them reviewed
**before** editing code; the SMS proposal that preceded this document was blocked in
review precisely because its fixes were designed before they were challenged.
