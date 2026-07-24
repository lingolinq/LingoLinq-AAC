# Parental consent email (COPPA / under-13 registration)

This document describes the **parent-facing email** sent when a new account is created with “under 13” selected. The COPPA parental-consent flow is **enabled by default**; set `COPPA_PARENTAL_CONSENT=0` (or `false` / `no` / `off`) in the environment to disable it, or override per org via `domain_settings.coppa_parental_consent`.

**Rollout note:** This default is intentional for compliance. Deployments that previously relied on the old opt-in behavior (`COPPA_PARENTAL_CONSENT=1`) need no env change. To keep COPPA off on a specific host, set `COPPA_PARENTAL_CONSENT=false` before deploy.

## Editing copy (preferred: System Settings)

Admins with **System Settings** access can edit this email without a deploy:

1. Open **System Settings → Emails → Parental consent request**.
2. Use the **Message content** tab for subject, greeting, intro, action prompt, and footer (`%{app_name}` is supported where shown).
3. Use **App defaults** (site-wide) or **Organization settings → Customization** (per org) for branding: app name, company name, support URL, admin email, and email signature.

Overrides are stored in `Setting['default_email_templates']` (site default) or `org.settings['email_templates']` (per organization). Unchanged fields fall back to `config/locales/en.yml`.

## Where the copy lives (code defaults)

| Piece | Location |
|--------|-----------|
| Subject | `config/locales/en.yml` → `parental_consent_mailer.subject` |
| Body lines | `config/locales/en.yml` → `parental_consent_mailer.*` |
| HTML / text layout | `app/views/user_mailer/parental_consent_request.html.erb`, `parental_consent_request.text.erb` |
| Admin overrides | System Settings email editor / `lib/system_email_templates.rb` |

The mailer method is `UserMailer#parental_consent_request` in `app/mailers/user_mailer.rb`.

## Current default strings (English)

Placeholders: `%{app_name}`, `%{consent_age}`, `%{child_username}`, `%{registered_at}`, and (on revoke/confirmation details) related account fields. Admins can override many of these in System Settings.

**Subject (with `%{app_name}`):**

> Parental consent for a new %{app_name} account

**Greeting:**

> Hi there!

**Intro (with `%{app_name}` and `%{consent_age}`):**

> A new %{app_name} account was just created by someone in your care, and the user let us know they are under %{consent_age}.

**Safety notice:**

> To keep things safe and follow U.S. regulations, we need a thumbs-up from a parent or guardian before we can fully activate the account.

**Ready heading:**

> Ready to approve?

**Action prompt:**

> If you are their parent or legal guardian, you can easily give your consent by clicking the link below:

**CTA label:** Approve Account & Get Started

**Privacy notice / link:** Privacy Policy

**Unexpected heading:** Didn't expect this email?

**Footer:**

> No worries! If this wasn't you, you can simply ignore this message. The account will stay locked and restricted until a parent approves it, or the request eventually expires.

*(The implementation appends the one-time URL on its own line.)*

**Confirmation intro** (for `parental_consent_confirmation_mailer`, with `%{app_name}`, `%{child_username}`, `%{registered_at}`):

> Just a quick heads-up to confirm that you've approved the %{app_name} account for %{child_username} (registered on %{registered_at}). We've got your consent officially locked in!

Confirmation also includes Privacy Policy, revoke-anytime copy, and a revoke CTA (see en.yml `parental_consent_confirmation_mailer.*`).

## Approval link behavior

- The email contains a **one-time** URL: `GET /parental_consent/complete?user_id=<global_id>&token=<secret>`.
- **Referrer-Policy: no-referrer** is set on that response to reduce token leakage via Referer headers (aligned with supervisor consent patterns).
- After consent, the minor’s account receives the normal **welcome / confirm registration** email so they can finish email confirmation.
- The parent receives a **confirmation email** (`UserMailer#parental_consent_confirmation`) acknowledging the approval, summarizing the account, and including a **revoke-anytime** link.
- All parent-facing COPPA emails (`parental_consent_request`, `parental_consent_confirmation`, `parental_consent_revoked`) share the same delivery path via `UserMailer.schedule_parent_consent_delivery`.

