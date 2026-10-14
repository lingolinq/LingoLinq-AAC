# 2026-10-12: tour redesign (welcome, communicator board tour, offer after first message, SLP tour)

Branch: `traci/fix/scots-review-fixes`.

## Asked
"One clear welcome: a primary Start talking now button with the board picture and 'We'll set up Vocal
Flair 60. You can change it anytime.' Add a secondary Choose a different board and a small Take a quick
tour (1 min) link. 4 or 5 steps per role. Communicators: review your board, switching boards, messages
and help, the grown-ups area. SLPs: favorites, caseload, Model, dashboards. Offer the tour after the
person has talked once."

## Agreed design (Traci, 2026-10-12)
1. Welcome (communicators, Modern and Basic, first login and the home page's "Take a tour"):
   - Start talking now (primary, Vocal Flair 60 picture): their own vocal-flair-60 copy (made at signup)
     becomes their home board, then Speak Mode in their view.
   - Choose a different board (secondary): straight to the board picker.
   - Take a quick tour (1 min) (link): as Start talking now, then the communicator tour on the board.
2. Communicator tour, 5 steps, on their board in Speak Mode: welcome, review your board (grid), switching
   boards (Home / folders), messages and help (message bar, Speak, Help), the grown-ups area (the way out
   to the home page, PIN-protected if set). Modern replaces the board speak tour for communicators; Basic
   gets its first board-page tour.
3. Offer: after a communicator's first spoken message, one small "Take a quick tour (1 min)?" prompt
   (Start / Not now), shown once.
4. SLP tour, 5 steps, on the home page in both views: welcome, favorites (Boards), caseload, Model (from
   Caseload), dashboards (Attention, Rooms). No board-setup welcome for SLPs.

## Progress
### Phase 1: welcome (done, verified live in Modern and Basic)
- `utils/tours/home.js#communicatorWelcomeStep`, used by `home.js` and `classic-home.js` for a communicator.
- `utils/tours/start_talking.js#start_talking_now`: copy-or-reuse Vocal Flair 60 as home, then
  `app-state#home_in_speak_mode`; on failure, an error and the board picker.
- Dispatch: `components/guided-tour.js` `_welcomeAction` (a `reopen`, line-neutral for `.eslint-todo`).

### Phase 2: communicator board tour (done, verified live in Modern and Basic)
- `utils/tours/communicator-board.js`: 5 steps. Modern via `board-detail-speak.js` when `supporter === false`;
  Basic via `registry.js` (`user.board-alt`, key `board_alt_speak`) and a `@boardAltHost` instance in
  `templates/board/index.hbs`. The Speak Mode intro modal is held back while `board_alt_tour_pending` is set.

### Phase 3: offer after the first message (done)
- `utils/tours/tour_offer.js` (`maybe_offer_tour`, `accept_tour_offer`, `dismiss_tour_offer`,
  `arm_board_tour`, `mark_tour_offered`) and `components/tour-offer` (mounted once in `application.hbs`).
- Called from `utterance.vocalize_list` and from Modern's quick-phrase fallback in
  `controllers/user/board-detail.js#_speak_current_sentence`, which skips `vocalize_list` (found while
  tracing; red test first).
- Remembered as `preferences.progress.guided_tours_autoshown.tour_offer`: the server keeps only the
  progress keys in `User::PROGRESS_PARAMS` (an allowlist), and a new key was silently dropped. Verified
  live: the server row holds `{"tour_offer" => true}` after the offer.
- "Take a quick tour" on the welcome also marks it, so nobody is offered a tour they already chose.
- Tests: `tests/unit/utils/tours/tour-offer-test.js` (7). Falsified: removing the `vocalize_list` hook
  turns "speaking a message makes the offer" red.
- Live (Aiden, both views): the offer after the first message; Start opens `comm_board_tour_welcome`;
  a second message brings no offer; 0 page errors.

### Phase 4: SLP tour (done, verified live: Modern Gentle, Modern Focused, Basic)
- Five steps (Traci, 2026-10-12: "5 steps with a welcome"): welcome, then favorites, caseload, Model and
  dashboards, the last one finishing the tour. An SLP is a supporter (`supporter_role`; `User` registration
  types therapist, parent, teacher, other), so this is the supporter tour.
- Modern (`utils/tours/home.js#menuTopics`): the Boards pill (its page has Favorites), the My Caseload card,
  the Caseload pill (Model is a quick action on the Caseload page, `templates/caseload.hbs:161`), the
  attention card or else Rooms. The replay menu offers the same four. The old linear done step and the
  communicator skip off-ramp were removed: nothing reached them after the redesign.
- Basic (`utils/tours/classic-home.js#interiorSteps`): the Boards tab (no favorites view there, so "Your
  boards"), the Communicators tab, a communicator card's actions (Model tile, shown once that communicator
  has a home board; the step opens the Communicators tab first), the side menu. Tab markers
  `data-tour-tab="supervisees"` / `"boards"` added in `classic-view.hbs` (same lines).
- Tests: `tests/unit/utils/tours/slp-home-tour-test.js` (4, falsified on the Basic tab switch). With approval:
  `supporter-home-tour-test.js` and `home-tour-steps-test.js` rewritten to the 5-step spec;
  `tours-classic-home-tab-test.js` deleted (it guarded the removed "main actions" step);
  `communicator-tour-topics-test.js` given the caseload targets. 87/87 tour tests pass; lint gates clean.
- Found while verifying: the unused-style cleanup (3fc054bdd) had removed 10 live tour classes. Restored;
  see the correction in `2026-10-12_unused-styles-audit.md`.

### Found along the way, not fixed here (pre-existing, files identical to develop)
- **Basic: tapping the sentence bar does not speak (local build).** `application.hbs:135` listens with
  `{{on "select" (this.ctrlAction "vocalize")}}`, a native listener; `utils/raw_events.js:1705` fires
  `$elem.trigger('select')`, a jQuery event, which native listeners never receive. Measured on a tap:
  jQuery `select` 1, native 0, `vocalize_list` 0. A native `select` event speaks and the offer follows.
  The `{{on}}` form arrived in #625 (2026-07-17); before it, `{{action "vocalize" on="select"}}` went
  through Ember's event dispatcher, which jQuery-triggered events reached while jQuery integration was on.
  **Fixed 2026-10-13** (uncommitted at the time of writing): `utils/select_event.js#fire_select` dispatches a
  native `select`; used on the tap path (`raw_events.js` element_release), the Enter/Space keyup handler
  (`raw_events.js`), and switch scanning (`scanner.js#pick_elem`, where `JShim.select()` did nothing at
  all on an `<a>`). Test: `tests/unit/utils/button-list-select-test.js` (keyboard + scanner, red first;
  falsified on the keyup line). Live (Aiden, Basic): tapping the bar and tapping a word chip both speak,
  the tour offer follows, Start opens the board tour, 0 page errors.
  Committed as 71ccda4d7.
  **Enter on the focused bar (fixed 2026-10-13, uncommitted at the time of writing).** Traced live with a
  stack at the blur: with "listen to the keyboard" on (`keyboard_listen`), the document keydown handler in
  `raw_events.js` typed Enter/Space into the sentence as a space, and `services/app-state.js#activate_button`
  ran `$(":focus").blur()` in Speak Mode, so the keyup landed on BODY and the bar's keyup handler never ran.
  Fix, line-neutral: the existing Extras-button guard in that keydown handler also matches `#button_list`;
  for the bar it only prevents the typing (held repeats included) and returns, so focus stays and the keyup
  handler speaks it. Tests in `button-list-select-test.js` pin every gate of the typing branch (scanning,
  dwell, an open modal: other suites leave them on, which made the first version pass vacuously); falsified
  against HEAD. Mixed run (select/scanner/utterance/keyboard filter): only the 2 `app_state` toggle tests
  fail, and they fail identically at HEAD (`this.controller.set is not a function` from state another suite
  leaves). Live (Aiden, Basic): keydown and keyup both on the bar, spoken once, nothing typed, 0 page errors.

## Adversary review (local), 2026-10-13: branch vs develop, commits 8b9dd20cb..bef14ad59
Local substitute (`/adversary-review-local`, five read-only reviewers, findings verified by hand); the
canonical `/review-pr` and `/adversary-review` did not run here. Earlier commits had three prior red-team
passes, all findings resolved (logged in 8b9dd20cb).

| # | Sev | Finding | Label | Evidence |
|---|---|---|---|---|
| 1 | High | A communicator's manual "Take a tour" shows the welcome card; "Start talking now" and "Take a quick tour" replace an existing home board with Vocal Flair 60, no check | CONFIRMED | `utils/tours/home.js` buildHomeSteps (non-supporter always welcome), `start_talking.js` copy_or_reuse_as_home; at base the welcome's speak only opened the existing board |
| 2 | Medium | Speak-as: the offer reads `currentUser`, which is the communicator in Speak Mode (`app-state.js:2744`), so a supervisor's message shows them the offer and saves the flag on the communicator | CONFIRMED | `tour_offer.js:48-57` |
| 3 | Medium | `tour_offer_visible` is cleared only by Start/Not now; the card returns on every Speak Mode entry, incl. a supervisor modeling. Logout leak and stale `board_alt_tour_pending` | CONFIRMED / PLAUSIBLE | `tour-offer.hbs:1`, `tour_offer.js` |
| 4 | Medium | Copy fails after Cancel: dialog says "Cancelled", discard never runs, copies left behind | CONFIRMED | `confirm-home-board-copy.js:153` |
| 5 | Medium | Cancel discard trusts the device clock: clock ahead leaves copies (says removed); clock far behind can delete a user's own board linked but not copied | CONFIRMED / PLAUSIBLE | `board-copy.js:160-184` |
| 6 | Medium | Copy dialog cannot be closed while the server job is stuck (uncloseable, no timeout) | CONFIRMED in code | `confirm-home-board-copy.js` isBusy + `@uncloseable` |
| 7 | Medium | 87 new `!important` declarations in override blocks (Rule #0.7), mostly b9744e3cc (66) and b59eff03c (12) | CONFIRMED | `git diff 8b9dd20cb.. -- app/frontend/app/styles` |
| 8 | Medium | The tour offer is new UI with no feature flag | Decision | `tour_offer.js` |
| 9 | Medium | First-message `user.save()` may push stale preferences over a supervisor's concurrent edit | PLAUSIBLE | `tour_offer.js:26-36` |
| 10 | Medium | Gentle rail dropdown sub-label likely below 4.5:1 | PLAUSIBLE | `_classic-home.scss:701-708` |
| 11 | Low | Display Style preview keeps stale caseload grid classes | CONFIRMED | `display-style.js:549` vs `dashboard_sections.js:800-806` |
| 12 | Low | `.google-visualization-tooltip` rule removed; Google Charts (CDN) adds it | CONFIRMED | 3fc054bdd^ app.scss:99585; `stats/sessions-per-week.js:39` |
| 13 | Low | Board-alt Support button 36px (below 44px) | CONFIRMED | app.scss board-alt `.ll-bento-help-btn` |
| 14 | Low | Trial-bar online preload/sync lost its test with basic-try-home-button-tail-test | CONFIRMED | `trial-bar.js:87-91` |
| 15 | Low | Others: SLP tour leaves Communicators tab open; boardAltHost instance not excluded from home watchers (harmless today); stale `home_tour_skip_handoff` filter; Set Home owned-board double tap; offline cancel silent; dropdown not closed on focusout; fixed heights at 200% text; scanning user Space at a focused bar; tour-offer-test leaves `list_vocalized`/ghost_utterance; stale glassy-image comment; Basic Assign Home mode unflagged | mixed | reviewer reports |

REFUTED: "the offer cannot be tapped on touch devices" (eat_events): on an emulated Android tablet
(`capabilities.mobile` true) Start closed the offer and opened the tour in both Modern and Basic. Real iPad not tested.
Blocking: #1 (High, CONFIRMED) blocks a PR per root CLAUDE.md.

### Fixes from the review (2026-10-13, uncommitted at the time of writing)
Each red first, falsified by reverting the fix, then restored.
- **#1 (High) fixed.** `start_talking.js` opens an existing home board instead of copying (the only route to
  the copy); the welcome card takes `hasHome` (`guided-tour.js` builder options, same lines) and then reads
  "Opens your home board." with no Vocal Flair 60 picture or note. Tests: 3 in `home-welcome-buttons-test.js`.
  Live (Aiden, home board lingolinq/keyboard, manual tour in Modern and Basic): the card says it opens their
  home board, the quick tour runs 5 steps on it, the home board is unchanged, 0 boards created. The no-home
  first-login flow re-checked live in both views: unchanged.
- **#2 fixed.** `maybe_offer_tour` returns early when `sessionUser` is not the Speak Mode user.
- **#3 fixed.** The card shows only to `tour_offer_user`; leaving Speak Mode for 1.5s (a page change's brief
  dip does not count) ends the offer and drops Basic's pending board tour (`end_speak_mode_tour_state`);
  `_consumeBoardAltTour` drops its flag when it gives up. Tests: 4 in `tour-offer-test.js`.
