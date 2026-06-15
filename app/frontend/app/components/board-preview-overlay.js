import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed, observer } from '@ember/object';
import EmberObject from '@ember/object';
import { later as runLater, cancel as runCancel } from '@ember/runloop';
import modal from '../utils/modal';
import app_state from '../utils/app_state';

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
    // Board-picker TOUR mode "Pick this Board": persist this board as the user's
    // HOME board, then open it in speak mode. Navigating into speak mode tears
    // down both this preview overlay and the tour modal underneath
    // (app_state.global_transition closes both), ending the tour flow.
    pick_for_home() {
      var preview = this.get('modal.boardPreview');
      var board = preview && preview.board;
      app_state.set('tour_board_picker_active', false);
      if (!board) { this.send('select'); return; }
      var locale = (preview && preview.locale) || app_state.get('label_locale');
      var boardState = {
        key: (board.get ? board.get('key') : board.key),
        id: (board.get ? board.get('id') : board.id),
        locale: locale
      };
      var user = app_state.get('currentUser');
      if (user && user.set && user.save) {
        user.set('preferences.home_board', { id: boardState.id, key: boardState.key, locale: locale });
        user.save().then(null, function() { /* best-effort persist */ });
      }
      // Carry a flag into speak mode marking that we arrived here from the
      // board-picker TOUR (via this board preview). The board-detail speak-mode
      // tour (NOT built yet) will read this to auto-start itself, then clear it.
      // Wired now so that future tour has its trigger; nothing consumes it yet.
      app_state.set('board_detail_tour_pending', true);
      app_state.home_in_speak_mode({ force_board_state: boardState });
    }
  }
});
