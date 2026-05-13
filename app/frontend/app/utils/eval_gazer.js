/*
 * eval_gazer — eye-gaze (and mouse-proxy) dwell-to-select input
 * for the tiered eval. When the SLP picks "Eye gaze" on the intake,
 * the runner mounts this gazer. It polls the gaze position, finds
 * the eval cell under it via document.elementFromPoint, accumulates
 * dwell time on that cell, and selects it (clicks) once the
 * dwell threshold is met.
 *
 * Two gaze position sources, in order of preference:
 *   1. window.weblinger.position — the WebGazer-based gaze library
 *      already wired into the main AAC board flow via
 *      capabilities.eye_gaze.listen().
 *   2. Mouse position — fallback so the dwell mechanic is testable
 *      and demonstratable on any device without an eye tracker.
 *      SLPs can show parents what gaze mode feels like by hovering.
 *
 * Why this is separate from buttonTracker:
 *   - buttonTracker is deeply tied to the AAC board widget (button
 *     elements, board geometry, dwell_release, gamepad input). The
 *     eval grids are simpler, and the eval lifecycle (start/stop
 *     per session) is different from board mode.
 *
 * Public API:
 *   start({ root, selector, dwellMs?, onDwell?, onSelect? })
 *     Begin polling. Render a gaze cursor + dwell-progress ring on
 *     the cell under the gaze position.
 *   stop()
 *     Halt polling, clear cursor + highlights.
 *   isActive()
 *
 * UX notes:
 *   - The gaze cursor is a small translucent ring that follows the
 *     gaze position so the user knows where the system thinks they
 *     are looking.
 *   - The dwell ring fills around the active cell as the dwell
 *     threshold approaches, then triggers the click.
 *   - Cell entry resets the dwell timer. Leaving and re-entering
 *     the same cell starts the dwell over.
 */

const HIGHLIGHT_CLASS = 'evq-gaze-active';
const DWELL_VAR = '--evq-gaze-dwell-pct';
const DEFAULT_DWELL_MS = 1000;
const POLL_INTERVAL_MS = 30;        // ~33Hz polling — good UX, low CPU
const CURSOR_ID = 'evq-gaze-cursor';

let state = {
  active: false,
  root: null,
  selector: '',
  dwellMs: DEFAULT_DWELL_MS,
  onDwell: null,
  onSelect: null,
  currentEl: null,
  dwellStart: 0,
  intervalId: null,
  cursorEl: null,
  mouseX: 0,
  mouseY: 0,
  mouseBound: null
};

function getGazePosition() {
  // Prefer webgazer/weblinger if it's exposing a current position.
  if (typeof window !== 'undefined' && window.weblinger && window.weblinger.last_position) {
    return {
      x: window.weblinger.last_position.x,
      y: window.weblinger.last_position.y,
      source: 'gaze'
    };
  }
  // Fallback: mouse position (for testing without eye-tracker).
  return { x: state.mouseX, y: state.mouseY, source: 'mouse' };
}

function ensureCursor() {
  if (state.cursorEl && document.body.contains(state.cursorEl)) { return state.cursorEl; }
  const el = document.createElement('div');
  el.id = CURSOR_ID;
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);
  state.cursorEl = el;
  return el;
}

function clearCellHighlight() {
  if (state.currentEl && state.currentEl.classList) {
    state.currentEl.classList.remove(HIGHLIGHT_CLASS);
    state.currentEl.style.removeProperty(DWELL_VAR);
  }
  state.currentEl = null;
  state.dwellStart = 0;
}

function elementUnderPoint(x, y) {
  if (!isFinite(x) || !isFinite(y)) { return null; }
  const hit = document.elementFromPoint(x, y);
  if (!hit) { return null; }
  // Walk up the tree until we find a cell matching the selector
  // (handles taps on child img/span inside a tile).
  let cur = hit;
  while (cur && cur !== document.body) {
    if (cur.matches && cur.matches(state.selector)) { return cur; }
    cur = cur.parentElement;
  }
  return null;
}

function tick() {
  if (!state.active) { return; }
  const pos = getGazePosition();
  if (state.cursorEl) {
    state.cursorEl.style.transform = `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px)`;
  }
  const cell = elementUnderPoint(pos.x, pos.y);
  if (!cell) {
    clearCellHighlight();
    return;
  }
  if (cell !== state.currentEl) {
    clearCellHighlight();
    state.currentEl = cell;
    state.dwellStart = Date.now();
    cell.classList.add(HIGHLIGHT_CLASS);
    cell.style.setProperty(DWELL_VAR, '0%');
    return;
  }
  const elapsed = Date.now() - state.dwellStart;
  const pct = Math.min(100, (elapsed / state.dwellMs) * 100);
  cell.style.setProperty(DWELL_VAR, pct + '%');
  if (state.onDwell) {
    try { state.onDwell(cell, pct); } catch (e) { /* swallow */ }
  }
  if (elapsed >= state.dwellMs) {
    // Selection — fire then move on. Capture references before clearing.
    const targetCell = cell;
    const dwellTotal = elapsed;
    clearCellHighlight();
    if (state.onSelect) {
      try { state.onSelect(targetCell, dwellTotal); } catch (e) { /* swallow */ }
    }
    if (typeof targetCell.click === 'function') { targetCell.click(); }
  }
}

function mouseMove(event) {
  state.mouseX = event.clientX;
  state.mouseY = event.clientY;
}

export function start(opts) {
  stop();
  state.active = true;
  state.root = (opts && opts.root) || document.body;
  state.selector = (opts && opts.selector) || '';
  state.dwellMs = (opts && opts.dwellMs) || DEFAULT_DWELL_MS;
  state.onDwell = (opts && opts.onDwell) || null;
  state.onSelect = (opts && opts.onSelect) || null;
  state.mouseX = 0; state.mouseY = 0;
  state.mouseBound = mouseMove;
  document.addEventListener('mousemove', state.mouseBound, { passive: true });
  ensureCursor();
  document.body.classList.add('evq-gaze-mode');
  state.intervalId = setInterval(tick, POLL_INTERVAL_MS);
}

export function stop() {
  if (state.intervalId) { clearInterval(state.intervalId); }
  clearCellHighlight();
  if (state.mouseBound) { document.removeEventListener('mousemove', state.mouseBound); }
  if (state.cursorEl && state.cursorEl.parentNode) {
    state.cursorEl.parentNode.removeChild(state.cursorEl);
  }
  document.body.classList.remove('evq-gaze-mode');
  state = {
    active: false,
    root: null,
    selector: '',
    dwellMs: DEFAULT_DWELL_MS,
    onDwell: null,
    onSelect: null,
    currentEl: null,
    dwellStart: 0,
    intervalId: null,
    cursorEl: null,
    mouseX: 0,
    mouseY: 0,
    mouseBound: null
  };
}

export function isActive() {
  return state.active;
}

export default {
  start: start,
  stop: stop,
  isActive: isActive,
  HIGHLIGHT_CLASS: HIGHLIGHT_CLASS,
  DWELL_VAR: DWELL_VAR
};
