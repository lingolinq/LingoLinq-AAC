# SMS two-way texting: completion handoff

**Author:** Melissa O'Neil (with agent assist), 2026-09-15  
**Audience:** Whoever finishes AWS provisioning and validates Share Text SMS after Melissa leaves the project  
**Status:** App work merged to `develop`; AWS toll-free registration **pending approval**; outbound SMS is not production-ready until the checklist below is done.

**Read with:**

| Document | What it holds |
|---|---|
| `docs/task-management/2026-09-04_sms-handoff-melissa.md` | Original design decisions, the STOP-list trap, compliance closure |
| `docs/task-management/2026-09-03_sms-dual-review-findings.md` | 21 review findings; authoritative for what not to "fix" wrong |
| `docs/task-management/2026-09-14_share-text-sms-send.md` | Share Text client bugs, local send evidence, Sep 14 AWS inventory |
| `docs/INFRASTRUCTURE.md` | Cloud Run services, deploy flow, env-var caution |

---

## One-paragraph summary

LingoLinq's **app-side SMS consent and send path is built and merged**. Share Text can POST `/api/v1/utterances/:id/share`, enqueue `deliver_to`, and call `Pusher.sms`. What is **not** done is AWS provisioning: a registered US toll-free origination number, sandbox exit, spend limit raise, env vars on Cloud Run (`SMS_ORIGINATORS`, `SNS_ARNS`, `SNS_REGION`), and an SNS subscription so inbound replies reach `POST /api/v1/callback`. Until registration is **COMPLETE** and those steps run, SNS may accept publishes (HTTP 200) while messages never reach real handsets. Melissa filed the toll-free registration and left while it was still **pending** (typically up to **15 business days**).

---

## Current status (2026-09-15)

### App (done, on `develop`)

| Item | PR / location | Notes |
|---|---|---|
| Recipient consent stored by hashed phone + communicator | #949 | `SmsConsent` model, `AuditEvent` on grant/revoke |
| Unauthenticated consent page | #950 | `GET/POST /sms_consent/:token`, screenshot-ready disclosure |
| Outbound guard before SNS publish | #951 | `utterance.rb` after `cell` resolved; records `sms_attempts` with `reason: no_consent` |
| STOP block-list trap removed | #948 | Do **not** re-add `Setting.blocked_cells` checks in `Pusher.sms` |
| Share Text online send + error handling | #970 | Real user ids (not `'self'`), jqXHR 4xx handling, countdown destroy fix |
| Feature flag | `lib/feature_flags.rb` | `sms_recipient_consent` is **AVAILABLE only** (off unless enabled per communicator) |

