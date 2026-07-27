// Single source of truth for size-keyed user-preference → pixel mappings.
//
// Every place that renders or measures a board (board-detail speak,
// board-detail edit preview, board-alt speak, the create-board-new
// mockup, the preferences-page canvas preview, the demo speak page)
// must read sizing values from THIS module so the same preference
// produces identical visual results across surfaces.
//
// Why this exists:
//   Before consolidation there were 5+ separate copies of these
//   mappings sprinkled across the codebase (layout-preview.js,
//   create-board-new.js, controllers/user/board-detail.js,
//   controllers/board/index.js, controllers/demo/speak.js, plus the
//   per-size CSS rules in app.scss). The copies drifted apart over
//   time — e.g. board-alt's `extra_pad` mapped "small" to a default
//   4px fall-through while board-detail's `button_spacing_px` mapped
//   it to an explicit 6px. The same user preference produced visibly
//   different gaps on different pages.
//
// Adding a new size? Add it here once. Every consumer picks it up.

// ── Vocalization box (speak-bar) height ────────────────────────────
// Maps the `preferences.device.vocalization_height` string to the
// canonical pixel height of the speak-bar. Used by:
//   - services/app-state.js  → `header_height` computed (the resolved
//     px value the rest of the app consults for grid positioning)
//   - components/layout-preview.js  → canvas preview on the
//     preferences page
//   - app.scss  → per-size CSS rules use these same numbers as the
//     `min-height` for the row + inner sentence-bar (kept in sync
//     manually — CSS can't import a JS module, so the values are
//     duplicated in the per-size `.md-board-detail-sentence-bar--<size>`
//     rules. Treat THIS file as the canonical source; CSS mirrors it.)
//
// "small" sits at 90px (not 70) so the stacked Options + Sidebar
// toggles on the right of the speak bar can each hit the WCAG 2.5.5
// AAA 44×44 touch-target minimum (44 + 2 gap + 44 = 90). "tiny" was
// removed entirely — it forced toggles below the 44px floor and the
// resulting bar was too cramped to read. Legacy users with
// `vocalization_height: 'tiny'` saved on their device are mapped
// silently to 'small' (still the smallest option) by
// `vocalizationHeightPx` below.
export const VOCALIZATION_HEIGHT_PX = Object.freeze({
  small: 90,
  medium: 100,
  large: 150,
  huge: 200,
});

export const VOCALIZATION_HEIGHT_DEFAULT = 'medium';
export const VOCALIZATION_HEIGHT_DEFAULT_PX = VOCALIZATION_HEIGHT_PX[VOCALIZATION_HEIGHT_DEFAULT];

export function vocalizationHeightPx(size, fallback) {
  // Legacy 'tiny' → 'small' (smallest current option). Both render
  // the bar at the same canonical height (90px) so users who picked
  // tiny before this change get a consistent bar that meets WCAG.
  if (size === 'tiny') { size = 'small'; }
  if (size && VOCALIZATION_HEIGHT_PX[size] != null) {
    return VOCALIZATION_HEIGHT_PX[size];
  }
  return fallback != null ? fallback : VOCALIZATION_HEIGHT_DEFAULT_PX;
}

// ── Button spacing (grid gap) ─────────────────────────────────────
// Maps `preferences.device.button_spacing` to the px gap between
// adjacent buttons on the board grid.
//
// IMPORTANT — board-alt uses HALF the gap:
//   board-detail's grid uses CSS `gap: var(--bd-button-gap)` directly
//   on a CSS grid, so the px value is the actual inter-button gap.
//
//   board-alt positions each button absolutely (controllers/board/
//   index.js ~line 700) and inflates the empty space around each
//   button by `extra_pad`. Adjacent buttons each contribute their
//   own extra_pad, so the rendered inter-button gap = 2 * extra_pad.
//   To match board-detail's gap, board-alt's `extra_pad` must be
//   half the canonical value.
//
// Use `buttonSpacingPx()` for board-detail / create-board-new /
// demo-speak / canvas-preview. Use `buttonSpacingHalfPx()` for
// board-alt's `extra_pad`. Both read from the same canonical map so
// they can't drift apart.
//
export const BUTTON_SPACING_PX = Object.freeze({
  none: 0,
  minimal: 2,
  'extra-small': 4,
  small: 6,
  medium: 8,
  large: 14,
  huge: 20,
});

export const BUTTON_SPACING_DEFAULT = 'medium';
export const BUTTON_SPACING_DEFAULT_PX = BUTTON_SPACING_PX[BUTTON_SPACING_DEFAULT];

