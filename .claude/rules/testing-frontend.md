---
paths:
  - "app/frontend/tests/**"
  - "app/frontend/e2e/**"
  - "app/frontend/node-tests/**"
  - "app/frontend/testem.js"
  - "app/frontend/playwright.config.js"
  - ".github/workflows/ci.yml"
  - "app/frontend/app/utils/**"
---

# Testing standards: frontend, end-to-end and CI

How LingoLinq tests are written, run, read and changed for the frontend (QUnit: unit, integration,
acceptance) and end-to-end UI (Playwright), and how the CI gates treat them. RSpec has its own rule
file, `.claude/rules/testing.md` (added by PR #1117: no network in specs, test credentials, Redis state, the clock). Root `CLAUDE.md` Rules 0.11,
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

See `.claude/rules/testing.md` (added by PR #1117).

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

`tests/helpers/leak-check.js` runs after every test (after its own cleanup and its owner's
teardown) and FAILS the test that:

- reads or writes a **destroyed** service (an earlier test's torn-down app) through the globals
  (`window.appState`, `LingoLinq.appState`, `window.persistence`, `window.stashes`,
  `LingoLinq.store`) or through a util singleton's field;
- leaves a **replaced function** on one of the shared util singletons, or replaces an existing
  function on `window`, `i18n`, `LingoLinq` or its model classes;
- leaves a **node under `<body>`**.

The harness also fails late assertions, waits for queued Ember Data fetches before teardown, and
stops the app's wall-clock pollers before every test. It keeps develop's general 500 ms settle after
sync-mode tests (per Traci; removing it is a separate, approved change), but a test must not rely on
it: a test that needs more time than its own work takes has a leak. `--query leakcheck=report` (log only) is for surveying locally and must never
be set in CI; `--query leakfields=1` additionally logs singleton data fields a test left changed
(a survey aid only: much of that is legitimate app state, so it never fails a test).

### Patterns that leak, and the fix for each

**Services kept in module-level slots.** Every app instance hands its services to the util
singletons (`register_services`, `setup`, `this.appState = ...`) and to the globals; when the
instance is torn down those slots keep DESTROYED services, and every later caller works on a dead
app. In app code, a getter for such a slot reads it through `live_service()`
(`app/utils/live_service.js`) so a destroyed service counts as absent and the existing fallback is
used; guard every getter of the slot, including static `get_*` helpers. A new singleton that stores
services follows the same pattern. In tests: a unit test that boots no app but runs code reading
the app's globals gets its own stand-ins (`standInGlobals(hooks, {...})` from
`tests/helpers/stand-in-globals.js`), always, not only "when absent": an earlier test leaves a
destroyed value there, never an empty one.

**Forwarding utils.** `utils/app_state`, `utils/persistence` and `utils/_stashes` forward to
whichever service the globals point at NOW. Their liveness changes with the next app boot, so never
cache what they return across tests, and do not treat "destroyed once" as "destroyed forever".

**Restoring a stub.** Restore puts the object back EXACTLY as it was:

- Use `stub(obj, 'name', value)`; `restoreStubs` deletes an own property the stub created (the
  original was inherited) and notifies Ember dependents. Do not hand-roll restore by assigning the
  original back: it leaves an own copy, and through a forwarding util that copy is bound to the
  test's soon-destroyed service.
- Never "restore" with `delete` on an accessor (`editManager.controller`, `buttonTracker.appState`,
  any `get x()`/`set x()` slot): `delete` on the instance is a silent no-op and the stub stays.
- When you replace something by hand, record its exact property descriptor first
  (`Object.getOwnPropertyDescriptor`) and put that back, or delete it if there was none. Never
  assume own versus inherited: on `window`, `setInterval` is an OWN property while
  `addEventListener` is inherited from `EventTarget.prototype`; deleting the wrong one removes the
  real method for every later test.
- To stub an accessor, save and restore its BACKING slot (`buttonTracker._services.appState`), not
  the value read through the getter: the getter returns its fallback, and writing that back puts
  the fallback INTO the slot.
- Never replace a shared util's method by plain assignment (`util.fn = ...`) without a matching
  restore. Where `stub()` cannot be used (its service mirror rules would also wrap the service, and a
  wrapper that calls the service's own method would then call itself), capture the property
  descriptor when the file loads and put it back in an `afterEach` registered first in the
  top-level `describe`, so nested `describe` blocks inherit it.

**Deferred work that reaches "the current app".** A callback that runs later and goes through a
forwarding util (`utils/app_state`, `utils/persistence`, `utils/_stashes`, `modal`) acts on whichever
app is current WHEN IT FIRES, not the one that scheduled it. Capture the owner when scheduling
(`var owner = live_service(LingoLinq.appState)`) and return early at fire time if
`owner_gone(owner)` (`app/utils/live_service.js`): true only when an owner WAS captured and has
since been torn down. Never write the guard as `if(!live_service(owner)) return;`: that also returns
when nothing was captured, and work scheduled with no owner is legitimate (the highlight controller
sets up the scanner without an `appState`; that guard stopped switch scanning restarting after a
selection). Work scheduled with no owner therefore runs, and the harness does not report it. Every
skip `owner_gone` makes is logged as `[owner-gone]` with the test that was running, because it means
an earlier test scheduled work and did not wait for it; a self-test that destroys an owner on purpose
counts its own skips with `recordOwnerGoneSkips()` (`tests/helpers/owner-gone.js`) so they are not
reported. One chain stops without reporting: the board prefetch pipeline's `_pipeline_app_alive`
(`app/utils/board_detail_cache.js`). Every later step the callback schedules
carries the same owner (a follow-up beep, a retry). Do not "fix" this by cancelling timers at
teardown: a cancelled app timer silently drops any assertion downstream of it (a test that forgot to
wait then passes) and can leave a flag that only its own callback clears stuck for the rest of the
run.

**Hooks start work too.** Restoring observed state in an `afterEach` (setting a property an observer
watches) re-runs the observer, which can schedule deferred work owned by this test's stand-in. A
stand-in is never destroyed, so the owner guard lets that work through, and it fires in the next
test. Wait for it in the same hook, while the stand-ins are still installed (`afterEach` hooks run
in reverse registration order, so a module's own hook runs before `standInGlobals` puts the
originals back). Do not make stand-ins die at teardown to drop such work: that hides every test
that forgets to wait.

**Work owned by a service.** A service that schedules work (a poller, a delayed overlay, a
retry) cancels it in `willDestroy`, and a callback that can outlive the service returns early once
`isDestroyed || isDestroying`. The leak check cannot see a destroyed service captured in a closure
(`var _this = this`), so this is the only line of defence for that case.

**Fakes behave like the real thing.** A fake browser object must end the way the real one does: a
fake `SpeechSynthesisUtterance` that never fires `end`/`error` leaves the app's fallback timer
pending (it then fired seconds later, in another test); a fake audio element whose `pause()` does
not cancel its pending `ended` ends after the test that paused it. When a fake cannot end itself,
the module's `afterEach` ends what the test started.

**Pending callbacks and requests on singletons.** A test that starts a request whose answer arrives
through a callback stored on a singleton (editor messages, pending-promise handlers) clears that
callback in `afterEach`, or a later test's message resolves this test's promise.

**Timers, pollers and background chains.**

- App code must keep the handle of every repeating timer (`setInterval`, re-armed `runLater`) so
  the harness can stop it; a wall-clock poller is stopped before every test in
  `tests/helpers/jasmine.js`, and a new one is added there with a test that the hook is registered.
  No test may depend on when the clock ticks.
- A fire-and-forget chain (prefetch, sync, warm-up) re-checks that its app is alive at each step
  (read flags and online state through `live_service`), so it stops instead of working against a
  dead app.
- A test cancels or awaits every timer, interval or listener it starts. Ember Data fetches must be
  awaited, including ones the code under test starts on its own (an observer that loads a record when
  the test sets a model). The harness's teardown wait finds only some tests that skip this (a
  synchronous plain QUnit test; after an async or jasmine-style test the fetch is usually flushed
  before the wait runs). To find them all, delay every FetchManager flush past the post-test settle
  (the probe in commit 7b0848298).

**DOM.** Remove every element the test (or app code it drives) appends to `<body>`. Elements the
app creates once and caches for the page lifetime still leak between tests: the test that triggers
them removes them in `afterEach`, or a later test skips the creation path.

**State a test did not set.** Pin every flag, preference and setting the code under test reads
(feature flags, dwell/scanning settings, locale), instead of inheriting whatever an earlier test
left; a test that passes only with an inherited value is order-dependent.

**`todo` tests** absorb failures by design; never use one as a container for leak-prone setup.

**Several requests that may all fail.** Combine them with `RSVP.allSettled` (then reject with the
first failure if any), not `RSVP.all`: `all` settles on the first failure and leaves a second one
as a global unhandled rejection, even when the caller handles the combined promise.

**No new pauses.** Apart from the named exemptions below, do not add a pause or a wait, per module
or globally, to make a test pass or to let an earlier test's leftover work finish. Find the leak
(section 7) and fix it where it is scheduled: the test that scheduled the work waits for it or
cancels it. Exemptions:

- develop's general 500 ms settle after sync-mode tests (kept as is).
- persistence-sync's retry-path pause for a known race (issue #589).
- `setupTest`'s bounded wait for queued Ember Data fetches (`waitForQueuedStoreFetches`,
  `tests/helpers/index.js`), so a late flush does not hit a destroyed store. It sees whatever is
  still queued when teardown starts: every un-awaited fetch of a synchronous plain QUnit test (which
  it then absorbs, turning a teardown failure into a pass plus a log line), and fetches queued after
  an async or jasmine-style test signalled it was done. Each hit is logged as `[queued-fetch]` and
  listed in the Ember shard job summary. It does not excuse a test from awaiting its own fetches.
  Whether to keep it, remove it, or make a hit fail the test is an open decision for the owner
  (PR #1110).

### Test helpers that import app code

A test helper loaded by `tests/test-helper.js` loads app modules EARLIER than the app does, which
can reverse an import cycle in `app/utils` and make a module throw while loading. testem then shows
no error at all: the run simply never starts and times out. Import in the app's natural order (the
leak check imports `utils/obf` before `utils/eval` for this reason) and verify a new helper by
loading the test page in a browser, where the load error is visible.

## 6. UI end-to-end (Playwright)

- Specs live in `app/frontend/e2e/` (`playwright.config.js`) and drive a running app (Ember on
  8184 proxying Rails on 5000). **They do not run in CI**: whoever changes a flow they cover runs
  them locally and states the result in the PR.
- Log in through the auth setup (`e2e/auth.setup.js`), never with a real person's account or data.
- Wait for app state (a selector, a network response), not for time.

## 7. Running, reading and diagnosing results

- Run targeted first: `npx ember test --filter "<module>"`, `bundle exec rspec <file>`. Check
  `node -v` (22) before trusting any frontend output.
- **Order matters for isolation bugs.** A leak only shows when the right tests run in sequence:
  separate local batches (unit / integration / acceptance) can pass while the full run fails. To
  verify isolation work, use a full-order run (CI's `build-and-test`) or reproduce a shard exactly:
  `npx ember test --query pool=include` / `pool=exclude`. A leak-related change is not verified
  until a full-order run is green.
- A red run is not a regression until the run COMPLETED and you compared it with a baseline
  (Rule 0.11). Check `# skip` and the total first: a short total means a truncated run.
- Never raise `browser_disconnect_timeout`, `testTimeout` or a `waitsFor` limit to make a test pass.

### Diagnosing an intermittent or order-dependent failure

- The failing test is often the VICTIM: a global failure ("store instance has already been
  destroyed", "calling set on destroyed object") is charged to whichever test is running when an
  earlier test's leftover work fires. Find the test that scheduled the work, not the one that failed.
- Make the race deterministic before fixing it: in a temporary local probe, delay ONE suspected
  async step (for example the Ember Data fetch flush by 100 ms) or remove the post-test pause, and
  record which test scheduled the work and which test it landed in. A fix is proven when the
  probe's hits go to zero.
- To find what a test leaves behind, log after each test what changed in the shared slots (or run
  with `leakcheck=report` / `leakfields=1`) and read the first test after which the value appears.
- A crossing probe that only looks a short window past each test misses long timers (a 4 s fallback,
  a 30 s poller). When a stray call is suspected, instrument the CALL itself: tag every timer with
  the test that scheduled it and log the target being invoked from an earlier test's timer.
- Remember `--filter` is lowercased by ember-cli: a regex filter needs `/i`, and a filter that
  matches nothing reports one "global failure", not a test failure.
- When a run produces no output at all, load `tests/index.html` in a browser (or Puppeteer) and
  read the console: a module that throws while loading stops the whole run silently.
- Probes are local and temporary: never commit them, restore every source file you edited for a
  probe build and verify the tree is clean afterwards.
- Stop only the processes you started, by PID. Never `pkill -f` a pattern that also appears in
  your own command line: it kills your shell.

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

For each behaviour changed: the test that covers it, the mutation that turns it red (shown by a
build with the fix reverted, not argued), and the targeted and full-order results with totals. `/pr-preflight` checks this; a claim without a test for
its path is not done.
