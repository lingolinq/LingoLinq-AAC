import Controller from '@ember/controller';
import { getOwner } from '@ember/application';
import { computed } from '@ember/object';
import { observer } from '@ember/object';
import { set as emberSet, get as emberGet } from '@ember/object';
import { inject as service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import RSVP from 'rsvp';
import { later as runLater, cancel as runCancel, next, scheduleOnce } from '@ember/runloop';
import $ from 'jquery';
import i18n from '../../utils/i18n';
import persistence from '../../utils/persistence';
import modal from '../../utils/modal';
import { check_for_share_approval as runShareApprovalCheck } from '../../utils/share_approval';
import paint_view_switch_overlay from '../../utils/view_switch_overlay';
import { sync_current_board_state as runBoardStateSync } from '../../utils/board_state_sync';
import { reload_on_connect as runReloadOnConnect } from '../../utils/reload_on_connect';
import { bg_class as computeBgClass, bg_style as computeBgStyle, bg_img_style as computeBgImgStyle } from '../../utils/board_background';
import {
  DEFAULT_CATEGORY_ORDER,
  normalize_order as normalizeCategoryOrder,
  category_for_key as categoryForKey,
  label_for as categoryLabel,
  swatch_for_category as swatchForCategory
} from '../../utils/board_categories';
import speecher from '../../utils/speecher';
import utterance from '../../utils/utterance';
import editManager from '../../utils/edit_manager';
import Button from '../../utils/button';
import contentGrabbers from '../../utils/content_grabbers';
import boundClasses from '../../utils/bound_classes';
import actionLock from '../../utils/action-lock';
import aiPredictor from '../../utils/ai_word_predictor';
import wordSuggestionsModule from '../../utils/word_suggestions';
import { buttonSpacingPx, buttonBorderPx, buttonTextPx } from '../../utils/display_prefs';
import boardDetailCache from '../../utils/board_detail_cache';
import { pick_aac_color, resolve_labels_pos } from '../../utils/parts_of_speech';
import prefClasses from '../../mixins/pref-classes';
import LingoLinq from '../../app';
import buildEventAction from '../../utils/event_action';

// Catalog of speak-mode options-menu entries the user can show/hide
// via the "Customize Menu" preference (right panel → Board Settings).
// `id` is what gets stored in user.preferences.speak_mode_hidden_menu_items;
// `label_key` / `default_label` mirror the i18n call on the actual menu
// row so the customize list reads identically to what the user sees in
// the speak-mode menu. `section` groups rows under a section header in
// the customize panel — null means top-level (no group label).
// NOTE: "Edit Board" is intentionally NOT in this catalog — its
// visibility is gated by the PIN-assignment preference (see the
// Preferences page), so exposing it here would split the control
// across two places. Every other row on the speak-mode options
// menu is listed below and can be toggled from the right panel's
// Customize Menu section.
const SPEAK_MENU_ITEMS = [
  /* `board_collection` replaces the prior `my_boards` + `find_boards`
     rows. It opens an inline panel (rendered by the BoardCollection
     component) inside the same options menu surface, listing the
     user's owned/shared boards plus public boards grouped by brand
     family. The two legacy ids may still appear in some users'
     `preferences.speak_mode_hidden_menu_items` arrays; that's
     harmless — the values are simply no longer referenced. */
  { id: 'board_collection',     section: 'board',     label_key: 'my_board_collection', default_label: 'My Board Collection' },
  /* Restored to view mode in 3812ce5b6 and listed here because the customize
     panel is built from THIS list — a row rendered in the options menu but absent
     here is one the user cannot hide, which is how these shipped at first.

     `set_as_home` is the only one left. The other four — board_details,
     toggle_favorite, add_to_sidebar, other_board_actions — were added alongside it
     in a "Board Actions" submenu (72dabfe93) and that submenu has been removed
     again; they are edit-panel actions and belong there. Their ids are dropped
     rather than kept: an id listed here with nothing rendering it is a Customize
     Menu row that toggles the visibility of nothing. A user who had already hidden
     one keeps the value in `preferences.speak_mode_hidden_menu_items`, which is
     harmless in the same way the legacy `my_boards` / `find_boards` ids above are. */
  { id: 'set_as_home',          section: 'board',     label_key: 'set_as_home_board', default_label: 'Set as Home Board' },
  { id: 'find_button',          section: 'buttons',   label_key: 'find_a_button', default_label: 'Find a Button' },
  { id: 'focus_words',          section: 'buttons',   label_key: 'focus_words', default_label: 'Focus Words' },
  { id: 'show_hidden_buttons',  section: 'buttons',   label_key: 'show_all_buttons', default_label: 'Show Hidden Buttons' },
  { id: 'light_dark_mode',      section: 'display',   label_key: 'light_dark_mode', default_label: 'Light/Dark Mode' },
  { id: 'copy',                 section: 'share',     label_key: 'copy', default_label: 'Copy' },
  { id: 'download',             section: 'share',     label_key: 'download', default_label: 'Download' },
  { id: 'print',                section: 'share',     label_key: 'print', default_label: 'Print' },
  { id: 'share',                section: 'share',     label_key: 'share', default_label: 'Share' },
  { id: 'button_levels',        section: 'session',   label_key: 'button_levels', default_label: 'Button Levels' },
  // Board lock. Listed so it can be hidden/shown from the customize-menu UI like
  // every other item; the control itself is rendered in board-detail.hbs and must
  // stay reachable because this page ENFORCES sticky_board on navigation.
  { id: 'sticky_board',         section: 'session',   label_key: 'stay_on_board', default_label: 'Stay on this Board' },
  { id: 'pause_logging',        section: 'session',   label_key: 'pause_logging', default_label: 'Pause Logging' },
  { id: 'modeling',             section: 'session',   label_key: 'board_detail_model_for_communicator', default_label: 'Model for Communicator' },
  { id: 'switch_communicators', section: 'session',   label_key: 'switch_communicators', default_label: 'Switch Communicators' }
];

const SPEAK_MENU_SECTIONS = [
  { id: 'board',    label_key: 'board', default_label: 'Board' },
  { id: 'buttons',  label_key: 'buttons', default_label: 'Buttons' },
  { id: 'display',  label_key: 'display', default_label: 'Display' },
  { id: 'share',    label_key: 'share_and_print', default_label: 'Share & Print' },
  { id: 'session',  label_key: 'session', default_label: 'Session' }
];

// Static i18n declarations for SPEAK_MENU_ITEMS / SPEAK_MENU_SECTIONS.
// The Customize Menu template renders via dynamic
// `{{t default_label key=label_key}}` helpers, which i18n_generator.rb's
// static parser cannot extract (it looks for literal quoted strings,
// not bound properties — see i18n_generator.rb:148-180). This no-op
// function exists ONLY to make every key visible to the extractor;
// it is never called at runtime. When you add a row to SPEAK_MENU_ITEMS
// or SPEAK_MENU_SECTIONS, add a matching i18n.t(...) line here OR the
// new key will silently fail to ship to non-English locales.
// (Scot #4 pre-merge review, distilled to LEARNINGS as a recurring
// codebase pattern — see docs/task-management/LEARNINGS.md.)
// eslint-disable-next-line no-unused-vars
function _customize_menu_i18n_extractor_no_op() {
  // Sections (SPEAK_MENU_SECTIONS)
  i18n.t('board', "Board");
  i18n.t('buttons', "Buttons");
  i18n.t('display', "Display");
  i18n.t('share_and_print', "Share & Print");
  i18n.t('session', "Session");
  // Items (SPEAK_MENU_ITEMS)
  i18n.t('my_board_collection', "My Board Collection");
  i18n.t('set_as_home_board', "Set as Home Board");
  i18n.t('find_a_button', "Find a Button");
  i18n.t('focus_words', "Focus Words");
  i18n.t('show_all_buttons', "Show Hidden Buttons");
  i18n.t('light_dark_mode', "Light/Dark Mode");
  i18n.t('copy', "Copy");
  i18n.t('download', "Download");
  i18n.t('print', "Print");
  i18n.t('share', "Share");
  i18n.t('button_levels', "Button Levels");
  i18n.t('pause_logging', "Pause Logging");
  i18n.t('board_detail_model_for_communicator', "Model for Communicator");
  i18n.t('switch_communicators', "Switch Communicators");
}

export default Controller.extend(prefClasses, {
  app_state: service('app-state'),
  /* Session-wide dismissal of the screen-recommendation overlays, shared with
     create-board-new and the Display Style step so "Continue Anyway" here silences the
     same message everywhere for the session. */
  overlay_dismissals: service('overlay-dismissals'),
  stashes: service('stashes'),
  router: service('router'),
  persistence: service('persistence'),

  is_board_detail: true,
  // folder_display_style is initialized by the route, which resolves the user's
  // saved preference first and falls back to 'default' for legacy users with no
  // stored value (new users get it at registration server-side).
  // When true, folder card faces are painted with the button's Fitzgerald
  // color (var(--btn-bg)) regardless of which folder display style is
  // selected. Toggled via the checkmark item at the bottom of the folder
  // dropdown; persisted on user.preferences.folder_colored_face.
  // Default is `true` — colored folder fronts are now the canonical look.
  // Users who explicitly turn it off get `false` saved; anyone else
  // (new users + existing users who never touched the toggle) inherits
  // the colored style. The route's setupController re-applies this
  // default when the saved preference is absent.
  folder_colored_face: true,
  folder_dropdown_open: false,
  // When true, applies a softer / more tonal style to button borders
  // ON TOP of whatever the user's selected border thickness is —
  // single subtle outer shadow + soft inset highlight + a light halo
  // inside the colored outline edge that mutes its visual contrast.
  // The category color stays as the cue; just reads as a softer
  // accent rather than a heavy dark rim. Default is `true` — soft
  // borders are now the canonical look. Users who explicitly turn
  // them off get `false` saved on user.preferences.soft_borders;
  // anyone else (including new users + existing users who never
  // touched the toggle) inherits the soft style. The route's
  // setupController re-applies this default when the saved
  // preference is absent.
  soft_borders: true,
  // "Hide speak bar" preference — when true the speak row's
  // contents collapse to just the options chevron. Default off.
  // Persisted on user.preferences.hide_speak_bar.
  hide_speak_bar: false,
  // "Customize Menu" preference — array of item ids the user has
  // hidden from the speak-mode options dropdown. Default empty
  // (everything visible). Persisted on
  // user.preferences.speak_mode_hidden_menu_items.
  speak_menu_hidden_items: null,
  boardname: null,
  active_category: 'all',

  board_detail_history: computed('app_state.board_detail_nav_history.[]', function() {
    return this.get('app_state.board_detail_nav_history') || [];
  }),

  /** Speak bar + header back control — only shows when the user has
   *  an actual in-session nav trail to go back through. Previously
   *  it ALSO showed when the board's DB `parent_board_key` was set,
   *  which produced a phantom back button on direct-loaded boards
   *  (the user hadn't navigated FROM the parent; the board just
   *  happened to have parent metadata in the DB). Now strictly:
   *  history present → back available; otherwise hide. go_back
   *  still falls back to parent_board_key as a safety net if it
   *  ever gets fired without history, but the button itself won't
   *  render in that case. */
  /* Category ORDERING — the ordered list with the move arrows, and the Reset order button
     that goes with it — is parked as a future feature: the packing decides placement in
     compact mode and the ordering UI needs its own pass before it earns the space. Kept as
     one named flag rather than commenting the markup out, so bringing it back is a single
     `true` and the template still reads as one arrangement. The stored order itself is
     untouched and still drives the panel layout when scrolling is on. */
  category_ordering_available: false,

  show_board_back_nav: computed('board_detail_history.[]', function() {
    return (this.get('board_detail_history') || []).length > 0;
  }),

  /* "Try this Board" from the board picker sets app_state.board_detail_try_origin.
     While it is set AND names the board actually on screen, board-detail offers a
     prominent way back to the picker.

     Matched on KEY rather than treated as a bare boolean, deliberately: a user who
     tries a board and then navigates deeper (into a folder, or to another board
     entirely) is no longer "trying" the thing they came to try, and a Back button
     that silently returns them to the picker from three boards away would be a
     trap. The marker is cleared outright when they leave board-detail -- see the
     route's resetController. */
  try_origin_board: computed(
    'app_state.board_detail_try_origin',
    'user.user_name',
    'boardname',
    function() {
      var origin = this.get('app_state.board_detail_try_origin');
      if(!origin || !origin.key) { return null; }
      var here = (this.get('user.user_name') || '') + '/' + (this.get('boardname') || '');
      return origin.key === here ? origin : null;
    }
  ),
  show_try_back_nav: computed('try_origin_board', function() {
    return !!this.get('try_origin_board');
  }),
  sentence_parts: null,
  recent_phrases: computed('app_state.board_detail_recent_phrases.[]', function() {
    return this.get('app_state.board_detail_recent_phrases') || [];
  }),
  weekly_goals: null,
  todays_schedule: null,
  show_color_legend: false,
  show_quick_phrases: false,
  show_categories: false,
  /* Edit-panel "Filter by Category" expander state — independent
     of the toolbar's `show_categories` so the two UIs can be open
     simultaneously without fighting; both write to the same
     `active_category` so the underlying grid filter stays in sync. */
  panel_filter_open: false,

  /* Right-panel "Live Preview Edit" — collapsed/expanded state for
     the whole panel + the currently-open accordion section id. */
  right_panel_collapsed: false,
  left_panel_collapsed: false,
  right_panel_open_section: null,
  // When the settings panel COLLAPSES, clear any open section so the collapsed rail
  // doesn't keep an item selected/highlighted. Covers every collapse path (manual
  // toggle, auto-collapse at ≤1200px, resize) in one place. Only acts on collapse →
  // expanding via a rail-icon click (which sets collapsed=false first) is unaffected.
  _clear_open_section_on_collapse: observer('right_panel_collapsed', function() {
    if(this.get('right_panel_collapsed') && this.get('right_panel_open_section')) {
      this.set('right_panel_open_section', null);
    }
  }),
  /* True when the currently-open right-panel section was opened
     while the panel was in COLLAPSED rail mode — i.e. the user
     was looking at the icon rail, clicked a section icon, the
     panel expanded INTO that section. In that flow, the Back
     button should collapse the panel back to the rail (not show
     the full expanded section list, which the user hadn't
     navigated through). Cleared when the user opens a section
     from the already-expanded panel, manually toggles the panel
     open/closed, or after Back has fired. */
  _section_opened_from_rail: false,
  panels_collapsed: false,
  board_search_string: '',

  // Active center-content view: 'symbol-board' (default) or 'phrase-builder'
  active_view: 'symbol-board',
  // Phrase builder search input
  phrase_search: '',

  _applyBoardSearch: function(val) {
    // Use the ordered_buttons data directly (works in both edit mode where
    // labels render as <input>s and speak mode where they render as <span>s).
    var ob = this.get('ordered_buttons');
    if(!ob) { return; }
    var trimmed = (val || '').trim();
    var re = null;
    if(trimmed) {
      try { re = new RegExp(trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); } catch(e) { return; }
    }
    for(var ri = 0; ri < ob.length; ri++) {
      var row = ob[ri] || [];
      for(var ci = 0; ci < row.length; ci++) {
        var btn = row[ci];
        if(!btn) { continue; }
        var is_empty = (btn.get && btn.get('empty')) || btn.empty;
        // Empty cells: only hide when a search is active.
        if(is_empty) {
          if(btn.set) { btn.set('_filtered_out', !!re); }
          else { btn._filtered_out = !!re; }
          continue;
        }
        if(!re) {
          if(btn.set) { btn.set('_filtered_out', false); }
          else { btn._filtered_out = false; }
          continue;
        }
        var label = (btn.get && btn.get('label')) || btn.label || '';
        var voc = (btn.get && btn.get('vocalization')) || btn.vocalization || '';
        var match = re.test(label) || re.test(voc);
        if(btn.set) { btn.set('_filtered_out', !match); }
        else { btn._filtered_out = !match; }
      }
    }
    // Force the grid to re-render the filter state
    this.set('ordered_buttons', ob.map(function(row) { return [].concat(row); }));
  },

  edit_mode: false,
  board_collapsed: true,
  board_actions_collapsed: true,
  inlineSidebarOpen: false,
  color_picker_button: null,
  custom_color_value: null,
  show_paint_color_picker: false,
  custom_paint_color: '#4a90d9',
  paint_mode: null,
  // Button Levels paint state — UI selections in the right panel's
  // Button Levels accordion. They feed into editManager.set_paint_mode('level', action, level)
  // (the same call the legacy paint-level modal uses), so the underlying
  // edit-manager + save-state machinery is shared. UI-only — not persisted.
  level_paint_action: null,
  level_paint_level: null,
  // Toggled true by edit_manager.paint_button when a level paint is
  // applied to a button — provides a reactive signal for the
  // button_level_count computed since plain `@each.level_modifications`
  // doesn't always fire when a sub-property of a JSON blob mutates.
  levels_change: false,
  // Nested expand-state inside the Session submenu in the actions
  // menu (Button Levels row). Starts collapsed.
  levels_submenu_open: false,
  // Top-level expandable section state inside the options dropdown.
  // Each section starts collapsed; toggled by the matching
  // `toggle_<x>_submenu` action.
  buttons_submenu_open: false,
  display_submenu_open: false,
  share_print_submenu_open: false,
  language_submenu_open: false,
  /* When true, the options menu replaces its normal section list
     with the inline BoardCollection panel — a sectioned, alphabetized
     list of the user's boards and public boards by brand family.
     Driven by the `open_board_collection` action; cleared whenever
     the options menu itself closes so a fresh open lands on the
     normal menu. */
  board_collection_open: false,
  /* Edit-mode Board Collections drawer (LEFT side). Opened from the edit rail's
     "Board Collections" item: the rail hides (CSS via md-shell--board-collection-left)
     and this drawer takes its place, pushing the center board area right. Selecting a
     board loads it into the center in EDIT mode. */
  edit_board_collection_open: false,
  /* The board the edit page was opened with, captured when the Board Collections drawer
     opens. Rendered in the drawer's "Original Selected Board" section so the user can jump
     back to where they started while previewing other boards. Cleared when the drawer closes. */
  edit_collection_original_board: null,
  /* Edit-mode "Categorize" panel. Opened from the edit rail between Board Actions
     and Search & Filter. Like the Board Collections drawer it takes the rail's
     place (CSS via md-shell--category-order), but expands to the FULL page width
     rather than a fixed drawer, because its whole purpose is to preview the
     board's buttons grouped into their categories at real size while the order is
     rearranged. */
  category_order_open: false,
  /* Closes the Categorize takeover whenever edit mode ends — Done, Cancel, browser Back,
     Android Back, a session-expiry redirect, anything. An observer rather than a patch in
     cancel_edit/save_board because those are two of many exits, and the ones that bit
     here (Back) go through none of them. The template also gates on edit_mode, so this is
     belt-and-braces: it clears the STATE, the gate stops the RENDER. */
  _close_category_panel_on_edit_exit: observer('edit_mode', function() {
    if(!this.get('edit_mode') && this.get('category_order_open')) {
      this.set('category_order_open', false);
      this.set('category_move_button', null);
    }
  }),
  /* The button whose "move to category" picker is open in the Categorize panel,
     or null. Holding the button (not just its id) keeps its label available for
     the picker heading without a second lookup. */
  category_move_button: null,
  sidebar_editor_open: false,
  show_paint_dropdown: false,
  show_options_menu: false,
  share_dropdown_open: false,
  details_dropdown_open: false,
  display_prefs_open: false,
  display_prefs_font_dropdown_open: false,
  display_prefs_symbol_library_dropdown_open: false,
  display_prefs_symbol_background_dropdown_open: false,
  display_prefs_voice_height_dropdown_open: false,
  display_prefs_skin_dropdown_open: false,
  pending_display_prefs: null,
  original_display_prefs: null,
  // Boards open LIGHT by default; dark only when the user turns it on (persisted
  // to preferences.board_dark_mode). The route resets this per board entry from
  // that preference; this is the pre-setup fallback.
  dark_mode: false,
  board_saving: false,
  ordered_buttons: null,
  preview_level: null,
  // Edit-mode entry settling overlay: when true, the grid renders with
  // opacity:0 so the user doesn't see the intermediate flash as
  // ordered_buttons gets replaced 2-3 times during route transition
  // (cached plain objects → _build_from_raw rebuild → process_for_displaying
  // rebuild). Set true synchronously on edit route enter; cleared once
  // ordered_buttons has stopped changing (see _grid_loading_settle below)
  // or by the fallback timer in edit.js if the observer never fires.
  grid_loading: false,
  _grid_settle_timer: null,
  // Watches ordered_buttons during edit-mode entry. Each replacement
  // resets a 150ms debounce timer. When no replacement occurs for
  // 150ms, the grid is "settled" and the fade clears.
  _grid_loading_settle: observer('ordered_buttons', function() {
    if(!this.get('grid_loading')) { return; }
    if(this._grid_settle_timer) { runCancel(this._grid_settle_timer); }
    var _this = this;
    this._grid_settle_timer = runLater(function() {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      _this.set('grid_loading', false);
      _this._grid_settle_timer = null;
    }, 150);
  }),

  // Size the <=768px word-prediction rail tiles to match the live board
  // buttons so they read as one consistent set. Board buttons are sized by the
  // CSS grid (gridWidth/cols x gridHeight/rows), which the rail — a sibling
  // outside that grid — can't read in CSS, so we measure a rendered card and
  // publish its box as CSS vars on .md-board-detail-main. The rail CSS consumes
  // them with FIXED FALLBACKS, so a missed measurement just leaves the rail at
  // its default size — it can never break the rail. Progressive enhancement.
  _sync_prediction_tile_size: function() {
    if(typeof document === 'undefined') { return; }
    var main = document.querySelector('.md-board-detail-main');
    if(!main) { return; }
    var cell = document.querySelector('.md-board-detail-grid__cell:not(.md-board-detail-grid__cell--empty)');
    if(!cell) { return; }
    var card = cell.querySelector('.md-board-detail-symbol-card') || cell;
    var cardRect = card.getBoundingClientRect();
    if(!cardRect || cardRect.width < 1 || cardRect.height < 1) { return; }
    // Publish the ACTUAL rendered button width AND height so the "Larger screen recommended"
    // overlay can trigger on real button size (below 35px in EITHER dimension is too small
    // for reliable AAC targeting / comfortable editing). This runs debounced inside runLater
    // on every grid resize / layout change, so it stays live and never mutates state mid-render.
    this.set('board_cell_width', Math.round(cardRect.width));
    this.set('board_cell_height', Math.round(cardRect.height));
    var grid = document.querySelector('.md-board-detail-grid');
    var gridStyle = grid ? window.getComputedStyle(grid) : null;
    // Publish the CELL (grid row) height as --bd-cell-h so the folder-tab RESERVE — the cell's
    // top padding + the folder-back top — can scale with the button size and the space between
    // rows shrinks on smaller buttons. A CSS container can't size its own padding by its own
    // height (cqh only works on descendants; padding-% is width-based), so this JS var is the
    // reliable source. The cell height is the 1fr grid row height (independent of the padding
    // inside it), so reading it back to drive the padding does NOT feed back.
    if(grid && cell) {
      var cellRect = cell.getBoundingClientRect();
      if(cellRect && cellRect.height >= 1) {
        grid.style.setProperty('--bd-cell-h', Math.round(cellRect.height) + 'px');
        // Also publish the SMALLER cell dimension so the folder-tab geometry (tab height +
        // reserve) can scale with min(width,height) — keeps the tab/reserve proportionate on
        // TALL-NARROW buttons (portrait-phone folders) instead of ballooning off the height.
        if(cellRect.width >= 1) {
          grid.style.setProperty('--bd-cell-min', Math.round(Math.min(cellRect.width, cellRect.height)) + 'px');
        }
      }
    }
    var colGap = gridStyle ? (parseFloat(gridStyle.columnGap) || 0) : 0;
    var rowGap = gridStyle ? (parseFloat(gridStyle.rowGap) || 0) : 0;
    // Make the rail read as another board column: stack its tiles with the board's
    // ROW gap (tiles line up with board rows — the tile height already equals the
    // board card height) and space it from the board by the board's COLUMN gap.
    // The user's grid-gap preference lives in --bd-button-gap on the GRID element,
    // which the rail (a sibling) can't inherit, so publish the measured gaps as
    // vars on .md-board-detail-main that the rail CSS reads. Set BEFORE the width
    // calc below so it reads the updated (column-gap) left margin.
    // The rail is a CSS grid with the SAME row structure as the board (see
    // .md-board-detail-prediction-rail): --prediction-rows rows of minmax(0,1fr),
    // the board's EXACT row gap, pinned to the board grid's measured height. Each
    // prediction tile then sits in the SAME row band as the board button beside it,
    // so they line up 1:1 at every screen size WITHOUT per-tile height measurement
    // (the old flex column shrank tiles to fit its max-height and drifted out of
    // line). Matching gaps keep the row bands identical, so use the board's exact
    // row gap — a folder-overhang fudge would change the row heights and break it.
    main.style.setProperty('--prediction-tile-gap', rowGap + 'px');
    main.style.setProperty('--prediction-rail-gap-left', colGap + 'px');
    main.style.setProperty('--prediction-rows', String(parseInt(this.get('current_grid.rows'), 10) || 4));
    main.style.setProperty('--prediction-grid-h', Math.round(grid.getBoundingClientRect().height) + 'px');
    // WIDTH — match the speak-mode sidebar EXACTLY (per request). The rail and the
    // inline sidebar are both fixed-width siblings of the FLEXIBLE board grid (which
    // absorbs the remaining width); the sidebar's width is set by CSS per breakpoint
    // (112 / 80 / 70px …), so reading its RENDERED width keeps the rail matched to it
    // at every screen size. Non-circular: the sidebar width doesn't depend on the
    // rail, so the grid just absorbs whatever the rail takes and the value settles in
    // one pass. Falls back to the board card width when the sidebar isn't present
    // (quick-sidebar disabled / collapsed).
    var tileW = Math.round(cardRect.width);
    var inlineSidebar = document.querySelector('.md-board-detail-inline-sidebar');
    if(inlineSidebar) {
      var sbw = Math.round(inlineSidebar.getBoundingClientRect().width);
      if(sbw > 1) { tileW = sbw; }
    }
    main.style.setProperty('--prediction-tile-w', Math.max(0, tileW) + 'px');
    // No per-tile height or top-inset measurement needed: the rail grid's rows
    // (--prediction-rows × minmax(0,1fr)), pinned to the board grid height above
    // with a matching 4px top inset, place each tile in its board row band
    // automatically. (--prediction-grid-h drives the rail height; see above.)
    // FONT: match the rail words to the board labels EXACTLY by copying the
    // board label's computed font-size. A `cqw`-based match is fragile here —
    // cqw resolves against the container's CONTENT box, and the rail tile has
    // more horizontal padding than the board card (10px vs 4px), so equal outer
    // widths still yield different cqw px. Reading the rendered px sidesteps
    // that (and any future padding/border drift). All board labels share the
    // same size, so the first is representative.
    var label = card.querySelector && card.querySelector('.md-board-detail-symbol-card__label');
    if(label) {
      var labelFont = window.getComputedStyle(label).fontSize;
      if(labelFont) { main.style.setProperty('--prediction-label-font', labelFont); }
    }
  },
  /* (Re)point the ResizeObserver at the current board grid — the grid element
     is replaced on board change, so re-observe whenever the board changes. */
  _observe_prediction_grid: function() {
    if(!this._predictionGridRO || typeof document === 'undefined') { return; }
    try { this._predictionGridRO.disconnect(); } catch(e) { /* noop */ }
    var grid = document.querySelector('.md-board-detail-grid');
    if(grid) { this._predictionGridRO.observe(grid); }
  },
  /* Keep the inline speak-sidebar EXACTLY as tall as the center board grid so it
     never extends past the bottom of the board; its content scrolls internally
     instead. The grid's height is JS-driven (board/index computeHeight) and this
     nested flex chain doesn't resolve a definite height for a pure-CSS cap, so we
     mirror the measured grid height directly onto the shell. The absolutely-
     positioned __scroll layer then has a definite height to scroll within. Synced
     from the same triggers as the prediction rail (grid ResizeObserver + window
     resize + board/grid-shape changes), so it tracks every relayout. */
  _sync_inline_sidebar_height: function() {
    if(typeof document === 'undefined') { return; }
    var sidebar = document.querySelector('.md-board-detail-inline-sidebar');
    if(!sidebar) { return; }
    var board = document.querySelector('.md-board-detail-grid-fade') ||
                document.querySelector('.md-board-detail-grid');
    var h = board ? board.getBoundingClientRect().height : 0;
    sidebar.style.height = (h && h > 1) ? (Math.round(h) + 'px') : '';
  },
  _sync_prediction_tile_size_on_change: observer('ordered_buttons', 'current_grid.columns', 'current_grid.rows', 'suggestions.list.[]', 'app_state.window_inner_width', 'app_state.window_inner_height', function() {
    var _this = this;
    runLater(function() {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      _this._sync_prediction_tile_size();
      _this._sync_inline_sidebar_height();
      _this._observe_prediction_grid();
    }, 160);
  }),
  noUndo: true,
  noRedo: true,

  init: function() {
    this._super(...arguments);
    this.set('sentence_parts', []);
    // Initialize session state on the service if not already set
    if(!this.get('app_state.board_detail_recent_phrases')) {
      this.set('app_state.board_detail_recent_phrases', []);
    }
    if(!this.get('app_state.board_detail_nav_history')) {
      this.set('app_state.board_detail_nav_history', []);
    }
    this.set('weekly_goals', []);
    this.set('todays_schedule', []);
    var _this = this;
    _this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          args.pop();
        }
        _this.send.apply(_this, [actionName].concat(args));
      };
    };
    // For `input` bindings: the handler reads event.target.value, which the
    // generic ctrlAction above discards (5.12 upgrade #490), so the search
    // box never filtered. ctrlAction is unchanged for clicks.
    _this.eventAction = buildEventAction(_this);
    _this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        _this.send.apply(_this, [actionName].concat(bound));
      };
    };
    _this.onUpdateCustomPaintColor = function(event) {
      var value = event && event.target && event.target.value;
      _this.send('update_custom_paint_color', value);
    };
    _this.onFilterDisplayFonts = function(event) {
      var value = event && event.target && event.target.value;
      _this.send('filter_display_fonts', value);
    };
    _this.onFontDropdownKeydown = function(event) {
      _this.send('font_dropdown_keydown', event);
    };
    _this.onToggleSkinSuboption = function(option) {
      return function(event) {
        _this.send('toggle_skin_suboption', option, event);
      };
    };
    _this.onCloseBoardCollection = function() {
      _this.send('close_board_collection');
    };
    _this.onCloseSidebarEditor = function() {
      _this.send('close_sidebar_editor');
    };
    // Opens the chosen board and RETURNS the Transition so the collection panel
    // (BoardCollection) can clear its "Opening your board" overlay when the board
    // finishes loading (the transition settles / board is painted), instead of only via
    // its 8s safety timeout. Ember's send() does not propagate an action's return value,
    // so the transition is performed here and returned; the select_board_from_collection
    // action (also reached via raw_events chrome clicks) delegates here.
    _this.onSelectBoardFromCollection = function(boardOrKey) {
      if(!boardOrKey) { return; }
      // Board lock: picking a board from the Collections drawer leaves the current
      // board, so it is an exit like Back / Home / a folder button. It was
      // unguarded. Returns undefined (not a transition promise) when blocked —
      // BoardCollection treats a missing promise as "nothing to wait for" and
      // falls back to its own timeout to clear the "Opening your board" overlay.
      if(_this.board_lock_blocks_exit()) { return; }
      var key = typeof boardOrKey === 'string' ? boardOrKey : ((boardOrKey.get && boardOrKey.get('key')) || boardOrKey.key);
      // Keep the collection PINNED (do NOT clear board_collection_open) so the drawer
      // stays open while the chosen board loads in the grid on the left.
      _this.set('show_options_menu', false);
      if(key && _this.router) {
        var parts = key.split('/');
        if(parts.length >= 2) {
          return _this.router.transitionTo('user.board-detail', parts[0], parts.slice(1).join('/'));
        }
        // Defensive fallback: keys SHOULD always be `<user>/<slug>`.
        return _this.router.transitionTo('board', key);
      }
    };
    // "Back to Edit Mode" — commits to editing whatever board is currently previewed
    // in the center. Unpins the drawer, restores the rail, and drops the captured
    // original board. If the previewed board isn't editable by the current user
    // (not owned), route through enter_edit_mode so they're prompted to COPY it first
    // and then edit the copy (same non-owner path as the normal Edit action). Owned
    // boards are already in edit mode, so closing the drawer is all that's needed.
    _this.onCloseEditBoardCollection = function() {
      _this.set('edit_board_collection_open', false);
      _this.set('edit_collection_original_board', null);
      if(!_this.get('model.permissions.edit')) {
        _this.send('enter_edit_mode');
      }
    };
    // Edit-mode board preview/select: loads the chosen board into the center while
    // STAYING in edit mode (transitions to user.board-detail.edit, not the speak
    // index route). CRUCIAL: it RETURNS the Transition — exactly like the speak-mode
    // handler — so BoardCollection clears its "Opening your board" overlay the instant
    // the board settles. The earlier version omitted the return, so the overlay hung on
    // its 8s safety timeout, which is what made selection feel slow. The board data is
    // already cached (same as the speak-mode collection), so the transition settles
    // fast; the brief async button-rebuild is covered by the grid fade, not a card.
    _this.onSelectBoardFromCollectionEdit = function(boardOrKey) {
      if(!boardOrKey || !_this.router) { return; }
      var key = typeof boardOrKey === 'string' ? boardOrKey : ((boardOrKey.get && boardOrKey.get('key')) || boardOrKey.key);
      if(!key) { return; }
      var parts = key.split('/');
      if(parts.length < 2) { return; }
      _this.set('show_options_menu', false);
      return _this.router.transitionTo('user.board-detail.edit', parts[0], parts.slice(1).join('/'));
    };
    this._closeDropdownsHandler = function(e) {
      if(_this.get('details_dropdown_open') && !e.target.closest('.md-board-detail-details-dropdown-wrap')) {
        _this.set('details_dropdown_open', false);
      }
      if(_this.get('share_dropdown_open') && !e.target.closest('.md-board-detail-share-dropdown-wrap')) {
        _this.set('share_dropdown_open', false);
      }
      if(_this.get('show_paint_dropdown') && !e.target.closest('.md-board-detail-edit-toolbar__dropdown-wrap--paint')) {
        _this.set('show_paint_dropdown', false);
      }
      if(_this.get('folder_dropdown_open') && !e.target.closest('.md-board-detail-edit-toolbar__dropdown-wrap--folder')) {
        _this.set('folder_dropdown_open', false);
      }
      // Immersive quick-actions popover (mic/backspace/clear) — close on
      // any click outside both the popover and its chevron trigger.
      if(_this.get('quick_actions_open') &&
         !e.target.closest('.md-board-detail-sentence-bar__quick-actions') &&
         !e.target.closest('.md-board-detail-sentence-bar__tool-btn--chevron')) {
        _this.set('quick_actions_open', false);
      }
    };
    document.addEventListener('click', _this._closeDropdownsHandler, true);

    // Auto-collapse both side panels at ≤1200px. matchMedia fires
    // when the breakpoint is CROSSED (resize transition); the
    // companion edit_mode observer below covers the other entry
    // points (direct page load in edit mode at narrow viewport,
    // refresh while in edit mode at narrow viewport) — without it,
    // a user who LOADS edit mode at ≤1200px would never see the
    // auto-collapse because the viewport never crossed the threshold
    // while observable. The resize handler ONLY auto-collapses on
    // wide→narrow transitions (e.matches === true), so manually
    // expanding while already narrow isn't fought.
    if(typeof window !== 'undefined' && window.matchMedia) {
      this._narrowViewportMql = window.matchMedia('(max-width: 1200px)');
      this._narrowViewportHandler = function(e) {
        if(e.matches && _this.get('edit_mode')) {
          _this.set('left_panel_collapsed', true);
          _this.set('right_panel_collapsed', true);
        }
      };
      // addEventListener is the modern API; older Safari needs the
      // legacy addListener fallback.
      if(this._narrowViewportMql.addEventListener) {
        this._narrowViewportMql.addEventListener('change', this._narrowViewportHandler);
      } else if(this._narrowViewportMql.addListener) {
        this._narrowViewportMql.addListener(this._narrowViewportHandler);
      }
      // Initial check — if the page is already in edit mode at a
      // narrow viewport (refresh, direct load, deep link), collapse
      // immediately. Use schedule('afterRender') so edit_mode is
      // resolved before we check.
      runLater(function() {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        if(_this._narrowViewportMql.matches && _this.get('edit_mode')) {
          _this.set('left_panel_collapsed', true);
          _this.set('right_panel_collapsed', true);
        }
      }, 0);
    }

    // Keep the <=768px prediction-rail tiles matched to the board buttons as
    // the viewport changes (board buttons resize with the viewport). Debounced;
    // each run is a single measure + two CSS-var writes. Cleaned up in
    // willDestroy. See _sync_prediction_tile_size.
    if(typeof window !== 'undefined') {
      this._predictionTileResizeHandler = function() {
        if(_this._predictionTileResizeTimer) { runCancel(_this._predictionTileResizeTimer); }
        _this._predictionTileResizeTimer = runLater(function() {
          if(_this.isDestroyed || _this.isDestroying) { return; }
          _this._sync_prediction_tile_size();
          _this._sync_inline_sidebar_height();
        }, 120);
      };
      window.addEventListener('resize', this._predictionTileResizeHandler);
      // Initial measure once the first board has rendered.
      runLater(function() {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        _this._sync_prediction_tile_size();
        _this._sync_inline_sidebar_height();
      }, 300);
      // A window-resize / fixed timer only catches viewport changes — NOT the
      // board re-laying-out (square-shape collapse, board switch, font/gap/shape
      // pref changes, dev hot-reload) which resize the cells WITHOUT a window
      // resize, leaving the rail measured against a stale layout. Observe the
      // grid directly so the rail re-measures whenever the buttons actually
      // change size. The closed-form measure is convergent (it settles to the
      // same value in a tick), so the debounce + rounding prevent a RO loop.
      if(typeof ResizeObserver !== 'undefined') {
        this._predictionGridRO = new ResizeObserver(function() {
          if(_this._predictionTileResizeTimer) { runCancel(_this._predictionTileResizeTimer); }
          _this._predictionTileResizeTimer = runLater(function() {
            if(_this.isDestroyed || _this.isDestroying) { return; }
            _this._sync_prediction_tile_size();
            _this._sync_inline_sidebar_height();
          }, 120);
        });
        runLater(function() {
          if(_this.isDestroyed || _this.isDestroying) { return; }
          _this._observe_prediction_grid();
        }, 350);
      }
    }

    // Portrait/narrow viewport tracking for the landscape-orientation
    // overlay + immersive tool consolidation. Mirrors the matchMedia
    // pattern above: stored MQLs + handlers so the reactive booleans stay
    // current and willDestroy can detach them. Two tiers drive the
    // orientation gate (see `portrait_overlay_eligible`):
    //   • `viewport_narrow`       ≤640px — gates very dense boards (>8/row)
    //   • `viewport_very_narrow`  ≤460px — gates moderately dense (>6/row)
    //   • `viewport_ultra_narrow` ≤375px — gates even sparse boards (>4/row)
    // 640px is the feature's hard floor — nothing changes above it.
    if(typeof window !== 'undefined' && window.matchMedia) {
      this._portraitViewportMql = window.matchMedia('(max-width: 640px)');
      this.set('viewport_narrow', !!this._portraitViewportMql.matches);
      this._portraitViewportHandler = function(e) {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        _this.set('viewport_narrow', !!e.matches);
        // Leaving narrow width retires the overlay/popover entirely so a
        // rotate-to-landscape cleanly returns to the normal board.
        if(!e.matches) { _this.set('quick_actions_open', false); }
      };
      if(this._portraitViewportMql.addEventListener) {
        this._portraitViewportMql.addEventListener('change', this._portraitViewportHandler);
      } else if(this._portraitViewportMql.addListener) {
        this._portraitViewportMql.addListener(this._portraitViewportHandler);
      }

      this._veryNarrowViewportMql = window.matchMedia('(max-width: 460px)');
      this.set('viewport_very_narrow', !!this._veryNarrowViewportMql.matches);
      this._veryNarrowViewportHandler = function(e) {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        _this.set('viewport_very_narrow', !!e.matches);
      };
      if(this._veryNarrowViewportMql.addEventListener) {
        this._veryNarrowViewportMql.addEventListener('change', this._veryNarrowViewportHandler);
      } else if(this._veryNarrowViewportMql.addListener) {
        this._veryNarrowViewportMql.addListener(this._veryNarrowViewportHandler);
      }

      this._ultraNarrowViewportMql = window.matchMedia('(max-width: 375px)');
      this.set('viewport_ultra_narrow', !!this._ultraNarrowViewportMql.matches);
      this._ultraNarrowViewportHandler = function(e) {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        _this.set('viewport_ultra_narrow', !!e.matches);
      };
      if(this._ultraNarrowViewportMql.addEventListener) {
        this._ultraNarrowViewportMql.addEventListener('change', this._ultraNarrowViewportHandler);
      } else if(this._ultraNarrowViewportMql.addListener) {
        this._ultraNarrowViewportMql.addListener(this._ultraNarrowViewportHandler);
      }
    }
  },

  // Auto-collapse BOTH side panels whenever edit_mode flips on, at ANY viewport
  // size (per request: the edit page should always open with the side panels
  // collapsed so the board grid gets the room). The enterEditNow action also
  // collapses on the in-app click path; this observer is the catch-all for every
  // other path that sets edit_mode true (direct load, deep link, refresh). Fires
  // only on entry — a manual expand afterward is preserved (the observer doesn't
  // run again until edit_mode next flips).
  _auto_collapse_panels_on_edit: observer('edit_mode', function() {
    if(!this.get('edit_mode')) { return; }
    this.set('left_panel_collapsed', true);
    this.set('right_panel_collapsed', true);
  }),

  willDestroy: function() {
    this._super(...arguments);
    if(this._closeDropdownsHandler) {
      document.removeEventListener('click', this._closeDropdownsHandler, true);
    }
    if(this._predictionTileResizeHandler) {
      window.removeEventListener('resize', this._predictionTileResizeHandler);
      if(this._predictionTileResizeTimer) { runCancel(this._predictionTileResizeTimer); }
    }
    if(this._predictionGridRO) {
      try { this._predictionGridRO.disconnect(); } catch(e) { /* noop */ }
      this._predictionGridRO = null;
    }
    // Flush (don't just drop) any debounced display-pref save: the user's last
    // stepper click must still reach the server when they navigate away inside the
    // debounce window, otherwise the preference they just set is silently lost.
    if(this._display_pref_save_timer) {
      runCancel(this._display_pref_save_timer);
      this._display_pref_save_timer = null;
      this._flush_display_pref_save();
    }
    if(this._narrowViewportMql && this._narrowViewportHandler) {
      if(this._narrowViewportMql.removeEventListener) {
        this._narrowViewportMql.removeEventListener('change', this._narrowViewportHandler);
      } else if(this._narrowViewportMql.removeListener) {
        this._narrowViewportMql.removeListener(this._narrowViewportHandler);
      }
    }
    if(this._portraitViewportMql && this._portraitViewportHandler) {
      if(this._portraitViewportMql.removeEventListener) {
        this._portraitViewportMql.removeEventListener('change', this._portraitViewportHandler);
      } else if(this._portraitViewportMql.removeListener) {
        this._portraitViewportMql.removeListener(this._portraitViewportHandler);
      }
    }
    if(this._veryNarrowViewportMql && this._veryNarrowViewportHandler) {
      if(this._veryNarrowViewportMql.removeEventListener) {
        this._veryNarrowViewportMql.removeEventListener('change', this._veryNarrowViewportHandler);
      } else if(this._veryNarrowViewportMql.removeListener) {
        this._veryNarrowViewportMql.removeListener(this._veryNarrowViewportHandler);
      }
    }
    if(this._ultraNarrowViewportMql && this._ultraNarrowViewportHandler) {
      if(this._ultraNarrowViewportMql.removeEventListener) {
        this._ultraNarrowViewportMql.removeEventListener('change', this._ultraNarrowViewportHandler);
      } else if(this._ultraNarrowViewportMql.removeListener) {
        this._ultraNarrowViewportMql.removeListener(this._ultraNarrowViewportHandler);
      }
    }
  },

  title: computed('model.name', 'boardname', function() {
    var name = this.get('model.name');
    if(name) { return name; }
    var boardname = this.get('boardname');
    if(boardname) {
      return boardname.replace(/-/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
    }
    return i18n.t('board_detail', "Board Detail");
  }),

  subtitle: computed('model.description', function() {
    var desc = this.get('model.description');
    if(desc && desc.indexOf('CoughDrop') !== -1) {
      return null;
    }
    if(desc) { return desc; }
    return null;
  }),

  description_expanded: false,

  subtitle_is_long: computed('subtitle', function() {
    var sub = this.get('subtitle') || '';
    return sub.length > 120;
  }),

  board_image_url: computed('model.image_url', function() {
    return this.get('model.image_url') || null;
  }),

  // Display text for the speak-bar strip (chip labels / text-only mode).
  // Intentionally uses label, not vocalization — AAC buttons often show a
  // short label while speaking a longer distinct vocalization.
  sentence_text: computed('sentence_parts.[]', 'sentence_parts.@each.label', function() {
    var parts = this.get('sentence_parts') || [];
    return parts.map(function(p) { return p && p.label; }).filter(Boolean).join(' ');
  }),

  // Text spoken when the user taps the Speak bar or mic. Prefer vocalization
  // (same convention as utterance.speak_button / vocalize_list / demo speak).
  sentence_speak_text: computed('sentence_parts.[]', 'sentence_parts.@each.label', 'sentence_parts.@each.vocalization', function() {
    var parts = this.get('sentence_parts') || [];
    return parts.map(function(p) {
      if(!p) { return ''; }
      return p.vocalization || p.label || '';
    }).filter(Boolean).join(' ');
  }),

  has_sentence: computed('sentence_parts.[]', function() {
    return (this.get('sentence_parts') || []).length > 0;
  }),

  // Keep the most recent chips visible. The symbol strip wraps chips into
  // rows and scrolls vertically (capped at one bar height in app.scss); as
  // the message grows we scroll it to the bottom so the user always sees
  // what they just added, with older rows scrolled up out of view. `next`
  // waits for the new chips to render before measuring scrollHeight.
  _scroll_sentence_to_newest: observer('sentence_parts.[]', function() {
    next(function() {
      var el = document.querySelector('#speak .md-board-detail-sentence-bar__text--with-symbols');
      // Only pin to the newest (bottom) when chips have genuinely wrapped to a
      // SECOND row. A single row exactly fills the viewport, and a few px of
      // sub-row overflow (border/rounding) shouldn't scroll — doing so would
      // hide the TOP of the only row (clipping the symbols). The 24px floor is
      // well below a real chip row (~78px+) but above any single-row rounding.
      if(el && (el.scrollHeight - el.clientHeight) > 24) { el.scrollTop = el.scrollHeight; }
    });
  }),

  /**
   * Mirror new entries from the global utterance state
   * (`app_state.button_list`) into our local `sentence_parts`. This is
   * how the sentence-bar UI on board-detail picks up button activations
   * that come through the *global* `app_state.activate_button` /
   * `utterance.add_button` path — most notably the find-a-button
   * "guided walkthrough" flow, where the application controller's
   * `highlight_button` action calls `activateButton` directly without
   * going through this controller's local `select_button` handler.
   *
   * Sync rules:
   *   - Only ADD entries; never remove. Local clear/backspace stay
   *     authoritative for removal (and call `utterance.clear` /
   *     `utterance.backspace` to keep the global state in sync).
   *   - Dedupe by `raw_index` from utterance, so an activation that
   *     ALSO did a local push (the regular `select_button` flow,
   *     pre-refactor) doesn't double-add. Once `select_button` stops
   *     pushing locally, this dedupe is still safe — entries from
   *     local-only sources (quick phrases, completions, phrase
   *     builder) carry no `raw_index` and never collide with globals.
   *   - Empty global list is a no-op (local clear was the trigger).
   *   - In-progress keyboard words show in the bar as text only (s → st →
   *     str …), matching classic speak-bar behavior. When the word
   *     completes (space or prediction), the symbol image is added.
   */
  _find_local_image_for_label: function(label) {
    var key = (label || '').toLowerCase();
    if(!key) { return null; }
    var flat = this.get('flat_ordered_buttons') || [];
    for(var idx = 0; idx < flat.length; idx++) {
      var btn = flat[idx];
      if(!btn) { continue; }
      var lbl = (btn.label || btn.vocalization || '').toLowerCase();
      if(lbl === key && btn.image_url && !wordSuggestionsModule.is_placeholder_image(btn.image_url)) {
        return btn.image_url;
      }
    }
    return null;
  },

  _suggestion_lookup_board_ids: function() {
    return wordSuggestionsModule.lookup_board_ids(
      this.get('app_state'),
      this.get('stashes'),
      [this.get('model.id')]
    );
  },

  _decorate_suggestion_images: function(list) {
    var _this = this;
    if(!list || !list.length) { return list; }
    if(!_this._suggestion_image_lookups) {
      _this._suggestion_image_lookups = {};
    }
    var lookups = _this._suggestion_image_lookups;
    var lookup_ids = _this._suggestion_lookup_board_ids();
    var ctx = { appState: _this.get('app_state'), stashes: _this.get('stashes') };
    list.forEach(function(item) {
      if(!item || !item.word) { return; }
      if(wordSuggestionsModule.resolve_word_image(item)) { return; }
      var local = _this._find_local_image_for_label(item.word);
      if(local) {
        item.image = local;
        return;
      }
      var key = item.word.toLowerCase();
      if(lookups[key]) { return; }
      lookups[key] = true;
      wordSuggestionsModule.attach_image_for_label(item.word, lookup_ids, function(url) {
        if(_this.isDestroyed || _this.isDestroying || !url) { return; }
        item.image = url;
        var current = _this.get('suggestions');
        if(current && current.list) {
          _this.set('suggestions', { ready: true, list: current.list.slice() });
        }
      }, ctx);
    });
    return list;
  },

  // Cache key for a carried-forward chip image. Board buttons key by their stable
  // button_id so two same-label buttons with DIFFERENT symbols can't cross-
  // contaminate; typed/predicted words (no real button_id → 'utt-N') fall back to
  // the label (same word → same image, which is correct).
  _chip_image_key: function(id, label) {
    return (id && String(id).indexOf('utt-') !== 0) ? ('b:' + id) : ('l:' + (label || '').toLowerCase());
  },
  _apply_sentence_chip_image: function(part, img) {
    if(!part || !img) { return false; }
    // Carry this resolved image forward across rebuilds/reorders (raw_index isn't
    // stable). Keyed by button_id when present so it can't leak to a different
    // same-label button.
    if(part.label) {
      if(!this._resolved_label_images) { this._resolved_label_images = {}; }
      this._resolved_label_images[this._chip_image_key(part.id, part.label)] = img;
    }
    var current = (this.get('sentence_parts') || []).slice();
    var idx = current.findIndex(function(p) {
      return p && ((part.raw_index != null && p.raw_index === part.raw_index) ||
        (p.label === part.label && !p.image_url));
    });
    if(idx >= 0 && current[idx].image_url !== img) {
      current[idx] = Object.assign({}, current[idx], { image_url: img });
      this.set('sentence_parts', current);
      return true;
    }
    return false;
  },

  // ----- Speak-bar active edit (feature: sentence_bar_editing) -----
  // Which chip currently shows its edit controls (visual index; null = none).
  selected_chip_index: null,
  // Which chip is "held" for a swap/replace (visual index; null = none). While
  // set, tapping ANOTHER chip swaps positions and tapping a board grid button
  // replaces the held chip (see select_button).
  swap_source_index: null,
  // Bound to an aria-live region — set to announce the result of each edit.
  sentence_edit_announcement: '',
  // Whether the labeled edit menu is shown for the selected chip. It opens only
  // after a deliberate 2s press-and-hold on the chip (the hold is detected in the
  // sentence-bar-chip component, so a short/accidental tap never opens it), or via
  // keyboard Enter. selected_chip_index + chip_menu_open are set together.
  chip_menu_open: false,
  // Measured horizontal offsets (px, relative to the sentence bar) that place the
  // below-chip menu + its caret under the selected chip. Set by _position_chip_menu.
  chip_menu_left: 0,
  chip_menu_caret_left: 20,

  // Gate: edit controls only in SPEAK mode (never while editing the board) and
  // only when the feature flag is on.
  sentence_bar_editing_enabled: computed('app_state.feature_flags.sentence_bar_editing', 'edit_mode', function() {
    return !this.get('edit_mode') && !!this.get('app_state.feature_flags.sentence_bar_editing');
  }),
  // True while a chip is held for swap/replace.
  chip_swap_active: computed('swap_source_index', function() {
    return this.get('swap_source_index') != null;
  }),
  // If editing turns off (e.g. entering board edit mode), tear down any open chip
  // menu / dwell timer so a stale highlight+menu can't linger into the next mode.
  _close_chip_menu_when_disabled: observer('sentence_bar_editing_enabled', function() {
    if(!this.get('sentence_bar_editing_enabled')) { this._deselect_chip(); }
  }),
  // ----- Below-chip labeled menu (bound in board-detail.hbs) -----
  selected_chip_word: computed('selected_chip_index', 'sentence_parts.@each.label', function() {
    return this._chip_label(this.get('selected_chip_index'));
  }),
  selected_chip_can_move_left: computed('selected_chip_index', function() {
    var idx = this.get('selected_chip_index');
    return idx != null && idx > 0;
  }),
  selected_chip_can_move_right: computed('selected_chip_index', 'sentence_parts.length', function() {
    var idx = this.get('selected_chip_index');
    return idx != null && idx < ((this.get('sentence_parts') || []).length - 1);
  }),
  // Switch button reflects whether THIS chip is currently the held swap source.
  selected_chip_swapping: computed('selected_chip_index', 'swap_source_index', function() {
    return this.get('selected_chip_index') != null && this.get('selected_chip_index') === this.get('swap_source_index');
  }),
  chip_menu_style: computed('chip_menu_left', function() {
    return htmlSafe('left: ' + (this.get('chip_menu_left') || 0) + 'px;');
  }),
  chip_menu_caret_style: computed('chip_menu_caret_left', function() {
    return htmlSafe('left: ' + (this.get('chip_menu_caret_left') || 20) + 'px;');
  }),

  _chip_label: function(index) {
    var parts = this.get('sentence_parts') || [];
    return (index != null && parts[index] && parts[index].label) || '';
  },
  _deselect_chip: function() {
    this.set('chip_menu_open', false);
    this.set('selected_chip_index', null);
    this.set('swap_source_index', null);
  },
  // Measure the selected chip against the sentence bar and place the labeled menu
  // (and its caret) centered under it, clamped to stay inside the bar. Rendered as
  // a child of the bar (not the overflow-clipped chip scroller) so it can drop
  // below. Synchronous: callers run it once BEFORE the menu renders (provisional
  // width) to avoid a first-frame flash at left:0, then again on afterRender (exact
  // width once the buttons are laid out).
  _position_chip_menu: function() {
    if(this.isDestroyed || this.isDestroying) { return; }
    var bar = document.querySelector('#speak .md-board-detail-sentence-bar');
    var idx = this.get('selected_chip_index');
    if(!bar || idx == null) { return; }
    var chip = bar.querySelector('.md-board-detail-sentence-bar__chip[data-chip-index="' + idx + '"]');
    if(!chip) { return; }
    var menu = bar.querySelector('.md-board-detail-sentence-bar__chip-menu');
    // Fall back to a typical width when the menu hasn't rendered yet (provisional pass).
    var menu_w = (menu && menu.offsetWidth) || 240;
    var bar_rect = bar.getBoundingClientRect();
    var chip_rect = chip.getBoundingClientRect();
    var chip_center = (chip_rect.left + chip_rect.width / 2) - bar_rect.left;
    var left = chip_center - (menu_w / 2);
    var max_left = Math.max(8, bar_rect.width - menu_w - 8);
    left = Math.max(8, Math.min(left, max_left));
    var caret = Math.max(16, Math.min(chip_center - left, menu_w - 16));
    this.set('chip_menu_left', Math.round(left));
    this.set('chip_menu_caret_left', Math.round(caret));
  },
  _announce_sentence_edit: function(msg) {
    // Toggle a trailing (regular) space so a repeated IDENTICAL message still
    // re-triggers the aria-live region. A plain trailing space changes the text
    // node (so the region re-announces) but is NOT read aloud, unlike a U+00A0;
    // most messages already differ (word + position), so this is a rare-case
    // belt-and-suspenders.
    this._announce_flip = !this._announce_flip;
    this.set('sentence_edit_announcement', (msg || '') + (this._announce_flip ? '' : ' '));
  },

  // FULL MIRROR of app_state.button_list → sentence_parts. Rebuilt in global
  // order every sync so REMOVE / REORDER / SWAP / REPLACE on the global utterance
  // (the source of truth) are reflected faithfully — order and membership both
  // mirror the global list (the previous additive, raw_index-keyed merge could
  // not survive a reorder, since set_button_list reassigns raw_index). Resolved
  // images are carried forward via a label-keyed cache so a reorder/swap (which
  // changes raw_index) never drops or re-fetches an already-resolved symbol.
  sync_sentence_from_button_list: function() {
    var _this = this;
    var global_list = this.get('app_state.button_list') || [];
    var old_parts = this.get('sentence_parts') || [];
    if(!this._resolved_label_images) { this._resolved_label_images = {}; }
    var label_images = this._resolved_label_images;
    old_parts.forEach(function(p) {
      if(p && p.label && p.image_url && !p.in_progress) {
        label_images[_this._chip_image_key(p.id, p.label)] = p.image_url;
      }
    });
    var parts = [];
    global_list.forEach(function(b, list_idx) {
      if(!b || emberGet(b, 'ghost') || emberGet(b, 'hint')) { return; }
      var raw_index = emberGet(b, 'raw_index');
      if(raw_index == null) { raw_index = list_idx; }
      var label = (emberGet(b, 'label') || emberGet(b, 'vocalization') || '').replace(/\s+$/, '');
      if(!label) { return; }
      var in_progress = !!emberGet(b, 'in_progress');
      var image_url = null;
      if(!in_progress) {
        var raw_image = emberGet(b, 'image');
        image_url = wordSuggestionsModule.resolve_word_image({
          image: raw_image,
          original_image: emberGet(b, 'original_image')
        });
        if(!image_url) {
          image_url = _this._find_local_image_for_label(label);
        }
        // A word prediction with no board symbol is given the missing-image
        // placeholder by complete_word. resolve_word_image() deliberately
        // drops placeholders, so re-apply it here when the user shows symbols —
        // otherwise the chip renders blank even though the button carries the
        // fallback icon. Only an explicit placeholder URL qualifies; words with
        // no image at all stay imageless.
        if(!image_url && _this.get('utterance_show_symbols') &&
           typeof raw_image === 'string' && wordSuggestionsModule.is_placeholder_image(raw_image)) {
          image_url = raw_image;
        }
        // Carry forward a previously-resolved image (async lookup, or a value
        // resolved before a reorder/swap shuffled raw_index) so it doesn't flicker.
        if(!image_url) {
          image_url = label_images[_this._chip_image_key(emberGet(b, 'button_id'), label)] || null;
        }
      }
      // Keep vocalization on the chip mirror so Speak-bar / mic replay can
      // speak the button's spoken text, not only the display label.
      var vocalization = (emberGet(b, 'vocalization') || '').replace(/\s+$/, '');
      parts.push({
        id: emberGet(b, 'button_id') || ('utt-' + raw_index),
        raw_index: raw_index,
        label: label,
        vocalization: vocalization || null,
        in_progress: in_progress,
        image_url: image_url
      });
    });
    if(!_this._sentence_parts_equal(old_parts, parts)) {
      this.set('sentence_parts', parts);
    }
    // If the list shrank (e.g. async button_list churn — image/suggestion
    // resolution, a condense rule, a modeling session) a held/selected chip index
    // can dangle past the end; clear it so an edit can't act on a stale index.
    var n = parts.length;
    if(this.get('selected_chip_index') != null && this.get('selected_chip_index') >= n) { this._deselect_chip(); }
    if(this.get('swap_source_index') != null && this.get('swap_source_index') >= n) { this.set('swap_source_index', null); }
    this._resolve_missing_sentence_images();
  },

  // Shallow value-equality for the chip mirror, so a no-op sync doesn't churn
  // sentence_parts (which would re-render and could interrupt an in-flight drag).
  _sentence_parts_equal: function(a, b) {
    a = a || []; b = b || [];
    if(a.length !== b.length) { return false; }
    for(var i = 0; i < a.length; i++) {
      var x = a[i] || {}, y = b[i] || {};
      if(x.raw_index !== y.raw_index || x.label !== y.label || x.id !== y.id ||
         x.vocalization !== y.vocalization ||
         x.image_url !== y.image_url || !!x.in_progress !== !!y.in_progress) { return false; }
    }
    return true;
  },

  // Speak the current utterance the same way classic Speak Mode does:
  // attached button sounds when present, otherwise TTS (vocalization || label).
  // Also records recent-phrase history for the board-detail UI.
  _speak_current_sentence: function() {
    var list = this.get('app_state.button_list') || [];
    var parts = this.get('sentence_parts') || [];
    var speakable = false;
    var counted = 0;
    for(var i = 0; i < list.length; i++) {
      var b = list[i];
      if(!b || emberGet(b, 'ghost') || emberGet(b, 'hint')) { continue; }
      counted++;
      if(emberGet(b, 'sound') || emberGet(b, 'inline_content') ||
         emberGet(b, 'vocalization') || emberGet(b, 'label')) {
        speakable = true;
      }
    }
    /*
     * `vocalize_list` speaks the GLOBAL utterance, and the bar can be showing more than
     * that. `sentence_parts` is a superset: the mirror from `app_state.button_list` is
     * add-only (see `_sync_sentence_from_global`), and local-only sources — quick phrases,
     * completions, Phrase Builder — push straight into it and never reach the global list.
     *
     * The all-local case was already handled, via the `speakable` flag falling false and the
     * TTS fallback below. The MIXED case was not, and it is the one a user hits: tap a board
     * button, then add a word from Phrase Builder, and the bar reads "Like good" while
     * `vocalize_list` says only "Like" — measured exactly that. The bar showing one thing and
     * the device saying another is about the worst failure this app has.
     *
     * So the global path is used only when it is COMPLETE — as many real entries as the bar
     * has chips. Otherwise fall through to TTS of the whole bar, which says everything at the
     * cost of any per-button sounds for that one utterance. (Counting rather than breaking
     * early is why the loop above no longer stops at the first speakable entry.)
     */
    if(speakable && counted >= parts.length) {
      // Matches application.vocalize → vocalize_list (sounds + TTS + clear_on_vocalize).
      utterance.vocalize_list(null, {});
    } else {
      var fallback = this.get('sentence_speak_text');
      if(!fallback) { return; }
      speecher.stop('text');
      speecher.speak_text(fallback);
    }
    var text = this.get('sentence_speak_text');
    if(text) {
      var phrases = (this.get('app_state.board_detail_recent_phrases') || []).slice();
      phrases.unshift({ text: text, timestamp: new Date() });
      if(phrases.length > 5) { phrases = phrases.slice(0, 5); }
      this.set('app_state.board_detail_recent_phrases', phrases);
    }
  },

  _resolve_missing_sentence_images: function() {
    var _this = this;
    var parts = this.get('sentence_parts') || [];
    var pending = parts.filter(function(p) {
      return p && p.label && !p.in_progress && !p.image_url;
    });
    if(!pending.length) { return; }
    if(!this._sentence_image_lookups) {
      this._sentence_image_lookups = {};
    }
    var lookups = this._sentence_image_lookups;
    var lookup_ids = wordSuggestionsModule.lookup_board_ids(this.get('app_state'), this.get('stashes'), [this.get('model.id')]);
    pending.forEach(function(part) {
      var key = part.raw_index != null ?
        ('r:' + part.raw_index) :
        ('l:' + (part.label || '').toLowerCase());
      if(lookups[key]) { return; }
      var local_img = _this._find_local_image_for_label(part.label);
      if(local_img && _this._apply_sentence_chip_image(part, local_img)) {
        lookups[key] = true;
        return;
      }
      lookups[key] = true;
      wordSuggestionsModule.attach_image_for_label(part.label, lookup_ids, function(img) {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        _this._apply_sentence_chip_image(part, img);
      }, { appState: _this.get('app_state'), stashes: _this.get('stashes') });
    });
  },

  _sync_sentence_from_global: observer(
    'app_state.button_list.[]',
    'app_state.button_list.@each.in_progress',
    'app_state.button_list.@each.label',
    'app_state.button_list.@each.image',
    'app_state.button_list.@each.original_image',
    function() {
      this.sync_sentence_from_button_list();
    }
  ),

  utterance_show_symbols: computed('app_state.referenced_user.preferences.device.utterance_text_only', function() {
    return !this.get('app_state.referenced_user.preferences.device.utterance_text_only');
  }),

  utterance_text_on_top: computed('app_state.referenced_user.preferences.device.button_text_position', function() {
    var pos = this.get('app_state.referenced_user.preferences.device.button_text_position') || 'top';
    return pos === 'top';
  }),

  quick_buttons: computed(function() {
    return [
      { id: 'yes', label: i18n.t('quick_yes', "Yes"), icon: '\u2705' },
      { id: 'no', label: i18n.t('quick_no', "No"), icon: '\u274C' },
      { id: 'please', label: i18n.t('quick_please', "Please"), icon: '\uD83D\uDE4F' },
      { id: 'thank_you', label: i18n.t('quick_thank_you', "Thank you"), icon: '\uD83D\uDE0A' },
      { id: 'help_me', label: i18n.t('quick_help_me', "Help me"), icon: '\uD83C\uDD98' },
      { id: 'wait', label: i18n.t('quick_wait', "Wait"), icon: '\u23F8' }
    ];
  }),

  categories: computed(function() {
    return [
      { id: 'all', label: i18n.t('category_all', "All") },
      { id: 'people', label: i18n.t('category_people', "People") },
      { id: 'actions', label: i18n.t('category_actions', "Actions") },
      { id: 'feelings', label: i18n.t('category_feelings', "Feelings") },
      { id: 'food_drink', label: i18n.t('category_food_drink', "Food & Drink") },
      { id: 'places', label: i18n.t('category_places', "Places") },
      { id: 'descriptors', label: i18n.t('category_descriptors', "Descriptors") }
    ];
  }),

  pos_categories: computed(function() {
    return [
      { id: 'all', label: i18n.t('category_all', "All"), css_class: null },
      { id: 'pronoun', label: i18n.t('category_pronoun', "Pronouns"), css_class: 'pronoun' },
      { id: 'verb', label: i18n.t('category_verb', "Verbs"), css_class: 'verb' },
      { id: 'adjective', label: i18n.t('category_descriptor', "Descriptors"), css_class: 'adjective' },
      { id: 'noun', label: i18n.t('category_noun', "Nouns"), css_class: 'noun' },
      { id: 'social', label: i18n.t('category_social', "Social"), css_class: 'social' },
      { id: 'negation', label: i18n.t('category_negatives', "Negatives"), css_class: 'negation' },
      { id: 'question', label: i18n.t('category_questions', "Questions"), css_class: 'question' },
      { id: 'preposition', label: i18n.t('category_prepositions', "Prepositions"), css_class: 'preposition' },
      { id: 'adverb', label: i18n.t('category_adverbs', "Adverbs"), css_class: 'adverb' },
      { id: 'determiner', label: i18n.t('category_determiners', "Determiners"), css_class: 'determiner' },
      { id: 'conjunction', label: i18n.t('category_conjunctions', "Conjunctions"), css_class: 'conjunction' },
      { id: 'other', label: i18n.t('category_other', "Other"), css_class: 'other' },
      { id: 'folder', label: i18n.t('category_folders', "Folders"), css_class: 'folder' }
    ];
  }),

  active_filter_label: computed('active_category', 'pos_categories', function() {
    var cat = this.get('active_category');
    if(!cat || cat === 'all') { return null; }
    var cats = this.get('pos_categories') || [];
    var match = cats.find(function(c) { return c.id === cat; });
    return match ? match.label : null;
  }),

  active_filter_css: computed('active_category', 'pos_categories', function() {
    var cat = this.get('active_category');
    if(!cat || cat === 'all') { return null; }
    var cats = this.get('pos_categories') || [];
    var match = cats.find(function(c) { return c.id === cat; });
    return match ? match.css_class : null;
  }),

  pos_type_categories: computed(function() {
    return [
      { id: 'pronoun', label: i18n.t('category_pronoun', "Pronouns"), css_class: 'pronoun' },
      { id: 'verb', label: i18n.t('category_verb', "Verbs"), css_class: 'verb' },
      { id: 'adjective', label: i18n.t('category_descriptor', "Descriptors"), css_class: 'adjective' },
      { id: 'noun', label: i18n.t('category_noun', "Nouns"), css_class: 'noun' },
      { id: 'social', label: i18n.t('category_social', "Social"), css_class: 'social' },
      { id: 'negation', label: i18n.t('category_negatives', "Negatives"), css_class: 'negation' },
      { id: 'question', label: i18n.t('category_questions', "Questions"), css_class: 'question' },
      { id: 'preposition', label: i18n.t('category_prepositions', "Prepositions"), css_class: 'preposition' },
      { id: 'adverb', label: i18n.t('category_adverbs', "Adverbs"), css_class: 'adverb' },
      { id: 'determiner', label: i18n.t('category_determiners', "Determiners"), css_class: 'determiner' },
      { id: 'conjunction', label: i18n.t('category_conjunctions', "Conjunctions"), css_class: 'conjunction' },
      { id: 'other', label: i18n.t('category_other', "Other"), css_class: 'other' }
    ];
  }),

  color_picker_swatches: computed('app_state.currentUser.preferences.symbol_background', function() {
    // Dep on `symbol_background` makes the swatches refresh when the user
    // picks Colored Soft (or any other bg variant) — without it, this
    // computed runs once at controller creation and the toolbar keeps
    // showing the original Fitzgerald hexes even after `set_fitzgerald_scope`
    // has swapped <html> to `.fitzgerald-soft` and invalidated the JS palette
    // cache. The `app_state.*` path mirrors what `pending_display_prefs` and
    // `display_prefs_current_symbol_background_id` use elsewhere in this file.
    var darken = function(color) {
      if(window.tinycolor) {
        return window.tinycolor(color).darken(30).toHexString();
      }
      return color;
    };
    var color_pos_class = function(color) {
      if(color.pos_class) { return color.pos_class; }
      if(color.types && color.types.length) { return color.types[0]; }
      return null;
    };
    // Toolbar paint swatches derive their hex values from the Fitzgerald palette.
    var pos_labels = {
      pronoun:     i18n.t('swatch_pronoun', "Pronoun"),
      verb:        i18n.t('swatch_verb', "Verb"),
      adjective:   i18n.t('swatch_descriptor', "Descriptor"),
      noun:        i18n.t('swatch_noun', "Noun"),
      social:      i18n.t('swatch_social', "Social"),
      negation:    i18n.t('swatch_negative', "Negative"),
      question:    i18n.t('swatch_question', "Question"),
      preposition: i18n.t('swatch_preposition', "Preposition"),
      adverb:      i18n.t('swatch_adverb', "Adverb"),
      determiner:  i18n.t('swatch_determiner', "Determiner"),
      conjunction: i18n.t('swatch_conjunction', "Conjunction"),
      other:       i18n.t('swatch_other', "Other"),
      contrast:    i18n.t('swatch_contrast', "Contrast")
    };
    var palette = (window.LingoLinq && window.LingoLinq.board_detail_keyed_colors) || [];
    var swatches = palette
      .filter(function(c) { return color_pos_class(c) && pos_labels[color_pos_class(c)]; })
      .map(function(c) {
        var pos_class = color_pos_class(c);
        var s = { label: pos_labels[pos_class], pos_class: pos_class, bg: c.fill };
        if(c.border) { s.border = c.border; }
        return s;
      });
    swatches.forEach(function(s) {
      if(!s.border) {
        s.border = (s.bg === '#fff' || s.bg === '#FFFFFF') ? '#eee' : darken(s.bg);
      }
    });
    return swatches;
  }),

  color_legend_items: computed(function() {
    return [
      { type: i18n.t('legend_pronoun', "Pronouns"), parts: i18n.t('legend_pronoun_ex', "I, you, he, she, we"), css_class: 'pronoun' },
      { type: i18n.t('legend_verb', "Verbs"), parts: i18n.t('legend_verb_ex', "go, want, eat, play, care"), css_class: 'verb' },
      { type: i18n.t('legend_descriptor', "Descriptors"), parts: i18n.t('legend_descriptor_ex', "big, happy, fast, more"), css_class: 'adjective' },
      { type: i18n.t('legend_noun', "Nouns"), parts: i18n.t('legend_noun_ex', "cat, water, home, school"), css_class: 'noun' },
      { type: i18n.t('legend_social', "Social"), parts: i18n.t('legend_social_ex', "please, hello, thank you"), css_class: 'social' },
      { type: i18n.t('legend_determiner', "Determiners"), parts: i18n.t('legend_determiner_ex', "the, a, this, that"), css_class: 'determiner' },
      { type: i18n.t('legend_conjunction', "Conjunctions"), parts: i18n.t('legend_conjunction_ex', "and, or, but, if"), css_class: 'conjunction' },
      { type: i18n.t('legend_negatives', "Negatives"), parts: i18n.t('legend_negatives_ex', "no, not, don't, stop"), css_class: 'negation' },
      { type: i18n.t('legend_questions', "Questions"), parts: i18n.t('legend_questions_ex', "what, where, who, why"), css_class: 'question' },
      { type: i18n.t('legend_prepositions', "Prepositions"), parts: i18n.t('legend_prepositions_ex', "in, on, to, with"), css_class: 'preposition' },
      { type: i18n.t('legend_adverb', "Adverbs"), parts: i18n.t('legend_adverb_ex', "quickly, very, well, always"), css_class: 'adverb' },
      { type: i18n.t('legend_other', "Other"), parts: i18n.t('legend_other_ex', "miscellaneous words"), css_class: 'other' },
      { type: i18n.t('legend_contrast', "Contrast"), parts: i18n.t('legend_contrast_ex', "high contrast buttons"), css_class: 'contrast' },
      { type: i18n.t('legend_folder', "Folder"), parts: i18n.t('legend_folder_ex', "links to another board"), css_class: 'folder' }
    ];
  }),

  // ── Shared Pipeline (editManager) ──
  // These methods match the original board/index.js controller pattern.
  // editManager is set up by the route's setupController.

  // Snapshot of the board name at load time (for rename detection on save)
  _original_board_name: null,

  // Build display buttons from raw API data (proven approach)
  _build_from_raw: function(raw) {
    // Short-circuit if the user has clicked Exit Speak Mode / Exit to Home —
    // building out the button grid while navigating away just wastes CPU and
    // can cause observer churn on a torn-down controller.
    if(this.get('_exiting') || this.isDestroyed || this.isDestroying) { return; }
    /* After deleteRecord()+save, exiting speak mode still schedules
       processButtons → here. Ember Data forbids set() on deleted records
       ("Attempted to set 'buttons' on the deleted record"). Bail early. */
    var modelForGuard = this.get('model');
    if(modelForGuard && typeof modelForGuard.get === 'function' && modelForGuard.get('isDeleted')) {
      return;
    }
    var _this = this;
    if(!(raw.images && raw.images.length)) {
      if(_this._board_detail_images && _this._board_detail_images.length) {
        raw.images = _this._board_detail_images;
      } else {
        var cached_raw = boardDetailCache.get(raw.key || raw.id);
        if(cached_raw && cached_raw.images && cached_raw.images.length) {
          raw.images = cached_raw.images;
        }
      }
    }
    if(raw.images && raw.images.length) {
      _this._board_detail_images = raw.images;
    }
    var skin = _this.get('app_state.referenced_user.preferences.skin');
    var preferred_symbols = _this.get('app_state.referenced_user.preferences.preferred_symbols');
    if(preferred_symbols && preferred_symbols !== 'original') {
      _this._preferred_symbols = preferred_symbols;
    } else {
      _this._preferred_symbols = null;
    }
    var use_ember = _this.get('edit_mode');
    var current_level = _this._current_board_level();
    var board_has_levels = (raw.buttons || []).some(function(b) {
      return b && b.level_modifications && Object.keys(b.level_modifications).length > 0;
    });
    var cache_token = (raw.key || raw.id);
    var cache_ctx = {
      preferred_symbols: _this._preferred_symbols,
      skin: skin || null,
      edit_mode: !!use_ember,
      label_locale: _this.get('app_state.label_locale') || null,
      url_cache_primed: !!persistence.primed,
      board_level: current_level,
      board_has_levels: board_has_levels
    };
    // Cache hit — skip skin_image_map and the full grid rebuild loop.
    if(!use_ember && cache_token) {
      var cached_ob_early = boardDetailCache.get_ordered_buttons(cache_token, cache_ctx);
      if(cached_ob_early) {
        var prev_early = _this._last_raw;
        var is_same_board_early = prev_early && raw && ((prev_early.id && raw.id && prev_early.id === raw.id) || (prev_early.key && raw.key && prev_early.key === raw.key));
        if(!is_same_board_early) {
          _this.set('_hidden_row_stack', []);
          _this.set('_hidden_col_stack', []);
        }
        _this._last_raw = raw;
        if(_this._board_detail_images && _this._board_detail_images.length) {
          _this._last_raw.images = _this._board_detail_images;
        }
        var board_early = _this.get('model');
        if(board_early && board_early.set && !(board_early.get && board_early.get('isDeleted'))) {
          if(raw.translations !== undefined) { board_early.set('translations', raw.translations); }
          if(raw.buttons !== undefined) { board_early.set('buttons', raw.buttons); }
          if(raw.locale !== undefined) { board_early.set('locale', raw.locale); }
        }
        _this.set('ordered_buttons', cached_ob_early);
        _this._apply_focus_dim_to_ordered_buttons();
        _this._apply_display_locales_to_ordered_buttons();
        _this._preload_grid_images(cached_ob_early);
        return;
      }
    }
    var image_map = raw.image_urls || {};
    (raw.images || []).forEach(function(img) {
      if(img && img.id) {
        var url = (_this._preferred_symbols && img.skin_url) ? img.skin_url : img.url; // library preferred_symbols only
        if(url) {
          image_map[String(img.id)] = url;
        }
      }
    });
    image_map = LingoLinq.Board.skin_image_map(image_map, skin, { persistence: persistence });
    // Cache raw data for preference-triggered rebuilds
    // Reset the row/column hide stacks when the user actually navigates to a
    // DIFFERENT board. Same-board refetches (post-save reload, pref changes,
    // etc) preserve the stacks so "click − to hide, save, click + to
    // restore" works end-to-end within an edit session.
    var prev = _this._last_raw;
    var is_same_board = prev && raw && ((prev.id && raw.id && prev.id === raw.id) || (prev.key && raw.key && prev.key === raw.key));
    if(!is_same_board) {
      _this.set('_hidden_row_stack', []);
      _this.set('_hidden_col_stack', []);
    }
    _this._last_raw = raw;
    if(_this._board_detail_images && _this._board_detail_images.length) {
      _this._last_raw.images = _this._board_detail_images;
    }
    _this._image_map = image_map;

    var board = _this.get('model');
    if(board && board.get && !raw.translations && board.get('translations')) {
      raw.translations = board.get('translations');
    }
    if(board && board.set && !(board.get && board.get('isDeleted'))) {
      if(raw.translations !== undefined) { board.set('translations', raw.translations); }
      if(raw.buttons !== undefined) { board.set('buttons', raw.buttons); }
      if(raw.locale !== undefined) { board.set('locale', raw.locale); }
      if(raw.translated_locales !== undefined) { board.set('translated_locales', raw.translated_locales); }
    }
    var label_locale = _this.get('app_state.label_locale') || raw.locale || 'en';
    var vocalization_locale = _this.get('app_state.vocalization_locale') || raw.locale || 'en';
    var grid = raw.grid;

    if(!grid || !grid.order) {
      var buttons = (raw.buttons || []).map(function(btn) {
        var localized = _this._localized_button_fields(btn, raw, label_locale, vocalization_locale);
        var display_btn = Object.assign({}, btn, localized);
        return use_ember ? _this._make_ember_btn(display_btn, image_map, board) : _this._make_btn(display_btn, image_map, current_level, board_has_levels);
      });
      _this.set('ordered_buttons', [buttons]);
      _this._apply_focus_dim_to_ordered_buttons();
      _this._preload_grid_images([buttons]);
      if(!use_ember && cache_token) {
        boardDetailCache.set_ordered_buttons(cache_token, [buttons], cache_ctx);
      }
      return;
    }

    var button_map = {};
    (raw.buttons || []).forEach(function(btn) {
      if(btn && btn.id !== undefined) { button_map[String(btn.id)] = btn; }
    });

    var result = [];
    for(var ri = 0; ri < grid.rows; ri++) {
      var row = [];
      for(var ci = 0; ci < grid.columns; ci++) {
        var btn_id = (grid.order[ri] || [])[ci];
        var raw_btn = btn_id !== null && btn_id !== undefined ? button_map[String(btn_id)] : null;
        if(raw_btn) {
          var localized = _this._localized_button_fields(raw_btn, raw, label_locale, vocalization_locale);
          var display_btn = Object.assign({}, raw_btn, localized);
          row.push(use_ember ? _this._make_ember_btn(display_btn, image_map, board) : _this._make_btn(display_btn, image_map, current_level, board_has_levels));
        } else {
          if(use_ember) {
            var fake = editManager.Button.create({ empty: true, label: '', id: btn_id || ('fake_' + ri + '_' + ci) });
            fake.set('board', board);
            row.push(fake);
          } else {
            row.push({ id: btn_id || ('fake_' + ri + '_' + ci), label: '', empty: true, pos_class: 'default' });
          }
        }
      }
      result.push(row);
    }
    _this.set('ordered_buttons', result);

    _this._apply_focus_dim_to_ordered_buttons();
    // Warm the browser image cache before clearing any active loading
    // overlay. Without this the user sees the grid appear instantly but
    // images load in one-by-one over the next second or two, which reads
    // as a janky "filling-in" effect. Browser HTTP cache covers repeat
    // visits — but on first entry, on symbol-library switches, or after
    // a level change, the images are cold and need to be fetched.
    _this._preload_grid_images(result);

    // Resolve POS for untyped buttons
    if(!use_ember) {
      _this.resolve_unknown_buttons(_this.get('flat_ordered_buttons') || []);
      _this._apply_display_locales_to_ordered_buttons();
      // Cache the freshly-built grid so subsequent navigations to this
      // board can skip the rebuild loop entirely.
      if(cache_token) {
        boardDetailCache.set_ordered_buttons(cache_token, result, cache_ctx);
      }
    }

    /* Re-baseline the record's dirty attributes now that the build is done.
       Building a board WRITES `translations` / `buttons` / `translated_locales` onto the
       record (above), so it is dirty before the user has touched anything — measured on a
       freshly opened editor. "Exit to Home" tells a clean edit session from a dirty one by
       comparing against this, so it has to be taken AFTER the build, not when the edit route
       sets up: there the record is still clean and the baseline came out empty, which made
       every session look changed. */
    _this.capture_edit_baseline();
  },

  _translation_entry_from_raw: function(translations, button_id, locale) {
    var trans = translations || {};
    var entry = trans[button_id];
    if(!entry && button_id != null) {
      entry = trans[String(button_id)];
    }
    if(!entry || !locale) { return null; }
    return entry[locale] || entry[locale.split(/-|_/)[0]] || null;
  },

  _localized_button_fields: function(btn, raw, label_locale, vocalization_locale) {
    if(!btn) { return { label: '', vocalization: '' }; }
    var board_locale = (raw && raw.locale) || 'en';
    var trans = (raw && raw.translations) || {};
    label_locale = label_locale || board_locale;
    vocalization_locale = vocalization_locale || board_locale;
    var board_root = board_locale.split(/-|_/)[0];
    var label_root = label_locale.split(/-|_/)[0];
    var vocalization_root = vocalization_locale.split(/-|_/)[0];
    var label = btn.label;
    var vocalization = btn.vocalization;
    /* A vocalization beginning ':' or '+' is an ACTION, not a word — ':suggestion' marks a
       word-prediction slot, '+q' appends a letter, ':shift' and ':space' do what they say.
       It has no translation, and NOTHING below may replace it with the label or clear it.

       This is not cosmetic. `edit_manager.process_for_saving` drops a button's vocalization
       when it equals the label, so a display copy flattened here is SAVED without it — and
       a board that entered edit mode through the in-app "Edit Board" control (which reuses
       these copies rather than rebuilding from `contextualized_buttons`) loses every special
       vocalization on the board the first time it is saved: all thirty-three of them on a
       core board, keyboard keys included. Measured on `vocal-flair-112_1`, which has 112
       buttons and 0 vocalizations where its sibling copy has 33.

       `models/board.js#translated_buttons` has always guarded the identical assignment with
       `has_special_vocalization`; this path did not. */
    var special_vocalization = /^[:+]/.test(String(btn.vocalization || ''));
    var label_trans = this._translation_entry_from_raw(trans, btn.id, label_locale);
    var vocalization_trans = this._translation_entry_from_raw(trans, btn.id, vocalization_locale);
    if(label_trans && label_trans.label) {
      if(label_root !== board_root || label_trans.label !== label) {
        label = label_trans.label;
      }
    }
    if(special_vocalization) {
      vocalization = btn.vocalization;
    } else if(vocalization_root !== board_root) {
      if(vocalization_trans && (vocalization_trans.vocalization || vocalization_trans.label)) {
        vocalization = vocalization_trans.vocalization || vocalization_trans.label;
      } else {
        vocalization = null;
      }
    } else if(label_locale === vocalization_locale && label && label !== btn.label) {
      if(vocalization_trans && (vocalization_trans.vocalization || vocalization_trans.label)) {
        vocalization = vocalization_trans.vocalization || vocalization_trans.label;
      } else if(!btn.vocalization || btn.vocalization === btn.label) {
        vocalization = label;
      }
    }
    if(!special_vocalization && label_locale === vocalization_locale && label && (!vocalization || vocalization === btn.vocalization || vocalization === btn.label)) {
      vocalization = label;
    }
    return {
      label: label || '',
      vocalization: vocalization || '',
      /* The LAST rule above replaces the vocalization with the label whenever the two
         locales match and nothing else claimed it — which includes a special action like
         `:suggestion`, so by the time anything downstream reads this button the only mark
         that it is a word-prediction SLOT is gone. (`board.js#translated_buttons` guards
         the same assignment with `has_special_vocalization`; this one does not. Left
         alone here: changing what a button vocalizes changes what it SAYS, which is not
         this change's business.) Carried as a separate flag so the grid can group these
         three cells as Predictions instead of filing them by colour with the Connectors,
         and so nothing about activation moves. */
      suggestion_slot: btn.vocalization === ':suggestion',
      /* The button's label in the board's OWN source locale — `label` above is already
         localized. `category_for_button` files YES and TIME off this, so translating a
         board cannot move a button between categories. */
      base_label: btn.label
    };
  },

  // board-detail renders labels from ordered_buttons plain objects, not
  // fast_html. Overlay translated label/vocalization for the active
  // Switch Languages selection so the grid and speak path stay aligned.
  _apply_display_locales_to_ordered_buttons: function() {
    if(this.get('edit_mode')) { return; }
    var raw = this._last_raw;
    var ob = this.get('ordered_buttons');
    if(!raw || !ob || !ob.length) { return; }
    var app_state = this.get('app_state');
    var label_locale = app_state && app_state.get('label_locale');
    var vocalization_locale = app_state && app_state.get('vocalization_locale');
    var board = this.get('model');
    if(board && board.set && raw.translations) {
      board.set('translations', raw.translations);
    }
    var _this = this;
    var raw_btn_map = {};
    (raw.buttons || []).forEach(function(btn) {
      if(btn && btn.id != null) { raw_btn_map[String(btn.id)] = btn; }
    });
    var changed = false;
    var newOb = ob.map(function(row) {
      return (row || []).map(function(btn) {
        if(!btn || btn.id == null) { return btn; }
        var raw_btn = raw_btn_map[String(btn.id)] || btn;
        var localized = _this._localized_button_fields(raw_btn, raw, label_locale, vocalization_locale);
        if((localized.label || '') === (btn.label || '') && (localized.vocalization || '') === (btn.vocalization || '')) {
          return btn;
        }
        changed = true;
        return Object.assign({}, btn, localized);
      });
    });
    if(changed) {
      if(board && board.set) {
        board.set('last_cb', null);
        if(board.get('fast_html')) { board.set('fast_html', null); }
      }
      this.set('ordered_buttons', newOb);
    }
  },

  // Prefer a locally-synced copy from persistence.url_cache when available
  // (same lookup order as Board#render_fast_html).
  _resolve_cached_image_url: function(remote_url) {
    if(!remote_url) { return null; }
    var url_cache = persistence.url_cache;
    if(!url_cache) { return remote_url; }
    var url_uncache = persistence.url_uncache;
    var try_url = function(u) {
      if(!u) { return null; }
      if(url_uncache && url_uncache[u]) { return null; }
      var cached = url_cache[u];
      if(cached && cached !== false) { return cached; }
      return null;
    };
    var cached = try_url(remote_url);
    if(cached) { return cached; }
    var unvarianted = remote_url.replace(/\.variant-.+\.(png|svg)$/, '');
    if(unvarianted !== remote_url) {
      if(LingoLinq.Board.is_skin_tone_variant_url(remote_url)) {
        try_url(unvarianted);
      } else {
        cached = try_url(unvarianted);
        if(cached) { return cached; }
      }
    }
    var alt_url = null;
    if(remote_url.match(/^https\:\/\/s3\.amazonaws\.com\/opensymbols\//)) {
      alt_url = remote_url.replace(/^https\:\/\/s3\.amazonaws\.com\/opensymbols\//, 'https://d18vdu4p71yql0.cloudfront.net/');
    } else if(remote_url.match(/^https\:\/\/opensymbols\.s3\.amazonaws\.com\//)) {
      alt_url = remote_url.replace(/^https\:\/\/opensymbols\.s3\.amazonaws\.com\//, 'https://d18vdu4p71yql0.cloudfront.net/');
    }
    if(alt_url) {
      cached = try_url(alt_url);
      if(cached) { return cached; }
    }
    return remote_url;
  },

  // The board level the grid is currently filtered to, as an int 1..10 (10 = full
  // vocab / filter off). Single source for the render path (_process_raw_board) and
  // the activation path (_resolve_action_src) so a tapped button's link options are
  // resolved at the SAME level the rendered button was filtered by.
  _current_board_level: function() {
    var stashed = parseInt(this.get('stashes.board_level'), 10);
    return (stashed >= 1 && stashed <= 10) ? stashed : 10;
  },

  // Resolve a button's level-rule overrides at the current display level.
  //
  // Walks `pre` → 0..level → `override` over a working copy seeded from the raw
  // button, so the returned object is "what this button's attributes actually are
  // at this level". Level rules can override `hidden` (the level filter) but also
  // the LINK attributes — `link_disabled` in particular is set this way by paint
  // mode (edit_manager.js `paint_mode.level == 'link_disabled'`), plus
  // `home_lock` / `add_to_vocalization` / `add_vocalization` (see
  // Button.LEVEL_BOOL_ATTRS).
  //
  // Values are returned RAW (still possibly the strings "true"/"false" that
  // legacy/copied boards persist) — callers coerce with
  // `Button.coerce_level_value` for the attribute they care about, which is the
  // single source of truth for which attributes are boolean-ish.
  //
  // Extracted from _make_btn so `select_button` resolves link actions through the
  // SAME rules the rendered button was filtered by — reading the raw board.buttons
  // entry directly would silently ignore every level rule.
  _resolve_level_attrs: function(btn, level) {
    var working = {
      hidden: btn.hidden,
      link_disabled: btn.link_disabled,
      home_lock: btn.home_lock,
      add_to_vocalization: btn.add_to_vocalization,
      add_vocalization: btn.add_vocalization
    };
    var mods = btn && btn.level_modifications;
    if(!mods || !level || level >= 10) { return working; }
    var keys = ['pre'];
    for(var k = 0; k <= level; k++) { keys.push(k); }
    keys.push('override');
    keys.forEach(function(key) {
      if(mods[key]) {
        for(var attr in mods[key]) { working[attr] = mods[key][attr]; }
      }
    });
    return working;
  },

  // Authoritative action fields for the button the user just tapped.
  //
  // Prefers the raw `board.buttons` entry (updated in place by Button Settings via
  // editManager.change_button, so it reflects a just-made edit before the display
  // copies rebuild), then runs the LINK OPTION flags back through the level rules
  // and the boolean coercion — the raw entry is un-levelled and may hold the
  // strings "true"/"false", so consuming it directly would both ignore level rules
  // (paint mode sets `link_disabled` that way) and invert on legacy boards.
  //
  // Returns a plain object; `load_board` / `url` / `video` / `book` come through
  // untouched, only the four boolean-ish option flags are resolved.
  _resolve_action_src: function(button, btn_id) {
    var raw = null;
    var board = this.get('model');
    if(board && board.get && btn_id != null) {
      var buttons = board.get('buttons') || [];
      for(var i = 0; i < buttons.length; i++) {
        if(buttons[i] && String(buttons[i].id) === String(btn_id)) { raw = buttons[i]; break; }
      }
    }
    // No authoritative entry (board not loaded / id absent) — the display copy is
    // already level-resolved and coerced by _make_btn, so use it as-is.
    if(!raw) { return button; }
    var level_attrs = this._resolve_level_attrs(raw, this._current_board_level());
    var src = Object.assign({}, raw);
    src.link_disabled = Button.coerce_level_value('link_disabled', level_attrs.link_disabled);
    src.home_lock = Button.coerce_level_value('home_lock', level_attrs.home_lock);
    src.add_to_vocalization = Button.coerce_level_value('add_to_vocalization', level_attrs.add_to_vocalization);
    src.add_vocalization = (level_attrs.add_vocalization == null)
      ? null
      : Button.coerce_level_value('add_vocalization', level_attrs.add_vocalization);
    return src;
  },

  // The editManager Button for `btn_id`, with its action fields refreshed from the
  // authoritative source resolved by _resolve_action_src.
  //
  // editManager.find_button builds the Button from `ordered_buttons` (the rendered
  // display copies), so after an in-place Button Settings edit it can still hold the
  // pre-edit action. Overlaying the resolved fields means activate_button always
  // acts on the button as it is NOW — a folder just switched to a URL link opens the
  // URL on the very next tap instead of navigating to the old board.
  _em_button_with_current_actions: function(btn_id, action_src) {
    var em_button = editManager.find_button(btn_id);
    if(!em_button || typeof em_button.set !== 'function' || !action_src || action_src === em_button) {
      return em_button;
    }
    ['load_board', 'url', 'video', 'book', 'apps', 'integration',
     'link_disabled', 'home_lock', 'add_to_vocalization', 'add_vocalization'].forEach(function(attr) {
      em_button.set(attr, action_src[attr]);
    });
    return em_button;
  },

  _make_btn: function(btn, image_map, level, board_has_levels) {
    var img_url = null;
    if(btn.image_id && image_map) {
      if(this._preferred_symbols && image_map[btn.image_id + '-' + this._preferred_symbols]) {
        img_url = image_map[btn.image_id + '-' + this._preferred_symbols];
      } else if(image_map[btn.image_id]) {
        img_url = image_map[btn.image_id];
      }
    }
    var image_fallback_url = null;
    if(img_url) {
      img_url = this._resolve_cached_image_url(img_url);
      if(LingoLinq.Board.is_skin_tone_variant_url(img_url)) {
        image_fallback_url = LingoLinq.Board.unskin_tone_variant_url(img_url);
        if(image_fallback_url === img_url) { image_fallback_url = null; }
      }
    }
    var text_symbol = !img_url && !!btn.label && !btn.load_board;
    // Speak-mode level filter: decide whether the level filter should
    // visually hide this button at the current level. We compute it
    // into `display_as_hidden` (a plain bool that mirrors the Ember
    // Button computed of the same name) so the template's existing
    // `--hidden` class binding picks it up. We deliberately do NOT
    // touch `hidden` — the raw author-intent flag stays intact so
    // edit-mode rendering and any other code path that reads
    // btn.hidden gets the original value. At level 10 (or no level)
    // the filter is off and display_as_hidden stays false.
    var display_as_hidden = false;
    var level_attrs = this._resolve_level_attrs(btn, level);
    if(level && level < 10) {
      if(btn.level_modifications) {
        display_as_hidden = Button.coerce_level_value('hidden', level_attrs.hidden);
      } else if(board_has_levels) {
        // Untagged at level < 10 on a board that DOES use levels — the
        // level filter excludes unpromoted buttons. Without this, picking
        // a low level on a partially-tagged board would surface every
        // untagged button, defeating the filter. GATED on
        // board_has_levels: on a board with NO level rules at all, level
        // selection is meaningless and must not hide anything (a stale
        // stashes.board_level from another board would otherwise blank
        // the whole board once the speak-hide CSS removes the cards).
        display_as_hidden = true;
      }
    }
    return {
      id: btn.id,
      label: btn.label || '',
      vocalization: btn.vocalization || '',
      image_url: img_url,
      image_fallback_url: image_fallback_url,
      image_id: btn.image_id,
      text_symbol: text_symbol,
      load_board: btn.load_board,
      // Action + option fields — MUST be carried onto the speak-mode display button.
      // This object is a hand-picked subset (unlike edit-mode's _make_ember_btn, which
      // Button.create()s the full button), so anything omitted here silently vanishes on
      // every speak-mode re-render: the tapped button loses its url/video/action, and
      // reopening Button Settings (which reads this display copy via find_button) shows
      // the field cleared. Keep this list in sync with the Button action attributes the
      // modal edits and select_button/activation reads.
      url: btn.url,
      video: btn.video,
      book: btn.book,
      apps: btn.apps,
      integration: btn.integration,
      // The four link OPTION flags are level-resolved and coerced here (not copied
      // raw) so the display button carries the value that actually applies at the
      // current level, already a real boolean — legacy/copied boards persist these
      // as the strings "true"/"false", where `!!"false"` inverts the meaning.
      add_to_vocalization: Button.coerce_level_value('add_to_vocalization', level_attrs.add_to_vocalization),
      add_vocalization: (level_attrs.add_vocalization == null) ? null : Button.coerce_level_value('add_vocalization', level_attrs.add_vocalization),
      home_lock: Button.coerce_level_value('home_lock', level_attrs.home_lock),
      link_disabled: Button.coerce_level_value('link_disabled', level_attrs.link_disabled),
      sound_id: btn.sound_id,
      hidden: btn.hidden,
      hide_label: !!btn.hide_label,
      display_as_hidden: display_as_hidden,
      part_of_speech: btn.part_of_speech || btn.painted_part_of_speech || btn.suggested_part_of_speech,
      background_color: btn.background_color || null,
      border_color: (btn.background_color && window.tinycolor) ? window.tinycolor(btn.background_color).darken(20).toRgbString() : (btn.border_color || null),
      text_color: (function() {
        if(!btn.background_color || !window.tinycolor) { return null; }
        return window.tinycolor.mostReadable(btn.background_color, ['#fff', '#000']).toRgbString();
      })(),
      level_modifications: btn.level_modifications,
      /* A word-prediction SLOT. Carried as a flag of its own because the thing that
         identifies it does not survive to the grid: by render time the slot has been
         dressed as the word it is currently offering, so its label is the prediction and
         the `:suggestion` vocalization is gone. Without this `category_for_button` sees an
         ordinary white word button and files it by colour, which on the core boards puts
         three cells that change under the user in the middle of the Connectors. */
      suggestion_slot: (btn.vocalization === ':suggestion') || !!btn.suggestion_slot,
      base_label: btn.base_label != null ? btn.base_label : btn.label,
      empty: !(btn.label || btn.image_id)
    };
  },

  _make_ember_btn: function(btn, image_map, board) {
    var img_url = null;
    if(btn.image_id && image_map) {
      if(this._preferred_symbols && image_map[btn.image_id + '-' + this._preferred_symbols]) {
        img_url = image_map[btn.image_id + '-' + this._preferred_symbols];
      } else if(image_map[btn.image_id]) {
        img_url = image_map[btn.image_id];
      }
    }
    if(img_url) {
      img_url = this._resolve_cached_image_url(img_url);
    }
    var more_args = { board: board };
    if(img_url) { more_args.image_url = img_url; }
    var button = editManager.Button.create(btn, more_args);
    button.set('text_symbol', !img_url && !!btn.label && !btn.load_board);
    // Explicitly carry hide_label onto the Ember button so the modern grid can hide
    // the label ("Hide the label when the picture is shown"). Without this the class
    // flashed via the classic fast-HTML paint, then the Ember grid re-rendered without
    // it (Button.create doesn't reliably propagate it — same reason the level path in
    // edit_manager sets it explicitly).
    button.set('hide_label', !!btn.hide_label);
    /* Set explicitly for exactly the reason `hide_label` above is: `Button.create` does not
       reliably carry a plain field through. Without it the word-prediction slots group by
       their (white) colour in EDIT mode and land in Connectors, while the speak-mode copy —
       which builds a plain object and so keeps the field — puts them in Predictions. Two
       makers, one rule; both have to say it. */
    button.set('suggestion_slot', !!btn.suggestion_slot);
    button.set('base_label', btn.base_label != null ? btn.base_label : btn.label);
    if(btn.background_color && window.tinycolor) {
      button.set('border_color', window.tinycolor(btn.background_color).darken(20).toRgbString());
    }
    return button;
  },

  processButtons: function() {
    // Rebuild display from _last_raw. Callers that just wrote a save
    // payload onto model.buttons MUST sync that payload into _last_raw
    // first (see saveButtonChanges) — otherwise this clobbers the save
    // with a pre-edit snapshot (notably newly assigned image_ids).
    var model = this.get('model');
    if(model && typeof model.get === 'function' && model.get('isDeleted')) {
      return;
    }
    if(this._last_raw) {
      this._build_from_raw(this._last_raw);
    }
  },

  /**
   * Board-detail builds its own `ordered_buttons` grid (plain objects). Mutating `dim` / `focus_word_match`
   * in place does not reliably re-run `{{if btn.dim}}` in the template; shallow-copy non-Ember buttons
   * so Glimmer updates class bindings. Focus/dim flags come from `board.contextualized_buttons`, which
   * does a direct label match against `focus_words.list` — no hierarchy walk, no button-set regeneration.
   */
  _finalizeFocusDimGrid: function(ob) {
    var newOb = ob.map(function(row) {
      return row.map(function(btn) {
        if (!btn) { return btn; }
        if (btn.empty) { return btn; }
        if (typeof btn.set === 'function') { return btn; }
        return Object.assign({}, btn);
      });
    });
    this.set('ordered_buttons', newOb);
  },

  _apply_focus_dim_to_ordered_buttons: function() {
    var board = this.get('model');
    var appState = this.get('app_state');
    var ob = this.get('ordered_buttons');
    if (!board || !ob) {
      return;
    }

    // Track whether any button's focus/dim state actually CHANGED. The
    // `_focus_dim_observer` fires per-tap (Ember dep chains for
    // app_state.focus_words / sessionUser.id / referenced_user.id all
    // re-emit identity-changed events on session restores and on each
    // utterance update, even when the underlying values stayed the
    // same). Without this gate, `_finalizeFocusDimGrid` ran on every
    // tap and replaced the entire `ordered_buttons` array with
    // brand-new Object.assign() clones — Glimmer saw new identity for
    // every cell and tore down + re-mounted every `<img>`, which read
    // as "all images re-render on every button press."
    var anyChanged = false;

    var walk = function(fn) {
      ob.forEach(function(row) {
        row.forEach(function(btn) {
          if (btn && !btn.empty) { fn(btn); }
        });
      });
    };

    var setDim = function(btn, on) {
      var next = !!on;
      var current;
      if (btn.set) {
        current = !!btn.get('dim');
        if (current !== next) {
          anyChanged = true;
          btn.set('dim', next);
        }
      } else {
        current = !!btn.dim;
        if (current !== next) {
          anyChanged = true;
          if (!next) { delete btn.dim; }
          else { btn.dim = true; }
        }
      }
    };

    var setFocusMatch = function(btn, on) {
      var next = !!on;
      var current;
      if (btn.set) {
        current = !!btn.get('focus_word_match');
        if (current !== next) {
          anyChanged = true;
          btn.set('focus_word_match', next);
        }
      } else {
        current = !!btn.focus_word_match;
        if (current !== next) {
          anyChanged = true;
          if (!next) { delete btn.focus_word_match; }
          else { btn.focus_word_match = true; }
        }
      }
    };

    var applyFocusState = function(btn, dimMap, matchMap) {
      var id = String(btn.id);
      if (dimMap[id] !== undefined) {
        setDim(btn, dimMap[id]);
      } else {
        setDim(btn, false);
      }
      if (matchMap[id] !== undefined) {
        setFocusMatch(btn, matchMap[id]);
      } else {
        setFocusMatch(btn, false);
      }
      try {
        boundClasses.add_classes(btn);
      } catch (e) { /* plain object / missing fields */ }
    };

    if (!appState.get('focus_words')) {
      walk(function(btn) {
        setDim(btn, false);
        setFocusMatch(btn, false);
        try {
          boundClasses.add_classes(btn);
        } catch (e) { /* skip */ }
      });
      if (anyChanged) { this._finalizeFocusDimGrid(ob); }
      return;
    }

    var fw = appState.get('focus_words');
    var fwUser = fw.user_id;
    var sessUser = appState.get('sessionUser.id');
    var refUser = appState.get('referenced_user.id');
    var userOk = fwUser == null || fwUser === '' ||
      String(fwUser) === String(sessUser) ||
      (refUser != null && refUser !== '' && String(fwUser) === String(refUser));
    if (!userOk) {
      walk(function(btn) {
        setDim(btn, false);
        setFocusMatch(btn, false);
        try {
          boundClasses.add_classes(btn);
        } catch (e) { /* skip */ }
      });
      if (anyChanged) { this._finalizeFocusDimGrid(ob); }
      return;
    }

    var contextualized = board.contextualized_buttons(
      appState.get('label_locale'),
      appState.get('vocalization_locale'),
      this.get('stashes.working_vocalization'),
      false,
      appState.get('inflection_shift')
    );
    var dimMap = {};
    var matchMap = {};
    (contextualized || []).forEach(function(b) {
      dimMap[String(b.id)] = !!b.dim;
      matchMap[String(b.id)] = !!b.focus_word_match;
    });

    walk(function(btn) {
      applyFocusState(btn, dimMap, matchMap);
    });
    if (anyChanged) { this._finalizeFocusDimGrid(ob); }
  },

  _apply_shift_to_ordered_buttons: function() {
    var appState = this.get('app_state');
    var board = this.get('model');
    var ob = this.get('ordered_buttons');
    if(!appState || !board || !ob || !ob.length) { return; }
    var cap = !!appState.get('shift');
    var history = this.get('stashes.working_vocalization') || [];
    var contextualized = board.contextualized_buttons(
      appState.get('label_locale'),
      appState.get('vocalization_locale'),
      history,
      false,
      appState.get('inflection_shift')
    );
    var labelMap = {};
    (contextualized || []).forEach(function(button) {
      if((button.vocalization || '').match(/^:/)) { return; }
      var base = button.original_label || button.label;
      var str = base;
      if(button.tweaked) {
        var revert = (history.length === 0 && !appState.get('inflection_shift'));
        str = revert ? base : button.label;
      }
      labelMap[String(button.id)] = cap ? utterance.capitalize(str) : str;
    });
    var changed = false;
    var newOb = ob.map(function(row) {
      return (row || []).map(function(btn) {
        if(!btn || btn.id == null || btn.empty) { return btn; }
        var next = labelMap[String(btn.id)];
        if(next == null || btn.label === next) { return btn; }
        changed = true;
        return Object.assign({}, btn, { label: next });
      });
    });
    if(changed) {
      this.set('ordered_buttons', newOb);
    }
  },

  _shift_label_observer: observer(
    'app_state.shift',
    'ordered_buttons',
    function() {
      this._apply_shift_to_ordered_buttons();
    }
  ),

  /**
   * Warm the browser cache for every image URL referenced by
   * `ordered_buttons`. Fire-and-forget — does NOT block rendering and
   * does NOT show a loading overlay (per UX requirement: board-detail
   * never displays a "Loading board…" message). The grid paints
   * immediately and individual `<img>` tags pull from the warmed
   * cache as they mount.
   */
  _preload_grid_images: function(ordered_buttons) {
    if(!ordered_buttons || !ordered_buttons.length) { return; }
    var urls = {};
    ordered_buttons.forEach(function(row) {
      (row || []).forEach(function(btn) {
        var url = btn && (btn.image_url || (btn.get && btn.get('image_url')));
        if(url) { urls[url] = true; }
      });
    });
    for(var url in urls) {
      try { var img = new Image(); img.src = url; } catch(e) { /* ignore */ }
    }
  },

  _focus_dim_observer: observer(
    'app_state.focus_words',
    'app_state.focus_words.list',
    'app_state.sessionUser.id',
    'app_state.referenced_user.id',
    'model.id',
    'model.global_id',
    'app_state.label_locale',
    'app_state.vocalization_locale',
    function() {
      this._apply_focus_dim_to_ordered_buttons();
    }
  ),

  update_button_symbol_class: function() {
    var buttons = this.get('model.buttons');
    if(buttons) {
      boundClasses.add_rules(buttons);
    }
  },

  // Re-build buttons when display preferences change.
  //
  // The Ember dep keys fire whenever any link in the chain changes
  // identity, NOT just when the leaf value changes — and periodic
  // session restores (every few seconds) re-push the user record into
  // the store with the SAME values. Without a value-comparison gate
  // this re-fired `_build_from_raw` continuously, tearing down and
  // re-mounting every `<img>` in the grid on every observed re-push
  // (and on every button tap that triggers utterance state which
  // re-resolves `referenced_user`). Cache the last observed leaf
  // values and skip the rebuild when nothing actually changed.
  _rebuild_on_pref_change: observer(
    'app_state.referenced_user.preferences.preferred_symbols',
    'app_state.referenced_user.preferences.skin',
    'app_state.referenced_user.preferences.symbol_background',
    'app_state.referenced_user.preferences.high_contrast',
    'app_state.referenced_user.preferences.device.button_text_position',
    'app_state.currentUser.preferences.preferred_symbols',
    'app_state.currentUser.preferences.skin',
    'app_state.currentUser.preferences.symbol_background',
    'app_state.currentUser.preferences.high_contrast',
    function() {
      if(!this._last_raw) { return; }
      var pref_user = this._pref_user_for_display();
      var preferred_symbols = (pref_user && pref_user.get('preferences.preferred_symbols')) || null;
      var skin = (pref_user && pref_user.get('preferences.skin')) || null;
      var symbol_background = (pref_user && pref_user.get('preferences.symbol_background')) || null;
      var high_contrast = !!(pref_user && pref_user.get('preferences.high_contrast'));
      var text_pos = (pref_user && pref_user.get('preferences.device.button_text_position')) || null;
      if(
        this._last_pref_preferred_symbols === preferred_symbols &&
        this._last_pref_skin === skin &&
        this._last_pref_symbol_background === symbol_background &&
        this._last_pref_high_contrast === high_contrast &&
        this._last_pref_text_pos === text_pos
      ) {
        return;
      }
      this._last_pref_preferred_symbols = preferred_symbols;
      this._last_pref_skin = skin;
      this._last_pref_symbol_background = symbol_background;
      this._last_pref_high_contrast = high_contrast;
      this._last_pref_text_pos = text_pos;
      this._build_from_raw(this._last_raw);
    }
  ),

  check_for_share_approval: observer(
    'model.id',
    'app_state.currentUser.pending_board_shares',
    'app_state.default_mode',
    'app_state.speak_mode',
    function() { runShareApprovalCheck(this, this.app_state); }
  ),

  update_current_board_state: observer(
    'model.id',
    'model.global_id',
    'model.integration',
    'model.integration_name',
    'model.locale',
    'model.locales',
    function() { runBoardStateSync(this, this.app_state); }
  ),

  /* Re-fetch and rebuild this board's grid whenever a board-set mutation
     finishes (translate, swap_images, slice-locales, privacy change…).
     `app_state.board_reload_key` is the project-wide signal those flows
     bump after their server-side progress completes. The model record
     itself gets reloaded by the originating modal, but the rendered
     buttons here come from `_last_raw` — a cached plain-object payload
     built from `persistence.ajax('/api/v1/boards/:key')`, not directly
     from model attributes. Without this observer the labels stay stale
     until the user manually reloads or transitions away. Mirrors the
     same fetch/normalize/cache/build sequence used after Save. */
  _refresh_on_board_reload_key: observer('app_state.board_reload_key', function() {
    if(this.isDestroyed || this.isDestroying) { return; }
    if(this.get('_exiting')) { return; }
    var board = this.get('model');
    if(!board || !board.get) { return; }
    var key = board.get('key');
    if(!key) { return; }
    var _this = this;
    persistence.ajax('/api/v1/boards/' + key, { type: 'GET' }).then(function(data) {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      var merged = boardDetailCache.normalize_board_payload(data);
      if(!merged) { return; }
      if(merged.images && merged.images.length) {
        _this._board_detail_images = merged.images;
      }
      boardDetailCache.set(JSON.parse(JSON.stringify(merged)), { force: true });
      _this._build_from_raw(merged);
      if(_this.get('edit_mode') && editManager.controller === _this) {
        editManager.process_for_displaying(true);
      }
    }, function() {
      /* Network or auth failure — leave the stale render in place
         rather than blanking the grid. Next route activation will
         retry naturally. */
    });
  }),

  _refresh_labels_for_locale: observer('app_state.label_locale', 'app_state.vocalization_locale', function() {
    if(this.isDestroyed || this.isDestroying || this.get('_exiting') || this.get('edit_mode')) { return; }
    if(!this.get('ordered_buttons')) { return; }
    var _this = this;
    scheduleOnce('afterRender', this, function() {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      _this._apply_display_locales_to_ordered_buttons();
    });
  }),

  reload_on_connect: observer('persistence.online', function() {
    runReloadOnConnect(this, this.persistence);
  }),

  bg_class: computed('model.background.position', function() {
    return computeBgClass(this.model);
  }),
  bg_style: computed(
    'model.background.image',
    'model.grid.rows',
    'model.grid.columns',
    'model.background.position',
    'model.background.color',
    function() { return computeBgStyle(this.model); }
  ),
  bg_img_style: computed(
    'model.background.image',
    'model.grid.rows',
    'model.grid.columns',
    'model.background.position',
    function() { return computeBgImgStyle(this.model); }
  ),

  nothing_visible: computed('model.nothing_visible', function() {
    return this.get('model.nothing_visible');
  }),
  nothing_visible_not_edit: computed('nothing_visible', 'edit_mode', function() {
    return this.get('nothing_visible') && !this.get('edit_mode');
  }),

  retrying: false,
  // The error state's HEADING — the plain statement of what happened. Rendered as
  // the <h2>; `error_detail` below carries the explanation.
  error_message: computed('model.id', 'model.error', 'persistence.online', function() {
    if(this.get('model.id')) { return null; }
    if(this.persistence && this.persistence.get('online')) {
      return i18n.t('error_not_available', "This board is not currently available.");
    } else {
      return i18n.t('error_no_local', "This board is not available offline.");
    }
  }),
  // The explanation under the heading. The route cannot tell these causes apart —
  // a 404, a permission change and a dropped connection all reject identically —
  // so this names the realistic possibilities instead of asserting one. The online
  // copy is deliberately non-alarming: the most common cause is a transient
  // failure during the login burst (which the route now retries once), and
  // nothing else about the account is affected. Saying so stops a momentary
  // network blip reading as "my boards are gone".
  error_detail: computed('model.id', 'model.error', 'persistence.online', function() {
    if(this.get('model.id')) { return null; }
    if(this.persistence && this.persistence.get('online')) {
      return i18n.t('board_error_detail', "It may have been renamed, moved, or deleted — or the connection dropped while it was loading. Nothing else on your account is affected.");
    }
    return i18n.t('board_error_offline_detail', "You are not connected right now, and this board is not saved on this device yet. Reconnect to open it, or choose a board you have already saved.");
  }),
  /* Broken-board recovery: Home when the referenced communicator (or
     current user) has a home board or a session entry board to land on. */
  error_show_home: computed(
    'app_state.referenced_user.preferences.home_board.key',
    'app_state.currentUser.preferences.home_board.key',
    'app_state.board_detail_entry_board.user_name',
    'app_state.board_detail_entry_board.boardname',
    function() {
      if(this.get('app_state.referenced_user.preferences.home_board.key')) { return true; }
      if(this.get('app_state.currentUser.preferences.home_board.key')) { return true; }
      var entry = this.get('app_state.board_detail_entry_board');
      return !!(entry && entry.user_name && entry.boardname);
    }
  ),
  /* Exit Speak is supervisor-facing (supporter role or actively modeling).
     Communicators stay in speak mode and use Home / Back instead. */
  error_show_exit_speak: computed(
    'app_state.speak_mode',
    'app_state.currentUser.supporter_role',
    'app_state.modeling',
    function() {
      if(!this.get('app_state.speak_mode')) { return false; }
      return !!(this.get('app_state.currentUser.supporter_role') || this.get('app_state.modeling'));
    }
  ),

  description_info_expanded: false,
  cc_license: computed('model.license.type', function() {
    return (this.get('model.license.type') || '').match(/^CC\s/);
  }),
  pd_license: computed('model.license.type', function() {
    return this.get('model.license.type') == 'public domain';
  }),
  has_info_icons: computed(function() {
    // A privacy pill (Public or Private) always renders now, so the info-icons
    // wrapper is always populated; license icons are additive.
    return true;
  }),

  // No-ops: board-detail uses CSS grid, not computed height or canvas
  computeHeight: function() { },
  redraw_if_needed: function() { },

  // Word suggestions
  suggestions: null,
  show_word_suggestions: computed('edit_mode', 'app_state.referenced_user.preferences.word_suggestions', function() {
    // Global user preference gates word prediction in speak mode. NEW users get
    // it ON at registration (user.rb generate_defaults, new_record? only); for
    // everyone else only an explicit `true` shows it (null/undefined = off), so
    // existing users are never silently enabled. Never shown in edit mode.
    if(this.get('edit_mode')) { return false; }
    return this.get('app_state.referenced_user.preferences.word_suggestions') === true;
  }),
  // On/off state of word prediction (only an explicit `true` is on; null = off),
  // used by the BOARD SETTINGS → Word Prediction toggle — independent of
  // edit_mode, unlike show_word_suggestions which is always false while editing.
  word_suggestions_enabled: computed('app_state.referenced_user.preferences.word_suggestions', function() {
    return this.get('app_state.referenced_user.preferences.word_suggestions') === true;
  }),
  // Where word prediction renders in speak mode (user pref). 'speak_bar' /
  // 'side_rail' pin a layout at all widths via a shell class; 'auto' keeps the
  // responsive in-bar/rail switch (empty class). Default (unset) is 'side_rail'
  // — a vertical rail just left of the sidebar — matching user.rb
  // preference_defaults. See app.scss ".md-shell--wordpred-*" rules.
  word_suggestion_position_class: computed('app_state.referenced_user.preferences.word_suggestion_position', function() {
    var pos = this.get('app_state.referenced_user.preferences.word_suggestion_position') || 'side_rail';
    if(pos === 'speak_bar') { return 'md-shell--wordpred-speak-bar'; }
    if(pos === 'side_rail') { return 'md-shell--wordpred-side-rail'; }
    return '';
  }),
  // ── Word-prediction position selector (edit-mode BOARD SETTINGS section) ──
  // The current placement value (default 'auto'), the dropdown's open state,
  // its options, and the label for the active option. Mirrors the Sentence Bar
  // size dropdown's bindings in the same panel.
  word_prediction_position_dropdown_open: false,
  word_suggestion_position_value: computed('app_state.referenced_user.preferences.word_suggestion_position', function() {
    return this.get('app_state.referenced_user.preferences.word_suggestion_position') || 'side_rail';
  }),
  word_prediction_position_options: computed(function() {
    return [
      { id: 'auto', label: i18n.t('word_prediction_pos_auto', "Best fit for the screen") },
      { id: 'speak_bar', label: i18n.t('word_prediction_pos_speak_bar', "Inside the speak bar") },
      { id: 'side_rail', label: i18n.t('word_prediction_pos_side_rail', "To the right of the board") }
    ];
  }),
  word_prediction_position_label: computed('word_suggestion_position_value', function() {
    var val = this.get('word_suggestion_position_value');
    var match = (this.get('word_prediction_position_options') || []).find(function(o) { return o.id === val; });
    return match ? match.label : i18n.t('word_prediction_pos_auto', "Best fit for the screen");
  }),

  _suggestion_lookup_context: function() {
    var button_list = this.get('app_state.button_list') || [];
    if(button_list.length) {
      var last_button = button_list[button_list.length - 1];
      var current_button = null;
      if(last_button && last_button.in_progress) {
        current_button = last_button;
        last_button = button_list[button_list.length - 2];
      }
      return {
        last_finished_word: ((last_button && (last_button.vocalization || last_button.label)) || '').toLowerCase(),
        word_in_progress: ((current_button && (current_button.vocalization || current_button.label)) || '').toLowerCase(),
        sentence: button_list.map(function(b) {
          return (b.vocalization || b.label || '').replace(/^:/, '');
        }).join(' ').trim()
      };
    }

    var parts = this.get('sentence_parts') || [];
    if(!parts.length) { return null; }
    var last_part = parts[parts.length - 1];
    var current_part = null;
    if(last_part && last_part.in_progress) {
      current_part = last_part;
      last_part = parts[parts.length - 2];
    }
    return {
      last_finished_word: ((last_part && last_part.label) || '').toLowerCase(),
      word_in_progress: ((current_part && current_part.label) || '').toLowerCase(),
      sentence: parts.map(function(p) { return p.label || ''; }).join(' ').trim()
    };
  },

  _word_prediction_locale: function() {
    var raw = this._last_raw || {};
    return this.get('app_state.label_locale') ||
      this.get('model.locale') ||
      raw.locale ||
      this.get('app_state.currentBoardState.default_locale') ||
      'en';
  },

  _word_prediction_lookup_options: function(context, warmed_sets) {
    var raw = this._last_raw || {};
    var model = this.get('model');
    return {
      last_finished_word: context.last_finished_word,
      word_in_progress: context.word_in_progress,
      topic_context: (model && model.get && model.get('name')) || '',
      sentence: context.sentence,
      locale: this._word_prediction_locale(),
      board_locale: (model && model.get && model.get('locale')) || raw.locale || 'en',
      translations: (model && model.get && model.get('translations')) || raw.translations,
      board_ids: wordSuggestionsModule.lookup_board_ids(
        this.get('app_state'),
        this.get('stashes'),
        [this.get('model.id')]
      ),
      button_sets: warmed_sets
    };
  },

  _apply_suggestion_results: function(result, sentence, context) {
    var _this = this;
    if(_this.isDestroyed || _this.isDestroying) { return; }
    (result || []).forEach(function(word) {
      word.image_update = function() {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        var current = _this.get('suggestions');
        if(current && current.list) {
          _this.set('suggestions', { ready: true, list: current.list.slice() });
        }
        if(typeof _this.sync_sentence_from_button_list === 'function') {
          _this.sync_sentence_from_button_list();
        }
      };
    });
    if(result && result.length > 0) {
      var decorated = _this._decorate_suggestion_images(result);
      _this.set('suggestions', { ready: true, list: decorated });
      return;
    }
    if(!sentence) {
      _this.set('suggestions', { ready: true, list: [] });
      return;
    }
    if(context && context.word_in_progress) {
      _this.set('suggestions', { ready: true, list: [] });
      return;
    }
    _this.set('suggestions', { loading: true });
    aiPredictor.predict(sentence, {
      locale: _this._word_prediction_locale(),
      appState: _this.get('app_state')
    }).then(function(words) {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      var list = (words || []).map(function(w) { return { word: w }; });
      _this.set('suggestions', { ready: true, list: _this._decorate_suggestion_images(list) });
    }, function() {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      _this.set('suggestions', { ready: true, list: [] });
    });
  },

  _run_suggestion_lookup: function(warmed_sets) {
    var _this = this;
    this.set('_last_warmed_button_sets', warmed_sets || []);
    var context = this._suggestion_lookup_context();
    if(!context) {
      this.set('suggestions', null);
      return;
    }
    if(typeof wordSuggestionsModule.lookup !== 'function') { return; }

    var lookup_token = (this.get('_suggestion_lookup_token') || 0) + 1;
    this.set('_suggestion_lookup_token', lookup_token);

    var lookup_ids = wordSuggestionsModule.lookup_board_ids(
      _this.get('app_state'),
      _this.get('stashes'),
      [_this.get('model.id')]
    );
    var lookup_options = _this._word_prediction_lookup_options(context, warmed_sets);
    lookup_options.board_ids = lookup_ids;
    var lookup_promise = typeof wordSuggestionsModule.lookup_with_ai === 'function' ?
      wordSuggestionsModule.lookup_with_ai(lookup_options) :
      wordSuggestionsModule.lookup(lookup_options);

    lookup_promise.then(function(result) {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      if(lookup_token !== _this.get('_suggestion_lookup_token')) { return; }
      _this._apply_suggestion_results(result, context.sentence, context);
    }, function() {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      if(lookup_token !== _this.get('_suggestion_lookup_token')) { return; }
      _this.set('suggestions', { ready: true, list: [] });
    });
  },

  updateSuggestions: observer(
    'edit_mode',
    'app_state.referenced_user.preferences.word_suggestions',
    'app_state.button_list',
    'app_state.button_list.[]',
    'app_state.button_list.@each.in_progress',
    'app_state.button_list.@each.label',
    'app_state.button_list.@each.vocalization',
    'app_state.label_locale',
    'app_state.vocalization_locale',
    'sentence_parts.[]',
    'sentence_parts.@each.label',
    'sentence_parts.@each.in_progress',
    'model.locale',
    function() {
      // Skip the lookup entirely when in edit mode or word prediction is off
      // (only an explicit `true` enables it; null/undefined = off).
      if(this.get('edit_mode') || this.get('app_state.referenced_user.preferences.word_suggestions') !== true) {
        this.set('suggestions', null);
        return;
      }
      var _this = this;
      var context = this._suggestion_lookup_context();
      if(!context) {
        this.set('suggestions', null);
        return;
      }

      var lookup_ids = wordSuggestionsModule.lookup_board_ids(
        _this.get('app_state'),
        _this.get('stashes'),
        [_this.get('model.id')]
      );
      var fallback_sets = wordSuggestionsModule.button_sets_for_board_ids(lookup_ids);
      wordSuggestionsModule.load_vocabulary_button_sets(
        _this.get('app_state'),
        _this.get('stashes'),
        [_this.get('model.id')]
      ).then(function(warmed_sets) {
        _this._run_suggestion_lookup(warmed_sets);
      }, function() {
        _this._run_suggestion_lookup(fallback_sets);
      });
    }
  ),

  has_rendered_material: computed('ordered_buttons', function() {
    return !!(this.get('ordered_buttons'));
  }),

  // ── Display Preferences Panel (edit mode) ──
  // Static option lists for the display preferences modal.
  button_spacing_options: [
    { id: 'minimal', label: 'Minimal' },
    { id: 'extra-small', label: 'Extra Small' },
    { id: 'small', label: 'Small' },
    { id: 'medium', label: 'Medium' },
    { id: 'large', label: 'Large' },
    { id: 'huge', label: 'Huge' },
    { id: 'none', label: 'None' }
  ],
  button_border_options: [
    { id: 'none', label: 'None' },
    { id: 'small', label: 'Small' },
    { id: 'medium', label: 'Medium' },
    { id: 'large', label: 'Large' },
    { id: 'huge', label: 'Huge' }
  ],
  button_text_options: [
    { id: 'small', label: 'Small' },
    { id: 'medium', label: 'Medium' },
    { id: 'large', label: 'Large' },
    { id: 'huge', label: 'Huge' }
  ],
  button_text_position_options: [
    { id: 'none', label: 'Default' },
    { id: 'top', label: 'Top' },
    { id: 'bottom', label: 'Bottom' },
    { id: 'text_only', label: 'Text Only' }
  ],
  button_style_options: [
    { id: 'architects_daughter',       label: "Architect's Daughter" },
    { id: 'architects_daughter_caps',  label: "Architect's Daughter (caps)" },
    { id: 'architects_daughter_small', label: "Architect's Daughter (small)" },
    { id: 'arial',                     label: 'Arial' },
    { id: 'arial_caps',                label: 'Arial (caps)' },
    { id: 'arial_small',               label: 'Arial (small)' },
    { id: 'comic_sans',                label: 'Comic Sans' },
    { id: 'comic_sans_caps',           label: 'Comic Sans (caps)' },
    { id: 'comic_sans_small',          label: 'Comic Sans (small)' },
    { id: 'default',                   label: 'Default' },
    { id: 'default_caps',              label: 'Default (caps)' },
    { id: 'default_small',             label: 'Default (small)' },
    { id: 'open_dyslexic',             label: 'Open Dyslexic' },
    { id: 'open_dyslexic_caps',        label: 'Open Dyslexic (caps)' },
    { id: 'open_dyslexic_small',       label: 'Open Dyslexic (small)' },
    { divider: true },
    { id: 'brush_script',    label: 'Brush Script MT' },
    { id: 'calibri',         label: 'Calibri' },
    { id: 'cambria',         label: 'Cambria' },
    { id: 'chalkboard',      label: 'Chalkboard SE' },
    { id: 'consolas',        label: 'Consolas' },
    { id: 'courier_new',     label: 'Courier New' },
    { id: 'garamond',        label: 'Garamond' },
    { id: 'georgia',         label: 'Georgia' },
    { id: 'helvetica',       label: 'Helvetica' },
    { id: 'impact',          label: 'Impact' },
    { id: 'lucida_sans',     label: 'Lucida Sans' },
    { id: 'marker_felt',     label: 'Marker Felt' },
    { id: 'monaco',          label: 'Monaco' },
    { id: 'optima',          label: 'Optima' },
    { id: 'palatino',        label: 'Palatino' },
    { id: 'segoe_ui',        label: 'Segoe UI' },
    { id: 'snell_roundhand', label: 'Snell Roundhand' },
    { id: 'tahoma',          label: 'Tahoma' },
    { id: 'times_new_roman', label: 'Times New Roman' },
    { id: 'trebuchet',       label: 'Trebuchet MS' },
    { id: 'verdana',         label: 'Verdana' }
  ],
  hidden_buttons_options: [
    { id: 'grid', label: 'Show as Grid' },
    { id: 'hint', label: 'Show as Hint' },
    { id: 'hide', label: 'Hide' }
  ],
  stretch_buttons_options: [
    { id: 'none', label: 'None' },
    { id: 'prefer_tall', label: 'Prefer Tall' },
    { id: 'prefer_wide', label: 'Prefer Wide' }
  ],
  preferred_symbols_options: [
    { id: 'original', label: 'Original' },
    { id: 'opensymbols', label: 'OpenSymbols' },
    { id: 'arasaac', label: 'ARASAAC' },
    { id: 'twemoji', label: 'Twemoji' },
    { id: 'noun-project', label: 'Noun Project' },
    { id: 'lessonpix', label: 'LessonPix (Premium)' },
    { id: 'pcs', label: 'PCS (Premium)' },
    { id: 'symbolstix', label: 'SymbolStix (Premium)' },
    { id: 'tawasol', label: 'Tawasol' }
  ],
  // Options for the "Image Background" dropdown (parallel to
  // `symbolBackgroundList` on the user-preferences page).
  symbol_background_options: [
    { id: 'clear',         label: 'Colored' },
    { id: 'clear_soft',    label: 'Colored Soft' },
    { id: 'white',         label: 'White' },
    { id: 'black',         label: 'Black' },
    { id: 'high_contrast', label: 'High Contrast' }
  ],
  // Mirror of user/preferences.js#vocalizationHeightList — drives the
  // height of the speak-mode header (the sentence/vocalization bar) and
  // the size of fonts + symbol images inside it.
  voice_height_options: [
    { id: 'small',  label: 'Small (90px)' },
    { id: 'medium', label: 'Medium (100px)' },
    { id: 'large',  label: 'Large (150px)' },
    { id: 'huge',   label: 'Huge (200px)' }
  ],
  // Options for the "Words Combined" dropdown (the `device.utterance_text_only`
  // pref — stored as boolean but exposed as a select with labeled modes).
  words_combined_options: [
    { id: 'false', label: 'Symbol buttons' },
    { id: 'true',  label: 'Words only' }
  ],
  // Mirror for template use since `utterance_text_only` is boolean but the
  // <select> option value is a string.
  // Mirror for template use: preferences.device.utterance_text_only is a
  // boolean but the toolbar radio group's `aria-checked` / active-class
  // bindings compare against a string. Fall back to the live user pref
  // when More Settings isn't open (pending_display_prefs is null) so the
  // toolbar Speak Bar reflects the persisted setting at all times.
  utterance_text_only_str: computed(
    'pending_display_prefs.utterance_text_only',
    'app_state.currentUser.preferences.device.utterance_text_only',
    function() {
      var pending = this.get('pending_display_prefs');
      var current = pending
        ? pending.utterance_text_only
        : this.get('app_state.currentUser.preferences.device.utterance_text_only');
      return current ? 'true' : 'false';
    }
  ),
  // Simple prefix checks for the three compound skin variants. Concrete tones
  // (default/light/medium-light/medium/medium-dark/dark) compare directly
  // against pending_display_prefs.skin in the template — no indirection.
  // Skin computeds read current_display_prefs (which falls back to
  // user.preferences.skin when pending is null) so they work both
  // inside More Settings and in the right panel.
  skin_is_mix: computed('current_display_prefs.skin', function() {
    var s = this.get('current_display_prefs.skin') || '';
    return s === 'mix' || s.indexOf('mix::') === 0;
  }),
  skin_is_mix_only: computed('current_display_prefs.skin', function() {
    return (this.get('current_display_prefs.skin') || '').indexOf('mix_only') === 0;
  }),
  skin_is_mix_prefer: computed('current_display_prefs.skin', function() {
    return (this.get('current_display_prefs.skin') || '').indexOf('mix_prefer') === 0;
  }),

  // CSS modifier class for the mobile-collapse skin-tones dropdown trigger
  // swatch. The trigger renders as a single .md-settings-skin dot whose
  // appearance must mirror the currently-active inline swatch button. Mix
  // variants take precedence over the simple-tone string because the data
  // field encodes both: e.g. 'mix_only::limit-100100' still has
  // pending_display_prefs.skin starting with 'mix_only'. Simple tones
  // map directly except 'default', which uses the --original swatch class
  // (yellow Fitzgerald-neutral) following the existing template convention.
  display_prefs_current_skin_class: computed('pending_display_prefs.skin', 'skin_is_mix', 'skin_is_mix_only', 'skin_is_mix_prefer', function() {
    if(this.get('skin_is_mix_only'))   { return 'md-settings-skin--mix-only'; }
    if(this.get('skin_is_mix_prefer')) { return 'md-settings-skin--mix-prefer'; }
    if(this.get('skin_is_mix'))        { return 'md-settings-skin--mix'; }
    var skin = this.get('pending_display_prefs.skin') || 'default';
    if(skin === 'default') { return 'md-settings-skin--original'; }
    return 'md-settings-skin--' + skin;
  }),

  // Human-readable label for the currently-selected skin tone, used as
  // the tiny helper text below the swatch grid in the ≤640px popover.
  // Returns null for the mix_only/mix_prefer variants since their
  // suboptions row already provides context (the "Only:" / "Prefer:"
  // sublabel + suboption swatches make the mode self-evident).
  display_prefs_current_skin_label: computed('pending_display_prefs.skin', 'skin_is_mix', 'skin_is_mix_only', 'skin_is_mix_prefer', function() {
    if(this.get('skin_is_mix_only') || this.get('skin_is_mix_prefer')) { return null; }
    if(this.get('skin_is_mix')) { return i18n.t('skin_label_mix', "Mix of tones"); }
    var skin = this.get('pending_display_prefs.skin') || 'default';
    var labels = {
      'default':      i18n.t('skin_label_original',     "Original"),
      'light':        i18n.t('skin_label_light',        "Light"),
      'medium-light': i18n.t('skin_label_medium_light', "Medium Light"),
      'medium':       i18n.t('skin_label_medium',       "Medium"),
      'medium-dark':  i18n.t('skin_label_medium_dark',  "Medium Dark"),
      'dark':         i18n.t('skin_label_dark',         "Dark")
    };
    return labels[skin] || null;
  }),

  // Returns null when the skin isn't a mix_only/mix_prefer variant; otherwise
  // returns the 6 sub-tone options with their checked state derived from the
  // bitmask portion of the pref string.
  // True while the user is in "paint hidden" mode — clicking a board button
  // will mark it hidden. Drives the toolbar toggle's pressed state.
  paint_mode_is_hide: computed('paint_mode', function() {
    var pm = this.get('paint_mode');
    return !!(pm && pm.hidden === true);
  }),
  // True while the user is in "paint shown" mode — clicking a board button
  // will unhide it.
  paint_mode_is_show: computed('paint_mode', function() {
    var pm = this.get('paint_mode');
    return !!(pm && pm.hidden === false);
  }),

  // ──── Button Levels paint computeds ─────────────────────────────
  // The legacy paint-level modal sets `paint_mode = { level, attribute, paint_id }`.
  // We use the same shape, so any computed reading paint_mode.level reflects
  // whether a level paint is currently armed.
  level_paint_armed: computed('paint_mode', function() {
    var pm = this.get('paint_mode');
    return !!(pm && pm.level);
  }),
  // True for actions that need a level (hidden/link_disabled). 'clear' doesn't.
  level_paint_needs_level: computed('level_paint_action', function() {
    var a = this.get('level_paint_action');
    return a === 'hidden' || a === 'link_disabled';
  }),
  // True when the chosen action is one of the "add" variants
  // (hidden / link_disabled). The remove ('clear') action shows
  // inline with a red glow rather than collapsing to the banner,
  // so we gate the banner-collapse behavior on this.
  level_paint_action_is_add: computed('level_paint_action', function() {
    var a = this.get('level_paint_action');
    return a === 'hidden' || a === 'link_disabled';
  }),

  // (Previous observer that watched for the last level-rule
  // removal removed — Remove level rules is now an instant batch
  // action handled directly in set_level_paint_action.)
  // True when user has made enough selections to arm paint mode.
  level_paint_can_apply: computed('level_paint_action', 'level_paint_level', 'level_paint_needs_level', function() {
    if(!this.get('level_paint_action')) { return false; }
    if(!this.get('level_paint_needs_level')) { return true; } // clear
    return !!this.get('level_paint_level');
  }),
  // Available level options (1-10), filtering out the empty placeholder
  // entry that LingoLinq.board_levels carries for the legacy bound-select.
  level_paint_options: computed(function() {
    return (LingoLinq.board_levels || []).filter(function(l) { return l.id; });
  }),
  // Per-level color palette — modern Tailwind-inspired progression
  // (cool blues at lower levels → warmer / achievement-green at the
  // top). Keys are stringified level numbers so {{get}} can look
  // them up by opt.id from LingoLinq.board_levels.
  // Mirrors the same map in utils/button.js so the side-panel pill
  // and the button-card badge always agree.
  level_color_map: computed(function() {
    return {
      '1':  '#0EA5E9', // sky
      '2':  '#3B82F6', // blue
      '3':  '#6366F1', // indigo
      '4':  '#8B5CF6', // violet
      '5':  '#A855F7', // purple
      '6':  '#EC4899', // pink
      '7':  '#F43F5E', // rose
      '8':  '#F97316', // orange
      '9':  '#F59E0B', // amber
      '10': '#10B981'  // emerald (achievement / full vocab)
    };
  }),
  // Color for the Preview Levels badge — looks up the current
  // preview_level (number) in the same palette so the badge matches
  // the Step 2 pill that paints the same level.
  preview_level_color: computed('preview_level', 'level_color_map', function() {
    var lvl = this.get('preview_level');
    if(!lvl) { return null; }
    var map = this.get('level_color_map') || {};
    return map[String(lvl)] || null;
  }),

  // 1-10 as strings for the speak-mode level picker in the actions
  // menu's Session submenu. {{get level_color_map lvl}} works
  // because keys are strings.
  speak_level_options: computed(function() {
    return ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
  }),

  // Currently-selected board level (read from stashes — same source
  // board/index.js#current_level reads from). Falls back to the
  // board's default_level, then 10. Returned as a string so the
  // template's {{is-equal}} check matches the speak_level_options
  // entries.
  current_speak_level: computed(
    'stashes.board_level',
    function() {
      // Show the last level the supervisor selected (persisted in
      // stashes.board_level). If none was ever selected, default to 10
      // (full vocab) — matches toggle_levels_submenu's applied value so
      // the highlighted pill and the actually-filtered level always
      // agree.
      var lvl = parseInt(this.get('stashes.board_level'), 10);
      if(lvl >= 1 && lvl <= 10) { return String(lvl); }
      return '10';
    }
  ),
  // Counts how many cells on the board grid have at least one level
  // rule attached. Includes empty cells in the total since they're
  // still part of the grid the user is configuring. Used by the
  // Button Levels section to show progress like "3 of 24 buttons
  // have level rules". Mirrors the dependency keys used by
  // board/index.js#button_levels — @each.level_modifications +
  // levels_change — so the count updates reactively as the user
  // paints rules.
  button_level_count: computed('ordered_buttons.@each.level_modifications', 'levels_change', 'model.buttons.[]', 'model.id', function() {
    var rows = this.get('ordered_buttons') || [];
    var total = 0;
    var with_rules = 0;
    rows.forEach(function(row) {
      (row || []).forEach(function(btn) {
        if(!btn) { return; }
        total += 1;
        // Buttons in ordered_buttons can be plain objects (not Ember objects),
        // so guard .get — a bare btn.get('…') throws "btn.get is not a function".
        var mods = btn.get ? btn.get('level_modifications') : btn.level_modifications;
        if(mods && Object.keys(mods).length > 0) {
          with_rules += 1;
        }
      });
    });
    // Reset the levels_change flag so future edits can re-trigger
    // the computed (mirrors board/index.js#button_levels pattern).
    if(this.get('levels_change')) {
      var _this = this;
      next(function() {
        if(!_this.isDestroyed && !_this.isDestroying) {
          _this.set('levels_change', false);
        }
      });
    }
    return { with_rules: with_rules, total: total };
  }),
  // Human-readable summary of what's currently being painted.
  level_paint_active_summary: computed('paint_mode', function() {
    var pm = this.get('paint_mode');
    if(!pm || !pm.level) { return null; }
    if(pm.level === 'clear') {
      return i18n.t('level_paint_clearing_v2', "Removing level rules — click buttons to apply");
    }
    var phrase = pm.level === 'hidden'
      ? i18n.t('level_paint_show_starting_phrase', "Showing button starting at level")
      : i18n.t('level_paint_activate_folder_phrase', "Activating folder starting at level");
    return phrase + ' ' + pm.attribute + ' — ' + i18n.t('level_paint_click_to_apply', "click buttons to apply");
  }),

  skin_suboptions: computed('current_display_prefs.skin', function() {
    var s = this.get('current_display_prefs.skin') || '';
    var is_only = s.indexOf('mix_only') === 0;
    var is_prefer = s.indexOf('mix_prefer') === 0;
    if(!is_only && !is_prefer) { return null; }
    var bits = (s.split('limit-')[1] || '').slice(0, 6);
    var defs = [
      { id: 'default',       label: i18n.t('default_skin_tones',     "Original Skin Tone") },
      { id: 'dark',          label: i18n.t('dark_skin_tone',         "Dark Skin Tone") },
      { id: 'medium_dark',   label: i18n.t('medium_dark_skin_tone',  "Medium-Dark Skin Tone") },
      { id: 'medium',        label: i18n.t('medium_skin_tone',       "Medium Skin Tone") },
      { id: 'medium_light',  label: i18n.t('medium_light_skin_tone', "Medium-Light Skin Tone") },
      { id: 'light',         label: i18n.t('light_skin_tone',        "Light Skin Tone") }
    ];
    for(var i = 0; i < 6; i++) {
      var v = parseInt(bits[i] || '0', 10);
      defs[i].checked = is_only ? v > 0 : v > 1;
    }
    return defs;
  }),
  // Source-of-truth for display-pref active-state bindings. Returns the
  // pending snapshot when More Settings is open, or a synthetic snapshot
  // built from the live user preferences when not. Lets the same toolbar
  // markup work in both contexts (toolbar-direct and More Settings).
  current_display_prefs: computed(
    // Observe BOTH the pending object as a whole AND each individual
    // sub-property. Without the per-key observers a `set('pending_display_prefs.X', val)`
    // mutation wouldn't invalidate this computed in Ember 3.x — it tracks
    // sub-property changes only when the path is explicitly listed.
    'pending_display_prefs',
    'pending_display_prefs.button_text',
    'pending_display_prefs.button_text_position',
    'pending_display_prefs.button_style',
    'pending_display_prefs.button_spacing',
    'pending_display_prefs.button_border',
    'pending_display_prefs.utterance_text_only',
    'pending_display_prefs.preferred_symbols',
    'pending_display_prefs.symbol_background',
    'pending_display_prefs.high_contrast',
    'pending_display_prefs.hidden_buttons',
    'pending_display_prefs.stretch_buttons',
    'pending_display_prefs.skin',
    'pending_display_prefs.vocalization_height',
    'app_state.currentUser.preferences.device.button_text',
    'app_state.currentUser.preferences.device.button_text_position',
    'app_state.currentUser.preferences.device.button_style',
    'app_state.currentUser.preferences.device.button_spacing',
    'app_state.currentUser.preferences.device.button_border',
    'app_state.currentUser.preferences.device.utterance_text_only',
    'app_state.currentUser.preferences.device.vocalization_height',
    'app_state.currentUser.preferences.preferred_symbols',
    'app_state.currentUser.preferences.symbol_background',
    'app_state.currentUser.preferences.high_contrast',
    'app_state.currentUser.preferences.hidden_buttons',
    'app_state.currentUser.preferences.stretch_buttons',
    'app_state.currentUser.preferences.skin',
    'app_state.referenced_user.preferences.preferred_symbols',
    'app_state.referenced_user.preferences.symbol_background',
    'app_state.referenced_user.preferences.high_contrast',
    'app_state.referenced_user.preferences.skin',
    function() {
      var pending = this.get('pending_display_prefs');
      if(pending) { return pending; }
      var pref_user = this._pref_user_for_display();
      var current_prefs = this.get('app_state.currentUser.preferences') || {};
      var sym_prefs = (pref_user && pref_user.get('preferences')) || current_prefs;
      var device = current_prefs.device || {};
      return {
        button_spacing:       device.button_spacing       || 'medium',
        button_border:        device.button_border        || 'medium',
        button_text:          device.button_text          || 'medium',
        button_text_position: device.button_text_position || 'bottom',
        button_style:         device.button_style         || 'default',
        vocalization_height:  device.vocalization_height  || 'medium',
        hidden_buttons:       current_prefs.hidden_buttons        || 'grid',
        stretch_buttons:      current_prefs.stretch_buttons       || 'none',
        preferred_symbols:    sym_prefs.preferred_symbols     || 'original',
        symbol_background:    sym_prefs.symbol_background     || 'clear',
        high_contrast:        !!sym_prefs.high_contrast,
        utterance_text_only:  !!device.utterance_text_only,
        skin:                 sym_prefs.skin                  || 'default'
      };
    }
  ),
  // Computed limits for stepper buttons — disable ± when at an end
  display_prefs_text_size_at_min: computed('current_display_prefs.button_text', function() {
    var idx = ['small', 'medium', 'large', 'huge'].indexOf(this.get('current_display_prefs.button_text'));
    return idx <= 0;
  }),
  display_prefs_text_size_at_max: computed('current_display_prefs.button_text', function() {
    var idx = ['small', 'medium', 'large', 'huge'].indexOf(this.get('current_display_prefs.button_text'));
    return idx >= 3;
  }),
  // current_display_prefs falls back to live user prefs when pending
  // is null, so these computeds work in BOTH contexts: the center
  // toolbar (which seeds pending when More Settings opens) and the
  // right panel (which never seeds pending). Without the fallback the
  // stepper's "thinner"/"tighter" buttons stayed perpetually disabled
  // outside More Settings.
  display_prefs_border_at_min: computed('current_display_prefs.button_border', function() {
    var idx = ['none', 'small', 'medium', 'large', 'huge'].indexOf(this.get('current_display_prefs.button_border'));
    return idx <= 0;
  }),
  display_prefs_border_at_max: computed('current_display_prefs.button_border', function() {
    var idx = ['none', 'small', 'medium', 'large', 'huge'].indexOf(this.get('current_display_prefs.button_border'));
    return idx >= 4;
  }),
  display_prefs_spacing_at_min: computed('current_display_prefs.button_spacing', function() {
    var idx = ['none', 'minimal', 'extra-small', 'small', 'medium', 'large', 'huge'].indexOf(this.get('current_display_prefs.button_spacing'));
    return idx <= 0;
  }),
  display_prefs_spacing_at_max: computed('current_display_prefs.button_spacing', function() {
    var idx = ['none', 'minimal', 'extra-small', 'small', 'medium', 'large', 'huge'].indexOf(this.get('current_display_prefs.button_spacing'));
    return idx >= 6;
  }),
  grid_rows_at_min: computed('current_grid.rows', function() {
    return (this.get('current_grid.rows') || 0) <= 1;
  }),
  grid_cols_at_min: computed('current_grid.columns', function() {
    return (this.get('current_grid.columns') || 0) <= 1;
  }),

  display_prefs_current_font_label: computed('current_display_prefs.button_style', 'button_style_options', function() {
    var current = this.get('current_display_prefs.button_style');
    var opts = this.get('button_style_options') || [];
    var match = opts.find(function(o) { return o.id === current; });
    return match ? match.label : 'Default';
  }),

  display_prefs_font_filter: '',

  /** Filtered font list driven by the dropdown's search input. Empty filter
   *  returns the full list (with divider). When filtering, drops the divider
   *  since section grouping is no longer meaningful. */
  filtered_button_style_options: computed('button_style_options', 'display_prefs_font_filter', function() {
    var opts = this.get('button_style_options') || [];
    var q = (this.get('display_prefs_font_filter') || '').trim().toLowerCase();
    if(!q) { return opts; }
    return opts.filter(function(o) {
      if(o.divider) { return false; }
      return (o.label || '').toLowerCase().indexOf(q) !== -1;
    });
  }),

  display_prefs_current_symbol_library_label: computed('pending_display_prefs.preferred_symbols', 'preferred_symbols_options', function() {
    var current = this.get('pending_display_prefs.preferred_symbols');
    var opts = this.get('preferred_symbols_options') || [];
    var match = opts.find(function(o) { return o.id === current; });
    return match ? match.label : 'Original';
  }),

  // "Image Background" dropdown combines two underlying prefs: symbol_background
  // (clear/white/black) and high_contrast (boolean). When high_contrast is on,
  // the dropdown displays "High Contrast" regardless of the stored
  // symbol_background value, so the two prefs appear as a single 4-option list
  // to the user.
  // Falls back to the live user prefs when pending_display_prefs is null
  // (e.g. right-panel use where the center "More Settings" panel hasn't been
  // opened) so the dropdown reflects the current setting at all times.
  // Mirrors the utterance_text_only_str pattern above.
  display_prefs_current_symbol_background_id: computed(
    'pending_display_prefs.symbol_background',
    'pending_display_prefs.high_contrast',
    'app_state.currentUser.preferences.symbol_background',
    'app_state.currentUser.preferences.high_contrast',
    function() {
      var pending = this.get('pending_display_prefs');
      var hc = pending ? this.get('pending_display_prefs.high_contrast')
                       : this.get('app_state.currentUser.preferences.high_contrast');
      if(hc) { return 'high_contrast'; }
      var bg = pending ? this.get('pending_display_prefs.symbol_background')
                       : this.get('app_state.currentUser.preferences.symbol_background');
      return bg || 'clear';
    }),
  display_prefs_current_symbol_background_label: computed('display_prefs_current_symbol_background_id', 'symbol_background_options', function() {
    var current = this.get('display_prefs_current_symbol_background_id');
    var opts = this.get('symbol_background_options') || [];
    var match = opts.find(function(o) { return o.id === current; });
    return match ? match.label : 'Clear';
  }),
  display_prefs_current_voice_height_label: computed('current_display_prefs.vocalization_height', 'voice_height_options', function() {
    // Read current_display_prefs (pending when More Settings is open,
    // live otherwise) — the SAME source the dropdown's selected-state
    // check uses — so the trigger label always matches the checked
    // option. (Previously read only pending_display_prefs, which is
    // empty in the Edit Tools rail context, so the label stuck.)
    var current = this.get('current_display_prefs.vocalization_height') || 'medium';
    var opts = this.get('voice_height_options') || [];
    var match = opts.find(function(o) { return o.id === current; });
    return match ? match.label : 'Medium (100px)';
  }),

  // Speak Bar "Sentence Bar" size → live class on the speak row so
  // the bar visibly resizes as the dropdown changes. Reads
  // current_display_prefs (same source the dropdown's selected check
  // uses) so it tracks the pending value when More Settings is open
  // and the live value otherwise.
  sentence_bar_height_class: computed('current_display_prefs.vocalization_height', function() {
    var current = this.get('current_display_prefs.vocalization_height') || 'medium';
    return 'md-board-detail-sentence-bar--' + current;
  }),

  // Prefs that change symbol URLs or grid CSS — apply to referenced_user (communicator).
  _display_pref_render_keys: ['skin', 'preferred_symbols', 'symbol_background', 'high_contrast'],

  _pref_user_for_display: function() {
    return this.get('app_state.referenced_user') || this.get('app_state.currentUser');
  },

  _user_for_display_pref: function(key) {
    var renderKeys = this._display_pref_render_keys;
    if(renderKeys.indexOf(key) >= 0) {
      return this._pref_user_for_display();
    }
    return this.get('app_state.currentUser');
  },

  // Debounced persist for the toolbar display-pref steppers (border / text /
  // spacing). set_display_pref applies the live preview immediately; this
  // coalesces the user.save() so a burst of clicks results in ONE save of the
  // FINAL value — avoiding the concurrent-save race where an earlier save's
  // server echo lands after a later click and reverts the value. The dirty-bit
  // poke (preferences.device.updated) that forces the raw `preferences` attr to
  // ship is (re)applied at flush time.
  _schedule_display_pref_save: function(user) {
    var _this = this;
    if(this._display_pref_save_timer) { runCancel(this._display_pref_save_timer); }
    this._display_pref_save_user = user;
    this._display_pref_save_timer = runLater(function() {
      _this._display_pref_save_timer = null;
      _this._flush_display_pref_save();
    }, 400);
  },

  // Issue the coalesced save. Split out from the timer body so willDestroy can
  // FLUSH a still-pending save instead of dropping it (the user's last click must
  // not be lost by navigating away inside the debounce window). Idempotent: clears
  // the stashed user so a flush followed by the timer can't double-save.
  _flush_display_pref_save: function() {
    var user = this._display_pref_save_user;
    this._display_pref_save_user = null;
    if(user && user.save && !user.get('isDestroyed') && !user.get('isDestroying')) {
      user.set('preferences.device.updated', true);
      user.save();
    }
  },

  // Map of pending-prefs key → user.preferences path
  _display_prefs_paths: {
    button_spacing:       'preferences.device.button_spacing',
    button_border:        'preferences.device.button_border',
    button_text:          'preferences.device.button_text',
    button_text_position: 'preferences.device.button_text_position',
    button_style:         'preferences.device.button_style',
    hidden_buttons:       'preferences.hidden_buttons',
    stretch_buttons:      'preferences.stretch_buttons',
    preferred_symbols:    'preferences.preferred_symbols',
    symbol_background:    'preferences.symbol_background',
    high_contrast:        'preferences.high_contrast',
    vocalization_height:  'preferences.device.vocalization_height',
    utterance_text_only:  'preferences.device.utterance_text_only',
    skin:                 'preferences.skin'
  },

  /* Is category grouping actually in force for this user? Flag AND preference — the
     preference alone is meaningless when the feature is not deployed. */
  grouping_active: computed('app_state.feature_flags.board_category_grouping', 'categorize_enabled', function() {
    return !!this.get('app_state.feature_flags.board_category_grouping') && !!this.get('categorize_enabled');
  }),

  /* Category grouping already communicates a button's category through its PANEL, and
     the folder treatments (tab labels especially) compete with that — two different
     colour/label systems on the same cell. So while grouping is on the folder style is
     pinned to Colored Corner.

     DERIVED, never written: the user's stored `folder_display_style` is left untouched,
     so turning grouping back off restores whatever they had chosen rather than silently
     rewriting their preference to a value they never picked. */
  effective_folder_display_style: computed('folder_display_style', 'grouping_active', function() {
    if(this.get('grouping_active')) { return 'colored_corner'; }
    return this.get('folder_display_style');
  }),

  folder_labels_on_tab: computed('effective_folder_display_style', function() {
    return this.get('effective_folder_display_style') === 'tab_labels';
  }),

  folder_colored_corner: computed('effective_folder_display_style', function() {
    return this.get('effective_folder_display_style') === 'colored_corner';
  }),

  /* Two sub-preferences of board_category_grouping. Both read `!== false` so an ABSENT
     key means ON — they describe what the grouped board already did before they existed,
     so a user whose stored hash predates them keeps today's rendering.

     Read from `referenced_user`, matching grouping_active and _save_category_grouping:
     when a supervisor models for a communicator these belong to THAT communicator, and
     read and write must resolve the same account or the panel would describe one user
     and persist to another. */
  /*
   * The user's grouping settings. Three flags, account-wide — see the note on the computed
   * below for what left this hash and why.
   *
   * Keyed on the board's GLOBAL ID, not its key: a key is `owner/slug` and changes when
   * the board is renamed or the owner changes username, which would silently orphan the
   * settings. The id does not move.
   *
   * One resolver, and every consumer below reads it — the switch, the sub-options, the
   * order list and the save all have to agree about which board they are describing.
   */
  /* The user's three category flags — does this user want categorization, may it scroll,
     are the labels shown. ACCOUNT-WIDE: this preference no longer describes a particular
     board, so there is no per-board lookup and no dependency on `model`.
     WHICH categories and in what sequence is a property of the BOARD, resolved separately
     by `category_order` below. */
  board_category_settings: computed(
    'app_state.referenced_user.preferences.board_category_grouping',
    function() {
      return this.get('app_state.referenced_user.preferences.board_category_grouping') || {};
    }
  ),

  category_names_visible: computed('board_category_settings', function() {
    return (this.get('board_category_settings') || {}).show_category_names !== false;
  }),
  category_vertical_scroll: computed('board_category_settings', function() {
    return (this.get('board_category_settings') || {}).vertical_scroll !== false;
  }),
  /* The category order the grid renders. Constant for now, and deliberately so: `order`
     has left the user preference (it is a property of the BOARD, not of the person reading
     it) and the board-side field does not exist yet, so every board gets the registry
     default — `normalize_order` returns DEFAULT_CATEGORY_ORDER for a null argument.
     This stays a computed rather than collapsing into the grid because it is the seam the
     board-side layout plugs into: when the Board carries its own arrangement, only the
     body of this function changes, and the `@categoryOrder` wiring stays as it is. */
  category_order: computed(function() {
    return normalizeCategoryOrder(null);
  }),

  /* What the GRID is told. Both only mean anything while grouping is in force, so they
     are ANDed with grouping_active here rather than in the template or the component —
     one place to reason about, and the ungrouped board is provably unaffected (the
     ungrouped grid has no category headers and no scroll container of its own). */
  show_category_names: computed('grouping_active', 'category_names_visible', function() {
    return !!this.get('grouping_active') && this.get('category_names_visible');
  }),
  category_scroll_enabled: computed('grouping_active', 'category_vertical_scroll', function() {
    return !!this.get('grouping_active') && this.get('category_vertical_scroll');
  }),

  // Map of speak-menu item id → true for items the user has hidden.
  // Built from the `speak_menu_hidden_items` array (kept in sync with
  // user.preferences.speak_mode_hidden_menu_items). Templates use
  // `(get this.speak_menu_hidden_set "my_boards")` etc. as the gate
  // around each menu row — undefined / missing key means visible.
  speak_menu_hidden_set: computed('speak_menu_hidden_items.[]', function() {
    var arr = this.get('speak_menu_hidden_items') || [];
    var set = {};
    for(var i = 0; i < arr.length; i++) { set[arr[i]] = true; }
    return set;
  }),

  /* Dismiss the options menu and every submenu inside it.
     For menu items that open a MODAL. `_closeDropdownsHandler` does not handle
     `show_options_menu` — only the backdrop scrim does, and a modal overlay
     covers the scrim, so a menu left open sits behind the modal and is still
     there when it closes. The five items that had this problem all set
     `details_dropdown_open` instead, which nothing has been able to set true
     since the details dropdown was removed, so it was a no-op standing in for
     the close that never happened. One helper rather than the two-line pair
     repeated per item: the submenu list only grows, and the next item added
     should not have to know about all of them. */
  _close_options_menu: function() {
    this.setProperties({
      show_options_menu: false,
      share_print_submenu_open: false,
      display_submenu_open: false,
      buttons_submenu_open: false,
      language_submenu_open: false
    });
  },

  // Pre-shaped list for the right-panel "Customize Menu" template.
  // Walks SPEAK_MENU_ITEMS, groups by section, and returns:
  //   [ { section: { id, label_key, default_label }, items: [...] }, ... ]
  // plus a leading null-section block for the standalone "Edit Board"
  // hero row. `hidden` on each item reflects the current preference.
  speak_menu_sections_list: computed('speak_menu_hidden_set', function() {
    var set = this.get('speak_menu_hidden_set') || {};
    var top = [];
    var by_section = {};
    var section_order = [];
    for(var i = 0; i < SPEAK_MENU_ITEMS.length; i++) {
      var item = SPEAK_MENU_ITEMS[i];
      var row = {
        id: item.id,
        label_key: item.label_key,
        default_label: item.default_label,
        hidden: !!set[item.id]
      };
      if(!item.section) {
        top.push(row);
      } else {
        if(!by_section[item.section]) {
          by_section[item.section] = [];
          section_order.push(item.section);
        }
        by_section[item.section].push(row);
      }
    }
    var groups = [{ section: null, items: top }];
    for(var s = 0; s < SPEAK_MENU_SECTIONS.length; s++) {
      var sec = SPEAK_MENU_SECTIONS[s];
      if(by_section[sec.id]) {
        groups.push({ section: sec, items: by_section[sec.id] });
      }
    }
    return groups;
  }),

  // Section-visibility gates for the speak-mode menu — true when at
  // least one child row of that section is still visible. When false,
  // the entire section header collapses too so the menu doesn't show
  // an empty group. Each computed depends on speak_menu_hidden_set so
  // it re-evaluates whenever the user toggles any row.
  // A "communicator-only" account: a plain communicator (preferences.role != 'supporter')
  // with no supervisor actively modeling. Supervisor-oriented / advanced menu entries
  // (Session, Take a Tour, My Board Collection) hide when this is true, so the whole
  // options menu behaves consistently. Mirrors the original Session gate.
  is_communicator_only_account: computed('app_state.currentUser.supporter_role', 'app_state.modeling', function() {
    return !this.get('app_state.currentUser.supporter_role') && !this.get('app_state.modeling');
  }),
  // Dense-board sidebar: boards wider than 10 columns get a 25%-narrower inline
  // sidebar (100px → 75px, via the .md-shell--many-columns class + app.scss) so the
  // grid reclaims the room. Uses the displayed grid (current_grid) with the board's
  // saved grid as a fallback.
  board_many_columns: computed('current_grid.columns', 'model.grid.columns', function() {
    return (this.get('current_grid.columns') || this.get('model.grid.columns') || 0) > 10;
  }),
  // True once the live-measured button width drops below 40px — drives
  // .md-shell--buttons-narrow so default-mode folder tabs nudge 4px left on tiny
  // buttons. board_cell_width is the measured card width (set in
  // _sync_prediction_tile_size); 0 before the first measure, so guard >0.
  board_buttons_narrow: computed('board_cell_width', function() {
    var w = this.get('board_cell_width') || 0;
    return w > 0 && w < 40;
  }),
  speak_section_visible_board: computed('speak_menu_hidden_set', 'is_communicator_only_account', function() {
    if(this.get('is_communicator_only_account')) { return false; }
    var s = this.get('speak_menu_hidden_set') || {};
    return !s.board_collection;
  }),
  speak_section_visible_buttons: computed('speak_menu_hidden_set', function() {
    var s = this.get('speak_menu_hidden_set') || {};
    return !s.find_button || !s.focus_words || !s.show_hidden_buttons;
  }),
  speak_section_visible_display: computed('speak_menu_hidden_set', function() {
    var s = this.get('speak_menu_hidden_set') || {};
    return !s.light_dark_mode;
  }),
  speak_section_visible_share: computed('speak_menu_hidden_set', 'is_communicator_only_account', function() {
    // Share & Print holds authoring/export tools: Copy, Download, Print, Share. Every one
    // of them acts on the BOARD as a document — duplicating it, handing it to another
    // account, putting it on paper — and none of them says anything. Hidden on a
    // communicator-only account (see is_communicator_only_account), the same gate the
    // Board and Session sections already carry, so the whole options menu treats
    // "supervisor-oriented" the one way.
    //
    // The SECTION, not a row or two: the four are one idea, and leaving Copy and Download
    // under a header that reads "Share & Print" would be a section named after the two
    // things it no longer offers. Shown as before for supporters and while a supervisor
    // is actively modeling.
    if(this.get('is_communicator_only_account')) { return false; }
    var s = this.get('speak_menu_hidden_set') || {};
    return !s.copy || !s.download || !s.print || !s.share;
  }),
  speak_section_visible_session: computed('speak_menu_hidden_set', 'is_communicator_only_account', 'stashes.sticky_board', function() {
    // Session holds supervisor-oriented tools: button levels, board lock ("Stay on
    // this Board"), pause logging, modeling, switch communicators. Hidden on a
    // communicator-only account (see is_communicator_only_account) — shown for
    // supporters and while a supervisor is actively modeling for a communicator.
    //
    // This check stays FIRST, ahead of the board-lock override below, and that
    // precedence is DELIBERATE (confirmed 2026-08-09): a locked communicator is not
    // meant to be able to release their own lock — it is a supervisor safety control.
    // Do not "fix" this by moving the sticky_board check above it.
    if(this.get('is_communicator_only_account')) { return false; }
    var s = this.get('speak_menu_hidden_set') || {};
    // While the board lock is ENGAGED, this section always renders, whatever the
    // customize-menu settings say. board_lock_blocks_exit() is warning the user
    // "disable to leave this board", and the only control that can disable it lives
    // in here (board-detail.hbs) — so hiding the section would make that warning a
    // dead end. Costs nothing when the lock is off, which is the normal case.
    if(this.get('stashes.sticky_board')) { return true; }
    // Otherwise: is ANY item in this section still visible? sticky_board belongs in
    // this list because it IS a customize-menu item (SPEAK_MENU_ITEMS) rendered in
    // this section. It was dropped from here by dc67d28aa, which also removed the
    // item entirely — consistent at the time — but 250186f3e put the item and its
    // buttons back without restoring this term, so hiding the other four silently
    // took the lock control with them.
    return !s.button_levels || !s.sticky_board || !s.pause_logging || !s.modeling || !s.switch_communicators;
  }),
  // Visibility of the board-lock control itself, as opposed to the Session section
  // that contains it. Normally it follows the customize-menu setting like any other
  // item — but while the lock is ENGAGED it always shows, because that is the only
  // control that can turn it off and board_lock_blocks_exit() is actively telling the
  // user to "disable to leave this board". A supervisor who hid the item and then
  // left the lock on would otherwise strand whoever is holding the device.
  //
  // Only ever FORCES the control on; it never hides one that would otherwise show,
  // and it does nothing at all when the preference is unset.
  board_lock_control_visible: computed('speak_menu_hidden_set', 'stashes.sticky_board', function() {
    if(this.get('stashes.sticky_board')) { return true; }
    var s = this.get('speak_menu_hidden_set') || {};
    return !s.sticky_board;
  }),
  board_translate_in_progress: computed('app_state.board_translate_in_progress', function() {
    return !!this.get('app_state.board_translate_in_progress');
  }),

  // True while the user is editing a board they don't own — i.e. the
  // copy_on_save stash flag is set for THIS board. Used by the header
  // badge to swap "Editing" → "Creating a Copy of this Board" and shift
  // the badge to a warning-orange treatment so the user is clear that
  // their edits will create a new board, not modify the one they
  // navigated to.
  is_copy_on_save: computed(
    'stashes.copy_on_save',
    'app_state.currentBoardState.id',
    'model.id',
    'model.global_id',
    function() {
      var flag = this.get('stashes').get('copy_on_save');
      if(!flag) { return false; }
      var ids = [
        this.get('app_state.currentBoardState.id'),
        this.get('model.id'),
        this.get('model.global_id')
      ];
      for(var i = 0; i < ids.length; i++) {
        if(ids[i] && String(ids[i]) === String(flag)) { return true; }
      }
      return false;
    }
  ),

  // True when the Edit button should be shown: either the user owns the
  // board (or has supervisor edit privilege), OR the board is publicly
  // copyable so we can do a copy-on-edit dance via the existing
  // `copy_on_save` stash flag + `tweakBoard` action.
  can_edit_or_copy_board: computed(
    'model.permissions.edit',
    'model.uncopyable',
    'model.for_sale',
    'app_state.sessionUser',
    function() {
      if(this.get('model.permissions.edit')) { return true; }
      if(!this.get('app_state.sessionUser')) { return false; }
      return !this.get('model.uncopyable') && !this.get('model.for_sale');
    }
  ),

  /* Copy and Set-as-Home are offered in VIEW mode, so they need their own
     gates. can_edit_or_copy_board is deliberately not reused: it short-circuits
     to true on edit permission, which would offer "Make a Copy" on a board the
     owner is not allowed to copy (uncopyable / for_sale). */
  can_copy_board: computed(
    'model.uncopyable', 'model.for_sale', 'app_state.sessionUser',
    function() {
      if(!this.get('app_state.sessionUser')) { return false; }
      return !this.get('model.uncopyable') && !this.get('model.for_sale');
    }
  ),

  /* True when the board on screen is ALREADY the home board of the user this
     page is scoped to. Subject is `referenced_user` (the communicator being
     spoken for, which is who a home board set from this page belongs to),
     falling back to the signed-in user — the same subject rule as
     components/board-collection.js#_subjectHomeKey, kept in step deliberately so
     "is this the home board" cannot mean two different things on two surfaces.

     Compared by KEY, not id: `preferences.home_board` stores `{key, id}` and the
     key is the one field always present on both sides (board list payloads omit
     the id in places). Both sides must be non-empty — a user with no home board
     set has `home_board.key` undefined, and `undefined === undefined` would
     otherwise report every board as already-home. */
  is_subject_home_board: computed(
    'model.key',
    'app_state.referenced_user',
    'app_state.referenced_user.preferences.home_board.key',
    'app_state.sessionUser',
    'app_state.sessionUser.preferences.home_board.key',
    function() {
      var key = this.get('model.key');
      if(!key) { return false; }
      var subject = this.get('app_state.referenced_user') || this.get('app_state.sessionUser');
      var home = subject && subject.get('preferences.home_board.key');
      return !!home && home === key;
    }
  ),

  /* Anyone signed in can choose a home board. The set-as-home modal decides
     whether a copy is required first and, for a supporter, which user it is
     being set for -- so there is nothing more to gate on here, EXCEPT that the
     board is not already the subject's home board: offering "Set as Home Board"
     while standing on the home board is a no-op the user has to open a modal to
     discover. Gates only the options-menu row on the speak page (the sole
     consumer of this property); the edit-panel row is separately gated and
     unaffected. */
  can_set_as_home: computed('app_state.sessionUser', 'is_subject_home_board', function() {
    if(!this.get('app_state.sessionUser')) { return false; }
    return !this.get('is_subject_home_board');
  }),

  undo_redo_disabled: computed('borders_matched', 'board_recolored', function() {
    return this.get('borders_matched') || this.get('board_recolored');
  }),

  /* Snapshot of which board-record attributes were ALREADY dirty when the edit page opened,
     as `{attr: JSON of its current value}`. Captured by the edit route's setupController.

     A baseline is needed because the record is dirty before the user does anything: opening
     the editor leaves `translations`, `buttons` and `translated_locales` changed (measured).
     Comparing VALUES rather than just key names matters too — `edit-board-details` writes
     `model.translations`, which is one of the three, so a key-only baseline would mask it. */
  _edit_dirty_baseline: null,

  capture_edit_baseline: function() {
    var base = {};
    try {
      var model = this.get('model');
      var changed = (model && model.changedAttributes) ? model.changedAttributes() : {};
      Object.keys(changed).forEach(function(k) {
        base[k] = JSON.stringify(changed[k][1]);
      });
    } catch(e) {
      base = null;   // unknown -> `edit_session_has_changes` treats it as "there are changes"
    }
    this.set('_edit_dirty_baseline', base);
  },

  /*
   * Would leaving edit mode right now LOSE anything?
   *
   * A METHOD, not a computed: `changedAttributes()` is not observable, so a computed would
   * cache a stale answer. It is read on a click, which is cheap.
   *
   * Assembled from every vector `cancel_edit` rolls back, because no single flag is that set:
   *
   *   noUndo                   - the edit history. `editManager.update_history` writes it onto
   *                              this controller. Covers button edits (button-settings goes
   *                              through `editManager.change_button`), grid resizes, swaps and
   *                              paint — all of which call `save_state`.
   *   board_recolored          - a recolour does NOT enter the undo stack; that is exactly why
   *   borders_matched            `undo_redo_disabled` turns undo OFF while either is pending.
   *   record attributes        - `edit-board-details` sets `model.name` / `translations` /
   *                              `categories` straight on the record and never saves, so it
   *                              leaves no undo entry at all. Compared against the baseline
   *                              above, since the record is dirty from load.
   *
   * Every term errs the same way: unsure means "there are changes", which costs a confirm
   * dialog. The opposite mistake costs the user their work.
   */
  edit_session_has_changes: function() {
    if(!this.get('noUndo')) { return true; }
    if(this.get('board_recolored') || this.get('borders_matched')) { return true; }
    var base = this.get('_edit_dirty_baseline');
    if(!base) { return true; }
    var changed;
    try {
      var model = this.get('model');
      changed = (model && model.changedAttributes) ? model.changedAttributes() : {};
    } catch(e) { return true; }
    var keys = Object.keys(changed);
    for(var i = 0; i < keys.length; i++) {
      var now;
      try { now = JSON.stringify(changed[keys[i]][1]); } catch(e) { return true; }
      if(base[keys[i]] !== now) { return true; }
    }
    return false;
  },

  // Button text preferences from user device settings
  button_text_size_class: computed('app_state.referenced_user.preferences.device.button_text', function() {
    var size = this.get('app_state.referenced_user.preferences.device.button_text') || 'medium';
    return 'md-board-detail-grid--text-' + size;
  }),

  button_text_size_px: computed('app_state.referenced_user.preferences.device.button_text', function() {
    return buttonTextPx(this.get('app_state.referenced_user.preferences.device.button_text'));
  }),

  // Pixel values for button spacing (grid gap) and border (symbol-card outline width) — drive the
  // live preview on board-detail when the user nudges the -/+ steppers in the settings toolbar.
  // Both read from the canonical map in utils/display_prefs.js so the same preference produces
  // identical visual results on board-detail, create-board-new, board-alt, demo-speak, and the
  // preferences-page canvas. set_display_pref (which applies pending changes to
  // user.preferences.device.*) updates the rendered grid immediately; the eventual user.save()
  // persists the values to the single source of truth.
  button_spacing_px: computed('app_state.referenced_user.preferences.device.button_spacing', function() {
    return buttonSpacingPx(this.get('app_state.referenced_user.preferences.device.button_spacing'));
  }),

  button_border_px: computed('app_state.referenced_user.preferences.device.button_border', function() {
    return buttonBorderPx(this.get('app_state.referenced_user.preferences.device.button_border'));
  }),

  // Shape modifier class — "Square / Tall / Wide" icon picker maps to the
  // user's stretch_buttons preference, and the grid gets a shape-* class so
  // the symbol cards use a matching aspect-ratio for visual preview.
  button_shape_class: computed('app_state.referenced_user.preferences.stretch_buttons', function() {
    var pref = this.get('app_state.referenced_user.preferences.stretch_buttons') || 'none';
    if(pref === 'prefer_tall') { return 'md-board-detail-grid--shape-tall'; }
    if(pref === 'prefer_wide') { return 'md-board-detail-grid--shape-wide'; }
    return 'md-board-detail-grid--shape-square';
  }),

  button_text_position_class: computed('app_state.referenced_user.preferences.device.button_text_position', function() {
    var pos = this.get('app_state.referenced_user.preferences.device.button_text_position') || 'top';
    return 'md-board-detail-grid--text-pos-' + pos;
  }),

  // Drives how hidden buttons render in non-edit (speak) mode — one of
  // grid/hint/hide, pulled from the user's preference.
  hidden_buttons_class: computed('app_state.referenced_user.preferences.hidden_buttons', function() {
    var mode = this.get('app_state.referenced_user.preferences.hidden_buttons') || 'grid';
    return 'md-board-detail-grid--hidden-' + mode;
  }),

  button_font_style: computed('app_state.referenced_user.preferences.device.button_style', function() {
    var style = this.get('app_state.referenced_user.preferences.device.button_style') || 'default';
    var fonts = {
      // 'default' is treated as Arial — when the user has not set a font
      // preference, the rendered font should be Arial (not the browser
      // default serif).
      'default':       'Arial, sans-serif',
      'default_caps':  'Arial, sans-serif',
      'default_small': 'Arial, sans-serif',
      'arial': 'Arial, sans-serif',
      'arial_caps': 'Arial, sans-serif',
      'arial_small': 'Arial, sans-serif',
      'comic_sans': '"Comic Sans MS", cursive',
      'comic_sans_caps': '"Comic Sans MS", cursive',
      'comic_sans_small': '"Comic Sans MS", cursive',
      'open_dyslexic': 'OpenDyslexic, sans-serif',
      'open_dyslexic_caps': 'OpenDyslexic, sans-serif',
      'open_dyslexic_small': 'OpenDyslexic, sans-serif',
      'architects_daughter': 'ArchitectsDaughter, cursive',
      'architects_daughter_caps': 'ArchitectsDaughter, cursive',
      'architects_daughter_small': 'ArchitectsDaughter, cursive',
      'helvetica':       'Helvetica, "Helvetica Neue", Arial, sans-serif',
      'verdana':         'Verdana, Geneva, sans-serif',
      'tahoma':          'Tahoma, Geneva, sans-serif',
      'trebuchet':       '"Trebuchet MS", "Lucida Grande", sans-serif',
      'calibri':         'Calibri, "Segoe UI", sans-serif',
      'segoe_ui':        '"Segoe UI", Tahoma, sans-serif',
      'lucida_sans':     '"Lucida Sans Unicode", "Lucida Grande", sans-serif',
      'optima':          'Optima, Segoe, sans-serif',
      'times_new_roman': '"Times New Roman", Times, serif',
      'georgia':         'Georgia, "Times New Roman", serif',
      'garamond':        'Garamond, "Times New Roman", serif',
      'palatino':        '"Palatino Linotype", Palatino, serif',
      'cambria':         'Cambria, Georgia, serif',
      'courier_new':     '"Courier New", Courier, monospace',
      'consolas':        'Consolas, "Courier New", monospace',
      'monaco':          'Monaco, Menlo, monospace',
      'impact':          'Impact, Charcoal, sans-serif',
      'brush_script':    '"Brush Script MT", cursive',
      'marker_felt':     '"Marker Felt", Casual, cursive',
      'chalkboard':      '"Chalkboard SE", Chalkboard, sans-serif',
      'snell_roundhand': '"Snell Roundhand", "Apple Chancery", cursive'
    };
    var cases = {};
    if(style && style.match(/_caps$/)) { cases.transform = 'uppercase'; }
    if(style && style.match(/_small$/)) { cases.transform = 'lowercase'; }
    return {
      family: fonts[style] || 'inherit',
      transform: cases.transform || 'none'
    };
  }),

  // Current grid dimensions from ordered_buttons
  current_grid: computed('ordered_buttons', function() {
    var ob = this.get('ordered_buttons');
    if(!ob || !Array.isArray(ob) || !ob.length) {
      return { rows: 0, columns: 0 };
    }
    return {
      rows: ob.length,
      columns: (ob[0] && Array.isArray(ob[0]) && ob[0].length) || 0
    };
  }),

  /* The vertical prediction rail (speak mode, <=1024px) sits beside the board as
     an extra "column", so it must never show more tiles than a board column has
     buttons — i.e. cap it at the board's row count (5 rows → max 5 predictions,
     3 rows → max 3). Falls back to the full list if the row count isn't known. */
  prediction_rail_suggestions: computed('suggestions.list.[]', 'current_grid.rows', function() {
    var list = this.get('suggestions.list') || [];
    var rows = parseInt(this.get('current_grid.rows'), 10) || 0;
    return (rows > 0 && list.length > rows) ? list.slice(0, rows) : list;
  }),

  grid_style: computed('current_grid.columns', 'current_grid.rows', function() {
    var cols = this.get('current_grid.columns');
    var rows = this.get('current_grid.rows');
    var parts = [];
    if(cols && cols > 0) { parts.push('--board-columns: ' + cols); }
    if(rows && rows > 0) { parts.push('--board-rows: ' + rows); }
    return parts.length ? parts.join('; ') + ';' : '';
  }),

  // ── Portrait / landscape-orientation overlay ──────────────────────
  // All gated by the `portrait_orientation_overlay` feature flag (ships
  // OFF). `viewport_narrow` (≤640px), `viewport_very_narrow` (≤460px) and
  // `viewport_ultra_narrow` (≤375px) are kept current by the matchMedia
  // listeners set up in the controller init; `current_grid.columns` counts
  // the button placeholders per row (filled or empty). Three escalating
  // tiers decide when a portrait phone makes the grid too cramped — the
  // narrower the screen, the fewer columns it takes to warrant the gate:
  //   • >8 columns → gate at ≤640px
  //   • >6 columns → gate at ≤460px
  //   • >4 columns → gate at ≤375px
  portrait_overlay_dismissed: false,
  // The session-wide latch moved to `service:overlay-dismissals`
  // (`larger_screen_dismissed`). It used to be a controller property, which made it
  // sticky across BOARDS but not across PAGES — the same recommendation still appeared
  // on other routes after the user had already said "Continue Anyway". The service is
  // shared by every site that shows it. `portrait_overlay_dismissed` below stays local
  // because it is the PER-BOARD arm-state, which is a different thing.
  quick_actions_open: false,
  // Live-measured rendered button width, published by _sync_prediction_tile_size.
  board_cell_width: 0,
  board_cell_height: 0,

  portrait_overlay_eligible: computed('app_state.feature_flags.portrait_orientation_overlay', 'board_cell_width', 'board_cell_height', function() {
    if(!this.get('app_state.feature_flags.portrait_orientation_overlay')) { return false; }
    // Recommend a larger screen once the buttons actually render below 35px in EITHER
    // dimension (width OR height) — too small to view or edit comfortably. board_cell_width /
    // board_cell_height are the live-measured card size (set by the debounced grid-resize
    // observer above), so this tracks the REAL rendered button size in BOTH speak and edit
    // mode, independent of orientation: a large screen keeps buttons big, so it never
    // false-fires there, and there's no rotate advice anymore to guard against.
    var cell_w = this.get('board_cell_width') || 0;
    var cell_h = this.get('board_cell_height') || 0;
    if(cell_w <= 0 || cell_h <= 0) { return false; }
    // (1) Absolutely too small in either axis to view/edit comfortably.
    if(cell_w < 35 || cell_h < 35) { return true; }
    // (2) Badly PROPORTIONED: a tall-narrow (or wide-short) button squishes the symbol and is
    // awkward to target even when neither axis is below 35px — e.g. a folder on a portrait phone
    // rendering ~65px wide × ~177px tall. Fire when the long axis is >2.2× the short axis AND the
    // short axis is itself cramped (<90px). The <90px gate keeps genuinely LARGE non-square
    // buttons (a roomy 300×700 on a big screen) from false-firing — those don't need a bigger
    // screen, they're just intentionally rectangular.
    var shorter = Math.min(cell_w, cell_h);
    var longer = Math.max(cell_w, cell_h);
    if(shorter < 90 && (longer / shorter) > 2.2) { return true; }
    return false;
  }),

  // The actual "show the card now" gate — eligible AND the user hasn't dismissed it.
  // `portrait_overlay_dismissed` is the per-board arm-state; once they pick "Continue
  // Anyway", the service's `larger_screen_dismissed` suppresses it for the rest of the
  // session everywhere in the app, and keeps the per-board flag from re-arming.
  portrait_overlay_active: computed('portrait_overlay_eligible', 'portrait_overlay_dismissed', 'overlay_dismissals.larger_screen_hidden', 'board_collection_open', 'edit_board_collection_open', function() {
    // Hidden because the user turned the helper messages off in Preferences, or because
    // they chose "Continue Anyway" anywhere in the app this session.
    if(this.get('overlay_dismissals.larger_screen_hidden')) { return false; }
    // Either Board Collections drawer (speak-mode right / edit-mode left) intentionally
    // shrinks the center board area (layout padding), which drops the live-measured
    // board_cell_width below the 35px signal and FALSE-triggers the larger-screen
    // recommendation on a wide viewport. Suppress the overlay while a collection drawer is
    // open — the screen itself isn't small, so the recommendation doesn't apply.
    if(this.get('board_collection_open') || this.get('edit_board_collection_open')) { return false; }
    return this.get('portrait_overlay_eligible') && !this.get('portrait_overlay_dismissed');
  }),

  // Immersive speak-mode tool consolidation: at ≤640px in speak mode
  // (flag on) the inline mic/backspace/clear collapse into the
  // down-arrow chevron's quick-actions popover. Independent of the
  // column-count gate — it's about reclaiming horizontal space, which
  // every narrow board benefits from. Edit mode has its own toolbar so
  // it's excluded here.
  immersive_tools: computed('app_state.feature_flags.portrait_orientation_overlay', 'viewport_narrow', 'edit_mode', function() {
    if(!this.get('app_state.feature_flags.portrait_orientation_overlay')) { return false; }
    return !!this.get('viewport_narrow') && !this.get('edit_mode');
  }),

  // On a board change, re-arm the per-board dismissal — UNLESS the user has
  // chosen "Continue Anyway" this session, in which case the prompt stays
  // suppressed for the rest of the session. The quick-actions popover always
  // closes on a board change regardless.
  _reset_portrait_overlay_on_board_change: observer('model.id', function() {
    if(!this.get('overlay_dismissals.larger_screen_hidden')) {
      this.set('portrait_overlay_dismissed', false);
    }
    this.set('quick_actions_open', false);
  }),

  // Flatten the 2D ordered_buttons grid for template iteration and filtering
  flat_ordered_buttons: computed('ordered_buttons', 'ordered_buttons.[]', function() {
    var ob = this.get('ordered_buttons') || [];
    var result = [];
    ob.forEach(function(row) {
      if(!row) { return; }
      row.forEach(function(btn) {
        if(btn) { result.push(btn); }
      });
    });
    return result;
  }),

  // Returns the POS CSS class for a button (works with both Button objects and plain objects)
  _apply_category_filter: function(category) {
    var ob = this.get('ordered_buttons') || [];
    var _this = this;
    var match_map = {
      'pronoun': ['pronoun'],
      'verb': ['verb'],
      'adjective': ['adjective'],
      'noun': ['noun', 'nominative'],
      'social': ['social', 'social_phrase', 'interjection'],
      'negation': ['negation', 'expletive'],
      'question': ['question'],
      'preposition': ['preposition'],
      'adverb': ['adverb'],
      'determiner': ['determiner', 'article'],
      'conjunction': ['conjunction', 'number'],
      'other': ['other'],
      'folder': ['folder']
    };
    var matches = match_map[category] || null;
    for(var ri = 0; ri < ob.length; ri++) {
      var row = ob[ri] || [];
      for(var ci = 0; ci < row.length; ci++) {
        var btn = row[ci];
        if(!btn) { continue; }
        var is_empty = (btn.get && btn.get('empty')) || btn.empty;
        if(is_empty) {
          if(btn.set) { btn.set('_filtered_out', category !== 'all'); }
          else { btn._filtered_out = category !== 'all'; }
          continue;
        }
        if(!category || category === 'all') {
          if(btn.set) { btn.set('_filtered_out', false); }
          else { btn._filtered_out = false; }
        } else {
          var pos = _this.pos_css_class(btn);
          var out = matches ? matches.indexOf(pos) < 0 : false;
          if(btn.set) { btn.set('_filtered_out', out); }
          else { btn._filtered_out = out; }
        }
      }
    }
    // Force re-render
    this.set('ordered_buttons', ob.map(function(row) { return [].concat(row); }));
  },

  pos_css_class: function(btn) {
    if(!btn) { return 'default'; }
    var load_board = btn.get ? btn.get('load_board') : btn.load_board;
    var folder_action = btn.get ? btn.get('folderAction') : btn.folderAction;
    var link_disabled = btn.get ? btn.get('link_disabled') : btn.link_disabled;
    if((load_board && !link_disabled) || folder_action) {
      return 'folder';
    }
    var pos = (btn.get ? btn.get('part_of_speech') : btn.part_of_speech) ||
              (btn.get ? btn.get('painted_part_of_speech') : btn.painted_part_of_speech) ||
              (btn.get ? btn.get('suggested_part_of_speech') : btn.suggested_part_of_speech);
    if(pos) { return pos; }
    return 'default';
  },

  // Look up POS for buttons that have no type assigned.
  // The lookup itself (batching, the session word cache, and the single-vs-multi
  // word rules) lives in utils/parts_of_speech.js so the board-preview canvas
  // resolves colours identically — a preview that disagreed with the board it
  // previews is the bug this shares code to prevent.
  resolve_unknown_buttons: function(buttons) {
    var _this = this;
    var unknowns = buttons.filter(function(btn) {
      var pos = _this.pos_css_class(btn);
      var label = btn.get ? btn.get('label') : btn.label;
      return pos === 'default' && label;
    });
    if(!unknowns.length) { return; }

    var labels = unknowns.map(function(btn) { return btn.get ? btn.get('label') : btn.label; });

    resolve_labels_pos(labels, function(url, opts) { return persistence.ajax(url, opts); }, RSVP).then(function(pos_by_label) {
      var mutated = false;
      unknowns.forEach(function(btn) {
        var label = btn.get ? btn.get('label') : btn.label;
        var cls = pos_by_label[label];

        if(cls) {
          if(btn.set) {
            btn.set('suggested_part_of_speech', cls);
          } else {
            emberSet(btn, 'suggested_part_of_speech', cls);
          }
          var btnId = btn.get ? btn.get('id') : btn.id;
          var rawList = (_this._last_raw && _this._last_raw.buttons) || [];
          for(var rbi = 0; rbi < rawList.length; rbi++) {
            var rawB = rawList[rbi];
            if(rawB && rawB.id != null && String(rawB.id) === String(btnId)) {
              rawB.suggested_part_of_speech = cls;
              break;
            }
          }
          mutated = true;
        }
      });
      // Plain objects in ordered_buttons: mutating suggested_part_of_speech does not reliably
      // recompute md-board-detail-symbol-card--* class bindings (see _finalizeFocusDimGrid).
      // Shallow-copy non-Ember cells so Glimmer picks up Fitzgerald colors after batch POS.
      if(mutated && !_this.get('edit_mode')) {
        var ob = _this.get('ordered_buttons');
        if(ob) {
          _this.set('ordered_buttons', ob.map(function(row) {
            return row.map(function(b) {
              if(!b || b.empty) { return b; }
              if(typeof b.set === 'function') { return b; }
              return Object.assign({}, b);
            });
          }));
        }
        _this.notifyPropertyChange('ordered_buttons');
      }
    }, function() { });
  },

  // Filter buttons by active category
  filtered_buttons: computed('flat_ordered_buttons.[]', 'active_category', function() {
    var buttons = this.get('flat_ordered_buttons') || [];
    var category = this.get('active_category');
    var _this = this;
    if(category === 'all') {
      return buttons;
    }
    var match_map = {
      'pronoun': ['pronoun'],
      'verb': ['verb'],
      'adjective': ['adjective'],
      'noun': ['noun', 'nominative'],
      'social': ['social', 'social_phrase', 'interjection'],
      'negation': ['negation', 'expletive'],
      'question': ['question'],
      'preposition': ['preposition'],
      'adverb': ['adverb'],
      'determiner': ['determiner', 'article'],
      'conjunction': ['conjunction', 'number'],
      'other': ['other'],
      'folder': ['folder']
    };
    var matches = match_map[category] || [category];
    return buttons.filter(function(btn) {
      var pos = _this.pos_css_class(btn);
      return matches.indexOf(pos) >= 0;
    });
  }),

  sidebar_nav: computed('active_view', function() {
    var av = this.get('active_view');
    return {
      communicate: [
        { id: 'symbol-board', label: i18n.t('nav_symbol_board', "Symbol Board"), icon: 'symbol-board', active: av === 'symbol-board' },
        { id: 'phrase-builder', label: i18n.t('nav_phrase_builder', "Phrase Builder"), icon: 'phrase-builder', active: av === 'phrase-builder' }
        // TODO: enable when implemented
        // { id: 'favorites', label: i18n.t('nav_favorites', "Favorites"), icon: 'favorites' },
        // { id: 'recent', label: i18n.t('nav_recent', "Recent"), icon: 'recent' }
      ],
      clinical: [
        { id: 'progress-reports', label: i18n.t('nav_progress_reports', "Progress Reports"), icon: 'progress-reports' },
        { id: 'sessions', label: i18n.t('nav_sessions', "Sessions"), icon: 'sessions' },
        { id: 'profiles', label: i18n.t('nav_profiles', "Profiles"), icon: 'profiles' },
        { id: 'goal-tracking', label: i18n.t('nav_goal_tracking', "Goal Tracking"), icon: 'goal-tracking' }
      ],
      settings: [
        { id: 'preferences', label: i18n.t('nav_preferences', "Settings"), icon: 'preferences' },
        { id: 'voice-output', label: i18n.t('nav_voice_output', "Voice & Output"), icon: 'voice-output' }
      ]
    };
  }),

  // Phrase builder: cross-board button search powered by the ButtonSet model.
  // Loads the full button set (including all linked sub-board buttons) once
  // when the user enters the phrase-builder view, then runs find_buttons on
  // each query change with a debounce.
  has_phrase_search: computed('phrase_search', function() {
    return ((this.get('phrase_search') || '').trim()).length > 0;
  }),

  phrase_results: null,        // populated asynchronously by _phrase_run_search
  phrase_all_buttons: null,    // alphabetized default list (all buttons from buttonset)
  phrase_loading: false,
  phrase_search_error: null,
  phrase_sentence_mode: false, // true when phrase_results is a sentence sequence
  _phrase_button_set: null,    // cached ButtonSet for the current board
  _phrase_search_timer: null,  // debounce handle
  _phrase_search_id: null,     // race-condition guard

  // Enter the phrase builder view. Shows a loading state until the full
  // cross-board walk completes; the user never sees a partial list.
  _phrase_init: function() {
    console.log('[PHRASE] _phrase_init called');
    this.set('phrase_search', '');
    this.set('phrase_results', null);
    this.set('phrase_all_buttons', null);
    this.set('phrase_loading', true);
    this.set('phrase_search_error', null);
    this.set('phrase_sentence_mode', false);

    // Kick off the cross-board walk. The walker itself will call
    // _phrase_populate_local as an immediate fallback if the raw data is
    // missing, and the final committed list populates phrase_all_buttons.
    try {
      this._phrase_try_upgrade_to_buttonset();
    } catch(e) {
      console.error('[PHRASE] _phrase_try_upgrade_to_buttonset threw', e);
      // On any thrown error, fall back to local buttons so the user still
      // has something usable.
      try {
        this._phrase_populate_local();
        this.set('phrase_loading', false);
      } catch(e2) {
        console.error('[PHRASE] _phrase_populate_local threw', e2);
        this.set('phrase_all_buttons', []);
        this.set('phrase_loading', false);
      }
    }
  },

  // Immediately populate phrase_all_buttons from the current board's
  // locally-rendered buttons. This never fails and gives the user a
  // usable phrase builder without any network activity. Folder buttons
  // (those that load another board) are excluded — the phrase builder
  // is for words, not navigation.
  _phrase_populate_local: function() {
    var buttons = this.get('flat_ordered_buttons') || [];
    var seen = {};
    var list = [];
    var _get = function(obj, key) {
      return (obj && obj.get && typeof obj.get === 'function') ? obj.get(key) : (obj && obj[key]);
    };
    buttons.forEach(function(btn) {
      if(!btn) { return; }
      if(_get(btn, 'empty') || _get(btn, 'hidden')) { return; }
      // Skip folder buttons — phrase builder is for words only
      if(_get(btn, 'load_board') && !_get(btn, 'link_disabled')) { return; }
      var label = (_get(btn, 'label') || _get(btn, 'vocalization') || '').toString().trim();
      if(!label) { return; }
      var key = label.toLowerCase();
      if(seen[key]) { return; }
      seen[key] = true;
      list.push({
        id: _get(btn, 'id'),
        label: label,
        vocalization: _get(btn, 'vocalization'),
        image: _get(btn, 'local_image_url') || _get(btn, 'image_url')
      });
    });
    list.sort(function(a, b) {
      var la = (a.label || '').toLowerCase();
      var lb = (b.label || '').toLowerCase();
      return la < lb ? -1 : la > lb ? 1 : 0;
    });
    this.set('phrase_all_buttons', list);
    console.log('[PHRASE] local populate:', list.length, 'buttons (folders excluded)');
    this._phrase_preload_images(list);
  },

  // Warm the browser image cache for every button in the phrase builder
  // list so that clicking a chip → adding to the sentence bar shows its
  // image instantly. Images load in the background; no UI blocking.
  _phrase_preload_images: function(list) {
    if(!list || !list.length) { return; }
    // Throttle: spread the preload over time so we don't hammer the browser
    // connection pool. AAC boards can have 500+ buttons.
    var batch = 0;
    var i = 0;
    var cache = this._phrase_image_cache || (this._phrase_image_cache = {});
    var kick = function() {
      var limit = Math.min(i + 20, list.length);
      while(i < limit) {
        var url = list[i] && list[i].image;
        i++;
        if(!url || cache[url]) { continue; }
        cache[url] = true;
        try {
          var img = new Image();
          img.src = url;
        } catch(e) { /* ignore */ }
      }
      if(i < list.length) {
        runLater(kick, 80);
      }
    };
    runLater(kick, 100);
  },

  // Try to load the full cross-board button set. On success, rebuild the
  // alphabetical list from the richer data (including all sub-board
  // buttons). On failure, silently keep the local-only list. Never shows
  // an error — the phrase builder always works.
  //
  // Cross-board walk: recursively fetches each linked sub-board via the
  // /api/v1/boards/:key endpoint (same one the route uses for the current
  // board) and aggregates all of their buttons into phrase_all_buttons.
  //
  // This bypasses the buttonset endpoint entirely — the buttonset is an
  // optimization that requires backend generation + S3 uploads, which can
  // hang or fail in some environments. Raw board fetches always work since
  // they're the same endpoint we already use successfully.
  //
  // Hard cap on depth (3 levels) and total board fetches (20) to prevent
  // runaway walks on huge boards or cycles.
  //
  _phrase_try_upgrade_to_buttonset: function() {
    var _this = this;
    var board = this.get('model');
    if(!board) { return; }

    // _last_raw is a plain JS property set by _build_from_raw, not an
    // Ember-observed attribute — use direct access.
    var raw = this._last_raw;
    if(!raw) {
      console.warn('[PHRASE] no raw board data available for cross-board walk');
      // Fall back to local so the user isn't stuck in a loading state
      this._phrase_populate_local();
      this.set('phrase_loading', false);
      return;
    }
    // Inject the board id/key into the raw object if they aren't already
    // there, so the walker can track visited boards correctly.
    if(!raw.id) { raw.id = board.get('id') || board.get('global_id'); }
    if(!raw.key) { raw.key = board.get('key'); }

    console.log('[PHRASE] starting cross-board walk from', raw.key || raw.id);
    this._phrase_walk_boards(raw, 3);
  },

  // Recursively walks this raw board and every linked sub-board, collecting
  // all non-folder buttons into a single alphabetized list.
  //
  // @param raw - { buttons: [...], image_urls: {...}, images: [...], id, key }
  // @param max_depth - maximum recursion depth from the starting board
  _phrase_walk_boards: function(raw, max_depth) {
    var _this = this;
    var visited = {};       // board keys we've already fetched
    var pending = 0;        // in-flight sub-board requests
    var total_fetched = 0;  // total boards walked
    var MAX_BOARDS = 20;    // hard safety cap

    // Master aggregation map — dedup by lowercase label so the same word
    // appearing on multiple sub-boards only shows once.
    var all_seen = {};
    var all_list = [];

    var add_raw_board = function(raw_board) {
      if(!raw_board || !raw_board.buttons) { return; }
      var image_map = raw_board.image_urls || {};
      (raw_board.images || []).forEach(function(img) {
        if(img && img.id && img.url) { image_map[img.id] = img.url; }
      });
      raw_board.buttons.forEach(function(btn) {
        if(!btn) { return; }
        if(btn.hidden) { return; }
        if((btn.load_board && !btn.link_disabled) || btn.linked_board_id || btn.linked_board_key) { return; }
        var label = (btn.label || btn.vocalization || '').toString().trim();
        if(!label) { return; }
        var key = label.toLowerCase();
        if(all_seen[key]) { return; }
        all_seen[key] = true;
        var img_url = null;
        if(btn.image_id && image_map[btn.image_id]) {
          img_url = image_map[btn.image_id];
        }
        all_list.push({
          id: btn.id,
          board_id: raw_board.id,
          label: label,
          vocalization: btn.vocalization,
          image: img_url
        });
      });
    };

    var commit_list = function() {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      all_list.sort(function(a, b) {
        var la = (a.label || '').toLowerCase();
        var lb = (b.label || '').toLowerCase();
        return la < lb ? -1 : la > lb ? 1 : 0;
      });
      console.log('[PHRASE] walk complete: fetched', total_fetched, 'boards,', all_list.length, 'unique words');
      _this.set('phrase_all_buttons', all_list);
      _this.set('phrase_loading', false);
      if(all_list.length) {
        _this._phrase_preload_images(all_list);
      }
    };

    var walk = function(raw_board, depth) {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      if(!raw_board) { return; }
      var board_key = raw_board.key || raw_board.id;
      if(!board_key || visited[board_key]) { return; }
      visited[board_key] = true;
      total_fetched++;
      add_raw_board(raw_board);

      if(depth <= 0) { return; }
      if(total_fetched >= MAX_BOARDS) { return; }

      // Walk sub-boards
      (raw_board.buttons || []).forEach(function(btn) {
        if(!btn) { return; }
        var load_board = btn.load_board;
        if(!load_board || btn.link_disabled) { return; }
        var next_key = load_board.key;
        var next_id = load_board.id;
        var lookup = next_key || next_id;
        if(!lookup || visited[lookup]) { return; }
        if(total_fetched + pending >= MAX_BOARDS) { return; }

        // Reuse the navigation cache: a sub-board may already be cached
        // from prior folder navigation (or another phrase walk). Cache
        // hit = skip the network entirely. On cache miss we still fetch,
        // but we populate the cache so future folder navigation hits.
        var cached_sub = boardDetailCache.get(lookup);
        if(cached_sub) {
          walk(cached_sub, depth - 1);
          return;
        }
        pending++;
        persistence.ajax('/api/v1/boards/' + lookup, { type: 'GET' }).then(function(data) {
          pending--;
          if(_this.isDestroyed || _this.isDestroying) { return; }
          var merged = boardDetailCache.normalize_board_payload(data);
          if(merged) {
            boardDetailCache.set(JSON.parse(JSON.stringify(merged)), { force: true });
            walk(merged, depth - 1);
          }
          if(pending === 0) { commit_list(); }
        }, function(err) {
          pending--;
          console.warn('[PHRASE] sub-board fetch failed for', lookup, err);
          if(pending === 0) { commit_list(); }
        });
      });
    };

    walk(raw, max_depth);
    // If there are no sub-boards to walk, commit immediately
    if(pending === 0) { commit_list(); }
  },

  // (obsolete: _phrase_build_all_list removed — we no longer use the
  // buttonset endpoint; see _phrase_walk_boards for the cross-board walk.)

  // Debounced search trigger. Observes phrase_search.
  _phrase_search_observer: observer('phrase_search', function() {
    if(this.get('active_view') !== 'phrase-builder') { return; }
    // Cancel any pending run
    if(this._phrase_search_timer) {
      runCancel(this._phrase_search_timer);
      this._phrase_search_timer = null;
    }
    var _this = this;
    if(!this.get('has_phrase_search')) {
      // Empty input: clear results immediately, no debounce needed
      this.set('phrase_results', null);
      this.set('phrase_loading', false);
      this.set('phrase_search_error', null);
      return;
    }
    // Show loading indicator immediately on subsequent keystrokes
    this.set('phrase_loading', true);
    this._phrase_search_timer = runLater(function() {
      _this._phrase_search_timer = null;
      _this._phrase_run_search();
    }, 200);
  }),

  // Search the phrase_all_buttons list. Two modes:
  //
  //   1. Single-word mode (no spaces in query) — substring filter, returns
  //      every button whose label/vocalization contains the query. This
  //      is the original broad-search behavior.
  //
  //   2. Sentence mode (query contains spaces) — splits on whitespace and
  //      finds the best button match for each word in order, preserving
  //      the typed sequence. Used to build a phrase from an existing
  //      sentence in one go. Words with no match are shown as placeholder
  //      "not found" entries so the user can see which words are missing.
  _phrase_run_search: function() {
    var query = (this.get('phrase_search') || '').trim();
    if(!query) {
      this.set('phrase_results', null);
      this.set('phrase_sentence_mode', false);
      this.set('phrase_loading', false);
      return;
    }
    var all = this.get('phrase_all_buttons') || [];
    // Strip common punctuation at word boundaries before splitting
    var words = query.split(/\s+/).map(function(w) {
      return w.replace(/^[^\w'-]+|[^\w'-]+$/g, '');
    }).filter(function(w) { return w.length > 0; });

    if(words.length <= 1) {
      // Single-word: substring filter with apostrophe-insensitive match,
      // so typing "Im" matches "I'm" and vice versa.
      var norm_q = this._phrase_norm(query);
      var norm = this._phrase_norm;
      var matches = all.filter(function(b) {
        return norm(b.label).indexOf(norm_q) !== -1 ||
               norm(b.vocalization).indexOf(norm_q) !== -1;
      }).map(function(b) {
        return Object.assign({}, b, { on_this_board: true });
      });
      this.set('phrase_sentence_mode', false);
      this.set('phrase_results', matches);
      this.set('phrase_loading', false);
      this.set('phrase_search_error', null);
      return;
    }

    // Sentence mode: one match per word, in typed order. If a word has no
    // direct match but is a known contraction, fall back to trying the
    // expanded form ("don't" → "do" + "not") so the user can still build
    // the phrase from the split words on the board.
    var best_match = this._phrase_best_match.bind(this);
    var expand = this._phrase_expand_contraction.bind(this);
    var make_hit = function(match, word) {
      return Object.assign({}, match, {
        on_this_board: true,
        typed_word: word,
        is_match: true
      });
    };
    var make_miss = function(word, suffix) {
      return {
        id: 'missing-' + word + (suffix || ''),
        label: word,
        is_match: false,
        typed_word: word
      };
    };
    var sequence = [];
    words.forEach(function(word) {
      var match = best_match(all, word);
      if(match) {
        sequence.push(make_hit(match, word));
        return;
      }
      // No direct match — try contraction expansion
      var expansion = expand(word);
      if(expansion && expansion.length) {
        expansion.forEach(function(token, idx) {
          var sub_match = best_match(all, token);
          if(sub_match) {
            sequence.push(make_hit(sub_match, token));
          } else {
            sequence.push(make_miss(token, '-' + idx));
          }
        });
        return;
      }
      sequence.push(make_miss(word));
    });
    this.set('phrase_sentence_mode', true);
    this.set('phrase_results', sequence);
    this.set('phrase_loading', false);
    this.set('phrase_search_error', null);
  },

  // Normalize a word for contraction-insensitive matching:
  //   - Lowercase
  //   - Strip apostrophes (straight ' and curly ’)
  // This lets "I'm" / "Im" / "im" all match each other, and
  // "don't" / "dont" / "Dont" all resolve identically.
  _phrase_norm: function(s) {
    return (s || '').toLowerCase().replace(/['\u2019]/g, '');
  },

  // Common English contraction expansions, keyed by apostrophe-stripped form
  // (so "dont" and "don't" both expand to ["do", "not"]).
  // Used by sentence mode: when the user types "I'm" or "Im" and no exact
  // match is found on the board, we fall back to trying "I" + "am" as two
  // separate tokens. This way the user can search for a phrase even if the
  // board has only the grammatically split words.
  _phrase_contraction_map: function() {
    if(this.__phrase_contractions) { return this.__phrase_contractions; }
    this.__phrase_contractions = {
      // am / is / are / was / were
      'im':       ['I', 'am'],
      'youre':    ['you', 'are'],
      'were':     ['we', 'are'],      // collides with past-tense "were"; handled by matching pref
      'theyre':   ['they', 'are'],
      'hes':      ['he', 'is'],
      'shes':     ['she', 'is'],
      'its':      ['it', 'is'],
      'thats':    ['that', 'is'],
      'theres':   ['there', 'is'],
      'whats':    ['what', 'is'],
      'whos':     ['who', 'is'],
      'wheres':   ['where', 'is'],
      // will
      'ill':      ['I', 'will'],
      'youll':    ['you', 'will'],
      'hell':     ['he', 'will'],
      'shell':    ['she', 'will'],
      'well':     ['we', 'will'],     // collides with "well"; matcher tries direct first
      'theyll':   ['they', 'will'],
      // have / has / had
      'ive':      ['I', 'have'],
      'youve':    ['you', 'have'],
      'weve':     ['we', 'have'],
      'theyve':   ['they', 'have'],
      // would / had
      'id':       ['I', 'would'],
      'youd':     ['you', 'would'],
      'hed':      ['he', 'would'],
      'shed':     ['she', 'would'],
      'wed':      ['we', 'would'],
      'theyd':    ['they', 'would'],
      // not
      'dont':     ['do', 'not'],
      'doesnt':   ['does', 'not'],
      'didnt':    ['did', 'not'],
      'isnt':     ['is', 'not'],
      'arent':    ['are', 'not'],
      'wasnt':    ['was', 'not'],
      'werent':   ['were', 'not'],
      'hasnt':    ['has', 'not'],
      'havent':   ['have', 'not'],
      'hadnt':    ['had', 'not'],
      'cant':     ['can', 'not'],
      'couldnt':  ['could', 'not'],
      'wont':     ['will', 'not'],
      'wouldnt':  ['would', 'not'],
      'shouldnt': ['should', 'not'],
      'mustnt':   ['must', 'not'],
      // let us
      'lets':     ['let', 'us']
    };
    return this.__phrase_contractions;
  },

  // Try to expand a word as a contraction. Returns an array of expanded
  // tokens if recognized, or null if not a known contraction. Preserves
  // the original capitalization of the first character of the first token
  // (so "I'm" → ["I", "am"] but "i'm" → ["i", "am"]).
  _phrase_expand_contraction: function(word) {
    if(!word) { return null; }
    var key = this._phrase_norm(word);
    var map = this._phrase_contraction_map();
    var expansion = map[key];
    if(!expansion) { return null; }
    // Preserve capitalization of the first letter of the typed word
    var first = word.charAt(0);
    if(first && first === first.toUpperCase() && first !== first.toLowerCase()) {
      return [expansion[0], expansion[1]];
    }
    return [expansion[0].toLowerCase(), expansion[1]];
  },

  // Best-match lookup used by sentence mode. Tries increasingly loose
  // matching strategies, all using apostrophe-insensitive normalization:
  //   1. Exact label match
  //   2. Exact vocalization match
  //   3. Common English suffix stripping (plays → play, wants → want)
  //   4. Prefix match ("play" matches "player", "playing")
  //   5. Word-boundary substring match ("play" matches "to play")
  // Returns the first successful match, or null if nothing fits.
  _phrase_best_match: function(all_buttons, word) {
    if(!word) { return null; }
    var norm = this._phrase_norm;
    var w = norm(word);
    if(!w) { return null; }
    var i, b, label_n, voc_n;

    // Strategy 1: exact label match
    for(i = 0; i < all_buttons.length; i++) {
      b = all_buttons[i];
      if(!b) { continue; }
      if(norm(b.label) === w) { return b; }
    }
    // Strategy 2: exact vocalization match
    for(i = 0; i < all_buttons.length; i++) {
      b = all_buttons[i];
      if(!b) { continue; }
      if(norm(b.vocalization) === w) { return b; }
    }
    // Strategy 3: common English suffix stripping
    //   plays/played/playing → play, runs/running → run, wants/wanted → want
    var stems = [];
    if(w.length > 3) {
      if(w.endsWith('ing')) { stems.push(w.slice(0, -3)); }
      if(w.endsWith('ed'))  { stems.push(w.slice(0, -2)); }
      if(w.endsWith('es'))  { stems.push(w.slice(0, -2)); }
      if(w.endsWith('s'))   { stems.push(w.slice(0, -1)); }
      if(w.endsWith('ly'))  { stems.push(w.slice(0, -2)); }
    }
    for(var s = 0; s < stems.length; s++) {
      var stem = stems[s];
      if(!stem || stem.length < 2) { continue; }
      for(i = 0; i < all_buttons.length; i++) {
        b = all_buttons[i];
        if(!b) { continue; }
        label_n = norm(b.label);
        voc_n = norm(b.vocalization);
        if(label_n === stem || voc_n === stem) { return b; }
      }
    }
    // Strategy 4: the stored label starts with the typed word
    //   "play" → "player", "playing"
    for(i = 0; i < all_buttons.length; i++) {
      b = all_buttons[i];
      if(!b) { continue; }
      label_n = norm(b.label);
      if(label_n.length > w.length && label_n.indexOf(w) === 0) { return b; }
    }
    // Strategy 5: word-boundary substring
    //   "play" → "to play", "will play"
    var re = new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    for(i = 0; i < all_buttons.length; i++) {
      b = all_buttons[i];
      if(!b) { continue; }
      if(re.test(norm(b.label)) || re.test(norm(b.vocalization))) { return b; }
    }
    return null;
  },

  // ── Level Preview ──

  available_levels: computed('ordered_buttons', function() {
    var ob = this.get('ordered_buttons') || [];
    var levels = [];
    ob.forEach(function(row) {
      (row || []).forEach(function(btn) {
        if(btn && btn.get && btn.get('level_modifications')) {
          var mods = btn.get('level_modifications');
          for(var lvl in mods) {
            if(mods.hasOwnProperty(lvl)) {
              var num = parseInt(lvl, 10);
              if(!isNaN(num) && levels.indexOf(num) < 0) {
                levels.push(num);
              }
            }
          }
        }
      });
    });
    return levels.sort(function(a, b) { return a - b; });
  }),

  has_levels: computed('available_levels.[]', function() {
    return (this.get('available_levels') || []).length > 0;
  }),

  preview_levels_mode: false,

  preview_levels: computed('edit_mode', 'preview_levels_mode', function() {
    return this.get('edit_mode') && this.get('preview_levels_mode');
  }),

  // ── Save Logic (adapted from board/index.js saveButtonChanges) ──

  saveButtonChanges: function() {
    var _this = this;
    // Clear preview state BEFORE serializing so preview-induced
    // mutations (especially `hidden=true` on untagged buttons at
    // preview level < 10) don't leak into the saved data. The save
    // flow exits edit mode anyway, so we'd be tearing down preview
    // shortly regardless.
    if(this.get('preview_levels_mode')) {
      editManager.clear_preview_levels();
      this.set('level_paint_action', null);
      this.set('level_paint_level', null);
      editManager.clear_paint_mode();
    }
    var orderedButtons = this.get('ordered_buttons') || [];
    var board = this.get('model');
    if(!board) { return; }

    // Check for pending images
    var pendingImage = false;
    for(var ri = 0; ri < orderedButtons.length && !pendingImage; ri++) {
      var row = orderedButtons[ri];
      for(var ci = 0; ci < row.length && !pendingImage; ci++) {
        var btn = row[ci];
        if(btn && btn.get && btn.get('image_id') && btn.get('pending_image')) {
          pendingImage = true;
        }
      }
    }
    if(pendingImage) {
      modal.warning(i18n.t('wait_for_images', "Please wait for all images to finish loading before saving."), true);
      return;
    }

    // Use editManager to convert Button objects to save format
    var state = editManager.process_for_saving();
    if(!state || !state.buttons) {
      modal.error(i18n.t('board_save_failed', "Failed to save board"));
      return;
    }

    // Handle locale-specific translations if editing in a non-default locale
    var button_locale = board.get('button_locale') || this.get('app_state.label_locale');
    var update_locale = false;
    if(button_locale && button_locale != board.get('locale')) {
      update_locale = button_locale;
      var changes = board.changedAttributes();
      if(changes.name && changes.name[0] != changes.name[1]) {
        var trans = board.get('translations') || {};
        trans.board_name = trans.board_name || {};
        trans.board_name[button_locale] = changes.name[1];
        trans.board_name[board.get('locale')] = trans.board_name[board.get('locale')] || changes.name[0];
        board.set('name', changes.name[0]);
        board.set('translations', trans);
      }
      state.buttons.forEach(function(btn) {
        btn.translations = btn.translations || [];
        var btn_trans = btn.translations.find(function(t) { return t.locale == button_locale; });
        if(!btn_trans) {
          btn_trans = { code: button_locale, locale: button_locale };
          btn.translations.push(btn_trans);
        }
        emberSet(btn_trans, 'label', btn_trans.label || btn.label);
        emberSet(btn_trans, 'vocalization', btn_trans.vocalization || btn.vocalization);
        emberSet(btn_trans, 'inflections', btn_trans.inflections || btn.inflections);

        var orig_trans = btn.translations.find(function(t) { return t.locale == board.get('locale'); });
        orig_trans = orig_trans || ((board.get('translations') || {})[btn.id] || {})[board.get('locale')];
        if(orig_trans) {
          /* NOT a special vocalization. ':suggestion', '+q', ':shift' and ':space' are
             ACTIONS with no translation, so the source-locale entry below holds a label and
             no vocalization — nulling first and restoring from it deletes the action. This
             runs AFTER process_for_saving, so without the check it overwrites that guard and
             the loss is what gets persisted. */
          if(!/^[:+]/.test(String(emberGet(btn, 'vocalization') || ''))) {
            emberSet(btn, 'vocalization', null);
          }
          emberSet(btn, 'inflections', null);
          for(var key in orig_trans) {
            if(key != 'code' && key != 'locale') {
              emberSet(btn, key, orig_trans[key]);
            }
          }
        } else {
          var old_btn = (board.get('buttons') || []).find(function(b) { return b.id == btn.id; });
          if(old_btn) {
            emberSet(btn, 'label', old_btn.label);
            emberSet(btn, 'vocalization', old_btn.vocalization);
            emberSet(btn, 'inflections', old_btn.inflections);
          }
        }
      });
    }

    board.set('buttons', state.buttons);
    board.set('grid', state.grid);
    // Keep _last_raw in sync with the serialized save payload BEFORE any
    // rebuild. processButtons() → _build_from_raw(_last_raw) does
    // board.set('buttons', raw.buttons); if _last_raw still held the
    // pre-edit snapshot, that clobber would undo process_for_saving and
    // drop newly assigned image_ids (and other button edits) from the
    // Ember Data save. Legacy board/index processButtons only refreshed
    // display and never overwrote model.buttons from a stale raw cache.
    // Also merge in-session image_urls so the rebuild can resolve the
    // new image_ids (select_image_preview updates board.image_urls but
    // not _last_raw.image_urls).
    var imageUrlsForRaw = board.get('image_urls') ? Object.assign({}, board.get('image_urls')) : {};
    (orderedButtons || []).forEach(function(btnRow) {
      (btnRow || []).forEach(function(btn) {
        var imgId = btn && (btn.get ? btn.get('image_id') : null);
        if(imgId && !imageUrlsForRaw[imgId]) {
          var url = btn.get ? (btn.get('local_image_url') || btn.get('image_url')) : null;
          if(url) { imageUrlsForRaw[imgId] = url; }
        }
      });
    });
    if(Object.keys(imageUrlsForRaw).length) {
      board.set('image_urls', imageUrlsForRaw);
    }
    if(this._last_raw) {
      this._last_raw.buttons = state.buttons;
      this._last_raw.grid = state.grid;
      if(Object.keys(imageUrlsForRaw).length) {
        this._last_raw.image_urls = Object.assign({}, this._last_raw.image_urls || {}, imageUrlsForRaw);
      }
    }
    this.processButtons();

    // Handle copy-on-save
    var stashes = this.get('stashes');
    if(this.get('app_state.currentBoardState.id') && stashes.get('copy_on_save') == this.get('app_state.currentBoardState.id')) {
      var appController = this.get('app_state.controller');
      if(appController) {
        appController.send('tweakBoard', { update_locale: update_locale });
      }
      return;
    }

    // NOTE: edit_mode and the other edit-session flags used to be cleared here
    // (before the save started). That flipped the page to the non-edit layout
    // immediately on click, so the "Saving Changes…" overlay appeared on the
    // non-edit view instead of the edit view. We now defer exiting edit mode
    // to the finish() step below, after the save + fetch round-trip resolves.

    // Preserve image_urls before save
    var imageUrlsBeforeSave = board.get('image_urls') ? Object.assign({}, board.get('image_urls')) : {};
    (orderedButtons || []).forEach(function(btnRow) {
      (btnRow || []).forEach(function(btn) {
        var imgId = btn && (btn.get ? btn.get('image_id') : null);
        if(imgId && !imageUrlsBeforeSave[imgId]) {
          var url = btn.get ? btn.get('local_image_url') : null;
          if(url) { imageUrlsBeforeSave[imgId] = url; }
        }
      });
    });

    // Show loading state
    _this.set('board_saving', true);

    // Save via Ember Data (shared pipeline)
    board.save().then(function() {
      // Merge back image_urls
      if(imageUrlsBeforeSave) {
        var current = board.get('image_urls') || {};
        for(var k in imageUrlsBeforeSave) {
          if(!current[k]) { current[k] = imageUrlsBeforeSave[k]; }
        }
        board.set('image_urls', current);
      }

      // Folder-level cascade invalidations. If the save fired a folder
      // cascade on the server, the response carries the list of boards
      // whose buttons were updated. Invalidate each entry in the client
      // cache so a subsequent navigation into that sub-board refetches
      // the post-cascade buttons instead of serving stale (pre-cascade)
      // ordered_buttons from the 5-min TTL cache.
      var invs = board.get('cascade_invalidations');
      if(invs && invs.forEach) {
        invs.forEach(function(entry) {
          if(!entry) { return; }
          if(entry.id) { boardDetailCache.invalidate(entry.id); }
          if(entry.key) { boardDetailCache.invalidate(entry.key); }
        });
      }

      if(update_locale) {
        stashes.persist('label_locale', update_locale);
        _this.get('app_state').set('label_locale', update_locale);
        stashes.persist('vocalization_locale', update_locale);
        _this.get('app_state').set('vocalization_locale', update_locale);
      }

      // Rebuild display from fresh saved data. board_saving stays true for the
      // full save + fetch round-trip so the "Saving Changes…" overlay is pinned
      // to the edit page. Once the work is done we clear board_saving FIRST (so
      // the overlay disappears on the edit view), then flip edit_mode + related
      // flags and transition in the next frame — preventing a render where the
      // non-edit page shows up with the saving overlay still stuck on.
      var finish = function() {
        _this.set('board_saving', false);
        // Stay-in-edit-mode path (header Save button): the save
        // round-trip and post-save fetch are done; keep edit_mode
        // true and don't transition out. Reset the flag so subsequent
        // back_to_boards saves exit normally.
        if(_this.get('_save_keep_editing')) {
          _this.set('_save_keep_editing', false);
          return;
        }
        runLater(function() {
          if(_this.isDestroyed || _this.isDestroying) { return; }
          _this.set('edit_mode', false);
          _this.set('paint_mode', null);
          _this.set('color_picker_button', null);
          _this.set('board_recolored', false);
          _this.set('_saved_recolor', null);
          _this.set('borders_matched', false);
          _this.set('_saved_border_colors', null);
          // current_mode is deliberately NOT written here — mode ownership lives
          // in the routes. Exiting the .edit child route restores 'speak'
          // (routes/user/board-detail/edit.js resetController), and if this
          // transition ALSO leaves board-detail entirely (the
          // _save_exit_to_boards branch below), the parent route restores
          // 'default' when it had forced speak on entry
          // (routes/user/board-detail.js:496-500). So both destinations already
          // land correctly. Writing 'default' here was contradictory — the edit
          // route's resetController runs after this and overwrote it anyway —
          // and it opened a window where the speak_mode observer could fire
          // mid-transition and clobber last_speak_mode, re-triggering speak-mode
          // first-entry effects (set_history([]) wiping board history, the
          // "here we go" utterance, intro/goal modals).
          _this.set('panels_collapsed', true);
          _this.set('board_collapsed', true);
          // Honor "Save & Continue" flow from the panel's "Back to
          // Boards" prompt — redirect to the user's boards list rather
          // than the board view page when that flag is set.
          if(_this.get('_save_exit_to_boards')) {
            _this.set('_save_exit_to_boards', false);
            _this.get('router').transitionTo('user.boards', _this.get('user.user_name'));
          } else {
            _this.get('router').transitionTo('user.board-detail.index', _this.get('user.user_name'), _this.get('boardname'));
          }
        }, 0);
      };
      persistence.ajax('/api/v1/boards/' + board.get('key'), { type: 'GET' }).then(function(data) {
        var merged = boardDetailCache.normalize_board_payload(data);
        if(merged) {
          if(merged.images && merged.images.length) {
            _this._board_detail_images = merged.images;
          }
          boardDetailCache.set(JSON.parse(JSON.stringify(merged)), { force: true });
          _this._build_from_raw(merged);
        }
        finish();

        // Auto-rename the board key only for direct user renames. Translation
        // can change the visible board name, but route keys must stay stable.
        var original_name = _this.get('_original_board_name');
        var current_name = board.get('name');
        if(original_name && current_name && original_name !== current_name && !_this._name_matches_translation(board, current_name)) {
          _this._auto_rename_board(board, current_name, original_name);
          _this.set('_original_board_name', current_name);
        } else {
          modal.success(i18n.t('board_saved', "Board saved!"));
        }
      }, function() {
        finish();
        modal.success(i18n.t('board_saved', "Board saved!"));
      });
    }, function(err) {
      console.error(err);
      _this.set('board_saving', false);
      modal.error(i18n.t('board_save_failed', "Failed to save board"));
    });
  },

  _name_matches_translation: function(board, name) {
    if(!board || !name) { return false; }
    var translations = board.get('translations') || {};
    var names = translations.board_name || {};
    var default_locale = translations.default || board.get('locale') || 'en';
    var current_locale = board.get('locale');
    for(var loc in names) {
      if(!Object.prototype.hasOwnProperty.call(names, loc)) { continue; }
      if(loc === default_locale && loc === current_locale) { continue; }
      if(names[loc] === name) { return true; }
    }
    return false;
  },

  // Automatically rename the board key to match the new display name — but ONLY when
  // the URL was already following the name.
  //
  // `old_name` is the display name the page was loaded with. When the current key is
  // exactly the slug of that name, the URL has simply been tracking the label and
  // should keep tracking it. When it is anything else, the key is a deliberate choice
  // — one set through the classic rename UI, or a copy key carrying the collision
  // suffix `…_1` — and a label edit must not silently overwrite it.
  //
  // Skipping also avoids the cost: a rename schedules `rename_deep_links` on the SLOW
  // queue, which walks every upstream board, shared user, UserLink, UserBoardConnection
  // and LogSession that references this board (app/models/concerns/renaming.rb).
  //
  // Compared case-insensitively: `clean_path` preserves case ("Sequoia 15" ->
  // "Sequoia-15") while the server stores keys downcased (`Renaming#rename_to`).
  _auto_rename_board: function(board, new_name, old_name) {
    var _this = this;
    var user_name = board.get('user_name') || (_this.get('user') && _this.get('user').get('user_name'));
    var old_key = board.get('key');
    if(!user_name || !old_key) {
      modal.success(i18n.t('board_saved', "Board saved!"));
      return;
    }
    var old_slug = old_key.split('/').slice(1).join('/');
    var name_derived_slug = old_name ? window.LingoLinq.clean_path(old_name) : null;
    if(!name_derived_slug || old_slug.toLowerCase() !== name_derived_slug.toLowerCase()) {
      modal.success(i18n.t('board_saved', "Board saved!"));
      return;
    }
    var new_slug = window.LingoLinq.clean_path(new_name);
    var new_key = user_name + '/' + new_slug;

    // Skip if the key would be the same
    if(new_key === old_key) {
      modal.success(i18n.t('board_saved', "Board saved!"));
      return;
    }

    persistence.ajax('/api/v1/boards/' + board.get('id') + '/rename', {
      type: 'POST',
      data: {
        old_key: old_key,
        new_key: new_key
      }
    }).then(function(res) {
      _this.set('_original_board_name', new_name);
      _this.set('boardname', new_slug);
      modal.success(i18n.t('board_saved_and_renamed', "Board saved and URL updated!"));
      // Update the URL to reflect the new board key
      _this.get('router').transitionTo('user.board-detail', user_name, new_slug);
    }, function() {
      // Rename failed (possibly a collision) — board was still saved
      modal.success(i18n.t('board_saved_rename_failed', "Board saved! (URL could not be updated — a board with that name may already exist)"));
    });
  },

  // Open the button-settings modal for a button
  _open_button_settings: function(btn_id, state) {
    var board = this.get('model');
    if(!board) { return; }
    var button = editManager.find_button(btn_id);
    if(button) {
      button.state = state || 'general';
      modal.open('button-settings', { button: button, board: board });
    }
  },

  // Set up the floating cursor element for manual placement mode

  // Generate the next available button ID for the board
  _next_button_id: function() {
    var board = this.get('model');
    var buttons = (board && board.get('buttons')) || [];
    var max_id = 0;
    buttons.forEach(function(b) {
      var id = parseInt(b.id, 10);
      if(id > max_id) { max_id = id; }
    });
    // Also check ordered_buttons for IDs from fake buttons
    var ob = this.get('ordered_buttons') || [];
    ob.forEach(function(row) {
      (row || []).forEach(function(btn) {
        var id = parseInt(btn.get ? btn.get('id') : btn.id, 10);
        if(id > max_id) { max_id = id; }
      });
    });
    return max_id + 1;
  },

  _sidebarAppController: function() {
    var appController = this.get('app_state.controller');
    if(!appController || typeof appController.send !== 'function') {
      appController = getOwner(this).lookup('controller:application');
    }
    return appController;
  },

  _sidebar_board_by_key: function(key) {
    if(!key) { return null; }
    var boards = this.get('app_state.sidebar_boards') || [];
    for(var idx = 0; idx < boards.length; idx++) {
      var b = boards[idx];
      if(b && b.key === key) { return b; }
    }
    return { key: key };
  },

  _maybeCloseInlineSidebarAfterAction: function() {
    var prefs = this.get('app_state.currentUser.preferences') || {};
    if(prefs.disable_quick_sidebar) { return; }
    if(prefs.quick_sidebar || prefs.lock_quick_sidebar) { return; }
    this.set('inlineSidebarOpen', false);
  },

  _syncInlineSidebarFromPrefs: function() {
    var user = this.get('app_state.currentUser');
    if(!user) { return; }
    var prefs = user.get('preferences') || {};
    if(prefs.disable_quick_sidebar) {
      this.set('inlineSidebarOpen', false);
      return;
    }
    // effective_quick_sidebar treats an UNSET preference as show, so the sidebar is
    // open by default until the user collapses it (which persists quick_sidebar=false).
    if(this.get('app_state.effective_quick_sidebar') && !this.get('edit_mode')) {
      this.set('inlineSidebarOpen', true);
    }
  },

  syncInlineSidebarOnPrefChange: observer(
    'app_state.currentUser.preferences.quick_sidebar',
    'app_state.currentUser.preferences.disable_quick_sidebar',
    'app_state.currentUser.preferences.lock_quick_sidebar',
    'edit_mode',
    function() {
      this._syncInlineSidebarFromPrefs();
    }
  ),

  // Push current board state to navigation history
  _push_nav_history: function() {
    var user = this.get('user');
    var boardname = this.get('boardname');
    if(!user || !boardname) { return; }
    var history = (this.get('app_state.board_detail_nav_history') || []).slice();
    history.push({
      user_name: user.get('user_name'),
      boardname: boardname,
      title: this.get('title')
    });
    // Cap at 20 entries
    if(history.length > 20) { history = history.slice(history.length - 20); }
    this.set('app_state.board_detail_nav_history', history);
  },

  _preferred_board_detail_key: function(key) {
    if(!key || key.indexOf('/') === -1) { return RSVP.resolve(key); }
    var parts = key.split('/');
    var routeUser = this.get('user.user_name') || (this.get('model.key') || '').split('/')[0];
    if(!routeUser || parts[0] == routeUser) { return RSVP.resolve(key); }

    var preferredKey = routeUser + '/' + parts.slice(1).join('/');
    return LingoLinq.store.findRecord('board', preferredKey).then(function() {
      return preferredKey;
    }, function() {
      return key;
    });
  },

  // Helper to extract button ID (Button objects use .get, plain objects use direct access)
  _btn_id: function(btn) {
    if(!btn) { return null; }
    return btn.get ? btn.get('id') : btn.id;
  },

  // Find a display button in ordered_buttons by ID
  _find_display_button: function(btn_id) {
    var ob = this.get('ordered_buttons') || [];
    for(var ri = 0; ri < ob.length; ri++) {
      var row = ob[ri] || [];
      for(var ci = 0; ci < row.length; ci++) {
        var btn = row[ci];
        if(btn && (btn.id === btn_id || (btn.get && btn.get('id') === btn_id))) {
          return btn;
        }
      }
    }
    return null;
  },

  // Shared WAI-ARIA menu keyboard handler for the board-detail dropdowns
  // (details/share, paint palette, folder display style). Bootstrap 3
  // and our controller-driven `_open` flags handle open/close on click,
  // but provide no arrow-key navigation, Home/End shortcuts, or Escape
  // support. This helper implements that pattern on top, so each
  // dropdown only needs a thin action wrapper.
  //
  // opts: { state_prop, item_sel, toggle_action }
  _dropdown_keydown_handler: function(event, opts) {
    if(!event || !opts) { return; }
    var key = event.key;
    var keyCode = event.keyCode;
    var container = event.currentTarget;
    if(!container) { return; }
    // The first DOM child of the wrap is always the trigger button.
    var trigger = container.children[0];
    var items = Array.prototype.slice.call(
      container.querySelectorAll(opts.item_sel)
    ).filter(function(el) { return el.offsetParent !== null; });
    var is_open = this.get(opts.state_prop);
    var current_idx = items.indexOf(document.activeElement);

    // Escape: close the dropdown and restore focus to the trigger.
    if(key === 'Escape' || key === 'Esc' || keyCode === 27) {
      if(is_open) {
        event.preventDefault();
        this.set(opts.state_prop, false);
        if(trigger && typeof trigger.focus === 'function') {
          trigger.focus();
        }
      }
      return;
    }

    // ArrowDown: from trigger opens the menu (toggle action handles
    // focusing the first item via runLater); from a menu item moves
    // to the next item, wrapping at the end.
    if(key === 'ArrowDown' || keyCode === 40) {
      if(!is_open && document.activeElement === trigger) {
        event.preventDefault();
        this.send(opts.toggle_action);
        return;
      }
      if(is_open && items.length) {
        event.preventDefault();
        if(current_idx < 0 || current_idx >= items.length - 1) {
          items[0].focus();
        } else {
          items[current_idx + 1].focus();
        }
      }
      return;
    }

    // ArrowUp: previous item, wrapping at the top.
    if(key === 'ArrowUp' || keyCode === 38) {
      if(is_open && items.length) {
        event.preventDefault();
        if(current_idx <= 0) {
          items[items.length - 1].focus();
        } else {
          items[current_idx - 1].focus();
        }
      }
      return;
    }

    // Home: jump to first item.
    if(key === 'Home' || keyCode === 36) {
      if(is_open && items.length) {
        event.preventDefault();
        items[0].focus();
      }
      return;
    }

    // End: jump to last item.
    if(key === 'End' || keyCode === 35) {
      if(is_open && items.length) {
        event.preventDefault();
        items[items.length - 1].focus();
      }
      return;
    }
  },

  // Builds and persists the compound skin string for mix_only / mix_prefer,
  // bypassing set_compound_skin's toggle-off path so sub-option changes just
  // re-compose the limit bitmap.
  _rebuild_compound_skin: function(id) {
    var user_id = this.get('app_state.currentUser.id');
    var skin = id + (user_id ? '::' + user_id : '');
    if(id === 'mix_only' || id === 'mix_prefer') {
      skin = skin + '::limit-';
      var subs = this.get('skin_suboptions') || [];
      subs.forEach(function(opt) {
        if(opt.checked) { skin += (id === 'mix_only' ? '1' : '3'); }
        else            { skin += (id === 'mix_only' ? '0' : '1'); }
      });
    }
    this.send('set_display_pref', 'skin', skin);
  },

  /** Hardcoded BASE ↔ SOFT hex map for the Fitzgerald palette. Edit
   *  styles/_variables.scss to change a value, then update the
   *  corresponding entry below — kept in sync by hand because a
   *  computed map would require running the SCSS color.adjust math at
   *  runtime. The values below are the literal results of
   *  color.adjust($base, $saturation: -25%) (or +10% lightness for
   *  determiner-gray) per _variables.scss. */
  _FITZGERALD_BASE_TO_SOFT: {
    '#ffffaa': '#f4f4b5',  // pronoun-yellow
    '#ccffaa': '#cef4b5',  // verb-green
    '#aaccff': '#b5cef4',  // adjective-blue
    '#ffccaa': '#f4ceb5',  // noun-orange
    '#ffaacc': '#f4b5ce',  // social-pink
    '#ffaaaa': '#f4b5b5',  // negation-red
    '#ccaaff': '#ceb5f4',  // question-purple
    '#ffccdd': '#f8d2df',  // preposition-pink
    '#ccaa88': '#b6aa9d',  // adverb-brown
    '#cccccc': '#e6e6e6',  // determiner-gray (lightness +10%, not desat)
    '#73ccff': '#84c7ed'   // other-blue
  },

  /** Walks ordered_buttons and swaps each button's background_color
   *  via the BASE ↔ SOFT lookup table. Pure hex match — no color-math
   *  evaluator. Buttons whose stored bg isn't in the table (manual
   *  paints, custom hexes) are left alone. Mutates the Ember Button
   *  wrapper, the raw board.buttons entry, and the rendered DOM
   *  element's inline style directly so the change is visible
   *  immediately and persists on save.
   *
   *  Defined as a controller method (not inside the actions hash) so
   *  it's reachable as `this._refresh_auto_button_colors(...)` from
   *  inside an action handler. */
  _refresh_auto_button_colors: function(target_is_soft) {
    if(typeof window === 'undefined' || !window.tinycolor) { return; }

    // Build base→soft (or soft→base) lookup, normalized to lowercase
    // hex so any color storage format (rgb, #FFCCAA, etc.) maps the
    // same. Reverse direction is built by inverting the same table —
    // there's no derivation here, just a fixed lookup.
    var BASE_TO_SOFT = this._FITZGERALD_BASE_TO_SOFT;
    var lookup = {};
    Object.keys(BASE_TO_SOFT).forEach(function(base_hex) {
      var soft_hex = BASE_TO_SOFT[base_hex].toLowerCase();
      var base_lc = base_hex.toLowerCase();
      if(target_is_soft) { lookup[base_lc] = soft_hex; }
      else               { lookup[soft_hex] = base_lc; }
    });
    var norm = function(c) {
      if(!c) { return ''; }
      try { return window.tinycolor(c).toHexString().toLowerCase(); } catch(e) { return (c + '').toLowerCase().trim(); }
    };

    var ob = this.get('ordered_buttons') || [];
    var board = this.get('model');
    var raw_buttons = (board && board.get && board.get('buttons')) || [];
    var raw_by_id = {};
    raw_buttons.forEach(function(rb) { if(rb && rb.id != null) { raw_by_id[String(rb.id)] = rb; } });

    var any_changed = false;
    ob.forEach(function(row) {
      if(!row || !row.forEach) { return; }
      row.forEach(function(btn) {
        if(!btn) { return; }
        var bg = (btn.get ? btn.get('background_color') : btn.background_color);
        if(!bg) { return; }
        var bg_norm = norm(bg);
        var new_color = lookup[bg_norm];
        if(!new_color) { return; }  // not a recognized base/soft hex → leave alone (manual paint preserved)
        var new_border;
        try { new_border = window.tinycolor(new_color).darken(20).toRgbString(); }
        catch(e) { new_border = new_color; }
        var btn_id = (btn.get ? btn.get('id') : btn.id);
        // 1. Mutate the Ember Button wrapper so any future re-render
        //    picks up the new value.
        if(btn.set && typeof btn.set === 'function') {
          btn.set('background_color', new_color);
          btn.set('border_color', new_border);
        } else {
          btn.background_color = new_color;
          btn.border_color = new_border;
        }
        // 2. Mutate the raw board.buttons entry so the change persists
        //    when the board is saved.
        var raw = btn_id != null ? raw_by_id[String(btn_id)] : null;
        if(raw) {
          raw.background_color = new_color;
          raw.border_color = new_border;
        }
        // 3. Mutate the rendered DOM element's inline style directly
        //    so the visual update is immediate without depending on
        //    Ember's template binding to re-evaluate. The card that
        //    carries the inline background-color is the
        //    .md-board-detail-symbol-card with data-id matching the
        //    button id (the outer .md-board-detail-grid__cell with
        //    the same data-id has no bg of its own).
        if(typeof document !== 'undefined' && btn_id != null) {
          var sel = '.md-board-detail-symbol-card[data-id="' + btn_id + '"]';
          var dom_card = document.querySelector(sel);
          if(dom_card) {
            dom_card.style.backgroundColor = new_color;
            dom_card.style.setProperty('--btn-bg', new_color);
            dom_card.style.outlineColor = new_border;
          }
        }
        any_changed = true;
      });
    });
    // Invalidate any cached fast-html / contextualized buttons so a
    // subsequent re-render uses the new colors rather than a snapshot
    // built from the old raw data.
    if(any_changed && board && board.set) {
      board.set('last_cb', null);
      if(board.get('fast_html')) { board.set('fast_html', null); }
    }
  },

  /* Persist the board light/dark viewing choice to the logged-in user's
     preferences so it's remembered across sessions and shared with the
     create-board-new preview (both read `preferences.board_dark_mode`). Uses
     the same `device.updated` dirty-flag trick as the display-prefs save above,
     since Ember Data doesn't reliably mark the `preferences` raw blob dirty when
     only a sub-key changes. Best-effort — a failed save just leaves the prior
     remembered value. */
  _persist_board_dark_mode: function(val) {
    var user = this.get('app_state.currentUser');
    // Skip the save when the stored value already matches (e.g. clicking the
    // already-active side of the segmented toggle) — avoids redundant writes and
    // the last-write-wins race on rapid toggles. Normalized so unset (light) vs
    // an explicit false doesn't trigger a pointless write.
    //
    // NOTE (security review — LOW, accepted): this skip removes the local/redundant
    // races, but two TABS (or otherwise concurrent saves) can still last-write-wins
    // on the prefs blob. That's inherent to every client preference in the app —
    // there's no server-side version/lock on `preferences` — and it isn't introduced
    // here. Worst case is a single stale boolean (light vs dark) that self-corrects on
    // the next toggle; no data corruption. A true fix is optimistic concurrency
    // (etag/version) on the user-prefs endpoint — a system-wide change, out of scope.
    if(user && user.set && !!user.get('preferences.board_dark_mode') !== !!val) {
      user.set('preferences.board_dark_mode', !!val);
      user.set('preferences.device.updated', true);
      if(user.save) { user.save().then(null, function() {}); }
    }
  },

  // Board lock ("Stay on this Board") — the ONE place that decides whether
  // leaving the current board is allowed, and the only place that raises the
  // notice. Every board-to-board exit on this page calls it.
  //
  // It exists because the check used to be copy-pasted inline, and had been
  // copied to only 2 of this page's ~12 exits: `go_back` checked it on the
  // hierarchical-parent fallback but NOT on the ordinary in-session Back (which
  // transitions and returns first), and `go_home` and the Board Collections
  // drawer never checked it at all. A supervisor switching the lock on saw the
  // toggle engaged and the warning working, while Back and Home walked straight
  // out — a safety feature that failed quietly, which is the worst way for one
  // to fail.
  //
  // Scope matches the classic implementation (`controllers/application.js`
  // home / jump / back): the lock restrains BOARD-TO-BOARD navigation while
  // communicating. It is deliberately NOT a route-level `willTransition` guard —
  // that would also block leaving for settings, the dashboard, or logout, which
  // the lock has never done and which would strand the user.
  //
  // Gated on `edit_mode` (this controller's own flag), not `app_state.speak_mode`:
  // speak_mode is `current_mode == 'speak' && currentBoardState`, and
  // currentBoardState belongs to the classic board renderer, so keying on it here
  // risks the lock silently evaluating false and enforcing nothing. Editing the
  // board is the deliberate escape, same as leaving speak mode is on classic.
  board_lock_blocks_exit: function() {
    if(!this.get('stashes').get('sticky_board')) { return false; }
    if(this.get('edit_mode')) { return false; }
    modal.warning(i18n.t('sticky_board_notice', "Board lock is enabled, disable to leave this board."), true);
    return true;
  },

  /* The category sequence shown in the Categorize panel, in the user's order.
     Reads through the shared registry so the panel and the rendered board can
     never disagree about which categories exist or what they are called
     (utils/board_categories.js). `first`/`last` drive the disabled state of the
     move controls — a disabled control is clearer than one that silently no-ops
     at the ends of the list. */
  category_order_list: computed(
    'category_order',
    function() {
      var order = normalizeCategoryOrder(this.get('category_order'));
      return order.map(function(key, idx) {
        var cat = categoryForKey(key);
        return {
          key: key,
          label: categoryLabel(key),
          fillVar: cat && cat.fillVar,
          textVar: cat && cat.textVar,
          position: idx + 1,
          first: idx === 0,
          last: idx === order.length - 1
        };
      });
    }
  ),

  /* Has the user actually reordered anything?

     Reset used to sit beside Done unconditionally, so on a board nobody had reordered it
     was a prominent button that did nothing — and it competed with Done for the same
     corner. Compared against DEFAULT_CATEGORY_ORDER through the same normalizer the panel
     renders from, so a stored order that merely predates a new category key (and is
     backfilled to the default by normalize_order) still counts as unchanged. */
  category_order_changed: computed(
    'category_order',
    function() {
      var order = normalizeCategoryOrder(this.get('category_order'));
      if(order.length !== DEFAULT_CATEGORY_ORDER.length) { return true; }
      for(var i = 0; i < order.length; i++) {
        if(order[i] !== DEFAULT_CATEGORY_ORDER[i]) { return true; }
      }
      return false;
    }
  ),

  /* Destinations the move picker may offer. A category is a COLOUR here — the move is
     performed by painting — so a category with no paintable type (`controls`, `extra`,
     whose `types: []` makes swatch_for_category return null) cannot be a destination:
     move_button_to_category bailed and closed the dialog with no change and no message,
     so two of the twelve offered destinations were dead controls. Ordering still comes
     from category_order_list, so the picker matches the panel. */
  category_move_targets: computed('category_order_list.[]', function() {
    return (this.get('category_order_list') || []).filter(function(cat) {
      return cat && swatchForCategory(cat.key);
    });
  }),

  /* The user's INTENT for the Categorize switch while a toggle is being applied.
     `null` means nothing is pending and the switch simply mirrors the stored value.

     WHY THIS EXISTS: `categorize_enabled` feeds `grouping_active`, which re-renders the
     WHOLE board grid — every card's style, layout, paint and symbol <img>. Profiled at
     ~350ms of blocked main thread on a fast desktop and ~2.4s at 4x CPU throttle, and it
     scales with board size, so on a real tablet it runs into seconds. Nothing repaints
     while that runs — INCLUDING the switch — so the control looked broken and users
     clicked it again. (The click, the action and the save were never the problem: the
     native checkbox flips instantly and the PUT returns in ~0.2s.)

     An optimistic flag alone would NOT have helped: the pill already updated in the same
     tick and was blocked by the same render pass. The deferral below is the part that
     matters. */
  categorize_intent: null,

  /* What the SWITCH paints: the pending intent if there is one, else the stored value.
     Only the pill, the state word and the checkbox read this — never `grouping_active`,
     or we would be right back to painting and regrouping in one pass. */
  categorize_switch_on: computed('categorize_intent', 'categorize_enabled', function() {
    var intent = this.get('categorize_intent');
    if(intent === null || intent === undefined) { return this.get('categorize_enabled'); }
    return !!intent;
  }),

  /* True only while the switch is showing something the preview has not caught up to. */
  categorize_preview_loading: computed('categorize_intent', 'categorize_enabled', function() {
    var intent = this.get('categorize_intent');
    if(intent === null || intent === undefined) { return false; }
    return !!intent !== !!this.get('categorize_enabled');
  }),

  categorize_enabled: computed('board_category_settings', function() {
    // Must use the SAME test as BoardDetailGrid#groupingEnabled (`=== true`), or the
    // Categorize switch reads On while the board it describes is ungrouped.
    return (this.get('board_category_settings') || {}).enabled === true;
  }),

  /* Persist the grouping preference. Follows the documented 3-touch idiom: the
     nested set alone does not reliably mark the raw `preferences` attr dirty, so
     `preferences.device.updated` is poked before save or ember-data may never
     ship the change (see LEARNINGS "a new user preference is a 3-touch change").
     Writes the WHOLE sub-hash, so every flag has to be echoed on every save. */
  _save_category_grouping: function(changes) {
    /* Write to the user the board is FOR — see the note in board-detail-grid.js. A
       supervisor modelling for a communicator changes THAT communicator's setting; on
       their own board they change their own. Read and write must resolve the same user
       or the switch would describe one account and persist to another. */
    var user = this.get('app_state.referenced_user');
    if(!user || !user.set) { return; }
    var all = user.get('preferences.board_category_grouping') || {};
    var previous = all;
    /* ACCOUNT-WIDE, and there is nothing else to resolve. The preference is three flags
       describing the user, so there is no board reference to look up and no per-board slot
       to write into — `board_category_settings` reads exactly what is written here.

       This replaces a `write_ref` guard that refused to save when the board could not be
       identified. That guard existed because a PER-BOARD toggle used to fall back to
       rewriting the account-wide default: a scope mismatch, where a change meant for one
       board silently regrouped every board the user owned. The mismatch is what made it a
       bug, and the flat preference removes it — this switch means the account, writes the
       account, and reads back the account. The tripwire in
       user.rb#log_board_category_grouping_enable! stays regardless, because a false -> true
       edge nobody intended is still worth catching. */
    var written = {
      /* `=== true`, matching groupingEnabled. With `!== false` an ABSENT preference read
         as enabled, so an unrelated save silently turned grouping ON for a user who had
         never opted in. */
      enabled: changes.enabled === undefined ? (all.enabled === true) : !!changes.enabled,
      /* Both sub-preferences MUST be carried through every save. This object REPLACES the
         stored hash wholesale, so a key omitted here is dropped — toggling Categorize would
         otherwise reset the user's label and scrolling choices. The server sanitizer rebuilds
         the hash the same way and has the matching echo
         (user.rb#sanitize_board_category_grouping!).

         `!== false` here, NOT `=== true`: absent means TRUE for these two, because both
         describe what the grouped board already does (labels render, grid scrolls). The
         `enabled` flag above is the opposite — absent means OFF — because turning grouping
         on for someone who never asked moves vocabulary out of cells they have motor memory
         for, whereas keeping today's rendering is the safe default. Same reasoning as the
         Rails defaults. */
      show_category_names: changes.show_category_names === undefined
        ? (all.show_category_names !== false)
        : !!changes.show_category_names,
      vertical_scroll: changes.vertical_scroll === undefined
        ? (all.vertical_scroll !== false)
        : !!changes.vertical_scroll
    };
    user.set('preferences.board_category_grouping', written);
    /* `preferences.device` may not exist on the record — setting a nested path through a
       missing object throws "object in path could not be found", which would abort this
       handler AFTER the local set above and leave the UI showing a state that was never
       persisted. Same guard as components/boards-layout-toggle.js:135. */
    if(!user.get('preferences.device')) { user.set('preferences.device', {}); }
    user.set('preferences.device.updated', true);
    if(user.save) {
      user.save().then(null, function() {
        /* Do not swallow this. The switch and preview are bound to the local value, so a
           silently failed save (offline, 5xx) left the supervisor believing they had
           changed the communicator's board when nothing reached the server. */
        if(user.set) { user.set('preferences.board_category_grouping', previous); }
        modal.error(i18n.t('board_categorize_save_failed', "Couldn't save the Categorize setting. Please try again."));
      });
    }
  },

  actions: {
    toggle_category_order: function() {
      this.set('category_order_open', !this.get('category_order_open'));
    },

    /* The "Categorize" checkbox. Saves immediately rather than on board save —
       it is a preference on the USER, not part of the board being edited, so
       deferring it to the board's Save button would attach it to the wrong
       lifecycle and silently discard it if the edit is cancelled. */
    toggle_categorize: function() {
      /* Read the SWITCH, not the stored value: with a toggle already in flight the
         stored value is still the old one, so a quick second click would compute the
         same target again instead of reversing it. */
      var next_enabled = !this.get('categorize_switch_on');
      /* Switching OFF while the move-to-category picker is open would leave a
         dialog about categories floating over a preview that no longer has any.
         Close it here rather than only blocking new opens. */
      if(!next_enabled) { this.set('category_move_button', null); }

      /* Paint the switch and the preview's loading message FIRST, then do the expensive
         regroup. Two rAFs, not one: the first fires BEFORE the paint that the intent
         change schedules, so the callback would still land in the same frame and block
         it. The second runs after that frame has been painted, which is the whole point.
         Falls back to running inline where rAF is unavailable (tests, SSR) — the
         behaviour is then exactly what it was before this change. */
      this.set('categorize_intent', next_enabled);
      var _this = this;
      var apply = function() {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        _this._save_category_grouping({ enabled: next_enabled });
        /* Clear in the same tick as the save: `categorize_switch_on` then falls back to
           the stored value, which now equals the intent, so the switch does not flicker.
           If the save FAILS, _save_category_grouping restores the previous preference and
           the switch follows it back — the revert stays honest. */
        _this.set('categorize_intent', null);
      };
      if(typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function() { requestAnimationFrame(apply); });
      } else {
        apply();
      }
    },

    /* Move one category earlier/later in the sequence.
       The order is ONE-DIMENSIONAL: categories flow into columns, and which
       column one lands in is derived by the packing at the current width, not
       chosen. So up/down is the whole model — there is no honest meaning for
       left/right, and it would behave differently at each breakpoint. */
    /* Category ORDER is a property of the board, not of the user, and the board-side field
       does not exist yet — so there is nowhere for these two to write. They are reachable
       only from the reorder UI, which is parked behind `category_ordering_available: false`,
       so neither can be invoked today.
       They REFUSE LOUDLY rather than writing `{order: …}` into the user preference: the
       server sanitizer no longer echoes that key, so such a write would appear to succeed
       on the client and be gone on the next read — the exact silent-discard failure the
       per-board order already shipped once (see the note on `category_order`). */
    move_category: function(key, direction) {
      console.error('board-detail: move_category is not wired — category order moved to the ' +
                    'board and the board-side field does not exist yet (key=' + key +
                    ', direction=' + direction + ')');
    },

    /* Both write through the SAME path as the switch, so the "carry sub-preferences
       through" logic in _save_category_grouping is the single place that has to be
       right. Neither defers behind rAF the way toggle_categorize does: that flip
       re-renders the whole grid, whereas these two only toggle a class and a header,
       so there is no long block to paint around. */
    toggle_category_names: function() {
      this._save_category_grouping({ show_category_names: !this.get('category_names_visible') });
    },
    toggle_category_scroll: function() {
      this._save_category_grouping({ vertical_scroll: !this.get('category_vertical_scroll') });
    },
    reset_category_order: function() {
      console.error('board-detail: reset_category_order is not wired — see move_category');
    },

    /* Open the "move to category" picker for one previewed button. Clicking a
       button is the ACCESSIBLE path to moving it: it is keyboard- and
       touch-operable, which a drag gesture is not (WCAG 2.1 SC 2.1.1). */
    begin_category_move: function(btn) {
      if(!btn) { return; }
      /* Second half of the gate the template already applies to `@selectButton`.
         Kept as its own check so the picker cannot be opened by any future caller
         that reaches the action directly — the template gate is the UX, this is the
         invariant (see LEARNINGS: gated actions need both a template and a JS gate). */
      if(!this.get('categorize_enabled')) { return; }
      /* TEMPORARILY DISABLED. Clicking a button in the Categorize panel used to open the
         move picker; the move itself is being reworked (it repaints the button with the
         target category's swatch, which is the wrong mechanism for categories that are not
         defined by colour). Left as a single commented line rather than removing the
         action, so the gates above, `cancel_category_move`, `move_button_to_category` and
         the picker markup all stay wired and this is a one-line restore.

         While this is commented out `category_move_button` stays null, so the picker
         template (`{{#if this.category_move_button}}`) never renders and a click on a
         button in the panel does nothing. */
      // this.set('category_move_button', btn);
    },

    cancel_category_move: function() {
      this.set('category_move_button', null);
    },

    /* Move the picked button into a category.
       A category IS a colour here -- the categoriser reads the button's colour
       back -- so the move is performed by PAINTING the button with that
       category's fill/border/part_of_speech. Routed through editManager's paint
       pathway rather than setting the attributes directly, so it inherits the
       existing undo entry (paint_button calls save_state({mode:'paint'})) and the
       level-modification handling that Button.set_attribute does.
       This is a BOARD edit, so it follows the board's Save/Cancel like every
       other edit — unlike the category ORDER beside it, which is a user
       preference and saves immediately. */
    move_button_to_category: function(key) {
      var btn = this.get('category_move_button');
      var swatch = swatchForCategory(key);
      if(!btn || !swatch) { this.set('category_move_button', null); return; }

      // Use the CONTROLLER's paint_button action, not editManager.paint_button.
      // They are not interchangeable:
      //   • editManager.paint_button(id) resolves the button through find_button,
      //     which REPLACES the entry in `ordered_buttons` with a wrapped Button
      //     (edit_manager.js:1349). That array is a plain nested JS array, so the
      //     swap notifies nothing and the already-rendered template keeps the old
      //     object — the paint lands on a copy and nothing visibly moves.
      //   • the controller action mutates the button object it is HANDED (the one
      //     the template is rendering), mirrors the change into `model.buttons` so
      //     it persists on save, and forces the re-render by rebuilding
      //     ordered_buttons with fresh row references.
      // It is also the path the main board's paint mode already uses.
      var previous_paint = this.get('paint_mode');
      var previous_em_paint = editManager.paint_mode;

      this.send('set_paint_mode', swatch.fill, swatch.border, swatch.part_of_speech);
      /* Take the undo snapshot HERE. The controller's paint_button (unlike
         editManager.paint_button, which opens with save_state) never records one, so a
         category move pushed no history entry — pressing Undo afterwards popped the
         snapshot taken before the PREVIOUS edit and reverted both of them in one press,
         with no way to undo the move on its own and no indication two edits were lost. */
      try {
        editManager.save_state({ mode: 'paint', button_id: this._btn_id(btn) });
      } catch(e) { /* no active edit session — nothing to snapshot */ }
      this.send('paint_button', btn);

      // Restore whatever paint state was armed before — this borrows the paint
      // machinery for one button and must not leave the toolbar painting.
      this.set('paint_mode', previous_paint || false);
      editManager.paint_mode = previous_em_paint;

      this.set('category_move_button', null);
    },

    re_transition: function() {
      this.set('retrying', true);
      this.router.refresh();
    },

    exitBoards: function() {
      this.app_state.return_to_index();
    },

    toggle_options_menu: function() {
      var was_open = this.get('show_options_menu');
      this.toggleProperty('show_options_menu');
      /* Reset the inline My Board Collection panel whenever the menu
         closes (and on a fresh open) so the user always lands on the
         normal section list. Without this, a user who opened the
         collection, clicked the backdrop, then reopened the menu
         would see the collection still mid-render. */
      this.set('board_collection_open', false);
      /* Communicator accounts (no supporter_role) get the Buttons section
         expanded by default the first time the menu opens — Find a Button /
         Focus Words / Show Hidden are their primary actions, so they
         shouldn't have to dig. Supporters keep it collapsed. Guarded by a
         one-time flag so a user's later manual collapse is respected on
         subsequent opens.

         NOTE (security review false-positive): `buttons_submenu_open` is NOT a
         permission gate — it only controls whether an accordion section is
         visually EXPANDED (`aria-expanded` + an `{{#if}}` in board-detail.hbs).
         The items inside (Find a Button, etc.) are already rendered/usable to
         anyone who can open this menu and carry their own access checks; the
         `supporter_role` branch here only decides the initial expand state, so a
         non-binary role (admin/supervisor) at worst sees the section pre-opened
         or not — purely cosmetic, no boundary is crossed. The one-time instance
         flag is intentionally per-session (a UX default, nothing to persist). */
      if (!was_open && !this._buttons_submenu_defaulted) {
        this._buttons_submenu_defaulted = true;
        if (!this.get('app_state.currentUser.supporter_role')) {
          this.set('buttons_submenu_open', true);
        }
      }
      // When opening, move keyboard focus into the menu's first item so
      // arrow-key / Tab navigation can begin there. When closing, return
      // focus to the trigger button so the user lands back where they
      // started (WCAG 2.1.2 / 2.4.3 best practice).
      var _this = this;
      runLater(function() {
        if (_this.isDestroyed || _this.isDestroying) { return; }
        if (!was_open) {
          var menu = document.querySelector('.md-board-detail-actions-menu');
          if (!menu) { return; }
          var first_item = menu.querySelector('.md-board-detail-actions-menu__item');
          if (first_item) { first_item.focus(); }
          /* Arrow/Escape navigation is handled by `options_menu_keydown`, bound
             with `{{on "keydown"}}` on the menu container (board-detail.hbs, the
             `.md-board-detail-actions-menu` div). Native keydown bubbles from the
             focused child button, so the container sees every key.

             There used to be a block here that attached a native listener to each
             item over a SNAPSHOT of the visible items, taken at open time, and
             called stopPropagation. Two problems, one of them a real bug: the
             stopPropagation meant the container handler never ran, and the
             snapshot could not contain anything rendered later — so the four
             items inside the Board Actions submenu, which only exist once it is
             expanded, got no listener and were not in the array. Arrowing down
             from "Board Actions" jumped straight past all four. The container
             handler re-queries the DOM on every keypress, so it picks them up.

             The comment that justified the per-item block ("the Ember
             {{action on=\"keyDown\"}} on the menu div does not reliably fire")
             described the pre-Ember-5 {{action}} form; the binding is a native
             {{on}} modifier now. */
        } else {
          var trigger = document.querySelector('.md-board-detail-actions-toggle');
          if (trigger) { trigger.focus(); }
        }
      }, 50);
    },

    toggle_expand_submenu: function() {
      this.toggleProperty('expand_submenu_open');
    },

    toggle_session_submenu: function() {
      this.toggleProperty('session_submenu_open');
    },

    toggle_display_submenu: function() {
      this.toggleProperty('display_submenu_open');
    },

    toggle_buttons_submenu: function() {
      this.toggleProperty('buttons_submenu_open');
    },

    toggle_share_print_submenu: function() {
      this.toggleProperty('share_print_submenu_open');
    },

    toggle_language_submenu: function() {
      this.toggleProperty('language_submenu_open');
    },

    // Close the options menu on Escape from anywhere within the menu.
    // Wired from `keydown` on `.md-board-detail-actions-menu`.
    options_menu_keydown: function(event) {
      if (!event) { return; }
      var key = event.key || event.keyCode;
      if (key === 'Escape' || key === 'Esc' || key === 27) {
        event.preventDefault();
        if (this.get('board_collection_open')) {
          this.send('close_board_collection');
        } else if (this.get('show_options_menu')) {
          this.send('toggle_options_menu');
        }
        return;
      }
      // Arrow Up/Down: navigate between menu items (WAI-ARIA menu pattern)
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 40 || key === 38) {
        var items = Array.prototype.slice.call(
          document.querySelectorAll('.md-board-detail-actions-menu__item')
        ).filter(function(el) { return el.offsetParent !== null; });
        if (!items.length) { return; }
        event.preventDefault();
        event.stopPropagation();
        var idx = items.indexOf(document.activeElement);
        if (key === 'ArrowDown' || key === 40) {
          items[(idx + 1) % items.length].focus();
        } else {
          items[(idx - 1 + items.length) % items.length].focus();
        }
      }
    },

    // Options-menu "Take a tour" item — start the board-detail SPEAK tour. The
    // visible runner lives in the hidden {{guided-tour}} host; we trigger it by
    // setting the same pending flag the post-"Pick this Board" auto-open uses
    // (scoped to this board's key), which the host's watcher consumes and starts.
    //
    // `board_detail_tour_speak_manual` tells the host this is a REPLAY, not an
    // auto-open. Without it the host's once-per-user `tourAutoShown` gate
    // swallows this trigger for anyone who has already seen the tour once —
    // i.e. everyone who has picked a home board — and this menu item is the only
    // way in, because the component's own Shepherd button is display:none.
    // The host clears both flags when it consumes them.
    start_speak_tour: function() {
      this.set('show_options_menu', false);
      var app_state = this.get('app_state');
      var key = app_state && app_state.get('currentBoardState.key');
      if (key) {
        app_state.set('board_detail_tour_speak_manual', true);
        app_state.set('board_detail_tour_pending_speak', key);
      }
    },
    enter_edit_mode: function() {
      var _this = this;
      var app_state = this.get('app_state');
      // Gate on the speak-mode PIN when configured — same pattern as
      // switch_communicators below and the app-wide toggleEditMode.
      var ready = app_state.open_speak_mode_exit_pin('none');
      var enterEditNow = function() {
        _this.set('show_options_menu', false);
        _this.set('show_color_legend', false);
        _this.set('board_collapsed', false);
        _this.set('panels_collapsed', true);
        // Start the edit page with BOTH side panels collapsed to their rail, at
        // ANY screen size (per request) — the board grid gets the room and the
        // user can expand either panel manually. Set on entry only.
        _this.set('left_panel_collapsed', true);
        _this.set('right_panel_collapsed', true);
        _this.get('router').transitionTo('user.board-detail.edit', _this.get('user.user_name'), _this.get('boardname'));
      };
      ready.then(function(res) {
        if(res && res.correct_pin) {
          // Owner path: direct edit. Ownership is authoritative and ALWAYS available client-
          // side (a board's key is `<owner>/<slug>` and `user_name` is the owner), unlike
          // `model.permissions.edit`, which the boards-index list load OMITS — so a board
          // reached from My Boards / dashboard / sidebar can false-prompt a copy on the
          // user's OWN board until a manual refresh (which reloads via the single-board
          // endpoint that DOES include permissions). If the session user owns it, edit
          // directly. Also clears any stale copy_on_save flag so a previous non-owner edit
          // attempt's leftover flag can't trigger the copy flow on this owner's save.
          var owner_name = _this.get('model.user_name') || ((_this.get('model.key') || '').split('/')[0]);
          var session_name = _this.get('app_state.sessionUser.user_name');
          var owns_board = !!(owner_name && session_name && owner_name === session_name);
          if(_this.get('model.permissions.edit') || owns_board) {
            _this.get('stashes').persist('copy_on_save', null);
            enterEditNow();
            return;
          }
          // Non-owner path: copy first, then edit the user's copy. Deferring
          // copy until save can leave folder links pointing back to the source set.
          var session_user = _this.get('app_state.sessionUser');
          var copyable = !_this.get('model.uncopyable') && !_this.get('model.for_sale');
          if(session_user && copyable) {
            modal.open('confirm-needs-copying', { board: _this.get('model') }).then(function(confirmRes) {
              if(confirmRes === 'confirm') {
                var appController = _this.get('app_state.controller');
                if(!appController || typeof appController.copy_board !== 'function') {
                  appController = getOwner(_this).lookup('controller:application');
                }
                if(!appController || typeof appController.copy_board !== 'function') {
                  modal.error(i18n.t('app_not_ready', "App is not ready. Please try again."));
                  return;
                }
                var source_board = _this.get('model');
                var finish_copy = function(copied_board) {
                  if(!copied_board || _this.isDestroyed || _this.isDestroying) { return; }
                  var copied_key = copied_board.get ? copied_board.get('key') : copied_board.key;
                  if(!copied_key) { return; }
                  var parts = copied_key.split(/\//);
                  var user_name = parts.shift();
                  var board_name = parts.join('/');
                  _this.get('stashes').persist('copy_on_save', null);
                  _this.get('router').transitionTo('user.board-detail.edit', user_name, board_name);
                };
                RSVP.resolve(source_board).then(function(copy_board) {
                  return modal.open('copy-board', {
                    board: copy_board,
                    original_board: copy_board === source_board ? null : source_board,
                    for_editing: true
                  });
                }).then(function(opts) {
                  if(opts === false) { return RSVP.resolve(); }
                  return appController.copy_board(opts, true, null, finish_copy);
                }).then(finish_copy, function() { });
              }
            }, function() { });
            return;
          }
          // Fallback: no edit perm and not copyable — let the existing
          // server-side guard reject on save.
          enterEditNow();
        }
      }, function() { });
    },

    /* The large Back control shown after "Try this Board". Returns to the picker
       LIST -- not the preview overlay -- so the user lands where they were
       browsing rather than back inside the modal they just left.

       Clears the marker first: the button is gone the moment it is used, and the
       picker route re-arms its own state on entry. */
    try_back_to_picker: function() {
      this.set('app_state.board_detail_try_origin', null);
      this.set('show_options_menu', false);
      this.get('router').transitionTo('board-picker');
    },

    exit_to_home: function() {
      var _this = this;
      var app_state = this.get('app_state');
      // Gate on the speak-mode PIN when configured. Without this the button
      // lets a communicator leave the locked session by navigating home.
      var ready = app_state.open_speak_mode_exit_pin('none');
      ready.then(function(res) {
        if(!res || !res.correct_pin) { return; }
        // Signal any in-flight async work on this controller to bail.
        // _build_from_raw and its callers check this flag and return early.
        _this.set('_exiting', true);
        // Cancel known scheduled timers on this controller.
        if(_this._phrase_search_timer) {
          try { runCancel(_this._phrase_search_timer); } catch(e) {}
          _this._phrase_search_timer = null;
        }
        _this.set('show_options_menu', false);
        _this.set('app_state.board_detail_nav_history', []);
        _this.set('app_state.board_detail_entry_board', null);
        app_state.finish_speak_mode_exit();
        app_state.show_loading_overlay(i18n.t('loading_home_page', "Loading Home Page..."));
        var transition = _this.get('router').transitionTo('index');
        if(transition && typeof transition.then === 'function') {
          transition.then(
            function() { app_state.hide_loading_overlay(); },
            function() { app_state.hide_loading_overlay(); }
          );
        } else {
          app_state.hide_loading_overlay();
        }
      }, function() { });
    },

    exit_speak_mode: function() {
      var _this = this;
      var app_state = this.get('app_state');
      var ready = app_state.open_speak_mode_exit_pin('none');
      ready.then(function(res) {
        if(!res || !res.correct_pin) { return; }
        _this.set('_exiting', true);
        if(_this._phrase_search_timer) {
          try { runCancel(_this._phrase_search_timer); } catch(e) {}
          _this._phrase_search_timer = null;
        }
        _this.set('show_options_menu', false);
        app_state.toggle_speak_mode('off');
      }, function() { });
    },

    toggle_all_buttons: function() {
      this.set('show_options_menu', false);
      var state = this.get('stashes').get('all_buttons_enabled');
      if(state) {
        this.get('stashes').persist('all_buttons_enabled', null);
      } else {
        this.get('stashes').persist('all_buttons_enabled', true);
      }
    },

    toggle_focus: function() {
      // Menu click can bubble/re-fire the action; debounce rapid re-invocations.
      var now = Date.now();
      if(this._lastToggleFocusAt && (now - this._lastToggleFocusAt) < 300) {
        return false;
      }
      this._lastToggleFocusAt = now;
      this.set('show_options_menu', false);
      if(this.get('app_state').get('focus_words')) {
        this.get('app_state').set('focus_words', null);
        var model = this.get('model');
        if(model && model.set) { model.set('focus_id', 'blank'); }
        editManager.process_for_displaying();
      } else {
        modal.open('modals/focus-words', {board: this.get('model')});
      }
      return false;
    },

    switch_communicators: function() {
      this.set('show_options_menu', false);
      var _this = this;
      var app_state = this.get('app_state');
      var ready = app_state.open_speak_mode_exit_pin('none');
      ready.then(function(res) {
        if(res && res.correct_pin) {
          modal.open('switch-communicators', {});
        }
      }, function() { });
    },

    find_button: function() {
      this.set('show_options_menu', false);
      var include_other_boards = this.get('app_state').get('speak_mode') && ((this.get('stashes').get('root_board_state') || {}).key) == this.get('app_state').get('currentUser.preferences.home_board.key');
      modal.open('find-button', {
        inactivity_timeout: this.get('app_state').get('speak_mode'),
        board: this.get('model'),
        include_other_boards: include_other_boards
      });
    },

    toggle_sticky_board: function() {
      this.set('show_options_menu', false);
      this.get('stashes').persist('sticky_board', !this.get('stashes').get('sticky_board'));
    },

    toggle_pause_logging: function() {
      this.set('show_options_menu', false);
      var ts = (new Date()).getTime();
      if(this.get('stashes').get('logging_paused_at')) {
        ts = null;
      }
      this.get('stashes').persist('logging_paused_at', ts);
    },

    revert_to_old_style: function() {
      this.set('show_options_menu', false);
      var user = this.get('user');
      var boardname = this.get('boardname');
      if(user && boardname) {
        this.get('router').transitionTo('user.board-alt', user.get('user_name'), boardname);
      }
    },

    // "Classic View" button on the board-detail EDIT page: persist the
    // user's preference to 'classic' (so future logins land in the
    // classic view) AND navigate to the board-alt page in normal mode.
    // Uses the same dirty-bit trick as set_display_pref: Ember Data
    // doesn't reliably mark the raw `preferences` blob dirty on a
    // nested set, so we also poke `preferences.device.updated` to
    // force the full blob to ship.
    //
    // Loading mask: reuse the same view-switch overlay that the
    // Classic → Modern direction uses (controllers/board/index.js
    // go_to_modern → utils/view_switch_overlay.js). Pass
    // accentLight:true so the parenthesized clarifier in the title
    // renders at a lighter font-weight on this direction, per the
    // design ask.
    go_to_classic: function() {
      var user = this.get('user');
      var boardname = this.get('boardname');
      var prefUser = this.get('app_state.currentUser');
      if(prefUser) {
        prefUser.set('preferences.board_view_style', 'classic');
        if(prefUser.save) {
          prefUser.set('preferences.device.updated', true);
          prefUser.save();
        }
      }
      if(!user || !boardname) { return; }
      var userName = user.get('user_name');
      var routerSvc = this.get('router');
      // Theme detection mirrors go_to_modern: prefer the user's explicit
      // light signal, otherwise default dark so the mockup matches the
      // destination's typical theme.
      var appStateService = this.get('app_state');
      var isDark = true;
      if (appStateService && typeof appStateService.get === 'function') {
        var themeMode = appStateService.get('themeMode');
        if (themeMode === 'light' || themeMode === 'midDay' || themeMode === 'default') {
          isDark = false;
        }
      }
      paint_view_switch_overlay({
        routerSvc: routerSvc,
        isDark: isDark,
        accentLight: true,
        transition: function() {
          return routerSvc.transitionTo('user.board-alt', userName, boardname);
        }
      });
    },

    toggle_board_collapsed: function() {
      this.toggleProperty('board_collapsed');
    },

    /* Edit-panel Board Actions section toggle. On the COLLAPSED rail
       (auto-engaged on entering edit mode at ANY viewport — see
       `_auto_collapse_panels_on_edit` and the resize handler)
       the section's content (`.md-board-edit-panel__collapse`)
       is hidden by `display: none !important` in app.scss (~line 85200).
       Just flipping `board_actions_collapsed` while the panel is still a
       rail toggles invisible state — the user taps the gear icon and
       nothing appears to happen. Mirror the right-panel pattern
       (`toggle_right_panel_section`, line ~5641): in rail mode, expand
       the panel AND open the section. */
    toggle_board_actions: function() {
      if(this.get('left_panel_collapsed')) {
        this.set('left_panel_collapsed', false);
        this.set('board_actions_collapsed', false);
        return;
      }
      this.toggleProperty('board_actions_collapsed');
    },

    toggle_color_legend: function() {
      this.toggleProperty('show_color_legend');
    },

    toggle_description: function() {
      this.toggleProperty('description_expanded');
    },

    toggle_description_info: function() {
      this.toggleProperty('description_info_expanded');
    },

    // Edit-card description textarea auto-resize. On focus and on
    // each keystroke, expand the textarea to fit its full content
    // (style.height = scrollHeight). The CSS still caps the unfocused
    // height at 150px with internal scroll; this action runs while
    // focused, so the user always sees their full text without the
    // textarea's internal scrollbar — the page scroll handles content
    // taller than the viewport. Reset height to 'auto' first so
    // shrinking on delete works too.
    auto_resize_description: function(ev) {
      var el = ev && ev.target;
      if(!el) { return; }
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    },
    // On blur, clear the inline height so the CSS rules (max-height:
    // 150px + overflow-y: auto in the unfocused state) take over
    // again. Without this the inline style.height set on focus would
    // keep the textarea at its expanded size after blurring.
    auto_resize_description_blur: function(ev) {
      var el = ev && ev.target;
      if(!el) { return; }
      el.style.height = '';
    },

    // Opens the board-privacy modal so the user can change this board's
    // public/private/protected setting from the inline header indicator.
    // Same modal opened by the Visibility & License row in the
    // board-details component, so the flow matches what the user gets in
    // their preferences screen.
    //
    // If the user was in edit mode when they opened the modal, we restore
    // edit_mode after the modal closes (on either success or cancel) so
    // they land back on the board-detail edit page rather than the
    // read-only view — the privacy POST + model reload can otherwise
    // sometimes drop edit state via re-render.
    open_board_privacy: function() {
      var _this = this;
      var was_editing = this.get('edit_mode');
      var restore = function() {
        if (_this.isDestroyed || _this.isDestroying) { return; }
        if (was_editing && !_this.get('edit_mode')) {
          _this.set('edit_mode', true);
        }
      };
      modal.open('modals/board-privacy', {
        board: this.get('model'),
        button_set: this.get('model.button_set')
      }).then(restore, restore);
    },

    speak_phrase: function(phrase) {
      if(phrase && phrase.text) {
        utterance.speak_text(phrase.text);
      }
    },

    go_back: function() {
      // Checked FIRST, before the in-session-history branch below. That branch
      // transitions and returns, so a lock check placed after it (as it was)
      // only ever ran on the no-history parent-climb fallback — Back was the
      // lock's open front door.
      if(this.board_lock_blocks_exit()) { return; }
      var history = (this.get('app_state.board_detail_nav_history') || []).slice();
      var prev = history.pop();
      if(prev) {
        this.set('app_state.board_detail_nav_history', history);
        this.get('router').transitionTo('user.board-detail', prev.user_name, prev.boardname);
        return;
      }
      // No in-session trail (e.g. deep-linked board): climb hierarchical parent if set.
      var parentKey = this.get('model.parent_board_key');
      if(!parentKey || String(parentKey).indexOf('/') === -1) { return; }
      var _this = this;
      this._preferred_board_detail_key(String(parentKey)).then(function(preferred_key) {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        var parts = preferred_key.split('/');
        _this.get('router').transitionTo('user.board-detail', parts[0], parts.slice(1).join('/'));
      });
    },

    go_home: function() {
      this.set('show_options_menu', false);
      // Home is a board-to-board exit like any other and was entirely unguarded
      // — it even cleared board_detail_nav_history on the way out.
      if(this.board_lock_blocks_exit()) { return; }
      // Prefer the active communicator's home (modeling / speak-as), then
      // the signed-in user's — so broken-link recovery and the Home control
      // land on the board the current speak session is for.
      var home = this.get('app_state.referenced_user.preferences.home_board') ||
        this.get('app_state.currentUser.preferences.home_board');
      if(home && home.key) {
        this.set('app_state.board_detail_nav_history', []);
        var parts = home.key.split('/');
        this.get('router').transitionTo('user.board-detail', parts[0], parts.slice(1).join('/'));
        return;
      }
      // Fall back to the first board the user entered on this session
      var entry = this.get('app_state.board_detail_entry_board');
      if(entry && entry.user_name && entry.boardname) {
        // Check if already on the entry board
        var current_boardname = this.get('boardname');
        var current_user = this.get('user.user_name');
        if(current_boardname === entry.boardname && current_user === entry.user_name) {
          modal.notice(i18n.t('no_home_board_set', "You haven't selected a home board yet. You can set one in your user settings."));
          return;
        }
        this.set('app_state.board_detail_nav_history', []);
        this.get('router').transitionTo('user.board-detail', entry.user_name, entry.boardname);
        return;
      }
      // No entry board either
      modal.notice(i18n.t('no_home_board_set', "You haven't selected a home board yet. You can set one in your user settings."));
    },

    // button-listener dispatches events here for scanning/gaze/dwell support
    button_event: function(action, a, b) {
      this.send(action, a, b);
    },

    // button-listener delegates to buttonSelect/buttonPaint (defined below in actions)

    toggle_quick_phrases: function() {
      this.toggleProperty('show_quick_phrases');
    },

    toggle_categories: function() {
      this.toggleProperty('show_categories');
    },

    toggle_panels: function() {
      this.set('show_options_menu', false);
      this.toggleProperty('panels_collapsed');
    },

    toggle_dark_mode: function() {
      // De-dupe the AAC pointer layer's synthetic click re-fire (same pattern as
      // `library_options`): without this, a single tap on the collapsed-rail
      // theme pill fires twice and the flip cancels itself (ON then OFF), so the
      // toggle looked dead. Ignore a repeat call within 250ms.
      var now = Date.now();
      if(this._lastDarkToggle && (now - this._lastDarkToggle) < 250) { return; }
      this._lastDarkToggle = now;
      this.set('show_options_menu', false);
      this.toggleProperty('dark_mode');
      this._persist_board_dark_mode(this.get('dark_mode'));
    },

    // Explicit setter for the both-options segmented toggle in the
    // left panel (vs toggle_dark_mode which just flips). Idempotent —
    // clicking the already-active side is a harmless no-op.
    set_dark_mode: function(on) {
      this.set('dark_mode', !!on);
      this._persist_board_dark_mode(!!on);
    },

    toggle_modeling: function() {
      this.set('show_options_menu', false);
      this.get('app_state').toggle_modeling_if_possible(
        !this.get('app_state.modeling')
      );
    },

    toggle_modeling_pause: function() {
      var appState = this.get('app_state');
      appState.set('modeling_paused', !appState.get('modeling_paused'));
    },

    /* G3: `toggle_details_dropdown` and `details_dropdown_keydown` were deleted
       2026-08-24. They drove the "Details & Actions" dropdown that the
       board-detail redesign removed — no template referenced either, and
       `details_dropdown_keydown` was the ONLY route to the toggle (via
       `_dropdown_keydown_handler`'s dynamic `send(opts.toggle_action)`), so the
       whole chain was unreachable. `_dropdown_keydown_handler` itself stays: it
       is live for `toggle_paint_dropdown`.

       The `details_dropdown_open` FLAG is deliberately left in place. Several
       surviving actions still write it and the document click-handler at ~:604
       reads it; with the toggle gone it is simply always false, which is
       harmless. Untangling it means touching ~20 sites across two files
       including a global click handler — a refactor, not a deletion, and not
       worth the regression surface in this controller. */

    // ── Display Preferences Panel ──
    toggle_display_font_dropdown: function() {
      this.toggleProperty('display_prefs_font_dropdown_open');
      if(this.get('display_prefs_font_dropdown_open')) {
        this.set('display_prefs_font_filter', '');
        next(function() {
          var input = document.getElementById('bd-font-dropdown-search');
          if(input) { input.focus(); }
        });
      }
    },

    close_display_font_dropdown: function() {
      this.set('display_prefs_font_dropdown_open', false);
      this.set('display_prefs_font_filter', '');
    },

    pick_display_font: function(font_id) {
      // [TEMP DEBUG] Remove after we've diagnosed the right-panel
      // font dropdown not updating the preview.
      try {
        console.log('[trace] pick_display_font fired', {
          font_id: font_id,
          font_id_type: typeof font_id,
          before_button_style: this.get('app_state.currentUser.preferences.device.button_style'),
          pending_set: !!this.get('pending_display_prefs')
        });
      } catch(e) { /* ignore */ }
      this.send('set_display_pref', 'button_style', font_id);
      try {
        console.log('[trace] pick_display_font after set_display_pref', {
          after_button_style: this.get('app_state.currentUser.preferences.device.button_style')
        });
      } catch(e) { /* ignore */ }
      this.set('display_prefs_font_dropdown_open', false);
      this.set('display_prefs_font_filter', '');
    },

    filter_display_fonts: function(value) {
      this.set('display_prefs_font_filter', value || '');
    },

    font_dropdown_keydown: function(event) {
      if(event && event.key === 'Escape') {
        event.preventDefault();
        this.send('close_display_font_dropdown');
      } else if(event && event.key === 'Enter') {
        event.preventDefault();
        var first = (this.get('filtered_button_style_options') || []).find(function(o) { return !o.divider; });
        if(first) { this.send('pick_display_font', first.id); }
      }
    },

    toggle_display_symbol_library_dropdown: function() {
      this.toggleProperty('display_prefs_symbol_library_dropdown_open');
    },
    close_display_symbol_library_dropdown: function() {
      this.set('display_prefs_symbol_library_dropdown_open', false);
    },

    // The skin-tones popover deliberately doesn't render the shared
    // .md-settings-dropdown-backdrop overlay (it covers the whole viewport
    // with `position: fixed; inset: 0` and blocks page scroll). Instead we
    // attach a document-level pointerdown listener on open that closes the
    // popover when a tap lands outside both the trigger and the popover —
    // giving us tap-outside-to-close without sacrificing scroll. The
    // listener is registered on `next` so the click that opened the
    // popover doesn't immediately close it.
    toggle_display_skin_dropdown: function() {
      var _this = this;
      var was_open = this.get('display_prefs_skin_dropdown_open');
      this.toggleProperty('display_prefs_skin_dropdown_open');
      if(!was_open) {
        next(function() {
          if(_this.isDestroyed || _this.isDestroying) { return; }
          var handler = function(e) {
            var trigger = document.querySelector('.md-settings-skin-trigger');
            var popover = document.querySelector('.md-settings-skin-popover--open');
            if(trigger && trigger.contains(e.target)) { return; }
            if(popover && popover.contains(e.target)) { return; }
            _this.set('display_prefs_skin_dropdown_open', false);
            document.removeEventListener('mousedown', handler, true);
            document.removeEventListener('touchstart', handler, true);
            _this._skin_dropdown_outside_handler = null;
          };
          _this._skin_dropdown_outside_handler = handler;
          // Capture phase + mousedown/touchstart so we close as soon as a
          // tap begins, before any action handler on the underlying element
          // fires its click.
          document.addEventListener('mousedown', handler, true);
          document.addEventListener('touchstart', handler, true);
        });
      } else if(this._skin_dropdown_outside_handler) {
        document.removeEventListener('mousedown', this._skin_dropdown_outside_handler, true);
        document.removeEventListener('touchstart', this._skin_dropdown_outside_handler, true);
        this._skin_dropdown_outside_handler = null;
      }
    },
    close_display_skin_dropdown: function() {
      this.set('display_prefs_skin_dropdown_open', false);
      if(this._skin_dropdown_outside_handler) {
        document.removeEventListener('mousedown', this._skin_dropdown_outside_handler, true);
        document.removeEventListener('touchstart', this._skin_dropdown_outside_handler, true);
        this._skin_dropdown_outside_handler = null;
      }
    },
    pick_display_symbol_library: function(id) {
      this.send('set_display_pref', 'preferred_symbols', id);
      this.set('display_prefs_symbol_library_dropdown_open', false);
    },

    toggle_display_symbol_background_dropdown: function() {
      this.toggleProperty('display_prefs_symbol_background_dropdown_open');
    },
    close_display_symbol_background_dropdown: function() {
      this.set('display_prefs_symbol_background_dropdown_open', false);
    },
    pick_display_symbol_background: function(id) {
      // High-contrast is a two-field setting — mirrors the board-layout page's
      // "Black with High Contrast" option: symbol_background='black' +
      // high_contrast=true. Picking any other option turns HC off and sets
      // symbol_background to the chosen value.
      // 'clear', 'clear_soft', 'clear_faded', 'white', 'black' all store
      // directly. The soft/faded variants additionally cause the
      // .fitzgerald-soft / .fitzgerald-faded class to be emitted by
      // pref-classes.js#symbol_background_class, swapping the
      // --fitzgerald-* CSS custom properties to the muted variants.
      //
      // We CAN'T just call set_display_pref twice (the natural-looking
      // approach) because each call triggers user.save() when the
      // More Settings panel is closed (pending_display_prefs is null).
      // The first save sends a snapshot with symbol_background still
      // at its OLD value (we update it on the second call) — and if
      // that first save's response comes back AFTER the second save's,
      // the server-echoed old value clobbers the model and the
      // sync_fitzgerald_scope observer reapplies the old class. Users
      // see the buttons flash to the new bg, then revert. To prevent
      // the race we mutate both fields on the local model first, then
      // call user.save() once at the end with both new values in the
      // payload.
      var pending = this.get('pending_display_prefs');
      var user = this.get('app_state.currentUser');
      var hc = (id === 'high_contrast');
      var bg = hc ? 'black' : id;
      if(user) {
        user.set('preferences.high_contrast', hc);
        user.set('preferences.symbol_background', bg);
      }
      if(pending) {
        this.set('pending_display_prefs.high_contrast', hc);
        this.set('pending_display_prefs.symbol_background', bg);
      }
      if(!pending && user && user.save) {
        // Ember Data doesn't reliably mark `preferences` (DS.attr('raw'))
        // as dirty when only sub-properties are mutated, so a plain
        // user.save() can ship the OLD preferences blob and the server
        // echo back overwrites our local change. The center's
        // save_display_preferences uses this same trick on line 3732.
        user.set('preferences.device.updated', true);
        user.save();
      }
      this.set('display_prefs_symbol_background_dropdown_open', false);
      // Apply the Fitzgerald-soft / -faded class at <html> so :root has
      // the override. Necessary for any code path that reads colors via
      // getComputedStyle (the JS palette, button auto-coloring) to see
      // the muted values rather than the base palette.
      if(window.LingoLinq && window.LingoLinq.set_fitzgerald_scope) {
        window.LingoLinq.set_fitzgerald_scope(id);
      }
      // For Colored / Colored Soft toggles, swap any button whose stored
      // bg matches a known Fitzgerald hex (base ↔ soft via the hardcoded
      // _FITZGERALD_BASE_TO_SOFT lookup). Manually painted buttons with
      // any other hex are left untouched. The swap mutates the wrapper,
      // the raw board.buttons (so it persists on save), and the rendered
      // DOM element directly (so the visual update is instant).
      if(id === 'clear' || id === 'clear_soft') {
        this._refresh_auto_button_colors(id === 'clear_soft');
      }
    },

    toggle_display_voice_height_dropdown: function() {
      this.toggleProperty('display_prefs_voice_height_dropdown_open');
    },
    close_display_voice_height_dropdown: function() {
      this.set('display_prefs_voice_height_dropdown_open', false);
    },
    pick_display_voice_height: function(id) {
      this.send('set_display_pref', 'vocalization_height', id);
      this.set('display_prefs_voice_height_dropdown_open', false);
    },

    toggle_display_settings: function() {
      if(this.get('display_prefs_open')) {
        // Just collapse the panel — keep pending changes in memory so the
        // user can re-expand and see them. Full discard happens via
        // cancel_edit or a no-op save.
        this.set('display_prefs_open', false);
      } else {
        this.send('open_display_preferences');
      }
    },

    open_display_preferences: function() {
      this.set('details_dropdown_open', false);
      // Reuse the existing pending state if the panel was previously
      // collapsed without committing — don't stomp the user's in-progress
      // edits by re-snapshotting.
      if(this.get('pending_display_prefs')) {
        this.set('display_prefs_open', true);
        return;
      }
      var pref_user = this._pref_user_for_display();
      var prefs = (pref_user && pref_user.get('preferences')) || this.get('app_state.currentUser.preferences') || {};
      var device = prefs.device || {};
      // Seed pending + original (deep copy) with current values
      var snapshot = {
        button_spacing:       device.button_spacing       || 'medium',
        button_border:        device.button_border        || 'medium',
        button_text:          device.button_text          || 'medium',
        button_text_position: device.button_text_position || 'bottom',
        button_style:         device.button_style         || 'default',
        hidden_buttons:       prefs.hidden_buttons        || 'grid',
        stretch_buttons:      prefs.stretch_buttons       || 'none',
        preferred_symbols:    prefs.preferred_symbols     || 'original',
        symbol_background:    prefs.symbol_background     || 'clear',
        high_contrast:        !!prefs.high_contrast,
        utterance_text_only:  !!device.utterance_text_only,
        skin:                 prefs.skin                  || 'default'
      };
      this.set('pending_display_prefs', JSON.parse(JSON.stringify(snapshot)));
      this.set('original_display_prefs', JSON.parse(JSON.stringify(snapshot)));
      this.set('display_prefs_open', true);
    },

    close_display_preferences: function() {
      // Restore original values to the live user model so any unsaved changes revert
      var user = this._pref_user_for_display() || this.get('app_state.currentUser');
      var orig = this.get('original_display_prefs');
      var paths = this._display_prefs_paths;
      if(user && orig) {
        Object.keys(orig).forEach(function(k) {
          user.set(paths[k], orig[k]);
        });
      }
      this.set('display_prefs_open', false);
      this.set('pending_display_prefs', null);
      this.set('original_display_prefs', null);
      this.set('display_prefs_save_error', false);
    },

    set_display_pref: function(key, value) {
      var pending = this.get('pending_display_prefs');
      var user = this._user_for_display_pref(key);
      var path = this._display_prefs_paths[key];
      // Apply live to communicator prefs (referenced_user) for symbol rendering keys.
      if(user && path) {
        user.set(path, value);
      }
      // Device/layout prefs still target currentUser; mirror to currentUser when distinct
      // so supervisor session state stays consistent for non-symbol settings.
      var currentUser = this.get('app_state.currentUser');
      if(currentUser && user && currentUser !== user && this._display_pref_render_keys.indexOf(key) < 0 && path) {
        currentUser.set(path, value);
      }
      if(pending) {
        // More Settings panel is open: stash in pending so the panel's
        // Save/Cancel flow can commit or revert. Live preview already
        // applied above.
        this.set('pending_display_prefs.' + key, value);
      }
      // Auto-sync the Speak Bar preference when Text Position changes:
      // "text_only" on board buttons implies the Speak Bar should also be
      // text-only; "top"/"bottom" (text + image) implies the Speak Bar
      // should show symbols. The reverse direction is intentionally not
      // wired — users can still toggle the Speak Bar alone without
      // affecting button Text Position.
      if(key === 'button_text_position') {
        var derived_text_only = (value === 'text_only');
        if(user) {
          user.set('preferences.device.utterance_text_only', derived_text_only);
        }
        if(pending) {
          this.set('pending_display_prefs.utterance_text_only', derived_text_only);
        }
      }
      if(!pending && user && user.save) {
        // Toolbar use (no pending session): persist. The live preview already
        // applied above (user.set). DEBOUNCE the save: firing a user.save() on
        // every stepper click let an earlier save's server echo land AFTER a
        // later click and snap the value back ("sometimes reverts"). Coalescing
        // to one save of the FINAL value after the clicks settle removes that
        // race. The dirty-bit poke (preferences.device.updated) that forces the
        // raw `preferences` attr to ship is (re)applied at flush time.
        this._schedule_display_pref_save(user);
      }
      if(this._display_pref_render_keys.indexOf(key) >= 0 && this._last_raw) {
        var rebuild_token = this._last_raw.key || this._last_raw.id;
        if(rebuild_token) {
          boardDetailCache.clear_ordered_buttons(rebuild_token);
        }
        this._build_from_raw(this._last_raw);
      }
    },

    toggle_display_pref: function(key) {
      var pending = this.get('pending_display_prefs');
      if(!pending) { return; }
      var next = !pending[key];
      this.set('pending_display_prefs.' + key, next);
      // Apply live to user preferences for instant preview
      var user = this._user_for_display_pref(key);
      var path = this._display_prefs_paths[key];
      if(user && path) {
        user.set(path, next);
      }
    },


    // Speak Bar appearance toggle. Lives on the main edit toolbar (moved
    // out of More Settings), but can also be reached if More Settings is
    // open with the legacy <select>. Convert string values to bool first.
    //
    // Behavior:
    //   - Always write to the live user model so the speak bar re-renders
    //     immediately (instant preview).
    //   - If More Settings is open, also stash in pending_display_prefs
    //     so the cancel/save flow stays consistent with other prefs.
    //   - Otherwise persist immediately via user.save() — toolbar buttons
    //     don't have a Save step (matches set_folder_style pattern).
    set_utterance_text_only: function(value) {
      var bool = (value === 'true' || value === true);
      var user = this.get('app_state.currentUser');
      if(user && user.set) {
        user.set('preferences.device.utterance_text_only', bool);
      }
      if(this.get('pending_display_prefs')) {
        this.set('pending_display_prefs.utterance_text_only', bool);
      } else if(user && user.save) {
        user.save();
      }
    },

    // Composes and persists a mix / mix_only / mix_prefer skin string.
    // Only called for those three ids — concrete tones use plain set_display_pref.
    set_compound_skin: function(id) {
      // Toggle-off: clicking the active mix_only/mix_prefer swatch again
      // reverts to Original.
      if(id === 'mix_only' && this.get('skin_is_mix_only')) {
        return this.send('set_display_pref', 'skin', 'default');
      }
      if(id === 'mix_prefer' && this.get('skin_is_mix_prefer')) {
        return this.send('set_display_pref', 'skin', 'default');
      }
      this._rebuild_compound_skin(id);
    },

    // Fired by a sub-option checkbox's onchange. Reads the new checked state
    // from the event target (ground truth from the DOM) and explicitly sets
    // it on the option POJO before rebuilding the compound skin string —
    // avoids listener-order races where the rebuild would otherwise read a
    // stale `option.checked` on first click.
    toggle_skin_suboption: function(option, event) {
      var checked = event && event.target ? !!event.target.checked : !option.checked;
      emberSet(option, 'checked', checked);
      if(this.get('skin_is_mix_only'))   { this._rebuild_compound_skin('mix_only'); }
      if(this.get('skin_is_mix_prefer')) { this._rebuild_compound_skin('mix_prefer'); }
    },

    step_display_pref: function(key, direction) {
      // De-dupe a single physical click that arrives as TWO dispatches. On
      // board-detail the AAC pointer layer (raw_events) can re-fire a chrome
      // button's click (its mouseup dispatch doesn't cancel the browser's
      // follow-up click), so this {{on "click"}} runs twice — now visible as the
      // stepper skipping two levels per click (the old value-jump bug masked it).
      // Ignore an identical step (same key + direction) within a short window;
      // the re-fire arrives ~instantly, while intentional repeat clicks are far
      // slower, so they still register.
      var step_id = key + ':' + (direction > 0 ? 1 : -1);
      var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if(this._last_step_pref_id === step_id && (now - (this._last_step_pref_at || 0)) < 100) { return; }
      this._last_step_pref_id = step_id;
      this._last_step_pref_at = now;

      var ladders = {
        button_text:     ['small', 'medium', 'large', 'huge'],
        button_border:   ['none', 'small', 'medium', 'large', 'huge'],
        button_spacing:  ['none', 'minimal', 'extra-small', 'small', 'medium', 'large', 'huge']
      };
      var ladder = ladders[key];
      if(!ladder) { return; }
      // Step from the SAME value the UI displays (current_display_prefs), so a
      // click always advances exactly one level from what the user sees.
      // Reading currentUser directly diverged from the displayed value: unset
      // prefs fall back to 'medium' in current_display_prefs, but the old
      // midpoint fallback below landed on a DIFFERENT ladder index for the
      // 4-item text / 7-item spacing ladders ('large' / 'small'), so a single
      // click "jumped" a level. current_display_prefs already resolves pending
      // (More Settings open) vs the live user pref, with the right fallbacks.
      var displayed = this.get('current_display_prefs') || {};
      var current = displayed[key];
      var idx = ladder.indexOf(current);
      if(idx < 0) { idx = ladder.indexOf('medium'); }
      if(idx < 0) { idx = Math.floor(ladder.length / 2); }
      var dir = direction > 0 ? 1 : -1;
      var next_idx = dir > 0 ? Math.min(idx + 1, ladder.length - 1) : Math.max(idx - 1, 0);
      if(next_idx === idx) { return; }
      this.send('set_display_pref', key, ladder[next_idx]);
    },

    save_display_preferences: function() {
      var user = this._pref_user_for_display() || this.get('app_state.currentUser');
      var pending = this.get('pending_display_prefs');
      var orig = this.get('original_display_prefs');
      if(!user || !pending || !orig) { return; }

      // Values are already applied live — we just need to diff to know if anything changed and persist.
      var changed = Object.keys(orig).some(function(k) { return pending[k] !== orig[k]; });

      if(!changed) {
        this.send('close_display_preferences');
        return;
      }

      user.set('preferences.device.updated', true);
      var _this = this;
      this.set('display_prefs_saving', true);
      user.save().then(function(saved) {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        _this.set('display_prefs_saving', false);
        if(saved && saved.get('id') === _this.get('app_state.currentUser.id')) {
          _this.set('app_state.currentUser', saved);
        }
        // Close without reverting — the user accepted the changes
        _this.set('display_prefs_open', false);
        _this.set('pending_display_prefs', null);
        _this.set('original_display_prefs', null);
      }, function() {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        _this.set('display_prefs_saving', false);
        _this.set('display_prefs_save_error', true);
      });
    },

    toggle_favorite: function() {
      this._close_options_menu();
      var board = this.get('model');
      if(board.get('starred')) {
        board.unstar();
      } else {
        board.star();
      }
    },

    // Word prediction on/off — the SAME global user preference exposed on the
    // Preferences page, mirrored in the edit-mode BOARD SETTINGS → Word
    // Prediction section. Reads/writes referenced_user (the board's user,
    // matching the speak-mode display gate). Dirty-bits preferences.device.updated
    // so the raw preferences blob ships (Ember Data won't mark a nested set dirty
    // on its own — same trick as go_to_classic / set_display_pref).
    toggle_word_suggestions: function() {
      var prefUser = this.get('app_state.referenced_user') || this.get('app_state.currentUser');
      if(!prefUser) { return; }
      var currentlyOn = prefUser.get('preferences.word_suggestions') === true;
      prefUser.set('preferences.word_suggestions', !currentlyOn);
      if(prefUser.save) {
        prefUser.set('preferences.device.updated', true);
        prefUser.save();
      }
    },
    toggle_word_prediction_position_dropdown: function() {
      this.toggleProperty('word_prediction_position_dropdown_open');
    },
    close_word_prediction_position_dropdown: function() {
      this.set('word_prediction_position_dropdown_open', false);
    },
    // Set word-prediction placement (auto / speak_bar / side_rail) + persist it,
    // same way as toggle_word_suggestions.
    pick_word_suggestion_position: function(id) {
      this.set('word_prediction_position_dropdown_open', false);
      var prefUser = this.get('app_state.referenced_user') || this.get('app_state.currentUser');
      if(!prefUser) { return; }
      prefUser.set('preferences.word_suggestion_position', id);
      if(prefUser.save) {
        prefUser.set('preferences.device.updated', true);
        prefUser.save();
      }
    },

    make_a_copy: function() {
      this.set('share_dropdown_open', false);
      var _this = this;
      var board = _this.get('model');
      if(!persistence.get('online')) {
        modal.error(i18n.t('need_online_for_copying', "You must be connected to the Internet to make copies of boards."));
        return;
      }
      // copy-board closes with { action, user, shares, ... } — not { board }.
      // Chain into application.copy_board (same as classic board UI) so copying-board
      // runs and create_copy POST succeeds; otherwise we stay on the source board and
      // save hits PUT /boards/:id without edit permission ("Not authorized").
      var appController = _this.get('app_state.controller');
      if(!appController || typeof appController.copy_board !== 'function') {
        appController = getOwner(_this).lookup('controller:application');
      }
      if(!appController || typeof appController.copy_board !== 'function') {
        modal.error(i18n.t('app_not_ready', "App is not ready. Please try again."));
        return;
      }
      modal.open('copy-board', {board: board}).then(function(opts) {
        if(opts === false) { return RSVP.resolve(); }
        return appController.copy_board(opts, false);
      }).then(function(res) {
        if(res && res.id && res.key && !_this.isDestroyed && !_this.isDestroying) {
          _this.get('app_state').jump_to_board({ id: res.id, key: res.key });
        }
      }, function() { });
    },

    set_as_home: function() {
      this._close_options_menu();
      var board = this.get('model');
      modal.open('set-as-home', {board: board});
    },

    add_to_sidebar: function() {
      this._close_options_menu();
      var _this = this;
      var board = _this.get('model');
      modal.open('add-to-sidebar', {board: {
        name: board.get('name'),
        key: board.get('key'),
        levels: board.get('levels'),
        home_lock: false,
        image: board.get('image_url')
      }});
    },

    download_board: function() {
      this.set('share_dropdown_open', false);
      var _this = this;
      this.get('app_state').assert_source().then(function() {
        var board = _this.get('model');
        if(!board) { return; }
        var linked = board.get('linked_boards');
        var has_links = !!(linked && linked.length > 0);
        var board_id = board.get('key') || board.get('id');
        modal.open('download-board', { type: 'obf', has_links: has_links, id: board_id });
      }, function() {});
    },

    print_board: function() {
      this.set('share_dropdown_open', false);
      var _this = this;
      this.get('app_state').assert_source().then(function() {
        var board = _this.get('model');
        if(!board) { return; }
        var linked = board.get('linked_boards');
        var has_links = !!(linked && linked.length > 0);
        var board_id = board.get('key') || board.get('id');
        modal.open('download-board', { type: 'pdf', has_links: has_links, id: board_id });
      }, function() {});
    },

    share_board: function() {
      var _this = this;
      _this.set('share_dropdown_open', false);
      this.get('app_state').assert_source().then(function() {
        modal.open('share-board', { board: _this.get('model') });
      }, function() {});
    },

    /* G3: `toggle_share_dropdown` deleted 2026-08-24 — the share dropdown it
       opened was removed in the redesign and nothing referenced this. Its
       `share_dropdown_open` flag is left for the same reason as
       `details_dropdown_open` above. */

    other_board_actions: function() {
      this._close_options_menu();
      modal.open('modals/board-actions', { board: this.get('model') });
    },

    /* "My Boards" entry in the speak-mode options menu. Previously
       opened an in-page modal picker on the application controller;
       the modal was deleted 2026-05-23 when the My Boards UX moved
       to a route transition. Now delegates to `openMyBoards` on the
       application controller, which stashes the current board (so
       the boards page can render a "Back to <board>" chip) and
       transitions to /u/:user_name/boards. Close the options menu
       first so it isn't lingering open during the transition. */
    open_board_picker: function() {
      this.set('show_options_menu', false);
      var appController = getOwner(this).lookup('controller:application');
      if(appController) {
        appController.send('openMyBoards');
      }
    },

    /* My Board Collection — the inline replacement for the prior
       My Boards + Find Boards rows. Sets `board_collection_open` so
       the options-menu template swaps its section list for the
       <BoardCollection /> component. */
    open_board_collection: function() {
      // Close the options dropdown — the collection now PINS as a standalone
      // right-side drawer (decoupled from show_options_menu) so it can persist
      // while the user taps board-to-board and the selected board renders in the
      // grid on the left.
      this.set('show_options_menu', false);
      this.set('board_collection_open', true);
    },

    /* Back action wired to the collection's header back button (and
       to a one-step Escape press inside the collection). Returns to
       the normal options menu without closing the dropdown itself. */
    close_board_collection: function() {
      this.set('board_collection_open', false);
    },

    /* Edit-mode Board Collections drawer. Opens the inline BoardCollection panel
       pinned to the LEFT edge; the shell class md-shell--board-collection-left hides
       the edit rail (the drawer takes its place) and pushes the center board area
       right. Selecting a board previews it in edit mode via onSelectBoardFromCollectionEdit
       (which returns the Transition so the overlay clears the moment the board settles). */
    open_edit_board_collection: function() {
      // Capture the board we're currently editing as the "original" — fixed while the
      // drawer is pinned, even as the user previews other boards.
      this.set('edit_collection_original_board', this.get('model'));
      this.set('edit_board_collection_open', true);
    },
    /* "Back to Edit Mode" — the drawer's back button. Reached via raw_events chrome
       clicks (data-bd-action, resolved by BoardCollection.back_action_name), which is
       the ONLY path that fires for clicks inside .md-board-collection. Delegates to
       onCloseEditBoardCollection so the commit-to-editing logic (owned → edit directly;
       not owned → copy-to-edit prompt) lives in exactly one place. This used to only
       clear the two flags and had no callers at all, so Back never committed. */
    close_edit_board_collection: function() {
      return this.onCloseEditBoardCollection();
    },

    /* Edit-drawer board preview. Same delegation shape as select_board_from_collection
       below: the transition lives in onSelectBoardFromCollectionEdit and is RETURNED so
       BoardCollection can clear its "Opening your board" overlay when the board settles. */
    select_board_from_collection_edit: function(boardOrKey) {
      return this.onSelectBoardFromCollectionEdit(boardOrKey);
    },

    /* Edit Sidebar — opens the inline sidebar-editor drawer (same pinned host as
       My Board Collection). Triggered by the "Edit Sidebar" button at the top of
       the inline sidebar. */
    open_sidebar_editor: function() {
      var _this = this;
      var expand = function() {
        _this.set('show_options_menu', false);
        _this.set('board_collection_open', false);
        _this.set('sidebar_editor_open', true);
      };
      // Optional PIN gate: when the user has enabled require_sidebar_edit_pin AND
      // has a PIN configured, require the PIN before expanding the sidebar editor
      // panel. Reuses the speak-mode-pin entry modal in validate-only 'none' mode
      // (validates + resolves {correct_pin:true}, no side effect) — same shared
      // speak_mode_pin value as the speak-mode exit/enter gates.
      var user = this.get('app_state.currentUser');
      var pin = user && user.get('preferences.speak_mode_pin');
      if(user && user.get('preferences.require_sidebar_edit_pin') && pin) {
        modal.open('speak-mode-pin', {
          action: 'none',
          hide_hint: user.get('preferences.hide_pin_hint')
        }).then(function(res) {
          if(res && res.correct_pin) { expand(); }
        }, function() { });
      } else {
        expand();
      }
    },
    close_sidebar_editor: function() {
      this.set('sidebar_editor_open', false);
    },

    /* Row click inside the collection: close the menu + collection
       first (so the dropdown isn't lingering open across the route
       transition) and then route to the chosen board in MODERN view.
       The codebase has two board routes:
         - `'board'` (splat /*key)         — the CLASSIC view
         - `'user.board-detail'` (2 parts) — the MODERN view
       Modern is what every other in-app navigation uses (see
       board-detail.js:4524, 4535, 4549, 5272 — all use the
       `(user_name, boardname)` form). Board keys are shaped
       `<user_name>/<board_slug>`; split on the FIRST `/` and pass
       both pieces. Anything after the first `/` rejoins so multi-
       segment slugs survive (e.g. `quick-core-112/categories/food`). */
    select_board_from_collection: function(boardOrKey) {
      // Single source of truth for the transition lives in onSelectBoardFromCollection
      // (assigned in init), which returns the Transition so BoardCollection can clear its
      // "Opening your board" overlay when the board settles. This action is reached via
      // raw_events chrome clicks (data-bd-action="select_board_from_collection"); it
      // delegates and returns the Transition so any thenable consumer still works.
      return this.onSelectBoardFromCollection(boardOrKey);
    },

    // ── Button Interaction ──

    // Keyboard activation for symbol grid cards. The cards are
    // <div role="gridcell" tabindex="0"> rather than <button> because
    // they contain nested edit-action buttons in edit mode (HTML
    // disallows buttons inside buttons). Wire Enter/Space to the same
    // select_button action so keyboard users can communicate via the
    // tiles. Added 2026-04-11 per WCAG audit (2.1.1 Keyboard).
    select_button_key: function(button, event) {
      if(!event) { return; }
      var key = event.key || event.keyCode;
      if(key === 'Enter' || key === ' ' || key === 'Spacebar' || key === 13 || key === 32) {
        event.preventDefault();
        this.send('select_button', button);
      }
    },

    select_button: function(button) {
      if(this.get('color_picker_button') === button) { return; }

      var btn_id = this._btn_id(button);
      if(this.get('edit_mode')) {
        if(editManager.finding_target()) {
          editManager.apply_to_target(btn_id);
          return;
        }
        if(this.get('paint_mode')) {
          this.send('paint_button', button);
          return;
        }
        // If the click landed on the label input, let it focus for inline editing
        var activeEl = document.activeElement;
        if(activeEl && (activeEl.classList.contains('md-board-detail-symbol-card__label-input') || activeEl.classList.contains('md-folder-tab__label-input'))) {
          return;
        }
        this._open_button_settings(btn_id, 'general');
        return;
      }

      // Speak mode
      var _this = this;
      // button may be a plain object or a Button object
      var _get = function(obj, key) {
        return (obj && obj.get && typeof obj.get === 'function') ? obj.get(key) : (obj && obj[key]);
      };

      // Blank buttons: do nothing, keep focus where it is
      var isEmpty = _get(button, 'empty') || !(_get(button, 'label') || _get(button, 'image_id') || _get(button, 'vocalization'));
      if(isEmpty) { return; }

      // Swap mode: a held chip is REPLACED by any tapped board button — handled
      // synchronously BEFORE folder navigation. On a SUCCESSFUL replace the held
      // state clears + announces; on failure (button not resolvable / specialty /
      // a condense-guarded utterance) the held state is KEPT so the user can pick a
      // different target. Either way the tap is swallowed (never navigates/speaks
      // mid-swap).
      if(this.get('sentence_bar_editing_enabled') && this.get('swap_source_index') != null) {
        var swap_em = editManager.find_button(this._btn_id(button));
        var swap_src = this.get('swap_source_index');
        var swap_label = _get(button, 'label') || _get(button, 'vocalization') || '';
        if(swap_em && swap_em.get && utterance.replace_button(swap_src, swap_em)) {
          this._deselect_chip();
          this._announce_sentence_edit(i18n.t('sentence_bar_replaced', "Replaced word with %{word}", {word: swap_label}));
        } else {
          // Replace couldn't happen (button not resolvable / specialty / a
          // condense-guarded utterance) — tell the user so the KEPT held state
          // isn't a silent no-op; they can pick another word or cancel with ⇄/Esc.
          this._announce_sentence_edit(i18n.t('sentence_bar_replace_unavailable', "That word can't replace the held one — pick another, or cancel."));
        }
        return;
      }

      // The button object handed to us can be a STALE display copy: board-detail
      // rebuilds its display buttons from board.contextualized_buttons, and an
      // in-place edit (Button Settings) updates board.buttons + the model but the
      // rebuilt display copy can still carry the pre-edit action fields. Resolve the
      // action fields from the authoritative board.buttons entry by id so a
      // just-changed action takes effect on the very next tap (e.g. a folder switched
      // to a URL link opens the URL, not the old board).
      var _action_src = this._resolve_action_src(button, btn_id);

      // Folder navigation — intercept for board-detail routing
      var load_board = _get(_action_src, 'load_board');
      if(load_board && !_get(_action_src, 'link_disabled')) {
        // Board lock: folder navigation is a board-to-board exit.
        if(_this.board_lock_blocks_exit()) { return; }
        // "Also speak & add to the vocalization box" (add_to_vocalization/add_vocalization)
        // and "Set as temporary home when loaded" (home_lock) are handled by the canonical
        // app_state.activate_button — it adds the word to the sentence box (utterance.add_button)
        // and applies the temporary-home lock via jump_to_board, then navigates through
        // transitionToBoardForCurrentUiStyle, which lands back on board-detail. board-detail's
        // fast custom routing below does neither, so when either option is set on this folder
        // button we delegate the whole activation to the app controller (the same path board-alt
        // uses). Plain folder buttons keep the optimized cached routing below.
        // `add_vocalization` is tri-state: null means "unset, fall back to
        // add_to_vocalization"; false means "explicitly don't add". Both flags are
        // already level-resolved and coerced to real booleans by _resolve_action_src.
        var _add_voc = _get(_action_src, 'add_vocalization');
        _add_voc = (_add_voc == null) ? _get(_action_src, 'add_to_vocalization') : _add_voc;
        if(_add_voc || _get(_action_src, 'home_lock')) {
          var _em_for_action = _this._em_button_with_current_actions(btn_id, _action_src);
          var _appCtrl = _this.get('app_state.controller');
          if(_em_for_action && _appCtrl && _appCtrl.activateButton) {
            /* Record the trail BEFORE delegating. This path still navigates board-to-board —
               activateButton adds the word, applies any temporary-home lock, and transitions
               back onto board-detail — but it used to skip the history push that every other
               folder path does, so `show_board_back_nav` stayed false and the Back button did
               not render on the board it had just opened. The push is the same one the fast
               paths below make; nothing else writes board_detail_nav_history, so there is no
               double entry. */
            _this._push_nav_history();
            _appCtrl.activateButton(_em_for_action, { board: _this.get('model'), trigger_source: 'click' });
            return;
          }
        }
        var board_key = load_board.key;
        if(board_key && board_key.indexOf('/') !== -1) {
          actionLock.run('board-link:' + (_this.get('model.key') || _this.get('model.id') || 'board-detail') + ':' + board_key, function() {
            _this._push_nav_history();
            return _this._preferred_board_detail_key(board_key).then(function(preferred_key) {
              var key_parts = preferred_key.split('/');
              return _this.get('router').transitionTo('user.board-detail', key_parts[0], key_parts.slice(1).join('/'));
            });
          }, {timeout: 5000});
          return;
        }
        var lookup = board_key || load_board.id;
        if(lookup) {
          // Cache hit: skip the id→key lookup AJAX and route directly.
          // The model hook will then also hit the cache for an instant
          // navigation with zero network. Wrapped in actionLock so rapid
          // taps don't queue duplicate transitions.
          var cached_raw = boardDetailCache.get(lookup);
          if(cached_raw && cached_raw.key && cached_raw.key.indexOf('/') !== -1) {
            actionLock.run('board-link:' + (_this.get('model.key') || _this.get('model.id') || 'board-detail') + ':' + cached_raw.key, function() {
              _this._push_nav_history();
              return _this._preferred_board_detail_key(cached_raw.key).then(function(preferred_key) {
                var cached_parts = preferred_key.split('/');
                return _this.get('router').transitionTo('user.board-detail', cached_parts[0], cached_parts.slice(1).join('/'));
              });
            }, {timeout: 5000});
            return;
          }
          // Cache miss: id→key lookup via AJAX, also wrapped in
          // actionLock. Populate the cache with the response so future
          // navigations to this same board hit the fast path.
          actionLock.run('board-link:' + (_this.get('model.key') || _this.get('model.id') || 'board-detail') + ':' + lookup, function() {
            _this._push_nav_history();
            return persistence.ajax('/api/v1/boards/' + lookup, { type: 'GET' }).then(function(data) {
              var merged = boardDetailCache.normalize_board_payload(data);
              if(merged && merged.key) {
                boardDetailCache.set(JSON.parse(JSON.stringify(merged)), { force: true });
                return _this._preferred_board_detail_key(merged.key).then(function(preferred_key) {
                  var parts = preferred_key.split('/');
                  return _this.get('router').transitionTo('user.board-detail', parts[0], parts.slice(1).join('/'));
                });
              }
            });
          }, {timeout: 5000});
          return;
        }
      }

      // Everything else — including URL / video / book links — routes through the
      // application controller, which funnels into `app_state.activate_button` →
      // `utterance.add_button`. That single global path handles speaking,
      // sentence-bar entry, usage LOGGING (stashes.log + sync.send_update), the
      // board-lock and `external_links: 'prevent'` guards, actionLock de-dup, the
      // `link_disabled` suppression, and `launch_url` (which opens an in-app video
      // pane for a video.popup link, a Tarheel book pane, or a browser tab honoring
      // the confirm-external-links pref).
      //
      // board-detail deliberately does NOT hand-roll a launcher here. It used to,
      // because board-detail's speak-mode display copies (_make_btn) dropped `url` /
      // `video` / `apps` so activate_button's url branch never fired — but _make_btn
      // now carries those fields, so the canonical path works and a bespoke branch
      // would only re-introduce the guard/logging bypass.
      //
      // Our `_sync_sentence_from_global` observer mirrors the resulting
      // `app_state.button_list` change into our local `sentence_parts`, so the
      // visible sentence bar updates without us doing a redundant (and
      // divergence-prone) local push here.
      var appController = _this.get('app_state.controller');
      var board = _this.get('model');
      var em_button = _this._em_button_with_current_actions(btn_id, _action_src);
      var has_em = em_button && em_button.get && typeof em_button.get === 'function';
      // (Swap-mode replace is handled earlier, before folder navigation.)
      if(has_em && appController && appController.activateButton && board) {
        appController.activateButton(em_button, { board: board, trigger_source: 'click' });
      } else {
        // Fallback for the rare case the editManager has not picked up
        // this button yet (e.g. mid-render). Speak the label so the
        // user gets immediate feedback; the sentence bar will catch up
        // on the next click.
        var label = _get(button, 'label');
        var vocalization = _get(button, 'vocalization');
        speecher.stop('text');
        utterance.speak_button({
          label: label,
          vocalization: vocalization || label
        });
      }
    },

    // Action dispatched by raw_events.js / button-listener for button clicks
    buttonSelect: function(id, event) {
      if(!id) { return; }
      var button = editManager.find_button(id);
      if(button) {
        this.send('select_button', button);
      }
    },

    // Action dispatched by raw_events.js for button paint
    buttonPaint: function(id) {
      if(!id) { return; }
      if(editManager.controller === this) {
        editManager.paint_button(id);
      }
    },

    // Action dispatched by raw_events.js for symbol click in edit mode
    symbolSelect: function(id) {
      if(!this.get('edit_mode') || !id) { return; }
      this._open_button_settings(id, 'picture');
    },

    // Action dispatched by raw_events.js for action icon click
    actionSelect: function(id) {
      if(!this.get('edit_mode') || !id) { return; }
      this._open_button_settings(id, 'action');
    },

    // ── Color Picker (board-detail specific) ──

    open_color_picker: function(button, event) {
      if(event) { event.stopPropagation(); }
      if(this.get('color_picker_button') === button) {
        this.set('color_picker_button', null);
        return;
      }
      this.set('color_picker_button', button);
      this.set('custom_color_value', null);
    },

    close_color_picker: function() {
      this.set('color_picker_button', null);
      this.set('custom_color_value', null);
    },

    toggle_minicolors: function() {
      var _this = this;
      var $input = $('#board-detail-custom-color');
      if(!$input.length) { return; }

      if(!$input.hasClass('minicolors-input')) {
        $input.minicolors({
          theme: 'default',
          position: 'bottom left',
          change: function(hex) {
            _this.set('custom_color_value', hex);
          }
        });
      }
      if($input.next().next('.minicolors-panel:visible').length > 0) {
        $input.minicolors('hide');
      } else {
        $input.minicolors('show');
      }
    },

    apply_swatch_color: function(swatch) {
      var btn = this.get('color_picker_button');
      if(!btn) { return; }
      var btn_id = this._btn_id(btn);
      editManager.change_button(btn_id, {
        background_color: swatch.bg,
        border_color: swatch.border,
        part_of_speech: swatch.pos_class
      });
      this.set('color_picker_button', null);
    },

    apply_custom_color: function() {
      var btn = this.get('color_picker_button');
      var hex = this.get('custom_color_value');
      if(!btn || !hex) { return; }
      var fill = window.tinycolor(hex);
      if(!fill._ok) { return; }
      var border = fill.clone().darken(25);
      var btn_id = this._btn_id(btn);
      editManager.change_button(btn_id, {
        background_color: fill.toHexString(),
        border_color: border.toHexString()
      });
      this.set('color_picker_button', null);
    },

    // ── Quick Phrases & Sentence ──

    select_quick: function(quick) {
      var parts = (this.get('sentence_parts') || []).slice();
      parts.push({ id: quick.id, label: quick.label });
      this.set('sentence_parts', parts);
      speecher.speak_text(quick.label);
    },

    clear_sentence: function() {
      // Clear both the local UI state AND the global utterance state.
      // Skipping the global clear would leave button_list dirty, so a
      // subsequent activation that grows it would re-sync the stale
      // entries back into sentence_parts via the observer.
      this._deselect_chip();
      this.set('sentence_parts', []);
      this._sentence_image_lookups = {};
      this._suggestion_image_lookups = {};
      this._resolved_label_images = {};
      try { utterance.clear(); } catch(e) { }
    },

    backspace_sentence: function() {
      // Pop both local and global so the observer's next sync sees a
      // consistent state and does not restore the dropped entry.
      this._deselect_chip();
      var parts = (this.get('sentence_parts') || []).slice();
      if(parts.length > 0) {
        parts.pop();
        this.set('sentence_parts', parts);
      }
      try { utterance.backspace(); } catch(e) { }
    },

    // ----- Speak-bar chip active-edit actions (feature: sentence_bar_editing) -----
    // Open a chip's labeled menu. Fired by the component only after a deliberate
    // 2s PRESS-AND-HOLD (a short tap never gets here — the hold guard is in the
    // component), or by keyboard Enter/Space (deliberate). Re-triggering on the
    // open chip closes it (toggle). (In swap mode a tap is a swap target instead —
    // handled by chip_swap_target, which the component calls.)
    select_chip: function(index) {
      if(this.get('selected_chip_index') === index && this.get('chip_menu_open')) {
        this._deselect_chip();
        return;
      }
      this.set('swap_source_index', null);
      this.set('selected_chip_index', index);
      this._position_chip_menu();          // provisional (chip is rendered; menu isn't yet)
      this.set('chip_menu_open', true);
      runLater(this, this._position_chip_menu, 0); // exact, once the menu has laid out
    },
    // Tap ✕ — remove the chip (and its raw block) from the utterance.
    remove_chip: function(index) {
      var label = this._chip_label(index);
      var ok = utterance.remove_button(index);
      this._deselect_chip();
      if(ok) { this._announce_sentence_edit(i18n.t('sentence_bar_removed', "Removed %{word}", {word: label})); }
    },
    // Tap ‹ / › — move the chip one position; selection follows it.
    move_chip: function(index, direction) {
      var total = (this.get('sentence_parts') || []).length;
      var target = index + direction;
      if(target < 0 || target >= total) { return; }
      var label = this._chip_label(index);
      var ok = utterance.move_button(index, direction);
      if(ok) {
        this.set('selected_chip_index', target);
        // The chip moved — re-anchor the open menu under its new position once the
        // reordered chips have re-rendered.
        if(this.get('chip_menu_open')) { runLater(this, this._position_chip_menu, 0); }
        this._announce_sentence_edit(i18n.t('sentence_bar_moved', "Moved %{word} to %{pos} of %{total}", {word: label, pos: target + 1, total: total}));
      }
    },
    // Tap ⇄ — toggle swap/hold mode for this chip.
    toggle_chip_swap: function(index) {
      if(this.get('swap_source_index') === index) {
        this.set('swap_source_index', null);
        this._announce_sentence_edit(i18n.t('sentence_bar_swap_cancelled', "Cancelled swap"));
      } else {
        this.set('selected_chip_index', index);
        this.set('swap_source_index', index);
        this._announce_sentence_edit(i18n.t('sentence_bar_swap_holding', "Holding %{word}. Tap another word to swap, or a board button to replace it.", {word: this._chip_label(index)}));
      }
    },
    // In swap mode, tapping another chip swaps the two positions.
    chip_swap_target: function(index) {
      var src = this.get('swap_source_index');
      if(src == null || src === index) { this.set('swap_source_index', null); return; }
      var a = this._chip_label(src), b = this._chip_label(index);
      var ok = utterance.swap_buttons(src, index);
      this._deselect_chip();
      if(ok) { this._announce_sentence_edit(i18n.t('sentence_bar_swapped', "Swapped %{a} and %{b}", {a: a, b: b})); }
    },
    // Drop a dragged chip onto another position (pointer reorder).
    chip_drag_move: function(from, to) {
      var total = (this.get('sentence_parts') || []).length;
      var label = this._chip_label(from);
      var ok = utterance.move_to_index(from, to);
      this._deselect_chip();
      if(ok) { this._announce_sentence_edit(i18n.t('sentence_bar_moved', "Moved %{word} to %{pos} of %{total}", {word: label, pos: to + 1, total: total})); }
    },
    // Escape / outside — leave edit/swap mode.
    cancel_chip_edit: function() {
      this._deselect_chip();
    },

    open_speak_menu: function() {
      // Close the immersive quick-actions popover if it routed us here
      // ("More"); no-op in the normal layout where it's already closed.
      this.set('quick_actions_open', false);
      modal.open('speak-menu', { inactivity_timeout: true, scannable: true });
    },

    complete_word: function(word) {
      if(!word) { return; }
      var _this = this;
      var text = word.word;
      var button = editManager.fake_button();
      button.set('label', text);
      button.set('vocalization', ':complete');
      var list = this.get('app_state.button_list') || [];
      if(!emberGet(list[0] || {}, 'in_progress')) {
        button.set('vocalization', ':predict');
      }
      button.set('completion', text);
      button.set('empty', false);

      try {
        if(typeof wordSuggestionsModule.record_selection === 'function') {
          var button_list = this.get('app_state.button_list') || [];
          var last_button = button_list[button_list.length - 1];
          if(last_button && last_button.in_progress) {
            last_button = button_list[button_list.length - 2];
          }
          var prefix = ((last_button && (last_button.vocalization || last_button.label)) || '').toLowerCase();
          if(!prefix) {
            var parts = this.get('sentence_parts') || [];
            var last_part = parts[parts.length - 1];
            if(last_part && last_part.in_progress) {
              last_part = parts[parts.length - 2];
            }
            prefix = ((last_part && last_part.label) || '').toLowerCase();
          }
          wordSuggestionsModule.record_selection(text, null, prefix, this._word_prediction_locale());
        }
      } catch(e) { }

      var activate = function(image_url) {
        if(image_url) {
          button.set('image', LingoLinq.store.createRecord('image'));
          button.set('image.url', image_url);
        }
        var board = _this.get('model');
        var app = _this.get('app_state.controller');
        if(app && app.activateButton && board) {
          app.activateButton(button, { board: board, trigger_source: 'completion' });
        }
      };

      var image_url = wordSuggestionsModule.resolve_word_image(word) ||
        _this._find_local_image_for_label(text) ||
        word.original_image;
      if(image_url) {
        activate(image_url);
        return;
      }
      wordSuggestionsModule.attach_image_for_label(
        text,
        _this._suggestion_lookup_board_ids(),
        function() { },
        { appState: _this.get('app_state'), stashes: _this.get('stashes') }
      ).then(function(image_url) {
        var resolved = image_url || wordSuggestionsModule.resolve_word_image(word);
        // A real image was found, or the user is in text-only mode (chips
        // render no image either way) — activate as-is.
        if(resolved || !_this.get('utterance_show_symbols')) {
          activate(resolved);
          return;
        }
        // No real image found and the user shows symbols: add the same
        // placeholder the prediction tile used (the missing-image icon) so
        // the chip carries an icon instead of rendering blank.
        wordSuggestionsModule.fallback_url().then(function(fb) {
          activate(fb);
        }, function() { activate(null); });
      });
    },

    speak_sentence: function() {
      // Classic Speak Mode uses utterance.vocalize_list, which plays each
      // button's attached sound when present and otherwise TTS of
      // vocalization || label. Board-detail used to call speak_text only,
      // so joke-board rimshots (etc.) played on tap but Speak-bar / mic
      // replay spoke the label. Prefer vocalize_list when button_list has
      // speakable entries; fall back to TTS for phrase-builder-only chips.
      this._speak_current_sentence();
    },

    // ── Portrait orientation overlay action ──
    // "Continue Anyway" — the overlay's only action: an accessibility-critical
    // escape hatch for mounted/one-handed/non-rotatable setups. Dismisses the prompt and
    // latches the SHARED session flag so it won't re-appear on later board changes, or
    // on any other page, this session. The board then renders at its natural scale; CSS
    // grid preserves rows/columns/spacing and never reflows.
    dismiss_portrait_overlay: function() {
      this.set('portrait_overlay_dismissed', true);
      // App-wide for the session, not just this controller — see service:overlay-dismissals.
      this.get('overlay_dismissals').dismiss('larger_screen');
    },

    // Down-arrow chevron in the immersive sentence bar toggles the
    // consolidated mic/backspace/clear quick-actions popover.
    toggle_quick_actions: function() {
      this.set('quick_actions_open', !this.get('quick_actions_open'));
    },

    close_quick_actions: function() {
      this.set('quick_actions_open', false);
    },

    // ── Navigation ──

    set_category: function(category_id) {
      this.set('active_category', category_id);
      this.set('show_categories', false);
      this._apply_category_filter(category_id);
    },

    /* Edit-panel "Filter by Category" expander. Same rail-mode gotcha
       as `toggle_board_actions` above: the expander's body
       (`.md-board-edit-panel__filter-list`) is hidden by
       `display: none !important` when the panel is in rail mode (~app.scss
       line 85200), so simply flipping `panel_filter_open` does nothing
       visible. Expand the panel first when collapsed, then open the
       filter list. Matches the right-panel pattern. */
    toggle_panel_filter: function() {
      if(this.get('left_panel_collapsed')) {
        this.set('left_panel_collapsed', false);
        this.set('panel_filter_open', true);
        return;
      }
      this.toggleProperty('panel_filter_open');
    },

    /* Edit-panel: pick a category from the expanded list. Mirrors
       set_category but keeps the panel expander open so the user
       can switch filters without re-clicking the header — and
       leaves the toolbar's show_categories alone. */
    set_panel_category: function(category_id) {
      this.set('active_category', category_id);
      this._apply_category_filter(category_id);
    },

    /* Right panel: collapse/expand the entire Live Preview Edit
       container (independent of any open accordion section). */
    toggle_right_panel: function() {
      /* Manual user toggle resets the "opened from rail"
         provenance — Back should behave normally on the next
         section open since the user has explicitly taken control
         of the panel state. */
      this.set('_section_opened_from_rail', false);
      this.toggleProperty('right_panel_collapsed');
    },

    // Back button on the section header. Two flows:
    //   1. User was in expanded panel → opened a section → clicked
    //      Back. Original behavior: clear the section, panel stays
    //      expanded showing the full section list.
    //   2. User was in COLLAPSED rail → clicked a section icon
    //      (panel expanded INTO that section) → clicked Back.
    //      New behavior: collapse the panel back to the icon rail
    //      where they came from — they didn't navigate through
    //      the expanded section list, so returning to it would
    //      not match their mental "back" destination.
    // The `_section_opened_from_rail` flag tracks which flow the
    // current section open belongs to.
    expand_right_panel: function() {
      if(this.get('_section_opened_from_rail')) {
        this.set('right_panel_open_section', null);
        this.set('right_panel_collapsed', true);
        this.set('_section_opened_from_rail', false);
        return;
      }
      this.set('right_panel_collapsed', false);
      this.set('right_panel_open_section', null);
    },

    toggle_left_panel: function() {
      this.toggleProperty('left_panel_collapsed');
    },

    // Clicking anywhere on the collapsed rail re-expands it. Only ever
    // expands (never collapses) so it's a safe no-op when the panel is
    // already open and inner clicks bubble up here.
    expand_left_panel: function() {
      if(this.get('left_panel_collapsed')) {
        this.set('left_panel_collapsed', false);
      }
    },

    // Collapsed left-panel SEARCH magnifier: expand the panel and drop the cursor into the
    // search field. When collapsed the input is hidden, so we expand first, then focus after a
    // beat (runLater) once the input has un-hidden. Focusing when already expanded is a no-op on
    // an already-focused input, so it's safe to run in both states.
    open_board_search_panel: function() {
      var was_collapsed = this.get('left_panel_collapsed');
      if(was_collapsed) { this.set('left_panel_collapsed', false); }
      runLater(function() {
        var input = document.getElementById('board-edit-panel-search');
        if(input && typeof input.focus === 'function') { input.focus(); }
      }, was_collapsed ? 80 : 0);
    },

    /* Right panel: open one accordion section at a time (clicking
       the same section closes it). Keeps the panel uncluttered.
       If the panel is collapsed (icon-rail mode), clicking a
       section icon re-expands the panel AND opens that section
       — VS Code / Notion-style "click rail icon to jump back in".
       The `_section_opened_from_rail` flag is set in that flow so
       the Back button knows to collapse the panel back to the rail
       (rather than show the full expanded section list the user
       never navigated through). Opening a section from the
       already-expanded panel clears the flag. */
    toggle_right_panel_section: function(section_id) {
      if(this.get('right_panel_collapsed')) {
        this.set('right_panel_collapsed', false);
        this.set('right_panel_open_section', section_id);
        this.set('_section_opened_from_rail', true);
        return;
      }
      var current = this.get('right_panel_open_section');
      this.set('right_panel_open_section', current === section_id ? null : section_id);
      this.set('_section_opened_from_rail', false);
    },

    nav_select: function(item_id) {
      var user = this.get('user');
      if(!user) { return; }
      var un = user.get('user_name');
      if(item_id === 'symbol-board') {
        // Symbol Board: switch the center view back to the symbol grid.
        this.set('active_view', 'symbol-board');
        return;
      }
      if(item_id === 'phrase-builder') {
        // Phrase Builder: replace the symbol grid with a search-driven
        // button finder that adds taps to the sentence bar. Searches the
        // ENTIRE button set across all linked sub-boards via ButtonSet.find_buttons.
        this.set('active_view', 'phrase-builder');
        this._phrase_init();
        // Focus the search input on the next tick
        runLater(function() {
          var input = document.querySelector('.md-board-detail-phrase-builder__input');
          if(input) { input.focus(); }
        }, 50);
        return;
      }
      if(item_id === 'preferences') {
        this.get('router').transitionTo('user.preferences', un);
      } else if(item_id === 'voice-output') {
        // Open the in-place Voice & Output modal so the user can adjust
        // voice picker / rate / pitch / volume / output target without
        // leaving the board-detail page. Falls back to the full
        // preferences page via the modal's "More options" link.
        modal.open('voice-output', { user: user });
      } else if(item_id === 'sessions') {
        this.get('router').transitionTo('user.logs', un);
      } else if(item_id === 'profiles') {
        this.get('router').transitionTo('user.account', un);
      } else if(item_id === 'progress-reports') {
        this.get('router').transitionTo('user.stats', un);
      } else if(item_id === 'goal-tracking') {
        this.get('router').transitionTo('user.goals', un);
      }
    },

    phrase_search_change: function(value) {
      this.set('phrase_search', value || '');
    },

    clear_phrase_search: function() {
      this.set('phrase_search', '');
      var input = document.querySelector('.md-board-detail-phrase-builder__input');
      if(input) { input.focus(); }
    },

    // Click handler for phrase builder result buttons. Adds the button to
    // the sentence bar and speaks it. Results come from ButtonSet.find_buttons
    // which returns plain objects with `label`, `vocalization`, `image`, and
    // an `id` plus a `pre_buttons` breadcrumb path. We never navigate to the
    // source board — the user stays in the phrase builder.
    // Commit every matched button in a sentence-mode result set to the
    // sentence bar, in the order they were typed. Skips not-found words.
    phrase_builder_commit_sentence: function() {
      var results = this.get('phrase_results') || [];
      if(!results.length) { return; }
      var _this = this;
      var _get = function(obj, key) {
        return (obj && obj.get && typeof obj.get === 'function') ? obj.get(key) : (obj && obj[key]);
      };
      var flat = this.get('flat_ordered_buttons') || [];
      var find_local = function(btn_id) {
        if(!btn_id) { return null; }
        return flat.find(function(b) {
          if(!b) { return false; }
          var bid = _get(b, 'id');
          return String(bid) === String(btn_id);
        });
      };
      var parts = (this.get('sentence_parts') || []).slice();
      results.forEach(function(button) {
        if(!button || button.is_match === false) { return; }
        var label = button.label;
        var image_url = button.image || button.image_url || button.local_image_url;
        var vocalization = button.vocalization || null;
        var btn_id = button.id;
        // Prefer the already-cached local image URL when available
        var local = find_local(btn_id);
        if(local) {
          var local_img = _get(local, 'local_image_url') || _get(local, 'image_url');
          if(local_img) { image_url = local_img; }
          if(!vocalization) { vocalization = _get(local, 'vocalization') || null; }
        }
        parts.push({ id: btn_id, label: label, vocalization: vocalization, image_url: image_url });
      });
      this.set('sentence_parts', parts);
      // Phrase-builder commit only updates local chips (not app_state.button_list),
      // so do not call vocalize_list here — that would replay a stale utterance.
      // Speak vocalization || label via TTS for the chips just committed.
      var text = this.get('sentence_speak_text');
      if(text) {
        speecher.stop('text');
        speecher.speak_text(text);
        var phrases = (this.get('app_state.board_detail_recent_phrases') || []).slice();
        phrases.unshift({ text: text, timestamp: new Date() });
        if(phrases.length > 5) { phrases = phrases.slice(0, 5); }
        this.set('app_state.board_detail_recent_phrases', phrases);
      }
      // Clear the search so the user sees the alphabetical list again
      this.set('phrase_search', '');
    },

    phrase_builder_select: function(button) {
      if(!button) { return; }
      // Sentence-mode placeholders for unmatched words are not clickable
      if(button.is_match === false) { return; }
      // Results from find_buttons use `image` (URL string); local board
      // buttons use `image_url`. Support both shapes. For local-board
      // buttons, also try the flat_ordered_buttons lookup as a last resort
      // since those entries have the resolved image_url from the board's
      // raw.image_urls map (which is what the symbol grid uses).
      var label = button.label;
      var image_url = button.image || button.image_url || button.local_image_url;
      var vocalization = button.vocalization;
      var btn_id = button.id;
      // Try to find a richer local version of this button so we pick up the
      // already-cached image URL that the symbol grid renders.
      if(btn_id) {
        var local = (this.get('flat_ordered_buttons') || []).find(function(b) {
          if(!b) { return false; }
          var bid = (b.get && typeof b.get === 'function') ? b.get('id') : b.id;
          return String(bid) === String(btn_id);
        });
        if(local) {
          var _get = function(obj, key) {
            return (obj && obj.get && typeof obj.get === 'function') ? obj.get(key) : (obj && obj[key]);
          };
          var local_img = _get(local, 'local_image_url') || _get(local, 'image_url');
          if(local_img) { image_url = local_img; }
        }
      }
      /*
       * Route through the SAME global path a tapped board button takes, so a phrase-builder
       * word is a first-class activation: it lands in `app_state.button_list` (which is what
       * `_speak_current_sentence` speaks via `utterance.vocalize_list`), and it gets USAGE
       * LOGGED — `stashes.log` + `sync.send_update` hang off `app_state.activate_button` and
       * a local push reaches neither. `select_button`'s own comment calls the local push
       * "divergence-prone"; this was the last place still doing it.
       *
       * The button does NOT have to live on the current board. `Button.create` from raw data
       * plus the current board model is the established shape — `app_state`'s tag activation
       * does exactly this. An `editManager` button is preferred when the result IS on this
       * board, because that one carries the real actions, sounds and inflections; a result
       * from a linked sub-board has only what the buttonset walk collected, which is enough.
       *
       * Safe for cross-board results specifically because the walk EXCLUDES folders
       * (`_phrase_try_upgrade_to_buttonset` skips anything with `load_board` /
       * `linked_board_*`), so nothing here can trigger board navigation for a board the user
       * is not on.
       *
       * LOGGING NOTE: `options.board` is what the server records as `button.board`
       * (application.js#_activateButtonWithOptions -> `obj.board`, read by
       * log_session.rb:462). Passing the CURRENT board attributes the activation to where the
       * interaction actually happened, which is how every other activation in the app is
       * logged. For a word taken from a linked sub-board that means the parent board gets the
       * credit; the true origin is on the result as `board_id` if provenance is ever wanted.
       * Heat-map data is unaffected either way — `hit_locations` needs `percent_x/percent_y`
       * (log_session.rb:136) and a phrase-builder pick has no on-screen position.
       */
      var appController = this.get('app_state.controller');
      var board = this.get('model');
      var em_button = null;
      if(btn_id && button.board_id && board && String(button.board_id) === String(board.get('id'))) {
        em_button = editManager.find_button(btn_id);
      }
      if(!em_button || !em_button.get) {
        em_button = Button.create({
          id: btn_id,
          label: label,
          vocalization: vocalization || null,
          image_url: image_url
        });
      }
      if(appController && appController.activateButton && board) {
        appController.activateButton(em_button, { board: board, trigger_source: 'phrase_builder' });
        return;
      }
      /* Fallback only if the app controller is not reachable (mid-teardown): keep the old
         local behaviour so a pick is never silently lost. */
      var parts = (this.get('sentence_parts') || []).slice();
      parts.push({ id: btn_id, label: label, vocalization: vocalization || null, image_url: image_url });
      this.set('sentence_parts', parts);
      speecher.stop('text');
      utterance.speak_button({
        label: label,
        vocalization: vocalization || label
      });
    },

    // Expand / collapse the inline sidebar. This button now owns BOTH the
    // visibility AND the persistent state (the separate pin control has been
    // removed): it flips the shared `quick_sidebar` preference via the
    // application controller's `stickSidebar` primitive (which persists to the
    // DB), then reflects the new state locally. So expanding pins it open and
    // collapsing turns the persistent state OFF. `stickSidebar` sets
    // quick_sidebar synchronously before its save, so reading it right after
    // gives the new value. lock_quick_sidebar still prevents closing.
    toggleInlineSidebar: function() {
      var prefs = this.get('app_state.currentUser.preferences') || {};
      // effective_quick_sidebar so the lock also holds the default-shown sidebar open.
      if(this.get('inlineSidebarOpen') && this.get('app_state.effective_quick_sidebar') && prefs.lock_quick_sidebar) {
        return;
      }
      var appController = this._sidebarAppController();
      if(appController && typeof appController.send === 'function') {
        appController.send('stickSidebar');
        this.set('inlineSidebarOpen', !!this.get('app_state.currentUser.preferences.quick_sidebar'));
      } else {
        // Fallback if the app controller isn't reachable — at least flip locally.
        this.toggleProperty('inlineSidebarOpen');
      }
    },
    sidebar_jump: function(key, board) {
      if(!key && board && board.key) { key = board.key; }
      if(!key) { return; }
      // Board lock: the quick sidebar renders on this page (board-detail.hbs:61) and
      // jumping to one of its boards leaves the current board — the same kind of exit
      // as Back, Home, a folder button or the Collections drawer, and it was the one
      // still unguarded. Checked BEFORE _push_nav_history so a blocked jump does not
      // leave a phantom entry in the back stack.
      //
      // No-op unless the user actually has the lock engaged: board_lock_blocks_exit()
      // returns false immediately when stashes.sticky_board is unset.
      if(this.board_lock_blocks_exit()) { return; }
      board = board || this._sidebar_board_by_key(key);
      this._push_nav_history();
      var appController = this._sidebarAppController();
      if(appController && typeof appController.send === 'function') {
        appController.send('jump', key, 'sidebar', board);
      }
      this._maybeCloseInlineSidebarAfterAction();
    },
    sidebar_special: function(board) {
      if(typeof board === 'string') {
        board = this._sidebar_board_by_key(board);
      }
      var appController = this._sidebarAppController();
      if(appController && typeof appController.send === 'function') {
        appController.send('special', board);
      }
      this._maybeCloseInlineSidebarAfterAction();
    },
    sidebar_alert: function() {
      utterance.alert({button_triggered: true});
      this._maybeCloseInlineSidebarAfterAction();
    },

    // ── Edit Toolbar Actions ──

    undo_edit: function() {
      editManager.undo();
    },

    redo_edit: function() {
      editManager.redo();
    },

    save_board: function(stay_in_edit) {
      // The header's Save button passes true so we stay in edit mode
      // after the save (Traci's spec: Save = persist current work,
      // keep editing). The back_to_boards flow calls save_board with
      // no arg → exits to view mode as before. Flag is read inside
      // saveButtonChanges' finish() helper.
      if(stay_in_edit) {
        this.set('_save_keep_editing', true);
      }
      if(this.get('display_prefs_open')) {
        this.send('save_display_preferences');
      }
      this.saveButtonChanges();
    },

    /**
     * Triggered by the edit-panel's "Back to Boards" button. Always
     * presents a Save / Discard modal so the user is never able to
     * leave with unsaved work by accident. Both branches end on
     * the speak-mode board-detail page (the non-edit view of the
     * same board).
     */
    back_to_boards: function() {
      var _this = this;
      modal.open('confirm-leave-edit', {}).then(function(result) {
        if(result === 'save') {
          // save_board's existing finish() path already transitions
          // to user.board-detail.index after a successful save —
          // exactly where we want to land, so no flag/redirect
          // override is needed.
          _this.send('save_board');
        }
        // Discard was removed from this modal — discarding lives in ONE
        // place only, the "Discard Edits" tile (cancel_edit ->
        // confirm-discard-changes). result undefined → modal closed via
        // X (keep editing); stay put.
      });
    },

    /* "Exit to Home" from the EDIT session bar. Deliberately NOT wired straight to
       `exit_to_home`: that action navigates immediately (it is used from speak mode,
       where there is nothing to lose), so on the edit page it would be a silent
       data-loss trapdoor sitting right next to Cancel, which does confirm. Reuses
       the SAME confirm-discard-changes modal so both escapes from edit mode behave
       identically, then hands off to the existing exit_to_home for the PIN gate,
       timer cleanup and nav-history reset.

       UNLESS there is nothing to discard. A confirm that only ever says "you will lose
       nothing" is noise, and it trains people to click through the one that matters. When
       `edit_session_has_changes` is false the exit happens immediately — see that computed
       for why the undo stack alone does not answer the question.

       `copy_on_save` is still cleared on the way out. It is set when edit mode is entered on
       a board the user does not own, NOT by making a change, so it can be pending on this
       path; `cancel_edit` clears it for the same reason, and the route's `resetController`
       does not. Leaving it set would make the next save silently copy a board. */
    exit_to_home_from_edit: function() {
      var _this = this;
      if(!this.edit_session_has_changes()) {
        this.get('stashes').persist('copy_on_save', null);
        this.send('exit_to_home');
        return;
      }
      modal.open('confirm-discard-changes', {}).then(function(result) {
        if(result === 'discard') {
          _this.get('stashes').persist('copy_on_save', null);
          _this.send('exit_to_home');
        }
      }, function() { });
    },
    cancel_edit: function() {
      var _this = this;
      modal.open('confirm-discard-changes', {}).then(function(result) {
        if(result === 'discard') {
          if(_this.get('display_prefs_open')) {
            _this.send('close_display_preferences');
          }
          _this.set('edit_mode', false);
          _this.set('paint_mode', null);
          _this.set('color_picker_button', null);
          _this.set('board_recolored', false);
          _this.set('_saved_recolor', null);
          _this.set('borders_matched', false);
          _this.set('_saved_border_colors', null);
          // current_mode is deliberately NOT written here (same reasoning as the
          // save-and-exit path above). This branch transitions to
          // user.board-detail.index — the user STAYS on board-detail, whose
          // invariant is speak mode — so 'default' was outright wrong. Exiting
          // the .edit child route restores 'speak' via its resetController.
          // Discard any pending copy-on-save: if the user entered edit
          // mode on a non-owned board (which set this flag) and is now
          // cancelling, no copy should be created.
          _this.get('stashes').persist('copy_on_save', null);
          // Discard unsaved changes: rollback Ember Data model and reload fresh from server
          _this.get('model').rollbackAttributes();
          _this.set('ordered_buttons', null);
          _this.set('board_loading', true);
          var board_key = _this.get('user.user_name') + '/' + _this.get('boardname');
          persistence.ajax('/api/v1/boards/' + board_key, { type: 'GET' }).then(function(data) {
            var merged = boardDetailCache.normalize_board_payload(data);
            if(merged) {
              if(merged.images && merged.images.length) {
                _this._board_detail_images = merged.images;
              }
              _this.set('_raw_board_data', merged);
              _this._build_from_raw(merged);
            }
            _this.set('board_loading', false);
          }, function() {
            _this.set('board_loading', false);
          });
          // Transition back to the index subroute with panels collapsed
          _this.set('panels_collapsed', true);
          _this.set('board_collapsed', true);
          _this.get('router').transitionTo('user.board-detail.index', _this.get('user.user_name'), _this.get('boardname'));
        }
      });
    },

    // ── Paint Mode ──

    set_paint_mode: function(fill, border, part_of_speech) {
      this.set('show_paint_dropdown', false);
      if(fill === 'hide') {
        this.set('paint_mode', { hidden: true });
      } else if(fill === 'show') {
        this.set('paint_mode', { hidden: false });
      } else {
        var fill_tc = window.tinycolor(fill);
        var border_tc = border ? window.tinycolor(border) : window.tinycolor(fill_tc.toRgb()).darken(30);
        this.set('paint_mode', {
          fill: fill_tc.toRgbString(),
          border: border_tc.toRgbString(),
          part_of_speech: part_of_speech
        });
      }
      // Also set on editManager if available
      if(editManager.controller === this) {
        editManager.set_paint_mode(fill, border, part_of_speech);
      }
    },

    // Toggle "paint hidden" mode: activates paint_mode so clicks on board
    // buttons flip btn.hidden = true. Clicking the toggle again exits paint.
    toggle_paint_hide: function() {
      if(this.get('paint_mode_is_hide')) {
        this.send('clear_paint_mode');
      } else {
        this.send('set_paint_mode', 'hide');
      }
    },

    // Toggle "paint shown" mode: activates paint_mode so clicks on board
    // buttons flip btn.hidden = false (reveal).
    toggle_paint_show: function() {
      if(this.get('paint_mode_is_show')) {
        this.send('clear_paint_mode');
      } else {
        this.send('set_paint_mode', 'show');
      }
    },

    clear_paint_mode: function() {
      this.set('paint_mode', null);
      this.set('show_paint_color_picker', false);
      if(editManager.controller === this) {
        editManager.clear_paint_mode();
      }
    },

    // Bulk reveal: walks every cell in ordered_buttons and forces
    // hidden=false on each. Leaves level_modifications intact — if a
    // button has a pre.hidden=true rule, it'll re-hide at the matching
    // preview level, but the in-edit-mode rendering shows it visible.
    reveal_all_hidden_buttons: function() {
      // Reveal All is a one-shot batch action, not a paint stroke —
      // disarm any active Hide/Reveal paint mode so those toggle
      // buttons drop their active state (paint_mode_is_hide /
      // paint_mode_is_show both read paint_mode).
      this.send('clear_paint_mode');
      var count = 0;
      (this.get('ordered_buttons') || []).forEach(function(row) {
        (row || []).forEach(function(btn) {
          if(btn && btn.get && btn.get('hidden')) {
            btn.set('hidden', false);
            count++;
          }
        });
      });
      // Bump the color key so the grid re-renders the hidden→visible
      // transitions in a single pass.
      editManager.update_color_key_id();
      if(count > 0) {
        modal.notice(i18n.t('reveal_all_done', "Revealed %{count} hidden buttons.", { count: count }));
      } else {
        modal.notice(i18n.t('reveal_all_none', "No hidden buttons to reveal."));
      }
    },

    toggle_paint_color_picker: function() {
      this.toggleProperty('show_paint_color_picker');
    },

    toggle_paint_dropdown: function() {
      var was_open = this.get('show_paint_dropdown');
      this.toggleProperty('show_paint_dropdown');
      var _this = this;
      runLater(function() {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        if(!was_open) {
          var first_item = document.querySelector('.md-board-detail-edit-toolbar__paint-dropdown .md-board-detail-edit-toolbar__paint-dropdown-item');
          if(first_item) { first_item.focus(); }
        } else {
          var trigger = document.querySelector('.md-board-detail-edit-toolbar__btn--palette');
          if(trigger) { trigger.focus(); }
        }
      }, 50);
    },

    paint_dropdown_keydown: function(event) {
      this._dropdown_keydown_handler(event, {
        state_prop: 'show_paint_dropdown',
        item_sel: '.md-board-detail-edit-toolbar__paint-dropdown-item',
        toggle_action: 'toggle_paint_dropdown'
      });
    },

    update_board_search: function(event) {
      var val = event && event.target ? event.target.value : '';
      this.set('board_search_string', val);
      this._applyBoardSearch(val);
    },

    clear_board_search: function() {
      this.set('board_search_string', '');
      this._applyBoardSearch('');
    },

    update_custom_paint_color: function(color) {
      this.set('custom_paint_color', color);
    },

    apply_custom_paint_color: function() {
      var color = this.get('custom_paint_color');
      if(!color) { return; }
      // Darken slightly for border
      var tc = window.tinycolor(color);
      var border = tc.darken(15).toHexString();
      this.set('show_paint_color_picker', false);
      this.send('set_paint_mode', color, border, null);
    },

    paint_button: function(btn) {
      var pm = this.get('paint_mode');
      if(!pm || !btn) { return; }
      var btn_id = this._btn_id(btn);

      // Apply paint — mutate the object properties
      if(pm.fill) {
        if(btn.set && typeof btn.set === 'function') {
          btn.set('background_color', pm.fill);
          btn.set('border_color', pm.border || pm.fill);
        } else {
          btn.background_color = pm.fill;
          btn.border_color = pm.border || pm.fill;
        }
      }
      if(pm.part_of_speech) {
        if(btn.set && typeof btn.set === 'function') {
          btn.set('part_of_speech', pm.part_of_speech);
          btn.set('painted_part_of_speech', pm.part_of_speech);
        } else {
          btn.part_of_speech = pm.part_of_speech;
          btn.painted_part_of_speech = pm.part_of_speech;
        }
      }
      if(pm.hidden === true) {
        if(btn.set && typeof btn.set === 'function') { btn.set('hidden', true); } else { btn.hidden = true; }
      }
      if(pm.hidden === false) {
        if(btn.set && typeof btn.set === 'function') { btn.set('hidden', false); } else { btn.hidden = false; }
      }

      // Also update the model's raw buttons for saving
      var model_buttons = this.get('model.buttons') || [];
      var raw = model_buttons.find(function(b) { return b && String(b.id) === String(btn_id); });
      if(raw) {
        if(pm.fill) {
          raw.background_color = pm.fill;
          raw.border_color = pm.border || pm.fill;
        }
        if(pm.part_of_speech) {
          raw.painted_part_of_speech = pm.part_of_speech;
        }
        if(pm.hidden === true) { raw.hidden = true; }
        if(pm.hidden === false) { delete raw.hidden; }
      }

      // Force re-render by rebuilding the array with new row references
      var ob = this.get('ordered_buttons');
      if(ob) {
        var newOb = ob.map(function(row) { return [].concat(row); });
        this.set('ordered_buttons', null);
        this.set('ordered_buttons', newOb);
      }
    },

    // ── Button Operations ──

    clear_button: function(btn) {
      var btn_id = this._btn_id(btn);
      if(btn_id) { editManager.clear_button(btn_id); }
    },

    stash_button: function(btn) {
      var btn_id = this._btn_id(btn);
      if(btn_id) {
        editManager.stash_button(btn_id);
        modal.success(i18n.t('button_stashed', "Button stashed!"));
      }
    },

    word_data: function(btn) {
      if(!btn) { return; }
      var label = btn.get ? btn.get('label') : btn.label;
      var vocalization = btn.get ? btn.get('vocalization') : btn.vocalization;
      var word = label || vocalization;
      if(word) {
        modal.open('word-data', { word: word, button: btn, usage_stats: null, user: this.get('app_state').get('currentUser') });
      }
    },

    board_details: function() {
      this._close_options_menu();
      var board = this.get('model');
      if(!board) { return; }
      modal.open('board-details', { board: board, edit_mode: this.get('edit_mode') });
    },

    // Opens the Speak Mode PIN settings modal (Board Actions → PIN). The modal
    // edits user.preferences.require_speak_mode_pin / speak_mode_pin /
    // hide_pin_hint and saves each change live.
    pin_settings: function() {
      this.set('details_dropdown_open', false);
      modal.open('pin-settings', {});
    },

    // Language → opens the Translate Boards modal. Called from the
    // speak-mode options menu's Session submenu. Does NOT chain
    // through board-details on close (unlike the
    // board-details-page version), so when the user dismisses the
    // translation modal they're back on the speak-mode board, not
    // bounced into a board-details modal first.
    translate_board: function() {
      this.set('show_options_menu', false);
      if(this.get('board_translate_in_progress')) {
        modal.flash(i18n.t('translation_in_progress', "Translation is already in progress. Please wait for it to finish."), 'notice');
        return;
      }
      var board = this.get('model');
      if(!board) { return; }
      modal.open('translation-select', { board: board, button_set: board.get('button_set') });
    },

    // Opens the Switch Languages modal so the user can change the
    // active text + speech language for the current board (only
    // surfaces languages the board has translations for). Mirrors
    // the application controller's existing `switch_languages`
    // action so users can reach the same modal from the speak-mode
    // options menu without leaving board-detail.
    switch_languages: function() {
      this.set('show_options_menu', false);
      var board = this.get('model');
      var _this = this;
      if(!board) { return; }
      modal.open('switch-languages', { board: board }).then(function(res) {
        if(res && res.switched) {
          if(board && board.set) {
            board.set('last_cb', null);
            if(board.get('fast_html')) { board.set('fast_html', null); }
          }
          _this._apply_display_locales_to_ordered_buttons();
          editManager.process_for_displaying(true);
        }
      });
    },

    edit_board_details: function() {
      var board = this.get('model');
      if(!board) { return; }
      modal.open('edit-board-details', { board: board });
    },

    recolor_board: function() {
      var _this = this;
      var saved = this.get('_saved_recolor');

      if(saved) {
        // Revert to saved colors with progress overlay
        this.set('board_reverting_colors', true);
        var ids = Object.keys(saved);
        var idx = 0;
        var batch_size = 10;
        var process_revert = function() {
          if(idx >= ids.length) {
            _this.set('_saved_recolor', null);
            _this.set('board_recolored', false);
            _this.set('board_reverting_colors', false);
            return;
          }
          var batch = ids.slice(idx, idx + batch_size);
          idx += batch_size;
          batch.forEach(function(id) {
            editManager.change_button(id, {
              background_color: saved[id].bg,
              border_color: saved[id].border
            });
          });
          runLater(process_revert, 30);
        };
        process_revert();
        return;
      }

      modal.open('confirm-recolor-board', {}).then(function(result) {
        if(result === 'recolor') {
          // Collapse the right panel's Recolor Tool accordion now
          // that the user has confirmed — the action is committing,
          // there's no reason to keep the section expanded.
          if(_this.get('right_panel_open_section') === 'recolor') {
            _this.set('right_panel_open_section', null);
          }
          var ob = _this.get('ordered_buttons') || [];
          var colors = window.LingoLinq.board_detail_keyed_colors || window.LingoLinq.keyed_colors;
          var savedColors = {};
          var buttons_to_recolor = [];

          for(var ri = 0; ri < ob.length; ri++) {
            var row = ob[ri] || [];
            for(var ci = 0; ci < row.length; ci++) {
              var btn = row[ci];
              if(!btn) { continue; }
              var is_empty = btn.get ? btn.get('empty') : btn.empty;
              var is_folder = (btn.get ? btn.get('load_board') : btn.load_board) && !(btn.get ? btn.get('link_disabled') : btn.link_disabled);
              var label = btn.get ? btn.get('label') : btn.label;
              if(is_empty || is_folder || !label) { continue; }
              var btn_id = btn.get ? btn.get('id') : btn.id;
              savedColors[btn_id] = {
                bg: btn.get ? btn.get('background_color') : btn.background_color,
                border: btn.get ? btn.get('border_color') : btn.border_color
              };
              var text = (btn.get ? btn.get('vocalization') : btn.vocalization) || label;
              buttons_to_recolor.push({ id: btn_id, text: text });
            }
          }

          _this.set('_saved_recolor', savedColors);
          _this.set('board_recolored', true);
          _this.set('board_recoloring', true);

          // Single batch API call for all words
          var words = buttons_to_recolor.map(function(b) { return b.text; });
          persistence.ajax('/api/v1/search/batch_parts_of_speech', {type: 'GET', data: {words: words.join(',')}}).then(function(res) {
            var results = (res && res.results) || {};
            buttons_to_recolor.forEach(function(item) {
              var data = results[item.text];
              if(data && data.types) {
                var picked = pick_aac_color(data.types, colors, item.text);
                if(picked) {
                  editManager.change_button(item.id, {
                    background_color: picked.color.fill,
                    border_color: picked.color.border,
                    part_of_speech: picked.type,
                    suggested_part_of_speech: picked.type
                  });
                }
              }
            });
            _this.set('board_recoloring', false);
          }, function() {
            _this.set('board_recoloring', false);
          });
          // If borders are matched, re-apply after API calls complete
          if(_this.get('borders_matched')) {
            runLater(function() {
              var currentOb = _this.get('ordered_buttons') || [];
              for(var ri2 = 0; ri2 < currentOb.length; ri2++) {
                var row2 = currentOb[ri2] || [];
                for(var ci2 = 0; ci2 < row2.length; ci2++) {
                  var b = row2[ci2];
                  if(!b) { continue; }
                  var bEmpty = (b.get && b.get('empty')) || b.empty;
                  var bFolder = ((b.get && b.get('load_board')) || b.load_board) && !((b.get && b.get('link_disabled')) || b.link_disabled);
                  var bBg = (b.get && b.get('background_color')) || b.background_color;
                  if(bEmpty || bFolder || !bBg) { continue; }
                  var bId = (b.get && b.get('id')) || b.id;
                  editManager.change_button(bId, { border_color: bBg });
                }
              }
              _this.set('ordered_buttons', currentOb.map(function(r) { return [].concat(r); }));
            }, 2000);
          }
        }
      });
    },

    set_folder_style: function(style) {
      var _this = this;
      /* Second half of the gate the template already applies (the options are
         `disabled` while grouping is on). Kept as its own check so no future caller can
         write a folder style that the grouped board will not honour — the effective
         style is pinned to colored_corner while grouping is active, so persisting a
         different one would store a preference the user cannot see taking effect. */
      if(_this.get('grouping_active')) { return; }
      _this.set('folder_display_style', style);
      _this.set('folder_dropdown_open', false);
      var user = _this.get('app_state.currentUser');
      if(user && user.set && user.save) {
        user.set('preferences.folder_display_style', style);
        user.save();
      }
    },

    // Toggles the "Colored Folder Front" preference — when true, folder
    // card faces are painted with the button's Fitzgerald color (same
    // hue a regular button would have) regardless of which folder
    // display style is currently selected. Persisted on the user record.
    toggle_folder_colored_face: function() {
      var _this = this;
      var next = !_this.get('folder_colored_face');
      _this.set('folder_colored_face', next);
      var user = _this.get('app_state.currentUser');
      if(user && user.set && user.save) {
        user.set('preferences.folder_colored_face', next);
        user.save();
      }
    },

    // Toggles the "Soft borders" preference — when true, the grid
    // gets the .md-board-detail-grid--soft-borders class which
    // lightens the per-button outer shadow, adds a subtle inset
    // highlight, and mutes the colored outline edge so it reads
    // more tonally without losing the category color cue. Layers ON
    // TOP of the user's existing border thickness pref — does NOT
    // change border-width. Persisted on user.preferences.soft_borders.
    toggle_soft_borders: function() {
      var _this = this;
      var next = !_this.get('soft_borders');
      _this.set('soft_borders', next);
      var user = _this.get('app_state.currentUser');
      if(user && user.set && user.save) {
        user.set('preferences.soft_borders', next);
        user.save();
      }
    },

    // Toggles the "Hide speak bar" preference — when true the speak
    // row's home button, sentence-bar text/chips, mic, backspace, and
    // trash buttons are visually hidden via the
    // .md-board-detail-sentence-row--hide-bar class on the row;
    // only the options-chevron stays visible so the user can still
    // open the speak menu to flip the toggle back. Persisted on
    // user.preferences.hide_speak_bar.
    toggle_hide_speak_bar: function() {
      var _this = this;
      var next = !_this.get('hide_speak_bar');
      _this.set('hide_speak_bar', next);
      var user = _this.get('app_state.currentUser');
      if(user && user.set && user.save) {
        user.set('preferences.hide_speak_bar', next);
        user.save();
      }
    },

    // Sets whether a single speak-mode options-menu item is hidden
    // for this user. `id` is one of the SPEAK_MENU_ITEMS ids defined
    // at the top of this file (e.g. 'my_boards', 'translate',
    // 'sticky_board'). `hidden` is the explicit target state — the
    // segmented Hide/Show pill calls this directly with `true` /
    // `false` rather than relying on a toggle, so tapping the
    // already-active side is a no-op instead of flipping the
    // state. Stored as an array of hidden ids on
    // user.preferences.speak_mode_hidden_menu_items.
    set_speak_menu_item_hidden: function(id, hidden) {
      // Defense-in-depth alongside the template gate at
      // templates/user/board-detail.hbs ({{#if app_state.feature_flags.customize_menu}}).
      // Template gate hides UI but doesn't make the action unreachable
      // (debug console, custom client, action chaining). Both gates needed.
      // Per pre-merge audit §3.5 (Trust boundary analysis).
      if(!this.get('app_state.feature_flags.customize_menu')) { return; }
      var arr = (this.get('speak_menu_hidden_items') || []).slice();
      var ix = arr.indexOf(id);
      var want_hidden = !!hidden;
      if(want_hidden && ix < 0) { arr.push(id); }
      else if(!want_hidden && ix >= 0) { arr.splice(ix, 1); }
      else { return; }
      this.set('speak_menu_hidden_items', arr);
      var user = this.get('app_state.currentUser');
      if(user && user.set && user.save) {
        user.set('preferences.speak_mode_hidden_menu_items', arr);
        user.save();
      }
    },

    /* G3: `toggle_folder_dropdown` / `folder_dropdown_keydown` deleted
       2026-08-24 — same shape as the details pair above. No template referenced
       either; the keydown handler was the only route to the toggle. The
       `folder_dropdown_open` flag stays (read by the document click-handler and
       reset in routes/user/board-detail.js:333). */

    match_borders_to_fill: function() {
      var ob = this.get('ordered_buttons') || [];
      var matched = this.get('borders_matched');

      if(matched) {
        // Revert to darkened borders (20% darker than bg)
        for(var ri = 0; ri < ob.length; ri++) {
          var row = ob[ri] || [];
          for(var ci = 0; ci < row.length; ci++) {
            var btn = row[ci];
            if(!btn) { continue; }
            var bg = (btn.get && btn.get('background_color')) || btn.background_color;
            if(!bg) { continue; }
            var btn_id = (btn.get && btn.get('id')) || btn.id;
            var darkened = window.tinycolor ? window.tinycolor(bg).darken(20).toRgbString() : bg;
            editManager.change_button(btn_id, { border_color: darkened });
          }
        }
        this.set('borders_matched', false);
      } else {
        // Match borders to fill color
        for(var ri = 0; ri < ob.length; ri++) {
          var row = ob[ri] || [];
          for(var ci = 0; ci < row.length; ci++) {
            var btn = row[ci];
            if(!btn) { continue; }
            var is_empty = (btn.get && btn.get('empty')) || btn.empty;
            var is_folder = ((btn.get && btn.get('load_board')) || btn.load_board) && !((btn.get && btn.get('link_disabled')) || btn.link_disabled);
            var bg = (btn.get && btn.get('background_color')) || btn.background_color;
            if(is_empty || is_folder || !bg) { continue; }
            var btn_id = (btn.get && btn.get('id')) || btn.id;
            editManager.change_button(btn_id, { border_color: bg });
          }
        }
        this.set('borders_matched', true);
      }
      // Force Ember to re-render the grid by creating a new array reference
      this.set('ordered_buttons', ob.map(function(row) { return [].concat(row); }));
    },

    /* `open_button_stash` and `suggestions` were DELETED 2026-08-24, not lost:
       both moved to components/board-actions.js when their rows moved out of this
       controller's edit panel and into the Board Actions modal. Nothing in any
       template or JS referenced them here afterwards (verified by grep and by
       lingolinq/no-orphaned-action), and leaving a handler with no call site is
       the exact condition this branch exists to clear. Recover with
       `git show <this-commit>^:app/frontend/app/controllers/user/board-detail.js`. */

    // ── Drag & Drop ──

    rearrangeButtons: function(dragId, dropId) {
      editManager.switch_buttons(dragId, dropId);
    },

    prep_for_swap: function(id) {
      editManager.prep_for_swap(id);
    },

    // ── Grid Configuration ──
    //
    // modify_size is used by the toolbar's Rows/Columns −/+ buttons.
    //
    // Remove semantics: we DO NOT actually delete the row/column. Instead the
    // last row/column is popped off `ordered_buttons` and stashed on
    // `_hidden_row_stack` / `_hidden_col_stack` (LIFO). Buttons inside stay
    // alive and re-appear when the user adds a row/column back. The stacks
    // are session-local: they live across save during the same edit session
    // (user can click −, save, then + to get it back), but a fresh page load
    // starts with empty stacks (anything saved-out stays saved-out).
    //
    // Add semantics: if the corresponding hidden stack has an entry, pop and
    // re-attach it (normalising its length to match the current opposing
    // dimension). Only when the stack is empty do we delegate to
    // editManager.modify_size, which appends a row/column of fake buttons.
    modify_size: function(type, action, index) {
      var ob = this.get('ordered_buttons');
      if(!ob || !ob.length) { return; }

      if(type === 'row') {
        if(action === 'remove') {
          if(ob.length <= 1) { return; }
          var rstack = this.get('_hidden_row_stack') || [];
          rstack = [].concat(rstack, [ob[ob.length - 1]]);
          this.set('_hidden_row_stack', rstack);
          this.set('ordered_buttons', ob.slice(0, -1).map(function(r) { return [].concat(r); }));
          return;
        }
        if(action === 'add') {
          var rstack = this.get('_hidden_row_stack') || [];
          if(rstack.length > 0) {
            var row = rstack[rstack.length - 1];
            var cols = (ob[0] || []).length;
            while(row.length < cols) { row.push(editManager.fake_button()); }
            if(row.length > cols) { row = row.slice(0, cols); }
            this.set('_hidden_row_stack', rstack.slice(0, -1));
            this.set('ordered_buttons', ob.concat([row]).map(function(r) { return [].concat(r); }));
            return;
          }
          editManager.modify_size(type, action, index);
          return;
        }
      }

      if(type === 'column') {
        if(action === 'remove') {
          var first = ob[0] || [];
          if(first.length <= 1) { return; }
          var cstack = this.get('_hidden_col_stack') || [];
          var col = ob.map(function(r) { return r[r.length - 1]; });
          cstack = [].concat(cstack, [col]);
          this.set('_hidden_col_stack', cstack);
          this.set('ordered_buttons', ob.map(function(r) { return r.slice(0, -1); }));
          return;
        }
        if(action === 'add') {
          var cstack = this.get('_hidden_col_stack') || [];
          if(cstack.length > 0) {
            var col = cstack[cstack.length - 1];
            while(col.length < ob.length) { col.push(editManager.fake_button()); }
            if(col.length > ob.length) { col = col.slice(0, ob.length); }
            this.set('_hidden_col_stack', cstack.slice(0, -1));
            this.set('ordered_buttons', ob.map(function(r, ri) { return [].concat(r, [col[ri]]); }));
            return;
          }
          editManager.modify_size(type, action, index);
          return;
        }
      }
    },

    // ── Level Preview ──

    toggle_preview_levels: function() {
      var on = this.get('preview_levels_mode');
      if(on) {
        // Turning OFF: editManager.clear_preview_levels resets every
        // button to level 10 (full vocab) and clears preview_level /
        // preview_levels_mode on the controller.
        editManager.clear_preview_levels();
        return;
      }
      // Turning ON: always start at Level 1 (the most basic / most
      // restricted view) so the user sees the "starting state" first
      // and can step up from there.
      editManager.preview_levels();
      this.set('preview_level', 1);
      editManager.apply_preview_level(1);
    },

    shift_level: function(direction) {
      var levels = this.get('available_levels') || [];
      if(!levels.length) { return; }
      var current = this.get('preview_level');
      var idx = current ? levels.indexOf(current) : -1;

      if(direction === 'up') {
        idx = Math.min(idx + 1, levels.length - 1);
      } else if(direction === 'down') {
        idx = Math.max(idx - 1, 0);
      } else if(direction === 'done') {
        // Exit preview entirely — same path as toggle off.
        editManager.clear_preview_levels();
        return;
      }
      var nextLevel = levels[idx];
      this.set('preview_level', nextLevel);
      // Apply the new level to every button on the grid so the
      // preview actually reflects the change.
      editManager.apply_preview_level(nextLevel);
    },

    // ── Button Levels paint actions ──
    // These delegate to the same editManager.set_paint_mode call the legacy
    // paint-level modal uses (components/paint-level.js), so the underlying
    // paint engine + dirty/save tracking is unchanged.
    set_level_paint_action: function(action) {
      // 'clear' is an instant batch action, not a paint mode. One
      // click wipes every button's level_modifications across the
      // whole board, which makes the badges disappear from the
      // preview, hides the OR + Remove sub-card via the
      // button_level_count gate, and toasts confirmation.
      if(action === 'clear') {
        var rows = this.get('ordered_buttons') || [];
        var any_cleared = false;
        rows.forEach(function(row) {
          (row || []).forEach(function(btn) {
            if(!btn) { return; }
            var mods = btn.get && btn.get('level_modifications');
            if(mods && Object.keys(mods).length > 0) {
              // Reset hidden=false for any button that had a level
              // rule. The rule's purpose was visibility control, so
              // removing the rule should restore visibility regardless
              // of how the rule encoded its hide-state. Also overwrite
              // the preview-mode stash so the subsequent
              // clear_preview_levels call doesn't restore a stale value.
              emberSet(btn, 'hidden', false);
              btn._preview_original_hidden = false;
              emberSet(btn, 'level_modifications', null);
              any_cleared = true;
            }
          });
        });
        // Exit preview mode and disarm any paint action. With no rules
        // left, the preview filter has nothing to filter — leaving it
        // engaged would keep formerly-tagged buttons grayed by stale
        // preview-mutation state. clear_preview_levels restores each
        // button's pre-preview `hidden` via the stash so user-hidden
        // buttons return to their normal edit-mode appearance and
        // formerly-tagged buttons surface in full CSS.
        editManager.clear_preview_levels();
        editManager.clear_paint_mode();
        this.set('level_paint_action', null);
        this.set('level_paint_level', null);
        // Toggle the levels_change signal so button_level_count
        // recomputes synchronously and the section gate updates.
        this.set('levels_change', !this.get('levels_change'));
        if(any_cleared) {
          modal.notice(i18n.t('all_level_rules_removed', "All level rules have been removed from this board."));
        }
        return;
      }

      var current = this.get('level_paint_action');
      // Toggle off if clicking the same add-action again — clears
      // paint mode AND exits preview, since preview is now implicit
      // while a paint action is armed.
      if(current === action) {
        this.set('level_paint_action', null);
        this.set('level_paint_level', null);
        editManager.clear_paint_mode();
        editManager.clear_preview_levels();
        return;
      }
      this.set('level_paint_action', action);
      // Switching to an add-action: engage preview so the user sees
      // the level-filtered view as they paint. Preview level matches
      // the armed paint level (defaults to Level 1 on first activation).
      var lvl = this.get('level_paint_level');
      if(!lvl) {
        this.set('level_paint_level', 1);
        lvl = 1;
      }
      var n = parseInt(lvl, 10);
      editManager.set_paint_mode('level', action, n);
      editManager.preview_levels();
      this.set('preview_level', n);
      editManager.apply_preview_level(n);
    },
    set_level_paint_level: function(level) {
      var current = this.get('level_paint_level');
      // Click same level again → unarm (paint off + exit preview).
      if(current === level) {
        this.set('level_paint_level', null);
        editManager.clear_paint_mode();
        editManager.clear_preview_levels();
        return;
      }
      this.set('level_paint_level', level);
      var action = this.get('level_paint_action');
      if(action) {
        var n = parseInt(level, 10);
        editManager.set_paint_mode('level', action, n);
        // Update preview to match the newly-picked level so the user
        // sees the board AS it would appear at this level.
        editManager.preview_levels();
        this.set('preview_level', n);
        editManager.apply_preview_level(n);
      }
    },
    clear_level_paint: function() {
      this.set('level_paint_action', null);
      this.set('level_paint_level', null);
      editManager.clear_paint_mode();
      editManager.clear_preview_levels();
    },

    set_speak_level: function(level) {
      // Available to anyone with the actions menu open (no edit
      // permission required) — changing the viewable level is a
      // caregiving concern, not an editing one. Writes to
      // stashes.board_level so board/index.js#current_level picks
      // it up on its next render.
      var n = parseInt(level, 10);
      if(!n || n < 1 || n > 10) { return; }
      this.get('stashes').persist('board_level', n);
      // Notify the board controller (if any) so its current_level
      // computed re-evaluates and re-renders the grid.
      var ctrl = this.get('app_state.controller');
      if(ctrl && ctrl.notifyPropertyChange) {
        ctrl.notifyPropertyChange('current_level');
      }
      // Refresh board-detail's own grid. The cached ordered_buttons
      // were built against the previous level — invalidate by board
      // key/id, then rebuild from the last raw response so
      // _make_btn picks up the new level via cache_ctx + apply.
      var model = this.get('model');
      var key = model && model.get && model.get('key');
      var id = model && model.get && (model.get('id') || model.get('global_id'));
      if(key) { boardDetailCache.invalidate(key); }
      if(id) { boardDetailCache.invalidate(id); }
      // Also notify current_speak_level so the pill UI re-highlights.
      this.notifyPropertyChange('current_speak_level');
      this.processButtons();
    },

    toggle_levels_submenu: function() {
      // Nested expand-state inside the Session submenu so the level
      // pill grid stays out of the way until the user explicitly
      // wants it.
      var was_open = this.get('levels_submenu_open');
      this.toggleProperty('levels_submenu_open');
      // On expand, RE-APPLY the level the supervisor last selected
      // (persisted in stashes.board_level) so the board is actually
      // filtered to it and the matching pill highlights. If no level was
      // ever selected, default to 10 (full vocab). Previously this
      // hard-coded level 1, which overwrote and re-persisted the saved
      // level on every open — so the supervisor's choice never survived
      // re-opening the menu or a new session.
      if(!was_open) {
        var saved = parseInt(this.get('stashes.board_level'), 10);
        var lvl = (saved >= 1 && saved <= 10) ? saved : 10;
        this.send('set_speak_level', lvl);
      }
    },

    // ── Misc actions dispatched by raw_events or other systems ──

    compute_height: function() {
      // No-op: board-detail uses CSS grid, not computed height
    },

    redraw: function() {
      // No-op: board-detail doesn't use canvas rendering
    }
  }
});