Merged PR links: [#949](https://github.com/lingolinq/LingoLinq-AAC/pull/949), [#950](https://github.com/lingolinq/LingoLinq-AAC/pull/950), [#951](https://github.com/lingolinq/LingoLinq-AAC/pull/951), [#948](https://github.com/lingolinq/LingoLinq-AAC/pull/948), [#970](https://github.com/lingolinq/LingoLinq-AAC/pull/970).

### AWS (partial; Melissa handoff)

Fill in the **Your notes** column when you take over:

| Item | Status on 2026-09-15 | Your notes |
|---|---|---|
| IAM `lingolinq-app-sms-send` + SNS publish | Done before Sep 4 (Scot) | |
| SNS inbound topic `LingoLinqSMSInbound` | Exists, **0 subscriptions** | |
| SNS sandbox | **In sandbox** (confirmed Sep 14) | |
| Monthly SMS spend cap | **$1** (not raised) | |
| US toll-free number requested | Melissa: in progress | |
| US toll-free registration filed | **Pending approval** (Melissa) | Registration ID: __________ |
| Registration status | Pending (expect up to 15 business days) | Submitted: __________ |
| Number shared with SNS | Not done | Required after approval |
| Two-way SMS enabled | Confirm in console | |
| Self-managed opt-outs | Must stay **OFF** | AWS owns STOP/HELP |
| Sandbox exit support case | Not filed | |
| `SMS_ORIGINATORS` on Cloud Run | **Unset** on all services | |
| `SNS_ARNS` on Cloud Run | **Unset** | |
| `SNS_REGION` on Cloud Run | **Unset** | |
| `SMS_ENCRYPTION_KEY` | Set on deployed services per Sep 4 handoff; **empty in Melissa's local worker env Sep 14** | Verify in Secret Manager / 1Password |

**AWS account:** `239044785114`, region **`us-west-2`**. Admin CLI profile used for inventory: `melissa-oneil` (`aws login`).

---

## How Share Text send works (for validation)

```
Speak Mode → Share Text → save utterance → tap SMS/email contact
  → confirm-notify-user modal (5s countdown)
  → POST /api/v1/utterances/:id/share
  → Utterance#share_with → Worker deliver_to (priority queue)
  → Utterance#deliver_message
  → [if sms_recipient_consent flag ON] SmsConsent.granted?(communicator, cell)
  → RemoteTarget.find_or_assert → origination from SMS_ORIGINATORS
  → Worker Pusher.sms(cell, message, origination_number)
  → AWS SNS publish
```

**Success toast in the app:** `"Message sent!"` (`message_sent_excl`).  
**Wrong toast:** `"Message will be sent with logs or next sync."` means the client skipped `/share` (offline fallback) or an old JS bundle; hard-refresh and check Network for `POST .../share` 200.

**Email contacts** use the same `/share` path; delivery is SES (`UserMailer`), not SNS. No toll-free number required for email.

---

## When toll-free registration becomes COMPLETE

AWS moves registration from **SUBMITTED** / **REVIEWING** to **COMPLETE** (or **REQUIRES_UPDATES** if rejected). Check: End User Messaging console → **Configurations → Registrations**, or `describe-registrations` API.

If still pending after **15 business days**, open an AWS Support case with the registration ID and submit date.

### Phase A: AWS console (no app deploy)

Do these in order:

1. **If status is REQUIRES_UPDATES:** read rejection reasons, fix fields, resubmit. Do not change app code unless the rejection is about the consent page screenshot (`optInImage`); the live page is `GET /sms_consent/:token` (needs a valid invite token; see "Consent page URL" below).

2. **Confirm the toll-free number is ACTIVE** (not just registered).

3. **Share the number with Amazon SNS** so `Pusher.sms` can set `AWS.MM.SMS.OriginationNumber`. Without this, publishes may succeed but US delivery fails. (See AWS docs: sharing a phone number with SNS for SMS.)

4. **Two-way SMS: ENABLED.** **Self-managed opt-outs: OFF.** Record the date you verified both. Normal inbound replies should reach the app; STOP/HELP are handled by AWS and do not hit `RemoteTarget.process_inbound`.

5. **Raise the monthly SMS spend limit** above the default **$1** (End User Messaging account settings). The $1 cap is the only thing limiting runaway cost today.

6. **Exit the SMS sandbox** via AWS Support case (production sending to unverified numbers). Until sandbox exit, only verified sandbox destinations receive SMS.

7. **Optional for dev testing before sandbox exit:** complete OTP verification for test handsets in the sandbox destination list (a Sep 3 entry was still **PENDING** because OTP was never finished).

### Phase B: Environment variables

Set on **every Cloud Run service that runs workers or web** (web handles inbound callback). **Use `--update-env-vars`, never `--set-env-vars`**, which replaces the entire environment and drops ~45 other variables.

| Variable | Value | Purpose |
|---|---|---|
| `SMS_ORIGINATORS` | E.164 toll-free, e.g. `+18005551234` | Comma-separated pool; `RemoteTarget.sources_for` picks origination for outbound SMS |
| `SNS_REGION` | `us-west-2` | Region for SNS client in `Api::CallbacksController` |
| `SNS_ARNS` | ARN of `LingoLinqSMSInbound` topic | Allows subscription confirmation and inbound routing |
| `SMS_ENCRYPTION_KEY` | Existing secret (do **not** rotate casually) | `SmsConsent` hashing; must match deployed value |

Local dev: add the same vars to `.env.op.local` (reference via 1Password where applicable) and restart Resque workers (`priority`, `default`, `slow`).

**Verify origination is used:** after a send, worker logs should show SNS publish attributes including `AWS.MM.SMS.OriginationNumber`. Sep 14 local sends had **only** `SenderID: LingoLinq` and no origination number because `SMS_ORIGINATORS` was empty.

### Phase C: Inbound SMS subscription

Subscribe `LingoLinqSMSInbound` to the **public HTTPS** endpoint:

```
POST https://<environment-host>/api/v1/callback
```

| Environment | Host |
|---|---|
| dev | `dev.lingolinq.com` |
| staging | `staging.lingolinq.com` |
| production | `app.lingolinq.com` |

**localhost cannot receive SNS.** Subscribe dev/staging first.

Flow:

1. Create SNS HTTPS subscription to the topic ARN with the URL above.
2. SNS sends `SubscriptionConfirmation` to the app.
3. App confirms when `topic_arn` is listed in `SNS_ARNS` (`callbacks_controller.rb`).
4. Inbound `Notification` messages with topic matching `LingoLinqSMSInbound` call `RemoteTarget.process_inbound`.

Restart web service after setting `SNS_ARNS` so the confirmation handler accepts the topic.

### Phase D: App rollout (feature flag)

`sms_recipient_consent` is **off by default**. Before broad rollout:

1. Enable the flag for a **pilot communicator** (beta / system settings path documented in `feature_flags.rb`).
2. Mint a consent invite: `SmsConsentInvite.issue!(communicator)` in Rails console (flag must be on).
3. Share link: `https://<host>/sms_consent/<token>` (7-day expiry).
4. Recipient completes the form; `SmsConsent.grant!` runs.
5. Add SMS contact on the communicator account; Share Text send should pass the guard.

**There is no Ember UI yet** to issue or copy consent links from Share Text settings. Invites are console/API-level until product adds UI.

**Consent page screenshot for registration:** open the live `/sms_consent/:token` page with a real invite, capture PNG/JPG (max 500 KB) showing disclosure + unchecked checkbox. That is the `optInImage` AWS expects.

---

## End-to-end definition of done

Check each box before calling SMS "live":

- [ ] Toll-free registration **COMPLETE**; number **ACTIVE**
- [ ] Number shared with SNS; two-way ON; self-managed opt-outs OFF (documented)
- [ ] Sandbox exited (or testing limited to verified sandbox numbers)
- [ ] Spend limit raised appropriately
- [ ] `SMS_ORIGINATORS`, `SNS_ARNS`, `SNS_REGION` set on Cloud Run (+ local if testing)
- [ ] Workers restarted after env change
- [ ] SNS topic subscribed to public `/api/v1/callback`; subscription confirmed
- [ ] Outbound: Share Text → contact → Network shows `POST .../share` **200** → toast **"Message sent!"** → SMS arrives on phone
- [ ] SNS publish includes **OriginationNumber** attribute
- [ ] Inbound: reply SMS → appears in communicator log (verify `RemoteTarget.process_inbound` path)
- [ ] With flag ON: send to **non-consented** number is blocked; `sms_attempts` records `no_consent`
- [ ] Pilot on **staging** before production flag enable

---

## Known issues (do not mistake for provisioning gaps)

These are **open product/code issues**. Fixing AWS alone does not resolve them.

| Issue | Location | Impact |
|---|---|---|
| "Message sent" log note written before worker runs | `utterance.rb` share_with vs deliver_to | Communicator log can say sent when worker later declines |
| Inbound discarded when sharer has no device | `remote_target.rb` process_inbound + `log_session.rb` | Reply SMS lost silently; SNS gets `{handled: true}` |
| Comma-separated phone contacts | `pusher.rb`, `user.rb` add_contact | Drops origination number; one consent must not cover multiple numbers |
| `Pusher.sms` MaxPrice $1.00 per message | `lib/pusher.rb` | Cost/rate-limit concern at scale |
| PII in callback logs before verify | `callbacks_controller.rb` | Register finding; scrub E.164 in logs |
| No Ember UI for consent invite links | frontend | Manual/console invite minting only |
| `text_only`, `utterance_id` unpermitted on share | Rails logs | Noise only; not blocking send |

### The STOP trap (still forbidden)

Do **not** "fix" reversed `canonical_target` arguments in STOP handling. Do **not** re-add `Setting.blocked_cells` checks in `Pusher.sms`. AWS is the single opt-out authority on toll-free. See `2026-09-04_sms-handoff-melissa.md` section "The trap."

---

## Quick verification commands

**Registration status (admin AWS CLI, us-west-2):**

```bash
aws pinpoint-sms-voice-v2 describe-registrations --region us-west-2
aws pinpoint-sms-voice-v2 describe-phone-numbers --region us-west-2
```

**Sandbox:**

```bash
aws sns get-sms-sandbox-account-status --region us-west-2
```

**Local send trace (Rails log):**

```bash
grep -E 'POST "/api/v1/utterances/.+/share"|deliver_to|Pusher\.sms|Aws::SNS::Client' log/development.log | tail -30
```

**Ember unit tests (Share Text fixes):**

```bash
cd app/frontend && ember test --filter 'confirm-notify-user share'
```

Do not run full `ember test` while `ember serve` is on port 8184.

---

## Local dev reminders

- Branch workflow: branch from `develop`, PR to `develop`.
- Secrets: use `op run --env-file=.env.op.local --` for commands needing 1Password refs.
- Resque workers must be running for SMS after `/share` returns 200.
- Hard-refresh browser after frontend changes (`Ctrl+Shift+R`).

---

## Contacts and escalation

| Who | For |
|---|---|
| Scot Wahlquist | Product decisions, compliance sign-off, AWS account owner actions, flag rollout |
| Melissa (through project exit) | Context on Share Text debugging session Sep 14-15, registration filing |

---

## Changelog

| Date | Who | Note |
|---|---|---|
| 2026-09-04 | Scot | Original SMS handoff and design decisions |
| 2026-09-08 | Melissa | Consent model, page, guard, STOP fix merged |
| 2026-09-14 | Melissa | Share Text send fixes; AWS inventory; local POST /share 200 but no handset delivery |
| 2026-09-15 | Melissa | Toll-free registration pending; this completion handoff |
