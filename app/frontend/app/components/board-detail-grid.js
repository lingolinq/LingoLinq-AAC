import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed, get } from '@ember/object';
import { guidFor } from '@ember/object/internals';
import { scheduleOnce, debounce, cancel } from '@ember/runloop';
import labelFit from '../utils/label_fit';
import { group_buttons, normalize_order, assign_columns, compact_order, pack_category_tiles, GROUP_INNER_COLUMNS } from '../utils/board_categories';

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
   *   3. (WAS: edit mode must be OFF.) The edit page now groups too — see the note on
   *      the removed guard below.
   *
   * On (2) the test is STRICT (`=== true`), so an absent preference means OFF and
   * grouping is opt-in. That is already the case below -- see the note on the return.
   * This paragraph previously described the opposite ("a MISSING preference counts as
   * ON") and told the reader to "restore the strict test BEFORE PRODUCTION"; the code
   * had since been made strict and the comment was not updated, so following it would
   * have re-introduced the exact bug the strict test exists to prevent: every user who
   * never opted in getting their board regrouped the moment the flag went on.
   *
   * STILL OUTSTANDING (not this file): `board_category_grouping` is force-enabled for
   * everyone in `lib/feature_flags.rb:113` and must return to AVAILABLE-only (beta
   * opt-in per user) before production go-live. Grouping MOVES vocabulary out of cells
   * a user has built positional motor memory on -- a clinical change, not a cosmetic
   * one -- so the opt-in default matters more here than for a cosmetic flag. Check the
   * matching marker in `app/models/user.rb` (preference_defaults) at the same time.
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
    /* The per-board resolution (controller#board_category_settings). Passed in rather than
       re-derived here: the controller knows which board this is, and two places resolving
       the same setting is how the switch ends up describing a board the grid is not
       drawing. */
    'categoryEnabled',
    'editMode',
    'forceGrouping',
    /* Without this key the guard below would not re-evaluate when the user NAVIGATES
       from a vocabulary board onto a keyboard — the computed would still be holding the
       previous board's answer and the keyboard would render regrouped once. */
    'isKeyboardBoard',
    function() {
      // `forceGrouping` is the category-order PREVIEW opting in explicitly. It
      // bypasses the edit-mode block below because that block exists to protect
      // drag/swap/paint on the REAL board, and the preview is a separate,
      // non-editable rendering — there is nothing there to drag out of position.
      // It does not bypass the feature flag.
      if(!this.get('app_state.feature_flags.board_category_grouping')) { return false; }
      /* A KEYBOARD board is never regrouped — not even by the Categorize preview.
         Its layout is SPATIAL, not vocabulary: the letters are placed in QWERTY order
         and a speller navigates them by position, the same way anyone touch-types.
         Categorising it sorts those keys into part-of-speech panels — the real
         vocal-flair-84-keyboard carries `numeral`, `verb` and `conjunction` buttons and
         three different colours across 66 keys, so grouping scatters the row structure
         and QWERTY is gone. Checked BEFORE forceGrouping so the preview cannot show a
         regrouped keyboard either. */
      if(this.get('isKeyboardBoard')) { return false; }
      if(this.get('forceGrouping')) { return true; }
      /* Edit mode used to bail here, so the edit page always showed the authored grid
         while the communicator saw a regrouped one — two different boards, and no way to
         see the shipped layout without leaving edit mode. It groups now: what the editor
         works on is what the user gets.
         Two consequences, both deliberate and neither silent:
           - EMPTY cells are not rendered while grouped (`group_buttons` skips them), so
             the "click an empty slot to add a button" affordance is unavailable until
             Categorize is switched off. The order and colour of the real buttons is what
             the grouped view is for.
           - DRAG to rearrange is turned off while grouped (see `editDraggable`): a drop
             target's position is derived by the packer, not authored, so a swap would
             land the button somewhere other than where it was dropped. */
      /* `=== true`, NOT `!== false`. The permissive form treated an ABSENT preference as
         ON, so every user who had never opted in got their board regrouped the moment
         the feature flag was enabled — and it could not distinguish "chose it" from
         "was backfilled by generate_defaults". Absence now means off. */
      /* Prefer the resolved per-board value when the caller supplies one; fall back to the
         raw user default so a caller that does not pass it still behaves as before. */
      var resolved = this.get('categoryEnabled');
      if(resolved !== undefined && resolved !== null) { return resolved === true; }
      return this.get('app_state.referenced_user.preferences.board_category_grouping.enabled') === true;
    }
  ),

  /* Drag-to-rearrange is an EDIT-mode affordance that depends on a cell's position being
     the authored one. While grouping is on, position is derived by pack_category_tiles,
     so a button dropped on a neighbour would be swapped in the underlying grid and then
     immediately re-placed somewhere else by the regroup — the gesture would appear to do
     something arbitrary. Off while grouped; switch Categorize off to rearrange. */
  editDraggable: computed('editMode', 'groupingEnabled', function() {
    return !!this.get('editMode') && !this.get('groupingEnabled');
  }),

  /* True when THIS board is a keyboard. Same key-suffix convention the rest of the app
     uses for these boards (models/board.js VARIANT_ROOT_SUFFIXES, board_hierarchy.js
     `key.match(/keyboard$/)`) and the same test category_for_button applies to a folder
     that OPENS one — one rule, two callers, rather than two drifting definitions. */
  isKeyboardBoard: computed('board.key', function() {
    var key = this.get('board.key');
    return typeof key === 'string' && /(^|[-_/])keyboard$/i.test(key);
  }),

  /* COMPACT mode: grouping ON, scrolling OFF.
     Drops the panel CHROME — headers, panel padding, the gap between panels, the
     per-panel column tracks — and tiles the categories onto the board's OWN grid, one
     rectangle each (pack_category_tiles). The rectangle is what lets the category be
     ringed as a whole; each tile then re-creates exactly its own w x h board cells, so
     the buttons stay the size they are on the ungrouped board.
     That is what lets a grouped board fit on one page: the panel chrome, not the
     buttons, is what pushed it past the fold.
     Scrolling ON keeps the panel layout, which is the richer presentation when there is
     room to scroll. */
  compactCategories: computed('groupingEnabled', function() {
    return !!this.get('groupingEnabled');
  }),

  /* Grouping ON with scrolling ALLOWED. Same tiling as above — one rectangle per
     category, same rings, same packing — the scroll preference no longer picks a
     different LAYOUT, only whether that layout may exceed the viewport.
     With scrolling off the rows share a definite height, so a board that needs more rows
     gets shorter buttons and always fits. With it on the rows hold a floor instead and
     the grid scrolls past the fold, which is the trade a user who CAN scroll may prefer:
     full-size buttons over seeing everything at once. */
  compactScroll: computed('groupingEnabled', 'categoryScrollEnabled', function() {
    return !!this.get('groupingEnabled') && !!this.get('categoryScrollEnabled');
  }),

  /* Panel layout is the grouped-with-scrolling case only. The template keys the
     `--grouped` class off this so compact mode inherits the ungrouped grid geometry
     instead of the panel geometry. */
  /* The multi-column PANEL presentation — glass trays, headers, `assign_columns` packing.
     Now unreachable: both scroll settings render the tiling above, because the two were
     never meant to be different arrangements of the board, only different answers to
     "may this scroll". Left in place (with its CSS and `assign_columns`) rather than
     deleted — it is a complete, working presentation and removing it is a product
     decision, not a styling one. Flip this back to
     `groupingEnabled && !compactCategories` to restore it. */
  panelLayout: computed(function() {
    return false;
  }),

  /* Same rule as `categoryEnabled` above: the controller resolves this per-board and
     passes it in, because it is the thing that knows which board this is. Re-deriving it
     here from the account-wide default is what made a per-board `order` render as the
     account default while the Categorize panel displayed the per-board one — the value
     was stored correctly and silently never applied.
     The fallback keeps a caller that passes nothing behaving exactly as before, the same
     shape `groupingEnabled` uses. */
  effectiveCategoryOrder: computed('categoryOrder', function() {
    /* The fallback is the REGISTRY DEFAULT, not a user preference: category order describes
       the board, and `board_category_grouping` is now three account-wide flags with no
       `order` key at all (user.rb#sanitize_board_category_grouping! drops one if sent).
       Reading it here would be reading a key nothing writes. */
    return normalize_order(this.get('categoryOrder'));
  }),

  /*
   * Panels, in the user's order, built from the SAME `orderedButtons` the
   * ungrouped grid renders -- grouping is a re-presentation of the existing
   * array, never a second source of buttons. Empty categories are omitted.
   */
  categoryGroups: computed('orderedButtons', 'effectiveCategoryOrder', 'categoryButtonOverrides', 'groupingEnabled', function() {
    if(!this.get('groupingEnabled')) { return []; }
    var groups = group_buttons(
      this.get('orderedButtons') || [],
      this.get('effectiveCategoryOrder'),
      this.get('categoryButtonOverrides')
    ) || [];
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
  renderGroups: computed('groupingEnabled', 'categoryGroups', 'orderedButtons', 'compactCategories', function() {
    if(this.get('groupingEnabled')) {
      var groups = this.get('categoryGroups');
      /* Compact mode has no panels, so the ORDER carries all the grouping information —
         see compact_order: yellow, green, blue, then largest-first, keyboard last. */
      return this.get('compactCategories') ? compact_order(groups) : groups;
    }
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
    /* Fourth column on large boards — panels are 3-across, so four fit where three
       4-across columns used to. Keep in step with the @media (min-width: 1400px) rule
       for `.md-board-detail-grid--grouped`: this decides how many columns are PACKED,
       the CSS decides how many tracks exist to hold them, and a mismatch either strands
       a column or leaves an empty track. */
    if(w >= 1400) { return 4; }
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
  /* The keyboard panel, pulled OUT of the column packing.
     It spans the full board width and sits at the bottom, so it cannot live inside a
     column — a panel nested in one column track has no way to span the others. Its keys
     are placed explicitly by kb_row/kb_col (utils/board_categories.js#qwerty_positions),
     which is what keeps q..p / a..l / z..m on their own rows instead of reflowing into
     the panel's normal columns. */
  keyboardGroup: computed('renderGroups', 'groupingEnabled', function() {
    if(!this.get('groupingEnabled')) { return null; }
    return (this.get('renderGroups') || []).find(function(g) { return g && g.is_keyboard; }) || null;
  }),

  /* The keyboard PANEL is a panel-mode construct: a full-width group below the columns.
     Compact mode has no panels — the keyboard is a tile like any other category, placed
     bottom-right by the packer — so the `--has-keyboard-panel` class (and the column
     spanning it drives) must not follow it there. */
  keyboardPanel: computed('panelLayout', 'keyboardGroup', function() {
    return !!(this.get('panelLayout') && this.get('keyboardGroup'));
  }),

  /* The board's OWN column count — the same number the controller publishes as
     `--board-columns` (user/board-detail.js#current_grid), read from the same place.
     The compact packer tiles onto that grid, so the two MUST agree: a packer that
     believed the board were wider would place tiles into columns the CSS never
     created. Row 0 defines the width (ordered_buttons is rectangular); the max is a
     fallback for a ragged array rather than a second opinion. */
  boardColumns: computed('orderedButtons', function() {
    var rows = this.get('orderedButtons') || [];
    var first = (rows[0] || []).length;
    if(first) { return first; }
    var max = 0;
    rows.forEach(function(r) { if(r && r.length > max) { max = r.length; } });
    return max || 1;
  }),

  /* Compact tiling. Stamps each group's rectangle ON the group (same object the
     template iterates) so the ~200-line cell block stays written once, and reports the
     total row count the grid has to be told about — see compactRows. */
  /* `compactScroll` is a dependent key because the packer now reads it: with scrolling
     allowed the board may spend a row, and a one-column category is re-laid as a row of
     its own (board_categories.js#lift_column_tiles). Toggling the scrolling preference
     therefore has to re-pack, not just re-style. */
  compactTiles: computed('renderGroups', 'compactCategories', 'boardColumns', 'compactScroll', function() {
    if(!this.get('compactCategories')) { return { groups: [], rows: 0 }; }
    var scrolling = !!this.get('compactScroll');
    var packed = pack_category_tiles(this.get('renderGroups') || [], this.get('boardColumns'),
      { scrolling: scrolling });
    /* Which groups are laid out by a flex BAND rather than placed on the grid. Only the
       scrolling variant uses bands (see the band rule in app.scss), and only for the
       vocabulary shelf — the keyboard and its notch are two-dimensional and stay placed.
       A band tile must NOT carry a grid-column/grid-row of its own: it is a flex item, and
       a stale placement on it would fight the band it sits in. */
    var banded = null;
    if(scrolling && (packed.bands || []).length) {
      banded = new Set();
      packed.bands.forEach(function(b) {
        (b.groups || []).forEach(function(g) { banded.add(g); });
      });
    }
    /* The keyboard and its notch, laid out on a track list of the region's OWN rather than
       on the board's equal columns — that is what lets their buttons match the bands'
       instead of being capped by the narrowest tile in the region (board_categories.js, the
       `region` comment). Their placement is region-LOCAL, so it replaces the board-level
       one rather than sitting alongside it. */
    var region = (scrolling && packed.region) ? packed.region : null;
    var placed_in_region = null;
    if(region) {
      placed_in_region = new Map();
      region.tiles.forEach(function(t) {
        placed_in_region.set(t.group,
          'grid-column:' + t.col + '/span ' + t.w + ';grid-row:' + t.row + '/span ' + t.h + ';');
      });
    }
    var groups = (packed.tiles || []).map(function(t) {
      /* Stamped as a STRING rather than as a {col,row,w,h} the template unpacks: the
         group style is already one `concat`, and four more nested `if`s in it would be
         unreadable. Only compact stamps this, so a panel group can never carry a stale
         placement.
         SPAN (w/h) and inner TRACKS (iw/ih) are separate values, equal for every tile
         except a keyboard on a board narrower than a QWERTY row — there the tile spans
         what the board has while its inner grid keeps all ten key columns. */
      var placement;
      if(banded && banded.has(t.group)) { placement = ''; }
      else if(placed_in_region && placed_in_region.has(t.group)) { placement = placed_in_region.get(t.group); }
      else { placement = 'grid-column:' + t.col + '/span ' + t.w + ';grid-row:' + t.row + '/span ' + t.h + ';'; }
      t.group.tile_style = placement +
                           '--bd-tile-columns:' + t.iw +
                           ';--bd-tile-rows:' + t.ih;
      return t.group;
    });

    /*
     * The template's outer loop renders one `__column` per entry here. Ungrouped and panel
     * mode hand it plain arrays of groups; compact hands it the same, EXCEPT in the
     * scrolling variant, where each entry is one band — or, last, the keyboard region —
     * and carries the placement for that element itself.
     *
     * The extra fields ride ON the array rather than wrapping it in `{groups, style}`,
     * so the template's inner `{{#each column as |group|}}` is untouched and neither
     * ungrouped nor panel mode has to know bands exist. A column with neither `is_band`
     * nor `is_region` renders exactly as it always has.
     */
    var columns = [groups];
    if(banded || region) {
      columns = (banded ? packed.bands : []).map(function(b) {
        var arr = (b.groups || []).slice();
        arr.is_band = true;
        arr.band_style = 'grid-column:1/-1;grid-row:' + b.row + '/span ' + b.h;
        return arr;
      });
      if(region) {
        var rest = region.tiles.map(function(t) { return t.group; });
        rest.is_region = true;
        /* `grid-template-columns` is stamped here rather than written in the stylesheet
           because `repeat()` needs a LITERAL count — `repeat(var(--n), …)` is fine but
           `repeat(0, …)` is invalid, and a board too narrow for a QWERTY row has no notch
           at all. A different track list, not a different number. The two counts ride
           along as custom properties because `--bd-region-btn-w` solves for them. */
        rest.band_style = 'grid-column:1/-1;grid-row:' + region.row + '/span ' + region.rows +
                          ';--bd-region-notch-cols:' + region.notch_cols +
                          ';--bd-region-kb-cols:' + region.kb_cols +
                          ';grid-template-columns:' +
                          (region.notch_cols
                            ? 'repeat(' + region.notch_cols + ',var(--bd-region-notch-track)) '
                            : '') +
                          'minmax(0,1fr)';
        columns.push(rest);
      }
    }
    return { groups: groups, rows: packed.rows, columns: columns };
  }),

  /* Published into the grid's style attribute as `--bd-compact-rows`. The base grid's
     rows come from `--board-rows`, which the controller sets INLINE from the board's
     authored row count — a stylesheet cannot override an inline custom property, so the
     compact rule reads a var of its own and falls back to --board-rows. A tiling needs
     more rows than the board authored (rectangles waste what a free flow does not);
     rows are `minmax(0, 1fr)` under a definite height, so that costs button height and
     never scrolling. */
  compactRows: computed('compactTiles.rows', function() {
    return this.get('compactTiles.rows') || 0;
  }),

  renderColumns: computed('renderGroups', 'groupingEnabled', 'columnCount', 'keyboardGroup', 'compactCategories', 'compactTiles.columns', function() {
    var groups = this.get('renderGroups') || [];
    if(!this.get('groupingEnabled')) { return [groups]; }
    /* Compact: ONE pseudo-column holding every tile, in reading order. The column
       wrapper stays `display: contents` so the tiles are direct items of the board
       grid, which is what lets them be placed on it. */
    if(this.get('compactCategories')) { return this.get('compactTiles.columns') || [[]]; }
    /* Packed WITHOUT the keyboard: it is rendered separately below the columns, so
       including it here would reserve column height for a panel that is not there and
       leave a matching hole. */
    var kb = this.get('keyboardGroup');
    if(kb) { groups = groups.filter(function(g) { return g !== kb; }); }
    var cols = assign_columns(groups, this.get('columnCount'), GROUP_INNER_COLUMNS);
    /* The keyboard rides along as a final, single-group COLUMN rather than as a separate
       branch in the template: that reuses the one ~200-line cell block instead of
       duplicating it. CSS spans this last column across every track
       (`--has-keyboard-panel .__column:last-child`). */
    if(kb) { cols = cols.concat([[kb]]); }
    return cols;
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
