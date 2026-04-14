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

## Changelog

- **2026-04-13** — Initial engineering defaults added with COPPA parental consent feature.
