# 2026-11-10 System email template placeholders

Branch: `traci/security/email-template-placeholders` (from `origin/develop` at 61c8f4022).

## Goal

Admin-editable HTML and plain-text bodies of system emails are filled from a list of allowed
values. Stored template text is never run as code. An override that does not fit the list is
refused at save, and at send time an override that no longer fits falls back to the shipped
default view so the email still goes out.

## Fact sheet

### (a) Where is the stored text read and turned into output?

- CONFIRMED `lib/system_email_templates.rb:211-216`: `render_string` passes the string to
  `ERB.new(...).result(binding)`. Every override goes through it.
- CONFIRMED `app/mailers/concerns/system_email_override.rb:22-37`: the send path. It reads
  `override['html_body']` / `override['text_body']` from `SystemEmailTemplates.lookup(key)`
  (`lib/system_email_templates.rb:4-11`, current domain first, then the `default_email_templates`
  Setting) and evaluates it with the mailer's own `binding` (line 25 and 32). The HTML result is
  marked `html_safe` (line 26), so values are not HTML-escaped.
- CONFIRMED `app/controllers/api/system_email_templates_controller.rb:100-113`: the preview path.
  Custom text from the request (`attrs[:html_body]`, `attrs[:text_body]`) is evaluated with a
  helper object's binding (`preview_binding_for`, :164-191). When the submitted text equals the
  shipped default (`default_field_value?`), the repository file read by `default_body` is
  evaluated instead (:104-105).
- CONFIRMED the only guard before evaluation is a word list,
  `lib/system_email_template_security.rb:1-20`, called at save
  (`lib/system_email_templates.rb:32`), at send (`system_email_override.rb:24,31`) and at
  preview (`render_string` with `validate: true`). A word list cannot bound what Ruby can do.
- CONFIRMED there are no other callers of `render_string` or `SystemEmailTemplateSecurity`
  (`grep -rn` over `app lib spec`).

### (b) What shapes can the stored text and the values hold?

Writers of stored overrides: `SystemEmailTemplates.set_template!` (the only writer in app code,
`lib/system_email_templates.rb:20-68`), reached from `Api::SystemEmailTemplatesController#update`
by site admins and admin-org managers (`Api::SystemSettingsAccess`). Rows written before the save
validation existed, or by a console session, can hold anything.

Stored body shapes:
1. plain HTML or text with no tags (specs at `spec/mailers/user_mailer_spec.rb:213,441`);
2. text with only `<%= ... %>` output tags (the only shape the current save validation accepts);
3. anything else written outside `set_template!` (code blocks, comments, unclosed tags).

What admins are shown (the starting text of the editor is the shipped default view,
`effective_content`, `lib/system_email_templates.rb:107-108`):
- CONFIRMED by a script over `SystemEmailRegistry::ENTRIES`: 42 registered default bodies
  contain `<% ... %>` code blocks, so the current save validation already refuses them unless
  the admin removes the blocks. 51 contain only output tags. The expressions in those 51 are:
  `app_name`, `company_name`, `support_url`, `email_signature`, `JsonApi::Json.absolute_host`,
  `domain_settings['youtube_url']`, plain instance variables (`@consent_url`, `@privacy_url`,
  `@revoke_url`, `@contact_url`, `@reason`, `@permission_description`, ...), one-step attribute
  reads on a record (`@user.user_name`, `@user.display_name`, `@user.display_user_name`,
  `@user.registration_code`, `@user.settings['email']`, `@gift.code`, `@gift.duration`,
  `@supervisor.display_name`, `@communicator.display_name`, `@recipient.user_name`,
  `@message.settings['name']` and four sibling keys), `long_ordinal_date(<value>)`,
  `@child_name.presence || @child_username`, `mailer_t('<key>', name: <value>, ...)`, and four
  one-off expressions (three conditionals and one division) in subscription emails.
