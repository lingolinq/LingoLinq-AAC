/*
 * eval_scanner — lightweight switch-scanning input mode for the
 * tiered eval. When the SLP picks "Switch / scanning" on the
 * intake, the runner mounts this scanner. It cycles through the
 * student-facing tiles on the current item with a configurable
 * dwell time; a switch press (spacebar by default) selects the
 * currently-highlighted tile.
 *
 * Why this is separate from the main board's scanner.js:
 *   - scanner.js (1265 lines) is wired to board geometry, axes,
 *     and the AAC button widget. The eval runs simpler grids that
 *     don't fit those primitives without contortion.
 *   - The eval needs a clean lifecycle that starts/stops per item,
 *     not per session, so a focused state machine is easier.
 *
 * Public API:
 *   start({ root, selector, dwellMs?, onSelect, onHighlight? })
 *     Begin scanning. Cycles through all elements matching `selector`
 *     inside `root` (DOM node). Calls onHighlight(idx, el) each step
 *     and onSelect(el, idx) when a switch is pressed.
 *   stop()
 *     Halt scanning, clear highlight class, remove key listener.
 *   isActive()
 *     Returns true while a scan loop is running.
 *
 * UX notes:
 *   - Spacebar is the soft-switch. Click on the highlighted cell
 *     also counts as a select (lets the SLP demonstrate scan-mode
 *     to a parent using just the mouse).
 *   - Enter key restarts the scan cycle from cell 0 (useful if the
 *     student missed the window).
 *   - Escape stops scanning entirely.
 */

const HIGHLIGHT_CLASS = 'evq-scan-active';
const DEFAULT_DWELL_MS = 1500;

let state = {
  active: false,
  root: null,
  selector: null,
  dwellMs: DEFAULT_DWELL_MS,
  cells: [],
  currentIndex: -1,
  timerId: null,
  onSelect: null,
  onHighlight: null,
  keydownBound: null,
  highlightedAt: 0
};

function rescanCells() {
  if (!state.active || !state.root) { return []; }
  const found = state.root.querySelectorAll(state.selector || '');
  state.cells = Array.prototype.slice.call(found).filter(function(el) {
    return !el.disabled && el.offsetParent !== null;
  });
  return state.cells;
}

function clearHighlight() {
  state.cells.forEach(function(el) {
    if (el && el.classList) { el.classList.remove(HIGHLIGHT_CLASS); }
  });
}

function step() {
  if (!state.active) { return; }
  rescanCells();
  if (!state.cells.length) {
    state.timerId = setTimeout(step, state.dwellMs);
    return;
  }
  clearHighlight();
  state.currentIndex = (state.currentIndex + 1) % state.cells.length;
  const el = state.cells[state.currentIndex];
  if (el && el.classList) { el.classList.add(HIGHLIGHT_CLASS); }
  state.highlightedAt = Date.now();
  if (state.onHighlight) {
    try { state.onHighlight(state.currentIndex, el); } catch (e) { /* swallow */ }
  }
  state.timerId = setTimeout(step, state.dwellMs);
}

function selectCurrent() {
  if (!state.active || state.currentIndex < 0) { return; }
  const el = state.cells[state.currentIndex];
  if (!el) { return; }
  const dwell = Date.now() - state.highlightedAt;
  if (state.onSelect) {
    try { state.onSelect(el, state.currentIndex, dwell); } catch (e) { /* swallow */ }
  }
  // Default behavior: click the element. The runner's existing
  // click handler will fire the same path as a touch interaction
  // — auto-scoring, event emission, etc. — so we don't have to
  // duplicate any selection logic here.
  if (typeof el.click === 'function') { el.click(); }
}

function restartCycle() {
  if (!state.active) { return; }
  clearHighlight();
  state.currentIndex = -1;
  if (state.timerId) { clearTimeout(state.timerId); }
  step();
}

function keydown(event) {
  if (!state.active) { return; }
  if (event.code === 'Space' || event.key === ' ') {
    event.preventDefault();
    selectCurrent();
  } else if (event.code === 'Enter' || event.key === 'Enter') {
    event.preventDefault();
    restartCycle();
  } else if (event.code === 'Escape' || event.key === 'Escape') {
    event.preventDefault();
    stop();
  }
}

export function start(opts) {
  stop();
  state.active = true;
  state.root = (opts && opts.root) || document.body;
  state.selector = opts && opts.selector;
  state.dwellMs = (opts && opts.dwellMs) || DEFAULT_DWELL_MS;
  state.cells = [];
  state.currentIndex = -1;
  state.onSelect = (opts && opts.onSelect) || null;
  state.onHighlight = (opts && opts.onHighlight) || null;
  state.keydownBound = keydown;
  document.addEventListener('keydown', state.keydownBound);
  step();
}

export function stop() {
  if (state.timerId) { clearTimeout(state.timerId); }
  clearHighlight();
  if (state.keydownBound) { document.removeEventListener('keydown', state.keydownBound); }
  state = {
    active: false,
    root: null,
    selector: null,
    dwellMs: DEFAULT_DWELL_MS,
    cells: [],
    currentIndex: -1,
    timerId: null,
    onSelect: null,
    onHighlight: null,
    keydownBound: null,
    highlightedAt: 0
  };
}

export function isActive() {
  return state.active;
}

export function rescan() {
  rescanCells();
}

export default {
  start: start,
  stop: stop,
  isActive: isActive,
  rescan: rescan,
  HIGHLIGHT_CLASS: HIGHLIGHT_CLASS
};
