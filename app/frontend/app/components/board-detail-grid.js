import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed, get } from '@ember/object';
import { scheduleOnce, debounce, cancel } from '@ember/runloop';
import labelFit from '../utils/label_fit';
import { group_buttons, normalize_order } from '../utils/board_categories';

// Throttle window resize re-fits to ~250ms. Resizing fires many events
// per drag; we only need the last one's measurement.
var RESIZE_DEBOUNCE_MS = 250;

// Look up the rendered grid root by scoping inside the board-detail
// content area. The board-detail page has one grid at a time, but
// hard-coding document.querySelector('.md-board-detail-grid') would
// break if the legacy /board/:key view ever co-mounted; scoping to
// the board-detail shell keeps us isolated.
function findGridEl() {
  return document.querySelector('.md-board-detail-main .md-board-detail-grid') ||
         document.querySelector('.md-board-detail-grid');
}

export default Component.extend({
  tagName: '',
  app_state: service('app-state'),

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
    'app_state.currentUser.preferences.board_category_grouping.enabled',
    'editMode',
    function() {
      if(this.get('editMode')) { return false; }
      if(!this.get('app_state.feature_flags.board_category_grouping')) { return false; }
      return this.get('app_state.currentUser.preferences.board_category_grouping.enabled') !== false;
    }
  ),

  categoryOrder: computed('app_state.currentUser.preferences.board_category_grouping.order', function() {
    return normalize_order(this.get('app_state.currentUser.preferences.board_category_grouping.order'));
  }),

  /*
   * Panels, in the user's order, built from the SAME `orderedButtons` the
   * ungrouped grid renders -- grouping is a re-presentation of the existing
   * array, never a second source of buttons. Empty categories are omitted.
   */
  categoryGroups: computed('orderedButtons', 'categoryOrder', 'groupingEnabled', function() {
    if(!this.get('groupingEnabled')) { return []; }
    return group_buttons(this.get('orderedButtons') || [], this.get('categoryOrder'));
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
    return (this.get('orderedButtons') || []).map(function(row) {
      return { key: null, label: null, buttons: row || [] };
    });
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
    var gridEl = findGridEl();
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
    var gridEl = findGridEl();
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
