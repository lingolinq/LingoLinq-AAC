# Rails 8.1 upgrade: research and plan

Status: research complete, no application change made (2026-11-07). Tracks GitHub #1278.

**Summary.** Rails 7.2 is end of life and the 18 advisories failing `security-scan` are fixed only
on 8.x; 8.0 leaves support today, so the target is 8.1.4.1. A trial upgrade needed three Gemfile
lines plus moving one constant out of `config/routes.rb`. On 8.1 the app boots, precompiles,
serves pages and API calls, sends Ember byte-identical JSON, and the full suite has no new
confirmed failures. Ember needs no change.
Branch: `traci/docs/rails-8-upgrade-plan` (worktree `LingoLinq-AAC-rails8`), from develop `eea21d4e1`.
The trial upgrade ran in a separate, uncommitted scratch worktree (`LingoLinq-AAC-rails8-spike`)
against its own test database (`lingolinq-test-rails8`).

Every claim is labelled CONFIRMED (with the source) or PLAUSIBLE (inferred, not yet proven).

## 1. Why the upgrade is needed

- `security-scan` runs `bundle-audit check --update`, which fails when any locked gem is below an
  advisory's patched version (`.github/workflows/ci.yml:805-853`). CONFIRMED.
- 18 advisories published 2026-11-04 affect Rails 7.2.3.2: actionpack 6, activestorage 6,
  actionview 4, actionmailbox 1, activesupport 1. Every one lists patched versions
  `~> 8.0.5, >= 8.0.5.2` or `>= 8.1.4.1`, and none lists a 7.2 version. CONFIRMED
  (rubysec/ruby-advisory-db, merged in https://github.com/rubysec/ruby-advisory-db/pull/1297).
- 7.2 is out of support. Its security support ended 2026-08-09, and 7.2.4 (2026-09-24) was announced
  as the last 7.2 release. CONFIRMED (https://rubyonrails.org/2025/10/29/new-rails-releases-and-end-of-support-announcement,
  https://rubyonrails.org/2026/9/24/Rails-Version-7-2-4-has-been-released).
- For an unsupported series, "it's your own responsibility to deal with bugs and security issues".
  CONFIRMED (https://rubyonrails.org/maintenance).

### Alternatives considered

- **Ignore the advisories in bundle-audit.** This turns the check green without fixing anything, the
  act Rule 14 forbids. Rejected.
- **Require only the Rails frameworks we use.** Dropping activestorage and actionmailbox (both unused:
  no Active Storage tables in `db/schema.rb`, no references in code; CONFIRMED by the code inventory)
  clears 7 of the 18. The other 11 are in actionpack, actionview and activesupport, which every
  request uses. This is a worthwhile cleanup but does not remove the need to upgrade.
- **Patch 7.2 ourselves.** That means maintaining a private Rails fork indefinitely. Rejected.

## 2. Target version: 8.1, not 8.0

| Series | Latest | Security support until | Source |
|---|---|---|---|
| 7.2 | 7.2.4 | 2026-08-09 (ended) | announcement above |
| 8.0 | 8.0.5.2 | **2026-11-07 (today)** | rubyonrails.org/maintenance |
| 8.1 | 8.1.4.1 | 2027-10-10 | rubyonrails.org/maintenance |

All rows CONFIRMED (maintenance page and rubygems.org/api/v1/versions/rails.json, read 2026-11-07).
Landing on 8.0 would leave us unsupported straight away, so the target is **8.1.4.1**. There is no
8.2 release yet (main is `8.2.0.alpha`). Ruby 3.4.4 meets the `>= 3.2.0` minimum (CONFIRMED, gemspec).

The Rails guide normally recommends one minor version at a time. Here 8.0 is a waypoint to test
against, not a release to ship.

## 3. What the trial upgrade showed (empirical, CONFIRMED by running it)

Gemfile changes used in the trial (3 lines):

```ruby
gem 'rails', '~> 8.1.4', '>= 8.1.4.1'   # was '>= 7.2.3.2', '< 7.3'
gem 'paper_trail', '~> 17.0'            # was '~> 15.0'
gem 'rspec-rails', '~> 8.1'             # was unpinned, locked 6.1.5
```

`bundle update rails paper_trail rspec-rails --conservative` resolved with no conflicts. minitest
stayed at 5.27.0 (an unconservative resolve pulls minitest 6.1.0; see the gem table).

| Check | 7.2 (develop) | 8.1 (trial) |
|---|---|---|
| Boot and `eager_load!` (production code paths) | OK | OK, no warnings |
| `assets:precompile` (Sprockets, Ember bundle) | OK | OK, same manifest (application.js/.css, globals.js) |
| Puma 7.2.1 production boot, `GET /`, a compiled asset, a public API call | n/a | all 200; API JSON well formed |
| Route file (`rails routes`, 436 lines) | OK | OK, 0 deprecation warnings |
| JSON sent to Ember (to_json, ActiveSupport::JSON, Oj) for strings with `<>&`, U+2028, times, time-with-zone, BigDecimal, Duration, Range | baseline | **byte-identical** |
| `to_time` on String, TimeWithZone, DateTime | baseline | identical |
| Bundled `actioncable.js` (included in application.js; used by `app/frontend/app/utils/sync.js:184`) | 16,474 bytes | identical (no diff) |
| Rails deprecation warnings during the full suite | 0 | 0 |
| Full RSpec suite | 8,523 examples, 23 failures (local environment) | 7 failures with 4.1 applied; 6 shared with 7.2, 1 unconfirmed (section 4.3) |

The Puma messages seen (`on_worker_boot` renamed to `before_worker_boot`) come from Puma 7 and exist
on develop today; they are unrelated to Rails.

## 4. Breakage found, with root cause

### 4.1 `LingoLinq::RESERVED_ROUTES` undefined in tests (CONFIRMED, must fix)

- The constant is defined at the top of `config/routes.rb:1-17` and read by
  `app/models/concerns/processable.rb:148` (board key generation).
- Rails 8.0 defers drawing routes until the first request or URL-helper call in local environments
  ("Defer route drawing to the first request, or when url_helpers are called ... Environments like
  production that have `config.eager_load = true` will continue to eagerly load routes on boot";
  railties CHANGELOG v8.0.0, and `railties-8.1.4.1/lib/rails/engine.rb:591`,
  `application/finisher.rb:179`).
- Our test environment has `eager_load = false` (`config/environments/test.rb:13`), so any spec that
  creates a board before a route has been touched raises `NameError`. Production and development
  have `eager_load = true` and are unaffected.
- Evidence: the 52 spec files' worth of new failures in the first full 8.1 run, and 469 failures when
  the affected files ran on their own. Moving the 17-line constant into
  `config/initializers/reserved_routes.rb` (trial only) took the same 586 examples to 0 failures on
  8.1, matching 7.2.
- Fix in the real PR: move the constant out of `config/routes.rb` into its own file loaded at boot.
  Behaviour on 7.2 is unchanged by that move, so it can land on develop before the upgrade.

### 4.2 Not a Rails 8 issue (CONFIRMED by re-running)

- **AuditEvent count failures** ("expected 0, got 4/5"): stray `audit_events` rows written by
  `rails runner` and server boots outside an example (4 in the trial DB from my own probes, 5 in the
  shared local test DB). CLAUDE.md "Testing" documents this. Same failures appear on 7.2.
- **9 board/worker failures** in one 8.1 batch run did not reproduce: the same 586 examples re-ran
  with 0 failures, and the 4 sampled examples pass alone. Attributed to state left by the previous
  run that crashed 469 examples.
- **The 23 baseline failures on 7.2** are local-environment ones (deploy workflow specs need `jq`,
  AuditEvent rows, boards page specs need built assets, a throttling timing spec).

### 4.3 Final full-suite result on 8.1 with 4.1 applied (CONFIRMED)

8,523 examples, **7 failures**, 51 pending, 0 deprecation warnings (7.2 baseline: 23 failures).

- 6 are `spec/config/deploy_cloudrun_migrate_env_spec.rb`, which needs `jq` locally; they fail
  identically on 7.2.
- 1 is new: `spec/controllers/api/users_controller_spec.rb:3878` ("should not add queries per public
  board", expected 11 queries, got 16). It passes alone and with its whole file on 8.1 (413 examples,
  0 failures), and on 7.2. Unconfirmed: possibly order-dependent query counting in the full run.
  Watch it in the upgrade PR's CI; if it reproduces there, trace which extra queries run.
- The 17 other baseline failures (stray AuditEvent rows in the shared test DB, assets, throttling
  timing) did not occur against the clean trial DB.

## 5. Gem compatibility (CONFIRMED unless marked)

Only the `rails` line blocks resolution. Runtime compatibility needs these changes:

| Gem | Now | Needed for 8.1 | Notes |
|---|---|---|---|
| paper_trail | 15.2.0 | **17.0.0** | 15.2 declares `ACTIVERECORD_LT = "< 7.3"` (`lib/paper_trail/compatibility.rb:21`) and warns at boot; 16.0 allows `< 8.1`, 17.0 allows `< 8.2`. 16.0's breaking change (no `has_paper_trail` on both an STI parent and child) does not apply: our 7 models with it have no subclasses. Our patches (`config/initializers/paper_trail.rb`: `reify`, `PaperTrail.whodunnit`) rely on `VersionConcern#reify` and `PaperTrail.request.whodunnit`, both present in 17. |
| rspec-rails | 6.1.5 | **8.1.0** | 6.1 officially supports up to 7.2. 7.0 adds ActiveJob argument verification (we use no ActiveJob); 8.1.0 (2026-11-06) fixes frozen-hash issues on Rails 8.1. |
| minitest | 5.27.0 | keep `< 6` for now | Rails 8.x allows minitest 6; a non-conservative update pulls 6.1.0. Untested with rails-controller-testing 1.0.5 (PLAUSIBLE risk). |
| pg_search | 2.3.7 | optional 2.3.8 | 2.3.8 officially supports AR 8.0/8.1; 2.4.0 drops 7.2 (post-upgrade only). |
| sprockets-rails | 3.5.2 | no change | Rails 8 keeps Sprockets "for existing applications" (https://rubyonrails.org/2024/11/7/rails-8-no-paas-required). Propshaft is a new-app default only. |
| sass-rails / sassc-rails | 6.0.0 / 2.1.2 | no change for the upgrade | sassc is end of life (repo archived 2025-10-24). We have no `.scss` in `app/assets`; the gems only force a css_compressor. Removal is separate cleanup. |
| sentry-rails, aws-sdk-rails, rails-controller-testing, rubocop-rails, globalid, clowne, rack-attack | current | no change | Dependencies allow 8.x. Do not move aws-sdk-rails to 5.x: it removes `Aws::Rails.add_action_mailer_delivery_method` used at `config/initializers/amazon_ses.rb:15`. |
| permissable-coughdrop, go_secure, boy_band, obf, accessible-books | current | no change | CoughDrop-era, unmaintained, no newer versions. Their source uses only stable APIs. go_secure's `ActiveRecord::Base.connection.data_source_exists?` (`lib/go_secure.rb:104`) is soft-deprecated, still present and silent in 8.1. The trial suite exercises all of them. |

Not required by Rails 8 (CONFIRMED, `rails.gemspec` v8.1.4.1 and the upgrade guide): Solid Queue,
Solid Cache, Solid Cable, Propshaft, Kamal, Thruster. We keep Resque, Redis, Sprockets and Cloud Run.
Rails' built-in Resque ActiveJob adapter is still in 8.1 and deprecated only on unreleased 8.2; we
do not use ActiveJob anyway (background work is direct Resque through boy_band; 0 `perform_later`).

## 6. Impact on Ember

Ember is built separately by ember-cli under Node 22 and needs **no version change and no code
change** for this upgrade. Rails meets Ember in four places, each checked:

1. **Packaging.** Sprockets wraps the Ember build into `application.js`/`.css`
   (`app/assets/javascripts/application.js:1-5`, copied by `rake extras:assert_js`). Precompile on
   8.1 produced the same manifest. CONFIRMED.
2. **JSON contract.** Responses are hand-built in `lib/json_api/` and encoded through Oj
   (`config/initializers/oj.rb`). Output was byte-identical on 7.2 and 8.1 for the edge cases above.
   CONFIRMED. Two 8.1 framework defaults would change escaping later (section 7).
3. **Auth and sessions.** The frontend sends Bearer tokens; `protect_from_forgery with: :null_session`
   (`app/controllers/application_controller.rb:3`); the session is essentially unused. No 8.0/8.1
   default changes CSRF or session serialization. The 8.1.4.1 security patch applies
   `cookies_same_site_protection` to every session store; ours is already `same_site: :lax`
   (`config/initializers/session_store.rb`). CONFIRMED.
4. **ActionCable client.** The bundled `actioncable.js` is byte-identical. CONFIRMED.

Not verified: the Ember app running in a real browser against an 8.1 backend. The trial used
placeholder Ember files. The PR's CI (Ember tests and e2e) plus a staging click-through cover this.

User impact if all goes as tested: none visible.

## 7. Framework defaults (`load_defaults`)

Upgrade with `config.load_defaults 7.2` unchanged, then turn on new defaults one at a time in a
`new_framework_defaults_8_1.rb` file. CONFIRMED values from the railties templates at v8.0.5.2 and
v8.1.4.1:

| Default | Change | Our exposure | Recommendation |
|---|---|---|---|
| 8.0 `to_time_preserves_timezone = :zone` | `to_time` keeps the zone, not just the offset | 20 `.to_time` calls (e.g. `units_controller.rb:85`); differs only across DST boundaries. In 8.1 the setting is deprecated and `:zone` is forced. | Accept; add a spec at a DST boundary for one call site |
| 8.0 `action_dispatch.strict_freshness = true` | `If-None-Match` wins over `If-Modified-Since` | conditional GETs | Accept |
| 8.0 `Regexp.timeout = 1` | process-wide 1 s regexp timeout | regex middleware (`write_freeze.rb:65`, `throttling.rb:50`), large board text | Turn on in staging first |
| 8.1 `escape_json_responses = false` | `render json:` stops escaping `<>&` | `render json:` callers; Ember parses JSON, so no functional change | Keep `true` until reviewed: escaping is defence in depth |
| 8.1 `escape_js_separators_in_json = false` | U+2028/2029 no longer escaped | inline JSON in `layouts/application.html.erb:61` | Keep `true` until reviewed |
| 8.1 `raise_on_missing_required_finder_order_columns = true` | `first`/`last` without order can raise | needs a grep of `.first`/`.last` on models without a primary-key order | Turn on after the suite runs with it |
| 8.1 `action_on_path_relative_redirect = :raise` | `redirect_to "example.com"` raises | 28 `redirect_to ... allow_other_host: true` sites | Audit, then turn on |
| 8.1 `remove_hidden_field_autocomplete`, `render_tracker = :ruby` | markup / template tracking | none significant | Accept |

## 8. Pre-existing defects found during the research (separate from the upgrade)

- `config/environments/test.rb:40` sets `show_exceptions = false`. Rails 7.2 removed boolean
  support; `actionpack-7.2.3.2/lib/action_dispatch/middleware/exception_wrapper.rb:182-189` treats any
  value other than `:none`/`:rescuable` as "show", so specs see rendered error pages instead of
  raised exceptions. CONFIRMED. Fixing it may turn currently-green specs red, so it needs its own
  change and review.
- `config/initializers/big_decimal_serialization.rb:8` refers to `NilClass::AS_JSON`, which is not
  defined (CONFIRMED, `defined?` returns nil). A non-finite BigDecimal in a response raises NameError.
- `config/initializers/octopus.rb` is dead code (no octopus gem in the lockfile). `silencer` is
  unused. CONFIRMED.

## 9. Steps

Each step is one PR to develop unless stated.

1. **Prep on 7.2 (no Rails change).**
   - Move `LingoLinq::RESERVED_ROUTES` out of `config/routes.rb` into its own file loaded at boot
     (section 4.1). Behaviour on 7.2 is unchanged; it removes the only breakage the trial found.
2. **The upgrade PR.**
   - Gemfile: the three lines in section 3. `bundle update rails paper_trail rspec-rails --conservative`.
   - Run `bin/rails app:update` and merge config diffs by hand (keep our `config/environments/*`
     settings); keep `config.load_defaults 7.2`.
   - CI: full RSpec, Ember tests, e2e. `security-scan` should turn green; confirm the bundle-audit
     output lists nothing.
   - Data-bearing check: `Gemfile.lock` is not a data path; no migrations are needed
     (`db/schema.rb` header changes to `Schema[8.1]` only if a migration runs; 8.1 sorts schema
     columns alphabetically on the next dump, CONFIRMED in the 8.0-to-8.1 guide, so the first
     migration after the upgrade will show a large but content-free `schema.rb` diff).
3. **Deploy.** Dev, then staging soak with a click-through of: sign in and out, open and edit a board,
   copy a board set, offline sync, OBF import/export, a purchase in test mode, an AI board generation,
   admin `/jobby`. Then production.
4. **Defaults PR(s).** Add `new_framework_defaults_8_1.rb`, enable rows from section 7 one per commit,
   and raise `load_defaults` to 8.1 when all are on.
5. **Follow-ups (separate, optional):** section 8 defects; require individual frameworks instead of
   `rails/all` (drops Active Storage and Action Mailbox); retire sass-rails; minitest 6; pg_search
   2.3.8; Puma `before_worker_boot` rename.

## 10. Effort

Measured, not guessed: the code change the trial needed is the 3 Gemfile lines plus moving one
constant. What remains is review and verification: CI, `app:update` config merge, the staging soak,
and the defaults rollout. PLAUSIBLE estimate: 1 to 2 days for steps 1 and 2, a few days of staging
soak, then the defaults work at whatever pace review allows.

## 11. Not verified

- Ember running in a browser against an 8.1 backend (CI and staging cover it).
- Resque workers processing real jobs on 8.1 outside the test suite (the suite runs jobs inline via
  `Worker.process_queues`; a staging soak covers real workers).
- Cloud Run image build on 8.1 (Dockerfile unchanged; the PR's deploy to dev covers it).
- Behaviour with minitest 6.
