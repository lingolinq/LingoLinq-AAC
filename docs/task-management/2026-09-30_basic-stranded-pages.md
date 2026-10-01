# 2026-09-30 — Basic stranded pages: Basic Access rail link, supervisee boards, picker for a communicator

Branch: `traci/styling/classic-view-overlay`. Follows the Basic View Parity handoff (same day),
whose "Pages that can still strand a Basic user" table had two rows.

## Decisions (Traci, 2026-09-30)

- `/offline-boards` in Basic: NO redirect. Give Basic its own link to Basic Access in the home
  page's left rail. (A redirect to search was proposed and rejected after review: see below.)
- `/<communicator>/boards` in Basic: go to that communicator's account page (`/<communicator>`).
- Picker "use the recommended board" for a communicator: match the overlay's "Pick this Board"
  (Basic opens their new home board; Modern unchanged).

## Why not redirect Basic Access to search

Red-team review of the redirect proposal, verified:
- Basic Access boards are bundled (`controllers/offline_boards.js:14`, `utils/obf-emergency`) and
  work offline; search fetches only online (`controllers/search.js:153`, `:218`).
- Basic had no other entry (the only signed-in card is Modern's Extras list,
  `authenticated-view.js:1224`), so a redirect would make the emergency boards unreachable from
  Basic, offline included.
- The emergency board's Back returns to `offline_boards` (`services/app-state.js:1319-1322`).
Not verified, noted only: after an in-app logout (beta `auth_spa_transition`)
`session_user_promise` is not cleared, which a redirect keyed on it could misread.

## Changes

1. **Basic Access rail row.** New `components/dashboard/classic-rail-basic-access.hbs`, rendered by
   both rail copies (`classic-view.hbs` inline rail, `classic-rail.hbs`; in the latter inside the
   personal-rows block, hidden in org mode). Gated on `feature_flags.emergency_boards`, as the
   Modern card and signed-out navbar link are. Alphabetical slot: after the pinned Home Page and
   Organizations. New i18n key `classic_short_basic_access` (13 locales); `offline_boards_subtitle`
   added to en.json (it existed in the other 12 only). Browser: example in Basic shows the row
   second, and clicking it opens `/offline-boards`, which keeps the top navbar.
