# Dual review: SMS keyword and consent proposal

**Reviewed:** `8fdd10dd1` on `scot/fix/sms-keyword-handling` (base `cf5004909`).
**Reviewers:** Codex CLI `gpt-5.6-terra` (senior-dev pass, high reasoning) and the
Claude `adversary` agent (holistic + compliance pass), run in parallel with no
shared state. Both were told to assume the proposal's guard placement was wrong
until they proved otherwise.
**Verdict: BLOCK.** Both reviewers independently returned block. Do not implement
any of the four proposed fixes as written.

**Reviewer-model note.** `~/.codex/config.toml` had drifted to `gpt-5.6-luna`,
which is not an approved reviewer; all four brain templates pin
`gpt-5.6-terra`. Overridden to terra for this run. The live config is still
wrong and every future interactive codex run picks up luna silently.

Every claim below was re-verified against the live source by the team lead
before being recorded here. Line numbers resolve at `8fdd10dd1`.

## The two conclusions that change the plan

**1. Correcting the argument order at `remote_target.rb:137` makes things
WORSE, not better.** This inverts the proposal's headline fix. On a US toll-free
number, opt-out is managed at the carrier level; AWS answers STOP itself and
opts the number out at the account level, and inbound STOP only reaches the app
if self-managed opt-outs are explicitly enabled. `Setting.blocked_cells` is
therefore a second, divergent opt-out store. It is append-only
(`app/models/setting.rb:63-68`, no delete path anywhere in the codebase), and
AWS honors START/UNSTOP to re-opt a consumer in, which the app never sees. So a
corrected block list suppresses forever a consumer who has lawfully opted back
in. Broken, it does nothing. Fixed, it does the wrong thing permanently.
**Counter-measure: delete the write at `remote_target.rb:136-138`. Keep only the
early return.**

**2. Two questions gate all of this and neither is an engineering question.**
Will self-managed opt-outs be enabled (decides whether ANY app-side keyword code
ever executes), and is attested third-party consent filable at all (decides
whether the consent schema is even the right shape). Both must be answered
before code is written.

## Findings

