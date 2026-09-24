# iPad Home Screen web app hangs on "something may be broken": shim hypothesis diagnosis

Status: STOPPED at Phase 1 for Scot's decision. No application code changed.
Base: `develop` at `d145304ef` (includes #983, merge `7ac9c0357`). `dev.lingolinq.com`
deploys `develop` (`docs/INFRASTRUCTURE.md`, environments table).

## Hypothesis under test (from a prior Codex diagnosis)

`capabilities.js:22-25` forces `window.shimIndexedDB.__useShim()` when
`navigator.standalone`; the shim is IndexedDB-over-WebSQL; WebSQL is dead on iPadOS;
therefore the Home Screen app hangs.

## Fact sheet

1. Readers of `navigator.standalone` (app/frontend, excluding node_modules):
   - `app/utils/capabilities.js:22` forces `__useShim()` (the hypothesis). CONFIRMED.
   - `app/utils/capabilities.js:106` `capabilities.browserless` includes standalone. CONFIRMED.
   - `app/router.js:12` disables push state (locationType unchanged). CONFIRMED.
   - `app/utils/extras.js:538` 8s `capabilities.init` timeout for standalone (#983). CONFIRMED.
   - `app/services/app-state.js:544,2730` `app_added` progress flag only. CONFIRMED.
   - `app/components/add-app.js:16`, `app/controllers/add-app.js:7` display only. CONFIRMED.
   - Rails `app/views/boards/index.html.erb:732` 20s overlay escape (#983) and `:809`
     assigns `navigator.standalone` for Android Chrome. CONFIRMED.
   - Shim / WebSQL: `ember-cli-build.js:64` imports `indexeddbshim.min.js`;
     `capabilities.js:16-17` is a commented-out 2014 shim (dead); `dbman.js:673` and
     `capacitor_sqlite_shim.js:208` `openDatabase` are the SQLite plugin API, not WebSQL. CONFIRMED.
2. Shim: `indexeddbshim` 6.1.0 (`package-lock.json` `node_modules/indexeddbshim`), loaded into
   `vendor.js` by `ember-cli-build.js:64`, after `regenerator-runtime` (prepended, `:58`),
   which the min build needs at load. CONFIRMED.
3. Boot path and the message:
   - "something may be broken" is shown at `index.html.erb:803` only when
     `load_state.js_retrieved` is true, `js_loaded` is still false after ~35s, and
     `capabilities.db_error` is unset. CONFIRMED.
   - `js_loaded` is set on the last line of the Sprockets bundle,
     `app/assets/javascripts/application.js:9`, after `vendor.js`, `auto-import-app.js`
     and `frontend.js`. It stays false only if the bundle's synchronous evaluation throws
     (or never finishes). CONFIRMED.
   - DB open: `capabilities.js:287` calls `setup_database()`; `dbman.js:537-547` uses
     `window.sqlitePlugin` if present, otherwise `capabilities.idb.open(...)`.
     `capabilities.idb` is `indexedDBSafe` (`capabilities.js:2565`), captured at
     `capabilities.js:21`, **before** `__useShim()` at `:24`. CONFIRMED.
   - A never-settling open is handled after `js_loaded` (the #983 8s timeout,
     `extras.js:536-573`), so it produces the overlay symptom, not this message. CONFIRMED.
4. Native shells: `dbman.js:538-541` selects `sqlite_plugin` whenever `window.sqlitePlugin`
   exists (Capacitor adapter installed at `capabilities.js:14`; Cordova plugin). So dbman
   storage never goes through the shim in any shell. CONFIRMED. Whether a shell's WebView
   reports `navigator.standalone` truthy, and whether shell code (`lingolinq_mobile/www/*`,
   desktop `www/init.js`, both outside this repo per `lib/tasks/extras.rake`) reads
   `window.indexedDB`: ASSUMED, not provable from this repo.
5. `window.load_state.js_loaded`: `app/assets/javascripts/application.js:8-9` (and
   `application-test.js:19-20`). `js_retrieved`: `simple_state.js:2-3`. CONFIRMED.

## What `__useShim()` actually does (indexeddbshim 6.1.0 `src/setGlobalVars.js`)

- If `window.openDatabase === undefined` at load, `__useShim` is a warn-only no-op.
- Otherwise it binds `openDatabase` (does not call it) and redefines `window.indexedDB`
  and the `IDB*` constructors, each inside try/catch. It does not throw.
- WebKit r246707 (https://trac.webkit.org/changeset/246707/webkit/) makes
  `openDatabase` a callable function that masquerades as undefined when WebSQL is disabled,
  and a real call throws `UnknownError: Web SQL is deprecated`. `!== undefined` is still
  true, so on iPadOS the swap happens.

## Reproduction in headless Chrome (evidence, 2026-09-23)

Real `indexeddbshim.min.js`, real origin, `navigator.standalone` stubbed, `openDatabase`
stubbed to throw `UnknownError: Web SQL is deprecated`:

| Shape | `__useShim` throws | `window.indexedDB` after | captured native open | `window.indexedDB.open` |
|---|---|---|---|---|
| standalone true + openDatabase | no | shim | success | sync throw `UnknownError: Web SQL is deprecated` |
| standalone true, no openDatabase | no (no-op) | native | success | n/a |
| standalone false | not called | native | success | n/a |
| standalone undefined | not called | native | success | n/a |

Full built app (`npx ember build`, `dist/`) booted in headless Chrome with an iPadOS 26
Safari UA: in every shape, including standalone true + openDatabase, Ember rendered
(33 `.ember-view`), `dbman.db_type` was `indexeddb`, and `capabilities.db` connected. The
built bundle's only boot-time `indexedDB` reader is `capabilities.js:21`. The other
references are the shim itself and RecordRTC `DiskStorage` (called only from
`getFromDisk`/`writeToDisk`, which the app never calls). No `IDBKeyRange` consumer exists
outside the shim.

## Conclusion

The forced shim is a real latent defect: it replaces `window.indexedDB` with a factory that
throws on every call on iPadOS. But the evidence does **not** support it as the cause of
this hang. It cannot throw during bundle evaluation, it does not reach dbman's open, and
nothing at boot reads the swapped global. Removing it would not be shown to fix the
reported symptom. Chromium cannot model every WebKit behaviour, so a WebKit-only throw
elsewhere in bundle evaluation is still possible and unidentified.

## Next step (needs a real device or telemetry)

- Safari Web Inspector (Mac: Develop > [iPad] > the Home Screen web app) on
  `dev.lingolinq.com`: capture the first uncaught exception during load. That exception is
  the root cause of `js_loaded` staying false.
- Or, if `TRACK_JS_TOKEN` is set on dev, the TrackJS "init failed" events plus the
  preceding error (`index.html.erb` `_trackJs` block).
