// label_fit — per-label, content-aware "shrink to fit" for the
// board-detail grid.
//
// Runs unconditionally for every label in the grid. Each label is
// independently checked: if its text would overflow its box at the
// user's chosen font size, only that one label's font is reduced
// (down to a 9px floor) until the full text fits without truncation.
// Labels that already fit at the chosen size are left alone — the fit
// is SHRINK-ONLY, never grows text past the user's preference, and
// never rescales every label on the board uniformly.
//
// Spans (.md-board-detail-symbol-card__label, speak / view mode) are
// fitted via DOM measurement so word-boundary wrap inside the existing
// 3.45em box is respected. Inputs (.md-board-detail-symbol-card__label-input,
// edit-mode live preview) are intrinsically single-line, so they're
// fitted via an offscreen canvas measurement against the input's
// content width — same primitive idea as the legacy capabilities.fit_text
// helper used by the classic board. Text-symbol spans
// (.md-board-detail-symbol-card__text-symbol) fill the whole card image
// area (not the 3-line label box), so they get a separate full-card
// overflow fit against clientHeight/clientWidth at the CSS 1.45× base.
//
// All sizing is applied via inline `style="font-size: …px !important"`
// (see setFontPx). The priority is required, not decoration — the
// responsive label rules in app.scss are themselves !important, and a
// plain inline style loses to those. clear() removes the inline styles
// to hand control back to CSS.

// 3.45em (= 3 lines × 1.15 line-height) matches the max-height on the
// base .md-board-detail-symbol-card__label rule in app.scss. Kept in
// sync so JS measurement targets the same box CSS draws.
var LABEL_BOX_LINES = 3;
var LABEL_LINE_HEIGHT = 1.15;
var LABEL_BOX_EM = LABEL_BOX_LINES * LABEL_LINE_HEIGHT;
// 9px floor matches the CSS base-label clamp's minimum at
// app.scss:63679 — keeps the JS-driven inline font-size in lockstep
// with the CSS clamp's responsive minimum so the shrink-fit behavior
// can't drive labels smaller than what CSS would have set on
// equivalent narrow viewports. The legacy classic-board floor was
// 7px (referenced in older comments); raising it to 9 keeps labels
// readable on smaller screens / multi-column grids without
// dropping below the CSS-side minimum.
var MIN_FONT_PX = 9;
// Sub-pixel tolerance — scrollHeight is integer but layout can produce
// a fractional natural height after rounding. 1px slack avoids spurious
// "doesn't fit" decisions on labels that are visually flush with the box.
var FIT_TOLERANCE_PX = 1;
// Safety factor for the wrapped-span WORD-width test (same idea as
// INPUT_WIDTH_SAFETY below): canvas measureText and real layout disagree by a
// px or two over letter-spacing / font fallback, and the label carries 1-2px of
// horizontal padding the canvas can't see.
var WORD_WIDTH_SAFETY = 0.95;
// Single-line width safety margin (matches capabilities.fit_text's 0.9).
// Leaves room for the input caret + padding the canvas measurement
// can't see.
var INPUT_WIDTH_SAFETY = 0.9;

var _canvas = null;

function getCanvasCtx() {
  if(!_canvas) {
    _canvas = document.createElement('canvas');
  }
  return _canvas.getContext('2d');
}

// Font-size writes go through these two helpers so every site sets the same
// PRIORITY. `!important` is required: the responsive label rules in app.scss
// (`@media (max-width: 1200px) { … font-size: clamp(…) !important }`) are
// themselves !important, and a plain inline style does NOT beat an !important
// declaration. Without the priority, two things broke together — the measure
// loop below read the CSS-forced size on every iteration instead of the trial
// size, so it never found a fit and always bottomed out at MIN_FONT_PX, and the
// value it finally wrote was ignored anyway.
function setFontPx(el, px) {
  el.style.setProperty('font-size', px + 'px', 'important');
}

function clearFont(el) {
  el.style.removeProperty('font-size');
}

// Read the user's chosen text size from the CSS variable the parent
// template sets on the grid root. Falls back to 15px to match the
// default in app.scss.
function readBaseSizePx(gridEl) {
  var raw = window.getComputedStyle(gridEl).getPropertyValue('--bd-button-text-size');
  var n = parseFloat(raw);
  return (isFinite(n) && n > 0) ? n : 15;
}

