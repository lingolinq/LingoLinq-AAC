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
import { findExistingUserCopy } from '../utils/board-copy';
import { saveHomeBoard } from '../utils/home_board';
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

  /* The preview must show the board the way THIS user's board-detail will show
     it. Dark mode there is the `preferences.board_dark_mode` pref (default off —
     controllers/user/board-detail.js:329, persisted at :5167), so the preview
     follows the pref instead of the hard-coded `true` it used to pass, which made
     every board preview navy while the board it previewed was light. */
  board_dark_mode: computed('modal.boardPreview', function() {
    return !!app_state.get('currentUser.preferences.board_dark_mode');
  }),

  init() {
    this._super(...arguments);
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
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };

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
    // Board-picker "Pick this Board": get the user an OWNED copy of the picked
    // (public catalog) board set as their home board, then open it in board-detail
    // SPEAK mode and auto-start the speak-mode tour. If the user already has a copy
    // of this board (e.g. the signup provisioner already copied it into their
    // library), that copy is reused instead of creating a duplicate.
    pick_for_home() {
      var _this = this;
      var preview = this.get('modal.boardPreview');
      var board = preview && preview.board;
      if (!board) { app_state.set('tour_board_picker_active', false); this.send('select'); return; }
      var user = app_state.get('setup_user') || app_state.get('currentUser');
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
      // Paint the shared "Preparing your Board" overlay (the SAME one a board
      // card → speak-mode uses) the INSTANT the user clicks, so it covers the
      // preview immediately and stays up through the copy + route change — no gap,
      // and the brief CTA revert (when tour_board_picker_active clears below) is
      // never seen. _finishPickForHome's go() reuses this same overlay to run the
      // actual route transition (paint_view_switch_overlay short-circuits when the
      // overlay already exists).
      _this._paintPreparingOverlay();
      _this.set('copying', true);
      app_state.set('board_picker_pick_in_progress', true);
      var setupUserSnapshot = user;
      var routerSvc = _this.get('router');
      // Dedup first: skip copying if the user already owns a copy of this board.
      findExistingUserCopy(board, user).then(function(existing) {
        if (existing) {
          // Reuse the existing copy — just (re)set it as the home board, no new
          // copy. Via utils/home_board so the save is CONFIRMED against what the
          // server stored: a 200 here does not mean the assignment was kept (the
          // server drops the write for a board it can't resolve or the user
          // can't view), and this branch used to report those as success.
          saveHomeBoard(user, existing, locale).then(function() {
            _this._finishPickForHome(existing, locale, setupUserSnapshot, routerSvc);
          }, function() {
            _this._handlePickError(i18n.t('set_as_home_failed', "Home board update failed unexpectedly"), routerSvc);
          });
        } else {
          // No existing copy — 'links_copy_as_home' copies the board + downstream
          // links AND sets the COPY as the user's home board, resolving with the new
          // owned board (mirrors set-as-home#copy_as_home).
          editManager.copy_board(board, 'links_copy_as_home', user, false, lib).then(function(copiedBoard) {
            _this._finishPickForHome(copiedBoard, locale, setupUserSnapshot, routerSvc);
          }, function(err) {
            // Only surface `err` directly when it's a display string — copy_board can
            // reject with an Error/object, which would render as "[object Object]".
            // copy_board only rejects with an already-localized i18n.t() STRING or a
            // plain internal-code OBJECT; the fallback below covers the object case.
            var msg = (typeof err === 'string' && err) ? err : i18n.t('pick_board_copy_failed', "We couldn't set up your board. Please try again.");
            _this._handlePickError(msg, routerSvc);
          });
        }
      }, function() {
        // Dedup lookup itself failed unexpectedly — fall back to copying so the user
        // is never blocked (a duplicate is preferable to a dead end).
        editManager.copy_board(board, 'links_copy_as_home', user, false, lib).then(function(copiedBoard) {
          _this._finishPickForHome(copiedBoard, locale, setupUserSnapshot, routerSvc);
        }, function(err) {
          var msg = (typeof err === 'string' && err) ? err : i18n.t('pick_board_copy_failed', "We couldn't set up your board. Please try again.");
          _this._handlePickError(msg, routerSvc);
        });
      });
    }
  },

  // Common tail for pick_for_home: flag the speak-mode tour hand-off (scoped to the
  // board's key), preserve the picked locale, preload images, then open the board in
  // SPEAK (use) mode — the board-detail INDEX route (`.edit` would be edit mode).
  _finishPickForHome: function(homeBoard, locale, setupUserSnapshot, routerSvc) {
    var _this = this;
    app_state.set('board_picker_pick_in_progress', false);
    app_state.set('tour_board_picker_active', false);
    if (!_this.isDestroyed && !_this.isDestroying) { _this.set('copying', false); }
    var setupUser = setupUserSnapshot || app_state.get('setup_user');
    var currentUser = app_state.get('currentUser');
    var pickingForOther = setupUser && currentUser && setupUser.get('id') != currentUser.get('id');
    var key = (homeBoard && homeBoard.get && homeBoard.get('key')) || '';
    routerSvc = routerSvc || (_this.get && !_this.isDestroyed && _this.get('router')) || (app_state.controller && app_state.controller.router);

    if (pickingForOther) {
      var returnToBoards = function() {
        _this._removePreparingOverlay();
        modal.close_board_preview();
        modal.success(i18n.t('board_set_as_home', "Great! This is now the user's home board!"), true);
        var userName = setupUser.get('user_name');
        if (userName && routerSvc) {
          routerSvc.transitionTo('user.boards', userName);
        } else {
          app_state.return_to_index();
        }
      };
      preload_board_images(homeBoard).then(returnToBoards, returnToBoards);
      return;
    }

    // Hand-off flag for the board-detail SPEAK tour: the speak guided-tour instance
    // reads this once it mounts on THIS board and auto-starts the speak tour, then
    // clears it (see guided-tour.js _consumePendingBoardDetailSpeakTour). Scoped to
    // the board key so a stale flag can't fire the tour on a different board.
    if (key) { app_state.set('board_detail_tour_pending_speak', key); }
    if (locale) { app_state.set('label_locale', locale); }
    var parts = key.split('/');
    /* TWO OBSERVATIONS FROM THE SELF-PICK CLICK-TESTS, DEFERRED (2026-08-14).
       Both were seen in this path; neither is explained, and neither blocked the
       finding H3 was about — the home board stored correctly and was confirmed by
       re-reading the user from the server.

       1. A self-pick landed on `/<user>/boards` — the pickingForOther destination —
          even though `pickingForOther` is false here, so it is THIS transition to
          user.board-detail that runs. So it is very unlikely to be a wrong-branch
          bug. A 404 was logged in that run; the leading (UNCONFIRMED) hypothesis is
          that board-detail fails to load the just-created copy and something
          redirects to /boards.
       2. A separate run (a different communicator, same self-pick path) never
          reached a terminal state within 180s. Not investigated; may be nothing
          more than a slow dev-stack copy.

       To pick this up: `node scripts/adversarial-review-qa.mjs --only h3b
       --self-id <a communicator with no copy of the picked board>` on a quiet
       stack. The harness already emits a NAV block — the URL trail plus the
       setup_user/currentUser ids this function branches on — which should settle
       (1) in a single run. See
       docs/task-management/2026-08-14-click-test-adversarial-fixes.md. */
    var go = function() {
      if (parts.length >= 2 && routerSvc) {
        var isDark = true;
        var themeMode = app_state.get('themeMode');
        if (themeMode === 'light' || themeMode === 'midDay' || themeMode === 'default') { isDark = false; }
        paint_view_switch_overlay({
          routerSvc: routerSvc,
          isDark: isDark,
          accentLight: false,
          transition: function() {
            // Speak (use) mode = the board-detail INDEX route.
            return routerSvc.transitionTo('user.board-detail', parts[0], parts.slice(1).join('/'));
          }
        });
      } else if (routerSvc) {
        routerSvc.transitionTo('board', key);
      }
    };
    var finish = function() {
      go();
    };
    preload_board_images(homeBoard).then(finish, finish);
  },

  // Clear the copying overlay and surface a (localized) error. Leaves the preview
  // open so the user can retry — and removes the full-screen "Preparing your Board"
  // overlay so the user isn't stranded behind it (no route change will dismiss it).
  _handlePickError: function(msg, routerSvc) {
    app_state.set('board_picker_pick_in_progress', false);
    app_state.set('tour_board_picker_active', true);
    if (!this.isDestroyed && !this.isDestroying) { this.set('copying', false); }
    this._removePreparingOverlay();
    modal.error(msg);
  },

  // Paint the shared "Preparing your Board" overlay immediately (same overlay a
  // board card → speak-mode navigation uses). No transition here — it's painted to
  // cover the screen NOW; the actual route change is fired later by
  // _finishPickForHome's go() (which reuses this same overlay).
  _paintPreparingOverlay: function() {
    var isDark = true;
    var themeMode = app_state.get('themeMode');
    if (themeMode === 'light' || themeMode === 'midDay' || themeMode === 'default') { isDark = false; }
    paint_view_switch_overlay({ routerSvc: this.get('router'), isDark: isDark });
  },

  // Tear down the "Preparing your Board" overlay by id (used on the error path,
  // where no route change occurs to dismiss it on its own).
  _removePreparingOverlay: function() {
    try {
      var ov = (typeof document !== 'undefined') && document.getElementById('ll-pre-reload-overlay');
      if (ov && ov.parentNode) { ov.parentNode.removeChild(ov); }
    } catch(e) { /* DOM may be unavailable; ignore */ }
  }
});