- CONFIRMED `app/frontend/app/templates/system-settings/email-edit.hbs:80-86`: the Variables tab
  lists the registry `variables` (e.g. `@user`, `domain_settings`) and says "Templates use
  <%= ... %> output tags only (no Ruby code blocks). Use variables like @user, app_name, and
  support_url". The consent emails list `dynamic_variables` instead (:70-78).
- CONFIRMED values like `@user`, `@gift`, `@message` are records. `User` has no `email` method
  (`grep "def email\b" app/models/user.rb` finds none); the preview stand-in
  `SystemEmailPreview::SampleUser` does (`lib/system_email_preview.rb:2`).
- CONFIRMED `User#registration_code` saves the record when the code is missing
  (`app/models/user.rb:381-388`). The default views already call it.
- CONFIRMED on the send path, `binding` is the mailer object. `MailerHelper` is a view helper
  (`helper MailerHelper`, `app/mailers/user_mailer.rb:4`), so `email_signature`, `support_url`,
  `company_name`, `domain_settings`, `mailer_t` and `long_ordinal_date` are not methods of the
  mailer (`app_name` is, through `General#app_name`, `app/mailers/concerns/general.rb:19`). An
  override that uses `email_signature` raised NameError when the email was built (red spec run).
- CONFIRMED (review finding 1) seven registered emails have no plain-text view (`log_summary`,
  `eval_purchase_confirmed`, `gift_updated`, `new_subscription`, `supporter_purchase_confirmed`,
  `unsubscribe_reason`, `opt_out`); an HTML override on one of them raised MissingTemplate on the
  send path (red spec run), so the email was not sent.
- CONFIRMED (review finding 3) the record a variable names is not always the recipient: in
  `badge_awarded` the email goes to `@recipient` and `@user` is the badge owner
  (`app/mailers/user_mailer.rb:69-75`); in the parent-facing emails `@user` is the child.
- CONFIRMED (review finding 4) `@message` is a String in `utterance_share`
  (`app/mailers/user_mailer.rb:254`) and a ContactMessage in `admin_mailer`.

### (c) Cross-file claims

- CONFIRMED the editor shows a server error with `{{this.message}}`
  (`app/frontend/app/templates/components/flash-outlet.hbs`), which escapes it, via
  `apiErrorMessage` (`app/frontend/app/utils/api_error_message.js`).
- CONFIRMED existing specs that touch this behaviour and must keep passing unchanged:
  `spec/lib/system_email_template_security_spec.rb` (code blocks refused with a message matching
  `/output tags/`, an unsafe expression refused with `/disallowed/`, `<%%` literal accepted),
  `spec/lib/system_email_templates_spec.rb:35` (`/output tags/`),
  `spec/controllers/api/system_email_templates_controller_spec.rb:87-89` (exact code-block
  message, 400) and `:105-115` (preview of `@user.email` shows the sample address).
- CONFIRMED baseline: the related spec files (`spec/lib/system_email_*_spec.rb`,
  `spec/controllers/api/system_email_templates_controller_spec.rb`, `spec/mailers`) pass on
  61c8f4022: 151 examples, 0 failures, 3 pending.
- ASSUMED (not checkable from here, not load-bearing): how many overrides are stored in deployed
  environments. The fallback below covers any that no longer fit.

## Candidate designs

### A. Strict placeholder grammar over the existing `<%= ... %>` tags (chosen)

A new `lib/system_email_placeholders.rb` scans the text. Outside tags, text is literal (`<%%`
becomes `<%`, as ERB does). Any `<%` that is not `<%=` or `<%%` is refused with the existing
code-block message. Each `<%= ... %>` is tokenised and parsed by a small recursive-descent parser
whose only productions are:

- a helper name: `app_name`, `company_name`, `support_url`, `email_signature`;
- `JsonApi::Json.absolute_host` (kept because 42 defaults use it; it is a fixed token, not a call);
- `domain_settings['<key>']` for a listed key;
- `@name` for a listed plain value; `@name.<field>` or `@name.settings['<key>']` for a listed
  field of a listed record variable; a record variable on its own is refused with a message
  naming its fields;
