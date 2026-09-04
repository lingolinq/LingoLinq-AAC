import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { set as emberSet, get as emberGet } from '@ember/object';
import { observer } from '@ember/object';
import { next, debounce, cancel, later as runLater, scheduleOnce } from '@ember/runloop';
import RSVP from 'rsvp';
import { htmlSafe } from '@ember/template';
import $ from 'jquery';
import modalUtil from '../utils/modal';
import LingoLinq from '../app';
import i18n from '../utils/i18n';
import editManager from '../utils/edit_manager';
import contentGrabbers from '../utils/content_grabbers';
import buildEventAction from '../utils/event_action';
import persistence from '../utils/persistence';
import speecher from '../utils/speecher';
import { pick_aac_color } from '../utils/parts_of_speech';
import { buttonSpacingPx, buttonBorderPx, buttonTextPx, BUTTON_SPACING_OPTIONS } from '../utils/display_prefs';
import aiFeatureGate from '../utils/ai_feature_gate';
import article50Gate from '../utils/article50_gate';
import boardsPageListCache from '../utils/boards_page_list_cache';

/**
 * Create Board (New) Modal Component
 *
 * Full-width sibling of new-board for iterating on the create-board flow
 * without disturbing the live modal. Lookup key 'create-board-new'.
 */
