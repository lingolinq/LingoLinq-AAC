# Replace the dead mylingolinq.com web links

Decision: Scot, 2026-10-17. The `mylingolinq.com` web links came from the old
`mycoughdrop.com` pattern and were never a real LingoLinq domain.

## Confirmed facts at base 117a81238 (checked 2026-10-18)

- `mylingolinq.com`, `www.`, `app.` and `blog.mylingolinq.com` do not resolve (`getent hosts`
  returns nothing). `blog.lingolinq.com` does not resolve either.
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

- `spec/mailers/user_mailer_spec.rb` "should have a default reply-to of noreply@mylingolinq.com":
  a pending example with no body. `UserMailer` sets `default from: ENV['DEFAULT_EMAIL_FROM']` and no
  default reply-to at all (`reply_to:` is set per message from the user's own email). The title's
  premise is wrong, not just its address, so it is reported rather than retitled.
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

## Out of scope, found while sweeping

- Each non-English locale file still carries 5 other `blog.lingolinq.com` links under other keys.
  Left for a follow-up.
- Word-art images saved before this change keep `license.author_url` set to the old domain in
  their stored records; changing those is a data task, not part of this PR.

## Validation limits

- Local RSpec could not boot in this worktree: `GoSecure.validate_encryption_key` raises
  `OpenSSL::Cipher::CipherError: bad decrypt` reading the shared test DB's `encryption_hash`
  setting, before any example runs. The shared DB was not modified. CI `rspec` on develop
  117a81238 is green and serves as the backend baseline.