function isInput(el) {
  return el && el.tagName === 'INPUT';
}

function isTextSymbol(el) {
  return !!(el && el.classList &&
    el.classList.contains('md-board-detail-symbol-card__text-symbol'));
}


// Single-line labels are fitted by WIDTH, not by wrapped height. Inputs are
// intrinsically single-line; folder-tab labels (Show-Labels-on-Tab mode) are
// white-space: nowrap — folder labels can't wrap onto a tab — so they overflow
// horizontally and must be width-fitted the same way (the wrapped/height path
// would never shrink them, since a single nowrap line always fits the 3-line
// height box).
function isSingleLine(el) {
  return isInput(el) ||
    (el.classList && el.classList.contains('md-folder-tab__label'));
}

// Width of the WIDEST single word at a given size, measured on an offscreen
// canvas.
//
// Why not the DOM's scrollWidth: the label wraps, so its scrollWidth is always
// exactly its clientWidth — wrapped text fills the box by definition. That makes
// a DOM width test useless here; it cannot tell "fits comfortably" from "one
// word is spilling out". (A `scrollWidth <= boxW - margin` form is worse than
// useless: it is never true for a wrapping label, so every label runs the loop
// down to the floor — which is exactly the bug this replaced.)
//
// With `word-break: keep-all` + `overflow-wrap: normal`, a word never splits, so
// the ONLY width condition that can trigger an ellipsis is a single word being
// wider than the box. Measuring that directly is both correct and independent of
// the measurement-time wrap/clamp state.
function widestWordPx(ctx, text, sizePx, fontStyle, fontWeight, fontFamily) {
  ctx.font = fontStyle + ' ' + fontWeight + ' ' + sizePx + 'px ' + fontFamily;
  var words = (text || '').split(/\s+/);
  var max = 0;
  for(var i = 0; i < words.length; i++) {
    if(!words[i]) { continue; }
    var w = ctx.measureText(words[i]).width;
    if(w > max) { max = w; }
  }
  return max;
}

function labelText(el) {
  if(isInput(el)) { return el.value || ''; }
  return (el.textContent || '').trim();
}

