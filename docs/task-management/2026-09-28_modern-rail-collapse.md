# 2026-09-28: Modern account rail collapsible

Request (Traci): "the modern view menu that appears on the left side of the home page needs to be
collapsable (and anywhere else it appears in the app)".

Learnings consulted: LEARNINGS.md entries on nav highlight (`account-rail.hbs` literal
`is-active`), `docs/styling-recurring-problems.md` (no rail entry), Basic rail collapse notes in
`_classic-home.scss:385-545` (collapse gated to >=901px, or a narrowed window strands it).

## Fact sheet

(a) Where is the rail rendered / its width read?
- CONFIRMED `app/templates/application.hbs` (~1623): `<AccountRail>` is mounted ONCE inside
  `.ll-appshell`, gated on `showGlobalChrome`. No other `<AccountRail>` mount exists (grep).
  So "everywhere it appears" = this one instance.
- CONFIRMED rail width `208px` is read in exactly three layout places:
  `.md-acct-rail { width: 208px }` (app.scss ~50209), `.ll-appshell__main { margin-left: 208px }`
  (~111440), `.ll-appshell__navbar { left: 208px }` inside `@media (min-width: 901px)` (~111788).
  Other `208px` hits are unrelated card dividers / a grid column (49446, 49745, 56668, 56707).
- CONFIRMED below 900px the rail is an in-flow grid (`@media (max-width: 900px) .md-acct-rail`,
  ~50785) and `.ll-appshell__main` drops its margin (~111731). Collapse is meaningless there.

(b) Shapes of the state
- CONFIRMED Modern only: `showGlobalChrome` returns false for Basic
  (`controllers/application.js:2308`, `is_classic`). Basic has its own rails with their own
  collapse (`stashes.classic_rail_collapsed`).
- New state: `stashes.modern_rail_collapsed` in {undefined, false, true}; one writer (the rail's
  toggle action). undefined/false = expanded.
- Widths: >900px (panel, collapsible) and <=900px (grid, never collapsed, toggle hidden).

(c) Cross-file claims
- CONFIRMED `stashes.persist(key, val)` / `stashes.get(key)` is the pattern
  (`dashboard/classic-view.js:291`, `dashboard/classic-account-rail.js:138-146`).
- CONFIRMED i18n keys `classic_rail_expand` / `classic_rail_collapse` exist in en.json.
- CONFIRMED `.ch-rail__toggle` / `.ch-rail__toggle-icon` are unscoped and restyled nowhere else
  (grep); `.ch-rail__toggle-row` is hidden <=900 but is NOT reused here.
- CONFIRMED Focused layout touches only rail/row shadow + background (`_focused-view.scss:3476-3515`).
- CONFIRMED `:has()` is already load-bearing in the shell (`#content:has(.ll-appshell__navbar)`).

## Proposal

Fix A (chosen): state lives in `AccountRail`.
- `railCollapsed` computed on `stashes.modern_rail_collapsed`; `toggle_rail` action persists the
  inverse. Rail gets `md-acct-rail--collapsed`.
- Toggle: disclosure button, reusing Basic's `.ch-rail__toggle` look and its i18n keys, first
  child of the nav in a `.md-acct-rail__toggle-row`; `aria-expanded`; sr-only label changes with
  state.
- Width becomes one token: `--ll-rail-width` on `.ll-appshell` (208px), set to 72px by
  `.ll-appshell:has(> .md-acct-rail--collapsed)`. The three literal 208s are EDITED IN PLACE to
  read the token (Rule #0.7), so rail, main column and fixed nav cannot disagree.
- Collapsed (>=901px only): labels clipped with the sr-only pattern (accessible name kept), rows
  centred, pager stacks and clips its text. Toggle row hidden <=900.
- Transition on the three widths, `prefers-reduced-motion: no-preference` only.

Fix B (rejected): application controller reads the stash and puts a class on `.ll-appshell`.
Avoids `:has()`, but gives the state two readers in two files; `:has()` carries no new
platform risk here.

Simplest alternative considered: share `classic_rail_collapsed` with Basic. Rejected as default:
the rails are different widths and designs, and a Basic choice silently collapsing Modern is a
surprise. Open question for Traci.

Risks: pager scroll state is measured from `scrollHeight`, which can change on collapse (Home
Board's two-line row gets shorter) -> re-measure after toggling. Any other fixed chrome keyed to
208px would misalign: grep found none besides the navbar.

Unresolved: icon-only when collapsed (Basic shows short labels under chips at 112px). Icon-only
chosen; labels stay in the accessibility tree.

Test: `tests/unit/components/account-rail-collapse-test.js`: default expanded, reads the stash,
toggle writes the inverse. Mutation that must make it fail: `toggle_rail` persisting a constant,
or `railCollapsed` reading another key.

## Adversarial review (subagent) and decisions

Findings verified by me against the CSS already read:
- CONFIRMED: an in-panel toggle row adds ~44px where the expanded rail has ~31px spare at
  1024x768 and the pager is force-hidden (app.scss pager `display:none` block) -> toggle moved OUT
  of the panel as a fixed sibling straddling the right border.
- CONFIRMED: pager is sticky with `margin: -10px -10px 10px`, assumes first child -> moot, the
  toggle is no longer in the panel.
- CONFIRMED: 72px was 1px short of a row -> superseded by Traci's choice below.
- CONFIRMED: `send()` in the test forced an actions hash; test changed (before the fix) to call
  `toggleRail()`, the file's `action()` style.

Traci's decisions (2026-09-28): toggle straddles the right edge; collapsed rows show the icon
with a small label under it (Basic-like), width 124px; state separate from Basic.
Consequence handled: collapsed rows are ~64px, so the menu overflows at >=1024x768 and the
pager-hide rule is now scoped to the expanded rail.

## Outcome

- `components/account-rail.{js,hbs}`: `railCollapsed` (stash `modern_rail_collapsed`),
  `toggleRail`, `md-acct-rail--collapsed`, fixed toggle reusing `.ch-rail__toggle` + Basic's i18n
  keys, pager text wrapped for clipping, pager re-measured on toggle and on `transitionend`.
- `app.scss`: three 208px literals -> `--ll-rail-width`; collapsed block (>=901px only);
  motion opt-in.
- Test: `tests/unit/components/account-rail-collapse-test.js` red before (3/3 fail), green after;
  `--filter account-rail` 22/22. Falsified: `toggleRail` persisting constant `true` fails test 3.
- NOT VERIFIED IN A BROWSER: the local Rails server 500s on every API call (watching
  `lib/saml_login_policy.rb`, absent on this branch), so login is impossible. Needs a render check
  at 1440x900, 1100x800, 1024x768 and 950px in Gentle and Focused, both states.

## Follow-up: collapsed by default except on the home page (Traci, 2026-09-28)

- `onHomePage` = current route in HOME_ROUTES (`index`, `user.home`), read like `activeRow`
  (router first, `app_state.current_route` fallback). Pill-nav destinations (caseload, boards...)
  count as NOT home: the request says "the home page".
- Two stash keys: `modern_rail_collapsed` (home, absent = expanded) and
  `modern_rail_collapsed_away` (all other pages, absent = collapsed). The toggle writes the key
  for the current context, so each context remembers its own choice.
- Test rewritten to the new spec before the change (3 red, 2 already green for home); 24/24
  `--filter account-rail` after. Falsified: dropping the away default fails 3 examples.
