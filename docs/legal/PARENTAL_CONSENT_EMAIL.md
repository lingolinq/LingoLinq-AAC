# Parental consent email (COPPA / under-13 registration)

This document describes the **parent-facing email** sent when a new account is created with “under 13” selected and `COPPA_PARENTAL_CONSENT` / `domain_settings.coppa_parental_consent` is enabled. Legal can edit the **Rails locale strings** below; no code change is required for copy updates once keys exist.

## Where the copy lives

| Piece | Location |
|--------|-----------|
| Subject | `config/locales/en.yml` → `parental_consent_mailer.subject` |
| Body lines | `config/locales/en.yml` → `parental_consent_mailer.*` |
| HTML / text layout | `app/views/user_mailer/parental_consent_request.html.erb`, `parental_consent_request.text.erb` |

The mailer method is `UserMailer#parental_consent_request` in `app/mailers/user_mailer.rb`.

## Current default strings (English)

**Subject (with `%{app_name}`):**

> Parental consent for a new %{app_name} account

**Greeting:**

> Hello,

**Intro:**

> A new %{app_name} account was created for a user who indicated they are under 13. U.S. regulations require verifiable parental consent before the account can be fully activated.

**Action prompt:**

> If you are the parent or legal guardian, please open the link below to provide consent:

*(The implementation appends the one-time URL on its own line.)*

**Footer:**

> If you did not expect this message, you can ignore this email. The account will remain restricted until consent is given or the request expires.

## Approval link behavior

- The email contains a **one-time** URL: `GET /parental_consent/complete?user_id=<global_id>&token=<secret>`.
- **Referrer-Policy: no-referrer** is set on that response to reduce token leakage via Referer headers (aligned with supervisor consent patterns).
- After consent, the minor’s account receives the normal **welcome / confirm registration** email so they can finish email confirmation.

## Legal checklist (for counsel)

1. Confirm wording meets your **COPPA** / state privacy program and any **school** (FERPA) addenda you use.
2. Confirm the **subject line** is acceptable for spam filters and parent recognition.
3. Confirm **who** the reply-to / from addresses should be (`DEFAULT_EMAIL_FROM`, domain `admin_email`, etc.).
4. If you need **non-English** parent emails, add the same keys under other `config/locales/*.yml` files (or your i18n process for Rails mailers).

## Why the parent may not receive mail on localhost

1. **Queued mail** — `UserMailer.schedule_delivery` enqueues `UserMailer.deliver_message` on the **Resque `priority` queue** (`app/mailers/concerns/general.rb`). If no **Resque worker** is running, the job never runs and nothing is sent.
2. **Delivery method** — In `config/environments/development.rb`, Action Mailer uses **`:ses`** (Amazon SES). You need valid **`SES_KEY` / `SES_SECRET`** (or `AWS_KEY` / `AWS_SECRET`) and region. With `raise_delivery_errors = false`, SES failures may not surface as obvious UI errors—check **Rails logs** and the worker log.
3. **Optional: send during the HTTP request (development only)** — Set **`INLINE_PARENTAL_CONSENT_EMAIL=1`** (or `true` / `yes` / `on`) in the environment for the Rails process. Then `Api::UsersController#create` calls `UserMailer.deliver_message` immediately for the parental consent message instead of queuing it. You still need SES (or change development delivery to `:test` / Letter Opener locally if your team uses that).

This is **not** because the parent address is wrong: `UserMailer#parental_consent_request` sets **`mail(to: settings['coppa']['parent_email'])`**, which is the address submitted as `parent_consent_email` at registration.

## Changelog

- **2026-04-13** — Initial engineering defaults added with COPPA parental consent feature.
- **2026-04-14** — Documented Resque + SES and `INLINE_PARENTAL_CONSENT_EMAIL` for local testing.
