# Button-settings "Use This" image save

## Goal
Fix button-settings Picture tab so "Use This" saves the selected symbol image to the button.

## Symptoms
- Preview stays on screen after clicking "Use This" (save never completes UI flow)
- License row shows `[object Object]` for OpenSymbols search results

## Root causes (verified)
1. **`pick_preview`** mapped `preview.license` (nested object from `/api/v1/search/symbols`) into `license.type`, producing `[object Object]` and dropping width/height.
2. **`save_image_preview`** always probed dimensions via `new Image()` with no timeout; remote SVG URLs could hang, leaving preview visible.
3. **`load_image`** stale `findRecord` callbacks could overwrite a newly assigned image when modal opened with `load_image('remote')`.

## Fixes
- `normalize_preview_license` + updated `pick_preview` (nested + flat license, copy dimensions)
- `save_image_preview`: use preview width/height when present; 10s Image() probe timeout
- `load_image`: guard async callbacks with `requestedId` / `stillCurrent()`
- Templates: `model.pending_image` for Saving… indicator
- **`change_button`**: also set `image_url` when assigning a new image (board-detail grid reads `image_url`, not `local_image_url`); defer `image_id` until URLs are set so `findContentLocally` does not reuse stale `button.image_url`
- **`board-detail-grid.hbs`**: prefer `local_image_url` over `image_url` for `<img src>`
- **`Button#load_image`**: do not fall back to stale `button.image_url` when `board.image_urls` lacks the new id; prefer an already-assigned image record

## Tests
- `picture_grabber-test.js`: pick_preview nested/flat license; save_image_preview dimension shortcut
- `button-test.js`: stale load_image guard
- `edit_manager-test.js`: change_button mirrors image.best_url to image_url

## Status
Complete
