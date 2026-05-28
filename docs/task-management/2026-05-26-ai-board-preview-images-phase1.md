# AI board preview images — Phase 1

## Goal
Fix create-board-new save path so previewed OpenSymbols URLs become persisted `image_id`s on buttons.

## Root cause
`Board#process_buttons` whitelist `.slice(...)` strips `image_url` before `before_save :process_client_supplied_images` runs.

## Fix
1. Stash client `image_url` by button id in `process_buttons` before slice.
2. `process_client_supplied_images` reads stash + assigns `ButtonImage` / `image_id`.
3. `process_suggested_symbols` fallback for new boards with labels but no images after client-url processing.

## Status
Complete (Phase 1). Covers create-board-new (AI + manual labels) and labels-only legacy create.

## Client follow-up
- saveBoard waits for pending symbol lookups before baking buttons (create-board-new.js)

## Bug: save stuck on "Creating Board..."
**Cause:** `_completeSaveBoard` was placed inside the `actions` hash but called as `this._completeSaveBoard()` from an RSVP callback. Ember actions are not on `this` — call threw, `status.saving` never cleared.
**Fix:** Move `_completeSaveBoard` to a regular component method (same level as `_ensure_label_images_before_save`).
