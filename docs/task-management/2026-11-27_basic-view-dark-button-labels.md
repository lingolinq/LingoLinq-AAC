# Basic view paints every button label navy, so labels on dark buttons cannot be read (2026-11-27)

KAN-179. Found while importing a high-contrast Periodic Table board set (black buttons, light
pictures) into a team account on dev and production whose board view is set to Basic: the
labels were navy on black.

## Cause (verified)

- `app/frontend/app/utils/bound_classes.js#add_rule` already picks a readable text color per fill
  (`tinycolor.mostReadable(fill, ['#fff', '#000'])`) and writes it into the per-color class rule,
  for example `.button.b_rgb_0__0__0_ { color: rgb(255, 255, 255) }`.
- `app/frontend/app/styles/app.scss`, inside `#within_ember.board-alt-view`, set
  `color: $indigo !important` on `.board .button` and on `.board .button .button-label`. An
  important declaration beats the class rule, so every label was navy whatever the fill.
- Read from the live stylesheet on production and dev (2026-11-27): the label matched
  `#within_ember.board-alt-view .board .button .button-label` with `color: rgb(27, 42, 74)`
  important, and `.button.b_rgb_0__0__0_` with `color: rgb(255, 255, 255)`, which lost.

## Measured on dev before the fix

Lowest label contrast per board, label color against the button's computed background:

| Board | View | Lowest contrast |
|---|---|---|
| `<user>/periodic-table-hc-words` (text-only, dark tints) | Basic | 1.01 to 1 |
| same | Basic, Speak Mode | 1.01 to 1 |
| same | Modern (`/board-detail/`) | white labels, not affected |
| `<user>/periodic-table-first-20` (pastel fills) | Basic | 6.68 to 1 |

The three views were checked separately because they do not share the rule:

- Basic (`user.board-alt`, `/<user>/board/<name>`): affected.
- Modern (`user.board-detail`): its buttons carry `text_color` inline
  (`controllers/user/board-detail.js`, `components/board-detail-grid.hbs`). Not affected.
- Legacy board page (`board.index`, kept for `obf/` and `integrations/` keys by
  `utils/board_view.js#opens_in_view_route`): `#within_ember.board-view .board .button` also forces
  navy, but it first lightens every fill 50 percent toward white, so "white is readable on the
  fill" does not carry over. Not reproduced and not changed here.

## Fix

Navy stays the default. `add_rule` publishes `--btn-label-color` (white) only when its own
`mostReadable` result is white, and the two Basic view declarations became
`color: var(--btn-label-color, $indigo) !important`. Both were edited in place, with no new
selector and no new `!important`.

The variable goes in its own `.button.<key>` rule instead of the main rule string. The main string
is cached in `boundClasses.classes[key]` and pinned character for character by the existing
"should parse various coloring styles" test, including a dark fill (`green`). Appending to it
would have meant rewriting that assertion (Rule 0.14). A separate optional rule follows the
`cornerStr` pattern already in the function and leaves the pinned strings alone.

Considered and rejected:

- Dropping the navy and letting the computed color through. Every light button's label would turn
  from navy to black, a design change nobody asked for.
- Choosing between white and navy by comparing contrast against each. More exact for mid-tone
  fills, but it needs the navy hex duplicated in JS. The existing white-or-black result leaves
  mid-tones exactly as they are today (navy, 3.1 to 1 or better where black was the pick).

## Verification

- Red first: the new "should publish a white label color for a dark fill" test failed without the
  fix (`actual: '' expected: rgb(255, 255, 255)`), 14 of 15 passing in the module.
- With the fix: `npx ember test --filter "boundClasses"`, 15 of 15.
- Compiled stylesheet (`ember build --environment=test`): both rules read
  `color: var(--btn-label-color, #1b2a4a) !important`.
- Cascade probe in headless Chrome against that compiled stylesheet, with the rule text
  `add_rule` inserts: black fill with the variable, label `rgb(255, 255, 255)`; black fill
  without it (the old behaviour), `rgb(27, 42, 74)`; pastel fill and an uncolored button,
  `rgb(27, 42, 74)` as before.
- The same change applied by hand to the live stylesheet on dev (in one browser session only):
  `<user>/periodic-table-hc-words` went from 1.01 to 1 to 13.21 to 1 at worst.
  `<user>/periodic-table-first-20` stayed at 6.68 to 1, and `<user>/quick-core-40` measured 5.28 to 1
  with every label still navy.

## Follow-ups (not in this change)

- The legacy board page forces navy over a lightened fill (see above). Needs its own measurement.
- Basic view borders always use the app's darker shade of the fill; a board's `border_color` is
  ignored when a fill is set. Separate from label color.
