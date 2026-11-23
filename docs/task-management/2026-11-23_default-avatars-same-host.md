# Default avatars: serve the app's own copy, not the S3 bucket (2026-11-23)

Traci, 2026-11-23: "link to the app's own copy everywhere - handle what needs to be handled with it". Branch
`traci/fix/default-avatars-same-host` (worktree `~/LingoLinq-AAC-avatars`), from develop `003c22753`. Sync and offline
store these URLs, so `/fix-proposal` applies.

Lessons consulted: `learnings-archive/LEARNINGS-2026-01_to_2026-09.md` "A source-level fix plus a green unit test is
not evidence" (`current_host` -> `absolute_host`: a test fixture with an already-absolute `DEFAULT_HOST` made ~130
assertions no-ops; `spec/spec_helper.rb:104` now sets a BARE `test.host` on purpose), and the avatar asset entry
(`app/frontend/public/avatars/` must exist; it does).

## Fact sheet

**(a) Where the default avatar URL is written and read**

Writers of the S3 URL (CONFIRMED, develop `003c22753`):
- W1 `User#generated_avatar_url` (`app/models/user.rb:2386-2419`): outside development the fallback is
  `https://#{STATIC_S3_BUCKET || 'lingolinq'}.s3.amazonaws.com/avatars/avatar-#{id % 10}.png` (:2392-2393);
  development uses the relative `/avatars/avatar-N.png` (:2390) and returns early (:2398-2404).
- W2 `User#process_sidebar...` contact action (`app/models/user.rb:3311-3316`): a contact added without a picture gets
  the S3 URL, STORED in `settings['contacts'][i]['image_url']`.
- W3 `lib/json_api/board_version.rb:96` and W4 `lib/json_api/user_version.rb:45`: "Unknown User" modifier image, JSON
  only, not stored.