export default Component.extend({
  modal: service('modal'),
  router: service('router'),
  store: service('store'),
  stashes: service('stashes'),
  /* Shared with board-detail and the Display Style step so "Continue Anyway" on ANY
     rotate-device overlay silences them all for the session. */
  overlay_dismissals: service('overlay-dismissals'),

  /* What the template actually gates on. A computed rather than reading the local flag
     alone, so the overlay also disappears the moment the user turns helper messages off
     in Preferences (or dismisses the message on another page) while this page is open —
     the init seed below would otherwise be stale for the life of the component. */
  orientation_overlay_hidden: computed('orientation_overlay_dismissed', 'overlay_dismissals.rotate_device_hidden', function() {
    return !!(this.get('orientation_overlay_dismissed') || this.get('overlay_dismissals.rotate_device_hidden'));
  }),
  appState: service('app-state'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'create-board-new';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};

    // Did we arrive here from the board-picker guided-tour modal? The tour modal
    // sets appState.from_tour_board_picker before navigating; capture it here so
    // this page can adapt (e.g. return the user to the tour/dashboard on finish).
    // The route clears the appState flag on deactivate so it never leaks to a
    // normal (non-tour) visit.
    this.set('from_tour', !!this.get('appState.from_tour_board_picker'));

    // Initialize model; for_user_id 'self' ensures create payload includes owner for API
    var currentUserId = this.appState.get('currentUser.id') || this.appState.get('sessionUser.id');
    this.set('model', LingoLinq.store.createRecord('board', {
      public: false,
      visibility: 'private',
      license: {type: 'private'},
      grid: {rows: 5, columns: 6, labels_order: 'rows'},
      for_user_id: currentUserId ? 'self' : undefined
    }));
    
    // Initialize speech recognition if available
    if(window.webkitSpeechRecognition) {
      var speech = new window.webkitSpeechRecognition();
      if(speech) {
        speech.continuous = true;
        this.set('speech', {engine: speech});
      }
    }
    
    // Restore labels order from stash (overrides default when present)
    if(this.stashes.get('new_board_labels_order')) {
      this.set('model.grid.labels_order', this.stashes.get('new_board_labels_order'));
    }

    // Author in the communicator's language. english_first_board_generation
    // means "look up symbols and POS in English, persist English as a
    // stored locale" — not "make the user type English."
    var preferred_locale = null;
    var locale = ((i18n.langs || {}).preferred || window.navigator.language || 'en').replace(/-/g, '_');
    var pieces = locale.split(/_/);
    if(pieces[0]) { pieces[0] = pieces[0].toLowerCase(); }
    if(pieces[1]) { pieces[1] = pieces[1].toUpperCase(); }
    locale = pieces[0] + '_' + pieces[1];
    var locales = (i18n.get && i18n.get('locales')) || {};
    if(locales[locale]) {
      preferred_locale = locale;
    } else {
      locale = locale.split(/_/)[0];
      if(locales[locale]) {
        preferred_locale = locale;
      }
    }
    this.set('preferred_communicator_locale', preferred_locale);
    this.set('_label_english', {});
    if(this.appState.get('feature_flags.english_first_board_generation')) {
      this.set('model.locale', preferred_locale || 'en');
    } else if(preferred_locale) {
      this.set('model.locale', preferred_locale);
    }
    
    this.set('status', null);
    this.set('more_options', false);
    // Board light/dark mirrors the user's single `board_dark_mode` preference —
    // the same one board-detail's dark toggle writes. This page has no default of
    // its own: it just reflects the preference (unset/false → light, true → dark),
    // which is light until the user turns on dark in board-detail.
    var darkPref = this.appState.get('currentUser.preferences.board_dark_mode');
    this.set('preview_mode', darkPref ? 'dark' : 'light');
    this.set('labels_list_open', false);
    /* Default "Are you creating this board for someone else?" to NO for EVERY
       user — boards default to being created for the current user themselves.
       Supporters can still flip the toggle to Yes and pick a communicator; this
       is just the initial state. (Previously this defaulted to Yes for
       supporter-role users; that role-conditional default has been removed.) */
    this.set('creating_for_someone_else', false);
    // Map of label.toLowerCase() -> { fill, border, type } populated as
    // labels are looked up via /api/v1/search/batch_parts_of_speech.
    this.set('_label_colors', {});
    // Map of label.toLowerCase() -> { image_url, license, ... } populated
    // as labels are searched via /api/v1/search/symbols. Lets the preview
    // cells show real symbol images instead of the placeholder square,
    // and lets `saveBoard` bake the same image_url into model.buttons[]
    // so the saved board uses the symbol the user previewed (rather than
    // re-searching server-side which can pick a different match).
    this.set('_label_images', {});
    this._label_images_debounce = null;
    this.set('_label_images_lookup_promise', null);
    // In-flight manual image drops (file/URL onto a tile). Create must wait
    // for these the same way it waits for OpenSymbols lookups — otherwise a
    // drop that finished uploading after Create was clicked is never baked.
    this._pending_label_image_uploads = [];
    // Paint feature — mirrors the board-detail edit toolbar's paint flow.
    // `_painted_colors` is the user's manual overrides keyed by label so
    // the color follows the label through drag-reorder; baked into
    // `model.buttons` at save time. `paint_mode` is the currently-armed
    // color (null when not painting); `show_paint_dropdown` /
    // `show_paint_color_picker` / `custom_paint_color` mirror the
    // board-detail dropdown's open state and custom-color input.
    this.set('_painted_colors', {});
    this.set('paint_mode', null);
    this.set('show_paint_dropdown', false);
    this.set('show_paint_color_picker', false);
    this.set('custom_paint_color', '#4a90d9');
    // Words tapped on the preview grid, shown in the preview speak bar (mirrors
    // board-detail speak mode's sentence box). Single-clicking a button appends
    // its label here and speaks it; the bar's Speak/Backspace/Clear act on it.
    this.set('_speak_words', []);
    // ≤768px landscape-rotate overlay: shown via CSS media query; "Continue Anyway"
    // dismisses it. Seeded from the SHARED session flag rather than hard `false`, so a
    // dismissal made on another page (board-detail, the Display Style step) is already
    // in effect on arrival instead of the overlay re-appearing here.
    this.set('orientation_overlay_dismissed', this.get('overlay_dismissals.rotate_device_hidden'));
    // Create-method chooser: on entry to the create-board page, present three
    // animated options (Create My Own / Import / Generate with AI). Picking one
    // routes into that flow and dismisses the chooser.
    this.set('show_create_chooser', true);
    // True once the user picked "Create My Own Board" from the chooser — swaps the
    // header title to "Create My Own Board".
    this.set('via_create_own', false);
    // Field-level validation tracking. `_field_touched` flips true after
    // the user has interacted with a field and blurred it; `_submit_attempted`
    // flips true after the first time the user clicks Create with required
    // fields still empty. Errors only render when one of these is true so a
    // fresh form never accuses the user before they've engaged. Keyed by
    // field name so adding a new required field is a one-line change in
    // `field_errors` below + an `onblur` wire-up in the template.
    this.set('_field_touched', {});
    this.set('_submit_attempted', false);

    // Initialize board categories
    var res = [];
    var categories = LingoLinq.board_categories || [];
    categories.forEach(function(c) {
      var cat = $.extend({}, c);
      res.push(cat);
    });
    this.set('board_categories', res);

    var sessionUser = this.appState.get('sessionUser');
    var superviseesLen = (sessionUser && sessionUser.supervisees && sessionUser.supervisees.length) || 0;
    var managedOrgsLen = (sessionUser && sessionUser.managed_orgs && sessionUser.managed_orgs.length) || 0;
    this.set('has_supervisees', superviseesLen > 0 || managedOrgsLen > 0);
    
    // Initialize preview grid
    this.set('previewRows', this.get('model.grid.rows'));
    this.set('previewColumns', this.get('model.grid.columns'));
    
    // Initialize showGrid immediately (observers don't fire during init)
    this.updateShowGrid();

    var self = this;
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
    // For keydown/drag/drop bindings, whose handlers need the raw event and
    // do their own preventDefault (cellEditKeydown reads event.key;
    // cellDragOver/cellDrop read event.dataTransfer and stopPropagation so the
    // global file-drop handler doesn't steal the drag). ctrlAction above stays
    // as-is for the ~100 click bindings that rely on it swallowing the event.
    this.eventAction = buildEventAction(this);
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };
    this.ctrlActionEventValue = function(actionName, targetProp) {
      return function(event) {
        var value = event && event.target ? event.target[targetProp] : undefined;
        self.send(actionName, value);
      };
    };
  },

  for_user_id: computed('model.for_user_id', function() {
    // Return null when the model points at 'self' so the dropdown shows
    // its placeholder ("Select who this board is for") instead of acting
    // like the user has already made a real choice. The save path falls
    // back to 'self' at submit time when no supervisee is picked.
    var id = this.get('model.for_user_id');
    if(!id || id === 'self') { return null; }
    return id;
  }),

  /** Soft attention cue for the supervisee dropdown. When the toggle is
   *  set to "Yes" (the default for supporter-role users; communicators
   *  default to "No"), the dropdown is revealed — but until the user
   *  picks an actual person the dropdown is empty. We illuminate it
   *  with a teal glow so it visibly asks for input, without making it
   *  a hard validation error (the for-user pick is still optional at
   *  submit time per the current `createBoardDisabled` rules). Clears
   *  the moment the user selects someone OR flips the toggle to "No"
   *  (which is the initial state for communicators, so they see no
   *  glow until they explicitly flip to Yes). */
  for_user_needs_attention: computed('creating_for_someone_else', 'for_user_id', 'show_user_options', function() {
    if(!this.get('show_user_options')) { return false; }
    if(!this.get('creating_for_someone_else')) { return false; }
    return !this.get('for_user_id');
  }),

  /** Options for the "For" dropdown. All known supervisees — no "self"
   *  entry, since the dropdown is only shown when creating for someone
   *  else. Matches user-select.js's pattern of including every
   *  supervisee (edit_permission is enforced server-side at save time
   *  rather than hidden from the menu, so a supervisor who hasn't been
   *  granted explicit edit access for a supervisee still appears here). */
  user_options: computed('appState.sessionUser.known_supervisees.[]', function() {
    var supers = this.appState.get('sessionUser.known_supervisees') || [];
    return supers.map(function(s) {
      return {id: s.id, name: s.user_name};
    });
  }),

  /** Only show the "For" picker when there is at least one valid choice. */
  show_user_options: computed('user_options.length', function() {
    return (this.get('user_options.length') || 0) > 0;
  }),

  /** Inline width binding for the speech level meter (0–100% from speech.level). */
  speech_level_style: computed('speech.level', function() {
    var lvl = this.get('speech.level') || 0;
    return 'width: ' + Math.max(0, Math.min(100, lvl)) + '%;';
  }),

  ai_board_generation_enabled: computed(
    'appState.feature_flags.ai_board_generation',
    'appState.currentUser.preferences.ai_features_enabled',
    'appState.currentUser.preferences.ai_board_generation',
    function() {
      return aiFeatureGate.aiFeatureEnabled(this.appState, 'ai_board_generation');
    }
  ),

  /**
   * UI opt-in before entering AI board generation. Server grandfather is
   * unchanged; this only decides whether to show the enable popup, the EU
   * parental-consent modal, or a blocked notice.
   * Resolves { proceed: true } when generation may continue.
   */
  _ensureAiBoardGenerationAccess: function() {
    var appState = this.get('appState');
    var user = appState && appState.get && appState.get('currentUser');
    var entry = aiFeatureGate.boardGenerationEntry(appState);
    var stay = function() { return { proceed: false }; };

    if(entry === 'allowed') {
      return RSVP.resolve({ proceed: true });
    }

    if(entry === 'eu_consent') {
      var parentEmail = '';
      if(user && user.get) {
        parentEmail = user.get('eu_ai_parental_consent_parent_email') || '';
      }
      return modalUtil.open('eu-ai-parental-consent', {
        user: user,
        triggeredPref: 'ai_board_generation',
        parentEmail: parentEmail
      }).then(stay, stay);
    }

    if(entry === 'blocked_flag' || entry === 'blocked_coppa') {
      return modalUtil.open('enable-ai-features', {
        blocked: true,
        blockedReason: entry === 'blocked_coppa' ? 'coppa' : 'flag',
        triggeredPref: 'ai_board_generation'
      }).then(stay, stay);
    }

    return modalUtil.open('enable-ai-features', {
      user: user,
      triggeredPref: 'ai_board_generation'
    }).then(function(result) {
      var features = result && result.requested_features;
      var boardGenOn = !!(features && features.ai_board_generation);
      return { proceed: !!(result && result.saved && boardGenOn) };
    }, stay);
  },

  _enterAiMode: function() {
    this.send('set_create_mode', 'ai');
    this.set('via_create_own', false);
    this.set('show_create_chooser', false);
  },

  _requestEnterAiMode: function() {
    var _this = this;
    // The chooser is an in-page overlay at z-index 6000. Bootstrap .modal is
    // 1050, so any ModalDialog opened while the chooser is up paints behind it
    // and is blurred by the chooser's backdrop-filter. Other chooser actions
    // (paste HTML / JSON bundle) already hide the overlay first. Hide it here
    // too whenever a system modal will open; restore if the user does not proceed.
    var fromChooser = !!this.get('show_create_chooser');
    var entry = aiFeatureGate.boardGenerationEntry(this.get('appState'));
    if(fromChooser && entry !== 'allowed') {
      this.set('show_create_chooser', false);
    }
    return this._ensureAiBoardGenerationAccess().then(function(result) {
      if(_this.isDestroyed || _this.isDestroying) { return result; }
      if(result && result.proceed) {
        _this._enterAiMode();
      } else if(fromChooser) {
        _this.set('show_create_chooser', true);
      }
      return result;
    });
  },

  paste_html_import_enabled: computed('appState.feature_flags.paste_html_import', function() {
    return !!this.appState.get('feature_flags.paste_html_import');
  }),

  /** Mirror the live board-detail page's text-position class on the
   *  preview grid so the mockup honors the user's saved preference
   *  (top / bottom / text_only). Defaults to 'top' when unset, matching
   *  controllers/user/board-detail.js:1099. */
  button_text_position_class: computed('appState.sessionUser.preferences.device.button_text_position', function() {
    var pos = this.appState.get('sessionUser.preferences.device.button_text_position') || 'top';
    return 'md-board-detail-grid--text-pos-' + pos;
  }),

  /** Text-size class (small/medium/large/huge) — drives the live page's
   *  font sizing rules. Same default ('medium') as the live controller. */
  button_text_size_class: computed('appState.sessionUser.preferences.device.button_text', function() {
    var size = this.appState.get('sessionUser.preferences.device.button_text') || 'medium';
    return 'md-board-detail-grid--text-' + size;
  }),

  /** Text-size in px — published as --bd-button-text-size on the grid so
   *  symbol cards pick the user's preferred label size. Reads from the
   *  canonical map in utils/display_prefs.js. */
  button_text_size_px: computed('appState.sessionUser.preferences.device.button_text', function() {
    return buttonTextPx(this.appState.get('sessionUser.preferences.device.button_text'));
  }),

  /** Grid gap in px — published as --bd-button-gap. Reads from
   *  utils/display_prefs.js (canonical). */
  button_spacing_px: computed('appState.sessionUser.preferences.device.button_spacing', function() {
    return buttonSpacingPx(this.appState.get('sessionUser.preferences.device.button_spacing'));
  }),

  /** Symbol-card outline width in px — published as --bd-button-border.
   *  Reads from utils/display_prefs.js (canonical). */
  button_border_px: computed('appState.sessionUser.preferences.device.button_border', function() {
    return buttonBorderPx(this.appState.get('sessionUser.preferences.device.button_border'));
  }),

  /** Shape modifier class (square / tall / wide) for the symbol cards. */
  button_shape_class: computed('appState.sessionUser.preferences.stretch_buttons', function() {
    var pref = this.appState.get('sessionUser.preferences.stretch_buttons') || 'none';
    if(pref === 'prefer_tall') { return 'md-board-detail-grid--shape-tall'; }
    if(pref === 'prefer_wide') { return 'md-board-detail-grid--shape-wide'; }
    return 'md-board-detail-grid--shape-square';
  }),

  /** Background-mode class for the preview grid. Mirrors the live page's
   *  `symbol_background_clear|white|black` + optional `high_contrast`
   *  classes so the existing descendant SCSS rules paint the preview
   *  cells correctly. */
  preview_background_class: computed('appState.sessionUser.preferences.symbol_background', 'appState.sessionUser.preferences.high_contrast', function() {
    var bg = this.appState.get('sessionUser.preferences.symbol_background') || 'clear';
    var cls;
    // Soft uses the same colored card chrome as plain Colored, plus a
    // .fitzgerald-soft class that swaps the --fitzgerald-* CSS custom
    // properties (defined in _variables.scss). Mirrors
    // mixins/pref-classes.js#symbol_background_class so the preview
    // behaves identically to the live board.
    if(bg === 'clear_soft') { cls = 'symbol_background_clear fitzgerald-soft'; }
    else                    { cls = 'symbol_background_' + bg; }
    if(this.appState.get('sessionUser.preferences.high_contrast')) {
      cls += ' high_contrast';
    }
    return cls;
  }),

  // ── AI board-generation mode ──────────────────────────────────────────
  // When true the page is in "Generate with AI" mode (selected via the
  // segmented mode switch) instead of regular creation. In AI mode the
  // description is required and the Size & Labels section stays hidden
  // behind a "Generate Labels with AI" button until that button has
  // successfully produced labels (ai_labels_generated).
  ai_mode: false,
  ai_labels_generated: false,
  ai_generating: false,
  ai_generate_error: null,

  /* Core Words. Rides the generate_labels request as `include_core_words`, and the
     Rails prompt builder swaps its WHOLE vocabulary instruction on it
     (lib/ai_board_generator.rb:96) — on, it asks for 40-60% high-frequency core
     words mixed with topic vocabulary; off, topic-specific only.

     This switch is the only way to reach the topic-only prompt. The core-words
     instruction is appended AFTER the user's description, so it overrides wording
     like "animals, no core vocabulary" in the description itself — which is exactly
     the bug this fixes: the page hard-coded `true` and a topic-only request still
     came back full of I / want / go / more / help.

     Defaults to true, matching the generate-board modal (generate-board.js:52), so
     anyone who never touches it sees no change. */
  include_core_words: true,

  /* Same two strings the generate-board modal uses, deliberately — one behaviour,
     one set of words. Double-quoted because they are user-facing and
     i18n_generator.rb only registers keys whose default is double-quoted; the
     modal's single-quoted copies are why neither key was ever in the locale files
     (fixed in generate-board.js in the same change). */
  core_words_tooltip: computed('include_core_words', function() {
    return this.get('include_core_words')
      ? i18n.t('core_words_tooltip_checked', "Include 40-60% high-frequency core words (I, want, go, more, stop, like, not, help, do, is, it, the, my, turn, fast, slow, etc.), rest topic-specific vocabulary")
      : i18n.t('core_words_tooltip_unchecked', "Focus on topic-specific vocabulary only (nouns, topic verbs, descriptors, phrases unique to that context)");
  }),

  // ── Display Preferences toolbar (ported from board-detail) ────────────
  // Dropdown open-state flags
  display_prefs_font_dropdown_open: false,
  display_prefs_symbol_library_dropdown_open: false,
  display_prefs_symbol_background_dropdown_open: false,
  display_prefs_voice_height_dropdown_open: false,
  display_prefs_skin_dropdown_open: false,

  skin_tone_options: computed(function() {
    return [
      { id: 'default',      label: i18n.t('board_detail_settings_skin_original',    "Original"),     swatch: 'original' },
      { id: 'light',        label: i18n.t('board_detail_settings_skin_light',       "Light"),        swatch: 'light' },
      { id: 'medium-light', label: i18n.t('board_detail_settings_skin_medium_light', "Medium Light"), swatch: 'medium-light' },
      { id: 'medium',       label: i18n.t('board_detail_settings_skin_medium',      "Medium"),       swatch: 'medium' },
      { id: 'medium-dark',  label: i18n.t('board_detail_settings_skin_medium_dark', "Medium Dark"),  swatch: 'medium-dark' },
      { id: 'dark',         label: i18n.t('board_detail_settings_skin_dark',        "Dark"),         swatch: 'dark' },
      { id: 'mix',          label: i18n.t('board_detail_settings_skin_mix',         "Mix of tones"), swatch: 'mix' },
      { id: 'mix_only',     label: i18n.t('skin_dropdown_mix_only',                 "Mix only chosen tones"),  swatch: 'mix-only' },
      { id: 'mix_prefer',   label: i18n.t('skin_dropdown_mix_prefer',               "Favor chosen tones"),     swatch: 'mix-prefer' }
    ];
  }),

  display_prefs_current_skin_id: computed('appState.sessionUser.preferences.skin', function() {
    var s = this.appState.get('sessionUser.preferences.skin') || 'default';
    if(s.indexOf('mix_only') === 0)  { return 'mix_only'; }
    if(s.indexOf('mix_prefer') === 0) { return 'mix_prefer'; }
    if(s === 'mix' || s.indexOf('mix::') === 0) { return 'mix'; }
    return s;
  }),

  display_prefs_current_skin_label: computed('display_prefs_current_skin_id', 'skin_tone_options', function() {
    var id = this.get('display_prefs_current_skin_id');
    var opts = this.get('skin_tone_options') || [];
    var match = opts.find(function(o) { return o.id === id; });
    return match ? match.label : i18n.t('board_detail_settings_skin_original', "Original");
  }),

  display_prefs_current_skin_swatch: computed('display_prefs_current_skin_id', 'skin_tone_options', function() {
    var id = this.get('display_prefs_current_skin_id');
    var opts = this.get('skin_tone_options') || [];
    var match = opts.find(function(o) { return o.id === id; });
    return match ? match.swatch : 'original';
  }),

  // Option lists (mirror controllers/user/board-detail.js)
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
  // Which edit-rail section is expanded (single-open accordion). When
  // a section is open the preview stage grows (see CSS) so the grid
  // gets more room alongside the taller panel.
  create_rail_open_section: null,

  // Section labels for the (currently empty) create-board edit rail.
  // Shell only — no controls wired yet; mirrors the board-detail edit
  // panel's section list (subset that applies to board creation).
  create_rail_sections: [
    /* Reordered per design:
       Background → Board Layout → Board Symbols → Paint at the
       top; then Shape & Border, Skin Tones, Speak Bar; with
       Text Settings sitting at the bottom of the rail. */
    { id: 'background', label: i18n.t('board_detail_background', "Background") },
    { id: 'layout',     label: i18n.t('board_detail_board_layout', "Board Layout") },
    { id: 'symbols',    label: i18n.t('board_detail_board_symbols', "Board Symbols"), short_label: i18n.t('symbols', "Symbols") },
    { id: 'paint',      label: i18n.t('board_detail_paint', "Paint") },
    { id: 'shape',      label: i18n.t('board_detail_shape_border', "Shape & Border"), short_label: i18n.t('shape_border', "Shape/Border") },
    /* Skin Tones section temporarily hidden from the create-board rail — the
       in-rail dropdown positioning needs rework; removed from the list so the
       toggle + its body don't render. Re-add this entry to restore it. */
    /* { id: 'skin',    label: i18n.t('board_detail_skin_tones', "Skin Tones") }, */
    { id: 'speakbar',   label: i18n.t('board_detail_speak_bar', "Speak Bar") },
    { id: 'text',       label: i18n.t('board_detail_text_settings', "Text Settings") }
    /* Gap removed — Grid Gap lives in the Board Layout section. */
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

  // Map of pref key → live user.preferences path
  _display_prefs_paths: {
    button_spacing:       'preferences.device.button_spacing',
    button_border:        'preferences.device.button_border',
    button_text:          'preferences.device.button_text',
    button_text_position: 'preferences.device.button_text_position',
    button_style:         'preferences.device.button_style',
    stretch_buttons:      'preferences.stretch_buttons',
    preferred_symbols:    'preferences.preferred_symbols',
    symbol_background:    'preferences.symbol_background',
    high_contrast:        'preferences.high_contrast',
    vocalization_height:  'preferences.device.vocalization_height',
    skin:                 'preferences.skin'
  },

  // Stepper end-of-ladder disabled-states
  display_prefs_text_size_at_min: computed('appState.sessionUser.preferences.device.button_text', function() {
    var idx = ['small', 'medium', 'large', 'huge'].indexOf(this.appState.get('sessionUser.preferences.device.button_text') || 'medium');
    return idx <= 0;
  }),
  display_prefs_text_size_at_max: computed('appState.sessionUser.preferences.device.button_text', function() {
    var idx = ['small', 'medium', 'large', 'huge'].indexOf(this.appState.get('sessionUser.preferences.device.button_text') || 'medium');
    return idx >= 3;
  }),
  display_prefs_border_at_min: computed('appState.sessionUser.preferences.device.button_border', function() {
    var idx = ['none', 'small', 'medium', 'large', 'huge'].indexOf(this.appState.get('sessionUser.preferences.device.button_border') || 'medium');
    return idx <= 0;
  }),
  display_prefs_border_at_max: computed('appState.sessionUser.preferences.device.button_border', function() {
    var idx = ['none', 'small', 'medium', 'large', 'huge'].indexOf(this.appState.get('sessionUser.preferences.device.button_border') || 'medium');
    return idx >= 4;
  }),
  display_prefs_spacing_at_min: computed('appState.sessionUser.preferences.device.button_spacing', function() {
    var idx = ['none', 'minimal', 'extra-small', 'small', 'medium', 'large', 'huge'].indexOf(this.appState.get('sessionUser.preferences.device.button_spacing') || 'medium');
    return idx <= 0;
  }),
  display_prefs_spacing_at_max: computed('appState.sessionUser.preferences.device.button_spacing', function() {
    var idx = ['none', 'minimal', 'extra-small', 'small', 'medium', 'large', 'huge'].indexOf(this.appState.get('sessionUser.preferences.device.button_spacing') || 'medium');
    return idx >= 6;
  }),

  // Current-value labels for dropdowns
  display_prefs_current_font_label: computed('appState.sessionUser.preferences.device.button_style', 'button_style_options', function() {
    var current = this.appState.get('sessionUser.preferences.device.button_style') || 'default';
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
  display_prefs_current_symbol_library_label: computed('appState.sessionUser.preferences.preferred_symbols', 'preferred_symbols_options', function() {
    var current = this.appState.get('sessionUser.preferences.preferred_symbols') || 'original';
    var opts = this.get('preferred_symbols_options') || [];
    var match = opts.find(function(o) { return o.id === current; });
    return match ? match.label : 'Original';
  }),
  display_prefs_current_symbol_background_id: computed('appState.sessionUser.preferences.symbol_background', 'appState.sessionUser.preferences.high_contrast', function() {
    if(this.appState.get('sessionUser.preferences.high_contrast')) { return 'high_contrast'; }
    return this.appState.get('sessionUser.preferences.symbol_background') || 'clear';
  }),
  display_prefs_current_symbol_background_label: computed('display_prefs_current_symbol_background_id', 'symbol_background_options', function() {
    var current = this.get('display_prefs_current_symbol_background_id');
    var opts = this.get('symbol_background_options') || [];
    var match = opts.find(function(o) { return o.id === current; });
    return match ? match.label : 'Clear';
  }),
  display_prefs_current_voice_height_label: computed('appState.sessionUser.preferences.device.vocalization_height', 'voice_height_options', function() {
    var current = this.appState.get('sessionUser.preferences.device.vocalization_height') || 'medium';
    var opts = this.get('voice_height_options') || [];
    var match = opts.find(function(o) { return o.id === current; });
    return match ? match.label : 'Medium (100px)';
  }),

  // Speak Bar — "Show on Speak Bar as…" (Symbol buttons vs Words only).
  // Mirrors board-detail's `utterance_text_only_str`: exposes the
  // boolean pref as a "true"/"false" string for the radio group's
  // is-equal comparisons.
  utterance_text_only_str: computed('appState.sessionUser.preferences.device.utterance_text_only', function() {
    return this.appState.get('sessionUser.preferences.device.utterance_text_only') ? 'true' : 'false';
  }),

  // Speak-bar chip layout — mirrors board-detail's `utterance_text_on_top` so
  // the preview sentence bar stacks each chip's label/symbol the SAME way the
  // user's `button_text_position` preference renders the board cells above
  // (button_text_position_class). 'top' → label over symbol; anything else →
  // symbol over label. Same default ('top') and same pref key as the grid.
  utterance_text_on_top: computed('appState.sessionUser.preferences.device.button_text_position', function() {
    var pos = this.appState.get('sessionUser.preferences.device.button_text_position') || 'top';
    return pos === 'top';
  }),

  // Preview hook: maps the chosen vocalization_height onto a class so
  // the preview speak bar visibly grows/shrinks with the Sentence Bar
  // dropdown (Tiny 50 / Small 70 / Medium 100 / Large 150 / Huge 200).
  nb_preview_vocalization_class: computed('appState.sessionUser.preferences.device.vocalization_height', function() {
    var current = this.appState.get('sessionUser.preferences.device.vocalization_height') || 'medium';
    return 'nb-preview-sentence-bar--' + current;
  }),

  // Skin compound-state checks (read directly from live preferences)
  skin_is_mix: computed('appState.sessionUser.preferences.skin', function() {
    var s = this.appState.get('sessionUser.preferences.skin') || '';
    return s === 'mix' || s.indexOf('mix::') === 0;
  }),
  skin_is_mix_only: computed('appState.sessionUser.preferences.skin', function() {
    return (this.appState.get('sessionUser.preferences.skin') || '').indexOf('mix_only') === 0;
  }),
  skin_is_mix_prefer: computed('appState.sessionUser.preferences.skin', function() {
    return (this.appState.get('sessionUser.preferences.skin') || '').indexOf('mix_prefer') === 0;
  }),
  skin_suboptions: computed('appState.sessionUser.preferences.skin', function() {
    var s = this.appState.get('sessionUser.preferences.skin') || '';
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

  // Composes and persists a mix / mix_only / mix_prefer skin string.
  _rebuild_compound_skin: function(id) {
    var user_id = this.appState.get('sessionUser.id');
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

  willDestroy() {
    // Stop recording before teardown (don't use send() - component is being destroyed)
    var speech = this.get('speech');
    if(speech && speech.engine) {
      try { speech.engine.abort(); } catch(e) { }
    }
    if(speech) {
      this.set('speech.resume', false);
      this.set('speech.recording', false);
      this.set('speech.ready', false);
      this.set('speech.almost_recording', false);
    }
    this._super(...arguments);
  },

  locales: computed(function() {
    var list = i18n.get('locales');
    var res = [{name: i18n.t('choose_locale', '[Choose a Language]'), id: ''}];
    for(var key in list) {
      res.push({name: list[key], id: key});
    }
    res.push({name: i18n.t('unspecified', "Unspecified"), id: ''});
    return res;
  }),

  public_options: LingoLinq.publicOptions,

  createBoardDisabled: computed('model.name', 'status.saving', 'show_user_options', 'creating_for_someone_else', 'model.for_user_id', 'ai_mode', 'model.description', 'ai_labels_generated', function() {
    var name = (this.get('model.name') || '').trim();
    if(this.get('status.saving') || name.length === 0) {
      return true;
    }
    // AI mode: the description feeds the generation, so it's required,
    // and the user must have run "Generate Labels with AI" (which
    // reveals the full Size & Labels section) before they can create.
    if(this.get('ai_mode')) {
      if(!(this.get('model.description') || '').trim().length) { return true; }
      if(!this.get('ai_labels_generated')) { return true; }
    }
    // Conditional: when the toggle is "Yes", the user must actually pick
    // a supervisee. The teal glow on the dropdown (`for_user_needs_attention`)
    // is the visual cue; this is the hard validation gate.
    if(this.get('show_user_options') && this.get('creating_for_someone_else')) {
      var picked = this.get('model.for_user_id');
      if(!picked || picked === 'self') { return true; }
    }
    return false;
  }),

  /** Regular creation always shows the full Size & Labels section. In
   *  AI mode it stays hidden behind the "Generate Labels with AI"
   *  button until that has produced labels. */
  show_full_size_section: computed('ai_mode', 'ai_labels_generated', function() {
    return !this.get('ai_mode') || this.get('ai_labels_generated');
  }),

  /** "Generate Labels with AI" stays disabled until the user has
   *  entered a board description (the AI prompt), isn't already
   *  mid-generation, and the rows × columns total is at or below the
   *  recommended 112-button ceiling. Going over the ceiling shows
   *  the warning banner in the template and blocks generation until
   *  the user dials the steppers back down. */
  ai_generate_disabled: computed('ai_generating', 'model.description', 'ai_button_count_over_limit', function() {
    if(this.get('ai_generating')) { return true; }
    if(this.get('ai_button_count_over_limit')) { return true; }
    return !(this.get('model.description') || '').trim().length;
  }),

  /** Recommended max for an AI-generated board. AAC boards much larger
   *  than this become hard to scan visually, the AI's per-button
   *  label quality drops off as the grid grows, and the symbols
   *  endpoint we call for each label rate-limits aggressively. Set
   *  as an instance constant so future tweaks land in one place. */
  MAX_AI_BUTTONS: 112,

  /** True when the user's chosen rows × columns exceeds the
   *  recommended 112-button ceiling. Drives the warning banner in
   *  the AI generation panel and blocks the Generate button via
   *  `ai_generate_disabled`. */
  ai_button_count_over_limit: computed('model.grid.rows', 'model.grid.columns', function() {
    var rows = parseInt(this.get('model.grid.rows'), 10) || 0;
    var cols = parseInt(this.get('model.grid.columns'), 10) || 0;
    return (rows * cols) > this.get('MAX_AI_BUTTONS');
  }),

  /** Live button-count for the warning banner copy ("142 buttons —
   *  please reduce to 112 or fewer"). */
  ai_button_count: computed('model.grid.rows', 'model.grid.columns', function() {
    var rows = parseInt(this.get('model.grid.rows'), 10) || 0;
    var cols = parseInt(this.get('model.grid.columns'), 10) || 0;
    return rows * cols;
  }),

  /** Live "what's missing" list for the Create button hint. Mirrors the
   *  validation in `createBoardDisabled` (see above) but returns the
   *  human-readable field names so the template can render them in a
   *  natural-language sentence ("Add a name to enable Create."). The
   *  hint hides automatically once the list is empty (button enables).
   *  Description and icon are optional (icon auto-assigns server-side
   *  via `Board#check_image_url`). For-user is conditionally required
   *  when the "Yes" toggle is on. */
  missing_required_fields: computed('model.name', 'show_user_options', 'creating_for_someone_else', 'model.for_user_id', function() {
    var missing = [];
    if(!(this.get('model.name') || '').trim().length) {
      missing.push(i18n.t('required_name', "a name"));
    }
    if(this.get('show_user_options') && this.get('creating_for_someone_else')) {
      var picked = this.get('model.for_user_id');
      if(!picked || picked === 'self') {
        missing.push(i18n.t('required_for_user', "who this board is for"));
      }
    }
    return missing;
  }),

  /** Per-field error messages. Each entry returns either a localized
   *  string (the helper text + screen-reader announcement) or null. An
   *  error is only "active" once the field has been touched-and-blurred
   *  OR the user has attempted to submit — never on a fresh, untouched
   *  form. Keyed by the same field names as `_field_touched` so the
   *  template + `attemptSave` stay in sync.
   *
   *  To future-proof: when description/icon/for-user become required
   *  again, add a parallel block here, an `onblur` wire-up in the
   *  template, and the field's id to `_required_field_ids` below. */
  field_errors: computed('model.name', '_field_touched.name', '_submit_attempted', function() {
    var touched = this.get('_field_touched') || {};
    var submitted = this.get('_submit_attempted');
    var errors = {};
    var name_empty = !(this.get('model.name') || '').trim().length;
    if(name_empty && (touched.name || submitted)) {
      errors.name = i18n.t('error_name_required', "Please enter a name for the board.");
    }
    return errors;
  }),

  /** DOM ids of required-field inputs in form order. Used by
   *  `attemptSave` to focus the first empty one when the user clicks
   *  Create with missing fields — same Material 3 / Stripe pattern. */
  _required_field_ids: ['new_board_name'],

  /** Joined sentence form of `missing_required_fields`. "Add a name." or
   *  "Add a name and description." or "Add a name, description, and icon."
   *  — Oxford-comma three-or-more, plain "and" for two, single item bare.
   *  Returns null when nothing is missing so the template can `{{#if}}`
   *  it cleanly. */
  missing_required_summary: computed('missing_required_fields.[]', function() {
    var list = this.get('missing_required_fields') || [];
    if(list.length === 0) { return null; }
    var phrase;
    if(list.length === 1) {
      phrase = list[0];
    } else if(list.length === 2) {
      phrase = list[0] + ' ' + i18n.t('and', "and") + ' ' + list[1];
    } else {
      phrase = list.slice(0, -1).join(', ') + ', ' + i18n.t('and', "and") + ' ' + list[list.length - 1];
    }
    return i18n.t('add_required_fields', "Add %{fields} to enable Create.", { fields: phrase });
  }),

  label_count: computed('model.grid', 'model.grid.labels', function() {
    var str = this.get('model.grid.labels') || "";
    var lines = str.split(/\n|,\s*/);
    return lines.filter(function(l) { return l && !l.match(/^\s+$/); }).length;
  }),

  parsed_labels: computed('model.grid.labels', function() {
    var str = this.get('model.grid.labels') || '';
    if(typeof str !== 'string') { str = '' + str; }
    return str.split(/\n|,/).map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
  }),

  /** Position-preserving labels array. Same source as `parsed_labels`
   *  but WITHOUT the empty-string filter, so the array index matches
   *  the grid cell position 1:1. Used by the preview grid + drag-drop
   *  handlers so blank tiles in the MIDDLE of the grid can be
   *  drag-targets and drag-sources. `parsed_labels` stays filtered for
   *  the consumers that scan labels for lookups/colors/images — empty
   *  strings there would cause useless API requests and false
   *  duplicate/POS warnings. */
  positional_labels: computed('model.grid.labels', function() {
    var str = this.get('model.grid.labels') || '';
    if(typeof str !== 'string') { str = '' + str; }
    return str.split(/\n|,/).map(function(s) { return s.trim(); });
  }),

  /** Combined map of POS auto-colors + user-applied paint, keyed by
   *  label.toLowerCase(). Painted overrides win — same precedence as
   *  the preview grid's `bg_style` resolution above and the live
   *  board-detail page (button.background_color > pick_aac_color).
   *  Passed to <label-chips colors={{...}}> so chips in both the
   *  inline list and the disclosure list reflect the same color the
   *  user sees on the preview cell. */
  chip_label_colors: computed('_label_colors', '_painted_colors', function() {
    var pos = this.get('_label_colors') || {};
    var painted = this.get('_painted_colors') || {};
    if(Object.keys(painted).length === 0) { return pos; }
    var merged = Object.assign({}, pos);
    Object.keys(painted).forEach(function(key) {
      var p = painted[key];
      if(p && p.fill) {
        merged[key] = { fill: p.fill, border: p.border, type: p.part_of_speech };
      }
    });
    return merged;
  }),

  /** Paint-color swatches for the toolbar dropdown. Mirrors
   *  `color_picker_swatches` on user/board-detail.js — same Fitzgerald
   *  palette + POS labels, same `symbol_background` dep so the swatches
   *  refresh to soft hues when the user has Colored Soft saved. Lives on
   *  the component so the create-board flow has identical paint semantics
   *  to the live board-detail edit toolbar. */
  paint_swatches: computed('appState.currentUser.preferences.symbol_background', function() {
    var darken = function(color) {
      if(window.tinycolor) {
        return window.tinycolor(color).darken(30).toHexString();
      }
      return color;
    };
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
      .filter(function(c) { return c.pos_class && pos_labels[c.pos_class]; })
      .map(function(c) {
        var s = { label: pos_labels[c.pos_class], pos_class: c.pos_class, bg: c.fill };
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

  preview_grid: computed('model.grid.rows', 'model.grid.columns', 'model.grid.labels_order', 'positional_labels.[]', '_editIdx', '_label_colors', '_painted_colors', '_label_images', 'paint_mode', 'appState.sessionUser.preferences.skin', function() {
    var rows = parseInt(this.get('model.grid.rows'), 10) || 0;
    var cols = parseInt(this.get('model.grid.columns'), 10) || 0;
    rows = Math.max(0, Math.min(20, rows));
    cols = Math.max(0, Math.min(20, cols));
    var order = this.get('model.grid.labels_order') || 'rows';
    // Use positional_labels so blanks in the MIDDLE of the grid
    // (created by drag-dropping a labeled tile onto a blank, or by
    // dragging a blank onto a labeled tile) keep their position
    // rather than getting compacted out.
    var labels = this.get('positional_labels') || [];
    var editIdx = this.get('_editIdx');
    var label_colors = this.get('_label_colors') || {};
    var painted_colors = this.get('_painted_colors') || {};
    var label_images = this.get('_label_images') || {};
    var paint_active = !!this.get('paint_mode');
    // Skin-tone variant transformation — mirrors board-detail's
    // _build_from_raw which calls LingoLinq.Board.skin_image_map
    // (see board-detail.js:825) on the freshly fetched image map.
    // Each label's cached image_url is the raw symbol URL from
    // /api/v1/search/symbols; here we wrap it through
    // LingoLinq.Board.skinned_url so the preview honors the user's
    // chosen skin tone. `which_skinner` translates the preference
    // value ('light', 'medium', 'mix', etc.) into the variant
    // identifier the URL builder expects; `upgrade_url_for_skin_variants`
    // promotes legacy URLs into the variant-capable form. Computed
    // once per render (deps include preferences.skin) so the swap
    // happens reactively when the user changes the skin dropdown.
    var skin = this.get('appState.sessionUser.preferences.skin');
    var skin_active = !!(skin && skin !== 'default' && LingoLinq && LingoLinq.Board && LingoLinq.Board.skinned_url);
    var which_skin = skin_active ? LingoLinq.Board.which_skinner(skin) : null;
    // Build a duplicate-label set so each cell can flag itself as a
    // duplicate independently — drives the warning icon + glow on the
    // preview card. Keyed lowercase to match label-chips' duplicate
    // detection (so the chip pill and the preview card flag the same
    // labels as duplicates).
    var counts = {};
    labels.forEach(function(l) {
      var key = (l || '').toLowerCase();
      if(!key) { return; }
      counts[key] = (counts[key] || 0) + 1;
    });
    var grid = [];
    for(var r = 0; r < rows; r++) {
      var row = [];
      for(var c = 0; c < cols; c++) {
        var idx = (order === 'columns') ? (c * rows + r) : (r * cols + c);
        var label = labels[idx] || '';
        // Manual paint overrides POS auto-color — same precedence as the
        // live board-detail page (button.background_color wins over the
        // computed POS color from `pick_aac_color`).
        var painted = label ? painted_colors[label.toLowerCase()] : null;
        var color = painted || (label ? label_colors[label.toLowerCase()] : null);
        var bg_style = null;
        // A cell counts as "clear" only when the resolved POS fill is
        // pure white — the conjunction/number POS color in the
        // Fitzgerald palette. Articles/determiners (#ccc, #dcdcdc)
        // intentionally render gray; that's their POS. Painted overrides
        // always render, even if the user picks white.
        var is_clear_color = false;
        if(color && color.fill && !painted) {
          var f = ('' + color.fill).toLowerCase().replace(/\s+/g, '');
          if(f === '#fff' || f === '#ffffff' || f === 'white' ||
             f === 'rgb(255,255,255)' || f === 'rgba(255,255,255,1)') {
            is_clear_color = true;
          }
        }
        if(color && color.fill && !is_clear_color) {
          var style = 'background-color: ' + color.fill + ';--btn-bg:' + color.fill + ';';
          if(color.border) { style += ' outline-color: ' + color.border + ';'; }
          bg_style = htmlSafe(style);
        }
        var editing = (editIdx !== null && editIdx !== undefined && editIdx === idx);
        var is_duplicate = !!(label && counts[label.toLowerCase()] > 1);
        // "No Fitzgerald category": the POS lookup has RESOLVED for this
        // label (entry present in _label_colors) but produced no
        // Fitzgerald key color (no fill — pick_aac_color found no
        // matching part of speech) AND the user hasn't manually painted
        // it. Only flags after the async lookup completes so a label the
        // user is still typing doesn't false-positive. Clear/gray POS
        // (conjunctions/articles) carry a real fill, so they are NOT
        // flagged — they do have a category.
        var lc_entry = label ? label_colors[label.toLowerCase()] : null;
        var no_category = !!(label && !painted && lc_entry && !lc_entry.fill);
        // Symbol image preview — the OpenSymbols search result for this
        // label, looked up async via `_lookup_label_images`. Falls back
        // to a placeholder square in the template when the URL is
        // missing or hasn't resolved yet. Same image_url is written to
        // model.buttons[] at save time so the saved board uses what the
        // user previewed.
        var image_entry = label ? label_images[label.toLowerCase()] : null;
        var image_url = (image_entry && image_entry.image_url) || null;
        if(image_url && skin_active && which_skin) {
          image_url = LingoLinq.Board.skinned_url(
            LingoLinq.Board.upgrade_url_for_skin_variants(image_url),
            which_skin,
            false
          );
        }
        row.push({
          row: r,
          col: c,
          idx: idx,
          label: label,
          empty: !label,
          editing: editing,
          // Drag is disabled while a cell is being edited (otherwise dragging
          // the click+hold to position the caret could initiate a swap) or
          // while paint mode is active (clicks are paints, not drags).
          // Blank cells ARE draggable so the user can rearrange empty
          // positions (e.g. drag a blank slot ONTO a labeled tile to push
          // the label into the slot and leave the source blank). Template
          // binds `draggable={{...}}`.
          draggable: !!(!editing && !paint_active),
          painted: !!painted,
          is_duplicate: is_duplicate,
          no_category: no_category,
          bg_style: bg_style,
          image_url: image_url,
          // A near-white POS fill (conjunction/article) counts as no
          // color visually, so the template adds the `--no-color` class
          // and the preview's flat-card rule kicks in. Painted cells
          // always count as colored.
          has_color: !!(color && color.fill && !is_clear_color)
        });
      }
      grid.push(row);
    }
    return grid;
  }),

  /** Unique labels whose POS lookup resolved with no Fitzgerald key
   *  color (and the user hasn't painted them). Drives the preview
   *  highlight + the warning banner. Mirrors the per-cell `no_category`
   *  rule so the count matches what's highlighted. */
  no_fitzgerald_labels: computed('parsed_labels.[]', '_label_colors', '_painted_colors', function() {
    var labels = this.get('parsed_labels') || [];
    var lc = this.get('_label_colors') || {};
    var painted = this.get('_painted_colors') || {};
    var seen = {};
    var out = [];
    labels.forEach(function(l) {
      var key = (l || '').toLowerCase();
      if(!key || seen[key]) { return; }
      seen[key] = true;
      if(painted[key]) { return; }
      var entry = lc[key];
      if(entry && !entry.fill) { out.push(l); }
    });
    return out;
  }),

  no_fitzgerald_count: computed('no_fitzgerald_labels.[]', function() {
    return (this.get('no_fitzgerald_labels') || []).length;
  }),

  /** Short, comma-joined preview of the uncolored labels for the
   *  banner copy — capped so a big paste doesn't blow out the alert. */
  no_fitzgerald_labels_display: computed('no_fitzgerald_labels.[]', function() {
    var list = this.get('no_fitzgerald_labels') || [];
    var shown = list.slice(0, 8);
    var str = shown.join(', ');
    if(list.length > shown.length) {
      str += ', …';
    }
    return str;
  }),

  /** 2-letter root of the language the user is authoring in. */
  _authoring_locale_root() {
    return ((this.get('model.locale') || 'en').split(/_|-/)[0] || 'en').toLowerCase();
  },

  /** True when we should translate labels to English for symbol/POS
   *  lookup and persist both locales on save. */
  _needs_english_lookup() {
    if(!this.appState.get('feature_flags.english_first_board_generation')) {
      return false;
    }
    return this._authoring_locale_root() !== 'en';
  },

  /** English string for a cached authoring-language label key, or the
   *  key itself when we are authoring in English / have no mapping. */
  _english_for_label(key) {
    if(!key) { return key; }
    if(!this._needs_english_lookup()) { return key; }
    var mapped = (this.get('_label_english') || {})[key];
    return mapped || key;
  },

  /** Batch-translate unseen labels to English. Caches identity on
   *  failure so we do not retry forever. Does not change visible labels. */
  _lookup_label_english() {
    var _this = this;
    if(this.isDestroyed || this.isDestroying) {
      return RSVP.resolve();
    }
    if(!this._needs_english_lookup()) {
      return RSVP.resolve();
    }
    var labels = this.get('parsed_labels') || [];
    var cached = this.get('_label_english') || {};
    var seen = {};
    var to_lookup = [];
    labels.forEach(function(l) {
      var key = (l || '').toLowerCase();
      if(!key || seen[key] || Object.prototype.hasOwnProperty.call(cached, key)) { return; }
      seen[key] = true;
      to_lookup.push(key);
    });
    if(to_lookup.length === 0) {
      return RSVP.resolve();
    }
    var source = this._authoring_locale_root();
    var gen = this._authoring_locale_gen || 0;
    var lookup_promise = persistence.ajax('/api/v1/users/self/translate', {
      type: 'POST',
      data: {
        words: to_lookup,
        source_lang: source,
        destination_lang: 'en'
      }
    }).then(function(data) {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      if((_this._authoring_locale_gen || 0) !== gen) { return; }
      if(_this._authoring_locale_root() !== source) { return; }
      var trans = (data && data.translations) || {};
      var next_map = Object.assign({}, _this.get('_label_english') || {});
      to_lookup.forEach(function(word) {
        var english = trans[word] || trans[word.toLowerCase()];
        next_map[word] = (english && String(english).trim()) || word;
      });
      _this.set('_label_english', next_map);
    }, function() {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      if((_this._authoring_locale_gen || 0) !== gen) { return; }
      var next_map = Object.assign({}, _this.get('_label_english') || {});
      to_lookup.forEach(function(word) {
        next_map[word] = word;
      });
      _this.set('_label_english', next_map);
    });
    this.set('_label_english_lookup_promise', lookup_promise);
    lookup_promise.finally(function() {
      if(!_this.isDestroyed && !_this.isDestroying && _this.get('_label_english_lookup_promise') === lookup_promise) {
        _this.set('_label_english_lookup_promise', null);
      }
    });
    return lookup_promise;
  },

  /** Waits for any in-flight English map, then translates remaining labels. */
  _ensure_label_english() {
    var _this = this;
    if(!this._needs_english_lookup()) {
      return RSVP.resolve();
    }
    var pending = this.get('_label_english_lookup_promise');
    var wait = pending ? RSVP.resolve(pending) : RSVP.resolve();
    return wait.then(function() {
      return _this._lookup_label_english();
    }, function() {
      return _this._lookup_label_english();
    });
  },

  /** Translate the board name to English once, for the translations blob. */
  _ensure_board_name_english() {
    var _this = this;
    if(!this._needs_english_lookup()) {
      return RSVP.resolve();
    }
    var name = (this.get('model.name') || '').trim();
    if(!name) {
      return RSVP.resolve();
    }
    if(this.get('_board_name_english')) {
      return RSVP.resolve();
    }
    var source = this._authoring_locale_root();
    var gen = this._authoring_locale_gen || 0;
    return persistence.ajax('/api/v1/users/self/translate', {
      type: 'POST',
      data: {
        words: [name],
        source_lang: source,
        destination_lang: 'en'
      }
    }).then(function(data) {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      if((_this._authoring_locale_gen || 0) !== gen) { return; }
      if(_this._authoring_locale_root() !== source) { return; }
      var trans = (data && data.translations) || {};
      var english = trans[name] || trans[name.toLowerCase()];
      _this.set('_board_name_english', (english && String(english).trim()) || name);
    }, function() {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      if((_this._authoring_locale_gen || 0) !== gen) { return; }
      _this.set('_board_name_english', name);
    });
  },

  /** When creating for a supervisee, use their locale if the list already
   *  carries one. Otherwise leave the current authoring locale in place. */
  _apply_supervisee_authoring_locale(userId) {
    if(!this.appState.get('feature_flags.english_first_board_generation')) {
      return;
    }
    if(!userId || userId === 'self') {
      this._set_authoring_locale(this.get('preferred_communicator_locale') || 'en');
      return;
    }
    var supers = this.appState.get('sessionUser.known_supervisees') ||
      this.appState.get('currentUser.known_supervisees') || [];
    var match = null;
    for(var i = 0; i < supers.length; i++) {
      var s = supers[i];
      if(s && (s.id === userId || s.user_name === userId)) {
        match = s;
        break;
      }
    }
    var loc = match && (match.locale || (match.preferences && match.preferences.locale));
    if(loc) {
      this._set_authoring_locale(loc);
    }
  },

  /** Set model.locale and drop label-text caches when the 2-letter root
   *  changes. Those maps are keyed only by label, so es "sombrero"→hat
   *  would otherwise be reused after a switch to fr. */
  _set_authoring_locale(loc) {
    var previous = this.get('model.locale');
    var prevRoot = ((previous || 'en').split(/_|-/)[0] || 'en').toLowerCase();
    var nextRoot = ((loc || 'en').split(/_|-/)[0] || 'en').toLowerCase();
    this.set('model.locale', loc);
    if(prevRoot !== nextRoot) {
      this._invalidate_authoring_locale_caches();
    }
  },

  _invalidate_authoring_locale_caches() {
    this._authoring_locale_gen = (this._authoring_locale_gen || 0) + 1;
    this.set('_label_english', {});
    this.set('_board_name_english', null);
    this.set('_label_english_lookup_promise', null);
    this.set('_label_colors', {});
    this.set('_label_images', {});
    this.set('_label_images_lookup_promise', null);
    if((this.get('parsed_labels') || []).length) {
      this._lookup_label_colors();
      this._lookup_label_images();
    }
  },

  /** Per-button + board-name translations for the authoring locale and English. */
  _build_authoring_translations(buttons) {
    if(!this._needs_english_lookup()) {
      return null;
    }
    var list = buttons || [];
    if(list.length === 0) {
      return null;
    }
    var authoring = this.get('model.locale') || this._authoring_locale_root();
    var authoringRoot = this._authoring_locale_root();
    var englishMap = this.get('_label_english') || {};
    var name = (this.get('model.name') || '').trim();
    var translations = {
      default: authoring,
      current_label: authoring,
      current_vocalization: authoring,
      board_name: {}
    };
    if(name) {
      translations.board_name[authoring] = name;
      translations.board_name[authoringRoot] = name;
      var englishName = this.get('_board_name_english');
      if(englishName) {
        translations.board_name.en = englishName;
      }
    }
    list.forEach(function(btn) {
      if(!btn || btn.id == null) { return; }
      var label = btn.label || '';
      var key = label.toLowerCase();
      var english = englishMap[key] || label;
      var entry = {};
      entry[authoringRoot] = { label: label, vocalization: label };
      if(authoring !== authoringRoot) {
        entry[authoring] = { label: label, vocalization: label };
      }
      entry.en = { label: english, vocalization: english };
      translations[String(btn.id)] = entry;
    });
    return translations;
  },

  /** Whenever the parsed labels change, schedule a Fitzgerald color
   *  lookup for any unseen labels. Debounced so we don't hit the API on
   *  every keystroke as the user is typing. */
  _request_label_colors: observer('parsed_labels.[]', function() {
    debounce(this, this._lookup_label_colors, 450);
  }),

  /** Fetches part-of-speech for any labels we haven't seen yet, then
   *  maps each one to a Fitzgerald color from board_detail_keyed_colors.
   *  Cached results stay in _label_colors so re-typing the same word is
   *  instant. */
  _lookup_label_colors() {
    var _this = this;
    if(this.isDestroyed || this.isDestroying) { return; }
    var gen = this._authoring_locale_gen || 0;
    return this._ensure_label_english().then(function() {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      if((_this._authoring_locale_gen || 0) !== gen) { return; }
      var labels = _this.get('parsed_labels') || [];
      var cached = _this.get('_label_colors') || {};
      var seen = {};
      var to_lookup = [];
      labels.forEach(function(l) {
        var key = (l || '').toLowerCase();
        if(!key || seen[key] || Object.prototype.hasOwnProperty.call(cached, key)) { return; }
        seen[key] = true;
        to_lookup.push(key);
      });
      if(to_lookup.length === 0) { return; }
      var palette = LingoLinq.board_detail_keyed_colors || LingoLinq.keyed_colors || [];
      var pos_words = to_lookup.map(function(word) {
        return _this._english_for_label(word);
      });
      persistence.ajax('/api/v1/search/batch_parts_of_speech', {
        type: 'GET',
        data: { words: pos_words.join(',') }
      }).then(function(res) {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        if((_this._authoring_locale_gen || 0) !== gen) { return; }
        var results = (res && res.results) || {};
        var next_map = Object.assign({}, _this.get('_label_colors') || {});
        to_lookup.forEach(function(word, idx) {
          var english = pos_words[idx];
          var data = results[english] || results[word];
          var entry = { fill: null, border: null, type: null };
          if(data && data.types) {
            var picked = pick_aac_color(data.types, palette, english);
            if(picked) {
              entry.fill = picked.color.fill;
              entry.border = picked.color.border;
              entry.type = picked.type;
            }
          }
          // Cache even no-match results so we don't re-query the same word.
          next_map[word] = entry;
        });
        _this.set('_label_colors', next_map);
      }, function() {
        // Fail silently — preview just stays default-colored.
      });
    });
  },

  /** Whenever the parsed labels change, schedule a symbol-image lookup
   *  for any unseen labels. Debounced longer than the color lookup
   *  (700ms vs 450ms) since image search is more expensive on the
   *  server side and the user typically pauses for at least that long
   *  between adding labels. */
  _request_label_images: observer('parsed_labels.[]', function() {
    if(this._label_images_debounce) {
      cancel(this._label_images_debounce);
    }
    this._label_images_debounce = debounce(this, this._lookup_label_images, 700);
  }),

  /** Fetches a symbol image for each unseen label via the existing
   *  `/api/v1/search/symbols` endpoint (same one the live board's
   *  Find-a-Button modal hits). Takes the first non-protected result
   *  for each label and caches the `image_url` in `_label_images`.
   *  Cached results stay across re-renders so re-typing the same word
   *  is instant; cache also caches no-match (image_url: null) so we
   *  don't re-query labels that don't have a match. */
  _lookup_label_images() {
    var _this = this;
    if(this.isDestroyed || this.isDestroying) {
      return RSVP.resolve();
    }
    return this._ensure_label_english().then(function() {
      if(_this.isDestroyed || _this.isDestroying) {
        return RSVP.resolve();
      }
      return _this._lookup_label_images_with_english();
    });
  },

  /** Symbol search after the English map (if any) is ready. Queries
   *  OpenSymbols with the English word and locale=en, then caches
   *  under the authoring-language label key so the preview stays
   *  in the user's language. */
  _lookup_label_images_with_english() {
    var _this = this;
    if(this.isDestroyed || this.isDestroying) {
      return RSVP.resolve();
    }
    var labels = this.get('parsed_labels') || [];
    var cached = this.get('_label_images') || {};
    var seen = {};
    var to_lookup = [];
    labels.forEach(function(l) {
      var key = (l || '').toLowerCase();
      if(!key || seen[key] || Object.prototype.hasOwnProperty.call(cached, key)) { return; }
      seen[key] = true;
      to_lookup.push(key);
    });
    if(to_lookup.length === 0) {
      return RSVP.resolve();
    }
    var search_locale = this._needs_english_lookup() ? 'en' : this._authoring_locale_root();
    var gen = this._authoring_locale_gen || 0;
    // Fire one request per label in parallel — the symbols endpoint is
    // single-word so we can't batch. RSVP.allSettled lets a single
    // 404/timeout not block the rest. Cap the parallel requests at a
    // reasonable number (12 at a time) so we don't flood the server
    // when the user pastes a giant label list.
    var lookup_promise = new RSVP.Promise(function(resolve) {
      var BATCH_SIZE = 12;
      var run_batch = function(start) {
        if(_this.isDestroyed || _this.isDestroying) {
          resolve();
          return;
        }
        var batch = to_lookup.slice(start, start + BATCH_SIZE);
        if(batch.length === 0) {
          resolve();
          return;
        }
        var promises = batch.map(function(word) {
          var query = _this._english_for_label(word);
          return persistence.ajax(
            '/api/v1/search/symbols?q=' + encodeURIComponent(query) +
            '&safe=0&locale=' + encodeURIComponent(search_locale),
            { type: 'GET' }
          ).then(function(results) {
            var pick = (results && results.length) ? results[0] : null;
            return { word: word, image_url: (pick && pick.image_url) || null };
          }, function() {
            // Network/permission errors → cache as null so we don't retry
            // forever. Same pattern as `_lookup_label_colors`.
            return { word: word, image_url: null };
          });
        });
        RSVP.allSettled(promises).then(function(states) {
          if(_this.isDestroyed || _this.isDestroying) {
            resolve();
            return;
          }
          if((_this._authoring_locale_gen || 0) !== gen) {
            resolve();
            return;
          }
          var next_map = Object.assign({}, _this.get('_label_images') || {});
          states.forEach(function(state) {
            if(state.state === 'fulfilled' && state.value && state.value.word) {
              next_map[state.value.word] = { image_url: state.value.image_url };
            }
          });
          _this.set('_label_images', next_map);
          // Notify so preview_grid (which deps on _label_images) re-runs.
          _this.notifyPropertyChange('_label_images');
          run_batch(start + BATCH_SIZE);
        });
      };
      run_batch(0);
    });
    this.set('_label_images_lookup_promise', lookup_promise);
    lookup_promise.finally(function() {
      if(!_this.isDestroyed && !_this.isDestroying && _this.get('_label_images_lookup_promise') === lookup_promise) {
        _this.set('_label_images_lookup_promise', null);
      }
    });
    return lookup_promise;
  },

  /** Waits for any in-flight or debounced symbol lookups before save.
   *  Applies to manual (non-AI) and AI board create — same preview path.
   *  Also waits for manual image drops still uploading so Create cannot
   *  bake before the hosted URL lands in `_label_images`.
   *  Waits for an in-flight lookup to finish before flushing so save
   *  does not fire duplicate /api/v1/search/symbols requests. */
  _ensure_label_images_before_save() {
    var _this = this;
    if(this._label_images_debounce) {
      cancel(this._label_images_debounce);
      this._label_images_debounce = null;
    }
    var pending_uploads = (this._pending_label_image_uploads || []).slice();
    var wait_uploads = pending_uploads.length
      ? RSVP.allSettled(pending_uploads)
      : RSVP.resolve();
    var pending = this.get('_label_images_lookup_promise');
    var wait = pending ? RSVP.resolve(pending) : RSVP.resolve();
    return this._ensure_label_english().then(function() {
      return RSVP.allSettled([wait_uploads, wait, _this._ensure_board_name_english()]);
    }).then(function() {
      return _this._lookup_label_images();
    }, function() {
      return _this._lookup_label_images();
    });
  },

  /** Bakes preview state into model.buttons and persists the board.
   *  Must be a component method (not an action) — saveBoard calls it
   *  from an RSVP callback after symbol lookups finish. */
  _completeSaveBoard() {
    var _this = this;
    // Bake any manually-painted colors into a `buttons[]` array + a
    // populated `grid.order`. Server-side `Board#process_buttons` only
    // calls `populate_buttons_from_labels` when `buttons.length == 0`
    // (see app/models/board.rb#L774), so providing buttons here means
    // the painted `background_color`/`border_color` values persist on
    // creation. We mirror the row/col math from `cellDragStart` so the
    // user's labels_order choice is honored. Bakes BOTH user-applied
    // paint AND POS auto-colors so what the user sees in the preview
    // is what they get on the saved board (otherwise the preview's
    // green-verb / yellow-pronoun coloring would vanish on save and
    // every button would render with the default white background).
    var painted = this.get('_painted_colors') || {};
    var auto_colors = this.get('_label_colors') || {};
    var label_images = this.get('_label_images') || {};
    var has_painted = Object.keys(painted).length > 0;
    var has_auto = Object.keys(auto_colors).some(function(k) {
      var c = auto_colors[k];
      return c && c.fill;
    });
    var has_images = Object.keys(label_images).some(function(k) {
      var i = label_images[k];
      return i && i.image_url;
    });
    var needs_trans = this._needs_english_lookup() && (this.get('parsed_labels') || []).length > 0;
    if(has_painted || has_auto || has_images || needs_trans) {
      var labels = this.get('parsed_labels') || [];
      var rows = parseInt(this.get('model.grid.rows'), 10) || 0;
      var cols = parseInt(this.get('model.grid.columns'), 10) || 0;
      var labels_order = this.get('model.grid.labels_order') || 'rows';
      var buttons = [];
      var grid_order = [];
      for(var rr = 0; rr < rows; rr++) {
        var grid_row = [];
        for(var cc = 0; cc < cols; cc++) { grid_row.push(null); }
        grid_order.push(grid_row);
      }
      labels.forEach(function(label, idx) {
        var btn = {
          id: idx + 1,
          label: label,
          // suggest_symbol stays true only when we DON'T have a
          // previewed image for this label — otherwise the server's
          // post-create image-search would replace our chosen image.
          // With a real image_url present, we lock it in.
          suggest_symbol: true,
          hidden: false,
          hide_label: false
        };
        var key = (label || '').toLowerCase();
        // Paint takes precedence over POS auto-color (mirrors the
        // preview's `bg_style` resolution and the live board-detail
        // page's button.background_color > pick_aac_color order).
        var color = painted[key] || auto_colors[key];
        if(color && color.fill) {
          btn.background_color = color.fill;
          if(color.border) { btn.border_color = color.border; }
          var pos = color.part_of_speech || color.type;
          if(pos) { btn.part_of_speech = pos; }
        }
        // Bake in the previewed symbol image so the saved board
        // uses what the user actually saw — without this the server
        // would re-search and might pick a different first result.
        // Bake the URL (NOT image_id): the server's process_client_supplied_images
        // turns it into a fresh PUBLIC board-owned ButtonImage and caches it via
        // map_images. Linking the drop's private standalone image by id renders
        // blank on the board page — see _applyDroppedImageToLabel.
        var img = label_images[key];
        if(img && img.image_url) {
          btn.image_url = img.image_url;
          btn.suggest_symbol = false;
        }
        buttons.push(btn);
        var row, col;
        if(labels_order === 'columns') {
          col = Math.floor(idx / rows);
          row = idx % rows;
        } else {
          row = Math.floor(idx / cols);
          col = idx % cols;
        }
        if(row < rows && col < cols) {
          grid_order[row][col] = btn.id;
        }
      });
      this.set('model.buttons', buttons);
      // Pre-populated grid.order tells the server "buttons are placed,
      // don't auto-place" — combined with `buttons.length > 0` it
      // also bypasses the populate_from_labels path.
      this.set('model.grid.order', grid_order);
      var translations = this._build_authoring_translations(buttons);
      if(translations) {
        this.set('model.translations', translations);
      }
    }
    this.get('model').save().then(function(board) {
      board.set('button_locale', board.get('locale'));
      _this.appState.set('label_locale', board.get('locale'));
      _this.appState.set('vocalization_locale', board.get('locale'));
      _this.set('status', null);
      /* Invalidate Mine-list snapshot so /boards re-queries after create. */
      try {
        var ownerId = _this.get('model.for_user_id') ||
          (_this.appState.get('currentUser.id')) ||
          (_this.appState.get('currentUser._actual_id'));
        if (ownerId && ownerId !== 'self') { boardsPageListCache.clear(ownerId); }
        var selfId = _this.appState.get('currentUser.id') || _this.appState.get('currentUser._actual_id');
        if (selfId) { boardsPageListCache.clear(selfId); }
      } catch (e) { /* non-critical */ }
      modalUtil.close(true);
      editManager.auto_edit(board.get('id'));
      _this.appState.set('referenced_board', {id: board.get('id'), key: board.get('key')});
      var key = board.get('key') || '';
      var parts = key.split('/');
      var transition = function() {
        // Debounced "Preparing your Board" mask for the post-create board load.
        _this.appState.arm_board_load_overlay(_this.get('router'));
        if (parts.length >= 2) {
          _this.get('router').transitionTo('user.board-detail', parts[0], parts.slice(1).join('/'));
        } else {
          _this.get('router').transitionTo('board', key);
        }
      };
      // Both languages are already on the create payload when the user
      // authored in a non-English locale. Do not open translation-select.
      transition();
    }, function() {
      _this.set('status', {error: true});
    });
  },

  /** Resolves the user's button_style pref into a CSS font-family string
   *  and an optional text-transform (caps/lowercase variants). Mirrors
   *  controllers/user/board-detail.js:1262 so the preview honors the same
   *  font choices as the live page. */
  button_font_style: computed('appState.sessionUser.preferences.device.button_style', function() {
    var style = this.appState.get('sessionUser.preferences.device.button_style') || 'default';
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
    var transform = 'none';
    if(style && style.match(/_caps$/))  { transform = 'uppercase'; }
    if(style && style.match(/_small$/)) { transform = 'lowercase'; }
    return {
      family: fonts[style] || 'inherit',
      transform: transform
    };
  }),

  preview_style: computed(
    'model.grid.columns', 'model.grid.rows',
    'button_text_size_px', 'button_spacing_px', 'button_border_px',
    'button_font_style.family', 'button_font_style.transform',
    function() {
      var cols = parseInt(this.get('model.grid.columns'), 10) || 1;
      var rows = parseInt(this.get('model.grid.rows'), 10) || 1;
      cols = Math.max(1, Math.min(20, cols));
      rows = Math.max(1, Math.min(20, rows));
      var font = this.get('button_font_style') || {};
      return htmlSafe(
        '--preview-cols: ' + cols + '; --preview-rows: ' + rows +
        '; --board-columns: ' + cols + '; --board-rows: ' + rows +
        '; --bd-button-text-size: ' + this.get('button_text_size_px') + 'px' +
        '; --bd-button-gap: ' + this.get('button_spacing_px') + 'px' +
        '; --bd-button-border: ' + this.get('button_border_px') + 'px' +
        '; --bd-button-font: ' + (font.family || 'inherit') +
        '; --bd-button-text-transform: ' + (font.transform || 'none')
      );
    }
  ),

  too_many_labels: computed('label_count', 'model.grid.rows', 'model.grid.columns', function() {
    return (this.get('label_count') || 0) > (parseInt(this.get('model.grid.rows'), 10) * parseInt(this.get('model.grid.columns'), 10));
  }),

  duplicate_labels: computed('model.grid.labels', function() {
    var str = this.get('model.grid.labels') || '';
    if(typeof str !== 'string') { str = '' + str; }
    var labels = str.split(/\n|,/).map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
    var counts = {};
    labels.forEach(function(l) {
      var key = (l || '').toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.keys(counts).filter(function(key) { return counts[key] > 1; });
  }),

  has_duplicate_labels: computed('model.grid.labels', function() {
    return (this.get('duplicate_labels') || []).length > 0;
  }),

  duplicate_label_count: computed('model.grid.labels', function() {
    return (this.get('duplicate_labels') || []).length;
  }),

  MAX_GRID_LABELS: 400,
  MAX_CSV_BYTES: 1024 * 1024,
  MAX_LABEL_LENGTH: 80,

  _parse_csv: function(text) {
    var rows = [];
    var row = [];
    var field = '';
    var in_quotes = false;
    for(var i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      if(in_quotes) {
        if(c === '"') {
          if(text.charAt(i + 1) === '"') { field += '"'; i++; }
          else { in_quotes = false; }
        } else {
          field += c;
        }
      } else {
        if(c === '"') { in_quotes = true; }
        else if(c === ',') { row.push(field); field = ''; }
        else if(c === '\r') { /* swallow — handled by \n */ }
        else if(c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else { field += c; }
      }
    }
    if(field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    return rows;
  },

  _sanitize_label: function(raw) {
    if(raw == null) { return ''; }
    var s = ('' + raw);
    var sanitized = '';
    for(var i = 0; i < s.length; i++) {
      var code = s.charCodeAt(i);
      sanitized += ((code >= 0 && code <= 31) || code === 127) ? ' ' : s.charAt(i);
    }
    s = sanitized;
    s = s.replace(/<[^>]*>/g, '');
    s = s.replace(/^[=+\-@\t\r ]+/, '');
    s = s.trim();
    if(s.length > this.get('MAX_LABEL_LENGTH')) {
      s = s.slice(0, this.get('MAX_LABEL_LENGTH'));
    }
    return s;
  },

  too_many_total_labels: computed('label_count', function() {
    return (this.get('label_count') || 0) > this.get('MAX_GRID_LABELS');
  }),

  unused_label_count: computed('label_count', function() {
    var n = (this.get('label_count') || 0);
    var max = this.get('MAX_GRID_LABELS');
    return n > max ? (n - max) : 0;
  }),

  max_grid_labels: computed(function() {
    return this.get('MAX_GRID_LABELS');
  }),

  labels_class: computed('too_many_labels', function() {
    var res = "label_count ";
    if(this.get('too_many_labels')) {
      res = res + "too_many ";
    }
    return res;
  }),

  labels_order_list: [
    {name: i18n.t('columns_first', "Populate buttons in columns, left to right"), id: "columns"},
    {name: i18n.t('rows_first', "Populate buttons in rows, top to bottom"), id: "rows"}
  ],

  remember_labels_order: observer('model.grid.labels_order', function() {
    if(this.get('model.grid.labels_order')) {
      this.stashes.persist('new_board_labels_order', this.get('model.grid.labels_order'));
    }
  }),

  // Auto-fit grid to label count: pick the most-square shape that holds
  // every label (cols >= rows for a slight landscape lean). Recomputes on
  // every label change; manual stepper edits hold until the next change.
  // Skipped while the user is mid-edit (preserves the inline-edit input).
  autoFitGrid: observer('model.grid.labels', function() {
    if(this.get('_editIdx') !== null && this.get('_editIdx') !== undefined) { return; }
    var n = (this.get('parsed_labels') || []).length;
    if(n === 0) { return; }
    var cols = Math.min(20, Math.max(1, Math.ceil(Math.sqrt(n))));
    var rows = Math.min(20, Math.max(1, Math.ceil(n / cols)));
    if(this.get('model.grid.columns') !== cols) {
      this.set('model.grid.columns', cols);
    }
    if(this.get('model.grid.rows') !== rows) {
      this.set('model.grid.rows', rows);
    }
  }),

  speech_enabled: computed('speech', function() {
    return !!this.get('speech');
  }),

  key_placeholder: computed(function() {
    return i18n.t('board_key_placeholder', 'board-key');
  }),

  updatePreview: observer('model.grid.rows', 'model.grid.columns', function() {
    this.set('previewRows', this.get('model.grid.rows'));
    this.set('previewColumns', this.get('model.grid.columns'));
  }),

  updateShowGrid: function() {
    var grid = [];
    var maxRows = 6, maxColumns = 12;
    var previewEnabled = this.get('previewRows') <= maxRows && this.get('previewColumns') <= maxColumns;
    for(var idx = 1; idx <= maxRows; idx++) {
      var row = [];
      for(var jdx = 1; jdx <= maxColumns; jdx++) {
        var preview = (previewEnabled && idx <= this.get('previewRows') && jdx <= this.get('previewColumns'));
        row.push({
          row: idx,
          column: jdx,
          preview: preview,
          preview_class: "cell " + (preview ? "preview" : "")
        });
      }
      grid.push(row);
    }
    this.set('showGrid', grid);
  },

  updateShow: observer('previewRows', 'previewColumns', function() {
    this.updateShowGrid();
  }),

  // ── External image drag-and-drop onto a preview tile ────────────────────────
  // Mirrors the board-detail edit-mode flow (content_grabbers.content_dropped →
  // apply_dropped_image_to_button): drag an image file (or an image from another
  // tab) onto a button and it becomes that button's symbol in place. The board
  // doesn't exist yet, so instead of editManager.change_button we reuse the SAME
  // upload primitive board-detail uses (pictureGrabber.save_image_preview) and
  // write the persisted URL into our label-keyed `_label_images` map — the same
  // map the symbol search fills, which preview_grid renders from and
  // _completeSaveBoard bakes into model.buttons[]. So the dropped image shows
  // immediately AND persists on Create.

  /** Drag payload types as a plain array (`dataTransfer.types` is a
   *  DOMStringList in some browsers). */
  _dragTypes: function(dataTransfer) {
    var types = (dataTransfer && dataTransfer.types) || [];
    return Array.prototype.slice.call(types);
  },

  /** True when a drag carries an external image — a real image File, or (during
   *  dragover, when files aren't yet readable) the `Files` type, or an image
   *  dragged from another tab (`text/uri-list`). Internal tile-reorder drags
   *  carry only `text/plain` (the source index), so they return false and fall
   *  through to the swap logic. */
  _dragHasImage: function(dataTransfer) {
    if(!dataTransfer) { return false; }
    if(dataTransfer.files && dataTransfer.files.length) {
      for(var i = 0; i < dataTransfer.files.length; i++) {
        var f = dataTransfer.files[i];
        if(f && f.type && f.type.match(/^image/)) { return true; }
      }
    }
    var types = this._dragTypes(dataTransfer);
    return types.indexOf('Files') !== -1 || types.indexOf('text/uri-list') !== -1;
  },

  /** Resolve an image URL from a cross-tab/page image drag — `text/uri-list`
   *  (the dragged image's src) or an `<img>` embedded in `text/html`. Mirrors
   *  content_grabbers.content_dropped's items branch. Resolves null when none. */
  _dropped_image_url: function(dataTransfer) {
    var _this = this;
    return new RSVP.Promise(function(resolve) {
      var items = dataTransfer && dataTransfer.items;
      var types = _this._dragTypes(dataTransfer);
      if(!items || !items.length || !types.length) { return resolve(null); }
      var results = {};
      var promises = [];
      var read = function(key, item) {
        return new RSVP.Promise(function(res) {
          try { item.getAsString(function(str) { results[key] = str; res(); }); }
          catch(e) { res(); }
        });
      };
      for(var i = 0; i < types.length; i++) {
        if(types[i] === 'text/uri-list' && items[i]) { promises.push(read('url', items[i])); }
        else if(types[i] === 'text/html' && items[i]) { promises.push(read('html', items[i])); }
      }
      if(!promises.length) { return resolve(null); }
      RSVP.all(promises).then(function() {
        if(!results.url && results.html) {
          var pieces = results.html.split(/<\s*img/);
          if(pieces.length > 1) {
            var m = pieces[1].match(/src\s*=\s*['"]([^'"]+)/);
            if(m && m[1]) { results.url = m[1]; }
          }
        }
        resolve(results.url || null);
      }, function() { resolve(null); });
    });
  },

  /** Upload a dropped image and assign it to `label`'s button in place. Reuses
   *  content_grabbers' read_file + pictureGrabber.save_image_preview (the board-
   *  detail upload pipeline), then stores the persisted URL under the label so
   *  the preview updates and the save bakes it in. */
  _applyDroppedImageToLabel: function(label, dataTransfer) {
    var _this = this;
    var key = (label || '').toLowerCase();
    if(!key || !dataTransfer) { return RSVP.reject(); }
    var image_file = null;
    if(dataTransfer.files && dataTransfer.files.length) {
      for(var i = 0; i < dataTransfer.files.length; i++) {
        var f = dataTransfer.files[i];
        if(!image_file && f && f.type && f.type.match(/^image/)) { image_file = f; }
      }
    }
    var url_promise;
    if(image_file) {
      url_promise = contentGrabbers.read_file(image_file).then(function(data) {
        return data.target.result; // data URL
      });
    } else {
      url_promise = this._dropped_image_url(dataTransfer);
    }
    var upload_promise = url_promise.then(function(url) {
      if(!url) { return RSVP.reject(); }
      var content_type = url.match(/^data:/) ? url.split(/;/)[0].split(/:/)[1] : null;
      // Defense-in-depth: only accept image payloads. Reject a data: URI whose
      // MIME isn't image/* (e.g. data:text/html) before it reaches the upload
      // pipeline or the preview. The server also drops these (ButtonImage), but
      // bailing here keeps the raw payload out of the client entirely.
      //
      // NOTE (security review false-positive): a dropped FILE does NOT bypass this.
      // The File branch above runs it through read_file → reader.readAsDataURL(),
      // which yields `data:<file.type>;…`, so a text/html File becomes
      // `data:text/html;…` and is caught right here by the same MIME check (and
      // again server-side). There is no File path that skips it — and _dragHasImage
      // only treats image-typed Files as images in the first place.
      if(content_type && !content_type.match(/^image\//)) { return RSVP.reject(); }
      // Optimize a user's own image the same way the board-detail upload does:
      // size_image downscales and converts opaque photos to JPEG (~10-15x smaller
      // than PNG), passes http URLs through untouched, and keeps PNG when the source
      // has real transparency. Falls back to the original url if optimization fails.
      return contentGrabbers.pictureGrabber.size_image(url).then(function(sized) {
        return (sized && sized.url) || url;
      }, function() { return url; });
    }).then(function(opt_url) {
      var content_type = opt_url.match(/^data:/) ? opt_url.split(/;/)[0].split(/:/)[1] : null;
      // `suggestion` seeds the saved image's button_label since there's no live
      // button to read it from (save_image_preview falls back to it).
      var preview = { url: opt_url, content_type: content_type, protected: false, suggestion: label };
      return contentGrabbers.pictureGrabber.save_image_preview(preview).then(function(image) {
        if(_this.isDestroyed || _this.isDestroying) { return image; }
        var saved_url = (image && image.get && image.get('url')) || opt_url;
        // Store ONLY the URL (not the saved image's id). On Create the server's
        // process_client_supplied_images turns this URL into a fresh, PUBLIC,
        // board-owned ButtonImage and wires it into the board's image cache
        // (map_images). The standalone record save_image_preview made here is
        // private/unlinked, so referencing it by image_id would show in this
        // preview but render blank on the board page — see LEARNINGS. URL-baking
        // is the deliberate, proven path (matches the symbol-search flow).
        var next_map = Object.assign({}, _this.get('_label_images') || {});
        next_map[key] = { image_url: saved_url };
        _this.set('_label_images', next_map);
        // Re-run preview_grid (deps on _label_images) so the tile updates.
        _this.notifyPropertyChange('_label_images');
        return image;
      });
    });
    // Track so Create can wait for the hosted URL before baking buttons.
    if(!this._pending_label_image_uploads) { this._pending_label_image_uploads = []; }
    this._pending_label_image_uploads.push(upload_promise);
    var clear_pending = function() {
      var list = _this._pending_label_image_uploads || [];
      var idx = list.indexOf(upload_promise);
      if(idx >= 0) { list.splice(idx, 1); }
    };
    upload_promise.then(clear_pending, clear_pending);
    return upload_promise;
  },

  /** Remove the image drag-over highlight from a cell element. */
  _clearCellDropHighlight: function(el) {
    if(el && el.classList) { el.classList.remove('md-board-detail-grid__cell--image-drop'); }
  },

  actions: {
    close: function() {
      if(this.get('standalone')) {
        // Arrived from the board-picker guided-tour modal? Return the user to
        // that modal instead of just the page underneath it. The modal can't be
        // kept open "behind" this page — app_state.global_transition closes every
        // open modal on each route change — so we go back to the board-picker
        // page and RE-OPEN the tour modal. It hosts a fresh live picker (no
        // per-session state), so re-opening lands the user right back where they
        // left off. Captured at init as `from_tour`; the route clears the
        // appState flag on deactivate so a normal (non-tour) visit is unaffected.
        if(this.get('from_tour')) {
          var r = this.get('router');
          var reopen = function() { modalUtil.open('tour-board-picker', {}); };
          var t = r.transitionTo('board-picker');
          if(t && typeof t.then === 'function') {
            t.then(reopen, reopen);
          } else {
            reopen();
          }
          return;
        }
        var onClose = this.get('onClose');
        if (onClose && typeof onClose === 'function') {
          onClose();
        } else if (window.history && window.history.length > 1) {
          // Return to whichever page the user was on when they opened
          // create-board-new (board picker, dashboard, a board, etc.)
          // rather than always landing them on user.home.
          window.history.back();
        } else {
          // Fallback for direct navigation (bookmark, fresh tab, deep
          // link) where there's no history to walk back.
          var un = this.appState.get('currentUser.user_name');
          var r = this.get('router');
          var st = this.get('store');
          if (un) {
            r.transitionTo('user.home', un);
          } else if (st) {
            st.findRecord('user', 'self').then(function(u) {
              r.transitionTo('user.home', u.get('user_name'));
            });
          } else {
            r.transitionTo('index');
          }
        }
      } else {
        this.get('modal').close();
      }
    },
    importFromHtml: function() {
      if(!this.get('standalone')) {
        this.get('modal').close();
      }
      modalUtil.open('import-from-html');
    },
    importFromJsonBundle: function() {
      if(!this.get('standalone')) {
        this.get('modal').close();
      }
      modalUtil.open('import-from-json-bundle');
    },
    // Legacy entry point — now just switches the page into AI mode
    // instead of opening the old generate-board modal.
    generateWithAi: function() {
      this._requestEnterAiMode();
    },

    request_ai_mode: function() {
      this._requestEnterAiMode();
    },

    /** Segmented mode switch: 'regular' or 'ai'. Import stays its own
     *  button. Leaving AI mode keeps any generated labels so toggling
     *  back and forth doesn't lose work. */
    set_create_mode: function(mode) {
      var to_ai = (mode === 'ai');
      /* LEAVING AI mode must clear what AI produced. `model.ai_generated` is the
         server-signed EU AI Act Art.50(2) provenance marker: left in place, a user who
         switched to regular mode and hand-replaced every label still saved a board that
         is recorded and displayed as AI-generated — a false provenance claim on a
         compliance marker. `ai_labels_generated` is cleared with it so the section
         gating (`!ai_mode || ai_labels_generated`) returns to its regular-mode meaning. */
      if(!to_ai && this.get('ai_mode')) {
        this.set('ai_labels_generated', false);
        if(this.get('model')) { this.set('model.ai_generated', null); }
      }
      this.set('ai_mode', to_ai);
      this.set('ai_generate_error', null);
    },

    /** AI label generation, in-page. Uses the (required) board
     *  description as the prompt, calls the same endpoint the old
     *  generate-board modal used, writes the result into the board's
     *  labels, then reveals the full Size & Labels section. */
    generate_labels_with_ai: function() {
      var _this = this;
      if(this.get('ai_generating')) { return; }
      if(persistence && persistence.get && !persistence.get('online')) {
        this.set('ai_generate_error', i18n.t('generate_requires_online', "AI board generation requires an Internet connection."));
        return;
      }
      var prompt = (this.get('model.description') || '').trim();
      if(!prompt) {
        this.set('ai_generate_error', i18n.t('ai_description_required', "Add a description above — it's what the AI uses to generate labels."));
        return;
      }
      this.set('ai_generate_error', null);
      return this._ensureAiBoardGenerationAccess().then(function(access) {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        if(!access || !access.proceed) { return; }
        // EU AI Act Article 50(1): first-AI-use gate. BLOCK mode (D-03) -- this is a
        // deliberate, non-time-critical user action, so it is safe to hold the request
        // behind the disclosure modal. Resolves immediately when no acknowledgement is
        // needed (flag off, already acknowledged, out of scope). If the modal is
        // abandoned, this promise never resolves and the request below never fires.
        return article50Gate.presentBlockingGate(_this.get('appState')).then(function() {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        _this.set('ai_generating', true);
        var payload = {
          prompt: prompt,
          rows: parseInt(_this.get('model.grid.rows'), 10) || 2,
          columns: parseInt(_this.get('model.grid.columns'), 10) || 4,
          include_core_words: _this.get('include_core_words'),
          labels_order: _this.get('model.grid.labels_order') || 'columns',
          locale: (_this.get('model.locale') || 'en')
        };
        return persistence.ajax('/api/v1/boards/generate_labels', {
          type: 'POST',
          contentType: 'application/json',
          dataType: 'json',
          data: JSON.stringify(payload)
        }).then(function(res) {
          if(_this.isDestroyed || _this.isDestroying) { return; }
          var labels = (res && res.labels) || '';
          _this.set('model.grid.labels', labels);
          if(res && res.name && !(_this.get('model.name') || '').trim().length) {
            _this.set('model.name', res.name);
          }
          // EU AI Act Article 50(2): carry the signed AI-generation marker onto the board
          // so it rides the save payload and the server can verify + persist it.
          if(res && res.ai_generated) {
            _this.set('model.ai_generated', res.ai_generated);
          }
          _this.set('ai_generating', false);
          _this.set('ai_labels_generated', true);
        }, function(err) {
          if(_this.isDestroyed || _this.isDestroying) { return; }
          var msg = i18n.t('generate_failed', "Generation failed");
          var resp = (err && err.fakeXHR && err.fakeXHR.responseJSON) || (err && err.responseJSON) || null;
          if(resp && resp.error) {
            msg = resp.error;
            if(resp.error_detail) { msg += ' - ' + resp.error_detail; }
          }
          _this.set('ai_generating', false);
          _this.set('ai_generate_error', msg);
        });
      }, function() {
        // Art.50 gate not acknowledged. Fail-closed: no generation request fires.
        // Surface a reason rather than leaving the button looking broken.
        if(_this.isDestroyed || _this.isDestroying) { return; }
        _this.set('ai_generating', false);
        _this.set('ai_generate_error', i18n.t('generate_disclosure_required', "Please review the AI transparency notice before generating a board with AI."));
      });
      });
    },
    opening: function() {
      if (this.get('standalone')) { return; }
      const component = this;
      this.get('modal').setComponent(component);
    },
    closing: function() {
      this.send('stop_recording');
    },
    grid_event: function(action, row, col) {
      this.send(action, row, col);
    },
    plus_minus: function(direction, attribute) {
      var value = parseInt(this.get(attribute), 10);
      if(direction == 'minus') {
        value = value - 1;
      } else {
        value = value + 1;
      }
      value = Math.min(Math.max(1, value), 20);
      this.set(attribute, value);
    },
    /* Set both dimensions at once from <GridSizePicker>. Clamped to the same 1-20
       range `plus_minus` above enforces, so the picker cannot reach a size the
       steppers could not — 20x20 is also the MAX_GRID_LABELS (400) ceiling. */
    setGridSize: function(rows, columns) {
      var clamp = function(value) {
        var n = parseInt(value, 10);
        if (isNaN(n)) { return null; }
        return Math.min(Math.max(1, n), 20);
      };
      var r = clamp(rows);
      var c = clamp(columns);
      if (r === null || c === null) { return; }
      this.set('model.grid.rows', r);
      this.set('model.grid.columns', c);
    },
    setForUserId: function(userId) {
      this.set('model.for_user_id', userId);
      this._apply_supervisee_authoring_locale(userId);
    },
    toggleIncludeCoreWords: function() {
      this.set('include_core_words', !this.get('include_core_words'));
    },
    toggleCreatingForSomeoneElse: function() {
      var newValue = !this.get('creating_for_someone_else');
      this.set('creating_for_someone_else', newValue);
      if(!newValue) {
        // Switching to "No" — board belongs to current user.
        this.set('model.for_user_id', 'self');
        this._apply_supervisee_authoring_locale('self');
      }
    },
    setVisibility: function(value) {
      this.set('model.visibility', value);
    },
    setLocale: function(value) {
      this._set_authoring_locale(value);
    },
    setLabelsOrder: function(value) {
      this.set('model.grid.labels_order', value);
    },
    setLabels: function(value) {
      this.set('model.grid.labels', value);
    },
    cellDragStart: function(row, col, event) {
      var rows = parseInt(this.get('model.grid.rows'), 10) || 0;
      var cols = parseInt(this.get('model.grid.columns'), 10) || 0;
      var order = this.get('model.grid.labels_order') || 'rows';
      var idx = (order === 'columns') ? (col * rows + row) : (row * cols + col);
      // Blank cells can also be drag sources — dragging a blank slot
      // onto a labeled tile pushes the label into the source slot
      // and leaves the target blank. No payload check needed; the
      // source index alone tells cellDrop how to swap.
      if(event && event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        try { event.dataTransfer.setData('text/plain', String(idx)); } catch(e) { }
      }
      this.set('_dragSourceIdx', idx);
    },
    cellDragOver: function(row, col, event) {
      // Stop propagation so the global file-drop handler (used for board file
      // imports) doesn't see this and treat our chip as a dropped file.
      if(event && event.stopPropagation) { event.stopPropagation(); }
      var dt = event && event.dataTransfer;
      // External image drag: accept ONLY on a labeled cell (images are keyed by
      // label, so a blank tile has nothing to attach to) and show the drop cue.
      if(dt && this._dragHasImage(dt)) {
        var rows = parseInt(this.get('model.grid.rows'), 10) || 0;
        var cols = parseInt(this.get('model.grid.columns'), 10) || 0;
        var order = this.get('model.grid.labels_order') || 'rows';
        var idx = (order === 'columns') ? (col * rows + row) : (row * cols + col);
        var hasLabel = !!((this.get('positional_labels') || [])[idx]);
        if(hasLabel) {
          if(event.preventDefault) { event.preventDefault(); }
          dt.dropEffect = 'copy';
          if(event.currentTarget && event.currentTarget.classList) {
            event.currentTarget.classList.add('md-board-detail-grid__cell--image-drop');
          }
        } else {
          dt.dropEffect = 'none';
        }
        return;
      }
      // Internal tile reorder — accept on any cell (incl. blanks).
      if(event && event.preventDefault) { event.preventDefault(); }
      if(dt) { dt.dropEffect = 'move'; }
    },
    cellDragLeave: function(event) {
      this._clearCellDropHighlight(event && event.currentTarget);
    },
    cellDrop: function(row, col, event) {
      if(event && event.preventDefault) { event.preventDefault(); }
      if(event && event.stopPropagation) { event.stopPropagation(); }
      // External image dropped from the desktop or another tab → set THIS
      // button's image in place (see _applyDroppedImageToLabel). Internal
      // tile-reorder drags carry no image and fall through to the swap below.
      var dt = event && event.dataTransfer;
      if(dt && this._dragHasImage(dt)) {
        this._clearCellDropHighlight(event && event.currentTarget);
        this.set('_dragSourceIdx', null);
        var rowsI = parseInt(this.get('model.grid.rows'), 10) || 0;
        var colsI = parseInt(this.get('model.grid.columns'), 10) || 0;
        var orderI = this.get('model.grid.labels_order') || 'rows';
        var dropIdx = (orderI === 'columns') ? (col * rowsI + row) : (row * colsI + col);
        var dropLabel = (this.get('positional_labels') || [])[dropIdx] || '';
        if(dropLabel) { this._applyDroppedImageToLabel(dropLabel, dt); }
        return;
      }
      var sourceIdx = this.get('_dragSourceIdx');
      if(sourceIdx === null || sourceIdx === undefined) { return; }
      var rows = parseInt(this.get('model.grid.rows'), 10) || 0;
      var cols = parseInt(this.get('model.grid.columns'), 10) || 0;
      var order = this.get('model.grid.labels_order') || 'rows';
      var targetIdx = (order === 'columns') ? (col * rows + row) : (row * cols + col);
      if(sourceIdx === targetIdx) { return; }
      var editIdx = this.get('_editIdx');
      if(editIdx === sourceIdx || editIdx === targetIdx) { return; }
      // Operate on positional_labels so blanks in the middle of the
      // grid keep their position. Pad the array to the larger of
      // (source, target) so a swap involving an out-of-bounds blank
      // position writes an explicit empty string there. After the
      // swap, trim ONLY trailing empties (preserving middle blanks)
      // so the persisted labels string doesn't accumulate trailing
      // blank lines on every drag.
      var labels = (this.get('positional_labels') || []).slice();
      var maxIdx = Math.max(sourceIdx, targetIdx);
      while(labels.length <= maxIdx) { labels.push(''); }
      // Source and target can both be blank; the swap is a no-op only
      // when both are equal strings (which the index check above already
      // rules out for the same-cell case).
      if((labels[sourceIdx] || '') === (labels[targetIdx] || '')) { return; }
      var tmp = labels[sourceIdx];
      labels[sourceIdx] = labels[targetIdx];
      labels[targetIdx] = tmp;
      // Trim trailing empties only — middle blanks stay in place.
      while(labels.length > 0 && labels[labels.length - 1] === '') { labels.pop(); }
      this.set('_dragSourceIdx', null);
      var _this = this;
      var newValue = labels.join('\n');
      // Use View Transitions API for smooth crossfade between old and new cell
      // contents. Falls back to instant update on browsers without support.
      if(typeof document !== 'undefined' && typeof document.startViewTransition === 'function') {
        document.startViewTransition(function() {
          _this.set('model.grid.labels', newValue);
        });
      } else {
        this.set('model.grid.labels', newValue);
      }
    },
    cellDragEnd: function(event) {
      this.set('_dragSourceIdx', null);
      this._clearCellDropHighlight(event && event.currentTarget);
    },
    // Inline-edit a cell's label. Now triggered by DOUBLE-click (the cell's
    // `ondblclick`) — a single click speaks the button (see cellClicked). Paint
    // mode still hijacks the cell: while painting, a single click already applied
    // the color, so the double-click must NOT open inline edit (and must not
    // re-toggle the paint). Editing is also always available via the label chips.
    startCellEdit: function(idx, event) {
      if(event && event.stopPropagation) { event.stopPropagation(); }
      var labels = this.get('parsed_labels') || [];
      if(idx >= labels.length || !labels[idx]) { return; }
      if(this.get('paint_mode')) { return; }
      this.set('_editIdx', idx);
      this.set('_editValue', labels[idx]);
      var _this = this;
      next(function() {
        var elt = document.getElementById('new-board-cell-edit-' + idx);
        if(elt) {
          elt.focus();
          try { elt.select(); } catch(e) { }
        }
      });
    },
    cellEditChanged: function(value) {
      this.set('_editValue', value);
    },
    commitCellEdit: function() {
      var idx = this.get('_editIdx');
      if(idx === null || idx === undefined) { return; }
      var labels = (this.get('parsed_labels') || []).slice();
      var newValue = (this.get('_editValue') || '').trim();
      if(newValue.length === 0) {
        labels.splice(idx, 1);
      } else {
        labels[idx] = newValue;
      }
      this.set('_editIdx', null);
      this.set('_editValue', '');
      this.set('model.grid.labels', labels.join('\n'));
    },
    cancelCellEdit: function() {
      this.set('_editIdx', null);
      this.set('_editValue', '');
    },
    /** Removes the label at `idx` from the labels list. Mirrors
     *  label-chips' `removeChipAt` action so deleting a chip from the
     *  list and clicking the X on the matching preview card both
     *  splice from the same `parsed_labels` array via
     *  `model.grid.labels`. `event.stopPropagation` prevents the
     *  cell wrapper's drag handlers and the inner label button's
     *  click-to-edit from firing on the same gesture. */
    removeCellAt: function(idx, event) {
      if(event && event.stopPropagation) { event.stopPropagation(); }
      if(event && event.preventDefault) { event.preventDefault(); }
      var labels = (this.get('parsed_labels') || []).slice();
      if(idx < 0 || idx >= labels.length) { return; }
      labels.splice(idx, 1);
      this.set('model.grid.labels', labels.join('\n'));
    },
    /** Cell click handler for the WHOLE card (symbol image + padding + edges +
     *  the label-text button, which forwards here). A single click:
     *    - paint mode ON  → applies the armed color to this button;
     *    - paint mode OFF → speaks the button and appends it to the preview
     *      speak bar, exactly like board-detail speak mode.
     *  Clicks on the X (remove) are ignored here, and a drag never fires `click`
     *  (native HTML5 drag suppresses it), so dragging a button doesn't speak. */
    cellClicked: function(idx, image_url, event) {
      // Defer to the X (remove) button when the user clicked it or any of its
      // descendants (e.g. the SVG inside). The X uses {{action "removeCellAt" ...
      // bubbles=false}}, which Ember dispatches via a root-delegated listener that
      // fires AFTER this bubble-phase onclick — so bubbles=false alone can't
      // suppress this handler, and calling stopPropagation() here would cancel the
      // event before it reaches Ember's root (removeCellAt would never fire). Opt
      // out explicitly instead.
      if(event && event.target && event.target.closest && event.target.closest('.md-board-detail-symbol-card__remove')) {
        return;
      }
      // The 2nd click of a double-click opens inline edit (ondblclick →
      // startCellEdit); don't also speak/paint on it. event.detail is the
      // consecutive-click count (1 = single, ≥2 = part of a double-click).
      if(event && event.detail > 1) { return; }
      var labels = this.get('parsed_labels') || [];
      if(idx < 0 || idx >= labels.length || !labels[idx]) { return; }
      if(this.get('paint_mode')) {
        if(event && event.stopPropagation) { event.stopPropagation(); }
        // SECURITY (adversarial-review false positive — "unsanitized image URLs in paint
        // mode"): paint passes only the LABEL object to paint_button; image_url is never
        // used in the paint path. (And where image_url IS used — the speak-bar chip — it
        // renders via an Ember-escaped, sanitized `<img src>`; see speak_word.)
        this.send('paint_button', labels[idx]);
        return;
      }
      // `image_url` is the cell's resolved (skinned) symbol URL, passed from the
      // template so the speak-bar chip shows the SAME symbol as the button — just
      // like board-detail speak mode's sentence box (it falls back to text-only
      // when there's no symbol or the user chose words-only).
      this.send('speak_word', labels[idx], image_url);
    },
    // ── Preview speak bar (mirrors board-detail speak mode) ──────────────
    // Tapping a grid button appends a { label, image_url } chip to `_speak_words`
    // and speaks it; the speak bar's Speak / Backspace / Clear act on the list.
    speak_word: function(label, image_url) {
      if(!label) { return; }
      var _this = this;
      // SECURITY (adversarial-review false positive — "XSS via image_url in speak_word"):
      // image_url is NOT interpolated into markup here. It's stored on a plain object and
      // the chip renders it via an Ember-escaped, URL-sanitized bound attribute —
      // `<img src={{word.image_url}}>` (create-board-new.hbs ~l.537). Ember HTML-escapes
      // attribute values, so a crafted URL can't break out to inject `onerror=`/`onload=`,
      // and a `javascript:`/`data:` value in an <img src> is inert (browsers never execute
      // script from an image's src). So there is no script-injection path. (image_url is
      // also a resolved symbol URL from the search/board pipeline, not raw free text.)
      var entry = { label: label, image_url: image_url || null };
      var words = (this.get('_speak_words') || []).slice();
      words.push(entry);
      this.set('_speak_words', words);
      try { speecher.speak_text(label); } catch(e) { /* speech is best-effort */ }
      // Don't let the bar bleed into the action buttons or scroll: once the
      // newly-added chip pushes the content past the bar's width (or wraps to a
      // second line), reset the bar to just this latest word so the user keeps
      // building from a clean line. Measured AFTER the chip renders.
      scheduleOnce('afterRender', this, function() {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        // This component is tagless (tagName ''), so there's no `this.element` to
        // scope the lookup to — and `.md-board-detail-sentence-bar__text` is also
        // used by board-detail's own speak bar. Anchor the query to the
        // create-board-only preview row (`.nb-preview-sentence-row`) so a
        // board-detail sentence bar elsewhere in the DOM can never be measured.
        //
        // Adversarial-review false positive ("global query bleeds across routes" /
        // "overlapping renders / modal-within-modal could measure the second element"):
        // `.nb-preview-sentence-row` exists ONLY in this template (create-board-new.hbs)
        // and create-board-new is a single route-level page/modal — there is never a
        // second instance, and board-detail's speak bar does NOT have this ancestor, so
        // the anchored descendant query cannot match it. There is no FastBoot/SSR in this
        // app (Ember SPA), so no nested-outlet double-render either. The product UX never
        // stacks a second create-board-new (you don't open the create-board modal while
        // already on the /create-board-new page), so there is never a 2nd
        // `.nb-preview-sentence-row` for querySelector to pick the wrong one of. And even
        // in that hypothetical, the worst case is benign: it resets THIS throwaway
        // create-board PREVIEW bar, never a real Speak-Mode utterance.
        var el = document.querySelector('.nb-preview-sentence-row .md-board-detail-sentence-bar__text');
        if(!el) { return; }
        if(el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) {
          _this.set('_speak_words', [entry]);
        }
      });
    },
    speak_sentence: function() {
      var words = this.get('_speak_words') || [];
      if(!words.length) { return; }
      var text = words.map(function(w) { return w.label; }).join(' ');
      try { speecher.speak_text(text); } catch(e) { /* best-effort */ }
    },
    speak_backspace: function() {
      var words = (this.get('_speak_words') || []).slice();
      if(!words.length) { return; }
      words.pop();
      this.set('_speak_words', words);
    },
    speak_clear: function() {
      this.set('_speak_words', []);
    },
    // "Continue Anyway" on the ≤1024px landscape-rotate overlay — dismiss it for the
    // rest of the SESSION, app-wide (accessibility escape for mounted / non-rotatable
    // setups). Adds nb-orientation-overlay--dismissed, which beats the media query.
    // Previously this reset on every re-entry to the page; a user who had already said
    // "Continue Anyway" still met the same overlay on the next visit and on other
    // pages. The session flag lives in service:overlay-dismissals; it is still not
    // persisted across a reload, so a genuinely new visit re-evaluates the device.
    //
    // Adversarial-review note ("a11y: SR users trapped if they can't rotate"): not a
    // trap — this is a real, keyboard/SR-reachable <button> that fully removes the
    // overlay, and it is present on EVERY visit, so a non-rotatable user is never stuck.
    // Re-showing on a later visit (vs. persisting the dismissal) is intentional: the
    // orientation may differ next time; the escape is always one button away. (Persisting
    // the dismissal to a preference is a possible future nicety, not an a11y blocker.)
    dismiss_orientation_overlay: function() {
      this.set('orientation_overlay_dismissed', true);
      // Session-wide, every page — see service:overlay-dismissals.
      this.get('overlay_dismissals').dismiss('rotate_device');
    },
    // ── Create-method chooser actions ──────────────────────────────────
    // "Create My Own Board" → the regular create-board form (dismiss the chooser;
    // ensure we're not in AI mode).
    choose_create_own: function() {
      this.send('set_create_mode', 'regular');
      this.set('via_create_own', true);
      this.set('show_create_chooser', false);
    },
    // "Import Board(s)" → open the native board-file picker (#board_upload is
    // always rendered behind the chooser; content-grabbers.js handles the upload
    // on change). Clicked synchronously so it stays inside the user gesture.
    choose_paste_html: function() {
      this.set('via_create_own', false);
      this.set('show_create_chooser', false);
      this.send('importFromHtml');
    },
    choose_json_bundle: function() {
      this.set('via_create_own', false);
      this.set('show_create_chooser', false);
      this.send('importFromJsonBundle');
    },
    choose_import: function() {
      this.set('via_create_own', false);
      this.set('show_create_chooser', false);
      // Adversarial-review false positive ("#board_upload may not be rendered yet"): the
      // hidden <input id="board_upload"> (create-board-new.hbs ~l.125) renders whenever
      // `standalone && !ai_mode`, and the chooser's Import option is ONLY reachable in
      // !ai_mode (choosing "Generate with AI" sets ai_mode AND closes the chooser;
      // reopening via "Other Methods" runs set_create_mode('regular') -> ai_mode false).
      // So the input is always present in the DOM (behind the chooser overlay) at this
      // point. The `if(el)` guard then makes a missing element a safe no-op rather than a
      // crash. The click MUST stay synchronous in this user-gesture handler — deferring to
      // afterRender would put it outside the gesture and browsers would block the file
      // dialog — so we intentionally do not poll/retry.
      var el = document.getElementById('board_upload');
      if(el) { el.click(); }
    },
    // "Generate with AI" → opt-in popup if needed, then the in-page AI flow.
    choose_ai: function() {
      this._requestEnterAiMode();
    },
    // "Other Create Board Methods" (regular form) → reopen the chooser so the
    // user can switch to Import / Generate with AI.
    open_create_chooser: function() {
      this.send('set_create_mode', 'regular');
      this.set('via_create_own', false);
      this.set('show_create_chooser', true);
    },
    cellEditKeydown: function(event) {
      var key = event.key;
      if(key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        this.send('commitCellEdit');
      } else if(key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.send('cancelCellEdit');
      }
    },

    // ── Paint mode (mirrors board-detail) ──
    // The paint feature lets the user manually override a button's
    // background/border color. State lives in `_painted_colors` (label-
    // lower → {fill, border, part_of_speech}) so the override follows the
    // label through drag-reorder. The `saveBoard` action bakes these into
    // `model.buttons[]` + `model.grid.order` so the server persists the
    // colors without having to re-paint after creation.
    /** The palette button is dual-purpose:
     *   - When paint_mode is OFF, clicking opens the swatch dropdown.
     *   - When paint_mode is ON, clicking exits paint mode (and closes
     *     the dropdown / custom-color picker if either are open).
     *  This collapses the previous "open dropdown" + separate exit-X
     *  button into one affordance, mirroring how the palette pill
     *  itself is the activation/deactivation control. */
    toggle_paint_dropdown: function() {
      // Collapse a duplicate toggle from one modal click (same fix as bound-select.js).
      var now = (window.performance && performance.now) ? performance.now() : Date.now();
      if (this._lastPaintDropdownToggle != null && (now - this._lastPaintDropdownToggle) < 250) { return; }
      this._lastPaintDropdownToggle = now;
      if(this.get('paint_mode')) {
        this.send('clear_paint_mode');
        this.set('show_paint_dropdown', false);
        return;
      }
      this.toggleProperty('show_paint_dropdown');
      if(!this.get('show_paint_dropdown')) {
        this.set('show_paint_color_picker', false);
      }
    },
    set_paint_mode: function(fill, border, part_of_speech, label) {
      this.set('show_paint_dropdown', false);
      this.set('show_paint_color_picker', false);
      if(!fill) { return; }
      var fill_tc = window.tinycolor ? window.tinycolor(fill) : null;
      var border_tc = border && window.tinycolor ? window.tinycolor(border) :
                      (fill_tc ? window.tinycolor(fill_tc.toRgb()).darken(30) : null);
      this.set('paint_mode', {
        fill: fill_tc ? fill_tc.toRgbString() : fill,
        border: border_tc ? border_tc.toRgbString() : (border || fill),
        part_of_speech: part_of_speech,
        // Human-readable name of the picked color (the swatch's POS label, e.g.
        // "Pronoun"/"Verb", or "Custom" for a hand-picked hex) — surfaced above
        // the palette swatch so the user can see which preset they selected.
        label: label || null
      });
    },
    clear_paint_mode: function() {
      this.set('paint_mode', null);
      this.set('show_paint_color_picker', false);
    },
    /** Applies the currently-armed paint color to a label. Keyed by
     *  label.toLowerCase() so duplicates share the color and reorder
     *  preserves it. Clicking again with the same color toggles the
     *  paint off (reverts to POS auto-color), matching the live board's
     *  click-to-toggle behavior. Triggers a manual notify so the
     *  `_painted_colors` dep on `preview_grid` re-runs. */
    paint_button: function(label) {
      if(!label) { return; }
      var pm = this.get('paint_mode');
      if(!pm || !pm.fill) { return; }
      var key = (label || '').toLowerCase();
      var painted = Object.assign({}, this.get('_painted_colors') || {});
      var existing = painted[key];
      if(existing && existing.fill === pm.fill) {
        delete painted[key];
      } else {
        painted[key] = { fill: pm.fill, border: pm.border, part_of_speech: pm.part_of_speech };
      }
      this.set('_painted_colors', painted);
      this.notifyPropertyChange('_painted_colors');
    },
    toggle_paint_color_picker: function() {
      var now = (window.performance && performance.now) ? performance.now() : Date.now();
      if (this._lastPaintColorPickerToggle != null && (now - this._lastPaintColorPickerToggle) < 250) { return; }
      this._lastPaintColorPickerToggle = now;
      this.toggleProperty('show_paint_color_picker');
    },
    update_custom_paint_color: function(value) {
      this.set('custom_paint_color', value);
    },
    apply_custom_paint_color: function() {
      var color = (this.get('custom_paint_color') || '').trim();
      if(!color) { return; }
      // Defense-in-depth: the swatch comes from <input type="color"> (browser-
      // enforced hex), but the paired hex text field is hand-editable — only
      // apply a value the browser parses as a bare CSS color so it can't smuggle
      // extra declarations into a painted button's inline style.
      if(window.CSS && window.CSS.supports && !window.CSS.supports('color', color)) { return; }
      this.send('set_paint_mode', color, null, null, i18n.t('paint_color_custom', "Custom"));
    },

    previewDragOver: function(event) {
      // Keep dropEffect consistent across the entire preview (cells + gaps),
      // so the cursor doesn't flicker between "move" and "no-drop" as the
      // user drags between cells.
      if(event && event.preventDefault) { event.preventDefault(); }
      if(event && event.stopPropagation) { event.stopPropagation(); }
      if(event && event.dataTransfer) { event.dataTransfer.dropEffect = 'move'; }
    },
    previewDrop: function(event) {
      // Drops on the container (gaps, empty zones) are no-ops; we only consume
      // the event so it doesn't bubble to the global file-drop handler.
      if(event && event.preventDefault) { event.preventDefault(); }
      if(event && event.stopPropagation) { event.stopPropagation(); }
      this.set('_dragSourceIdx', null);
    },
    more_options: function() {
      this.toggleProperty('more_options');
    },
    toggleIconPicker: function() {
      this.toggleProperty('icon_picker_open');
    },
    togglePreviewMode: function() {
      var next = this.get('preview_mode') === 'dark' ? 'light' : 'dark';
      this.set('preview_mode', next);
      // Remember the choice on the user (single `board_dark_mode` preference, shared
      // with board-detail). Skip the save when the stored value already matches —
      // avoids redundant writes and the last-write-wins race on rapid toggles. Same
      // `device.updated` dirty-flag trick the board-detail save uses (Ember Data
      // under-marks the raw prefs blob). (Cross-tab last-write-wins still possible —
      // inherent/low, accepted; see board-detail `_persist_board_dark_mode`.)
      var nextDark = next === 'dark';
      var user = this.appState.get('currentUser');
      if(user && user.set && !!user.get('preferences.board_dark_mode') !== nextDark) {
        user.set('preferences.board_dark_mode', nextDark);
        user.set('preferences.device.updated', true);
        if(user.save) { user.save().then(null, function() {}); }
      }
    },
    // Edit-rail accordion: clicking a section opens it (and closes any
    // other). Clicking the open one closes it. Drives the grid's
    // max-height expansion via the .nb-preview-stage--expanded class.
    toggle_create_rail_section: function(id) {
      // The Paint section header doubles as the paint-mode indicator + toggle:
      // once a color is armed its icon shows the active state (see the
      // --paint-armed class in the template), and clicking the header again turns
      // paint mode OFF and collapses the section — dimming the icon back to
      // neutral. Mirrors the dual-purpose in-section palette button
      // (toggle_paint_dropdown). When paint mode is NOT armed, the header just
      // expands/collapses like every other section.
      if(id === 'paint' && this.get('paint_mode')) {
        this.send('clear_paint_mode');
        this.set('show_paint_dropdown', false);
        this.set('create_rail_open_section', null);
        return;
      }
      if(this.get('create_rail_open_section') === id) {
        this.set('create_rail_open_section', null);
      } else {
        this.set('create_rail_open_section', id);
      }
    },
    // "Back" affordance for the narrow (<=1024px) rail: collapses whatever
    // section is open and returns to the full section list. Unlike the
    // toggle above it never touches paint mode — it's purely navigational.
    close_create_rail_section: function() {
      this.set('create_rail_open_section', null);
    },
    toggleLabelsList: function() {
      this.toggleProperty('labels_list_open');
    },
    pick_core: function() {
      this.send('stop_recording');
      // Toggle: if the core lists are already showing, hide them. Otherwise
      // open them. Lets the same button collapse the panel it opened.
      if(this.get('core_lists')) {
        this.set('core_lists', null);
        this.set('core_words', null);
      } else {
        this.set('core_lists', i18n.get('core_words'));
        this.set('core_words', i18n.core_words_map());
      }
    },
    clearGrid: function() {
      this.set('model.grid.labels', '');
      if(this.get('speech')) {
        this.set('speech.words', []);
      }
      this.set('core_lists', null);
      this.set('core_words', null);
      this.set('_editIdx', null);
      this.set('_editValue', '');
      // On an AI-generation board, clearing the grid resets back to the generate
      // step: dropping ai_labels_generated collapses the labels section (the
      // full-size "Size & Labels" editor is gated on show_full_size_section =
      // !ai_mode || ai_labels_generated) and re-reveals the AI description +
      // Generate UI, so the user can re-generate from their description. Also
      // collapse any open labels list and clear a stale generate error.
      if(this.get('ai_mode')) {
        this.set('ai_labels_generated', false);
        this.set('labels_list_open', false);
        this.set('ai_generate_error', null);
      }
    },
    importCsv: function() {
      var input = document.getElementById('new_board_csv_input');
      if(input) { input.value = ''; input.click(); }
    },
    csvFileChosen: function(event) {
      var _this = this;
      var input = event && event.target;
      var file = input && input.files && input.files[0];
      if(!file) { return; }
      var ext = (file.name || '').toLowerCase().split('.').pop();
      if(ext !== 'csv') {
        modalUtil.warning(i18n.t('csv_only_warning', "Only .csv files are supported."));
        if(input) { input.value = ''; }
        return;
      }
      if(file.size > this.get('MAX_CSV_BYTES')) {
        modalUtil.warning(i18n.t('csv_too_big_warning', "That CSV is over 1MB. Please trim it down and try again."));
        if(input) { input.value = ''; }
        return;
      }
      var reader = new FileReader();
      reader.onload = function(e) {
        var text = (e.target && e.target.result) || '';
        if(typeof text !== 'string') { text = '' + text; }
        var rows = _this._parse_csv(text);
        var max_total = _this.get('MAX_GRID_LABELS');
        var existing = (_this.get('parsed_labels') || []).slice();
        var seen = {};
        existing.forEach(function(l) { seen[(l || '').toLowerCase()] = true; });
        var added = [];
        var skipped_dupes = 0;
        var skipped_empty = 0;
        outer:
        for(var r = 0; r < rows.length; r++) {
          for(var c = 0; c < rows[r].length; c++) {
            var clean = _this._sanitize_label(rows[r][c]);
            if(!clean) { skipped_empty++; continue; }
            var key = clean.toLowerCase();
            if(seen[key]) { skipped_dupes++; continue; }
            seen[key] = true;
            added.push(clean);
            if(existing.length + added.length >= max_total) { break outer; }
          }
        }
        if(input) { input.value = ''; }
        if(added.length === 0) {
          modalUtil.warning(i18n.t('csv_no_labels_found', "No usable labels were found in that CSV."));
          return;
        }
        var merged = existing.concat(added);
        _this.set('model.grid.labels', merged.join('\n'));
        var msg = i18n.t('csv_import_success', "Added %{n} label(s) from CSV.", {n: added.length});
        if(skipped_dupes > 0 || skipped_empty > 0) {
          msg += ' ' + i18n.t('csv_import_skipped', "(skipped %{d} duplicate, %{e} blank)", {d: skipped_dupes, e: skipped_empty});
        }
        modalUtil.notice(msg);
      };
      reader.onerror = function() {
        modalUtil.warning(i18n.t('csv_read_failed', "Could not read that file."));
        if(input) { input.value = ''; }
      };
      reader.readAsText(file);
    },
    speech_content: function(str) {
      this.send('add_recorded_word', str);
    },
    speech_error: function(err) {
      // 'no-speech' fires routinely when the user pauses; not a real error.
      // 'aborted' fires when we deliberately stop the engine.
      var code = err && err.error;
      if(code === 'no-speech' || code === 'aborted') {
        return;
      }
      this.set('speech.ready', false);
      var msg;
      if(code === 'not-allowed' || code === 'service-not-allowed') {
        msg = i18n.t('speech_error_permission', "Microphone access was blocked. Allow microphone access in your browser settings to use speech recognition.");
      } else if(code === 'audio-capture') {
        msg = i18n.t('speech_error_no_mic', "No microphone was found. Connect one and try again.");
      } else if(code === 'network') {
        msg = i18n.t('speech_error_network', "Speech recognition service is unavailable. Check your internet connection and try again.");
      } else {
        msg = i18n.t('speech_error_generic', "Speech recognition stopped. Please try again.");
      }
      this.set('speech_error_message', msg);
    },
    speech_stop: function() {
      this.set('speech.ready', false);
    },
    dismiss_speech_error: function() {
      this.set('speech_error_message', null);
    },
    record_words: function() {
      this.set('speech_error_message', null);
      this.set('speech.ready', true);
    },
    stop_recording: function() {
      if(this.get('speech') && this.get('speech.engine')) {
        this.set('speech.resume', false);
        this.get('speech.engine').abort();
      }
      if(this.get('speech')) {
        this.set('speech.recording', false);
        this.set('speech.ready', false);
        this.set('speech.almost_recording', false);
      }
    },
    next_word: function() {
      if(this.get('speech') && this.get('speech.engine')) {
        this.set('speech.stop_and_resume', true);
      }
    },
    remove_word: function(id) {
      var lines = (this.get('model.grid.labels') || "").split(/\n|,\s*/);
      var words = [].concat(this.get('speech.words') || []);
      var new_words = [];
      var word = {};
      for(var idx = 0; idx < words.length; idx++) {
        if(words[idx].id == id) {
          word = words[idx];
        } else {
          new_words.push(words[idx]);
        }
      }
      var new_lines = [];
      var removed = false;
      for(var idx = 0; idx < lines.length; idx++) {
        if(!lines[idx] || lines[idx].match(/^\s+$/)) {
        } else if(!removed && lines[idx] == word.label) {
          removed = true;
        } else {
          new_lines.push(lines[idx]);
        }
      }
      if(this.get('speech')) {
        this.set('speech.words', new_words);
        this.set('model.grid.labels', new_lines.join("\n"));
      }
    },
    add_recorded_word: function(str) {
      var lines = (this.get('model.grid.labels') || "").split(/\n|,\s*/);
      var words = [].concat(this.get('speech.words') || []);
      var id = Math.random();
      words.push({id: id, label: str});
      var new_lines = [];
      for(var idx = 0; idx < lines.length; idx++) {
        if(!lines[idx] || lines[idx].match(/^\s+$/)) {
        } else {
          new_lines.push(lines[idx]);
        }
      }
      new_lines.push(str);
      if(this.get('speech')) {
        this.set('speech.words', words);
        this.set('model.grid.labels', new_lines.join("\n"));
      }
    },
    enable_word: function(id) {
      var words = this.get('core_words');
      var enabled_words = [];
      var disable_word = null;
      for(var idx = 0; idx < words.length; idx++) {
        if(words[idx].id == id) {
          if(emberGet(words[idx], 'active')) {
            emberSet(words[idx], 'active', false);
            disable_word = words[idx].label;
          } else {
            emberSet(words[idx], 'active', true);
          }
        }
        if(emberGet(words[idx], 'active')) {
          enabled_words.push(words[idx].label);
        }
      }
      var lines = (this.get('model.grid.labels') || "").split(/\n|,\s*/);
      var new_lines = [];
      var word_filter = function(w) { return w != lines[idx]; };
      for(var idx = 0; idx < lines.length; idx++) {
        if(disable_word && lines[idx] == disable_word) {
          disable_word = null;
        } else if(!lines[idx] || lines[idx].match(/^\s+$/)) {
        } else {
          new_lines.push(lines[idx]);
          if(enabled_words.indexOf(lines[idx]) != -1) {
            enabled_words = enabled_words.filter(word_filter);
          }
        }
      }
      for(var idx = 0; idx < enabled_words.length; idx++) {
        new_lines.push(enabled_words[idx]);
      }
      this.set('model.grid.labels', new_lines.join("\n"));
    },
    /** Marks a required field as "touched" once the user has interacted
     *  with it and blurred. Errors only render after this trigger (or
     *  after a submit attempt), so a fresh form never accuses the user
     *  before they've engaged. */
    markFieldTouched: function(field) {
      var touched = Object.assign({}, this.get('_field_touched') || {});
      if(touched[field]) { return; }
      touched[field] = true;
      this.set('_field_touched', touched);
      this.notifyPropertyChange('_field_touched');
    },
    /** Submit-attempt path. Click handler on the visually-disabled
     *  Create button: marks all required fields as "submit-attempted"
     *  so their errors render, focuses the first empty required field
     *  (Stripe / Material 3 pattern), and forwards to saveBoard if
     *  validation passes. The button is left functionally enabled
     *  (`aria-disabled` instead of `disabled`) so this click can fire
     *  even when fields are missing — that's how the user gets
     *  feedback on touch devices where `:hover` doesn't exist. */
    attemptSave: function() {
      if(this.get('createBoardDisabled')) {
        this.set('_submit_attempted', true);
        var ids = this.get('_required_field_ids') || [];
        for(var i = 0; i < ids.length; i++) {
          var elt = document.getElementById(ids[i]);
          if(elt && !(elt.value || '').trim().length) {
            try { elt.focus(); } catch(e) { }
            try { elt.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch(e) { }
            break;
          }
        }
        return;
      }
      this.send('saveBoard');
    },
    saveBoard: function(event) {
      var _this = this;
      var name = (this.get('model.name') || '').trim();
      // Required: name. Description / icon are optional (icon auto-
      // assigns server-side via `Board#check_image_url`). For-user is
      // conditionally required: when the "Yes" toggle is on, the user
      // must pick an actual supervisee. saveBoard's guard mirrors
      // `createBoardDisabled` so Enter-key submits can't bypass the
      // disabled button.
      if (!name.length) {
        this.set('status', {error: true});
        return;
      }
      if(this.get('show_user_options') && this.get('creating_for_someone_else')) {
        var picked = this.get('model.for_user_id');
        if(!picked || picked === 'self') {
          this.set('status', {error: true});
          return;
        }
      }
      this.set('status', {saving: true});
      if(this.get('model.license')) {
        this.set('model.license.copyright_notice_url', LingoLinq.licenseOptions.license_url(this.get('model.license.type')));
      }
      if(this.get('model.home_board')) {
        var cats = [];
        this.get('board_categories').forEach(function(cat) {
          if(cat.selected) {
            cats.push(cat.id);
          }
        });
        this.set('model.categories', cats);
      }
      // Ensure API has an owner: use for_user_id when creating for a supervisee, otherwise 'self' for current user
      var currentUserId = this.appState.get('currentUser.id') || this.appState.get('sessionUser.id');
      if(!this.get('model.for_user_id') && currentUserId) {
        this.set('model.for_user_id', 'self');
      }
      // Wait for symbol previews (manual or AI labels) before baking buttons.
      this._ensure_label_images_before_save().then(function() {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        _this._completeSaveBoard();
      }, function() {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        _this.set('status', {error: true});
      });
    },
    hoverGrid: function(row, col) {
      this.set('previewRows', row);
      this.set('previewColumns', col);
    },
    hoverOffGrid: function() {
      this.set('previewRows', this.get('model.grid.rows'));
      this.set('previewColumns', this.get('model.grid.columns'));
    },
    setGrid: function(row, col) {
      this.set('model.grid.rows', row);
      this.set('model.grid.columns', col);
    },
    pickImageUrl: function(url) {
      this.set('model.image_url', url);
    },

    // ── Display Preferences toolbar actions (ported from board-detail) ──
    // Writes go directly to live appState.sessionUser.preferences and save —
    // there is no pending/Save flow in create-board-new.
    set_display_pref: function(key, value) {
      var user = this.appState.get('sessionUser');
      var path = this._display_prefs_paths[key];
      if(user && path) {
        user.set(path, value);
        user.set('preferences.device.updated', true);
        try { user.save(); } catch(e) { }
      }
    },


    step_display_pref: function(key, direction) {
      var ladders = {
        button_text:     ['small', 'medium', 'large', 'huge'],
        button_border:   ['none', 'small', 'medium', 'large', 'huge'],
        button_spacing:  ['none', 'minimal', 'extra-small', 'small', 'medium', 'large', 'huge']
      };
      var ladder = ladders[key];
      if(!ladder) { return; }
      var current_paths = {
        button_text:    'sessionUser.preferences.device.button_text',
        button_border:  'sessionUser.preferences.device.button_border',
        button_spacing: 'sessionUser.preferences.device.button_spacing'
      };
      var current = this.appState.get(current_paths[key]) || 'medium';
      var idx = ladder.indexOf(current);
      if(idx < 0) { idx = Math.floor(ladder.length / 2); }
      var dir = direction > 0 ? 1 : -1;
      var next_idx = dir > 0 ? Math.min(idx + 1, ladder.length - 1) : Math.max(idx - 1, 0);
      if(next_idx === idx) { return; }
      this.send('set_display_pref', key, ladder[next_idx]);
    },

    toggle_display_font_dropdown: function() {
      this.toggleProperty('display_prefs_font_dropdown_open');
      if(this.get('display_prefs_font_dropdown_open')) {
        this.set('display_prefs_font_filter', '');
        next(function() {
          var input = document.getElementById('nb-font-dropdown-search');
          if(input) { input.focus(); }
        });
      }
    },
    close_display_font_dropdown: function() {
      this.set('display_prefs_font_dropdown_open', false);
      this.set('display_prefs_font_filter', '');
    },
    pick_display_font: function(font_id) {
      this.send('set_display_pref', 'button_style', font_id);
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
      if(id === 'high_contrast') {
        this.send('set_display_pref', 'high_contrast', true);
        this.send('set_display_pref', 'symbol_background', 'black');
      } else {
        // 'clear', 'clear_soft', 'clear_faded', 'white', 'black' all
        // store directly as the symbol_background value. Soft/faded
        // additionally trigger the .fitzgerald-soft / .fitzgerald-faded
        // class via symbol_background_class in pref-classes.js, swapping
        // the --fitzgerald-* CSS custom properties.
        this.send('set_display_pref', 'high_contrast', false);
        this.send('set_display_pref', 'symbol_background', id);
      }
      this.set('display_prefs_symbol_background_dropdown_open', false);
      // Apply the Fitzgerald-soft / -faded class at <html> so :root has
      // the override. The preview cells use inline background-colors
      // populated from LingoLinq.board_detail_keyed_colors (which reads
      // CSS custom properties via getComputedStyle on documentElement)
      // — without this :root-level scope, those reads would always
      // return the base palette regardless of the grid's class.
      // set_fitzgerald_scope also invalidates the JS palette cache, so
      // the next read returns the muted values.
      if(window.LingoLinq && window.LingoLinq.set_fitzgerald_scope) {
        window.LingoLinq.set_fitzgerald_scope(id);
      }
      // Re-trigger the label color lookup so existing labels get
      // re-painted with the muted palette without waiting for the user
      // to type/edit. Drop the cached colors first.
      this.set('_label_colors', {});
      this._lookup_label_colors();
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
    // Speak Bar — Symbol buttons vs Words only. Mirrors board-detail's
    // `set_utterance_text_only`; persists the same way the other
    // display prefs do here (set on sessionUser + save). Accepts the
    // string "true"/"false" the radio group passes.
    set_utterance_text_only: function(value) {
      var bool = (value === 'true' || value === true);
      var user = this.appState.get('sessionUser');
      if(user && user.set) {
        user.set('preferences.device.utterance_text_only', bool);
        user.set('preferences.device.updated', true);
        try { user.save(); } catch(e) { }
      }
    },

    toggle_display_skin_dropdown: function() {
      this.toggleProperty('display_prefs_skin_dropdown_open');
    },
    close_display_skin_dropdown: function() {
      this.set('display_prefs_skin_dropdown_open', false);
    },
    pick_display_skin: function(id) {
      if(id === 'mix' || id === 'mix_only' || id === 'mix_prefer') {
        this._rebuild_compound_skin(id);
      } else {
        this.send('set_display_pref', 'skin', id);
      }
      this.set('display_prefs_skin_dropdown_open', false);
    },

    set_compound_skin: function(id) {
      if(id === 'mix_only' && this.get('skin_is_mix_only')) {
        return this.send('set_display_pref', 'skin', 'default');
      }
      if(id === 'mix_prefer' && this.get('skin_is_mix_prefer')) {
        return this.send('set_display_pref', 'skin', 'default');
      }
      this._rebuild_compound_skin(id);
    },

    toggle_skin_suboption: function(option, event) {
      var checked = event && event.target ? !!event.target.checked : !option.checked;
      emberSet(option, 'checked', checked);
      if(this.get('skin_is_mix_only'))   { this._rebuild_compound_skin('mix_only'); }
      if(this.get('skin_is_mix_prefer')) { this._rebuild_compound_skin('mix_prefer'); }
    }
  }
});
