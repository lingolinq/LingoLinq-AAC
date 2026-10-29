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

## Remaining review findings (2026-10-11, closing pass)

- Fixed: the observer behaviour was untested. `frame_listener-test.js` "resizes integration targets
  when speak mode changes" pins it (fails with the registration removed).
- Fixed: the first review's F2 (test pinned the wiring, not the symptom). `highlight-test.js` "lets
  start()'s preference guard see the scanning preference after it opens" (since 2026-10-28 "does not
  stop scanning in start() after a highlight opens", which runs the real start()) evaluates the exact read at
  `utils/scanner.js:189` (fails with the highlight's `appState` removed).
- Test hygiene: the speak-mode tests restore state in afterEach, so a failure cannot leak speak mode,
  the board or the overlay into later tests.
- Not changed, with reason: a destroyed service left in `scanner.appState` between tests (test-only;
  production never destroys app-state; the only test that opens a real highlight restores it; #1118
  rewrites the same `check_scanning` line with `live_service`, so changing it here would conflict).
  The instance-initializer alternative (style preference). Double vocalization if an integration sends
  both add_text and speak_text (PLAUSIBLE; integration client code is not in this repo).
- Verification: one build; fixed bundle frame_listener 49/49, HighlightController 3/3; mutant without
  the registration fails exactly the 3 new frame_listener tests; mutant without the highlight
  `appState` fails exactly the 2 highlight hand-off tests. lint:js:ci new=0.

## Re-verification on current develop (2026-10-28)

The branch had sat since 2026-10-11 while develop moved 31 commits, including #1118, which rewrote
the scanner's restart path. Merged `origin/develop` (`71690f86a`; one conflict, the learnings archive,
both sides kept). Net diff against develop unchanged: 6 files, +348/-2.

Still necessary, no overlap with #1118 (CONFIRMED):
- `controllers/highlight.js` on develop still declares no `appState`, and `scanner.setup`
  (`utils/scanner.js:159`) still reads `controller.get('appState')`, so every highlight open leaves
  `scanner.appState` undefined. Nothing on develop sets `frame_listener.appState`.
- #1118's `owner_gone` (`utils/live_service.js`) lets the restart RUN when no owner was captured; its
  own comment names this gap. The restart then calls `start()`, whose preference guard
  (`scanner.js:189`) reads the same undefined `appState` and stops. The two changes are complementary.
- `check_scanning` (`services/app-state.js:2060`) re-sets `scanner.appState` only when something calls
  it, which is why classic recovered on its own and modern with auto-home off did not.

Origin: before `3b80dc494` (2026-01-27) both utils imported the `app_state` singleton directly, so
this failure could not happen. The pre-migration build could not be run against today's backend (no
board-detail view; session lost on reload; `/api/v1/users/cache` HTTP 400; board renders 0 buttons),
so "the original scanner worked at runtime" stays UNVERIFIED; the code-level claim is CONFIRMED.

Unit runs (one test build, then one combined mutant build: develop's `highlight.js` and
`app-state.js` with this branch's tests):
- fixed: HighlightController 3/3, frame_listener 49/49, "scanner" 81 (77 pass, 4 skip, 0 fail).
- mutant: exactly the 5 new tests fail (2 highlight hand-off, 3 frame_listener), nothing else.
- `npm run lint:js:ci`: new=0.

Runtime (`switch-scanning-qa.mjs` from `traci/test/switch-scanning-qa-script`, Rails on 5000, each
build served with `ember serve --proxy http://127.0.0.1:5000`, user `example`):

| Scenario | develop | fixed |
|---|---|---|
| modern speak button | stopped, never resumed | resumes 24 ms, 1 s steps |
| modern three in a row | fails (stopped after the first) | all three, ~20 ms resumes |
| modern folder | resumes 1102 ms | 77 ms |
| modern step + quick presses | stopped | resumes 333 ms, no previous-board words |
| modern auto-home + quick presses | 1052 ms | 157 ms, only the selected word |
| classic speak button | 1119 ms | 19 ms |
| classic step + quick presses | stopped at end | keeps scanning |
| classic three/folder/auto-home, both axes | same | same |

A live sample of the scanner every second showed `scanner.appState` missing on develop from the second
step on, and present on the fixed build; both scan the same order. The first fixed run timed out on
every scenario right after the develop run; a rerun alone and the sample both passed. Cause not found.
Pre-existing on both builds: a `board-icon` "calling set on destroyed object" page error.

## Review findings fixed (2026-10-28)

### High: scanning restarted outside speak mode

Fact sheet:
- READ: `utils/scanner.js` `start()` decides whether to scan. Its only mode check was `#speak` on the page.
  CONFIRMED (`utils/scanner.js:185-191`).
- SHAPES: `#speak` exists on board-detail in every mode (`templates/user/board-detail.hbs:624`, outside any
  mode condition; only hidden by CSS in edit mode) and on the classic view only in speak mode
  (`templates/application.hbs:27-28`). CONFIRMED. The old guard was `header #speak`, removed in `9aa0007c0`.
  CONFIRMED (`git show 9aa0007c0 -- app/frontend/app/utils/scanner.js`).
- CROSS-FILE: every resume passes `scanner.options`, which `stop()` never clears (`utils/scanner.js:611-617`
  clears only `last_options`): `utils/modal.js:130,192,441`, `services/modal.js:121,286`,
  `routes/user/board-detail.js:114`. CONFIRMED. `check_scanning` starts scanning only when `speak_mode`
  and the preference are both on (`services/app-state.js:2043`). CONFIRMED.

Runtime (scratch script `modal-resume-qa.mjs`, modern view, `example`, scan in speak mode, leave
speak mode, open and close `about-lingolinq`, sample 4 s):

| | branch before this fix | fixed |
|---|---|---|
| after leaving speak mode | stopped | stopped |
| after the modal closes | scanning, highlight shown | not scanning |
| same, staying in speak mode | (n/a) | resumes |

Fix: `start()` also requires `appState.speak_mode` (folded into the preference check; the comment above it
rewritten at the same length so the line-anchored `.eslint-todo` rows below stay put). Considered and
rejected: resuming only when scanning was running at modal open (`resume_scanning`); it misses the
scannable-modal start and the board re-arm, which also pass stale options.

Tests: new `tests/unit/utils/scanner-speak-mode-test.js` (red on the pre-fix file, green after; its
speak-mode control passes on both). Two existing stubs now say the app is in speak mode:
`tests/utils/scanner-board-rearm-test.js` (its `scanner.get` stub answered only the preference) and this
branch's own highlight test (a pass-through stub for `appState.speak_mode`, because setting the real
property fires eight observers, `check_scanning` among them).

