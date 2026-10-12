# 2026-10-11: switch scanning stops after a speak selection (highlight controller has no appState)

Branch `traci/fix/highlight-scanner-appstate` from develop `aca8011b8`. Found while running the #1118
switch-scanning click-test by script (`switch-scanning-qa.mjs`, #1118 worktree): identical on develop
and #1118, so pre-existing. LEARNINGS consulted: scanner entries (LEARNINGS.md:186-191,
learnings-archive/2026-09.md scanner items); none covers this.

## Symptom (runtime, develop build, user `example`, board `example/one`, row scanning 1000 ms)

After a switch selection of a speak button the word is spoken, then `scanner.stop()` runs within ~25 ms:
`scanning` and `interval` go false, the highlight stays on screen. Probe at +150 ms and +3 s:

| View | auto-home | +150 ms | +3 s |
|---|---|---|---|
| modern (board-detail) | off | stopped, appState undefined | **still stopped** |
| modern | on | stopped | scanning (jumped home; check_scanning re-set appState) |
| classic (board-alt) | off | stopped | scanning (a later check_scanning re-set appState) |
| classic | on | stopped | scanning (home) |

So the scanner's own restart fails in every case; users recover only when something else happens to
call `appState.check_scanning`.

## Fact sheet

(a) Where is the value READ?
- CONFIRMED `app/utils/scanner.js:189` `start()`: `if(!this.get('appState.currentUser.preferences.device.scanning')) { scanner.stop(); return; }`.
  The restart after a selection is `pick_elem` `runLater(function() { scanner.start(); }, cutoff)`
  (`scanner.js:893-896`); runtime stack shows `stop` called from `start` at that line (built bundle).
- Other readers of `scanner.appState`, same failure class: `scanner.js:899` (hide_input),
  `scanner.js:984` and `:1001` (`scanner.get('appState').activate_button(...)`, external-keyboard
  autocomplete, would THROW while unset), `scanner.js:1466-1467` (mobile switch warning).
  `scanner.js:855` already falls back to `window.LingoLinq.appState`.
- Other `start()` callers that hit the same guard while it is unset (CONFIRMED by grep, behaviour
  ASSUMED, not load-bearing): `utils/modal.js:130,192,441`, `services/modal.js:121,286`,
  `routes/user/board-detail.js:114`, `scanner.js:607` (reset).