export const BUTTON_SPACING_OPTIONS = Object.freeze([
  'none', 'minimal', 'extra-small', 'small', 'medium', 'large', 'huge'
]);

export function buttonSpacingPx(spacing, fallback) {
  if (spacing && BUTTON_SPACING_PX[spacing] != null) {
    return BUTTON_SPACING_PX[spacing];
  }
  return fallback != null ? fallback : BUTTON_SPACING_DEFAULT_PX;
}

// Half-gap for board-alt's absolute-positioning model. Floors the
// half so spacing values that are odd in `BUTTON_SPACING_PX` (e.g.
// `small: 6` → 3) round down rather than producing fractional px.
export function buttonSpacingHalfPx(spacing, fallback) {
  if (spacing && BUTTON_SPACING_PX[spacing] != null) {
    return Math.floor(BUTTON_SPACING_PX[spacing] / 2);
  }
  return fallback != null ? fallback : Math.floor(BUTTON_SPACING_DEFAULT_PX / 2);
}

// The gap must never occupy more than this fraction of a button's width, so
// small-button boards (small screens, or many columns) don't show an oversized
// gap. The user's preference is the ceiling; this only ever pulls the gap
// DOWN, never above the preference. board-detail applies the same fraction in
// CSS (see the .md-board-detail-grid `gap: min(...)` rule) — keep the two in
// sync if you tune this.
export const GAP_BUTTON_FRACTION = 0.15;

// Scaled half-gap for board-alt: the canonical gap, but capped at
// GAP_BUTTON_FRACTION of the (approx) button width so it shrinks with the
// buttons. `buttonWidthPx` is the column width (full width / columns). Returns
// the HALF value board-alt's positioning model needs (see buttonSpacingHalfPx).
export function buttonSpacingScaledHalfPx(spacing, buttonWidthPx, fallback) {
  var full = buttonSpacingPx(spacing, fallback);
  if (buttonWidthPx && buttonWidthPx > 0) {
    full = Math.min(full, Math.round(buttonWidthPx * GAP_BUTTON_FRACTION));
  }
  return Math.floor(full / 2);
}

// ── Button border thickness ────────────────────────────────────────
// Maps `preferences.device.button_border` to the px outline width
// of each button card. Single source so board-detail's
// `--bd-button-border` CSS var matches any other consumer.
//
export const BUTTON_BORDER_PX = Object.freeze({
  none: 0,
  small: 1,
  medium: 3,
  large: 5,
  huge: 7,
});

export const BUTTON_BORDER_DEFAULT = 'medium';
export const BUTTON_BORDER_DEFAULT_PX = BUTTON_BORDER_PX[BUTTON_BORDER_DEFAULT];

export function buttonBorderPx(border, fallback) {
  if (border && BUTTON_BORDER_PX[border] != null) {
    return BUTTON_BORDER_PX[border];
  }
  return fallback != null ? fallback : BUTTON_BORDER_DEFAULT_PX;
}

// ── Button text size ───────────────────────────────────────────────
// Maps `preferences.device.button_text` to the px font-size for
// button labels.
//
export const BUTTON_TEXT_PX = Object.freeze({
  small: 14,
  medium: 18,
  large: 22,
  huge: 35,
});

export const BUTTON_TEXT_DEFAULT = 'medium';
export const BUTTON_TEXT_DEFAULT_PX = BUTTON_TEXT_PX[BUTTON_TEXT_DEFAULT];

export function buttonTextPx(size, fallback) {
  if (size && BUTTON_TEXT_PX[size] != null) {
    return BUTTON_TEXT_PX[size];
  }
  return fallback != null ? fallback : BUTTON_TEXT_DEFAULT_PX;
}

export default {
  VOCALIZATION_HEIGHT_PX,
  VOCALIZATION_HEIGHT_DEFAULT,
  VOCALIZATION_HEIGHT_DEFAULT_PX,
  vocalizationHeightPx,
  BUTTON_SPACING_PX,
  BUTTON_SPACING_DEFAULT,
  BUTTON_SPACING_DEFAULT_PX,
  BUTTON_SPACING_OPTIONS,
  buttonSpacingPx,
  buttonSpacingHalfPx,
  GAP_BUTTON_FRACTION,
  buttonSpacingScaledHalfPx,
  BUTTON_BORDER_PX,
  BUTTON_BORDER_DEFAULT,
  BUTTON_BORDER_DEFAULT_PX,
  buttonBorderPx,
  BUTTON_TEXT_PX,
  BUTTON_TEXT_DEFAULT,
  BUTTON_TEXT_DEFAULT_PX,
  buttonTextPx,
};