// Wrap-aware fit for span labels. Iterates font-size down from basePx
// until the text fits BOTH axes of its box (with the line-clamp /
// max-height constraints temporarily lifted), or the floor is reached.
// Returns the chosen font-size.
//
// WIDTH matters as much as height. The label sets `word-break: keep-all`
// + `overflow-wrap: normal` (deliberately — for AAC the shape of a whole
// word is the recognition cue, so we never break inside one), which means
// a single long word CANNOT wrap: it stays one line, overflows
// horizontally, and `text-overflow: ellipsis` renders it as "color/…" or
// "keyb…". A height-only check reads that as "fits" — one line always fits
// a 3-line box — so the label was silently truncated and never shrunk.
// This is the same trap the folder-tab labels hit (see isSingleLine above);
// ordinary labels reach it whenever a single word is wider than the button.
//
// IMPORTANT — transition handling: the label has a CSS
// `transition: font-size 0.18s ease` (see app.scss:63483) so the
// Text Size stepper animates smoothly. The measurement loop below
// would interrupt and re-target that transition on every iteration,
// reading visually as "pops back and forth between the new and old
// setting." We disable transitions on the element for the duration
// of the measurement, then restore the original `style.transition`
// value so the FINAL caller-applied font-size (set in applyOne after
// this returns) animates normally. We also no longer restore the
// previous `style.fontSize` — leaving the chosen size in place lets
// the caller's set become a no-op if the value is unchanged
// (avoiding a redundant inline-style assignment + extra paint),
// while still letting the caller override to '' or to a different
// value if needed.
function fitWrapped(el, basePx) {
  // Read the CSS-imposed box BEFORE lifting any of it below — getComputedStyle
  // is live, so reading after the overrides would report the lifted values.
  //
  // The line budget is READ, not assumed. It used to be hard-coded to 3 lines
  // (LABEL_BOX_EM), but the short-card @container tiers in app.scss tighten
  // -webkit-line-clamp to 2 (cards ≤48px) and 1 (cards ≤45px). Against a
  // hard-coded 3 the fitter believed it had ~3x the room CSS actually allows,
  // stopped shrinking early, and the label was ellipsised anyway. Same story for
  // line-height, which those tiers step 1.15 → 1.1 → 1.05 → 1.
  var cs0 = window.getComputedStyle(el);
  var boxLines = parseInt(cs0.webkitLineClamp, 10);
  if(!isFinite(boxLines) || boxLines < 1) { boxLines = LABEL_BOX_LINES; }
  var lhPx = parseFloat(cs0.lineHeight);
  var fsPx = parseFloat(cs0.fontSize);
  var lhRatio = (isFinite(lhPx) && isFinite(fsPx) && fsPx > 0) ? (lhPx / fsPx) : LABEL_LINE_HEIGHT;
  var fontFamily = cs0.fontFamily || 'sans-serif';
  var fontWeight = cs0.fontWeight || 'normal';
  var fontStyle = cs0.fontStyle || 'normal';

  var savedTransition = el.style.transition;
  var savedMaxHeight = el.style.maxHeight;
  var savedLineClamp = el.style.webkitLineClamp;
  var savedOverflow = el.style.overflow;

  el.style.transition = 'none';
  el.style.maxHeight = 'none';
  el.style.webkitLineClamp = 'unset';
  el.style.overflow = 'visible';

  // Read once, before the loop: the label is width:100% of the card, so its
  // box width doesn't change with font-size. 0 means it isn't laid out (hidden
  // cell) — skip the width test rather than shrink to the floor on bad data.
  var boxW = el.clientWidth;
  var text = labelText(el);
  var ctx = getCanvasCtx();

  var chosen = basePx;
  var size = basePx;
  while(size >= MIN_FONT_PX) {
    setFontPx(el, size);
    var allowedPx = boxLines * lhRatio * size;
    var naturalPx = el.scrollHeight;
    var fitsHeight = naturalPx <= allowedPx + FIT_TOLERANCE_PX;
    var fitsWidth = !boxW ||
      widestWordPx(ctx, text, size, fontStyle, fontWeight, fontFamily) <= boxW * WORD_WIDTH_SAFETY;
    if(fitsHeight && fitsWidth) {
      chosen = size;
      break;
    }
    size -= 1;
  }
  if(size < MIN_FONT_PX) { chosen = MIN_FONT_PX; }

  // Restore CSS-driven constraints. Leave the chosen size inline —
  // the caller applies the final value (or clears it if chosen >=
  // basePx). Restore the transition AFTER the final caller-side
  // assignment would animate against; doing it here means the
  // subsequent caller-driven set will glide smoothly to the new
  // value.
  el.style.maxHeight = savedMaxHeight;
  el.style.webkitLineClamp = savedLineClamp;
  el.style.overflow = savedOverflow;
  el.style.transition = savedTransition;

  return chosen;
}

// Single-line fit for the editable label input. The input's content
// area is intrinsically one line, so the criterion is plain text
// width vs input width.
function fitSingleLine(el, basePx) {
  var text = labelText(el);
  if(!text) { return basePx; }
  var width = el.clientWidth;
  if(!width) { return basePx; }
  var cs = window.getComputedStyle(el);
  var fontFamily = cs.fontFamily || 'sans-serif';
  var fontWeight = cs.fontWeight || 'normal';
  var fontStyle = cs.fontStyle || 'normal';

  var ctx = getCanvasCtx();
  var size = basePx;
  while(size >= MIN_FONT_PX) {
    ctx.font = fontStyle + ' ' + fontWeight + ' ' + size + 'px ' + fontFamily;
    var measuredPx = ctx.measureText(text).width;
    if(measuredPx <= width * INPUT_WIDTH_SAFETY) { return size; }
    size -= 1;
  }
  return MIN_FONT_PX;
}

// Full-card fit for text-symbol spans. These replace the image area
// and fill width/height:100% with overflow:hidden — so the criterion
// is "does the rendered text overflow the card box?", not the 3.45em
// bottom label box used by fitWrapped.
//
// Measurement temporarily switches to block layout: the live rule is
// display:flex (centered), and flex+overflow:hidden often keeps
// scrollHeight === clientHeight even when text is visually clipped.
// Block layout lets wrapped text grow scrollHeight against the saved
// card box size.
function fitFullCard(el, basePx) {
  var boxH = el.clientHeight;
  var boxW = el.clientWidth;
  if(!boxH || !boxW) { return basePx; }

  var savedTransition = el.style.transition;
  var savedDisplay = el.style.display;
  var savedOverflow = el.style.overflow;

  el.style.transition = 'none';
  el.style.display = 'block';
  el.style.overflow = 'hidden';

  var chosen = basePx;
  var size = basePx;
  while(size >= MIN_FONT_PX) {
    setFontPx(el, size);
    var overflows =
      el.scrollHeight > boxH + FIT_TOLERANCE_PX ||
      el.scrollWidth > boxW + FIT_TOLERANCE_PX;
    if(!overflows) {
      chosen = size;
      break;
    }
    size -= 1;
  }
  if(size < MIN_FONT_PX) { chosen = MIN_FONT_PX; }

  el.style.display = savedDisplay;
  el.style.overflow = savedOverflow;
  el.style.transition = savedTransition;
  return chosen;
}

