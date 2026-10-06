# 2026-10-05: Focused home, My Caseload and Speak Mode match Create a Board / Edit Dashboard

Branch: `traci/styling/styling-touchups`

## Request

Modern Focused home: single-action buttons must use the same style as Create a Board and
Edit Dashboard (surface, size, icon and icon background). My Caseload and Speak Mode were in
the wrong style. The Caseload/Speak row must sit the same distance below Create/Edit as
Create/Edit sits below My Organizations.

## Learnings consulted

- `LEARNINGS-2026-01_to_2026-09.md` "deferring a card that needs ~15 shared-rule touches":
  `md-card--badge-action` exists so the Nth card is one class, not fifteen selectors.
- `LEARNINGS.md` BEM grep / CSS deletion is text surgery; validate with the sass compile.
- `LEARNINGS-2026-01_to_2026-09.md` focused badge-action rules tie (0,5,0) with gentle ones.

## Fact sheet

- (a) Where the styles are read: measured live (CDP `getMatchedStylesForNode`) as `example`
  (org manager + supporter, Modern Focused), grid
  `md-grid--layout-focused md-grid--with-caseload md-grid--with-org-mgmt md-grid--hero-org`.
  CONFIRMED.
- (b) States: in Focused, `md-card--caseload-as-button` shows unless `md-grid--hero-caseload`
  (`app.scss:56354`) and `md-card--speak-as-button` shows only under `md-grid--hero-org`
  (`app.scss:56353`); the `--wide-only` variants are `display: none` (`app.scss:49697`,
  `app.scss:57185`). Hero resolves admin > supervisor > communicator
  (`utils/dashboard_sections.js:104`), so both cards only appear for org managers. CONFIRMED.
- (c) No JS or test reads `md-card--badge-action` / `md-card--as-button` (grep of
  `app/frontend/app` and `tests`). CONFIRMED.

Measured before (1400px): org bottom 425, Create/Edit 449-528 (24px gap), Caseload/Speak
568-728 (40px gap = 24 row-gap + 16px `margin-top`). Caseload/Speak 160px tall, 64px white
icon tile, 24px title; Create/Edit 79px, 44px slate tile, 18px navy title.

Rules still winning once the badge-action classes are added (prototype, in-page only):
1. `margin-top: 16px`, `app.scss` hero-org pair rule (~48658).
2. `backdrop-filter`, `.md-grid .md-card.md-card--caseload-as-button` (~48720) and speak (~56882).
3. head `margin-top: 6px`, caseload (~48736) and speak (~56911).
4. icon 64px tile and 34px glyph, `_focused-view.scss` hero-org rules (~2853-2870).
5. title 24px, `app.scss` hero-org title group (~48610).
6. caseload title `line-height: 1.15` (~48749).
7. Speak markup: `md-card__status` instead of `md-card__sub`, plus the wave div.

## Proposal

A (first choice, REJECTED in review): in Focused, add `md-card--badge-action md-card--as-button`
to the existing cards via an `effectiveLayout` conditional; narrow shared rules with `:not()`.
Adversarial review found two Highs, both verified:
- the Display Style previews clone the live DOM and only swap `--layout-*` classes
  (`components/display-style.js:474-500`), so layout-conditional markup leaks into the
  other preview;
- `:not()` on the caseload title rule raises it to (0,5,0) and beats the <=474px 18px rule
  (`app.scss:68464`) that wins today on source order, so Gentle phones would show 28px.
A' (applied): a third always-rendered sibling per card (`--caseload-action`,
`--speak-action`) in Create a Board's markup, shown by CSS only in Focused (same show
conditions the as-button cards had), the as-button cards hidden there. Shared Gentle rules
are untouched except one <=460px head rule that needed `:not(.md-card--badge-action)`,
verified by snapshot.
B (rejected): duplicate the badge-action values in new caseload/speak rules (override block).
C (rejected): extract a Sass mixin from the focused badge-action rules (large refactor).

## Changes

- `authenticated-view.hbs`: `--caseload-action` and `--speak-action` siblings.
- `app.scss`: default hide beside the `--wide-only` hides; Focused show/hide replacing the two
  as-button rules; <=1024px order/basis and <=640px single-column lists include the new
  cards; <=460px caseload head rule excludes badge-action; hero-org 24px title rule now
  Organizations only; deleted the hero-org pair `margin-top: 16px` and halo rules (they only
  targeted the now-hidden as-button cards).
