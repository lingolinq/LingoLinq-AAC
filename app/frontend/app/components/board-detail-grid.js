import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed, get } from '@ember/object';
import { guidFor } from '@ember/object/internals';
import { scheduleOnce, debounce, cancel } from '@ember/runloop';
import labelFit from '../utils/label_fit';
import { group_buttons, normalize_order, assign_columns, GROUP_INNER_COLUMNS } from '../utils/board_categories';

// Throttle window resize re-fits to ~250ms. Resizing fires many events
// per drag; we only need the last one's measurement.
var RESIZE_DEBOUNCE_MS = 250;

// Look up the rendered grid root by scoping inside the board-detail
// content area. The board-detail page has one grid at a time, but
// hard-coding document.querySelector('.md-board-detail-grid') would
// break if the legacy /board/:key view ever co-mounted; scoping to
// the board-detail shell keeps us isolated.
/* Document-wide fallback, used only when an instance has not stamped its id yet. */
function findGridEl() {
  return document.querySelector('.md-board-detail-main .md-board-detail-grid') ||
         document.querySelector('.md-board-detail-grid');
}

export default Component.extend({
  tagName: '',
  app_state: service('app-state'),

  /* This component is rendered TWICE at once on board-detail: the real board inside
     `.md-board-detail-main`, and the Categorize panel's live preview at shell level.
     A document-wide `findGridEl()` resolved BOTH instances to the main grid, so the
     preview ran labelFit on the real board and never shrink-to-fit its own labels —
     the preview drifted from what ships, which is the one thing it exists not to do.
     Stamp a per-instance id and look that up first. */
  gridElementId: computed(function() {
    return 'bd-grid-' + guidFor(this);
  }),

  _findGridEl: function() {
    var id = this.get('gridElementId');
    return (id && document.getElementById(id)) || findGridEl();
  },

  // True when any button on the board opens a folder (load_board). Drives the
  // grid's --has-folders class so the folder-tab top reserve — which pushes every
  // card down to make room for the tabs AND keep rows aligned — applies ONLY when
  // folders are actually present. Folder-less boards keep full-height buttons with
  // no dead top space. orderedButtons is a 2D array (rows of buttons).
  hasFolders: computed('orderedButtons', function() {
    var rows = this.get('orderedButtons') || [];
    for(var i = 0; i < rows.length; i++) {
      var row = rows[i] || [];
      for(var j = 0; j < row.length; j++) {
        if(row[j] && get(row[j], 'load_board')) { return true; }
      }
    }
    return false;
  }),

  /*
   * Fitzgerald category grouping.
   *
   *   1. the feature flag must be on for this user;
   *   2. the preference must not be switched off;
   *   3. edit mode must be OFF -- editing depends on a cell's grid position for
   *      drag, swap and paint, and a regrouped board no longer has those
   *      positions. Editing always shows the true underlying layout.
   *
   * PRE-PRODUCTION on (2): a MISSING preference counts as ON, so the grouped
   * board is visible without a console while the design is being evaluated. This
   * is needed as well as the Rails default because `generate_defaults` only
   * backfills on the user's next save, so existing users read `undefined` until
   * then -- a strict `=== true` here would leave them ungrouped no matter what
   * the Rails default says.
   *
   * BEFORE PRODUCTION: restore the strict test --
   *     return this.get('...board_category_grouping.enabled') === true;
   * so grouping is opt-in. It MOVES vocabulary out of cells a user has built
   * positional motor memory on, which is a clinical change, not a cosmetic one.
   * Flip together with the PRE-PRODUCTION markers in lib/feature_flags.rb and
   * app/models/user.rb (preference_defaults).
   */
  groupingEnabled: computed(
    'app_state.feature_flags.board_category_grouping',
    /* referenced_user, NOT currentUser: the setting belongs to whoever the board is
       FOR. When a supervisor models or speaks as a communicator, referenced_user is
       that communicator (app-state.js:3743 — currentUser except when modeling, where it
       resolves to referenced_speak_mode_user); on the supervisor's own board it is the
       supervisor. currentUser alone gets speak-as right but misses the modeling case.
       Same primitive board-detail already uses for word_suggestions. */
    'app_state.referenced_user.preferences.board_category_grouping.enabled',
    'editMode',
    'forceGrouping',
    function() {
      // `forceGrouping` is the category-order PREVIEW opting in explicitly. It
      // bypasses the edit-mode block below because that block exists to protect
      // drag/swap/paint on the REAL board, and the preview is a separate,
      // non-editable rendering — there is nothing there to drag out of position.
      // It does not bypass the feature flag.
      if(!this.get('app_state.feature_flags.board_category_grouping')) { return false; }
      if(this.get('forceGrouping')) { return true; }
      if(this.get('editMode')) { return false; }
      /* `=== true`, NOT `!== false`. The permissive form treated an ABSENT preference as
         ON, so every user who had never opted in got their board regrouped the moment
         the feature flag was enabled — and it could not distinguish "chose it" from
         "was backfilled by generate_defaults". Absence now means off. */
      return this.get('app_state.referenced_user.preferences.board_category_grouping.enabled') === true;
    }
  ),

  categoryOrder: computed('app_state.referenced_user.preferences.board_category_grouping.order', function() {
    return normalize_order(this.get('app_state.referenced_user.preferences.board_category_grouping.order'));
  }),

  /*
   * Panels, in the user's order, built from the SAME `orderedButtons` the
   * ungrouped grid renders -- grouping is a re-presentation of the existing
   * array, never a second source of buttons. Empty categories are omitted.
   */
  categoryGroups: computed('orderedButtons', 'categoryOrder', 'groupingEnabled', function() {
    if(!this.get('groupingEnabled')) { return []; }
    var groups = group_buttons(this.get('orderedButtons') || [], this.get('categoryOrder')) || [];
    /* `each_key` is the {{#each}} key for the group loop — see the note on renderGroups.
       Category keys are already unique within a board (they come from normalize_order),
       so prefixing is only to keep them in one namespace with the ungrouped rows. */
    groups.forEach(function(g) { if(g) { g.each_key = 'cat-' + g.key; } });
    return groups;
  }),

  /*
   * ONE shape for both modes, so the ~200-line cell block in the template is
   * written once rather than duplicated into a grouped branch.
   *
   * Ungrouped (today's default) yields one pseudo-group per ROW with a null key
   * and no label; its wrapper is `display: contents` in CSS, so it generates no
   * box and the existing grid lays out exactly as it does now. Grouped yields the
   * real category panels. Nothing about the ungrouped path changes.
   */
  renderGroups: computed('groupingEnabled', 'categoryGroups', 'orderedButtons', function() {
    if(this.get('groupingEnabled')) { return this.get('categoryGroups'); }
    return (this.get('orderedButtons') || []).map(function(row, idx) {
      /* `each_key`: a STABLE identity for the {{#each}} in the template.
         This computed rebuilds its group objects from scratch on every recompute, so
         with the default `@identity` key Ember saw brand-new objects every time and
         destroyed + rebuilt every group — and with them every button cell, every symbol
         <img> and every label fit. Reordering categories with the arrows therefore cost
         a FULL grid rebuild: measured at 42.6s of blocked main thread on an 84-button
         board at 6x CPU throttle, for an operation that only changes the ORDER.
         Keyed, Ember moves the existing DOM instead.
         `key` stays null for the ungrouped rows because the template uses it to decide
         the group class/role/aria — the each-key had to be a separate field. */
      return { key: null, each_key: 'row-' + idx, label: null, buttons: row || [] };
    });
  }),

  /*
   * Bumped by the resize handler ONLY.
   *
   * window.innerWidth is not observable, so something has to invalidate the
   * derived column count. It must never be set during render: columnCount ->
   * renderColumns is READ while rendering, and writing it from the afterRender
   * queue is a backtracking re-render, which Ember treats as unrecoverable and
   * which previously took the whole application down with a blank board.
   */
  viewportTick: 0,

  columnCount: computed('groupingEnabled', 'viewportTick', function() {
    if(!this.get('groupingEnabled')) { return 1; }
    // Thresholds mirror the @media rules for the grouped grid; both are driven
    // off the same numbers so the JS split and the CSS track count agree.
    var w = (typeof window !== 'undefined' && window.innerWidth) || 1400;
    if(w <= 700) { return 1; }
    if(w <= 1100) { return 2; }
    return 3;
  }),

  /*
   * Panels split into explicit stacking columns.
   *
   * Explicit rather than CSS multi-column because multi-column never exposes
   * which panels landed in which column, so no panel can be told to stretch and
   * the bottom edge stays ragged. With real columns the last panel in each can
   * fill the remainder (CSS below), giving an even bottom WITHOUT padding
   * categories out with empty cells -- a blank slot inside a bordered group reads
   * as a broken button to an AAC user.
   *
   * Ungrouped returns a single column holding every row-pseudo-group; that
   * wrapper is `display: contents` in CSS, so the existing grid is untouched.
   */
  renderColumns: computed('renderGroups', 'groupingEnabled', 'columnCount', function() {
    var groups = this.get('renderGroups') || [];
    if(!this.get('groupingEnabled')) { return [groups]; }
    return assign_columns(groups, this.get('columnCount'), GROUP_INNER_COLUMNS);
  }),

  init: function() {
    this._super(...arguments);
    var _this = this;
    this.selfActionNoBubble = function(attrName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        var action = _this.get(attrName);
        if (action) { action.apply(null, bound); }
      };
    };
    // Parent-passed closures (selectButton, closeColorPicker, …) are only
    // reliable via this.get() in classic components — bare this.selectButton
    // in templates is undefined under Ember 5. Speak-mode mouse clicks use
    // these {{on}} handlers; touch/dwell/keyboard still use raw_events buttonSelect.
    this.invokeAttr = function(attrName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var action = _this.get(attrName);
        if (action) {
          action.apply(null, bound.concat(Array.prototype.slice.call(arguments)));
        }
      };
    };
    this.invokeAttr0 = function(attrName) {
      return function() {
        var action = _this.get(attrName);
        if (action) { action.apply(null, arguments); }
      };
    };
    this._on_resize = function() {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      // Safe HERE and only here: a resize is an external event outside the render
      // pass, so re-deriving columnCount cannot backtrack a value render already
      // consumed. Crossing 1100px/700px changes the column split.
      _this.set('viewportTick', (_this.get('viewportTick') || 0) + 1);
      _this._schedule_fit('resize');
    };
    window.addEventListener('resize', this._on_resize);
  },

  willDestroyElement: function() {
    if(this._on_resize) {
      window.removeEventListener('resize', this._on_resize);
      this._on_resize = null;
    }
    if(this._resize_pending) {
      cancel(this._resize_pending);
      this._resize_pending = null;
    }
    this._super(...arguments);
  },

  didRender: function() {
    this._super(...arguments);
    // Re-fit on every render — covers initial mount, route re-entry,
    // ordered_buttons changes, and toggle flips. scheduleOnce keeps
    // multiple same-render triggers from compounding.
    scheduleOnce('afterRender', this, '_run_label_fit');
    // Publish the folder-tab cell metrics SYNCHRONOUSLY here (afterRender runs
    // before the browser paints) so --bd-cell-min is in place on the FIRST frame.
    // The controller also publishes it, but only on a ~160-300ms debounce, so
    // without this the first paint uses the 90px fallback and folder tabs render
    // short until the measurement settles. This closes that initial-value gap.
    scheduleOnce('afterRender', this, '_publish_cell_metrics');
  },

  // Measure the first rendered board cell and publish its size as CSS vars on the
  // grid so the folder-tab geometry (tab height + row reserve, which key off
  // --bd-cell-min) is correct from the first paint — no settle-in flash. Mirrors
  // the same vars the controller's _sync_prediction_tile_size publishes; both
  // writing the same value is harmless (idempotent). getBoundingClientRect forces
  // one layout read, but it's a single cell and runs at most once per render tick.
  _publish_cell_metrics: function() {
    if(this.isDestroyed || this.isDestroying) { return; }
    var gridEl = this._findGridEl();
    if(!gridEl) { return; }
    var cell = gridEl.querySelector('.md-board-detail-grid__cell:not(.md-board-detail-grid__cell--empty)');
    if(!cell) { return; }
    var r = cell.getBoundingClientRect();
    if(r && r.height >= 1 && r.width >= 1) {
      gridEl.style.setProperty('--bd-cell-h', Math.round(r.height) + 'px');
      gridEl.style.setProperty('--bd-cell-min', Math.round(Math.min(r.width, r.height)) + 'px');
    }
  },

  _schedule_fit: function(source) {
    this._resize_pending = debounce(this, '_run_label_fit', source, RESIZE_DEBOUNCE_MS);
  },

  // Per-label shrink-to-fit (utils/label_fit.js): labels that would overflow at
  // the user's chosen size are reduced individually; labels that already fit
  // stay at the chosen size. Shrink-only — never grows text past preference.
  _run_label_fit: function() {
    if(this.isDestroyed || this.isDestroying) { return; }
    var gridEl = this._findGridEl();
    if(!gridEl) { return; }
    labelFit.apply(gridEl);
  },

  actions: {
    select_button(button) {
      var action = this.get('selectButton');
      if(action) { action(button); }
    },

    select_button_key(button, event) {
      var action = this.get('selectButtonKey');
      if(action) { action(button, event); }
    },

    close_color_picker() {
      var action = this.get('closeColorPicker');
      if(action) { action(); }
    },

    apply_swatch_color(swatch) {
      var action = this.get('applySwatchColor');
      if(action) { action(swatch); }
    },

    toggle_minicolors() {
      var action = this.get('toggleMinicolors');
      if(action) { action(); }
    },

    apply_custom_color() {
      var action = this.get('applyCustomColor');
      if(action) { action(); }
    },

    button_event() {
      /* Forward ALL args from button-listener — not just the first two.
         button-listener fires `rearrangeButtons` with (action, dragId,
         dropId) and `buttonSelect` with (action, id, event). The
         previous 2-arg signature truncated the 3rd arg, so dropId
         (and the event) were silently dropped. With dropId undefined,
         editManager.switch_buttons logged "couldn't find a button!"
         and returned without committing — the drag visual reverted on
         release. See docs/task-management/2026-05-26-board-detail-drag-drop-revert.md. */
      var action = this.get('buttonEvent');
      if(action) { action.apply(null, arguments); }
    }
  }
});
