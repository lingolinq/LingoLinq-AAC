---
paths:
  - "spec/**"
  - "app/frontend/tests/**"
  - "app/frontend/e2e/**"
  - "app/frontend/node-tests/**"
  - "app/frontend/testem.js"
  - "app/frontend/playwright.config.js"
  - ".rspec"
  - ".github/workflows/ci.yml"
---

# Testing standards

How LingoLinq tests are written, run, read and changed, for the backend (RSpec), the frontend
(QUnit: unit, integration, acceptance) and end-to-end UI (Playwright). Root `CLAUDE.md` Rules 0.11,
0.12 and 0.14 still apply and win on conflict; `app/frontend/CLAUDE.md` has the Ember run mechanics.
The history behind each rule is in `docs/task-management/2026-10-05_ci-test-stalls.md`.

## 1. Principles

1. **A test exists to fail when the behaviour breaks.** Before trusting a new test, make it fail:
   revert the fix (or break the code it covers) and watch it go red, then restore. Name that
   mutation in the PR. A test that cannot fail for the right reason is not coverage.
2. **Red first for a bug fix or behaviour change** (Rule 0.12, `/fix-proposal`): the test is
   derived from the traced mechanism and written before the fix.
3. **Tests harden, never soften** (Rule 0.14). Never delete, skip, `todo`, loosen, narrow, re-baseline
   or route around a failing test or check without explicit human approval. The failure is the finding.
4. **Deterministic or it is broken.** A test may not depend on test order, the wall clock, real
   network, machine speed, or what an earlier test left behind. "Flaky" is a defect to diagnose,
   not something to retry until green.
5. **Assert outcomes, not implementation trivia.** Prefer what the user or caller observes
   (rendered text, returned value, persisted record, request sent) over private call sequences.
6. **Every assertion must run inside its test.** Return or `await` the promise; an assertion in a
   callback that fires after the test ended is a failure, not a pass (the harness reports it).

## 2. Choosing the kind of test

| Behaviour under test | Test type | Where |
|---|---|---|
| Model, lib, worker, serializer (`lib/json_api/`) logic | RSpec unit spec | `spec/` mirroring the source path |
| Controller / API contract, permissions, status codes | RSpec controller spec | `spec/controllers` |
| Frontend util, service, model, route, controller logic | QUnit unit, `setupTest` | `app/frontend/tests/unit/**` |
| One component's rendering and interaction | QUnit integration, `setupRenderingTest` | `app/frontend/tests/integration/**` |
| A user flow across routes (boot, visit, click, navigate) | QUnit acceptance, `setupApplicationTest` | `app/frontend/tests/acceptance/**` |
| A real-browser journey against a running app | Playwright e2e | `app/frontend/e2e/*.spec.js` |
| A custom template-lint rule | node test | `app/frontend/node-tests/` |

Use the cheapest test that can fail for the right reason: a pure function gets a unit test, not an
acceptance test. Behaviour that differs by platform (web / Cordova / Electron) is tested through the
`capabilities` seam with each relevant value stubbed.

**Feature flags:** a flagged feature is tested in BOTH flag states, and a test that does not care
about a flag pins it rather than inheriting whatever is set (see `tests/unit/utils/eval-session-test.js`).

## 3. Backend (RSpec)

- Specs mirror the source tree (`app/models/user.rb` -> `spec/models/user_spec.rb`).
- `.rspec` runs in **defined** order. A spec must still pass on its own and in any order; do not
  rely on state from an earlier example.
- Local runs need the DB credentials prefix (`docs/PRE_COMMIT_CHECKLIST.md`); target what you
  changed first: `bundle exec rspec spec/models/user_spec.rb:42`.
- `AuditEvent` rows commit outside the RSpec transaction: scope any `delete_all` to the example's
  own rows.
- No real network or third-party calls: stub them (Stripe, S3, AI endpoints, mail). Every AI or
  external call in app code goes through `lib/pii_scrubber.rb`; test that path, never bypass it.
- **No real user data.** Fixtures, factories and cassettes are synthetic; see
  `.claude/rules/data-bearing-paths.md` (Tier 1 boundary) before touching them.
- Permission and data-isolation code (district / org scoping, supervisor access) gets a negative
  test too: the user who must NOT see the record does not.

## 4. Frontend unit and integration (QUnit)

- **New test files use plain QUnit** (`module` / `test`) with the wrappers from
  `frontend/tests/helpers` (`setupTest`, `setupRenderingTest`, `setupApplicationTest`). The
  Jasmine-style `describe`/`it` harness (`tests/helpers/jasmine.js`) is legacy: extend an existing
  Jasmine-style file in its own style, do not start new ones in it.