- `long_ordinal_date(<value>)`, `<value>.presence || <value>`;
- `mailer_t('<key>', name: <value>, ...)` for a key this email uses;
- a short table of whole expressions copied from the defaults (the three conditionals and the
  division), matched as exact strings after collapsing whitespace.

Each production maps to a lambda written in the repository. The renderer reads instance
variables only by listed names, calls only those lambdas, and turns a value into text only when
it is a string, number, symbol, boolean, date or time (anything else becomes empty). In HTML
bodies every value is HTML-escaped. Nothing in the stored text reaches `eval`, `send` with a
stored name, or ERB.

Per-email narrowing: a field or whole expression marked as specific to some emails (for example
`@user.registration_code`, `@gift.code`) is accepted only when that email's own default view
uses it. Common fields (`user_name`, `display_name`, `display_user_name`, `email`) are accepted
wherever the variable is available. The global table is the ceiling; the defaults only narrow.

Save (`set_template!`) and preview refuse text that does not parse, with a message that names the
placeholder. Send renders the override through the same parser; if it does not parse or a value
lookup raises, it logs the template key and format only and renders the default view for that
format.

Preview: custom text goes through the parser. The repository default view is still rendered with
ERB, but through a method that takes only the template key and reads the file itself, so admin
text cannot reach it.

Trade-offs: keeps every output-only default and every stored override that uses those forms
working; admins keep the syntax they are shown. Cost: a parser and a vocabulary table to maintain
when a default view gains a new expression (a spec walks every output-only default view and
fails if one stops validating).

### B. A new `{{name}}` / `%{name}` syntax with a flat value hash

Each email gets a flat hash (`user_name`, `consent_url`, ...) and the body is filled with
`I18n.interpolate` or a `{{name}}` replace. Simpler to reason about, no parser.

Trade-offs: the editor's starting text is the ERB default view, so admins would start from text
they cannot save; every stored override stops working; the 51 output-only defaults would need a
converted copy or a converter (a parser anyway). Rejected for breaking working functionality.

### Simplest alternative considered: drop HTML and text overrides

Keep only subject and the consent-email message blocks. Removes a shipped feature. Rejected.

### Rejected: allow only expressions copied verbatim from the default view, then evaluate them

Still evaluates text that came from storage and keeps the whole mailer in reach. Rejected.

## Risks

- A default view gains an expression the table does not know: admins editing that email get a
  save error. Mitigated by the spec over every output-only default.
- A stored override that fit the old rules but not the new ones now falls back to the default view
  at send time (the admin sees an error the next time they save it). Admin-visible change.
- `@user.registration_code` can save the user when the code is missing, as the default views do.
- Server error messages are English, like the existing `InvalidOverride` messages.
- Values holding markup (an email signature with tags, a contact message) are now escaped in HTML
  overrides, as they already are in the default views.
- Forms the defaults use only inside code blocks (loops over `@users`, `UserGoal` calls) are not
  available. An earlier version of this note said that cost nothing because those defaults could
  not be saved with their code blocks. That was wrong: an admin could remove the blocks and save
  a `forgot_password` or `lesson_assigned` body that could not carry its reset or lesson link, so
  the saved email no longer did its job. Fixed in review round 2 (below): each email whose purpose
  is a link now accepts that link's exact parts, requires them at save, and sends the default view
  when one edited body cannot serve the send (several logins on one address, a bulk gift).

## Unresolved questions

- Stored overrides in deployed environments are not inspected (no database access from here).
- Whether `@user.email` (alias of `settings['email']`) should be allowed in parent-facing
  emails; the existing preview spec uses it on the welcome email.

## Test and mutation