// Apply the fit to a single label element. Used both by the bulk
// gridEl pass and by single-label updates (e.g. label-field blur
// after the user edits text on the edit page).
function applyOne(el, basePx) {
  if(!el) { return; }
  var text = labelText(el);
  if(!text) {
    clearFont(el);
    el._lf_sig = null;
    return;
  }

  // Skip the measure loop when nothing that could change the answer has changed.
  // This runs from didRender for EVERY label, and each fit is an iterative
  // write-then-read of scrollHeight — a forced synchronous layout per step, up to
  // ~26 steps per label. On a 112-button board that is thousands of reflows per
  // render pass, and it now runs unconditionally (it used to be opt-in behind the
  // "Shrink labels to fit" preference). Keyed on the CARD's box, not the label's:
  // the label's own height is an OUTPUT of the fit, so using it would make the
  // signature self-invalidating.
  // Cell as well as card: folder-tab labels sit in .md-folder-back, a SIBLING of
  // the card, so a card-only lookup returns null for them and the signature would
  // be a constant — never re-fitting when the tab resizes.
  var card = el.closest && (el.closest('.md-board-detail-symbol-card') ||
                            el.closest('.md-board-detail-grid__cell'));
  var cardW = card ? card.clientWidth : 0;
  var cardH = card ? card.clientHeight : 0;
  var sig = text + '|' + cardW + 'x' + cardH + '|' + basePx;
  if(el._lf_sig === sig) { return; }
  el._lf_sig = sig;

  // Start from what CSS would actually render, not from the raw preference.
  // The responsive rules clamp the label well below `--bd-button-text-size` on
  // small screens, and since these fits are applied !important, seeding the loop
  // with the raw preference let a fitted label come out LARGER than the
  // responsive design intends. Clear first so the reading isn't our own previous
  // inline value. Falls back to the old behavior if the size can't be read.
  clearFont(el);
  var cssPx = parseFloat(window.getComputedStyle(el).fontSize);
  var effectiveBase = (isFinite(cssPx) && cssPx > 0) ? cssPx : basePx;
  var size;
  if(isTextSymbol(el)) {
    size = fitFullCard(el, effectiveBase);
  } else if(isSingleLine(el)) {
    size = fitSingleLine(el, effectiveBase);
  } else {
    size = fitWrapped(el, effectiveBase);
  }
  if(size >= effectiveBase) {
    clearFont(el);
  } else {
    setFontPx(el, size);
  }
}

/* ── BATCHED FIT ────────────────────────────────────────────────────────────────
   Same algorithm as fitWrapped / fitFullCard / fitSingleLine, but driven ACROSS every
   label at once instead of one label at a time.

   WHY: the per-label loop is not slow because of how many sizes it tries — profiled at
   ~1.2 probes per label, because 89 of 96 labels fit at their base size and stop on the
   first try. It is slow because every probe is a style WRITE followed by a layout READ on
   the same element, and on a grouped grid each of those forced layouts costs ~23ms. About
   two per label, 96 labels, ~4.8s.

   Batching by ROUND collapses that: round 1 writes the candidate size to every unresolved
   label, then reads every `scrollHeight`. One layout serves the whole round. Round 1
   resolves the ~89 labels that fit at base; the handful that must shrink take a few more
   rounds. ~200 forced layouts become ~5.

   The per-label CANDIDATE SEQUENCE is untouched — each label still walks basePx,
   basePx-1, … and stops at the first size that satisfies the same predicate — so the
   chosen sizes are identical. Only the interleaving changes.

   `fit_one` still uses the original one-label-at-a-time path: it fits a single element,
   where batching buys nothing and the old code is already proven. */

