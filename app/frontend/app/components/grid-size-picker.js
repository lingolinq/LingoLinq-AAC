import Component from '@ember/component';
import { computed } from '@ember/object';
import i18n from '../utils/i18n';

/**
 * Grid-size picker — the "drag across a grid to choose rows x columns" control,
 * sitting beside the Rows/Cols steppers on the new-board page.
 *
 * The steppers stay the primary control and the accessible source of truth; this is
 * a faster way to reach a size and, equally, a PREVIEW: opening it shows the shape
 * of the grid currently selected, which two number inputs never convey.
 *
 * Deliberately its OWN component rather than more markup in create-board-new
 * (2989 lines, and the board-detail edit panel has the same Rows/Columns pair —
 * this is reusable there). Interface is one-way: it never writes to the model, it
 * calls `onChange(rows, columns)` and lets the caller own the state.
 */

/** The picker's own ceiling. Deliberately LOWER than the board's 1-20 range
 *  (create-board-new#plus_minus, MAX_GRID_LABELS 400): 15x15 covers essentially
 *  every real board while keeping the panel small enough to sit comfortably on
 *  screen — a 20x20 panel overran shorter viewports.
 *  Sizes above 15 remain reachable through the Rows/Cols steppers, and a board
 *  already larger than this still renders correctly here (see `markRow`). */
const MAX = 15;