- Red specs (new): a stored override whose output tag reads an environment value or calls a
  method on a spec-only probe module is not run, on the send path (falls back to the default view)
  and the preview path (400, value absent); `set_template!` refuses such text and refuses a record
  variable on its own; values are HTML-escaped in HTML bodies; every output-only default view
  validates and renders for its own email.
- Mutation that must turn them red: restore `ERB.new(text).result(binding)` in place of the
  placeholder renderer on the send and preview paths.

## Review (adversary-local, read-only) and what was adopted

1. High, CONFIRMED: HTML-only emails were not sent when an override existed. Adopted: a format is
   declared only when there is an override body or a default view for it; red spec on
   `admin_mailer/opt_out`.
2. Medium, design risk: the renderer must not take a Binding or `send` a stored name. Adopted:
   the renderer takes a `Context` holding only listed variables; fields are read through lambdas
   keyed by the table entry; fixed expressions map to lambdas.
3. Medium, CONFIRMED: `email` must not be common. Adopted: email fields are allowed only where
   the variable is the recipient (`RECIPIENT_VARS`, from the mailer code) or the default view
   already shows it.
4. Medium, CONFIRMED: kinds per email. Adopted: `KIND_OVERRIDES` (`@message` is plain text in
   `utterance_share`); records are also checked by class before any field is read.
5. Low: `mailer_t` must use the email's own key and stored message overrides. Adopted:
   `Context#mailer_t` calls `SystemEmailI18n.resolve(template_key, ...)`; argument names are
   limited to the block's placeholders or the names the default view passes; the result is
   escaped once.
6. Low: existing spec constraints and preview 500s. Adopted: `InvalidTemplate` subclasses
   `SystemEmailTemplates::InvalidOverride`, so preview answers 400.
7. Low: missing values in preview render as empty text. Adopted (spec).
8. Low: values that hold markup are now escaped in HTML bodies, matching the default views.
   Listed under risks.
Correction: an earlier version of this note said the secrets named by the reviewer (password
reset codes, gift code verifiers, lesson nonces and share tokens) were not in the table at all.
That stopped being true in review round 2, which added them as fields accepted only in their own
email. Review round 3 removed them as fields: they now reach a body only inside a whole link
built in code (see below).

## Outcome

- Implemented Design A: `lib/system_email_placeholders.rb`; send path
  `app/mailers/concerns/system_email_override.rb`; save path through
  `SystemEmailTemplateSecurity.validate!(text, key)`; preview through `render_preview_body`;
  `SystemEmailTemplates.render_string` replaced by `render_default(key, format, binding)`, which
  reads only the repository file. The editor's Variables tab lists the placeholders each email
  accepts (`placeholders` in the template payload).
- Every output-only default view validates for its own email (spec). A one-off check rendered
  the 40 output-only defaults that ERB could render with sample values through both paths: the
  output was identical (HTML compared after unescaping).
- Falsification: making `SystemEmailPlaceholders.render` evaluate the text with ERB again turned
  13 examples red, including every send-path and preview-path spec; restored from a copy.

## Review round 2 (independent review of the implementation) and what was done

1. Medium, CONFIRMED: `email_changed` was in the recipient table, but the email also goes to the
   previous address (`app/models/concerns/notifiable.rb:12-13`), so the new address could be
   shown to the old one. Removed it. `channels_for` sends every other `mail_message` email only
   to that user's own address, so no other email has this pattern. `forgot_password` sends to one
   address shared by `@users`.