- Async: `async` tests with `await`; wait on a condition (`waitUntil`, `settled`, a returned
  promise), never a fixed sleep. `@ember/runloop` calls are lint errors in new code (`ember/no-runloop`).
- When assertions run inside callbacks, declare `assert.expect(n)` (lint rule `qunit/require-expect`);
  it also fails the test if a callback never ran.
- Rendering assertions: prefer `assert.dom(...)` (qunit-dom). Select by something stable (role,
  label, id, or a `data-test-*` attribute added for the test) rather than a layout class that a
  styling change could rename.
- User-facing text in assertions goes through the same i18n keys the app uses; do not hard-code a
  translation that the locale files own.
- Board tiles have two render paths (`templates/board/index.hbs` and the `fast_html` builder in
  `utils/button.js`): a tile behaviour needs a test on each.

## 5. Isolation: what every frontend test must leave behind (enforced)

`tests/helpers/leak-check.js` runs after every test and FAILS the test that:

- reads or writes a **destroyed** service (an earlier test's torn-down app) through the globals
  (`window.appState`, `LingoLinq.appState`, `window.persistence`, `window.stashes`,
  `LingoLinq.store`) or through a util singleton's field;
- leaves a **replaced function** on one of the shared util singletons;
- leaves a **node under `<body>`**.

The harness also fails late assertions, waits for queued Ember Data fetches before teardown, and
stops the app's wall-clock pollers before every test. To comply:

- Stub with `stub(obj, 'method', fn)` (restored automatically), or save the original in
  `beforeEach` and put it back in `afterEach`. Never "restore" with `delete`: on accessor slots
  (`editManager.controller`, `buttonTracker.appState`) it is a silent no-op.
- A unit test that boots no app but runs code reading the app's globals gets its own stand-ins:
  `standInGlobals(hooks, { appState: () => ..., store: () => ... })` from
  `tests/helpers/stand-in-globals.js`.
- Cancel or await every timer, interval or listener the test starts; remove any element it
  appends to `<body>`.
- App code that keeps a service in a module-level slot reads it through `live_service()`
  (`app/utils/live_service.js`), so a destroyed service counts as absent.
- `--query leakcheck=report` (log only) is for surveying locally; it must never be set in CI.

The 500 ms post-test pause (`tests/helpers/jasmine.js`, `keepsPostTestSettle`) is kept only for the
modules whose own async work was shown to cross into the next test. Do not add a module to it, or
lengthen it, to make a test pass; fix the leak instead. Adding one needs crossing-probe evidence.

## 6. UI end-to-end (Playwright)

- Specs live in `app/frontend/e2e/` (`playwright.config.js`) and drive a running app (Ember on
  8184 proxying Rails on 5000). **They do not run in CI**: whoever changes a flow they cover runs
  them locally and states the result in the PR.
- Log in through the auth setup (`e2e/auth.setup.js`), never with a real person's account or data.
- Wait for app state (a selector, a network response), not for time.

## 7. Running and reading results

- Run targeted first: `npx ember test --filter "<module>"`, `bundle exec rspec <file>`. Check
  `node -v` (22) before trusting any frontend output.
- **Order matters for isolation bugs.** A leak only shows when the right tests run in sequence:
  separate local batches (unit / integration / acceptance) can pass while the full run fails. To
  verify isolation work, use a full-order run (CI's `build-and-test`) or reproduce a shard exactly:
  `npx ember test --query pool=include` / `pool=exclude`.
- A red run is not a regression until the run COMPLETED and you compared it with a baseline
  (Rule 0.11). Check `# skip` and the total first: a short total means a truncated run.
- Never raise `browser_disconnect_timeout`, `testTimeout` or a `waitsFor` limit to make a test pass.

## 8. CI gates

`.github/workflows/ci.yml`: `rspec`, `build-and-test` (template + JS lint gates and the full Ember
suite), `audit-artifacts-integrity`, `secret-detection` and `codex-review-tests` are required on
develop; `security-scan` also gates main. The `ember-shard-*` jobs run in shadow mode (not required).
Changing how CI decides to run a check (conditions, filters, `continue-on-error`, retries, required
wiring) is covered by Rule 0.14 and needs approval.

Lint baselines (`app/frontend/.eslint-todo`, `.lint-todo`) are line-anchored: add new code where it
does not shift baselined rows, never re-baseline without approval, and treat a lint fix that
rewrites an assertion as a test change.

## 9. What a PR with tests states

For each behaviour changed: the test that covers it, the mutation that turns it red, and the
targeted and full-run results with totals. `/pr-preflight` checks this; a claim without a test for
its path is not done.
