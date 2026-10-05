# Classic view (board-alt): symbol images not centred in the button's image band

Branch: `traci/styling/classic-view-overlay`

## Symptom

On classic view (`user.board-alt.index`) in speak mode, the symbol image inside a board
button is not centred in the band below the label: it sits left of centre (and is clipped
on the right on narrow buttons) and is not centred vertically in the band either.

## Three facts

1. **Where the value is READ.** The symbol's box comes from the inline style on its holder
   `<span>`: `Button.image_holder_style` (`app/frontend/app/utils/button.js:1063-1071`) —
   `margin-top: <top_margin>px; vertical-align: top; display: inline-block; width: <image_width>px;
   height: <image_height>px; line-height: <image_height>px;` — plus
   `Button.image_style` (`:1072-1075`) on the `<img>` (`width/height: 100%; object-fit: contain`).
   CONFIRMED.

2. **Every shape the classic button can be rendered in.** THREE renderers emit that element:
   - speak mode → `Board#render_fast_html` string builder,
     `app/frontend/app/models/board.js:1779` — `<span style='...'>`, **no class**. CONFIRMED.
     (Gate: `edit_manager.process_for_displaying` only builds fast_html when
     `appState.speak_mode && !is_board_detail`, `app/frontend/app/utils/edit_manager.js:2076`.)
   - non-speak, non-edit browsing → per-button `Button#fast_html`,
     `app/frontend/app/utils/button.js:452` — `<span style='...'>`, **no class**. CONFIRMED.
   - edit mode → handlebars, `app/frontend/app/templates/user/board-alt/index.hbs:119` —
     `<span class='img_holder' style=...>`. CONFIRMED. (Same in `templates/board/index.hbs:129`,
     `templates/button.hbs:13`, `components/button-stash.hbs:28`.)

3. **Cross-file claim: is the CSS that centres it real?** YES, and it only ever matched the
   handlebars path. `app/frontend/app/styles/app.scss:66065-66089`, inside
   `#within_ember.board-alt-view`, absolutely positions `.board a.button .img_holder` into the
   band the label leaves (`top:4px; bottom: var(--ll-symbol-band)`, flipped by
   `:has(.button-label-holder.top)`) and flex-centres the symbol in it. Its own comment describes
   exactly the symptom reported here ("down and right of centre, not filling") — the fix was
   written for the classic board but could never reach the two fast-HTML renderers, which emit
   no `img_holder` class. CONFIRMED.

## Why the inline style mis-centres

`.button` is `text-align: center` (`app.scss:8332`) and, on board-alt, `padding: 4px` +
`2px` border (`app.scss:66029-66035`). Content-box width is `button_width - 12`, while the
holder is `image_width = 0.9 * (button_width - 2*inner_pad)` (`models/board.js:1875`). The
holder is therefore WIDER than the line box for any button narrower than ~84px — the usual
case on a dense grid — so the inline-block starts at the left content edge, overflows right,
and is clipped by `.button { overflow: hidden }`. Vertically the holder is placed by
`margin-top` alone (the label holder is `position: absolute`, `app.scss:10082`), so it is
wherever `currentLabelHeight + 15 - 8` puts it, not centred in the remaining band.

## Fix

Emit `class='img_holder'` from both fast-HTML builders so all three renderers produce the
same element and the already-authored, already-reviewed board-alt rules govern all of them.
(Root `CLAUDE.md` / `app/frontend/CLAUDE.md`: "A tile change must land in both" render paths.)

Guard: `#within_ember.board-alt-view .board .button .img_holder { background: #e8f5f4 !important }`
(`app.scss:66157`) currently only paints in edit mode. Applying it in speak mode would put an
opaque mint rectangle behind every symbol and behind empty buttons, and would defeat the
`symbol_background` preference (`app.scss:9428-9436` styles the `img`, not the holder) —
`docs/SYMBOL_IMPORT_SKIN_TONE_FINDINGS.md:155` already names that band as what masks the
colour there. Scoped the selector to `.board.edit` so today's rendering is preserved
byte-for-byte in both modes.

## Falsification

- Red test first: `app/frontend/tests/utils/button-test.js` `fast_html` context asserts the
  symbol holder carries `img_holder`. Fails before the change, passes after.
- Verified RED: `npx ember test --filter "img_holder"` -> `# fail 1`, message quotes the emitted
  markup `<span style='margin-top: 22px; vertical-align: top; display: inline-block; width: 60px;
  height: 55px; line-height: 55px;'></span>` — no class, direct evidence of the defect.
- Verified GREEN after the change: `# tests 1 / # pass 1 / # fail 0`.
- `npm run lint:js:ci`: `findings=1586 baseline=1586 grandfathered=1586 new=0`. The 3-line comment
  in `models/board.js` shifted one grandfathered `ember/no-runloop` entry from line 1953 to 1956
  (identical fingerprint `5addc2170315`); re-pointed that one `.eslint-todo` line rather than
  re-baselining the file.
