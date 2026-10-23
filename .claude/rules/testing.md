---
paths:
  - "spec/**"
  - ".rspec"
  - "config/application.rb"
  - ".env.op.template"
  - ".github/workflows/ci.yml"
---

# RSpec: external services, credentials, shared state

Applies to every spec. Rule #0.14 in `CLAUDE.md` (never edit a test to make a check pass)
covers everything here: a rule below that a spec cannot meet is a finding to report, not a
setting to relax.

## External services

- **Specs never reach the internet.** `spec/spec_helper.rb` runs
  `WebMock.disable_net_connect!(allow_localhost: true)`, so a request to any outside host raises
  `WebMock::NetConnectNotAllowedError` with the URL it tried.
- **Give the call a test double.** Use `stub_request` for the HTTP call, or stub the Ruby method
  that makes it. For an AWS SDK client, prefer a real client built with `stub_responses: true`
  (`spec/lib/transcoder_spec.rb`), which still runs the SDK's own parameter validation.
- **Never open the guard.** Do not call `WebMock.allow_net_connect!`, add a host to an allow list,
  or record cassettes against a live service.
- **Shared default answers** for calls that app code makes as a side effect of what most specs
  exercise live in `spec/support/outside_services.rb`. Each default mirrors what the real
  service answers to that request. Add one there only for a side effect that many specs trigger.
  A spec that tests the call itself declares its own `stub_request`: WebMock uses the most
  recently declared matching stub.
- **DNS:** `SafeHttp` resolves a hostname (`Addrinfo.getaddrinfo`) before it sends the request,
  and WebMock does not intercept DNS. `spec/support/outside_services.rb` answers public hostnames
  with a documentation address (203.0.113.10, or 2001:db8::10 for IPv6) on the requested port. Only
  an allowlist reaches the real resolver: localhost and `*.localhost` (also with a trailing dot), IP
  literals and numeric shorthands such as `10.1`, which it answers without the network, and the
  Redis and database hosts named in the environment (`REDIS_URL`, `DATABASE_URL`, `DB_HOST`). Any
  other name, including an unknown single label, gets the documentation address. A spec that
  tests resolution tags its group `own_resolver: true` (as `spec/lib/safe_http_spec.rb` does) and
  sets its own expectations on `Addrinfo`; untagged, a plain `expect(...).to receive` would stop
  failing on a second call, so an untagged example that sets one is failed after it runs.

## Credentials in the test environment

- **Every outside service starts "not configured".** In the test environment
  `config/application.rb` deletes every value that is an unresolved 1Password reference
  (`op://...`), locally and in CI. `spec/config/test_environment_spec.rb` guards this.
- **To test a configured path, configure it in the spec.** Set fake values for that example
  (`env_wrap('OPENSYMBOLS_SECRET' => 'spec-secret') do ... end`), or stub the service's own
  `configured?` / `enabled?` method, and give the request a double. Never depend on a value from
  the developer's environment, and never put a real credential in a spec.
- **Changing what the environment supplies changes what runs.** Before removing, blanking or
  adding a test-environment value, compare per-file SimpleCov line coverage from two full runs
  (before and after). Cover every line that only the old environment reached with an explicit
  spec, and check that spec goes red when the line is broken.

## Redis state

- Every example starts from empty test Redis namespaces (`lingolinq-test`,
  `lingolinq-stash-test`, `lingolinq-permissions-test`): `spec/spec_helper.rb` clears them before
  the run and before each example. It refuses to run if a namespace is not a test one.
- Two local runs at once against the same Redis db wipe each other's keys. A second run can take
  its own Redis namespaces, for example `REDIS_NAMESPACE_SUFFIX=-wtb-test bundle exec rspec` (the
  suffix must be lowercase letters and hyphens ending in `-test`; the check refuses digits). That
  separates Redis only: both runs still share the test database, and records created at the same
  moment can collide (observed: `User.create` failures in a run beside a full suite). Run one
  suite at a time; treat a failure seen beside another run as unconfirmed until it reproduces
  alone.

## Time

- An assertion that compares against the clock must not read the clock twice. First choice: bind
  the expectation to the value the code stored or will use (the record's own `created_at`, the
  scheduled job's args read back, one `base = Time.now` read that every expected value derives
  from, a weekyear computed with the app's own helper).
- Only when nothing can be bound, run the example at a fixed instant with `travel_to`, placed away
  from any window boundary the code uses (30 s TOTP windows, hourly or daily rollovers). Real
  `Time.now` near a boundary is a flake. `travel_to` is not available by default: add
  `include ActiveSupport::Testing::TimeHelpers` to the describe block (as `spec/models/user_spec.rb`
  does in `valid_2fa?`).
- Never freeze the clock around code that writes a link or a permission: adding a manager, user,
  supervisor or share, then anything that reads links or permissions. `travel_to` pins
  `updated_at`, and `UserLink.links_for` (`links/for/<code>/<updated_at>`) and the permission cache
  (`permissions-for/...`, in permissable's `lib/permissable.rb`) are keyed on it moving forward. The
  app's own `UserLink.invalidate_cache_for` does not make this safe: `Organization#add_manager`
  saves the user (clearing and re-reading the cache) before it writes the link, and
  `touch_connections` then stamps the frozen time, so the empty result stays cached. This is the
  2026-06-01 regression (`docs/task-management/learnings-archive/LEARNINGS-2026-01_to_2026-09.md`
  "spec re-reading `Time.now`"), and a single-example wrap hits it as surely as a group one. Any
  other cache that relies on `updated_at` moving forward carries the same hazard.
- A fixed instant written into a record must not race the real clock. If the code compares that
  value with one taken from `Time.now`, the result flips once the real date passes the fixed one;
  write every value the comparison reads, or (within the limits above) pin the clock.
- Pin only the examples that need it: an `around` hook on a group only when every example in it
  does. Do not nest `travel_to` blocks: ActiveSupport 7.2 raises.

## Running and reading results

- Local runs need the DB prefix from `docs/PRE_COMMIT_CHECKLIST.md`; run with `TZ=UTC`.
- Never use `rails runner` or `rails console` against the test DB for diagnostics: each writes
  an `AuditEvent` row that is not rolled back, and exact-count audit specs then fail.
- Report failures only from RSpec's final summary line, never from counts read in progress
  output.
