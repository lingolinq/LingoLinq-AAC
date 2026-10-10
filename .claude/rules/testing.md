---
paths:
  - "spec/**"
  - ".rspec"
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
- **Known gap:** `SafeHttp` resolves a hostname (`Addrinfo.getaddrinfo`) before it sends the
  request. WebMock does not intercept DNS, so a spec can still trigger a real DNS lookup.

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

- An assertion that compares against the clock runs at a fixed instant: `travel_to`, placed away
  from any window boundary the code uses (30 s TOTP windows, hourly or daily rollovers). Real
  `Time.now` near a boundary is a flake. `travel_to` is not available by default: add
  `include ActiveSupport::Testing::TimeHelpers` to the describe block (as `spec/models/user_spec.rb`
  does in `valid_2fa?`).
- A fixed instant written into a record must not race the real clock. If the code compares that
  value with one taken from `Time.now`, the result flips once the real date passes the fixed one;
  write every value the comparison reads, or pin the clock for the whole example.

## Running and reading results

- Local runs need the DB prefix from `docs/PRE_COMMIT_CHECKLIST.md`; run with `TZ=UTC`.
- Never use `rails runner` or `rails console` against the test DB for diagnostics: each writes
  an `AuditEvent` row that is not rolled back, and exact-count audit specs then fail.
- Report failures only from RSpec's final summary line, never from counts read in progress
  output.
