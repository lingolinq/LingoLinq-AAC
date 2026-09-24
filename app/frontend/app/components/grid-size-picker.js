import Component from '@ember/component';
import { computed } from '@ember/object';
import i18n from '../utils/i18n';

/**
 * Grid-size picker — the "sweep across a grid to choose rows x columns" control on
 * the new-board wizard's grid-size step.
 *
 * ALWAYS ON SCREEN. It used to be a popover behind a toggle, which meant the step it
 * occupies showed a single small button and the grid — the whole point of the control
 * — was one click away. Inline, the step opens showing the shape of the current size,
 * which two number inputs never convey, and a cell click sets the size in one gesture.
 *
 * Dropping the popover took its whole apparatus with it: the <body> portal (needed
 * only to escape `.new-board--modern { overflow: hidden }`), the fixed-position
 * placement and its scroll/resize re-placement, the click-outside handler, the
 * open/close focus round-trip, and the Cancel / OK footer. In normal flow nothing
 * clips the panel, and with nothing staged and nothing to dismiss, Cancel and OK were
 * controls that could not do anything. `git log` has the popover version.
 *
 * The Rows/Cols steppers beside it stay the primary control and the accessible source
 * of truth. Interface is one-way: this never writes to the model, it calls
 * `onChange(rows, columns)` and lets the caller own the state.
 *
 * Deliberately its OWN component rather than more markup in create-board-new
 * (3000+ lines, and the board-detail edit panel has the same Rows/Columns pair —
 * this is reusable there).
 */

/** The picker's own ceiling, 14x14 (lowered from 15 on request). Deliberately LOWER than
 *  the board's own range (create-board-new#plus_minus, MAX_GRID_LABELS 400): it covers
 *  essentially every real board while keeping the panel small enough to sit comfortably
 *  in the step.
 *  IT IS A CEILING ON THE PICKER, NOT ON THE BOARD. The Rows/Cols steppers stay
 *  uncapped, so a larger board is still reachable; what changes above 14 is only that
 *  this control can no longer depict the shape. It fills to its edge instead of marking
 *  nothing (see `markRow`), the readout keeps reporting the REAL size, and
 *  `over_ceiling` puts a notice on the panel so the mismatch is stated rather than left
 *  for the user to notice. */
const MAX = 14;

