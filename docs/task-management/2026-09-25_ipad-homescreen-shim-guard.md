# iPad Home Screen startup hang: guard the forced IndexedDB shim

Date: 2026-09-25. Follows draft PR #1059 (diagnosis) and PR #1066 (temporary boot-error catcher).

## Evidence from the device

The #1066 catcher was run on a real iPad (iPadOS UA `Version/26.6.1`, `Standalone: true`) opened from a Home Screen
icon added from `dev.lingolinq.com`. It recorded one uncaught error:

```
TypeError: O.win.openDatabase.bind is not a function. (In 'O.win.openDatabase.bind(O.win)', 'O.win.openDatabase.bind' is undefined)
  at .../assets/application-dcc9381d….js:5061:72
  source: void 0!==O.win.openDatabase&&(ii.__openDatabase=O.win.openDatabase.bind <<HERE>> (O.win),t("indexedDB",ii,…
```

`load_state` was `{"state":"js_retrieved", …, "js_really_still_loading":true}`: the bundle downloaded and threw before
its last line set `js_loaded`.

In that same asset (downloaded from dev), line 25538 col 75, the second stack frame, is the compiled
`navigator.standalone&&window.shimIndexedDB&&window.shimIndexedDB.__useShim()`. Line 29238 col 82, the last frame, is
`require("frontend/app").default.create(...)`.

## Fact sheet

**(a) Where is the failing value read?**

- CONFIRMED: `indexeddbshim` 6.1.0 `src/setGlobalVars.js`, inside `IDB.shimIndexedDB.__useShim`:
  `if (CFG.win.openDatabase !== undefined) { shimIndexedDB.__openDatabase = CFG.win.openDatabase.bind(CFG.win); … }`.
  The `.bind` dereference is outside any try/catch. `CFG.win` defaults to `window` in browser builds (`src/CFG.js`,
  the `'win'` option).
- CONFIRMED: the only caller that reaches it on this device is `app/frontend/app/utils/capabilities.js`, module top level:
  `if(navigator.standalone) { if(window.shimIndexedDB) { window.shimIndexedDB.__useShim(); } }`. A throw there aborts
  evaluation of the `capabilities` module, and therefore `require("frontend/app")`.
