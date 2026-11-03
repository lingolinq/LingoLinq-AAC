# 2026-11-02 Security bump: loofah, rails-html-sanitizer, nokogiri, resque

## Why
`security-scan` (bundler-audit, `.github/workflows/ci.yml:713`) began failing on every branch on
2026-11-02 when 15 advisories were published against the versions locked on `develop`. First seen
on PR #1258, which passed the same scan earlier that day and changes no dependencies.

| Gem | Was | Now | Advisories | Fixed in |
|---|---|---|---|---|
| loofah | 2.25.2 | 2.25.3 | GHSA-345x-3rq2-jfrm, GHSA-h6v6-rg66-fqj4, GHSA-jcff-cj73-4w4f, GHSA-m3x9-938q-5767, GHSA-mf2j-8f84-cc9q, GHSA-p9wj-w8xq-vjx6 | 2.25.3 |
| rails-html-sanitizer | 1.7.1 | 1.7.2 | GHSA-cpgf-5mjf-73p7, GHSA-h7wh-q2qr-458c | 1.7.2 |
| nokogiri | 1.19.4 | 1.19.7 | GHSA-3w22-6jfg-527w, GHSA-4p39-36wj-23h4, GHSA-v995-44v6-5fqm (JRuby only) | 1.19.5 |
| resque | 3.0.0 | 3.2.0 | GHSA-5r7x-x5pm-94xj, GHSA-m39q-9jm7-xp4q, GHSA-r23w-h6cg-h95q, GHSA-r5h4-xh93-f339 | 3.2.0 (CSRF) |

## Decisions
- `bundle update --conservative` on the four gems only; no other lockfile entry moved.
- Floors added in the Gemfile with advisory comments, matching the existing security pins, so a
  lockfile conflict cannot resolve back to a vulnerable version. nokogiri gets a direct floor like
  crass (transitive).
- No "too new" skip as in #1254: loofah 2.25.3 (changelog 2026-11-01, rubygems 2026-11-02), rails-html-sanitizer 1.7.2 and
  nokogiri 1.19.5 to 1.19.7 (pushed to rubygems 2026-11-02) are the first fixed releases, so no
  older fixed release exists. nokogiri 1.19.6 and 1.19.7
  only fix a JRuby regression and a Ruby 4.1 preview build, so on CRuby they match 1.19.5.
- resque 3.0 to 3.2 is a minor jump. 3.1.0 breaking changes checked: Ruby >= 3.2 (we run 3.4.4)
  and Redis server >= 4.0 for `UNLINK` (Memorystore `lingolinq-prod-redis` and
  `lingolinq-nonprod-redis` are both REDIS_7_2, read with `gcloud redis instances list`). The
  `resque:preload` task is now a no-op. That changes nothing for our workers: they start with
  `rake environment resque:work` (`bin/docker-worker-entrypoint:65`, `Procfile`), and under rake
  railties 7.2 sets `eager_load = rake_eager_load` (false; `rails/application.rb:560`), so the
  3.0 preload, which checked `eager_load`, never ran for them either.

## Verified
- `bundle-audit check`: no vulnerabilities.
- resque-web is mounted at `/jobby` behind `AdminConstraint` (`config/routes.rb:35`), so the resque
  advisories apply. Probe of `Resque::Server` 3.2.0 with Rack::MockRequest, POST `/failed/clear`:
  `Sec-Fetch-Site: same-origin` 303, `cross-site` 403, matching `Origin` 303, foreign `Origin` 403,
  no headers 303. Admin dashboard actions from our own origin keep working.
- Full RSpec: 8428 examples, 17 failures. The same 17 fail on `origin/develop` (226e476c2, resque
  3.0.0) in this environment: AuditEvent rows orphaned in the local test DB, the boards
  homescreen specs that need a built `vendor.js`, throttling, and one subscription example. None
  are introduced by the bump.

## Review (canonical passes on ec0897451)
`REVIEWED=range origin/develop (226e476c2d7bdc03109cef83e054065c1e291811) ... traci/security/loofah-nokogiri-resque-bump (ec089745149ab839126ec11b4cc6b379a4f60dd2) in /Users/traciday/Documents/GitHub/lingolinq/LingoLinq-AAC-gem-bump`
- Senior-dev (`/review-pr`): approve with comments; no Critical, High or Medium. Two Low log nits
  (the eager-load reason, the loofah date), both fixed above.
- Adversary: ship; four Low, no runtime regression. Folded in:
  - nokogiri 1.19.4 to 1.19.5 rewrites the CSS-to-XPath visitor, `XML::Builder` namespace binding
    and `HTML5.fragment` noscript checks. The reviewer compiled every app selector
    (`lib/converters/html_board.rb`, the SAML `md|...` selectors in `session_controller.rb`) on
    both versions: equivalent XPath; SAML metadata byte-identical; `Sanitize.fragment` output
    identical except the intended `mpath` fix. No app code uses `XML::Builder`.
  - resque-web's guard falls back to comparing `Origin` with `host_with_port` when
    `Sec-Fetch-Site` is absent, so a proxy that rewrites `X-Forwarded-Host` would get 403 on
    dashboard POSTs. Fails closed; Cloud Run does not set that header. If an admin reports a 403
    on retry or clear, check proxy headers first. The old GET `/jobby/failed/requeue/:i` and
    `/remove/:i` URLs now 404; nothing in the repo links to them.
  - The CSRF probe hit bare `Resque::Server`, not the `/jobby` mount through `AdminConstraint`.
    The mount did not change; a request spec for it is an optional follow-up.
- Targeted specs across both passes: svg_sanitizer, processable, worker, resque_redis_options,
  session_controller saml: 181 examples, 0 failures.

## Lessons
- bundler-audit fetches the advisory DB on every CI run, so a newly published advisory fails every
  open PR at once. Check whether `develop`'s lockfile has the same version before treating a red
  `security-scan` as the PR's fault.
