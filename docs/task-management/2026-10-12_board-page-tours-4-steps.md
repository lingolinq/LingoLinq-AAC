# 2026-10-12: board page tours cut to 4 steps; edit tour UI test

Branch: `traci/fix/scots-review-fixes`. Uncommitted at the time of writing.

## Asked
"the board page speak tour should be only 4 steps total, the board page edit tour should be only 4 steps
total", then "create a ui test for the edit tour".

## Changes
- `utils/tours/board-detail-speak.js`: welcome, "Tap to communicate" (the grid), "Your message bar" (the whole
  sentence row: message, Speak, backspace/clear, Home, options menu), finish. Was up to 8.
- `utils/tours/board-detail.js`: welcome, "Your board's buttons" (the grid), "You're in edit mode" (the
  editing bar: Save, Cancel, side panels, top-of-page copies), finish. Was up to 10.
- `public/locales/en.json`: 4 new keys; the rest reuse existing ones.
- `e2e/board-edit-tour.spec.js` + a `board-edit-tour` project in `playwright.config.js`.

## Verified
- Unit: `tests/unit/utils/tours/board-detail-four-steps-test.js` (red first: 8 and 10 steps), puts every
  element either tour ever targeted on the page; all 67 tour tests pass; ESLint gate clean.
- Live: the speak tour on a Modern board, 4 steps, each spotlight on its element.
- UI test (Playwright, `npx playwright test --project=board-edit-tour`, dev stack + seeded example user):
  passes; with the old tour restored it fails ("Expected Your board's buttons, received You're in edit
  mode"), then passes again with the 4-step tour.

## Note
The edit tour's trigger lives at the end of Board Actions in the edit panel, which starts collapsed, so a
user has to open Board Actions to see "Take a tour" in edit mode. Not changed.
