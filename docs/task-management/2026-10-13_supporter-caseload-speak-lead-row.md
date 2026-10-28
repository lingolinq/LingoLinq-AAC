# Supporter home lead row: Caseload | Speak (drop Extras) — Gentle + Focused

Request (2026-10-13): "on modern focused and modern gentle, on each user's account that is
NOT a communicator account, the button to the right of that user's main button should be
the Speak button, not the Extras button" → narrowed to "just the supporter accounts" →
chosen end-state: **both layouts show `Caseload | Speak` only** (Extras leaves the lead row).
Communicator (hero-speak) and admin/org-manager (hero-org) layouts must be UNCHANGED.

All layout ordering is JS-built `grid-template-areas` in
`app/frontend/app/utils/dashboard_sections.js`; cards carry a fixed `grid-area`. Desktop
order = the areas string; narrow screens = `--ord-*` flex order.

## Fact sheet

### (a) Where is the lead row READ / built?
- CONFIRMED Gentle: `dashboardLayout` → `caseloadRowFirst(extrasBesideSpeak(editBesideCreate(base)), vis)`
  (`dashboard_sections.js:552`), packed by `packOrder` (`:469-523`). `caseloadRowFirst`
  (`:442-459`) uses `CASELOAD_ROW_PARTNERS = ['speak','extras']` (`:442`); `packOrder`'s
  caseload-run loop (`:503`) re-groups `caseload` + following `CASELOAD_ROW_PARTNERS` into one row.
- CONFIRMED Focused: `focusedLayout` (`:612-794`). Speak is force-dropped for a non-speak hero
  at `:630` (`if (heroKey && heroKey !== 'speak' && !orgPair) { rest.speak = false; }`). The
  "caseload leads, Extras right" beside row is set at `:688-691`
  (`beside = ['extras']; lead = 'caseload';`) and emitted at `:692-723` via `spanRow(['caseload','extras'])`.
- CONFIRMED hero resolution: `focusedHeroKey` → 'caseload' for a supporter (supervisor),
  'org' for an admin, 'speak' for a communicator (`:109-119`). Grid gets `md-grid--hero-<key>`
  (`gridLayoutState :785`).

### (b) ALL shapes / who writes them (the `vis` map drives everything; no `user` in these fns)
- Supporter (SLP): `vis.caseload` true, `vis.speak` true (`available: !hasOrgManagement`, `:38`),
  `vis.org` false. heroKey 'caseload'. **This is the only case we change.**
- Admin / org manager: `vis.org` true, `vis.speak` FALSE (hasOrgManagement). heroKey 'org'.
- Communicator: `vis.caseload` false, `vis.speak` true. heroKey 'speak'.
- CONFIRMED the three are distinguished by `vis.caseload`/`vis.speak`/`vis.org`, so "speak is a
  caseload-row partner" is true ONLY for a supporter. Mutual-exclusion of speak/extras in the
  caseload row is therefore self-scoping.

### (c) Cross-file claims
- CONFIRMED `dashboard-focused-caseload-beside-test.js` asserts supervisor focused areas[0]
  = `caseload caseload caseload extras extras extras` (must flip to speak); admin areas[1] and
  communicator areas[0] unchanged.
- CONFIRMED `--speak-action` is base-hidden (`app.scss:47752`) and shown only under hero-org
  (`:46819`); `--speak-as-button` display:none in focused (`:46816`); `--speak-focused` scoped
  `:not(.md-grid--hero-caseload)` (`:46655`). So no Speak variant shows under hero-caseload today.
- CONFIRMED caseload-beside cell styling is written for `.md-card--extras-focused` at
  `app.scss:48260-48261` and `:57669-57671`; a Speak variant in that cell needs parallel styling.

## Red tests (write first, must fail before the fix)
1. `dashboard-focused-caseload-beside-test.js` — supervisor case: areas[0] becomes
   `caseload caseload caseload speak speak speak`; `md-grid--caseload-beside` still set;
   Extras no longer in areas[0] (packs to the action row). Admin + communicator assertions
   unchanged (regression guard).
2. New gentle test (in `dashboard-sections-layout-test.js` or a new file): a supporter's
   Gentle lead row is `caseload speak` (2 cells), Extras NOT in that row; admin's
   `caseload extras` row and communicator layout unchanged.

## Candidate fixes
### JS (shared by both layouts)
- **C1 (chosen): speak and extras are mutually exclusive in the caseload row.**
  - `caseloadRowFirst`: after building `partners`, if it contains 'speak', drop 'extras'.
  - `packOrder`: in the caseload-run loop, stop before an 'extras' once 'speak' is already taken.
  - Self-scopes to supporters (only they have speak as a partner). Admin keeps `caseload|extras`.
- C2 (rejected): pass a role/partner-list param through dashboardLayout/defaultOrderFor/packOrder.
  More plumbing, larger diff, same outcome.

### Focused
- `:630` keep speak when `heroKey === 'caseload' && vis.speak` (don't drop it).
- `:688-691` for `heroKey === 'caseload' && speak present` → `beside=['speak']` (extras falls to
  the FOCUSED_ACTION_KEYS row); org hero → `beside=['extras']` unchanged.

### CSS
- Show `--speak-action` under `.md-grid--layout-focused.md-grid--hero-caseload` (extend `:46819`).
- Add `--speak-action` to the caseload-beside sizing/margin groups at `:48260` and `:57671`
  (edit the existing selector groups in place; no new override block).

## Risks / open questions
- A 2-cell Gentle caseload row (`caseload speak`, no `-row-3`) is NEW — today it's always 3-cell.
  Must verify the 2-col grid renders it cleanly (build + screenshot).
- `--speak-action` beside styling under hero-org is a halfRow (NOT `md-grid--caseload-beside`),
  so its existing half-width rules may not transfer; the beside styling must be added explicitly.
- CSS appearance cannot be proven by unit tests — needs a visual check in the running app.

## Mutation that must fail the test
Revert the `:688-691` focused branch to `beside=['extras']` → red-test #1 fails on areas[0].