- **#4 fixed.** An error after Cancel shows "The copy stopped with an error, so some copied boards may still be
  in My Boards. Your home board wasn't changed." instead of "Cancelled" (cleanup is not possible there:
  `edit_manager.copy_board` rejects with strings only).
- **#5 fixed.** `discard_cancelled_copy` dates its cutoff from the cancelled copy's own `created` (server time).
- **#6 fixed.** After 2 minutes (`slowAfter`) the copy dialog can be closed, with a line saying the work carries
  on (the copy and its clean-up run outside the dialog). Tests: 3 in `confirm-home-board-copy-test.js`, 1 in
  `home-copy-cancel-test.js`.
- **#10 fixed.** `.ch-rail__menu-sub` opacity 0.8 -> 0.9 in its original rule: measured live 4.27-4.44:1 before,
  5.26-5.52:1 after (Gentle, 390px).
- **#11 fixed.** The preview sweep covers `caseload-beside` / `caseload-row*`; `_applyGridPresentation` exported
  for its test (`display-style-grid-sweep-test.js`).
- **#12 fixed.** `.google-visualization-tooltip` restored verbatim at its original place.
- **#14 fixed.** Trial-bar preload/sync coverage restored (2 tests; the online one fails with the sync removed).
- `tour-offer-test` restores `list_vocalized`.
- **Not done, decisions:** #7 (87 `!important` in override blocks: folding them into their original rules is a
  styling refactor across Gentle/Focused at several widths), #8 (feature flag for the offer), #9 (whole-preferences
  save, a pre-existing pattern shared by every progress flag), #13 (36px Support button, a design she set), and the
  remaining Lows.