function batchedFit(items, basePx) {
  if(!items.length) { return; }
  var i, it;

  /* WRITE: clear every override first, so the reads below see CSS-driven values. */
  for(i = 0; i < items.length; i++) { clearFont(items[i].el); }

  /* READ: everything each label needs, in one pass — one layout for the batch. */
  var ctx = getCanvasCtx();
  for(i = 0; i < items.length; i++) {
    it = items[i];
    var el = it.el;
    var cs = window.getComputedStyle(el);
    var cssPx = parseFloat(cs.fontSize);
    it.base = (isFinite(cssPx) && cssPx > 0) ? cssPx : basePx;
    it.fontFamily = cs.fontFamily || 'sans-serif';
    it.fontWeight = cs.fontWeight || 'normal';
    it.fontStyle = cs.fontStyle || 'normal';
    it.kind = isTextSymbol(el) ? 'full' : (isSingleLine(el) ? 'single' : 'wrapped');
    if(it.kind === 'wrapped') {
      var boxLines = parseInt(cs.webkitLineClamp, 10);
      it.boxLines = (isFinite(boxLines) && boxLines >= 1) ? boxLines : LABEL_BOX_LINES;
      var lhPx = parseFloat(cs.lineHeight);
      it.lhRatio = (isFinite(lhPx) && isFinite(cssPx) && cssPx > 0) ? (lhPx / cssPx) : LABEL_LINE_HEIGHT;
    }
    it.boxW = el.clientWidth;
    it.boxH = el.clientHeight;
    it.text = labelText(el);
    it.size = it.base;
    it.chosen = it.base;
    it.done = false;
  }

  /* Single-line labels measure with canvas only — no DOM read per probe, so they never
     need a round. Resolve them here, exactly as fitSingleLine does. */
  var rounds = [];
  for(i = 0; i < items.length; i++) {
    it = items[i];
    if(it.kind === 'single') {
      it.chosen = fitSingleLineFrom(ctx, it);
      it.done = true;
    } else if(it.kind === 'full' && (!it.boxH || !it.boxW)) {
      it.chosen = it.base;   // matches fitFullCard's early return
      it.done = true;
    } else {
      rounds.push(it);
    }
  }

  if(rounds.length) {
    /* WRITE: the measurement overrides, once per label. */
    for(i = 0; i < rounds.length; i++) {
      it = rounds[i];
      it.saved = {
        transition: it.el.style.transition,
        maxHeight: it.el.style.maxHeight,
        lineClamp: it.el.style.webkitLineClamp,
        overflow: it.el.style.overflow,
        display: it.el.style.display
      };
      it.el.style.transition = 'none';
      if(it.kind === 'wrapped') {
        it.el.style.maxHeight = 'none';
        it.el.style.webkitLineClamp = 'unset';
        it.el.style.overflow = 'visible';
      } else {
        it.el.style.display = 'block';
        it.el.style.overflow = 'hidden';
      }
    }

    var pending = rounds.slice();
    /* Bounded by the same floor the per-label loop uses, plus one so the final
       below-MIN pass can settle. */
    var maxRounds = Math.ceil(basePx) + 2;
    for(var round = 0; round < maxRounds && pending.length; round++) {
      for(i = 0; i < pending.length; i++) { setFontPx(pending[i].el, pending[i].size); }
      for(i = 0; i < pending.length; i++) {
        it = pending[i];
        it.naturalH = it.el.scrollHeight;
        if(it.kind === 'full') { it.naturalW = it.el.scrollWidth; }
      }
      var next = [];
      for(i = 0; i < pending.length; i++) {
        it = pending[i];
        var fits;
        if(it.kind === 'wrapped') {
          var allowedPx = it.boxLines * it.lhRatio * it.size;
          var fitsHeight = it.naturalH <= allowedPx + FIT_TOLERANCE_PX;
          var fitsWidth = !it.boxW ||
            widestWordPx(ctx, it.text, it.size, it.fontStyle, it.fontWeight, it.fontFamily) <= it.boxW * WORD_WIDTH_SAFETY;
          fits = fitsHeight && fitsWidth;
        } else {
          fits = !(it.naturalH > it.boxH + FIT_TOLERANCE_PX || it.naturalW > it.boxW + FIT_TOLERANCE_PX);
        }
        if(fits) { it.chosen = it.size; it.done = true; continue; }
        it.size -= 1;
        if(it.size < MIN_FONT_PX) { it.chosen = MIN_FONT_PX; it.done = true; continue; }
        next.push(it);
      }
      pending = next;
    }
    /* Anything still unresolved (only reachable if maxRounds were exhausted) takes the
       same floor the per-label loop would have. */
    for(i = 0; i < pending.length; i++) { pending[i].chosen = MIN_FONT_PX; pending[i].done = true; }

    /* WRITE: restore the measurement overrides. */
    for(i = 0; i < rounds.length; i++) {
      it = rounds[i];
      it.el.style.maxHeight = it.saved.maxHeight;
      it.el.style.webkitLineClamp = it.saved.lineClamp;
      it.el.style.overflow = it.saved.overflow;
      it.el.style.display = it.saved.display;
      it.el.style.transition = it.saved.transition;
    }
  }

  /* WRITE: the final value — or nothing, when the label fits at its CSS size. */
  for(i = 0; i < items.length; i++) {
    it = items[i];
    if(it.chosen >= it.base) { clearFont(it.el); } else { setFontPx(it.el, it.chosen); }
  }
}

