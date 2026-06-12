# Beta Feedback Admin Table Width

## Goal

Make the beta feedback admin inbox table use the full width of its card instead
of collapsing into a narrow left-hand column.

## Relevant files

- `app/frontend/app/templates/beta-feedback-admin/index.hbs`
- `app/frontend/app/styles/app.scss`

## Diagnosis

- Verified the inbox template renders the table inside
  `.la-support-page-card__body.md-support-content.la-beta-feedback-admin__body`.
- Verified `app/frontend/app/styles/app.scss` defines
  `.la-beta-feedback-admin__body` twice.
- The earlier definition sets `width: 160px`, which constrains the entire admin
  body and matches the narrow-column rendering in the reported screenshot.
- The later definition contains the intended typography styles but does not
  override width, so the earlier fixed width still applies.

## Evidence

- `app/frontend/app/templates/beta-feedback-admin/index.hbs`
- `app/frontend/app/styles/app.scss` (`.la-beta-feedback-admin__body` at the
  earlier block around line 75698 and the later block around line 76626)

## Plan

1. Remove the erroneous fixed width from the original
   `.la-beta-feedback-admin__body` rule.
2. Keep the existing support-card max width unchanged; the bug is inside the
   card body, not the outer page layout.
3. Run lint/diagnostic checks on the edited frontend file.

## Result

- Removed the earlier duplicate `.la-beta-feedback-admin__body` block from
  `app/frontend/app/styles/app.scss`, which was the only place applying
  `width: 160px` to the inbox body.
- Left the later `.la-beta-feedback-admin__body` rule intact so the inbox keeps
  its intended typography styles without the fixed-width constraint.

## Verification

- Reviewed the focused git diff to confirm only the stray duplicate SCSS block
  was removed.
- Ran editor diagnostics on the touched files; no linter errors were reported.
