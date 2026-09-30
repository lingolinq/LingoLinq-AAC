# 2026-09-30 — Modern page polish, Basic/Modern access-point inventory, Basic eval fixes

Branch: `traci/feat/compressed-view` (stacked on `traci/styling/classic-view-overlay`).
The Basic-view fix below was committed on the overlay branch instead (`a52c24589`).

## Shipped on this branch

| Commit | What |
|---|---|
| `0e67f6891` | View menu intro line (flag-aware: mentions spacing only with `compressed_view`) |
| `e836915b0` | Compact caseload panel grouped (Insights / Profile & Notes / Evaluation); Model button takes the Focused home caseload surface |
| `7827391d5` | Rooms label "Rooms - <org>", no hero title, no switcher gap (Focused); Compressed room tiles 85 -> 58px and Extras cards 90 -> 73px; Profile/Settings section icons on the shared glass tile; Compressed Gentle keeps the greeting hero |

## Shipped on the overlay branch (`a52c24589`)

- **Run Evaluation from a Basic Communicators card crashed for every communicator**
  (`TypeError: user.get is not a function`): the card passes a plain `known_supervisees` entry
  and the premium check reads record computeds. `run_eval` now loads the record first.
  Red test first, falsified by reverting the helper.
- Quick Screen Eval and Eval History added to the Basic card's Extras panel (same flag).
- Quick Screen Cancel returns a Basic user to the Communicators tab (view-switch handoff).

## Basic vs Modern access points (research)

Two read-only inventories (every nav control with route, file:line and conditions) were
produced this session. Headline diff, verified against the Basic templates:

Modern-only destinations with no Basic control: Quick Screen Eval, Eval History (now added,
above); Basic Access (`offline_boards`); the Supervision page (`user.supervision`, no row in the
Basic account rail); the Need Attention surfacing; direct room tiles; the caseload panel's goals
and badge summary.

Modern pages with a Basic equivalent: Caseload -> Communicators tab, Boards page -> Boards tab,
Extras page -> Actions tab's Extras drawer, Updates pill -> Updates tab. View-switch landings for
the first, second and fourth live in `app/frontend/app/utils/basic_landing.js` (the only caller
is the View menu; board-page switch controls do not consult it, and need not).

Leaks found (not fixed): Basic's navbar "My Boards" and the org page's "Go to My Caseload" open
Modern-only pages; on the Basic board the header's "My Boards" opens the account page. Reverse
gap: Remote Modeling and the supervisee Home Board link exist in Basic's panel, not Modern's
caseload. Dead Modern code: the dashboard's Supervisors / Boards / Reports tabs and search overlay.

## Follow-ups
- Extras page (`user.extras`) has no view-switch landing; a natural one is the Actions tab with
  the Extras drawer open (the handoff carries only a tab today).
- `caseload?supervisee=` loses the named communicator on a switch to Basic.
- Evaluation group would hold one chip if `quick_screen_eval` were ever turned off.
