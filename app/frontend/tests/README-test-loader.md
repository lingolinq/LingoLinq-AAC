# Why `ember-cli-test-loader` Fails to Discover Tests

## Summary

The manual workaround in `test-helper.js` is **necessary** because `ember-cli-test-loader`'s
`loadTests()` — called inside `ember-qunit`'s `start()` — discovers only ~3 test modules
instead of all ~99+. The root cause is a **dual QUnit instance** problem caused by the custom
`tests/index.html` script loading order, combined with AMD module registration timing.

## Root Cause

### Dual QUnit Instances

`tests/index.html` loads scripts in this order:

```html
<script src="assets/qunit-standalone.js"></script>  <!-- QUnit instance #1 (window.QUnit) -->
<script src="assets/vendor.js"></script>             <!-- Contains loader.js (requirejs) -->
<script src="assets/test-support.js"></script>       <!-- Contains QUnit instance #2 (AMD 'qunit') -->
<script src="assets/frontend.js"></script>
<script src="assets/tests.js"></script>              <!-- Test modules + test-helper.js -->
```

`qunit-standalone.js` is explicitly imported in `ember-cli-build.js` and sets `window.QUnit`.
Then `test-support.js` bundles a second QUnit as an AMD module. The patch in
`patches/qunit+2.24.2.patch` prevents the "QUnit has already been defined" error by making
the second load a no-op when `window.QUnit` already exists.

### Timing Problem

`ember-cli-test-loader`'s `listModules()` calls `Object.keys(requirejs.entries)` and filters
by `/[-_]test$/`. The regex is correct. The problem is **timing**: when `ember-qunit`'s
`start()` calls `loadTests()`, `test-helper.js` executes early within `tests.js` before the
remaining ~96 test module definitions are appended to `requirejs.entries`.

The manual workaround succeeds because it runs **after** all test module definitions are
registered — it checks `window.requirejs.entries` directly, loads all matching modules, then
calls `start({ loadTests: false })`.

### Contributing Factors

| Factor | Detail |
|---|---|
| **Non-standard test API** | Tests use a Jasmine-style adapter (`helpers/jasmine.js`) that wraps `QUnit.module`/`QUnit.test` — tests register at import time |
| **`qunit-standalone.js` preload** | `ember-cli-build.js:70-73` creates the dual-instance scenario |
| **QUnit patch** | `patches/qunit+2.24.2.patch` silences the "already defined" error, masking the problem |

## Potential Fixes

1. **Remove `qunit-standalone.js`** — eliminate the dual QUnit instance. Requires updating
   `ember_helper.js` to use `import * as QUnit from 'qunit'` instead of `/* global QUnit */`.

2. **Move `start()` into a `setTimeout(…, 0)`** — lets all AMD module definitions register
   before the loader runs. Quick but fragile.

3. **Keep the workaround** (current approach) — it works, is well-documented, and the risk of
   removing it for marginal benefit is not worth it on the Ember 3.28 stack.

## Validation

To test any fix, temporarily remove the workaround (the `requirejs.entries` loop in
`test-helper.js`) and change `start({ loadTests: false })` back to `start()`, then run
`ember test` to verify all ~99+ tests are still discovered.