Re-run of `switch-scanning-qa.mjs` on the fixed build matches the earlier fixed numbers (modern speak 24 ms,
three in a row ~21 ms, folder 77 ms, step+quick 328 ms, auto-home 137 ms, classic speak 23 ms). Classic
auto-home and both axes runs report `stoppedAtEnd: true` on the pre-fix and fixed code alike.

### Medium: integration messages trusted from any origin

The fix re-enables `add_text` and `speak_text` (they need `frame_listener.appState`), so this branch makes
them reachable again. Research (sources in the PR body): MDN `postMessage` says check `event.origin`
exactly and never use `'*'` as the target when the data matters; OWASP-derived scanner rules (ZAP) flag
both; `aac_shim.js` itself posts with `'*'` and validates nothing, so the host must. AAC ethics treat the
user as the author of what their device says, so speech from a third party is a high-impact path.

Fix (`utils/frame_listener.js`): refuse messages whose origin is not that of the frame's configured `src`;
reply to that origin only; refuse non-string or over-500-character text and a non-http(s) `image_url`.
Not done here: `sandbox` on the iframe, the `interrupt: true` product question, a backend scheme check on
`board_render_url`, and the first-message `data-session_id` claim (`session_window` runs before the
origin check, so any window holding a reference to the app, such as a page opened from a board
button without `noopener`, can pin `data-session_id` before the integration's first message; the
integration's targets and listeners then drop out, so switch users cannot reach them. It cannot add or speak text).
Also added after review: `add_text`/`speak_text` refuse text with an app-action segment (`:clear`,
`hi && :home`; `utterance.specialty_button` would run it) and a non-string `image_url`.

Unit runs: fixed build frame_listener 56/56, "scanner" 83 (79 pass, 4 skip), HighlightController 3/3.
Mutant build (the pre-fix `scanner.js` and `frame_listener.js` from `97dbf59d0`): exactly the 8 new tests
fail. `node scripts/eslint-todo-gate.js`: new=0.

### Final review round (2026-10-28, head `8cf736e74`)

Senior-dev pass: approve with comments. Red-team: do not block. Fixed from them:
- **Inline actions in integration text (red-team Medium, CONFIRMED in code).** `utterance.set_button_list` runs
  inline `:tokens` anywhere in a vocalization (`utils/utterance.js:151-158,201-214`), and the earlier check only
  looked at the start and `&&` segments. `frame_listener.text_has_action` now also rejects any `:token` that
  `LingoLinq.find_special_action` resolves. The rule applies to `add_text` only: `speak_text` goes to
  `speecher.speak_text` or `silent_speak_button`, neither of which runs actions. An empty `image_url` counts as absent.
- **`:battery-level` and `:current-month` crashed the sentence bar (pre-existing, any board author).**
  `process_inline_content` concatenates `content()` and `combine_content` reads `.text` of each piece
  (`utils/utterance.js:454-470`); these two returned a bare string and the placeholder `"DATE"`
  (`utils/button.js:2067,2106`). Both now return `[{text}]`, the month by name. Test: every inline action's
  content is a list of text pieces (`tests/utils/utterance-test.js`).
- Docs: observer count (nine), learnings headings, the QA-collision cause marked unconfirmed, the renamed test.

Not changed: the speak_text test in `frame_listener-test.js` still sets the real speak mode (it waits for its
effect); the reported test-frame navigation does not happen (the fixture is a `div`); `respond` has one caller.