- `_focused-view.scss`: deleted the hero-org Caseload 64px icon-tile and glyph rules (same reason).

## Test

Live-page probe (`diff.mjs`, scratchpad): computed-style diff of both cards against Create a
Board, no injection. Red before the fix; must be empty after. Gentle and Focused full
computed-style snapshots before/after at 1400/1000/800 must differ only in the two cards.

## Verification

- Probe red before: 31 / 32 diffs, Caseload/Speak row 40px below Create/Edit.
- Probe green after at 1400 / 1000 / 800 / 600 / 400: no style diffs. The card's own flex
  model (row vs column, from the shared `.md-grid .md-card.md-card--caseload` / `--speak` base
  rules) still differs and renders identically with one child; left alone to keep Gentle's
  cascade untouched.
- Spacing: 24px at 1400 (same as Organizations -> Create/Edit), 16px at <=1024 (the flex gap
  every row uses there).
- At 800 and 400 the longer sub lines wrap, so a card can be 99px against 79px: content, not
  style (Edit Dashboard wraps the same way at 400).
- Gentle full computed-style snapshot (`lingolinq_admin`) at 1400/1000/800/600/400: 0 diffs;
  the new cards are `display: none` there.
- Focused snapshot (`example`): only the as-button cards (now hidden) and the new cards differ.
- Falsified: removing `md-card--badge-action` from `--caseload-action` turns the probe red
  (30 diffs); restored from a copy.
- `sass` compile exit 0; `ember-template-lint` on the template exit 0.
- NOT verified: the Display Style modal previews in the browser (reasoned from the clone
  swapping `--layout-*` classes only).

## Status

Done, uncommitted.

## Follow-up: PR #1108 "Not covered" items

Each fix has a committed UI test (`app/frontend/scripts/*-qa.mjs`), red before and green after.

1. Collapsed primary nav stayed open after a choice. Cause: the `<details>` in
   `components/user-pill-nav.hbs` lacked the existing `{{details-autoclose}}` modifier (the
   org switcher at `templates/organization.hbs:99` already uses it). Test
   `pillnav-dropdown-close-qa.mjs`: red 3/6 (choice, Escape, outside click left it open) for
   `marcus_williams_slp` and `example`; green 6/6 for both. Also covers the PR's manual
   click-test request (600px dropdown, choice navigates, 641px pills back).
2. 28px icon gap at 461-640px. Cause: the <=640px "unify every action button at 28px" rule
   (`app.scss`, (0,5,0), later in source) beat Focused's 12px. Excluded Focused with
   `.md-grid:where(:not(.md-grid--layout-focused))` so specificity stays (0,5,0) and the
   <=460px 12px rule still wins in Gentle. Test `focused-action-gap-qa.mjs`: red 16 FAIL in
   461-640; green at 9 widths for both users. Gentle snapshot 640/600/500/460/400: 0 diffs.
3. Glyph contrast. Measured 2.25:1 (verdigris) and 1.98:1 (denim) on the slate tile.
   Replaced `filter: brightness(1.25)` with each brand colour mixed 70% to white: 3.51:1 and
   3.45:1. Test `focused-action-glyph-contrast-qa.mjs` (computed colours, not pixels): red
   4 FAIL, green both users. Gentle snapshot 1400/1000/800: 0 diffs.
4. Compressed + Focused attention card: subagent review, key claim verified
   (`_focused-view.scss:3335` has no Compressed exclusion; Rooms has one at `app.scss:48861`).
   No overflow or clipping at 1400-400; the list packed more columns than Rooms (3 vs 2 at
   1400, 2 vs 1 at 800). Traci chose option B: the list's track minimum reads
   `--dn-attention-track` (fallback 260px), which `_compressed-view.scss` sets to 360px, the
   track Compressed Rooms uses. Test `compressed-attention-columns-qa.mjs` (Compressed switched
   on in memory, never saved): red 5 FAIL (1400/1200/900/800/769), green at 9 widths.
   Non-Compressed Focused unchanged (3 / 2 / 2 columns at 1400 / 900 / 800).
5. No change: My Account / Reports are retired from the grid; Classic is intentionally
   unchanged; engines without `:has()` are outside `config/targets.js` (last 1 version).