2. Medium, CONFIRMED: `forgot_password` and `lesson_assigned` bodies could be saved without a
   way to include their links. Each link part (`@user.password_reset_code`,
   `@lesson.global_id`, `@lesson.nonce`, `@user.lesson_share_token`, `@gift.code_verifier`) is
   accepted only in its own email. `REQUIRED_PLACEHOLDERS` lists the values whose email does not
   work without them (reset link, lesson link, gift code, supervisor approve and deny links, EU AI
   consent link, revoke links in the consent confirmations); a body missing one is refused at
   save, and at send it falls back to the default view. A preview does not require them and fills
   them with sample values (`SystemEmailPreview::SampleUser`). `OVERRIDE_CONDITIONS` sends the
   default view for several logins on one address and for bulk gifts. The preview helper now sets
   `@users`; before this, a preview of `forgot_password` failed on origin/develop because the
   default view reads `@users.length`.
   Not done: requiring `@user.registration_code` in `confirm_registration` and `@consent_url` in
   `parental_consent_request`. Existing specs save bodies without them
   (`spec/lib/system_email_templates_spec.rb:18`, `spec/mailers/user_mailer_spec.rb:215`), so
   that change needs approval to update those specs. (Superseded: the link parts became whole
   links, and both requirements were added with approval, in review round 3.)
3. Low: a `mailer_t` call must give a value for every placeholder the block lists and every
   `%{name}` in the shipped text. Stored message overrides are limited to the block's list, so
   a body that would always fall back is refused at save.
4. Low: the Variables tab lists, for each email, the longer forms its own default text uses
   (message blocks, dates, fallbacks, fixed expressions) when they are accepted. It also lists the
   required values. A spec checks that every listed entry validates.
5. Low: corrected the comment in `lib/system_email_preview.rb`. Removed the two unused locale keys
   from every locale file; nothing in the app referenced them.
6. The signature escaping assertion now uses a signature that contains `&` and markup.

Falsification for round 2, one mutation at a time, each restored from a copy: removing escaping
(3 red, including the signature example), putting `email_changed` back in the recipient table
(1 red), skipping the required-link check (4 red), skipping the `mailer_t` argument check
(1 red), ignoring the send conditions (1 red).

## Review round 3 (dual review) and what was done

The branch was first brought up to origin/develop 0d50497 (#1291) without a commit (stash,
fast-forward, stash pop). Git merged every file without conflicts. The changed lines before and
after were identical (1584 added or removed lines compared with the backup patch), and all 13
locale files parse.

1. Medium, CONFIRMED: `supervisor_mailer/consent_request` was in `RECIPIENT_VARS` for
   `@communicator`, but the email goes to `relationship.consent_email_sent_to`, which is the owner
   or guardian address when one is set (`app/services/supervisor_consent_service.rb:22,90-98`,
   `app/mailers/supervisor_mailer.rb:19-27`). Removed it. Spec
   `spec/lib/system_email_placeholders_spec.rb` "refuses the communicator email in
   consent_request". Red (1 failure, accepted), green after the fix, red again with the entry
   restored, green after restoring the fix.
2. Medium, CONFIRMED: a body with thousands of nested `long_ordinal_date(` calls exhausted the
   stack in the recursive parser. `SystemStackError` is not a `StandardError`, so save and
   preview answered 500. `parse_expression` now refuses an expression over 512 characters
   (`MAX_EXPRESSION_LENGTH`; the longest one in a shipped view is under 200) before tokenising,
   with the module's normal disallowed-placeholder error. This covers the save, preview and send
   paths, which all parse through it. Specs: one in the placeholder spec, and update and preview in
   the controller spec (400, nothing stored). Red (3 of 3 failed with `SystemStackError`), green,
   red again (3 of 3) with the check removed, green after restoring.
