# Legacy Modal Templates (UNUSED)

These template files were **renamed from `modals/` to `modals.legacy/`** on 2025-02-24 to verify they are no longer used.

## Context

- **Modal system**: All modals now use component-based rendering via the modal service and `modal-container`. When `modal.open('modals/message-unit')` is called, the `modal-container` renders the `{{message-unit}}` component, which uses `templates/components/message-unit.hbs`—**not** `templates/modals/message-unit.hbs`.
- **Old path**: Previously, `route.render('modals/xxx')` would render these templates into an outlet. That path is no longer used when the modal service exists (which is always the case).

## If something breaks

If renaming causes breakage:

1. Restore: `mv app/templates/modals.legacy app/templates/modals`
2. Report which feature broke so the remaining dependency can be fixed.

## If nothing breaks

These files can be safely removed. The corresponding component templates live in `templates/components/`.