## Confirmation email (COPPA email-plus)

| Piece | Location |
|--------|-----------|
| Subject / body | `config/locales/en.yml` → `parental_consent_confirmation_mailer.*` |
| HTML / text layout | `app/views/user_mailer/parental_consent_confirmation.html.erb`, `.text.erb` |
| Mailer | `UserMailer#parental_consent_confirmation` |
| Admin overrides | System Settings → Emails → **Parental consent confirmation** |

The confirmation email includes:

- Acknowledgment that consent was recorded (timestamp + child username)
- Link to the Privacy Policy
- Explicit revoke-anytime notice
- Revoke URL: `GET /parental_consent/revoke?user_id=<global_id>&token=<revoke_secret>`

After a successful revoke, the parent receives `UserMailer#parental_consent_revoked` and the child account is blocked from login until consent is given again.

## Legal checklist (for counsel)

1. Confirm wording meets your **COPPA** / state privacy program and any **school** (FERPA) addenda you use.
2. Confirm the **subject line** is acceptable for spam filters and parent recognition.
3. Confirm **who** the reply-to / from addresses should be (`DEFAULT_EMAIL_FROM`, domain `admin_email`, etc.).
4. If you need **non-English** parent emails, add the same keys under other `config/locales/*.yml` files (or your i18n process for Rails mailers).

## Why the parent may not receive mail on localhost

1. **Queued mail** — `UserMailer.schedule_delivery` enqueues `UserMailer.deliver_message` on the **Resque `priority` queue** (`app/mailers/concerns/general.rb`). If no **Resque worker** is running, the job never runs and nothing is sent.
2. **Delivery method** — In `config/environments/development.rb`, Action Mailer uses **`:ses`** (Amazon SES). You need valid **`SES_KEY` / `SES_SECRET`** (or `AWS_KEY` / `AWS_SECRET`) and region. With `raise_delivery_errors = false`, SES failures may not surface as obvious UI errors—check **Rails logs** and the worker log.
3. **Optional: send during the HTTP request (development only)** — Set **`INLINE_PARENTAL_CONSENT_EMAIL=1`** (or `true` / `yes` / `on`) in the environment for the Rails process. Then all parent-facing COPPA mailers (`parental_consent_request`, `parental_consent_confirmation`, `parental_consent_revoked`) call `UserMailer.deliver_message` immediately instead of queuing. You still need SES (or change development delivery to `:test` / Letter Opener locally if your team uses that).

## Local dev: consent link on port 8184

Parent email links use `DEFAULT_HOST` (often `http://localhost:8184`). The Ember dev server must **proxy** `/parental_consent/complete`, `/parental_consent/revoke`, `/eu_ai_parental_consent/complete`, and `/eu_ai_parental_consent/revoke` to Rails (see `app/frontend/server/index.js`, same pattern as `/auth/*`). Without that proxy, the browser gets the Ember SPA shell and the page looks blank. Restart `ember serve` after changing that file. You can also open the link on **`http://localhost:5000/...`** directly to hit Rails.

This is **not** because the parent address is wrong: `UserMailer#parental_consent_request` sets **`mail(to: settings['coppa']['parent_email'])`**, which is the address submitted as `parent_consent_email` at registration.

## Changelog

- **2026-07-23** — Removed a duplicated copy of the "Why the parent may not receive mail on localhost" section (introduced during the 2026-07-13 / 2026-07-15 edits; the two blocks were byte-identical). Re-attested against the current revision.
- **2026-07-15** — EU AI parental-consent flow added alongside the COPPA flow (PR #616): `/eu_ai_parental_consent/complete` and `/eu_ai_parental_consent/revoke` routes, Ember dev-server proxy entries, and AI-preference gating.
- **2026-07-10** — Added post-approval parent confirmation email and tokenized revoke flow (COPPA email-plus).
- **2026-04-13** — Initial engineering defaults added with COPPA parental consent feature.
- **2026-04-14** — Documented Resque + SES and `INLINE_PARENTAL_CONSENT_EMAIL` for local testing.
