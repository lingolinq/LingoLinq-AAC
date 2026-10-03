# 2026-09-29 — Compact caseload (Compressed View) and Modern Focused page polish

Branch: `traci/feat/compressed-view`. All work below was requested and completed on 2026-09-29
(committed 2026-09-30). Verified in the browser with throwaway Puppeteer probes against the local
dev server (`scripts/qa-helpers.mjs`), 9 client-side seeded supervisees, never saved.

## What shipped

### Caseload, Modern + Focused + Compressed View (the compact caseload)
- Gate: `controllers/caseload.js#compactCaseload`; the shell gets `md-shell--caseload-compact`.
- One-line cards: avatar (slate ring), name over role, attention status as icon + text, then
  Model (navy primary), Speak (`$brand-slate-blue`, light text) and a chevron disclosure that
  flips when open. Card height 66px at 1180 and 820 (was 194px); 7 cards visible at 1180x820.
- The chevron (and the identity button) open the same expanded panel as before; its actions are
  icon chips grouped by colour (brand blue: Reports, Modeling Ideas; neutral: Account, Note;
  teal: Eval History, Assess Tracker, Quick Screen Eval, Full Eval), 48px, lifted shadow,
  locked chips dashed and grey. Every chip calls the same action/route as the tiled panel.
- 1200px and up: two cards per row when two fit (grid, at most two columns, min 500px). The list
  is capped at 1070px, so this applies from about 1440 wide; at exactly 1200 it stays one column.
  Half-width cards put the status under the name (container query) and are all 87px tall; a card
  with no status drops the empty line and centres name and role on the avatar.
- Tour steps (`utils/tours/caseload.js`) carry the compact selectors as alternatives.

### Caseload, Modern + Focused without Compressed View (restored)
- Original tiles, avatar, role pill and expanded panel are back.
- Kept from the compact work: the page header (two-tone icon, "Caseload", communicator count,
  Needs attention filter), gated on `focusedCaseload`.
- No grey header band (the tint layer of rule "3" and the <=1300px identity-row wash removed;
  the slate divider stays). Status under the username at every width (641-1300px tokens) as
  icon + text. A row with no status centres name and role on the avatar (except 641-768px,
  where the avatar does not span two rows). Tiles have a crisper gloss (shorter sheen, 1px
  highlight lines, tighter shadow).
- Caseload title uses the shared page-label font (`.md-compact-head__title`), both densities.

### Other Modern + Focused pages
- Pill nav sits 24px below the app navbar in Compressed + Focused (`--dn-nav-pad-top`); band
  height equals the non-compressed band, so page clearances are unchanged (measured on
  Dashboard, Caseload, Boards, Extras).
- Boards: Folders and Boards panels flatter, lighter, near-opaque (Profile page, which shared
  `$focus-section-bg-darkened`, unchanged).
- Extras: cards take the Rooms tile background.
- Rooms: page label ("Rooms", two-tone door icon, divider) above the org switcher, starting where
  the Caseload header does (y184 title, x289, 1070 wide at 1440, app-shell view); organisation
  title in the label's font, size and weight; no divider under it; lighter room-tile shadow.

## Verification
- Template lint on `caseload.hbs`, `organization.hbs`: pass. ESLint gate (`lint:js:ci`):
  `new=73`, the branch's pre-existing count, none in the touched controllers.
- Ember (Node 22, targeted): `CaseloadController` 2/2, `organization roomsPageActive` 5/5;
  `account-rail collapse` 6/6 and `tours/registry` 7/7 (those two on Node 16; not re-run on 22).
- Keyboard focus: forced `:focus-visible` via CDP on every compact control; each shows the app's
  global 3px navy box-shadow ring. The partial's own outline rule was dead (the global rule sets
  `outline: none !important`) and was removed.
- Contrast: chip icon inks >= 4.15:1 on their wash, navy labels >= 8.9:1; white on
  `$brand-slate-blue` about 5.6:1.

## Not covered / follow-ups
- Room-tile shadow change not seen on screen: the example account has no `.md-room-card` tiles
  in either Rooms view. Check with a supervisor account that has rooms.
- No unit tests yet for `focusedCaseload`, `listedSupervisees` (attention filter) or
  `focusedRoomsLabel`.
- Rail glitch seen once (toggle and nav band at the collapsed offset while the rail drew
  expanded, full load at 1440): NOT reproduced from either a Modern or a Basic start, sampled over
  6s on two pages. It appeared while the example account was in a state left by two aborted probe
  runs. No change made.
- The navy focus ring has no gap, so on the navy Model button it reads as the button growing
  3px rather than as a separate ring. App-wide convention; not changed here.
