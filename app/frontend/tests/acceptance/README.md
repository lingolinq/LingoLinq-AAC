# Acceptance Tests

End-to-end UI tests that drive the Ember app through the router, services, and templates — without a Rails backend. API calls are intercepted by Mirage fixtures configured in `app/frontend/mirage/`.

## One-time setup (WSL2 / headless Linux only)

`puppeteer` bundles its own Chromium, but Chromium needs some shared libraries that WSL2 doesn't ship by default. On macOS or Windows with Chrome already installed, you can skip this.

Run once:

```bash
sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  libnspr4 libnss3 libasound2 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
  libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libpangocairo-1.0-0
```

On Ubuntu-based CI images (GitHub Actions `ubuntu-latest`, for example) these are already present — no CI step needed.

## Running

```bash
cd app/frontend

# One-shot run (used in CI)
ember test

# Filter to a single module
ember test --filter "empty state"

# Watch mode for active development
ember test --server
```

Tests live in `app/frontend/tests/acceptance/*-test.js`. File names end with `-test` so the test loader picks them up.

## Project-specific gotchas

Two things about this project's test infrastructure deviate from typical Ember apps. Both are documented here so future test authors don't waste time rediscovering them.

### 1. Register tests against `window.QUnit`, NOT `import { module, test } from 'qunit'`

This project's build produces two QUnit instances: one from the `qunit` ES module, one from `qunit-standalone.js` (`window.QUnit`). The testem runner reads from `window.QUnit`. Tests registered against the ES module instance are silently dropped — they evaluate but never run.

**Do this:**
```js
const QUnit = window.QUnit;
QUnit.module('Acceptance | my feature', function(hooks) {
  QUnit.test('does a thing', function(assert) { /* ... */ });
});
```

**Not this:**
```js
import { module, test } from 'qunit';  // WRONG: separate QUnit instance
module('Acceptance | my feature', function() { /* ... */ });
```

### 2. New acceptance tests need to be explicitly imported in `tests/test-helper.js`

This project's AMD test-module auto-loader has a known timing issue (see the comment at `tests/test-helper.js:22-26`). Add each new acceptance test file as an explicit import in `test-helper.js` to guarantee it's registered before `start()`:

```js
// tests/test-helper.js — near the bottom, before start()
import 'frontend/tests/acceptance/board-detail-empty-state-test';
import 'frontend/tests/acceptance/your-new-test';  // add new tests here
```

The auto-discovery does run for lint checks (ESLint/TemplateLint on every test file), so the test file will lint even without being in this import list — but it won't execute until you add the import.

## Pattern — the 20-line template

Each test:

1. **Set up Mirage fixtures** — `this.server.create('board', { ... })` creates a row the app's `GET /api/v1/boards/:key` request will receive.
2. **Visit a route** — `await visit('/userA/board-detail/boardname')` drives Ember's router exactly as a user would.
3. **Assert on the DOM** — `assert.dom('.selector').exists()` / `.hasText()` / `.includesText()`.
4. **Drive interactions** — `await click(...)`, `await fillIn(...)`, `await triggerEvent(...)` to simulate user input, then re-assert.

```js
import { setupApplicationTest } from 'ember-qunit';
import { setupMirage } from 'ember-cli-mirage/test-support';
import { visit, click, currentURL } from '@ember/test-helpers';

const QUnit = window.QUnit;  // register against window.QUnit — see gotcha #1 above

QUnit.module('Acceptance | <feature>', function(hooks) {
  setupApplicationTest(hooks);
  setupMirage(hooks);

  QUnit.test('<user-visible behavior>', async function(assert) {
    this.server.create('board', { /* fixture */ });

    await visit('/...');

    assert.dom('.some-class').exists();
  });
});
```

Don't forget to add your new test file to the explicit-imports list in `tests/test-helper.js` — see gotcha #2.

## Mirage fixtures

- `mirage/config.js` — HTTP handlers. Add a handler here before writing tests that hit a new endpoint.
- `mirage/factories/*.js` — Factories with sensible defaults. Override anything per-test via the second arg to `server.create()`.
- `mirage/scenarios/default.js` — Dev-mode seed data. Intentionally empty so dev mode stays a blank slate.

To debug an unhandled request, uncomment `this.logging = true` in `mirage/config.js` and re-run — Mirage will log every request to the browser console.

## Mapping to the parity work

Each acceptance test file targets a specific parity gap from `.planning/BOARD_DETAIL_PARITY_TESTS.md`:

| Test file | Parity entry |
|---|---|
| `board-detail-empty-state-test.js` | #6 Empty-board state |
| (to be added) `board-detail-integration-test.js` | #4 Integration board rendering |
| (to be added) `board-detail-error-retry-test.js` | #7 Error/retry UI |
| (to be added) `board-detail-vsd-background-test.js` | #5 Board-level background rendering |
| (to be added) `board-detail-description-panel-test.js` | #8 Description + privacy/license icons |
| (to be added) `board-detail-context-menu-test.js` | #9 Per-button Stash / Word Data menu |
| (to be added) `board-detail-observers-test.js` | #1, #2, #3 Observer behaviors |

## When to reach for Playwright instead

Stay in acceptance tests for: routing, service state, template rendering, form input, action dispatch, Ember Data interactions.

Move to Playwright when you hit: real touch gestures (long-press, swipe, multi-touch), cross-browser compatibility (Safari/iPad especially), visual regression testing, or end-to-end tests against a real backend.

Acceptance tests and Playwright coexist — they target different questions. Playwright would live in a separate `e2e/` directory with its own runner.
