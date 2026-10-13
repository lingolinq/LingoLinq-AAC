# 2026-10-12: SLP tour on the home page; caseload tour removed; last page saved correctly

Branch: `traci/fix/scots-review-fixes`. Uncommitted at the time of writing.

## Asked
"on an slp user, start their tour on the home page instead. make it no more than 4 steps. remove the tour
on their caseload page, and make their default first login be to their home page (but verify that if
they logged off on their caseload page, it logs them back in to their caseload page -> their history is
saved)". An SLP is a supporter (`supporter_role`).

## What was already true (verified, not changed)
- Default landing is Home for every role since 2026-09-02 (`routes/index.js#_land_on_default`).
- The last page is saved per user and device in `localStorage` (`ll_last_location_<user>`,
  `utils/session_history.js`), survives logout on purpose, and is replayed on the next login entry for
  anyone who is not communicator-only (`routes/index.js` afterModel, `session_resume` flag forced on).
- A supporter on Basic view always lands on Basic Home's Communicators tab and skips the resume
  (`_basic_supporter_lands_home`); Basic has no caseload page.

## Changes
- **Tour starts on Home** (`components/guided-tour.js`, line-neutral for `.eslint-todo`): the first-login
  auto-open's supporter branch calls `_startSupporterHomeAutoOpen` (was `_startCaseloadAutoOpen`), which
  starts the page's home tour, hopping to `user.home` only when the current page has none. The caseload
  page is no longer an auto-open host. Supporters get no board-picker handoff on a first-time finish and
  no board-picker link in the replay menu.
- **4 steps, no board choices** (`utils/tours/home.js`): the supporter welcome shows only "Take a tour of
  your home page"; the "Skip tour for now" off-ramp step is not built for them. Modern: welcome, cards,
  navigation, done. Basic (`classic-home.js`, unchanged): welcome, side menu, tabs, main actions.
- **Caseload tour removed**: `utils/tours/caseload.js` deleted; `registry.js` registers nothing for
  `caseload`, so the "Take a tour" button hides there.
- **Bug found and fixed while verifying the resume** (`services/app-state.js`): the saved page was
  always the page being LEFT. `finish_global_transition` runs from the route `didTransition` action,
  which in Ember 5.12 fires before the router service reports the new route (measured: Caseload pill,
  router said `user.home` while the URL was `/caseload`). The record now runs inside the existing
  `runNext` in that function. Pre-existing, affects every user's resume.

## Tests
- New: `tests/unit/utils/tours/supporter-home-tour-test.js` (3), `tests/unit/services/app-state-record-location-test.js` (1), each red first.
- Updated (approved): `tours-registry-classic-test.js` (caseload key now null) and `guided-tour-test.js`
  (allowlist: caseload never allowed).
- Runs: tour 65/65, app-state 30/30, session 168 pass 0 fail. Lint gate clean.
- `scanner: scanner next - should properly increment the element index` fails, also with app-state.js at
  HEAD; nothing in this change touches the scanner. Not investigated further.

## Verified live (elena_rodriguez_slp, settings snapshotted and restored after each run)
- Modern: real login form, terms agreed -> lands `/elena_rodriguez_slp/home`; tour opens there, 4 steps,
  welcome offers only the tour; stays on Home after. `/caseload` has no tour button. Saved page is
  `/caseload` after visiting it; log out and back in -> `/caseload`.
- Basic: lands on Home; tour opens there, 4 steps.

## Open
- The full Ember suite was not run.
- `utils/session_history.js` notes an open privacy question: saved pages survive logout on a shared device.
- Locale keys for the removed caseload tour remain in `public/locales` (unused).
