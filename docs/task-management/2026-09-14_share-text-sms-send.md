# Share Text SMS send (2026-09-14)

## Fact sheet

(a) READ: `confirm-notify-user` `confirm()` — first `model.utterance`, then
`persistence.ajax` reject `err.result.status`. Snapshot of `utterance_record`
is taken in `share-utterance` `message()` at modal.open time.
CONFIRMED: `app/frontend/app/components/confirm-notify-user.js:96-151`
CONFIRMED: `app/frontend/app/components/share-utterance.js:280-287`

(b) Shapes: saved utterance + 2xx → "Message sent!"; missing utterance + raw
→ log fallback even when online; ajax reject jqXHR `.status` (no `.result`)
→ same fallback; offline → queued toast.
CONFIRMED: `app/frontend/app/services/persistence.js:3922-3937`

(c) `'self'` is not a backend user id. Contact id `selfx{hash}` fails
`Utterance#share_with` allowed_ids. CONFIRMED: `models/user.js:48-72`,
`global_id.rb:273-274`, `utterance.rb:105-106`.

Browser Network trace of Melissa's send was not captured this session; all
three client defects are independently CONFIRMED in code and each produces
the logs toast. Fix all three.

## Destroyed-object countdown (same send)

(a) READ: `again` in `didInsertElement` always calls `_this.set('seconds', diff)`
even after `confirm()` / `cancel()` / destroy. CONFIRMED
`app/frontend/app/components/confirm-notify-user.js` (`again`).

(b) Shapes: ticking; canceled with a timeout already queued; destroyed after
`modal.close`; auto-confirm then set. Stack `seconds = 4` is the queued tick
after Send (~1s), not auto-confirm (that is 0).

(c) 2026-09-14 13:55:25 POST `/share` was **200 OK**, `deliver_to` ran,
`Pusher.sms` SNS publish **200**, no origination number (`SMS_ORIGINATORS`
empty). The assertion did not block the send. Phone non-delivery is SNS
sandbox / origination, not this timer.

## AWS check (2026-09-14 ~14:02)

Live Resque worker env (presence only): `SMS_ORIGINATORS`, `SNS_ARNS`,
`SNS_REGION`, `SMS_ENCRYPTION_KEY` all empty. `AWS_REGION=us-west-2`.
`Pusher` used `AWS_KEY` as `lingolinq-app` (not `TRANSCODER_KEY`).

That user can `sns:Publish` (the 13:55 send). It cannot
`GetSMSSandboxAccountStatus`, `GetSMSAttributes`, `DescribePhoneNumbers`,
or IAM policy listing. Admin CLI user `melissa-oneil` in
`~/.aws/config` has an expired `aws login` session, so sandbox / spend /
toll-free inventory were not readable this pass.

Sep 4 handoff remaining AWS work still matches live local env: no
origination numbers, inbound topic env unset. US delivery with only
SenderID `LingoLinq` is not expected.

## AWS inventory (melissa-oneil, 2026-09-14)

CONFIRMED via `aws login` as `melissa-oneil` in `us-west-2`:

- SNS sandbox: `IsInSandbox: true`. End User Messaging `ACCOUNT_TIER=SANDBOX`.
- Owned origination numbers: **0**. Registrations: **0**. Sender IDs: **0**.
- Spend cap: `MonthlySpendLimit=1`, End User Messaging TEXT limit enforced $1,
  not overridden.
- One destination number on the sandbox list, status **PENDING** since
  2026-09-03 (OTP not completed). Do not copy the number into git.
- Topic `LingoLinqSMSInbound` exists; **0** subscriptions (inbound replies
  have nowhere to go).
- Default SMS type / sender ID / delivery-status IAM role: unset.
