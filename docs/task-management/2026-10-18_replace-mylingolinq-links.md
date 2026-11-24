# Replace the dead mylingolinq.com web links

Decision: Scot, 2026-10-17. The `mylingolinq.com` web links came from the old
`mycoughdrop.com` pattern and were never a real LingoLinq domain.

## Confirmed facts at base 117a81238 (checked 2026-10-18)

- None of the `mylingolinq.com` hosts serve LingoLinq, and `blog.lingolinq.com` serves nothing,
  so every one of these links was dead.
- `https://www.lingolinq.com/` returns 301 to `https://app.lingolinq.com:443/`;
  `https://app.lingolinq.com/images/logo-new.png` returns 200. `/download` is an Ember route
  (`app/frontend/app/router.js`: `this.route('download', { path: '/download' })`); a 200 alone proves nothing there,
  because the app shell answers 200 for any path.
- `git grep -i 'mylingolinq\.com'` listed 26 lines; `git grep -i mylingolinq` listed 85, the rest
  being `com.mylingolinq.*` bundle IDs and the reserved username in `config/routes.rb`.

## Runtime changes (fix-proposal facts)

`capabilities.fallback_host` (`app/frontend/app/utils/capabilities.js`):
- Read only inside `capabilities.video_player_host` (CONFIRMED: `git grep fallback_host` lists the
  assignment and two reads in that function, nothing else, tests included).
- Reached when `capabilities.api_host` is not an https host (or is http on an https page) AND
  `window.default_host` is empty. `window.default_host` comes from `ENV['DEFAULT_HOST']` via
  `app/assets/javascripts/globals.js.erb`.
- Consumers build a `/videos/:source/:id` iframe URL from it (`components/inline-video.js`,
  `components/button-settings.js`, and their controller twins). Rails serves that route
  (`config/routes.rb`: `get '/videos/:source/:id' => 'boards#video'`).
- Old value pointed at a host with no DNS, so that path always failed. New value is the
  production app host. No path that worked before changes.

`authenticateSession` redirect branch (`app/frontend/app/controllers/application.js`):
- The branch ran only when `location.hostname == 'www.mylingolinq.com'`. That host has no DNS, so
  the app was never served from it and the branch was unreachable. Every other host already took
  the `else` branch (`this.router.transitionTo('login')`). Only caller: the "sign back in" link in
  `templates/user/password_reset.hbs`.
