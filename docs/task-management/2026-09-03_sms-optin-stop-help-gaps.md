# SMS opt-in, STOP/HELP and the global block-list bug

**Status:** PROPOSAL. No code written. Per RULE #0 item 12, these fixes go through
adversarial review before anything is edited.

**Date:** 2026-09-03
**Author-Model:** opus-5
**Branch:** `scot/fix/sms-keyword-handling`, cut from `origin/staging` at
`cf5004909` on 2026-09-03. This doc was drafted while on
`scot/compliance/audit-findings-2026-09-01` and moved here because it is
unrelated to that branch's work.

**Status:** PROPOSAL. Per RULE #0 item 12, nothing in `app/` or `lib/` is edited
until this has been through adversarial review. Findings 1 and 2 are High and so
need two independent reviewers (RULE #0 item 14.5).

---

## Why this exists

Two-way SMS has never been provisioned (see the status section of the messaging
reference page). Turning it on requires an AWS End User Messaging registration,
and both the toll-free and 10DLC forms have REQUIRED fields we cannot answer
truthfully today:

| Required form field | What our code actually does |
| --- | --- |
| `optInType` (VERBAL / DIGITAL_FORM / PAPER_FORM / TEXT / QR_CODE) | Nothing. No consent is recorded anywhere. |
| `campaignInfo.stopMessage` / `messagingUseCase` opt-out description | We send no reply to STOP. |
| `campaignInfo.helpMessage` | HELP is not handled at all. |

Verified against the live field definitions on 2026-09-03 via
`aws pinpoint-sms-voice-v2 describe-registration-field-definitions`. There is no
"no opt-in" option on either path.

While tracing that, a fourth and more serious defect turned up. It is listed
first because it is the only one that is a live bug rather than a missing
feature.

---

## Findings

| # | Finding | Severity | Live today? |
| --- | --- | --- | --- |
| 1 | One STOP from any person disables outbound SMS platform-wide, permanently | **High** | Latent (SMS unused) |
| 2 | STOP matching is one exact case-sensitive string; HELP absent; no auto-replies | Medium | Latent |
| 3 | No consent is recorded when a phone contact is added | Medium | Latent |
| 4 | A STOP message is filed into the communicator's inbox as if it were speech | Low | Latent |

All four are latent only because `remote_targets` has zero rows in every
database and no origination numbers exist. They become live the moment SMS is
provisioned.

---

## Finding 1: the block list is global, not per-number

### Three facts

**(a) Where is the value actually READ?**

`lib/pusher.rb:13`, inside `Pusher.sms`, before the SNS publish is constructed:

```ruby
if Setting.blocked_cell?(RemoteTarget.canonical_target(phone, 'sms'))
  return []
end
```

It is written at `app/models/remote_target.rb:137`:

```ruby
Setting.block_cell!(RemoteTarget.canonical_target(opts['originationNumber'], 'sms'))
```

CONFIRMED, both lines read directly.

**(b) What are ALL the shapes this can hold?**

`RemoteTarget.canonical_target(type, target_str)` is defined at
`app/models/remote_target.rb:61` and normalises `target_str` **only when `type`
is the string `'sms'`**; otherwise it returns `target_str` unchanged.

Both call sites above pass the arguments in the wrong order: the phone number
lands in `type`, and the literal `'sms'` lands in `target_str`. So
`type.to_s == 'sms'` is false, the `else` branch runs, and both calls return the
literal string `'sms'`.

Net effect:

- `block_cell!('sms')` sets `blocked_cells['sms'] = true`
- `blocked_cell?('sms')` reads that same key

They are reversed *identically*, so they match each other. The block list holds
exactly one key that is not a phone number, and it is a global kill switch.

**One person texting STOP stops outbound SMS for every user on the platform.**

CONFIRMED. Argument order checked at all eight call sites:

```
remote_target.rb:30   canonical_target(self.target_type, val)      correct
remote_target.rb:80   canonical_target(type, target_str)           correct
remote_target.rb:117  canonical_target(type, target_str)           correct
remote_target.rb:123  canonical_target(type, target_str)           correct
remote_target.rb:127  canonical_target(type, source_str)           correct
remote_target.rb:137  canonical_target(<phone>, 'sms')             REVERSED
pusher.rb:13          canonical_target(<phone>, 'sms')             REVERSED
pusher.rb:17          canonical_target('sms', phone)               correct
```

Note `pusher.rb:13` and `:17` are four lines apart in the same method and
disagree with each other. That is the tell.

**(c) Is this claim about another file TRUE?**

- `Setting.block_cell!` writes into a `blocked_cells` Setting hash and never
  removes a key. CONFIRMED `app/models/setting.rb:63-68`.
- There is **no unblock path anywhere in the codebase**. `blocked_cells` is
  exposed read-only at `app/controllers/api/organizations_controller.rb:774-779`
  and nothing writes a deletion. CONFIRMED by grepping every occurrence of
  `block_cell`, `blocked_cell`, `blocked_cells` and `unblock` across `app/` and
  `lib/`. So the kill switch is also irreversible without a console.

### Candidate fixes

**Option A. Correct the argument order at both sites.** Two-character change per
site.

- Pro: minimal, and it makes the block list do what it was always meant to do.
- Con: it silently changes the shape of stored data. Any existing
  `blocked_cells['sms']` key stays and keeps matching nothing, which is fine, but
  it means the fix is not observable in the data.
- Con: still no unblock path, so a mistaken STOP is permanent (see Option C).

**Option B. Give `canonical_target` a keyword signature** so the order cannot be
got wrong again: `canonical_target(type:, target:)`.

- Pro: prevents recurrence, which matters because the two wrong sites prove the
  positional signature is easy to misuse.
- Con: touches six correct call sites to fix two broken ones, which violates
  "one coherent change per unit" if done in the same commit. Do it as a separate
  follow-up if at all.

**Option C. Option A, plus a START/UNSTOP keyword and a `Setting.unblock_cell!`.**

- Pro: carriers expect a consumer who opted out to be able to opt back in, so
  this is needed for registration anyway.
- Con: larger. Should be its own unit.

**Recommended:** Option A alone, as its own commit. Then Option C as a second
unit. Option B deferred.

**Simplest alternative considered and rejected:** deleting the block check
entirely and relying on the carrier to suppress. Rejected because honoring STOP
in-app is a registration requirement, not a nicety.

### Test and mutation

Test: `spec/lib/pusher_spec.rb`. Block `+15551234567`, then assert
`Pusher.sms('+15559999999', 'hi')` still publishes and
`Pusher.sms('+15551234567', 'hi')` returns `[]`.

Mutation that must make it fail: revert `pusher.rb:13` to the reversed order.
The second assertion then passes for the wrong reason and the first fails,
because every number reads as blocked.

**Weakest passing state check:** a test that only asserts "blocked number does
not send" would pass against the bug, since the bug blocks everything. The test
MUST assert that an *unrelated* number still sends. That assertion is the whole
test.

---

## Finding 2: keyword matching and auto-replies

### Three facts

**(a)** `app/models/remote_target.rb:135-138`:

```ruby
message = opts['messageBody'] || 'no message'
if message == 'STOP'
  Setting.block_cell!(...)
end
```

There is **no early return**. Execution continues to `:139` and the message is
delivered as a note at `:141-148`. CONFIRMED.

**(b)** Reachable shapes of `opts['messageBody']`:

| Input | Current behaviour |
| --- | --- |
| `'STOP'` | blocks (globally, see finding 1) AND delivers as a message |
| `'stop'`, `'Stop'`, `' STOP '` | no block, delivered as a message |
| `'STOPALL'`, `'UNSUBSCRIBE'`, `'CANCEL'`, `'END'`, `'QUIT'` | no block, delivered |
| `'HELP'`, `'INFO'` | no handling, delivered |
| nil or absent | the literal string `'no message'` is delivered |
| anything else | delivered (the intended path) |

**(c)** Carrier requirement, ASSUMED and needing a citation before the campaign
form is submitted: STOP, STOPALL, UNSUBSCRIBE, CANCEL, END and QUIT matched
case-insensitively, plus HELP, each answered with one auto-reply. This comes
from CTIA messaging principles, not from AWS documentation, and I have not
re-read the current CTIA text. **Do not put wording on the registration form
based on this line without checking it.**

### Candidate fixes

**Option A. Normalise and branch inside `process_inbound`, with an early return.**

```ruby
keyword = message.to_s.strip.upcase
if STOP_KEYWORDS.include?(keyword)
  Setting.block_cell!(...)   # after the reply, see the trap below
  return true
elsif keyword == 'HELP'
  ...reply...
  return true
end
```

**Option B. Handle keywords in `callbacks_controller` before calling
`process_inbound`.** Rejected: puts SMS policy in a controller, and
`process_inbound` is the model-level entry point that the spec already covers at
`spec/models/remote_target_spec.rb:337`.

**Recommended:** Option A.

### The trap that makes ordering load-bearing

`Pusher.sms` returns `[]` immediately when the number is blocked
(`lib/pusher.rb:13-15`). So a STOP confirmation sent **after** `block_cell!`
would be silently swallowed and never delivered, while the code would look
correct and the test would pass if it only asserted `Pusher.sms` was called.

Two acceptable resolutions:

1. Send the confirmation before calling `block_cell!`.
2. Add a `force:` parameter to `Pusher.sms` that bypasses the block check, and
   use it for both the STOP confirmation and HELP. HELP needs this regardless,
   because carriers expect HELP to be answered even for an opted-out number.

Option 2 is better because it also covers HELP, but it widens the change. Decide
in review.

### Open questions

- Which number do we reply FROM? `process_inbound` has
  `source_str = opts['destinationNumber']`, which is our number, and
  `Pusher.sms` takes an `origination_number` third argument. Passing `source_str`
  looks right but is UNVERIFIED against a real inbound payload, because we have
  never received one.
- Footnote, out of scope: `lib/pusher.rb:11` recurses for comma-separated numbers
  as `Pusher.sms(p, message)` and drops `origination_number`. Separate defect.

### Test and mutation

`spec/models/remote_target_spec.rb`, extending the existing `process_inbound`
block at `:337`.

1. `'stop'` lowercase blocks and does NOT create a LogSession.
2. `'HELP'` sends a reply and does NOT create a LogSession.
3. Ordinary text still creates a LogSession (the untargeted control).
4. The STOP confirmation is actually dispatched, asserted at the SNS publish
   layer, not by expecting `Pusher.sms` to have been called.

Mutation: remove the early return. Tests 1 and 2 must go red on the LogSession
assertion. Mutation: move `block_cell!` above the confirmation send. Test 4 must
go red.

**Weakest passing state check:** test 4 is the one that matters and is the one
that will be written wrong. Asserting `expect(Pusher).to receive(:sms)` passes
against the swallowed-reply bug. It has to assert the publish.

---

## Finding 3: no consent recorded

### Three facts

**(a)** Contacts are written in `app/models/user.rb:2785-2818`, in the
`add_contact` branch of `process_params`. The value that would need to be READ is
in `Utterance#deliver_message` at `app/models/utterance.rb:270`, in the
`pref == 'text' || pref == 'sms'` branch, and any guard must sit **before** the
`Pusher.sms` call at `:301`.

**(b)** `add_contact` has two write paths and both need the new field:

- existing contact, `user.rb:2802-2807`, which overwrites `email`, `cell_phone`,
  `name` and `image_url` in place
- new contact, `user.rb:2808-2817`

Missing the first one is the likely mistake, because it reads as an update
rather than a creation. Contact type is inferred at `:2792` purely by whether the
string contains `@`, so `contact_type == 'sms'` is the condition for requiring
consent.

**(c)** Frontend: the action is assembled in
`app/frontend/app/controllers/user/edit.js:322-337` and the surrounding UI is at
`app/frontend/app/templates/user/edit.hbs:180`. CONFIRMED by grep. I have NOT
read the full add-contact form markup, so the exact insertion point for a
checkbox is ASSUMED.

### Proposed shape

Store alongside the existing contact keys, for `contact_type == 'sms'` only:

```ruby
'consent' => { 'method' => 'verbal', 'given_at' => Time.now.to_i,
               'recorded_by' => <recording user global_id> }
```

Guard in `deliver_message` before `:301`: if the contact is SMS and has no
`consent`, do not send, and record why.

The screenshot of that checkbox is literally the `optInImage` field the toll-free
registration requires, so building it produces the artifact the form needs.

### Open questions

- ~~Does an existing contact that predates this field get grandfathered?~~
  **DECIDED 2026-09-03 (Scot): no grandfather clause.** The guard blocks any SMS
  contact without a recorded `consent` hash, including one created before the
  field existed. There are zero SMS contacts in any database today (Render
  staging, Render prod, GCP prod all report 0 `remote_targets` and 0 SMS
  contacts), so this decision costs nothing now and could not be made this
  cheaply later. Implementation consequence: the guard is a plain presence check,
  with no migration, no backfill, and no `created_at` comparison.
- i18n: the checkbox label is user-facing and needs `{{t}}` with a key, double
  quotes per the repo convention.

### Test and mutation

`spec/models/utterance_spec.rb`: an SMS contact without `consent` must not reach
`Pusher.sms`; the same contact with `consent` must. `spec/models/user_spec.rb`:
both add_contact paths persist the field.

Mutation: move the guard after the `Pusher.sms` call. The first test must go red.
This is the exact guard-placement class that RULE #0 item 13(a) exists for, so
write the red test before the guard.

---

## Finding 4: STOP is filed as a message

Fixed for free by the early return in finding 2. Called out separately only so
the reviewer checks it is actually covered rather than assuming it.

The user-visible symptom: a contact texts STOP, and the AAC user sees a message
in their inbox that appears to be their contact saying the word "STOP".

---

## Sequencing

One coherent change per unit, per RULE #0 item 15.

1. Finding 1, argument order only. Smallest, highest severity, no behaviour
   design needed.
2. Finding 2, keyword handling plus auto-replies. Covers finding 4.
3. Finding 3, consent capture. Backend and frontend, so possibly two units.
4. Optional follow-up: START/UNSTOP plus `Setting.unblock_cell!`.
5. Optional follow-up: keyword signature on `canonical_target`.

None of this can be end-to-end tested until an origination number exists, so
every unit needs unit-level tests that stand on their own.

---

## What I did NOT verify

- The CTIA keyword list in finding 2(c). Cited from memory. Check before it goes
  on a registration form.
- The real shape of an AWS inbound payload. The only sample is the commented one
  at `app/models/remote_target.rb:148-156`.
- Whether `lingolinq-app` can publish to a specific origination number, as
  opposed to the account-level `sns:Publish` allow verified on 2026-09-03.
- The add-contact form markup, so the checkbox insertion point is ASSUMED.
