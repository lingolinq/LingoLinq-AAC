# Prediction tiles: label collapse and stale symbol

## Fact sheet

- **(a) Where is the label READ?** `{{suggestion.word}}` in `templates/user/board-detail.hbs` (in-bar, below-bar, rail). CSS then lays it out as a flex sibling of `__prediction-img`. CONFIRMED. A second read: in-grid `:suggestion` slots render `btn.label` in `board-detail-grid.hbs`, gated by `btn.hide_label` → `.hide-label { display: none }`. CONFIRMED.

- **(b) Label shapes / image writers.** Tile is a column flex. Rail/below-bar images are `flex: 1 1 0`. Labels use `overflow: hidden`, which zeroes the flex min-size, so the image can shrink the word to nothing. CONFIRMED `app.scss` rail/below-bar label + img rules. Image URLs are written by `_decorate_suggestion_images` onload and by `_apply_sentence_chip_image` (raw_index first). CONFIRMED `board-detail.js`. In-grid slots: `update_suggestion_button` / `_sync_ordered_button_suggestion` paint the guess onto the slot (`models/board.js`). CONFIRMED.

- **(c) Cross-file.** The wilted flower on both "need" and "a break" is not Mulberry-need. The same picture stayed while the word changed. CONFIRMED by screenshot. `_apply_sentence_chip_image` matching raw_index without the label is a reachable writer of that shape. CONFIRMED `board-detail.js`. The 2026-09-16 full Speak Mode shot still had an unlabeled flower: it sits in the white Connectors band between "a" and "should", while the rail "need" tile next to it already shows the word. That cell is an in-grid prediction slot with `hide_label`, not a rail tile. CONFIRMED `board-detail.js` comment on three core-board slots + `hide-label` CSS.

## Fix

1. `flex-shrink: 0` on prediction labels so the word cannot collapse.
2. Decorate onload applies a URL only if `item.word` is still the requested word.
3. Chip image apply requires a label match; in-flight lookup key includes the label.
4. In-grid prediction slots always show the current word (ignore hide_label / text-pos-none).
5. `hide_label` coerced with `Button.coerce_level_value` so the string "false" is not treated as true.
6. Chip labels `flex-shrink: 0` as well.
7. Rail/below-bar prediction images get `min-height: 16px` and `flex-shrink: 0`.
8. In-grid `:suggestion` slots now pair a picture the same way the rail does
   (`_find_local_image_for_label`, then `attach_image_for_label`), and local
   lookup skips the slots themselves so they cannot shadow the real button.
9. `_decorate_suggestion_images` copies each resolved rail symbol onto matching
   slots (`_apply_suggestion_image_to_slots`), including the early-return path
   where the rail item already had an image.
10. Slots stamp `suggestion_image_word` and drop the previous PCS when the
    guessed word changes before the new picture is ready. A late
    `attach_image_for_label` for the old word is ignored. The DOM path no
    longer restores `original-src` (the last guess) while predictions are on.
11. After a slot's label is set, re-apply pictures from the rail list and
    from `raw.image_urls`. "you" stayed blank because the first lookup often
    misses (many placeholder copies) while a later tap still finds the PCS.
12. `_cached_image_for_label` checks the prediction memo, speak-bar chip
    cache, and on-board `image_urls` before `attach_image_for_label`.
    `persistence.url_cache` remaps a known URL to a local file so we can
    skip the Image() preload when the bytes are already local.
13. A tapped board-button chip is stored as `b:<id>`
    (`_chip_image_key`). Prediction lookup only read `l:<word>`, so "to"
    stayed on `square.svg` while the speak-bar chip already had the PCS.
    `_index_chip_image` now writes both keys. A late chip image also
    repaints matching prediction tiles (`_paint_prediction_image`).
    Cache also reads `app_state.button_list` for a spoken word's image.
14. `update_suggestion_button` hid `.symbol` imgs when lookup only had
    `square.svg`. Board-detail cards use those classes, so the next
    refresh blanked want/like/to after Ember had paired their PCS.
    Board-detail now leaves slot pictures to `_paint_suggestion_slot`.
   `flex-shrink: 0` on the label plus `min-height: 0` on the `flex: 1 1 0` symbol
   made dense-board tiles (Vocal Flair 94) paint the word and hide the picture
   — the inverse of the original bug. Percentage min-height was rejected: it
   computes to 0 while the tile height is still indefinite.
