import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed, observer } from '@ember/object';
import EmberObject from '@ember/object';
import { later as runLater, cancel as runCancel } from '@ember/runloop';
import modal from '../utils/modal';
import app_state from '../utils/app_state';
import editManager from '../utils/edit_manager';
import i18n from '../utils/i18n';
import paint_view_switch_overlay from '../utils/view_switch_overlay';
import { preload_board_images } from '../utils/board_preview_warmer';

/* Minimum time the loading overlay must stay visible after it first
   appears, before set_preview_loading(false) is allowed to remove it.
   The overlay itself has a 180ms fade-in (md-board-details-modal__overlay-fade
   in app.scss), so a sub-180ms display would never reach full opacity
   and would register to the user as "no loading message shown." 500ms
   = fade-in + a perceivable beat at full opacity. */
var PREVIEW_LOADING_MIN_DISPLAY_MS = 500;

/**
 * Board Preview overlay - replaces deprecated route.render for board-preview.
 * Renders when modal service has boardPreview set. Handles Choose This Board,
 * Cancel, Copy For, and style selection.
 */
export default Component.extend({
  modal: service('modal'),
  router: service('router'),
  tagName: '',
  uncloseable: false,

  model_key: null,
  model_style: null,
  style_needed: false,
  style_boards: null,
  /* Combined loading state surfaced by the inner {{board-preview}}
     component via onLoadingChange. Stays true until the board record
     resolves AND every canvas button-image promise has settled. The
     header pill and the full-body overlay both gate on this flag. */
  preview_loading: true,
  /* Image-load progress from the canvas (via board-preview#canvas_progress),
     shown as "N / total" in the loading overlay. `preview_images_total` stays 0
     until the canvas reports a non-text board, so the spinner falls back to the
     generic message until there are images to count. */
  preview_images_loaded: 0,
  preview_images_total: 0,
  /* True while "Pick this Board" is seamlessly copying the board into the user's
     account (before routing into edit mode). Drives a "Setting up your board..."
     overlay so the (server-side, can-take-seconds) copy isn't an opaque freeze. */
  copying: false,

  init() {
    this._super(...arguments);
    this._setupFromService();
  },

  _setupFromService: observer('modal.boardPreview', function() {
    var preview = this.get('modal.boardPreview');
    if (!preview || !preview.board) {
      return;
    }
    var board = preview.board;
    this.set('model_key', board.get ? board.get('key') : board.key);
    this.set('model_style', null);
    /* Re-show the loading affordance whenever a new board is wired up
       (e.g. switching between style variants in-modal) so the user
       sees the spinner for the new fetch, not the previous board's
       fully-loaded state. */
    this.set('preview_loading', true);
    /* Clear stale image counts so a re-opened modal doesn't briefly flash the
       previous board's "N / total" before the new canvas reports. */
    this.set('preview_images_loaded', 0);
    this.set('preview_images_total', 0);
    this.set('copying', false);
    /* Stamp the moment the overlay should consider itself "shown"
       so set_preview_loading(false) can enforce the min-display
       window against the right start time even if the modal is
       reopened for a different board. */
    this._loadingShownAt = performance.now();
    if (this._pendingHide) {
      runCancel(this._pendingHide);
      this._pendingHide = null;
    }
    var styleOpts = board.get ? board.get('style.options') : board.style && board.style.options;
    this.set('style_needed', !!(preview.allowStyle && styleOpts && styleOpts.length));
    this.set('style_boards', this._buildStyleBoards(preview, board));
  }),

  _buildStyleBoards(preview, board) {
    var styleOpts = board.get ? board.get('style.options') : (board.style && board.style.options);
    if (!styleOpts) { return null; }
    var locale = preview.locale || (board.get ? board.get('locale') : board.locale) || 'en';
    var locs = [];
    var styleLocales = board.get ? board.get('style.locales') : (board.style && board.style.locales);
    if (styleLocales) {
      var loc = styleLocales[locale] || styleLocales[locale.split(/-|_/)[0]];
      locs = loc && loc.options ? loc.options : [];
    }
    return styleOpts.map(function(ref, idx) {
      var obj = EmberObject.create({
        key: ref.key,
        id: ref.id,
        name: locs[idx] || ref.name,
        localized_locale: locale,
        icon_url_with_fallback: ref.url,
        grid: { rows: ref.rows, columns: ref.columns }
      });
      if (ref.id === (board.get ? board.get('id') : board.id)) {
        obj = board;
      }
      return obj;
    });
  },

  style_missing: computed('style_needed', 'model_style', function() {
    return this.get('style_needed') && !this.get('model_style');
  }),

  style_cols: computed('style_boards', function() {
    var len = (this.get('style_boards') || []).length;
    return len < 5 ? 'col-xs-4 col-md-3' : 'col-xs-3 col-md-2';
  }),

  back_func: computed('model_style', function() {
    var modelStyle = this.get('model_style');
    if (!modelStyle) { return null; }
    var _this = this;
    return function() { _this.set('model_style', null); };
  }),

  willDestroyElement: function() {
    if (this._pendingHide) {
      runCancel(this._pendingHide);
      this._pendingHide = null;
    }
    this._super(...arguments);
  },

  actions: {
    /* Receives the combined loading flag (model + canvas images) from
       the {{board-preview}} child. Same wiring as the controller-
       rendered board-preview.hbs path. */
    set_preview_loading(value) {
      if(this.isDestroyed || this.isDestroying) { return; }
      var _this = this;
      var bool = !!value;
      if (bool) {
        /* Re-showing: cancel any pending min-display hide. Stamp the
           shown-at clock only if we don't already have one (the modal's
           _setupFromService normally sets it; this guards the case
           where the inner board-preview emits true before the overlay
           observer has run). */
        if (_this._pendingHide) {
          runCancel(_this._pendingHide);
          _this._pendingHide = null;
        }
        if (!_this._loadingShownAt) { _this._loadingShownAt = performance.now(); }
        _this.set('preview_loading', true);
        return;
      }
      /* Hiding: enforce the min-display floor so the user has time to
         perceive the affordance (it has a 180ms fade-in; any hide
         before ~300ms after the show would barely flash). */
      var shownAt = _this._loadingShownAt;
      if (shownAt != null) {
        var elapsed = performance.now() - shownAt;
        if (elapsed < PREVIEW_LOADING_MIN_DISPLAY_MS) {
          var remaining = PREVIEW_LOADING_MIN_DISPLAY_MS - elapsed;
          if (_this._pendingHide) { runCancel(_this._pendingHide); }
          _this._pendingHide = runLater(function() {
            _this._pendingHide = null;
            if (_this.isDestroyed || _this.isDestroying) { return; }
            _this._loadingShownAt = null;
            _this.set('preview_loading', false);
          }, remaining);
          return;
        }
      }
      _this._loadingShownAt = null;
      _this.set('preview_loading', false);
    },
    /* Canvas image-load progress (loaded, total) forwarded by board-preview.
       Drives the "N / total" count in the loading overlay. */
    set_preview_progress(loaded, total) {
      if(this.isDestroyed || this.isDestroying) { return; }
      this.set('preview_images_loaded', loaded || 0);
      this.set('preview_images_total', total || 0);
    },
    close() {
      this.set('model_style', null);
      this.get('modal').close(null, 'board-preview');
    },
    preview(key) {
      this.set('model_style', true);
      this.set('model_key', key);
      /* Switching to a different style variant — show the spinner
         until the new board's images settle. */
      this.set('preview_loading', true);
    },
    select() {
      var opt = this.get('model_key');
      var chosen = this.get('style_needed') && !this.get('style_missing');
      var preview = this.get('modal.boardPreview');
      this.send('close');
      if (chosen && this.get('style_boards.length')) {
        var brd = this.get('style_boards').find(function(b) {
          return (b.get ? b.get('key') : b.key) === opt;
        });
        if (brd) {
          var opts = {
            force_board_state: {
              key: brd.get ? brd.get('key') : brd.key,
              id: brd.get ? brd.get('id') : brd.id,
              locale: brd.get ? brd.get('localized_locale') : brd.localized_locale
            }
          };
          app_state.home_in_speak_mode(opts);
        }
      } else if (preview && preview.callback && typeof preview.callback === 'function') {
        preview.callback();
      }
    },
    // Board-picker TOUR mode "Pick this Board": SEAMLESSLY copy the (public catalog)
    // board into the user's own account, set the copy as their home board, then open
    // the OWNED copy in board-detail EDIT mode. The user never sees a manual "needs
    // copying" prompt — picking a board you don't own and editing it would otherwise
    // require copying first. The route transition into board-detail tears down both
    // this preview overlay and the tour modal underneath (app_state.global_transition
    // closes both), ending the tour flow.
    pick_for_home() {
      var _this = this;
      var preview = this.get('modal.boardPreview');
      var board = preview && preview.board;
      if (!board) { app_state.set('tour_board_picker_active', false); this.send('select'); return; }
      var user = app_state.get('currentUser');
      if (!user || !user.get || !user.save) {
        // Adversarial-review note ("raw English fallback string"): this is NOT a raw
        // string — an `i18n.t` call (key + English-default arg) is the project's REQUIRED i18n
        // pattern (CLAUDE.md). The second arg is the en-locale source string that
        // i18n_generator.rb extracts into the locale files; the rendered text is the
        // user's localized translation, falling back to this English default only when a
        // locale lacks the key. Both modal.error calls in this action follow that pattern.
        modal.error(i18n.t('pick_board_no_user', "We couldn't set up your board. Please try again."));
        return;
      }
      var locale = (preview && preview.locale) || app_state.get('label_locale');
      // Symbol library for the copy — the user's preferred set, gated by extras
      // access (mirrors set-as-home.js#updateSelectedUser); falls back to 'original'.
      var lib = user.get('preferences.preferred_symbols') || 'original';
      if (['pcs', 'symbolstix', 'lessonpix'].indexOf(lib) !== -1) {
        if (!user.get('extras_enabled') && !user.get('subscription.extras_enabled')) {
          lib = 'original';
        }
      }
      // Show the copying overlay while copy_board runs (server-side copy of the
      // board + its linked sub-boards; resolves only once that finishes).
      _this.set('copying', true);
      // 'links_copy_as_home' copies the board + downstream links, sets the COPY as
      // the user's home board, and resolves with the new owned board (mirrors
      // set-as-home#copy_as_home).
      editManager.copy_board(board, 'links_copy_as_home', user, false, lib).then(function(copiedBoard) {
        if (_this.isDestroyed || _this.isDestroying) { return; }
        app_state.set('tour_board_picker_active', false);
        var key = copiedBoard.get('key') || '';
        // Hand-off flag for the board-detail EDIT tour: the guided-tour edit-chrome
        // instance reads this once it mounts on the board-detail edit page and
        // auto-starts the edit tour, then clears it (see guided-tour.js
        // _consumePendingBoardDetailTour, which polls until edit mode settles).
        // SCOPED TO THE COPIED BOARD'S KEY (never a bare `true`): the consumer fires the
        // tour only when the board-detail page it mounts on IS this copied board. That
        // prevents the flag from auto-starting the tour on a DIFFERENT board if the user
        // navigates away before the route settles, or in a second tab/session that reads
        // the shared app_state flag (addresses the wrong-board / stale-flag race).
        // We deliberately do NOT fall back to `true` when the key is empty — a bare `true`
        // would reintroduce that very race. A freshly-copied board always has a key (the
        // routing below relies on it); the `if (key)` is purely defensive, and skipping
        // the flag just means the edit tour doesn't auto-open (graceful, never wrong-board).
        if (key) { app_state.set('board_detail_tour_pending', key); }
        // Preserve the language the user previewed/picked in so a translated board
        // doesn't open in the wrong locale.
        if (locale) { app_state.set('label_locale', locale); }
        var parts = key.split('/');
        var routerSvc = _this.get('router');
        // The route change, masked by the shared body-level "Preparing your Board"
        // overlay (paint_view_switch_overlay). It survives the modal close, so the
        // board-picker page underneath is NEVER seen flashing through before
        // board-detail paints, and stays up until the destination route settles.
        // Route to the .edit route so EDIT mode is entered deterministically — the
        // edit route's setupController sets edit_mode + persists current_mode='edit'
        // (more reliable than the auto_edit flag for a freshly-copied board).
        // Dark/light mirrors board-icon's card → board-detail navigation.
        var go = function() {
          if (_this.isDestroyed || _this.isDestroying) { return; }
          if (parts.length >= 2) {
            var isDark = true;
            var themeMode = app_state.get('themeMode');
            if (themeMode === 'light' || themeMode === 'midDay' || themeMode === 'default') { isDark = false; }
            paint_view_switch_overlay({
              routerSvc: routerSvc,
              isDark: isDark,
              accentLight: false,
              transition: function() {
                return routerSvc.transitionTo('user.board-detail.edit', parts[0], parts.slice(1).join('/'));
              }
            });
          } else {
            routerSvc.transitionTo('board', key);
          }
        };
        // Don't reveal board-detail until ALL the board's symbol images are cached
        // (the "Setting up your board..." overlay stays up meanwhile), so the grid
        // paints fully-loaded — the same readiness guarantee the preview gives.
        // Usually instant: the preview the user just viewed already warmed these
        // exact URLs into the browser cache. Bounded by preload's safety timeout.
        //
        // Clear `copying` as we hand off to `go` (on BOTH resolve and reject): go either
        // shows its own body-level "Preparing your Board" overlay and navigates (which
        // tears down this modal anyway), or — on a torn-down component or a malformed key
        // (parts.length < 2) — takes a path that doesn't navigate. Clearing here ensures
        // the "Setting up your board..." overlay can never stick visible in that case.
        var finish = function() {
          if (!_this.isDestroyed && !_this.isDestroying) { _this.set('copying', false); }
          go();
        };
        preload_board_images(copiedBoard).then(finish, finish);
      }, function(err) {
        if (_this.isDestroyed || _this.isDestroying) { return; }
        // Leave the tour modal active so the user can retry from the preview.
        _this.set('copying', false);
        // Only surface `err` directly when it's a display string — copy_board can
        // reject with an Error/object, which would render as "[object Object]".
        //
        // Adversarial-review false positives ("raw un-translated string" / "swallowed
        // localized Error.message"): editManager.copy_board only ever rejects with one of
        // (a) an already-localized i18n.t() STRING (e.g. user_home_find_failed /
        // user_home_failed in edit_manager.js) — safe to show directly, already
        // translated; or (b) a plain internal-code OBJECT ({error: 'view only' | 'not
        // authorized' | ...}) — which is NOT a user-facing message and is correctly
        // replaced by the localized fallback below. It never rejects with a raw
        // un-translated string or an Error whose .message is a localized user string, so
        // neither showing the string branch nor using the fallback violates the i18n rule.
        // If a FUTURE copy_board change were to reject with a raw English string, the fix
        // belongs at that source (reject with an i18n.t() string or a code object) — this
        // handler intentionally trusts copy_board's string rejections to be localized.
        var msg = (typeof err === 'string' && err) ? err : i18n.t('pick_board_copy_failed', "We couldn't set up your board. Please try again.");
        modal.error(msg);
      });
    }
  }
});