3. Medium, CONFIRMED: the reset code (`forgot_password`), the lesson id, nonce and share token
   (`lesson_assigned`) and the gift code verifier (`gift_created`) were accepted as values of
   their own, so an edited body could place them anywhere in the text, not only in the app's own
   link. They are no longer fields. Three whole-link placeholders, `@password_reset_url`,
   `@lesson_url` and `@gift_redeem_url` (`LINKS`), are built in code in the same shape the default
   views build (`JsonApi::Json.absolute_host` plus the parts). Each is accepted only in its own
   email and listed on that email's Variables tab. A link whose parts are missing raises
   `MissingValue` at send, so the default view goes out instead of a broken link.
   `REQUIRED_PLACEHOLDERS` now requires `@password_reset_url`, `@lesson_url`, and `@gift.code`
   plus `@gift_redeem_url`. The preview fills the links from sample parts only
   (`SystemEmailPreview.sample_links`). The default views are unchanged and still rendered by
   ERB from the repository. Specs: the bare parts are refused in every registered email (and with
   no email) and are never listed; each link is accepted and listed only in its own email; each
   renders the expected URL from real records; a missing part raises; the send path fills the
   reset, lesson and gift links and falls back when a stored body still uses the bare reset code;
   the preview shows sample links and refuses the bare reset code; save and the Variables tab use
   the new required names. The round-2 examples that asserted the bare parts were accepted encoded
   the behaviour this finding replaces. They were rewritten to the new behaviour. Red: 16 failures
   across the three spec files before the fix. Green after the fix. Falsified twice: putting the
   bare reset code back as a field turned 3 item examples red; accepting links in every email
   turned 1 red. Restored and green.
4. Low (test gap): no send-path example read the branding helpers from real domain settings. Added
   one that loads a custom domain with app name, company name, support URL and signature, and
   checks all four appear in the sent email, with no stub. It passed; with `Context#domain_settings`
   changed to ignore the loaded domain, it failed (defaults shown); restored.
5. Low (test gap): no example rendered every listed placeholder through the preview controller.
   Added one that walks every registered email and posts both bodies made of every placeholder that
   email lists; all answer 200. It passed. It failed with `SampleUser#expires_at` removed;
   restored. It exposed no 500s for custom bodies.
   Seen but not fixed: previewing the shipped default view (no custom body for a format) still
   raises for 18 of 50 registered emails, because the preview helper has no stand-in for records
   those views read (`@lesson`, `@gift`, `@communicator`, `@message` and others). The same probe
   found 19 failures on the main checkout at 084552a6b (`forgot_password` was fixed in round 2).
   This predates the branch.
6. Approved by Traci on 2026-11-10: `confirm_registration` requires `@user.registration_code` and
   `parental_consent_request` requires `@consent_url`. The two existing specs that saved bodies
   without them now include the required value in the saved body (and, in the templates spec, in
   the expected stored string). No assertion was removed or loosened. Red: the required-link
   example failed for `confirm_registration`; green after the change; red again with the two
   entries removed; restored.
   Five examples added on this branch (in `spec/lib/system_email_placeholders_spec.rb` and
   `spec/mailers/system_email_override_spec.rb`) used `confirm_registration` bodies without the
   registration code and failed on the new requirement. They are branch-only examples covered by
   the same approval, and each now includes the registration code (or passes
   `require_links: false` where it tests rendering, not saving). No assertion was removed or
   loosened.
