# 2026-11-09 Ignore the Rails 7.2.3.2 advisories until the Rails 8.1 upgrade

## Why
`security-scan` (`bundle-audit check --update`) fails on every branch with 18 advisories against
Rails 7.2.3.2 (`actionmailbox`, `actionpack`, `actionview`, `activestorage`, `activesupport`). Each
lists fixes only in 8.0.5.2 and 8.1.4.1, so no 7.2.x bump clears them. The job is not a required
check on any branch (main, staging and develop, checked 2026-11-12), so PRs merge over it, and a
check that is always red reports nothing when a new advisory arrives. The Rails 8.1 upgrade is
deferred until after the app release (Scot, 2026-11-09).

## Change
`.bundler-audit.yml` at the repo root ignores these 18 IDs. bundle-audit reads it from the working
directory, and the CI step runs at the root, so `ci.yml` is unchanged. Any advisory not listed
still fails the scan, including a new one against these same gems.

Checked locally with bundler-audit 0.9.3 against `Gemfile.lock` at `develop` `db5cfcef1` and a
freshly updated advisory DB:
- no config: exit 1, the same 18 advisories CI reports;
- a draft ignore list of the 18 IDs, in a scratch directory: exit 0. With the High
  `GHSA-wm3x-v3qw-4jh3` removed from it: exit 1, only that advisory reported;
- this file, run from the repo root as CI runs it: exit 0, "No vulnerabilities found". With the
  Critical `GHSA-f3w6-w445-fwh9` removed from it: exit 1, only that advisory reported.

CI on this PR's first head (`2c2e895e8`, run 42770536445): `security-scan` passed, and its log
shows a fresh `ruby-advisory-db` clone followed by "No vulnerabilities found".

## Deployed check (2026-11-10)
A read-only check of the deployed app was made on 2026-11-10. Its results are kept in the
private draft security advisory for these Rails advisories.

## Exposure, per advisory
Read at `develop` `db5cfcef1`. "Not used" means a `git grep` over `app/` (excluding the Ember
frontend), `lib/` and `config/` found no use.

| Advisory | Gem | Severity | Why it does not reach this app |
|---|---|---|---|
| GHSA-f3w6-w445-fwh9 | activestorage | Critical | Active Storage is unused (below) |
| GHSA-v924-7rp8-4mxh | activestorage | High | Active Storage is unused |
| GHSA-3f4q-8x5m-76v8, GHSA-3w93-6hmw-whh4, GHSA-hfr4-8rjc-97m2, GHSA-p2pm-g2h6-7j5j | activestorage | Low to Medium | Active Storage is unused |
| GHSA-x6mj-8jx9-qhqv | actionpack | Medium | Active Storage proxy mode; Active Storage is unused |
| GHSA-wm3x-v3qw-4jh3 | actionpack | High | Needs the app to pass `params.each_key`'s return value to mass assignment. No Ruby code calls `each_key` |
| GHSA-8474-xrp6-wh69 | activesupport | High | The unauthenticated path is Action Cable's `subscribe`. `config/application.rb` sets `config.action_cable.mount_path = nil`, there is no `app/channels/`, and the frontend connects to the separate `LLWEBSOCKET_URL` service. The app's other `safe_constantize` callers pass fixed or stored names (`Api::SchemaExplorer#allowed_model` reads the `ALLOWED_MODELS` allowlist; `lib/flusher.rb` reads `item_type` from the database). Rails' own `ActionDispatch::ActionableExceptions` passes the request's `error` param to `safe_constantize`, but that middleware is added only when `consider_all_requests_local` is true: development and test, not production (`config/environments/production.rb:24`). Local dev servers are exposed; deployed ones are not |
| GHSA-2586-8ghr-69fj | actionpack | Medium | CacheStore sessions only; `config/initializers/session_store.rb` uses `:cookie_store` |
| GHSA-gmj8-hvj3-49mw | actionpack | Low | Sessions use `:cookie_store` (`config/initializers/session_store.rb`), which this advisory does not affect; it also sets `same_site: :lax` explicitly |
| GHSA-rwvh-fw6r-pwvp | actionpack | Medium | `ActionController::Live` is not used |
| GHSA-2p2f-4rq4-gjwc, GHSA-v6rj-xm57-3p59, GHSA-rq8q-p985-fjq7 | actionview | Medium | `highlight`, `simple_format` and `strip_tags` are not called in `app/views`, `app/helpers` or `app/mailers`. For GHSA-2p2f, `Gemfile.lock` also already has the sanitizer versions the fix depends on (rails-html-sanitizer 1.7.2, loofah 2.25.3, nokogiri 1.19.7) |
| GHSA-68p9-83h6-5wpj | actionview | Medium | Needs user-chosen HTML attribute names. The tag helpers in `app/views` (`link_to`, `form_tag`, `hidden_field_tag`, `javascript_include_tag`, `stylesheet_link_tag`, `csrf_meta_tags`) all use literal attribute names |
| GHSA-5957-c7qm-m469 | actionmailbox | Low | No Action Mailbox ingress is configured |
| **GHSA-r9jg-fmfx-2gv6** | actionpack | Medium | **Accepted risk until the Rails 8.1 upgrade.** The reasoning is in the private draft advisory |

"Active Storage is unused": no model declares `has_one_attached` or `has_many_attached`, no
environment sets `config.active_storage.service`, and `config/storage.yml` defines only the Disk
`test` and `local` services, none for GCS. `require 'rails/all'` still loads the engine, but
`config.active_storage.draw_routes = false` (`config/application.rb`, added 2026-11-12) keeps its
routes undrawn, so no request reaches it (`spec/routing/active_storage_routes_spec.rb`).

## Not covered
- Scan coverage outside this job is recorded in the private draft advisory.
- Optional hardening, not done here: replacing `require 'rails/all'` with the frameworks the app
  uses would stop Active Storage and Action Mailbox from loading at all.

## Removal
Delete `.bundler-audit.yml` in the Rails 8.1 upgrade PR. An ignored ID left behind after the
upgrade is harmless, since the fixed version no longer matches, but it would hide a regression to
7.2.
