# iPad Add-to-Home-Screen shortcut stays on the boot overlay

## Fact sheet

(a) Overlay hide is READ in production only at `app/frontend/app/services/app-state.js:629-634`
inside `setup_controller`. `boot-overlay-hide.js:10-12` returns early because Rails
`boards/index.html.erb` does not define `LingoLinqHideBootOverlay` (ember `index.html:607`
does). CONFIRMED.

(b) Ember readiness is gated on extras `init` + `extras` + `device` + `lang`
(`extras.js:31-46`). `device` is advanced from `app.js:199` (web; `wait_for_deviceready`
is never assigned). Then `extras.js:530-539` waits on `capabilities.invoke({method:'init'})`,
which calls `capabilities.init` (`capabilities.js:259-338`) and returns
`setup_database()` when IndexedDB exists. `dbman.setup_database` (`dbman.js:534-627`)
has no timeout; `onblocked` alerts and does not settle the promise. Shapes: resolve,
reject, or pending forever. CONFIRMED.

(c) `router.js:10-21` sets `use_push_state = false` for standalone but only sets
`locationType = 'hash'` for `installed_app`. Environment default is `history`, so
standalone keeps history. CONFIRMED. Not used as the load-bearing fix: a locationType
mismatch would fail at routing time after `js_loaded`, and switching to hash would
drop path-based homescreen shortcuts.

The iOS8 `navigator.standalone` IndexedDB shim (`capabilities.js:20-27`) is a no-op
unless `openDatabase` exists. Modern iPadOS: ASSUMED absent; not load-bearing.

## Diagnosis

If `setup_database` never settles, `extras.enable()` never runs, Ember never
`advanceReadiness()`, `setup_controller` never runs, `#loading_box` stays forever.
That matches a homescreen shortcut that paints the current signed-out overlay and
never becomes the app. Icon PR #979 only changed apple-touch-icon links.

## Candidates

1. Timeout `capabilities.init` on standalone/browserless so extras enable on a hung DB.
2. Define `LingoLinqHideBootOverlay` on production (rejected: hides on first
   `routeDidChange` and reopens the signed-in index→home flash the initializer
   comment exists to prevent).
3. Set standalone `locationType` to hash (rejected: breaks path-based shortcuts;
   unverified as the hang).

Apply (1), plus a production overlay escape that fires only when `js_loaded` is
already true and the visitor is standalone or anonymous, so a later readiness miss
cannot trap those users behind `#loading_box`.