- Deleted. Two comment lines take its place so the 17 line-anchored `.eslint-todo` rows below it
  in that file do not move (re-anchoring the baseline needs approval, Rule #0.14). Proven both
  ways: without the two lines `npm run lint:js:ci` reports `new=17`; with them, `new=0`.

Other values that reach runtime:
- Share check (`capabilities.js`, `window.plugins.socialsharing.canShareVia`): the image and URL
  arguments now point at live hosts. If the Android plugin fetches the image before answering
  (unverified; no plugin wrapper is in this repo), share targets that always failed against the
  dead host could now pass the check.
- Version-history admin modifier image (`lib/json_api/board_version.rb`, `user_version.rb`) and
  the Windows release Slack message (`lib/tasks/extras.rake`) now name live URLs.
- The mapping uses absolute production URLs as decided in the task; staging, dev and white-label
  hosts also send these links to production.

## Kept lines and why

- `spec/mailers/user_mailer_spec.rb` pending example "should have a default reply-to": no body.
  `UserMailer` sets `default from: ENV['DEFAULT_EMAIL_FROM']` and no default reply-to at all
  (`reply_to:` is set per message from the user's own email), so the title's premise is wrong, not
  just its address. The first pass left it alone; on Scot's second-pass instruction the old address
  was dropped from the title, and it stays pending.
- `docs/native-apps/store-identity-disposition.md` row "Marketing/download domain": a dated
  Phase 1 evidence table whose line cites already point at older code; the task fences that
  directory. Reported for a follow-up correction.

## Cloud extras string and styles

- English renders the inline `{{t}}` text; the other 12 locales render their own
  `5_years_cloud_extras` value, which linked to `blog.lingolinq.com` (no DNS either). The anchor
  tags were stripped from that one key in every locale, keeping the translated words.
- The two removed `app.scss` selectors (`.subscription-form-cards a[href*='blog.mylingolinq.com']`)
  matched nothing: `.subscription-form-cards` is only in `subscription-form.hbs`, which has no blog
  link, and `gift_purchase.hbs` is not inside it.

## Second pass (Scot, 2026-10-18): blog, Zendesk, store links, word art

Scot: anything still linking to `mylingolinq.com`, to the blog, or to the Zendesk help
center links somewhere else. Decisions taken with him in the session:

- **Help links go to the contact page** (the `contact` route in `router.js`). In-app links
  use `<LinkTo @route="contact">`, which keeps the current host and the installed-app
  (`no_linky`) state: the three browser-privacy links (`login-form.hbs`, `register.hbs`,
  `bad-privacy-settings.hbs`) and the iOS help card on both support templates. The privacy
  links' text promised a how-to article, so it now reads "Contact us for help setting up your
  browser for %app_name%" (new key `contact_browser_privacy_help` in `en.json`; other locales
  show the English text until translated, and `learn_privacy` is now unused). Absolute
  `https://app.lingolinq.com/contact` is used where a full URL is needed: a commented-out
  loader line in `boards/index.html.erb`, the
  Ember-dev-server `domain_settings` stub in `index.html`, and `.env.example`
  `SUPPORT_URL`. The deployed `support_url` comes from `ENV['SUPPORT_URL']` merged with the
  System Settings app defaults (`lib/json_api/json.rb`, `lib/system_app_defaults.rb`);
  `SUPPORT_URL` is not set on the prod, staging or dev Cloud Run services (checked
  2026-10-18), so this PR adds no backend default.
- **Welcome email template** (`user_mailer/welcome_confirm_registration.*.erb`): no mailer
  method renders it (`git grep welcome_confirm_registration` finds only the two files). Its
  two help-center sentences became one contact-page sentence anyway.
- **Blog links**: the five other keys carrying `blog.lingolinq.com` (`included_in_subscription`,
  `5_years_added`, `5_years_included`, `for_supported_communicators`,
  `for_supported_communicators2`) are not used by any template or code, and `en.json` has none
  of them. The anchors were stripped in all 12 locales anyway; the words stay.
- **Store links**: the deploy Slack message (`extras.rake` `extras:deploy_notification`)
  linked the Play listing for `com.mylingolinq.lingolinq` (404), the App Store id
  `1021384570` (CoughDrop's listing) and an Amazon listing from the same rename. All now
  point at `/download`; the `.env.example` store examples are emptied.
- **Kept on purpose**: the `com.mylingolinq.*` bundle IDs in the purchase code (left for the
  native-apps in-app-purchase work, which already plans to rework that code), and the
  reserved username `'mylingolinq'` in `config/routes.rb` (keeps a stranger from taking it).
- **Word art**: saved images keep `license.author_url` in `button_images.settings`, which is
  `secure_serialize`d (encrypted), so SQL cannot filter it. Migration
  `20261018120000_rewrite_legacy_word_art_author_url.rb` decrypts every row in batches of 50
  (settings can carry an unconfirmed upload's data URI, up to 512KB, and the migrate job has
  512Mi), and rewrites any `author_url` whose parsed host is `mylingolinq.com` or a subdomain,
  in the main license, the fallback image's license (`ButtonImage#assert_fallback` copies it)
  and every `library_alternates` license, to `https://www.lingolinq.com`.
  - Each write is a compare-and-swap on the ciphertext it read
    (`where(id:, settings: raw)`), re-reading and retrying up to 5 times, because the
    previous web revision and workers keep saving images while the migrate job runs.
  - Rows that cannot be decrypted, and rows still being written after 5 attempts, are listed
    by id in the migration output, not skipped silently; the migration does not fail on them,
    since that would block the deploy. A non-Hash `library_alternates` is ignored rather than
    aborting the job.
  - Cost scales with the `button_images` row count, since every row is decrypted.
- **Stale clients**: a browser or offline app still running older code sends the old address
  in a new image's license. `Processable#process_license` (boards, images, sounds, videos) now
  passes the license through `LegacyLinks.normalize_license` (`lib/legacy_links.rb`), which the
  migration also uses. `processable.rb` requires it explicitly, as `board.rb` does for
  `art50_marker`, because `config/application.rb` skips `lib/` autoload when
  `RESQUE_WORKER=='true'`. (That mode is not set on the prod worker pool or migrate job, checked
  2026-10-19, and booting with it already fails at `config/environment.rb` on `AppSearcher`.) Residue this does not cover: rows written by the previous revision
  between the migrate job and traffic moving, and rows the staging web service (older code,
  same database as dev) writes before this change reaches staging. Both are attribution
  links on test data; a later run of the same rewrite would catch them.
- **Specs**: `spec/lib/legacy_links_spec.rb`; in `spec/models/button_image_spec.rb`, the
  `process_params` legacy-domain example and the "RewriteLegacyWordArtAuthorUrl backfill"
  group. Each was seen red first: the backfill with an empty `up`, the userinfo URL with the
  first regex, the concurrent-write example without the compare-and-swap (width reverted to
  100), the unreadable-row and gave-up-row reports, the fallback copy with that line removed, the non-Hash
  alternates (crashed), and the write path without `normalize_license`.

## Validation limits

- The shared local test DB fails at boot (`GoSecure.validate_encryption_key` raises
  `OpenSSL::Cipher::CipherError: bad decrypt` reading its `encryption_hash` setting). It was
  not touched. Specs ran instead against a private database:
  `createdb lingolinq-test-29b9c978`, then `DATABASE_URL=postgres:///lingolinq-test-29b9c978`
  with `db:schema:load`.
- `spec/lib/json_api/board_version_spec.rb` fails 2 examples when the local `.env`
  `OPENSYMBOLS_SECRET` is loaded (a real request to opensymbols.org that WebMock blocks); with
  it unset, 13 of 13 pass. CI does not set it.