Callers of W1 (CONFIRMED by `git grep generated_avatar_url`): `lib/json_api/user.rb:26,27,352,501`,
`lib/json_api/badge.rb:36`, `lib/json_api/alert.rb:26,37`, `users_controller.rb:111`, `session_controller.rb:640`,
`organizations_controller.rb:147`, `log_session.rb:1223` (STORED into a message's data), `user.rb:2424-2425`
(`prior_avatar_urls`).

Readers on the client (CONFIRMED):
- `<img src>`: `templates/user/index.hbs:115` and the classic rail/view components, each with
  `rel={{path "avatars/avatar-0.png"}} {{image-fallback-to-rel}}`; no CORS needed for `<img>`.
- Sync saves the avatar: `services/persistence.js:3483-3485` (own) and `:2522-2523` (supervisees), only when
  `LingoLinq.remote_url(url)` (`app.js:112`: starts with http and is not `http://localhost`). The fetch route
  (`services/persistence.js:1545-1550`): a URL that is not on the trusted/uploads list is not `cors_match`, so it goes
  through `/api/v1/search/proxy` (:1634). Today's S3 avatar already takes that route.
- `user.js:393` and `helpers/is-default-avatar.js` recognise any URL containing `/avatars/avatar-N`.

**(b) Every shape the avatar URL can hold**

| Shape | Writer | After this change |
|---|---|---|
| no `settings['avatar_url']`, or `'fallback'` / `'default'` | W1 fallback | same-host absolute URL |
| a custom upload URL | the profile picture upload | unchanged |
| a saved S3 default URL (picked from `prior_avatar_urls`, `user.rb:2848-2854` accepts any http URL) | the user | to decide (candidate B) |
| contact `image_url` S3 default (stored, W2) | contact add | new contacts: same host; stored ones: to decide |
| message `image_url` (stored, `log_session.rb:1223`) | message send | new messages: same host; stored ones unchanged |
| development | W1 dev branch | unchanged (relative `/avatars/...`, never synced: `remote_url` is false) |

**(c) Cross-file claims**
- CONFIRMED `lib/json_api/json.rb:185-205`: `absolute_host` is the request's `protocol + host` in a request, else
  `https://` + `ENV['DEFAULT_HOST']`; idempotent on a host that has a scheme.
- CONFIRMED by request: `https://app.lingolinq.com`, `https://staging.lingolinq.com`, `https://dev.lingolinq.com`
  each answer `/avatars/avatar-7.png` with 200 `image/png` (2026-11-23). Production serves `public/`
  (`RAILS_SERVE_STATIC_FILES=true`, `deploy-cloudrun.yml:457`); `public/avatars/avatar-0..9.png` are tracked.
- CONFIRMED the proxy allows the app's own host: `search_controller.rb#proxy` fetches through `SafeHttp`, which blocks
  loopback, link-local and private addresses only (`lib/uploader.rb:188-195`); the deployed hosts are public.
- CONFIRMED no `img-src` policy in this repo or `~/lingolinq_mobile` (`git grep img-src`: none).
- CONFIRMED no JSON caching on these paths (`lib/json_api/user.rb`, `json.rb`: no `Rails.cache`).
- NOT RESOLVED: whether each deployed `STATIC_S3_BUCKET` still serves `avatars/` (the stored S3 URLs depend on it).
  The GitHub variable listing failed and reading Cloud Run env was refused by the permission system. Dev's bucket
  `lingolinq-dev-static` answers 200; the `lingolinq` fallback answers 403.

## Proposal

Diagnosis: four writers build the default avatar from `STATIC_S3_BUCKET`; the app already serves the same files on
every deployed host. Native apps need an absolute URL; the sync saves it through the proxy either way.

- **A (recommended).** One helper, `User.default_avatar_url(n)` = `"#{JsonApi::Json.absolute_host}/avatars/avatar-#{n}.png"`,
  used by W1 (non-development fallback), W2, W3, W4. Plus `User.same_host_avatar(url)`, which maps a URL of the exact
  shape `https://<bucket>.s3.amazonaws.com/avatars/avatar-<0-9>.png` to `default_avatar_url(n)` and returns any other
  URL unchanged, applied where stored values are READ for display: `generated_avatar_url` (a saved avatar_url) and
  `lib/json_api/user.rb:67` (contacts). Stored data is not rewritten (no migration).
- **B.** A only for the four writers; stored S3 URLs stay as they are. Simpler, but a saved S3 default keeps loading
  from the bucket, and breaks if that bucket stops serving `avatars/` (unresolved above).
- **C (rejected).** Return the relative `/avatars/...` and resolve it on the client. Native apps would need a client
  change at every `<img>`, and `remote_url` is false for a relative URL, so the sync would never save it offline.
- **D (not now).** Map default avatars on the client to the copy bundled in the app (`app/frontend/public/avatars`,
  shipped in native builds): no network at all. Touches every `<img>` site and the sync; larger, separate.

Risks:
- Custom domains: in a request on an organisation's custom domain, `absolute_host` is that domain. It serves the same
  app, so `/avatars` resolves (ASSUMED for any custom domain not yet live; none checked).
- Worker context (no request): `https://DEFAULT_HOST`. Messages written by a worker would carry the default host.
- Stored message `image_url` values (`log_session.rb:1223`) keep the S3 URL; A does not map them (they are read in
  many message views). Listed as not covered.
- `spec/lib/json_api/user_version_spec.rb:52` asserts the S3 URL; it encodes the behaviour Traci asked to change, so
  it is updated with the spec change and named in the PR.

Tests (red first):
- `user_spec.rb` `generated_avatar_url`: with `DEFAULT_HOST` bare (`test.host`) and a `STATIC_S3_BUCKET` set, the
  fallback equals `https://test.host/avatars/avatar-N.png` (fails today: S3). Inside a request host
  (`JsonApi::Json.set_host`), it uses that host.
- A saved S3 default avatar_url is returned as the same-host URL; a custom upload URL is returned unchanged; a URL
  that only resembles the shape (another path, `avatar-10.png`, a different host) is unchanged.
- Contact added without a picture stores the same-host URL; contacts JSON maps a stored S3 default.
- board_version / user_version modifier image is the same-host URL.
- Mutations that must go red: the fallback back to S3; `same_host_avatar` returning its input; a looser pattern that
  rewrites a custom URL.

## Review round 1 (adversary, e742e7a2f): proceed with A, with changes. Checked here.

- **CONFIRMED, and a correction to the fact sheet above:** specs do NOT run with `DEFAULT_HOST=test.host` on this
  machine. `rails runner` in the test env prints `"localhost:3000"` (from `.env.op.template:115`, loaded first; dotenv
  does not overwrite), so `spec_helper.rb:104`'s `||= 'test.host'` never applies here and `absolute_host` is
  `http://localhost:3000`. The red tests fail for the right reason today but could not pass after a correct fix.
  Fix: pin a bare `DEFAULT_HOST` inside the new describe's `around` block. CI's value is not checked.
- **CONFIRMED:** the client sends `avatar_url` back on every user save (`models/user.js:101`, plain `attr`), and
  `user.rb:2848-2854` stores any `http` URL and pushes the old one onto `prior_avatar_urls`. So saved S3 default URLs
  are likely common already, and after the change a save would store a URL tied to one host. Fix: on write, store
  `'fallback'` for a default-shaped URL (any `*.s3.amazonaws.com/avatars/avatar-N.png`, or `/avatars/avatar-N.png`
  on a trusted app host); map `prior_avatar_urls` on read; add a users#update round-trip test.
- To check before acting (reviewer's, not yet verified here): contact pictures copied into message data
  (`log_session.rb:1263`, `:1771`) and read by `alert.rb:21`, `log.rb:41`, `json_api/utterance.rb:32`; the web client
  sends a CloudFront picture for new contacts (`controllers/user/edit.js:325-330`), so the server's contact fallback is
  API-only; the S3 pattern must match any bucket (staging and dev share a database; the `lingolinq` fallback bucket).
- Needs Traci's explicit OK (Rule 14): changing `spec/lib/json_api/user_version_spec.rb:52`, which asserts the S3 URL.
- Citation fix: SafeHttp's address checks are `lib/safe_http.rb:121-133`, not `lib/uploader.rb`.

Stopped here under Rule #0.13 (three self-inflicted errors close together: a failed variable listing, a guessed
contact test rewritten before running, and the wrong test-host fact). No app code changed.

Next, in order: pin DEFAULT_HOST in the spec and re-run red; verify the three "to check" items; write-time
normalization + read-time mapping (avatar_url, prior_avatar_urls, contacts, and the message/alert readers if
confirmed); the four writers; falsify; one review.

## Implementation (655fd178e) and test run

- `app/models/concerns/default_avatar.rb` (new; concerns are loaded in workers too, lib/ is not:
  `config/application.rb:88`): `url(n)`, `index(url)`, `on_app_host(url)`, `contact(hash)`, `app_host?`.
- Writers: `User#generated_avatar_url` (non-development fallback), the contact fallback in `process_params`,
  `board_version.rb` / `user_version.rb` "Unknown User". Write side: a picked default of the person's own number is
  saved as `'fallback'`.
- Readers mapped: `generated_avatar_url` (saved avatar_url), `prior_avatar_urls` (now a new list; it no longer appends
  to the saved one), `json_api/user.rb` contacts, `alert.rb` author and prior_author, `log.rb` author contact,
  `utterance.rb` reply author. Stored data is not rewritten.
- `spec/lib/json_api/user_version_spec.rb:52` changed with Traci's OK (2026-11-23).
- Not fixed, seen in passing: `alert.rb:17` tests `'priot_contact'` (typo), so `prior_author` is never set.

Run (user, json_api user/alert/log/utterance/user_version/board_version, log_session specs): 781 examples, 14 failures.
- 11 fail on the base commit too (04be19443, no app change; checked in a throwaway checkout): `add_premium_voice` (8,
  `user_spec.rb:3001-3104`) and usage tracking (`:4886`, `:4901`, `:4919`), all `AuditEvent.count` off by one. Not this
  change. The test database had no leftover audit_events rows.
- 3 pass on the base and fail here because they assert the S3 address, the behaviour being changed:
  `user_spec.rb:1864` (`/amazonaws/` for a new contact), `json_api/user_spec.rb:51` and `:56`. Waiting on Traci's OK
  before changing them (Rule #0.14).
- All 9 new examples pass.