/* fitSingleLine's body, reading from the values already gathered. */
function fitSingleLineFrom(ctx, it) {
  if(!it.text || !it.boxW) { return it.base; }
  var size = it.base;
  while(size >= MIN_FONT_PX) {
    ctx.font = it.fontStyle + ' ' + it.fontWeight + ' ' + size + 'px ' + it.fontFamily;
    if(ctx.measureText(it.text).width <= it.boxW * INPUT_WIDTH_SAFETY) { return size; }
    size -= 1;
  }
  return MIN_FONT_PX;
}

function selectLabels(gridEl) {
  return gridEl.querySelectorAll(
    '.md-board-detail-symbol-card__label, .md-board-detail-symbol-card__label-input, ' +
    '.md-board-detail-symbol-card__text-symbol, ' +
    '.md-folder-tab__label, .md-folder-tab__label-input'
  );
}

export default {
  // Walk every label in the grid and shrink only the ones that
  // overflow at the user's chosen size.
  apply: function(gridEl) {
    if(!gridEl) { return; }
    var basePx = readBaseSizePx(gridEl);
    var labels = selectLabels(gridEl);

    /* READ every label's signature before writing anything, then hand the ones that
       actually need work to the batched fit. See batchedFit for why. */
    var work = [];
    for(var i = 0; i < labels.length; i++) {
      var el = labels[i];
      if(!el) { continue; }
      var text = labelText(el);
      if(!text) { work.push({ el: el, empty: true }); continue; }
      var card = el.closest && (el.closest('.md-board-detail-symbol-card') ||
                                el.closest('.md-board-detail-grid__cell'));
      var sig = text + '|' + (card ? card.clientWidth : 0) + 'x' + (card ? card.clientHeight : 0) + '|' + basePx;
      if(el._lf_sig === sig) { continue; }
      work.push({ el: el, sig: sig });
    }
    var items = [];
    for(var j = 0; j < work.length; j++) {
      if(work[j].empty) {
        clearFont(work[j].el);
        work[j].el._lf_sig = null;
      } else {
        work[j].el._lf_sig = work[j].sig;
        items.push(work[j]);
      }
    }
    batchedFit(items, basePx);
  },

  // Remove all inline font-size overrides we set, handing control
  // back to the CSS rules. Retained for callers that need to hand sizing
  // back to CSS (e.g. tearing the grid down); the grid itself no longer
  // clears, since the fit is now unconditional.
  clear: function(gridEl) {
    if(!gridEl) { return; }
    var labels = selectLabels(gridEl);
    for(var i = 0; i < labels.length; i++) {
      clearFont(labels[i]);
      // Reset the fit cache too — otherwise a later apply() sees an unchanged
      // signature and skips a label whose inline size we just removed.
      labels[i]._lf_sig = null;
    }
  },

  // Re-fit a single label. Used after a label-field edit so a label
  // that's growing as the user types (or shrinking back as they
  // delete) stays correctly sized without re-fitting every other
  // label on the grid.
  fit_one: function(el, gridEl) {
    if(!el) { return; }
    var basePx = gridEl ? readBaseSizePx(gridEl) : 15;
    applyOne(el, basePx);
  }
};