| # | Sev | Location | Finding | Source |
|---|-----|----------|---------|--------|
| 1 | Critical | `remote_target.rb:137`, `pusher.rb:13` | Reversed args to `canonical_target` make both resolve to the literal `'sms'`; one STOP sets a global kill switch, no unblock path. All 8 call sites enumerated identically by both reviewers: `:30,80,117,123,127` and `pusher.rb:17` correct, `:137` and `pusher.rb:13` reversed. | both |
| 2 | High | `user.rb:4229` | REFUTES proposed finding 3. `deliver_message` has TWO callers. The second passes no `cell_phone`, so `utterance.rb:273-274` falls through to `recipient_user.settings['cell_phone']`. No contact record exists on this path, so the proposed `consent` hash has nowhere to live. Guard fails open or silently kills `share_notifications == 'text'` for every supporter. | both |
| 3 | High | `pusher.rb:13-15` | REFUTES ordering resolution 1. The block check runs INSIDE `Pusher.sms`, i.e. at job-execution time, so source order is irrelevant; the confirmation is swallowed regardless. Inline sending is also unsafe: `pusher.rb:48` sets `retry_backoff: sleep(3)`, up to ~6s blocking a Puma worker on an unthrottled endpoint. Only a narrow `force:` path works. | both |
| 4 | High | `pii_scrubber.rb:37` | `LOG_PHONE_PATTERN` requires separators, so E.164 never matches. Verified by running the regex: `+14255550182`, `+15558675309`, `+441134960000` all no-match; `(425) 555-0182` also fails on the leading `\b`. Phone numbers reach Cloud Logging unredacted. **Live today, not gated on SMS, affects every log line in the app.** | adversary |
| 5 | High | `lib/flusher.rb:391-449` | `RemoteTarget` is absent from the 14-model deletion sweep; no `has_many`, no FK cascade. Orphan rows keep `target_hash` AND the per-row `salt` in the same row, so the hash is recoverable by exhaustive search over a ~10^10 domain. Not GDPR Art.17 erasure. Same class as remediated LL-1e2ab28aab / LL-e8614c103f. **Live today, not gated on SMS.** | adversary |
| 6 | High | `callbacks_controller.rb:39` vs `:41` | Full inbound payload logged BEFORE `verifier.authentic?`. Compounds finding 4: unverified, unredacted phone numbers and message bodies. Under the default toll-free config STOP/HELP never reach the app, so every payload on that line is ordinary conversational content. | codex |
| 7 | High | consent design | The proposed record has the ACCOUNT HOLDER attesting that a third party consented. TCPA/CTIA require the subscriber's own consent. `optInType: VERBAL` describes how the consumer opted in, not how you recorded a claim about them. Most likely single item to sink the registration. | adversary |
| 8 | High | `remote_target.rb:135-152` | Keyword list wrong. Missing AWS's `ARRET`, `OPT-OUT`, `OPTOUT`, `REMOVE`, `TD`; proposed `STOPALL` is not on AWS's list. Moot on toll-free, where STOP is the only supported keyword and the response cannot be customized. | both + AWS docs |
| 9 | Medium | `utterance.rb:288-297` | Guard at `:301` runs AFTER `find_or_assert`, `last_outbound_at = Time.now`, and `target.save`. A blocked send still writes a routing row claiming an outbound happened. | codex |
| 10 | Medium | `remote_target.rb:143-152` | `res = LogSession.message(...)` is never checked; `return true` unconditional. `log_session.rb:1261` returns false when `device` is nil, and `device: sharer.devices[0]` is nil whenever the sharer has no device. Message discarded, `{handled: true}` rendered, SNS never retries. Masked by mocks in 3 of 5 `process_inbound` specs. | adversary |
| 11 | Medium | `pusher.rb:10-11` | Comma recursion drops `origination_number` and converts a blocked child's `[]` into `nil`. | both |
| 12 | Medium | `user.rb:2953`, `pusher.rb:10-11` | `ref` preserves commas, so one contact and one consent record fan out to N recipients. Per-number opt-in is a hard carrier requirement. `remote_target.rb:63` strips the comma, so the RemoteTarget row is keyed on concatenated garbage. | adversary |
| 13 | Medium | `callbacks_controller.rb` | No inbound idempotency despite `inboundMessageId` in the payload. Repeated SNS delivery duplicates `LogSession` records. | codex |
| 14 | Medium | `extras.js:36` vs `organizations_controller.rb:779` | Frontend reads `res.emails`; controller renders `{cells: ...}`. Admin blocked-cells display is broken. Note the endpoint returns the list over the wire regardless, so fixing the display would newly surface third-party phone numbers. Moot if the write is deleted. | codex |
| 15 | Medium | `utterance.rb:127-137` vs `:111-115` | The note LogSession is written SYNCHRONOUSLY in `share_with`, before `deliver_to` is enqueued. A blocked send leaves the communicator's own log reading "message sent" while the worker declines. For an AAC user that is a product failure, not cosmetic. | adversary |
| 16 | Medium | premise | "Zero SMS contacts" is NOT verifiable at deploy time. `user.rb:2937-2971` is a plain `settings` write needing no SMS provisioning; any user can create an SMS contact through the Edit-user UI right now. No constraint, flag, or lock freezes the count between reading it and shipping the guard. | adversary |
| 17 | Medium | severity table | "Latent (SMS unused)" is UNPROVEN. With `SMS_ORIGINATORS` unset, `origination` stays nil and `Pusher.sms` publishes against the account default sender pool. Whether that delivers is account state the repo cannot settle. Check SNS sandbox status before carrying "latent" into the register. | adversary |
| 18 | Medium | doc `:23` | The opening table cites `campaignInfo.stopMessage` / `campaignInfo.helpMessage`, which are 10DLC campaign fields, not toll-free. Two of three rows describe the wrong form. | adversary |
| 19 | Low | `pusher.rb:26` | `MaxPrice` is `"1.0"`, roughly 50-100x typical US SMS, with no per-user rate limit and comma fan-out multiplying each share. The $1 monthly account cap is doing all the work and is the first thing removed at go-live. | adversary |
| 20 | Low | doc citations | `add_contact` at `user.rb:2785-2818` and `:2792` do not resolve. There is no such Ruby method; it is an action string handled inline at `user.rb:2937-2971`. Rule 13(c) miss in the proposal itself. | adversary |
| 21 | Low | `user.rb:2944` | `contact_type` is inferred by `/@/` alone with no validation, so any non-`@` string becomes a phone number. Also the one reachable state where the two reversed calls fail to match. | adversary |

## Two items to file NOW, independent of SMS

Findings 4 and 5 are live compliance defects at HEAD, not gated on SMS
provisioning, and belong in the register on their own rather than waiting for
this branch.

## What must happen before any code

1. Decide toll-free vs 10DLC, and decide whether self-managed opt-outs will be
   enabled. Record the answer. No keyword code before this.
2. Get counsel to rule on whether attested third-party consent is filable.
3. Re-scope: with the block-list write deleted, findings 1 and 2 collapse into
   one much smaller change.
4. Re-run the zero-SMS-contacts count immediately before merge, and have the
   consent guard write a negative `sms_attempts` record so a contact created in
   the window is discoverable rather than invisible.