export default Component.extend({
  tagName: '',

  /** Current selection, owned by the caller. */
  rows: 1,
  columns: 1,
  /** Called as onChange(rows, columns) when a cell is picked. */
  onChange: null,
  /** Distinct id per instance so several pickers can coexist on a page. */
  pickerId: 'grid-size-picker',

  /** Live preview while the pointer (or keyboard focus) is over the grid.
   *  Null when not hovering, so the readout falls back to the real selection. */
  hoverRows: null,
  hoverCols: null,

  init() {
    this._super(...arguments);
    var self = this;
    this.onGridPointer = function(ev) { self.send('preview_from_event', ev); };
    this.onGridClick = function(ev) { self.send('pick_from_event', ev); };
    this.onClearHover = function() { self.send('clear_preview'); };
    this.onGridKeydown = function(ev) { self.send('grid_keydown', ev); };
  },

  /** The caller's real value — NOT clamped to the picker's ceiling, so the readout
   *  stays truthful for a board bigger than the grid. */
  _int(value) {
    var n = parseInt(value, 10);
    if (isNaN(n) || n < 1) { return 1; }
    return n;
  },

  selectedRows: computed('rows', function() { return this._int(this.get('rows')); }),
  selectedCols: computed('columns', function() { return this._int(this.get('columns')); }),

  /** The ceiling, exposed so the notice copy can name it without hard-coding a number
   *  that would drift if MAX ever moved again. */
  max_grid: MAX,

  /** True once the board is bigger than this control can draw. Drives the notice; it does
   *  NOT block anything -- going over is a supported choice, just one the picker cannot
   *  illustrate. */
  over_ceiling: computed('selectedRows', 'selectedCols', function() {
    return this.get('selectedRows') > MAX || this.get('selectedCols') > MAX;
  }),

  /** Where the selection lands INSIDE the grid. A board larger than the picker
   *  (say 18 rows, set with the steppers) simply fills the grid to its edge rather
   *  than marking nothing at all. */
  markRow: computed('selectedRows', function() { return Math.min(this.get('selectedRows'), MAX); }),
  markCol: computed('selectedCols', function() { return Math.min(this.get('selectedCols'), MAX); }),

  /** What the grid paints as "on" — the hover preview when there is one, the marked
   *  selection otherwise. */
  activeRows: computed('hoverRows', 'markRow', function() {
    return this.get('hoverRows') || this.get('markRow');
  }),
  activeCols: computed('hoverCols', 'markCol', function() {
    return this.get('hoverCols') || this.get('markCol');
  }),

  /** Hover values while sweeping; otherwise the caller's REAL size, which may exceed
   *  the grid — reading "18 × 4" under a grid filled to 15 is correct, and reading
   *  "15 × 4" would be a lie. */
  /* NOTE: the i18n.t call is kept on ONE line. i18n_generator.rb parses line by
     line (see its `while line[idx] && line[idx] != ")"` scan) — a wrapped call
     never finds its closing paren, so the key is reported "== MISSING ==" and
     BLOCKS generation for the whole repo. */
  readout: computed('hoverRows', 'hoverCols', 'selectedRows', 'selectedCols', function() {
    var hoverRows = this.get('hoverRows');
    var rows = hoverRows || this.get('selectedRows');
    var cols = hoverRows ? this.get('hoverCols') : this.get('selectedCols');
    return i18n.t('grid_size_readout', "%{rows} × %{cols}", { rows: rows, cols: cols });
  }),

  /* The MAX x MAX cell matrix. Rebuilt whenever the highlight extent changes, which
     is what drives the fill as the pointer sweeps. Cells carry no event handlers of
     their own — the grid container delegates (see the template), so this is 225
     nodes and 5 listeners rather than 225 nodes and 675 listeners. */
  matrix: computed('activeRows', 'activeCols', 'markRow', 'markCol', function() {
    var activeRows = this.get('activeRows');
    var activeCols = this.get('activeCols');
    var selRows = this.get('markRow');
    var selCols = this.get('markCol');
    var lines = [];
    for (var r = 1; r <= MAX; r++) {
      var cells = [];
      for (var c = 1; c <= MAX; c++) {
        cells.push({
          row: r,
          col: c,
          on: r <= activeRows && c <= activeCols,
          selected: r === selRows && c === selCols,
          /* Roving tabindex: exactly one cell is tabbable, so the picker costs a
             single Tab stop instead of 225. Arrow keys move focus from there. */
          focusable: r === selRows && c === selCols,
          label: i18n.t('grid_size_n_by_m', "%{rows} by %{cols}", { rows: r, cols: c })
        });
      }
      lines.push({ row: r, cells: cells });
    }
    return lines;
  }),

  /** The panel is in the component's own subtree now, so it is found by id rather
   *  than having to be hunted for in <body>. */
  _panelEl() {
    return document.getElementById(this.get('pickerId') + '-panel');
  },

  /** Read a cell's coordinates off the delegated event's target. */
  _coords(ev) {
    var el = ev && ev.target && ev.target.closest && ev.target.closest('.nb-grid-picker__cell');
    if (!el) { return null; }
    var r = parseInt(el.getAttribute('data-row'), 10);
    var c = parseInt(el.getAttribute('data-col'), 10);
    if (isNaN(r) || isNaN(c)) { return null; }
    return { row: r, col: c };
  },

  _focusCell(row, col) {
    var panel = this._panelEl();
    if (!panel) { return; }
    var el = panel.querySelector('.nb-grid-picker__cell[data-row="' + row + '"][data-col="' + col + '"]');
    if (el && typeof el.focus === 'function') { el.focus(); }
  },

  actions: {
    preview_from_event(ev) {
      var at = this._coords(ev);
      if (!at) { return; }
      this.set('hoverRows', at.row);
      this.set('hoverCols', at.col);
    },
    clear_preview() {
      this.set('hoverRows', null);
      this.set('hoverCols', null);
    },
    /* Clicking a cell COMMITS that size, the way every other sweep-a-grid size
       picker behaves. The caller writes it back through `rows`/`columns`, which
       repaints the marked selection.

       Hover is deliberately NOT cleared here: the pointer is still sitting on the
       cell that was just clicked, so the preview and the new selection agree, and
       clearing would make the fill flicker back and forth under a stationary
       pointer. `mouseleave` clears it. */
    pick_from_event(ev) {
      var at = this._coords(ev);
      if (!at) { return; }
      var callback = this.get('onChange');
      if (typeof callback === 'function') { callback(at.row, at.col); }
    },
    /** Arrow/Home/End move focus a cell at a time; focus moving fires `focusin`,
     *  which repaints the preview, so keyboard and pointer share one code path.
     *  Enter/Space are left to the native <button>, which fires the delegated
     *  click, so the keyboard commits a size the same way the pointer does. */
    grid_keydown(ev) {
      if (!ev || !ev.key) { return; }
      var at = this._coords(ev);
      if (!at) { return; }
      var r = at.row;
      var c = at.col;
      if (ev.key === 'ArrowUp') { r = Math.max(1, r - 1); }
      else if (ev.key === 'ArrowDown') { r = Math.min(MAX, r + 1); }
      else if (ev.key === 'ArrowLeft') { c = Math.max(1, c - 1); }
      else if (ev.key === 'ArrowRight') { c = Math.min(MAX, c + 1); }
      else if (ev.key === 'Home') { c = 1; }
      else if (ev.key === 'End') { c = MAX; }
      else { return; }
      ev.preventDefault();
      this._focusCell(r, c);
    }
  }
});
