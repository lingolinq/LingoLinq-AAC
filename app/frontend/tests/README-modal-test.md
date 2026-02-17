# Running and understanding the modal tests

## How to run the modal tests

From the **frontend** directory:

```bash
cd app/frontend
npm test
```

This runs the full test suite (including `tests/utils/modal-test.js`). The suite uses **Chrome** (headless in CI). You need Chrome or Chromium installed and on your PATH.

- **Linux (WSL/Ubuntu):** Install Chromium so Testem can find it, e.g.  
  `sudo apt-get install chromium-browser`  
  and ensure `chromium-browser` or `chromium` is on your PATH.
- **macOS/Windows:** Use a normal Chrome install; Testem will use it.

To run tests and **only** open the test runner in the browser (so you can click “modal” to run just that module):

```bash
cd app/frontend
ember test --server
```

Then in the browser go to the URL shown (e.g. `http://localhost:7357/`) and use the QUnit UI to filter or click the **modal** module.

---

## How the modal test file works

**File:** `tests/utils/modal-test.js`

The tests target the **modal utility** (`app/utils/modal.js`), i.e. the global `modal.open()`, `modal.close()` API. They use a **fake route** (no real Ember app, no modal service), so `modal.open('hat')` takes the **outlet path** and calls `route.render('hat', { into: 'application', outlet: 'modal' })`.

### Structure

1. **Setup / teardown**
   - `beforeEach`: creates a mock `route` with `render()` and `disconnectOutlet()` that store their arguments (`route.lastRender`, `route.lastDisconnect`), and clears `modal.last_promise`.

2. **describe('setup')**
   - `modal.setup(route)` sets `modal.route` and initializes `modal.settings_for`.
   - If `last_promise` was set, `setup` rejects it.

3. **describe('open')**
   - **Replace existing:** Opening again resolves the previous promise (e.g. `open('hat')` when a promise was already there).
   - **No setup:** `open('hat')` without `modal.route` throws.
   - **Settings:** `open('hat', { key: 'chicken' })` stores options in `modal.settings_for['hat']`.
   - **Rendering:** With no modal service, `open('hat')` calls `route.render('hat', { into: 'application', outlet: 'modal' })`; the test asserts `route.lastRender` matches that.
   - **Promise:** `open('hat')` returns an object with a `.then` (a thenable/promise).

4. **describe('is_open')**
   - With no template set, `is_open('bacon')` is false.
   - After setting `modal.last_template = 'hippo'`, `is_open('hippo')` is true; after `modal.close()`, it’s false.

5. **describe('close')**
   - `close(false)` rejects the promise returned by `open('hat')`.
   - `close()` with no route doesn’t throw.
   - `close(true)` or `close()` (no arg) resolves that promise.
   - One test asserts that after `close()`, `modal.last_template` and `modal.last_promise` are null (state cleared).

6. **describe('flash')**
   - `flash('hi')` without setup throws.
   - `flash('hello')` (and `warning`, `error`, `notice`, `success`) eventually call `route.render('flash-message', { into: 'application', outlet: 'flash-message' })` and set the right `modal.settings_for['flash']` (type, text, etc.).

7. **describe('scanning')**
   - Opening a modal stops the scanner and sets `modal.resume_scanning`.
   - Closing the modal later causes scanning to resume (via stubbed `scanner.start`).
   - Opening a second modal while the first is “open” (stubbed `is_open`) doesn’t resume scanning until the modal is closed.

### Helpers used

- **`easyPromise()`** (from `ember_helper`): builds a promise you can resolve/reject and check (e.g. `promise.resolved`, `promise.rejected`).
- **`waitsFor` / `runs`**: Jasmine-style async; wait until a condition, then run assertions.
- **`stub(obj, 'method', fn)`**: replace `obj.method` with `fn` for the test.

### What is *not* tested

- The **modal service** or **modal-container** (no Ember app boot).
- Any specific modal **component** (e.g. button-settings, rename-board).
- The **component-based** modal path (when a modal service exists); the test environment has no service, so only the outlet path is exercised.