(b) All shapes of `scanner.appState` and their writers (3 writers on #1118, 2 on develop):
- `undefined`: initial; and after EVERY highlight open: `controllers/highlight.js:50`
  `scanner.setup(this)` -> `scanner.js:159` `this.appState = controller.get('appState')`. CONFIRMED at
  runtime: `scanner.get('appState')` is `undefined` while scanning, `setup` called once per highlight.
- the app-state service: `services/app-state.js:2059-2060` (`check_scanning`, only when falsy).
- `null`: #1118 only, app-state `willDestroy` (not on develop).
`setup()` has exactly one caller (`controllers/highlight.js:50`, CONFIRMED by grep).

(c) Cross-file claims:
- "The highlight controller has an `appState`": FALSE. `modal.ModalController` (`utils/modal.js:632`)
  declares none and `controllers/highlight.js` declares none; runtime value `undefined`. CONFIRMED.
- Origin: `3b80dc494` (2026-01-27, "Migrate scanner and frame_listener utils to use injected
  services") replaced the module singleton `app_state` with `controller.get('appState')`. The original
  codebase injected `app_state` into every controller (`869c59c2f utils/app_state.js`
  `application.inject(component, 'app_state', ...)`); that injection is gone. CONFIRMED.
- The unit test `tests/utils/scanner-test.js:148` passes `EmberObject.create({ appState: app_state })`
  to `setup`: it encodes the false claim, which is why no test caught this. CONFIRMED.
- 54 controllers declare `appState: service('app-state')` (grep); it is the codebase pattern. CONFIRMED.

## Red test

`tests/controllers/highlight-test.js` "HighlightController scanner hand-off - hands this app's
app-state to the scanner when it opens": looks up the real `controller:highlight`, sets
`scanner.appState = null`, runs `send('opening')` (the real path: the highlight controller's own
`actions.opening`, `controllers/highlight.js:252`, -> `controller.opening()` -> `scanner.setup`), asserts `scanner.get('appState') === owner app-state service`.
Weakest passing state: the scanner holds THIS app's service after a highlight opens, which is exactly
what `start()` needs. Mutation that must make it fail: remove the fix (develop) -> `undefined`.

## Candidate fixes

1. **Declare `appState: service('app-state')` on the highlight controller** (preferred). One line,
   the codebase pattern, restores the contract `setup()` was migrated to expect. `scanner.appState`
   becomes the owner's live service on every highlight open, which also gives #1118's
   `live_service(scanner.get('appState'))` owner capture a real owner instead of `undefined`.
   Placement: after the line-anchored `.eslint-todo` rows (highlight.js 53-78), import at file end.
2. **`setup()` keeps the existing value**: `this.appState = controller.get('appState') || this.appState`.
   Works only if `check_scanning` ran first (it does before every scan today) and keeps a dead owner's
   service in tests until the next check_scanning. Hides the missing-dependency instead of fixing it.
3. **Remove `scanner.js:159`** and rely on `check_scanning` alone. Same reliance as 2; drops the
   migration's intent that the opening controller supplies the app.
4. Rejected: readers fall back to `window.LingoLinq.appState` like `:855`. Spreads a global, and the
   migration was moving away from globals.

## Risks

- With 1, every highlight open sets `scanner.appState` to the service; previously `check_scanning`
  set it only when falsy. Same object in production (one app-state), so no change there.
- Behaviour change for users: scanning now RESUMES after a speak selection on the modern view with
  auto-home off (intended, matches classic/auto-home behaviour after their incidental recovery). With
  auto-home on, the restart now runs at 0 ms and check_scanning also runs at 200 ms; `start()` returns
  early when `actively_scanning()`, so no double scan (ASSUMED; check in the post-fix run).
- External-keyboard autocomplete with scanning on (`scanner.js:984/1001`) stops throwing.
- Tests that stub `scanner.appState` and then open a real highlight would now get the real service.
  ASSUMED none; check the targeted runs.

## Unresolved

- Exactly which `check_scanning` call restores classic with auto-home off (not load-bearing).
- Whether #1118 should merge first (it touches scanner.js and app-state.js but not highlight.js; no
  textual overlap with this fix).

## Review (adversary agent, read-only) and what was done with it

Verdict: proposal sound, ship candidate 1 with conditions. Each finding checked by me:
- F1 (Medium, CONFIRMED): `frame_listener.setup` (`utils/frame_listener.js:16`) reads the same
  `controller.appState`. With the fix, integrations' `add_text` no longer throws and `speak_text` in
  speak mode speaks aloud: that restores pre-`3b80dc494` behaviour (it read the `app_state` singleton).
  Before the first highlight of a session frame_listener still has no appState: pre-existing, separate.
- F2 (Low, CONFIRMED): the highlight controller has its own `actions.opening`
  (`controllers/highlight.js:252`) that copies its model from `modal.settings_for['highlight']`; the
  test's two dead lines were replaced by setting `settings_for['highlight']`. Not adopted: an extra
  `start()`-does-not-stop assertion; the read at `scanner.js:189` goes through exactly the object the
  test checks, and the `#speak` guard is a different cause.
- F3 (Low, CONFIRMED): test now calls `controller.closing()` and restores frame_listener, last_controller
  and settings_for in afterEach.
- F4 (Low): `check_scanning` runs its body 1000 ms later (`app-state.js:2038`); checked at runtime below.
- F5 (Low): highlight2 extends highlight, covered by inheritance.
- F6 (Low, CONFIRMED): property placed after `opening()` (line 86), import at file end; baselined rows
  53-78 unmoved.

## Verification

- Red: test failed on develop + test (assertion `scanner.get('appState') === appState`, tests.js:7368).
- Falsified after the fix: the fixed test bundle with only the compiled `appState: service(...)` line
  removed from the highlight module: red. Fixed bundle: green.
- Targeted runs, red build vs fixed build: HighlightController 2 (1 fail -> 0), "scanner" 75 (1 fail,
  the new test, -> 0; 4 skips on both), frame_listener 46/46 both, "scanning re-arm" 3/3 both.
- `npm run lint:js:ci`: new=0.
- Runtime (`switch-scanning-qa.mjs`, develop build vs fixed build, run alone):
  modern speak button: develop STOPPED, fixed resumes in 29 ms with 1 s steps; modern three-in-a-row
  now runs (gaps 5065/3052 ms; classic 4050/3051); modern folder resumes in 76 ms (was 1081: the
  board-detail re-arm `routes/user/board-detail.js:114` also hit the guard); step mode + quick presses:
  no previous-board words on either; auto-home on + presses at ~350/650 ms: only the selected word
  added, no previous-board selection (F4), and scanning resumes ~150 ms after selection (was ~1 s), so
  a quick press acts on the newly highlighted control; classic and axes unchanged.

## Follow-up: frame_listener has no appState until a highlight opens (review F1 remainder)

Fact sheet:
- (a) READ: `utils/frame_listener.js:115,119` (`add_text`: `this.appState.get(...)`,
  `this.appState.activate_button`), `:125` (`speak_text`: `this.get('appState.speak_mode')`), `:207`
  (`size_targets` observer on `appState.speak_mode`). Messages arrive via
  `window.addEventListener('message')` (`:283`) -> `handle_action` (`:18`). CONFIRMED.
- (b) Shapes and writers: ONE writer, `frame_listener.setup` (`:16`), called only from `scanner.setup`
  (`utils/scanner.js:160`), called only when a scanning highlight opens (`controllers/highlight.js:50`).
  Highlights open for scanning, button search (`controllers/application.js:1603`) and modeling
  (`utils/sync.js:599`). So `undefined` for any session that has not opened a highlight; the
  app-state service after one (with commit a8219ca5d). CONFIRMED by grep.
- (c) Before `3b80dc494` the module read the `app_state` singleton (always available). CONFIRMED.
  `tests/utils/frame_listener-test.js:44-45` sets `frame_listener.appState` by hand in beforeEach,
  hiding the gap. CONFIRMED.
- Effect: an integration iframe's `add_text` throws (TypeError); `speak_text` in speak mode takes the
  silent path instead of speaking (pre-`3b80dc494` it spoke). The `size_targets` observer was dead
  BEFORE the migration too (it watched `app_state.speak_mode` on frame_listener, a property never set,
  `3b80dc494^:utils/frame_listener.js:204`); with this fix it fires for the first time: NEW behaviour,
  harmless (no-op without `#integration_overlay`; with one it resizes targets on speak-mode change).

Candidates:
1. (applied) app-state `init` registers itself: `frame_listener.set('appState', this)` on the existing
   `LingoLinq.appState = this;` line (`services/app-state.js:74`; same line so the `.eslint-todo` rows
   from 101 do not shift; app-state already imports frame_listener, `:45`). Covers all four readers
   (and makes the observer live, see above). Each app boot (each test) replaces a dead owner's service.
2. Readers fall back to `LingoLinq.appState`: leaves the observer dead; rejected.

Red test: `tests/utils/frame_listener-test.js` "frame_listener without a highlight": asserts
`frame_listener.appState` is this owner's app-state with no setup call, and that `add_text` reaches
its `activate_button` and responds `{added: true}`. Mutation: remove the registration -> fails.
Note: the fix was edited before this proposal was reviewed (process slip); review runs before any
build or commit.

Review (adversary, read-only): ship with conditions; no Critical/High. Checked and applied: the
"scanning only" wording was too narrow (button search and modeling highlights also run setup), fixed in
this log, the test comment and the app-state comment; the observer is new behaviour, not a restoration,
corrected above; `speak_text` had no test, added ("speaks an integration's speak_text aloud only in
speak mode"). Not adopted: an instance-initializer instead of the init line (optional; keeps the
registration next to the existing `LingoLinq.appState = this` it mirrors).