- `npx sass app/styles/app.scss`: compiles, selectors emit as intended.
- NOT run: the full QUnit suite (`ember serve` is up on 8184 and the frontend rules forbid a full
  run under that contention).

## Changes

- `app/frontend/app/utils/button.js:452` and `app/frontend/app/models/board.js:1779` — emit
  `class='img_holder'` on the symbol holder.
- `app/frontend/app/styles/app.scss` — `--ll-symbol-band` now tracks the `button_text`
  preference (`text_large` 37px, `text_huge` 50px, `text_none` 4px; smaller sizes keep the 30px
  default on purpose, because the shared `@media (max-height: 800px)` rule forces every label to
  27px regardless of font-size). The `#e8f5f4` image-band background is scoped to `.board.edit`,
  which is the only place it has ever painted.
- `app/frontend/tests/utils/button-test.js` — regression test.

## Adjacent, NOT fixed (flagged)

The "no shrink-to-fit for labelled buttons" change already in this working tree
(`app/frontend/app/utils/button.js`) did not land in the speak-mode renderer: the same
estimate-and-scale block is still live at `app/frontend/app/models/board.js:1804-1814`, so a long
label still shrinks (down to 8px) on the classic speak board. Same two-renderer trap as this bug.

## Follow-up: fill the band, don't just centre in it (same session)

Centred but still small. Two things were holding the symbol back, both now edited at source:

1. `@media (max-height: 800px) { .button:not(.md-board-detail-symbol-card) img.symbol {
   transform: scale(clamp(0.6, …, 1)) } }` — 0.93x at a 729px viewport, 0.6x at 400px. The
   rule's own comment says it compensates for the JS-sized `img_holder`; board-alt's holder is
   now CSS-sized to the band, so the compensation only shrinks the symbol away from the band it
   should fill. Selector narrowed in place to `#within_ember:not(.board-alt-view) …`; the legacy
   `board` route still renders through the JS inline sizing and keeps it.
2. `.img_holder` pinned at `top/left/right: 4px` — a second margin inside the button's own
   `padding: 4px`. Now `0` on those three sides; only `--ll-symbol-band` is subtracted.

With the scale gone, the band reserve has to be right, so `--ll-symbol-band` also gained a
`@media (max-height: 800px)` correction (35px default, 40px `text_huge`) — that media block
forces every label to 27px regardless of font-size, which is taller than the 30px default
reserve. `text_large` (37px) and `text_none` (4px) already cover it by specificity.

`object-fit: contain` stays: the symbol fills the band in its long dimension and centres in the
other. Cropping or stretching AAC artwork is not on the table.

## Follow-up 2: where the leftover space actually was (measured, not guessed)

Wrote `app/frontend/scripts/board-alt-symbol-fill-probe.mjs` (Puppeteer, read-only) and measured
`marcus_williams_slp/vocal-flair-84` at 1280x729, 100x83 buttons. Three separate gaps, only one
of them CSS's fault:

| gap | measured | cause |
|---|---|---|
| above the picture | 12px | band started at y=37, label's INK ended at y=25 |
| left and right | 26px each side | square symbol, `object-fit: contain`, band 96x44 |
| inside the picture | 18% top / 12% bottom of the file | transparent margin baked into the SVG (`convert -trim` on the "people" symbol: ink 98x70 at +2+18 of a 100x100 canvas) |

The img box already filled the band exactly (`img_box == holder` on every button), so nothing in
CSS was shrinking the image — the band itself was too small and the artwork inside it is not
edge to edge.

**Fixed the first one.** `--ll-symbol-band` now derives from the label's FONT SIZE rather than a
table of pixel values: `calc(4px + 1.25 * var(--ll-label-size))`, with `--ll-label-size` set per
text-size class (14 / 18 / 25 / 35px, and the `really_small_text` pill getting +6px because its
label paints a background, and `text_none` getting 0). The label BOX is much taller than its ink
— `@media (max-height: 800px)` bumps it to 27px and this block adds a 0.3em descender pad — and
the symbol may sit in both, because they are empty and the holder paints nothing.

Result on that board: band 44px -> 52.5px tall, drawn symbol 44x44 -> 52.5x52.5 (+19% linear,
+42% area). Swept every `button_text` class in the browser: gap between label ink and band top is
3.3-3.8px at 14/18/25/35px labels, and `text_none` gives the symbol the whole 79px button. No
overlap at any size.

**Not fixed, and not fixable in CSS:** the side space. A square symbol in a 96x44 band can only be
44 tall and 44 wide; using the other 52px means `object-fit: fill` (distorts the artwork) or
`cover` (crops it — on this band it would cut 54% of the height). The whitespace baked into the
symbol files is a data problem: trimming it at import/upload time would make the drawing ~40%
bigger inside the same box with no distortion and no lost ink. Scope that separately.

Also corrected a claim I had written into the stylesheet a moment earlier: `.board a.button`'s
`padding: 4px` does NOT inset the holder. An absolutely positioned child's containing block is the
padding box, so the padding sits inside it — measured, the holder's left edge lands on the border
at x=2 of a 100px button.