- CONFIRMED: the shim's own automatic `__useShim()` at load (`setGlobalVars.js`, `!CFG.avoidAutoShim &&
  (!IDB.indexedDB || poorIndexedDbSupport) && CFG.win.openDatabase !== undefined`) does not run on this device. iPad
  Safari has native `indexedDB`, and `poorIndexedDbSupport` only matches old Android (2, 3, 4.0 to 4.3) or non-Safari
  iOS 9. The device stack shows the call coming from `capabilities`, not from the vendor load.
- So the guard must sit in front of the `capabilities.js` call and test the same object the shim dereferences:
  `window.openDatabase` and its `bind`.

**(b) Every shape `window.openDatabase` can take when that call is reached** (reached only when `navigator.standalone` is
truthy and `window.shimIndexedDB` exists). Correction from review: the shim ALWAYS defines `window.shimIndexedDB`. When
`openDatabase === undefined` at vendor load, its else branch installs a stub whose `__useShim` only
`console.warn`s "This browser does not have WebSQL to shim." (`src/setGlobalVars.js`).

1. A real function with `bind` (browsers that still ship WebSQL). Today the call succeeds and swaps `window.indexedDB`
   for the WebSQL shim. Must keep working.
2. Present but without a callable `bind` (iPadOS 26.6.1 standalone: CONFIRMED by the device error). Resolved in
   review: with WebSQL disabled, WebKit returns a function that masquerades as undefined (WebKit
   `Source/WebCore/bindings/js/JSDOMWindowCustom.cpp`, `JSDOMWindow::openDatabase`, "createFunctionThatMasqueradesAsUndefined",
   built on `objectPrototype()`). So `typeof` is `'undefined'`, it is `!== undefined`, and it has no `bind`. That iOS
   26.6.1 ships exactly this is PLAUSIBLE and consistent with the device error. The guard also holds for a non-callable
   object and a callable with a `null` prototype.
3. `undefined` (Chrome 119+, Firefox, most current browsers). The stub `shimIndexedDB` is present, so today a standalone
   launch calls the stub and logs one warning. After the guard it is not called; the warning goes away and nothing
   else changes.

Writers of `navigator.standalone`: the browser (iOS Home Screen), plus the boot page's Android Chrome heuristic
(`app/views/boards/index.html.erb`, `navigator.standalone = navigator.standalone || (android && chrome && …)`), which
is rendered in every deployed environment (`Rails.env.production?`: production, staging, dev), not in local dev. Both still reach the same guarded call.

**(c) Cross-file claims**

- CONFIRMED: when native IndexedDB exists (every browser in scope here, including the device), the app's own database
  never goes through the shim. Without it, `indexedDBSafe` falls back to `window.shimIndexedDB`. `capabilities.js` captures
  `indexedDBSafe = window.indexedDB || …` on the line BEFORE the shim call, and `capabilities.idb = indexedDBSafe`.
  `dbman.js` opens through `capabilities.idb.open` / `deleteDatabase` / `webkitGetDatabaseNames`.
- CONFIRMED: nothing under `app/frontend/app` or `app/assets/javascripts` reads `window.indexedDB` or
  `window.shimIndexedDB` outside `capabilities.js`. The `openDatabase` hits in `dbman.js` and
  `capacitor_sqlite_shim.js` are the SQLite plugin API, unrelated.
- CONFIRMED: `main` and `staging` carry the same `capabilities.js` block and `indexeddbshim ^6.1.0`, so production Home
  Screen installs are affected too.
- CONFIRMED: `capabilities.js` has no rows in `app/frontend/.eslint-todo`, so shifting its lines cannot surface
  shifted legacy findings.
- CORRECTION to PR #1059: it said `__useShim()` "never calls `openDatabase`" and "cannot throw". It does not call it,
  but it dereferences `openDatabase.bind` unguarded. #1059's headless probe stubbed `openDatabase` as a real function,
  which has `bind`, so the probe could not reproduce this.

## Proposal

**Unit:** extract the standalone shim call from `capabilities.js` into `app/frontend/app/utils/standalone_idb_shim.js`
(`useStandaloneIdbShim(win, nav)`, returns whether it called `__useShim`), and call it from the same place in
`capabilities.js` with `(window, navigator)`. The extraction lands first with identical behaviour, so the red test fails
for the real reason.

**Candidate fixes**

1. **Guard (chosen by Scot).** Call `__useShim()` only when `typeof win.openDatabase === 'function'` and
   `typeof win.openDatabase.bind === 'function'`. This tests the exact dereference that throws. Shape 1 keeps today's
   behaviour, shape 2 skips the swap (so `window.indexedDB` stays native, which is what `dbman` already uses), and shape 3
   is functionally unchanged (the shim stub is no longer called, so its one console warning goes away).
2. **Remove the forced shim.** A larger behaviour change on any device still in shape 1. Declined by Scot.
3. **Simplest alternative considered: wrap the call in try/catch.** Rejected as the primary fix. The throw happens
   partway through `__useShim` (after `setNonIDBGlobals` is defined but before any global is swapped), so today it would
   leave globals untouched. But a catch would also hide any future failure halfway through the swap, leaving a mix of
   native and shimmed globals. The guard prevents the only known failure without partial state.

**Risks**

- If some browser in shape 1 has a `bind` that works but a WebSQL that fails later, the guard does not help. That is
  today's behaviour, and out of scope.
- The guard reads `win.openDatabase` itself. On a masquerades-as-undefined object `typeof` is `'undefined'`, so there
  is no throw. A getter that throws is not a known shape; not guarded.

**Unresolved / residual**

- Whether other current iOS versions show the same shape. The guard covers them either way.
- Not covered by the guard: the shim's own load-time `__useShim()` (at vendor load, when `!IDB.indexedDB ||
  poorIndexedDbSupport`) would throw the same way in a WebKit context with no native `indexedDB`. Safari 17+ Lockdown
  Mode is one ("Disables IndexedDB", WebKit's Safari 17.0 release notes). Users there do not reach it: Lockdown also
  disables `FileReader`, and the boot page only injects `application.js` when `window.FileReader` exists, so they get
  the "browser out of date" message first. A possible follow-up, if Lockdown support is ever wanted, is loading the
  shim's non-invasive build or setting `avoidAutoShim`.

**Test** (`app/frontend/tests/unit/utils/standalone-idb-shim-test.js`). The fake `shimIndexedDB.__useShim` performs
the shim's own dereference (`if (win.openDatabase !== undefined) win.openDatabase.bind(win)`), so the test fails the
same way the device did:

- standalone with an `openDatabase` object that has no `bind` → does not throw, `__useShim` not called (the red test);
- standalone with a callable whose prototype is `null` (typeof function, no `bind`) → does not throw, not called;
- standalone with a real function → `__useShim` called once (shape 1 preserved);
- not standalone → not called;
- no `shimIndexedDB` → not called.

**Mutation that must make it fail:** delete the guard. The first two cases then throw `TypeError`.

**Device check after deploy:** force-quit the Home Screen app (swipe it away), relaunch it, and pass only on a
positive signal: the sign-in or home screen renders and the loading card is gone. The #1066 panel not appearing is NOT
evidence on its own, because it removes itself once `js_loaded` is set with nothing recorded.

## Proposal review (adversary) and what changed

Verdict: proceed with changes; no Critical or High findings. Applied:

- Added the real device shape as a test case (`openDatabase = document.all`), since a presence-first guard passed the
  other cases and still failed on the device.
- Added the shim-stub case (shape 3) and corrected the fact sheet (the stub always exists; the "production only"
  wording).
- Wiring: added a test asserting that `capabilities` imports the guard and has no direct `__useShim` call (comments
  stripped, because `capabilities.js` keeps a commented-out copy of an old shim build). Also a bundle-level boot probe,
  below.
- Device check now requires a positive boot signal after a force-quit.

## Results

- **Red first** (commit `33430440e`, extraction with identical behaviour): 4 of 8 failed. The three bind-less shapes
  threw `TypeError: win.openDatabase.bind is not a function`, and the stub case was called. Green after the guard
  (`36107fb01`): 8 of 8.
- **Mutations**, each restored from a copy:
  - Removing the guard fails 1, 2, 3 and 5 (the red commit).
  - A presence-first guard (`typeof od !== 'undefined' && typeof od.bind !== 'function'`) fails 1 (device shape) and 5.
  - Re-adding a direct `__useShim()` call in `capabilities.js` fails 8.
- **Lint**: `npm run lint:js:ci` findings=1596, baseline=1597, new=0.
- **Bundle boot probe**: production `ember build` of this branch, assembled in the Rails `application.js` order
  (`simple_state`, `globals`, `actioncable`, `vendor`, `auto-import-app`, `frontend`, then the `js_loaded` tail). Served
  with the live dev page HTML, in headless Chrome with the iPadOS 26.6.1 UA, `navigator.standalone` true and
  `window.openDatabase = document.all`:
  - Fixed: `js_loaded` true, the Ember root rendered, the loading box hidden, and no script errors (only image and
    script 404s from the probe server). Review found this was not a clean boot: the harness's IndexedDB stalls under
    `--virtual-time-budget` (`capabilities.db_error` "A version change transaction is running"), so Ember rendered via
    the #983 8s init fallback. The probe proves no crash at module load, not a clean boot. The device check is what
    proves the boot.
  - Same bundle with only the guard line removed: `TypeError: O.win.openDatabase.bind is not a function`, `load_state`
    stuck at `js_really_still_loading`, loading box shown. That is the device failure.
  - A non-standalone control rendered the same with the fixed bundle, the mutant bundle and the live dev bundle, so
    the control's empty Ember root is a harness artefact, not this change.


## PR review (#1068 at `bb32ffc2b`)

Codex (gpt-5.6-terra) and the adversary both approved, with no Critical, High or Medium findings. The Low findings,
applied:

- **Wiring test.** It proved the import and the absence of a direct call, but not that the guard is called. Deleting
  the call, or passing `{}` instead of `navigator`, still passed 8 of 8. It now also asserts the compiled call
  `(…_standalone_idb_shim.default)(window, navigator)`, and both mutations fail test 8.
- **Code comment.** "The app's database does not go through the swap" is qualified to "when native IndexedDB exists"
  (`indexedDBSafe` falls back to `window.shimIndexedDB` otherwise).
- **Lockdown Mode, the probe wording and the shape-3 wording**, corrected above.
- **PR body.** The base-branch CI comparison is corrected: `develop` at `39137ba50` fails only `boards-layout-toggle:
  choosing TOP-DOWN persists it to the user` (2745 tests, 1 fail).