7. Locales: the three new keys were in `en.json` only. The repository convention for new keys
   (`docs/TRANSLATIONS.md`, `i18n_generator.rb`, and #1291's keys) is to add them to every locale
   with the English text prefixed `*** `. The three keys were added that way to the 12 other
   locales.

## Review round 3 follow-up (2026-11-15)

1. Decision (Traci, option A): the placeholder list does not limit where in a body an editor places
   a link or code the email carries. Only platform staff can edit
   templates (`require_system_settings_access`, `app/controllers/concerns/api/system_settings_access.rb:14-20`:
   site admins and managers of the admin organization; an ordinary organization manager is
   refused before the write-scope check). Accepted as an insider risk and stated in the header of
   `lib/system_email_placeholders.rb`. Closing it in code (secrets only as server-built links,
   refused inside tags) remains possible later.
2. Six security examples could not fail: their unsafe bodies also lacked the now-required
   registration code, so they were refused for that reason even with the unsafe-expression check
   broken. Shown by a mutation (`compile` skipping an unknown tag instead of raising): 5 failures
   out of 66 before; the three send-path examples in `system_email_override_spec.rb`, the
   `.render` and `set_template!` examples and the controller `update` example stayed green. Each
   unsafe body now also carries the registration code, so the unsafe tag is the only reason to
   refuse it. Same mutation after: 11 failures; restored, 0. All six are branch-only examples.
   A local red-team pass then found three more of the same kind in
   `spec/lib/system_email_placeholders_spec.rb`: the code-block/comment/unclosed list (refused
   for the missing registration code) and the two `parental_consent_request` field examples
   (missing `@consent_url`). Each now carries its email's required value. The list fails with an
   unknown tag skipped; the two field examples fail with the field allowlist check removed;
   restored, 0.
3. The required-link check counted a value written where it never prints: inside
   `long_ordinal_date(...)` (which resolves to '' for a link or code), as a `mailer_t` argument
   (printed only while the message text keeps its `%{name}`), or on the right of `.presence ||`
   (printed only when the left is blank; the red-team pass found this one). `collect_refs` now
   counts plain values and the left side of `.presence ||` only. Red first for each case: the
   example "does not count a required value that is written only where it does not print" failed
   ("nothing was raised"); green after; red again with the old `collect_refs`; restored.
   Placement inside the HTML (a comment, a hidden element) is still not checked; editors are
   trusted (item 1). No default view passes a required value to `mailer_t`,
   `long_ordinal_date` or the right of `.presence ||` (checked with `git grep` over
   `app/views`). The every-default-validates spec does not show this: it skips default bodies
   with code blocks, which covers five of the nine emails with required values.

## Senior-dev pass on PR #1320 (2026-11-15)

`REVIEWED=PR lingolinq/LingoLinq-AAC#1320 at fd035c31fd7ca38904ad4e6fd2020f04f747b84e`, after the
PII preflight (`review-preflight.sh pr 1320`, exit 0). Verdict: approve with comments; no Critical or
High. Traci asked for this pass and for the fixes.

1. Medium, CONFIRMED: a stored body that no longer validates falls back to the default view at send
   with only a log line; the editor showed it as live. The controller's `template_payload` now
   returns `override_errors` (per format, the validation message) for each stored body, and the
   editor shows it above that body's field (`role="alert"`, two new strings in all 13 locales by
   the `*** ` convention). Red first: "show reports a stored body that can no longer be used, per
   format" and "show reports no override errors for the shipped default bodies" failed (no
   `override_errors`); green after; with the error assignment removed the first fails again.
2. Low: no spec for the bulk-gift fallback. Added "sends the default view for a bulk gift even
   when a gift_created body is stored"; it passes, and fails with the gift entry removed from
   `OVERRIDE_CONDITIONS`.
3. Low: could an override escape markup the default view prints raw? Checked: none of the 58
   message blocks the default views use has markup in its shipped text, and
   `SystemEmailI18n.resolve` returns a plain String (not `html_safe`), so the default HTML views
   escape it as the placeholder renderer does. No difference; nothing changed.
4. Not changed: memoising `default_usage` (a per-send cost, not a defect), a frontend rendering test
   for the lists, the indentation nit, and English-only server messages (as before).

Email specs after: 213 examples, 0 failures, 3 pending.

## Log

- Baseline 151 examples, 0 failures, 3 pending.
- After: 176 examples, 0 failures, 3 pending (the same three pending; 25 new examples).
- After review round 2: 189 examples, 0 failures, 3 pending (38 new examples in total).
- Review round 3, on 0d50497 before any change, the ten related files (the round-2 set plus
  `spec/lib/system_email_preview_spec.rb`, `system_email_template_security_spec.rb` and
  `system_email_i18n_spec.rb`): 179 examples, 0 failures, 3 pending.
- After review round 3: 194 examples, 5 failures, 3 pending, then 194, 0 failures, 3 pending once
  the five branch examples carried the required value (item 6 above).
- After the 2026-11-15 follow-up and red-team fixes: 205 examples, 0 failures, 3 pending (the
  email, preview, security, i18n, controller and mailer specs).
