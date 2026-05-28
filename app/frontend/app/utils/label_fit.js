// label_fit — per-label, content-aware "shrink to fit" for the
// board-detail grid.
//
// Behavior driven by the user's "Shrink labels to fit" preference
// (Text Settings on the board-detail edit page). When enabled, each
// label in the grid is independently checked: if its text would
// overflow the 3-line label box at the user's chosen font size, only
// that one label's font is reduced (down to an 8px floor) until the
// full text fits without truncation. Labels that already fit at the
// chosen size are left alone — the toggle is shrink-only and never
// rescales every label on the board uniformly.
//
// Spans (.md-board-detail-symbol-card__label, speak / view mode) are
// fitted via DOM measurement so word-boundary wrap inside the existing
// 3.45em box is respected. Inputs (.md-board-detail-symbol-card__label-input,
// edit-mode live preview) are intrinsically single-line, so they're
// fitted via an offscreen canvas measurement against the input's
// content width — same primitive idea as the legacy capabilities.fit_text
// helper used by the classic board.
//
// All sizing is applied via inline `style="font-size: …px"`, which beats
// the base CSS rule on cascade. clear() removes those inline styles to
// hand control back to CSS when the toggle is flipped off.

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

function labelText(el) {
  if(isInput(el)) { return el.value || ''; }
  return (el.textContent || '').trim();
}

// Wrap-aware fit for span labels. Iterates font-size down from basePx
// until the natural scrollHeight (with the line-clamp / max-height
// constraints temporarily lifted) is within the 3.45em box at that
// size, or the floor is reached. Returns the chosen font-size.
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
  var savedTransition = el.style.transition;
  var savedMaxHeight = el.style.maxHeight;
  var savedLineClamp = el.style.webkitLineClamp;
  var savedOverflow = el.style.overflow;

  el.style.transition = 'none';
  el.style.maxHeight = 'none';
  el.style.webkitLineClamp = 'unset';
  el.style.overflow = 'visible';

  var chosen = basePx;
  var size = basePx;
  while(size >= MIN_FONT_PX) {
    el.style.fontSize = size + 'px';
    var allowedPx = LABEL_BOX_EM * size;
    var naturalPx = el.scrollHeight;
    if(naturalPx <= allowedPx + FIT_TOLERANCE_PX) {
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

// Apply the fit to a single label element. Used both by the bulk
// gridEl pass and by single-label updates (e.g. label-field blur
// after the user edits text on the edit page).
function applyOne(el, basePx) {
  if(!el) { return; }
  var text = labelText(el);
  if(!text) {
    el.style.fontSize = '';
    return;
  }
  var size = isInput(el) ? fitSingleLine(el, basePx) : fitWrapped(el, basePx);
  if(size >= basePx) {
    el.style.fontSize = '';
  } else {
    el.style.fontSize = size + 'px';
  }
}

function selectLabels(gridEl) {
  return gridEl.querySelectorAll(
    '.md-board-detail-symbol-card__label, .md-board-detail-symbol-card__label-input'
  );
}

export default {
  // Walk every label in the grid and shrink only the ones that
  // overflow at the user's chosen size.
  apply: function(gridEl) {
    if(!gridEl) { return; }
    var basePx = readBaseSizePx(gridEl);
    var labels = selectLabels(gridEl);
    for(var i = 0; i < labels.length; i++) {
      applyOne(labels[i], basePx);
    }
  },

  // Remove all inline font-size overrides we set, handing control
  // back to the CSS rules. Called when the toggle flips off.
  clear: function(gridEl) {
    if(!gridEl) { return; }
    var labels = selectLabels(gridEl);
    for(var i = 0; i < labels.length; i++) {
      labels[i].style.fontSize = '';
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