2. **Someone else's boards library in Basic -> their account page.** `routes/user/boards.js`
   afterModel: not own + Basic viewer -> `transitionTo('user.index', user_name)`. The account page
   renders the same `<BoardsBrowser>` (`templates/user/index.hbs:799`) under the Basic account
   rail (`templates/user.hbs:25`). Covers the board header's My Boards while speaking as a
   communicator (`openMyBoards` reads `referenced_user`), bookmarks and Back. New
   `is_basic_viewer` in `utils/basic_landing.js`, shared with `send_basic_viewer_to_landing`.
   Browser (no supervisees on example, so the public `lingolinq` account): cold and in-app
   `/lingolinq/boards` -> `/lingolinq` with the Basic rail and boards list.
   APPROVED TEST CHANGE: "user.boards, Basic, a supervisee's library: stays" now asserts the
   account page (spec changed by Traci's decision above); comment in the test records it.
3. **Picker recommended board for a communicator.** `controllers/board-picker.js`: `onSuccess`
   already receives the home board (`utils/assign-vocal-flair-home.js:58`, `:93`); it is passed to
   `_afterHomeBoardAssigned`, which uses `after_pick_for_other`. No board -> boards list as before
   (which item 2 now routes to the account page in Basic).

Tests: `tests/integration/classic-rail-basic-access-test.js` (2),
`tests/unit/controllers/board-picker-pick-for-other-test.js` (3), basic-view-landing-routes-test
(+2, 1 changed). Each red first, and falsified after (gate removed / redirect disabled / picker
branch disabled -> exactly the expected tests red; restored from copies).
ESLint gate new=73 (unchanged); template lint clean.

## Pre-existing failing test, fixed (approved by Traci)

- `tests/unit/components/classic-view-extras-landing-test.js` "arriving with the Extras drawer
  handed off..." failed at HEAD (baseline: same failure with this change's app files reverted).
  Its stub `currentUser` had no `save`; the `main` handoff calls `set_index_nav`, which saves the
  user (`authenticated-view.js:1667`). Fixed by giving the stub a resolving `save`; falsified by
  disabling the drawer-open block in `classic-view.js` (that test goes red, the other stays green).
- The handoff's regex filter never ran this module (nor `Basic view landings`), so batch 1's
  commit message (`67bc5b6b7`, already pushed) wrongly lists it as passing. Corrected in the
  test-fix commit's message rather than by rewriting pushed history.

## Noted, not fixed

- Account page heading reads "My Account" when viewing another user (pre-existing).

## Verification (final)

Plain-string module filters, each counted: Basic view landings for Modern-only pages 9/9,
classic-view Extras landing 2/2, user showClassicAccountRail 6/6, view-switcher 11/11; regex run
over the rest 50/50 with per-module counts (classic-rail-basic-access 2, board-picker pick for a
communicator 3, basic_landing Extras 3, Basic Access 1, index login entry 4, board_picker_landing
4, basic-try-home-button 4, home-boards redirect 1). ESLint gate new=73; template lint clean.

## Round 2 (same day): direct arrivals in Basic, and the account heading

Decisions (Traci): (1) a single communicator's caseload carries their user name and expands that
communicator's card, scrolled to; (2) /extras opened directly in Basic re-routes to the home page
with the Extras drawer open and scrolled to; (3) /logs?nav=home goes to the Updates tab, REVISED
the same day to "land on the Logs page" (see "Still open" below; not shipped). Also
requested: the account page heading shows the account holder's name, or their username.

- `utils/basic_landing.js`: the caseload entry names `open_supervisee_from: 'supervisee'`;
  `basic_landing_for` copies the entry with `open_supervisee` when the URL carries it;
  `hand_off_index_nav` hands it off (`pending_open_supervisee`, taken once by
  `take_pending_open_supervisee`); `query_string_for(transition)` lets routes feed the same URL
  test the View menu uses.
- `routes/caseload.js` passes its query string. `routes/user/extras.js` (after the inherited
  own-account check in routes/user/home.js) calls `send_basic_viewer_to_landing`.
- `components/dashboard/classic-view.js#_expand_supervisee_card`: sets `openSuperviseeId` (the
  card's Extras panel) and scrolls the card (`#ch-extras-<id>`'s `.ch-comm`) below the header.
- `templates/user/index.hbs`: both headings (Gentle hero, Focused head) read
  `this.model.display_name` instead of "My Account".

Tests (each red first, each change falsified by its own mutation): basic-landing-supervisee (4),
basic-view-direct-landings (4), classic-view-supervisee-landing (3). Related modules by name:
basic_landing 14, Basic view landings 9, Extras landing 2, extras scroll 3, index login entry 4,
view-switcher 11, display-name helper 4; ESLint new=73; template lint clean.
Browser (example, Basic): /example/extras -> /example/home, Actions, drawer open at y=82.
Headings: /example "Example", /lingolinq
"LingoLinq". NOT checked live: the caseload card expansion (example has no supervisees) and the
username fallback on a nameless account (covered by the display-name helper tests).
Side effect of an earlier probe (the Updates-tab version): it marked example's notifications read.

### Still open: /logs?type=note&nav=home in Basic -> the plain Logs page

Wanted: a Basic viewer opening Modern's Updates address directly lands on Basic's own Logs page
(`/<me>/logs`, no query, the page the Basic account rail's Logs row opens). Two attempts in
`routes/user/logs.js` afterModel, both reverted (`logs.js` is at HEAD):
1. `router.replaceWith('user.logs', me, {queryParams: {nav: null, type: null}})` then
   `return RSVP.reject()`: unit tests green, but in the browser the page showed "Failed to load".
   The QP-only replace to the SAME route did not abort the in-flight transition, so the rejection
   failed it. (Unit tests stub the router, so they cannot see this.)
2. The same replace without the reject: the page rendered (Basic rail, Logs row active), but the
   URL kept `?type=note&nav=home`; the in-flight transition finished with its own params.
Stopped there (Rule #13). Untried next steps: do the replace after the transition completes
(`transition.then(...)` or from setupController), skipping `markUpdatesRead` for that arrival;
or a different-route hop. Whatever lands needs a browser check of the URL, the rail, the filter,
Back (no loop), and that notifications are not marked read. The two attempts and the trimmed
tests are saved outside the repo; the unit tests for it should assert on a real transition
outcome, not a router stub.
