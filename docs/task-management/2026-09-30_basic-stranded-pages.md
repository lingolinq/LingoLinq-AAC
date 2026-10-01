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