export default Component.extend({
  tagName: '',

  /** Current selection, owned by the caller. */
  rows: 1,
  columns: 1,
  /** Called as onChange(rows, columns) when a cell is picked. */
  onChange: null,
  /** Distinct id per instance so several pickers can coexist on a page. */
  pickerId: 'grid-size-picker',

  isOpen: false,
  /** Live preview while the pointer (or keyboard focus) is over the grid.
   *  Null when not hovering, so the readout falls back to the pending choice. */
  hoverRows: null,
  hoverCols: null,
  /** The size the user has CLICKED but not yet confirmed. Null until they click,
   *  so the panel opens showing the caller's current size. Clicking a cell only
   *  stages a choice — nothing reaches the caller until OK. */
  pendingRows: null,
  pendingCols: null,

  init() {
    this._super(...arguments);
    var self = this;
    this.onToggle = function() { self.send('toggle'); };
    this.onGridPointer = function(ev) { self.send('preview_from_event', ev); };
    this.onGridClick = function(ev) { self.send('pick_from_event', ev); };
    this.onClearHover = function() { self.send('clear_preview'); };
    this.onGridKeydown = function(ev) { self.send('grid_keydown', ev); };
    this.onConfirm = function() { self.send('confirm'); };
    this.onCancel = function() { self.send('cancel'); };
  },

  /** The caller's real value — NOT clamped to the picker's ceiling, so the readout
   *  and the toggle's label stay truthful for a board bigger than the grid. */
  _int(value) {
    var n = parseInt(value, 10);
    if (isNaN(n) || n < 1) { return 1; }
    return n;
  },

  selectedRows: computed('rows', function() { return this._int(this.get('rows')); }),
  selectedCols: computed('columns', function() { return this._int(this.get('columns')); }),

  /** The size the panel is currently proposing: the staged click if there is one,
   *  otherwise the caller's current size. This is what OK commits. */
  chosenRows: computed('pendingRows', 'selectedRows', function() {
    return this.get('pendingRows') || this.get('selectedRows');
  }),
  chosenCols: computed('pendingCols', 'selectedCols', function() {
    return this.get('pendingCols') || this.get('selectedCols');
  }),

  /** Where the proposed size lands INSIDE the grid. A board larger than the picker
   *  (say 18 rows, set with the steppers) simply fills the grid to its edge rather
   *  than marking nothing at all. */
  markRow: computed('chosenRows', function() { return Math.min(this.get('chosenRows'), MAX); }),
  markCol: computed('chosenCols', function() { return Math.min(this.get('chosenCols'), MAX); }),

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
     BLOCKS generation for the whole repo. Same for `toggleLabel` below. */
  readout: computed('hoverRows', 'hoverCols', 'chosenRows', 'chosenCols', function() {
    var hoverRows = this.get('hoverRows');
    var rows = hoverRows || this.get('chosenRows');
    var cols = hoverRows ? this.get('hoverCols') : this.get('chosenCols');
    return i18n.t('grid_size_readout', "%{rows} × %{cols}", { rows: rows, cols: cols });
  }),

  toggleLabel: computed('selectedRows', 'selectedCols', function() {
    var rows = this.get('selectedRows');
    var cols = this.get('selectedCols');
    return i18n.t('choose_grid_size_current', "Choose grid size (currently %{rows} by %{cols})", { rows: rows, cols: cols });
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

  /** Destination for the portalled panel. The form's card clips its descendants
   *  (see the template), so the panel is rendered outside it entirely. */
  destination: computed(function() {
    return typeof document !== 'undefined' ? document.body : null;
  }),

  _root() {
    var trigger = document.getElementById(this.get('pickerId'));
    return trigger ? trigger.closest('.nb-grid-picker') : null;
  },

  /** The panel is portalled to <body>, so it is NOT inside `_root()` — look it up
   *  by id rather than querying the picker's own subtree. */
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

  /** Closes and DISCARDS anything staged. Every close path is a cancel except
   *  `confirm`, which commits first. */
  close() {
    this.set('isOpen', false);
    this.set('hoverRows', null);
    this.set('hoverCols', null);
    this.set('pendingRows', null);
    this.set('pendingCols', null);
    this._unbindReposition();
  },

  _focusTrigger() {
    var trigger = document.getElementById(this.get('pickerId'));
    if (trigger && typeof trigger.focus === 'function') { trigger.focus(); }
  },

  /* The panel is `position: fixed` and placed from here rather than being anchored
     with `position: absolute` in CSS.

     WHY: the new-board card is `.new-board--modern { overflow: hidden !important }`
     (app.scss ~54721) — deliberate, it clips content to the card's rounded corners —
     and an absolutely-positioned panel is clipped by it, which cut the bottom off the
     20-row grid. A fixed element escapes ancestor overflow, and this subtree has no
     transform / filter / will-change / contain to create a fixed containing block
     (checked on .nb-form, .nb-section, .new-board--modern, .md-shell, #within_ember),
     so fixed genuinely escapes here rather than only appearing to.

     ALWAYS OPENS BELOW the toggle — it never flips above. A dropdown that
     sometimes appears above and sometimes below is disorienting, and here the
     toggle sits in a section header with the whole form beneath it, so below is
     always the natural reading direction. When there is not enough room, the panel
     takes a max-height and scrolls internally rather than moving; horizontally it
     right-aligns to the toggle and is clamped into the viewport. */
  _positionPanel() {
    var root = this._root();
    var trigger = document.getElementById(this.get('pickerId'));
    if (!root || !trigger) { return; }
    var panel = this._panelEl();
    if (!panel) { return; }
    var GAP = 6;
    var EDGE = 8;
    var t = trigger.getBoundingClientRect();
    var p = panel.getBoundingClientRect();
    var left = t.right - p.width;
    left = Math.max(EDGE, Math.min(left, window.innerWidth - p.width - EDGE));
    /* NO max-height and NO internal scrolling: the whole grid must be visible at
       once — a size picker you have to scroll defeats the point of showing the
       shape. The panel is sized to fit a normal viewport instead (see the cell
       dimensions in app.scss). If the window is short enough that it still would
       not fit below, nudge it UP far enough to stay on screen, but never so far
       that it rides over the toggle. */
    var top = t.bottom + GAP;
    var overflowBottom = (top + p.height) - (window.innerHeight - EDGE);
    if (overflowBottom > 0) {
      top = Math.max(t.bottom + GAP - overflowBottom, EDGE);
    }
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
  },

  /* A fixed panel does not travel with its trigger, so it has to be re-placed while
     open. Capture phase so scrolling of any nested container counts, not just window. */
  _reposition: null,
  _bindReposition() {
    if (this._reposition) { return; }
    var self = this;
    var handler = function() {
      if (self.isDestroyed || self.isDestroying) { return; }
      if (!self.get('isOpen')) { return; }
      self._positionPanel();
    };
    this._reposition = handler;
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
  },
  _unbindReposition() {
    if (!this._reposition) { return; }
    window.removeEventListener('scroll', this._reposition, true);
    window.removeEventListener('resize', this._reposition);
    this._reposition = null;
  },

  _focusCell(row, col) {
    var panel = this._panelEl();
    if (!panel) { return; }
    var el = panel.querySelector('.nb-grid-picker__cell[data-row="' + row + '"][data-col="' + col + '"]');
    if (el && typeof el.focus === 'function') { el.focus(); }
  },

  _clickOutside: null,
  _openTimer: null,
  _attachTimer: null,

  didInsertElement() {
    this._super(...arguments);
    var self = this;
    /* Bare `close()`, not wrapped in `run()` — this repo's lint bans
       @ember/runloop, and the handler only sets plain component properties.
       Same call shape as available-boards-section's resize handler. */
    var handler = function(ev) {
      if (self.isDestroyed || self.isDestroying) { return; }
      if (!self.get('isOpen')) { return; }
      if (!ev.target) { return; }
      var root = self._root();
      if (root && root.contains(ev.target)) { return; }
      /* The panel lives in <body>, not inside `root` — without this a click on any
         cell, OK or Cancel would count as "outside" and close the panel. */
      var panel = self._panelEl();
      if (panel && panel.contains(ev.target)) { return; }
      self.close();
    };
    this.set('_clickOutside', handler);
    /* Deferred a tick so the click that MOUNTED this picker cannot immediately
       close it. setTimeout rather than `next` for the lint reason above. */
    this._attachTimer = setTimeout(function() {
      if (self.isDestroyed || self.isDestroying) { return; }
      document.addEventListener('click', handler, true);
    }, 0);
  },

  willDestroyElement() {
    var handler = this.get('_clickOutside');
    if (handler) { document.removeEventListener('click', handler, true); }
    if (this._attachTimer) { clearTimeout(this._attachTimer); this._attachTimer = null; }
    if (this._openTimer) { clearTimeout(this._openTimer); this._openTimer = null; }
    this._unbindReposition();
    this._super(...arguments);
  },

  actions: {
    toggle() {
      /* Closing via this button must go through close(), like every other close path
         (Cancel, OK, Escape, click-outside). Toggling `isOpen` alone left pendingRows/
         pendingCols staged and the scroll/resize listeners bound — so dismissing with a
         staged 6x6, setting 2x2 with the steppers, reopening and pressing OK silently
         reinstated 6x6 and discarded the stepper values. */
      if (this.get('isOpen')) {
        this.close();
        return;
      }
      this.toggleProperty('isOpen');
      if (this.get('isOpen')) {
        var self = this;
        /* Land focus on the currently-selected cell so the keyboard path starts
           where the pointer path would, and the opening reads as "here is what
           you have now". Deferred one tick so the panel exists to focus INTO. */
        if (this._openTimer) { clearTimeout(this._openTimer); }
        this._openTimer = setTimeout(function() {
          if (self.isDestroyed || self.isDestroying) { return; }
          /* Place BEFORE focusing: focusing a cell can scroll it into view, and a
             panel still sitting at its 0,0 default would scroll the page to the top. */
          self._positionPanel();
          self._bindReposition();
          self._focusCell(self.get('markRow'), self.get('markCol'));
        }, 0);
      }
    },
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
    /* Clicking a cell STAGES a size — the panel stays open so the choice can be
       adjusted, compared, or abandoned. Nothing reaches the caller until OK. */
    pick_from_event(ev) {
      var at = this._coords(ev);
      if (!at) { return; }
      this.set('pendingRows', at.row);
      this.set('pendingCols', at.col);
    },
    confirm() {
      var callback = this.get('onChange');
      var rows = this.get('chosenRows');
      var cols = this.get('chosenCols');
      /* Read BEFORE close() — it clears the staged values. */
      this.close();
      if (typeof callback === 'function') { callback(rows, cols); }
      this._focusTrigger();
    },
    cancel() {
      this.close();
      this._focusTrigger();
    },
    /** Arrow/Home/End move focus a cell at a time; focus moving fires `focusin`,
     *  which repaints the preview, so keyboard and pointer share one code path.
     *  Enter/Space are left to the native <button>, which fires the delegated click. */
    grid_keydown(ev) {
      if (!ev || !ev.key) { return; }
      if (ev.key === 'Escape') {
        /* Escape is Cancel — staged size discarded. */
        ev.preventDefault();
        this.close();
        this._focusTrigger();
        return;
      }
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