### Speak Mode card shows the board it opens (2026-10-13, uncommitted at the time of writing)
- Requested: "on the speak mode card, instead of showing the image that is on that card, show the board's image
  for the board it will take the user to"; then a round silver picture frame, lifted, the picture indented, and a
  light thin slate outline.
- `components/dashboard/authenticated-view.js`: `speak_target` (home board, else last board) is shared by
  `go('speak')` (same line count, so `.eslint-todo` rows hold) and `speakBoardImage` (Board#icon_url_with_fallback;
  the record is peeked, or fetched once by key). No board, or none loadable: the card keeps its own icon/badge.
  All four Speak card variants in `authenticated-view.hbs`; frame styles in `app.scss` (`.md-card__icon-board-img`,
  `.md-card--speak-focused__img--board`). Test: `dashboard-speak-board-image-test.js` (4; falsified). Written
  before its test, against the red-first rule; checked by mutation instead.
- Live: the example user's home board picture in Gentle and Focused, an SLP's Vocal Flair 112 in Gentle; 0 page errors.
- Full suite: two runs did not complete because `ember serve` was running (frontend CLAUDE.md: do not run the full
  suite then). The slow failures named different tests each time, and each passes alone.

## Final adversary review (local), 2026-10-13: whole branch vs develop at 7137fc56a
Local substitute (`/adversary-review-local`, five read-only reviewers, key findings checked by hand); the
canonical `/review-pr` and `/adversary-review` did not run here. Every prior finding (three 2026-10-10/11
passes, and this morning's) was re-checked: all fixed items are still fixed; #7 (`!important` blocks), #8
(offer flag), #9 (whole-preferences save) and #13 (36px Support button) remain open as decisions.

| Sev | Finding | Label | Evidence |
|---|---|---|---|
| High | "Use this board" says "is now your home board" before the home board is saved; the save is client-side after the ~30s copy job, so closing the app, reloading or logging out meanwhile leaves the old home board (and a full copied set in My Boards). Two Uses in the window race: the last copy to finish wins and clears the other's pending state. | CONFIRMED | `components/trial-bar.js` use; `utils/edit_manager.js:2761`; `User#copy_board_links` never sets home |
| Medium | After the copy, the Speak Mode session's home stays the CATALOG board (`root_board_state`), so Basic/app-state Home and auto-home return to it for the session | CONFIRMED | `app-state.js:1358-1359`, Speak Mode entered with `force_board_state` = tried board |
| Medium | A sidebar jump during a trial pushes the trail, so the trial bar (and Home -> tried board) appears on the user's own sidebar board; the trail is capped at 20 | CONFIRMED | `controllers/user/board-detail.js:9464`, `:6569` |
| Medium | Basic bar keyup (Enter/Space) has no scanning/dwell guard: a scanning or dwell-key user whose bar holds focus can have the sentence spoken by a scan key, twice with Enter | CONFIRMED (code) | `utils/raw_events.js:730-733` vs the keydown guard |
| Medium | The tour offer card cannot be reached by switch scanning or eye-gaze (not a scanner target, not in any dwell region) and covers bottom-row buttons; no scanning/dwell/eye-gaze check before offering | CONFIRMED (code) | `utils/tours/tour_offer.js`, `scanner.js` rows, `tour-offer.hbs` |
| Low | New per-user state not reset on SPA logout (`board_picker_recent/return/category/restore`, `home_copy_pending`, `board_alt_tour_pending`): with `auth_spa_transition` on, the next user sees "Recently tried" chips | CONFIRMED (code) | `app-state.js:2195` reset list |
| Low | Boot-time dead session: `find_user` calls `force_logout` again (no `logout_under_way` guard); the second teardown clears the shared stored login | CONFIRMED (code) | `app-state.js:599` |
| Low | Focused Speak card board picture ~22px at <=1024px (fixed 12px padding + 5px ring inside a 55.93px slot) | CONFIRMED | `app.scss` `.md-card--speak-focused__img--board` + 1024px clamp |
| Low | Phone drawer still says "Display Style" (View menu: "Display Design"); its comment about the disc is stale | CONFIRMED | `app-navbar-authenticated-inner.hbs:251-258` |
| Low | Basic-access dialog path: rail pages fail with no sign-in prompt | PLAUSIBLE | `controllers/application.js:28`, `routes/user.js:90` |
| Low | Offer not suppressed in eval mode | PLAUSIBLE | `tour_offer.js` (no `eval_mode` check) |
| Low | Speak card picture: no recompute on `root_board_state`/late `currentUser`, no retry after an offline failure; `obf/` keys fetched | PLAUSIBLE | `authenticated-view.js` speakBoardImage |
| Low | "Try another" leaves Speak Mode without the PIN (as the old Back did) | PRE-EXISTING | `board-detail.js` try_back_to_picker |
| Low | Owned-board double tap in Set Home mode; dropdown not closed on focusout; View menu height at 200% text; SLP tour leaves Communicators tab open; boardAltHost runs home watchers; stale skip_handoff filter | NOT FIXED (prior Lows) | |
| Process | `classic-view-extras-scroll-test.js` deleted (e076292dc) with no recorded approval (its code was removed too); `.eslint-todo` regenerated in bef644b00: checked, no (file, rule, hash) count rose (rows 1604 -> 1560), so no finding was grandfathered; `boards-set-home-mode-test` restores a stub outside `finally`; `preferences_lower` key reused with a different default (pre-existing pattern) | CONFIRMED | |

Blocking: the High (CONFIRMED regression) blocks a PR per root CLAUDE.md.

## PR readiness check (2026-10-13)

Green: ESLint gate (0 new), template lint, `git diff --check` (whitespace only in a task log), no merge
conflicts with develop, backend specs changed by the branch (509, 0 failures), the branch's Ember test
modules run one by one, live UI probes (frame, drawer, trial, Speak Mode PIN on "Try another").

Fixed, not committed: the Speak card picture fetch (`authenticated-view.js` `_loadSpeakBoard`, run in
`init`) also ran on the Basic home page (`classic-view.js` extends it; `classic-view.hbs` never shows the
picture). Wasted request on every Basic home load, and in unit tests the fetch landed after teardown and
failed the next test (`classic-view-home-assign-test`, 3 of 4, every run). `classic-view.js` now overrides
`_loadSpeakBoard` with a no-op. New test in `dashboard-speak-board-image-test.js`: red without the fix,
green with it; home-assign 4/4 with no test edit.

Diagnosed: an order-dependent slowdown in the `classic-rail` integration group, LOCAL (macOS) ONLY.
- develop: 16 tests, ~2 s each, twice. Branch: 21 tests; from test 15 they take 10-12 s, then the two
  last `classic-rail rooms only` tests run ~6 min each and fail. Each module passes alone; without the
  five `classic-rail-dropdown` tests the other 16 run clean on the branch build.
- CAUSE: Chrome background throttling of the test page, not app code. A CPU profile in a plain Chrome
  page (Playwright) showed the same run idle and every test ~2 s. Through testem with a temp config
  (outside the repo) the three flags Playwright adds fix it; a control copy without them reproduces it;
  `--disable-backgrounding-occluded-windows` ALONE fixes it, `--disable-renderer-backgrounding` alone
  does not. So Chrome treats the macOS test window as occluded and throttles its timers; QUnit's 15 s
  timeout is itself a timer, which is why a test could run ~6 min. (An earlier note here said "the main
  thread is busy"; the profile disproved it: it was idle.)
- Ruled out on the way: run-loop timers, pending requests, test waiters, the injected style, the real
  app-state service (stubbed: still slow), the dropdown's listeners, `image-fallback-to-rel`.
- NOT established: why the dropdown tests in particular push the window into the throttled state.
- CI runs ubuntu-latest, where Chrome has no native window occlusion tracking: expected unaffected, but
  UNVERIFIED until the PR's `build-and-test` run.
- Adding the flag to `testem.js` would be a test-config change (Rule #14): only with approval.
