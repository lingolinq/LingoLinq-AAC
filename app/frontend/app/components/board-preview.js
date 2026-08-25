import Component from '@ember/component';
import LingoLinq from '../app';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';
import { alias } from '@ember/object/computed';
import paint_view_switch_overlay from '../utils/view_switch_overlay';
import { board_view_route } from '../utils/board_view';

export default Component.extend({
  appState: service('app-state'),
  // Alias for template compatibility (template uses this.app_state)
  app_state: alias('appState'),
  router: service('router'),
  willInsertElement: function() {
    this.set('include_canvas', window.outerWidth > 800);
    this.set('app_state', this.appState);
    this.set('model', {loading: true});
    /* Two-phase loading: the modal overlay only hides once both the
       board model has resolved AND the canvas component has reported
       every button-image promise has settled. We track each phase
       independently and emit the combined state to the parent. */
    this.set('_model_loaded', false);
    /* When the canvas isn't rendered (narrow viewports), there are no
       button-image promises to wait for; the canvas phase is trivially
       complete from the start. Otherwise we wait for board-preview-canvas
       to emit `onCanvasReady`. */
    this.set('_canvas_ready', !this.get('include_canvas'));
    var _this = this;
    var emitLoading = function(value) {
      var cb = _this.get('onLoadingChange');
      if(cb && typeof cb === 'function') { cb(value); }
    };
    /* Re-emit the combined loading state to the parent — false only
       once both phases are complete OR the model errored. */
    this._emitCombinedLoading = function() {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      var model = _this.get('model');
      if(model && model.error) {
        emitLoading(false);
        return;
      }
      if(_this.get('_model_loaded') && _this.get('_canvas_ready')) {
        emitLoading(false);
      } else {
        emitLoading(true);
      }
    };
    emitLoading(true);
    /* Helper: a cached board can ship with image_urls set to an empty
       object `{}` (from a list query that filled the field but not
       its entries). `!board.get('image_urls')` returns false on `{}`,
       so an empty map slips through the partial-load check. Use
       Object.keys.length to detect both missing AND empty. */
    var imageUrlsMissing = function(board) {
      var urls = board.get('image_urls');
      if(!urls) { return true; }
      if(typeof urls !== 'object') { return true; }
      return Object.keys(urls).length === 0;
    };
    /* Catch a partial cache shape the older `imageUrlsMissing` gate
       can't see: the record has `permissions` set AND `image_urls`
       populated, but the two halves don't line up — every button's
       `image_id` references entries that are NOT keys in the cached
       `image_urls` map. Symptom (confirmed by repro logs against
       marcus_williams_slp/vocal-flair-84-categories-food): canvas
       draws every cell as a blank rounded rect, the per-cell
       image-load block at board-preview-canvas.js:274 is gated off
       (`board.get('image_urls')[button.image_id]` undefined for ALL
       buttons), pending stays 0, onCanvasReady fires synchronously,
       and the loading lifecycle collapses. Stale cache reassembled
       from differently-versioned partial responses.

       Treat as partial whenever buttons exist AND image_urls has
       entries AND NOT A SINGLE button.image_id resolves to a key in
       image_urls — that intersection-of-empty only happens with a
       desynced cache, never with a fully-fetched record. */
    var buttonsLookStripped = function(board) {
      var btns = board.get('buttons') || [];
      if(btns.length === 0) { return false; }
      var urls = board.get('image_urls');
      if(!urls || typeof urls !== 'object') { return false; }
      if(Object.keys(urls).length === 0) { return false; }
      for(var i = 0; i < btns.length; i++) {
        var bid = btns[i] && btns[i].image_id;
        if(bid && urls[bid]) { return false; }
      }
      return true;
    };
    if(_this.get('key')) {
      LingoLinq.store.findRecord('board', _this.get('key')).then(function(board) {
        /* Mirror persistence.js#find_record's partial-load check: a
           cached board record can have `permissions` set (from an
           earlier list query that ships a summary row) but be missing
           `image_urls`, or have buttons whose `image_id` references
           are entirely out of sync with the cached `image_urls` map.
           Reload in any of those cases so the canvas always renders
           against a fully-fetched record. */
        var partial = !board.get('permissions') ||
          imageUrlsMissing(board) ||
          buttonsLookStripped(board);
        if(partial) {
          board.reload().then(function(board) {
            _this.set('model', board);
            _this.set('_model_loaded', true);
            _this._emitCombinedLoading();
          });
        } else {
          _this.set('model', board);
          _this.set('_model_loaded', true);
          _this._emitCombinedLoading();
        }
      }, function() {
        _this.set('model', {error: true});
        emitLoading(false);
      });
    } else {
      /* No key → nothing to load. Both phases trivially complete. */
      _this.set('_model_loaded', true);
      _this.set('_canvas_ready', true);
      emitLoading(false);
    }
  },
  multiple_locales: computed('model.locales', function() {
    return (this.get('model.locales') || []).length > 1;
  }),
  languages: computed('model.locales', function() {
    return (this.get('model.locales') || []).map(function(l) { return i18n.readable_language(l); }).join(', ');
  }),
  language: computed('model.locale', function() {
    return i18n.readable_language(this.get('model.locale'));
  }),
  select_option: computed('option', function() {
    return this.get('option') == 'select';
  }),
  // Opened from another modal (e.g. button-settings) that stays open underneath.
  // The preview is view-only: its only footer action is Close, which closes this
  // overlay and returns the user to that modal. See board-preview.hbs footer.
  return_only: computed('option', function() {
    return this.get('option') == 'return';
  }),
  // True when this preview should offer to ASSIGN the board rather than just open
  // it — the "Try This Board" + "Board Actions" buttons are replaced by a single
  // "Pick this Board" CTA (see the template), which routes to
  // board-preview-overlay#pick_for_home.
  //
  // Two callers reach that mode:
  //   * the board-picker TOUR modal, via appState.tour_board_picker_active
  //     (set by tour-board-picker);
  //   * a RECOMMENDED-board preview (`recommend`), which is how the eval report's
  //     "Preview & choose for <user>" card opens the recommended Vocal Flair set.
  //
  // The second one was previously unreachable: `recommend` was threaded from
  // utils/modal#board_preview through services/modal all the way onto the
  // boardPreview settings object and then read by nothing, so the eval report's
  // preview rendered the ordinary details footer. "Try This Board" calls `select`,
  // which opens the board in speak mode for whoever is SIGNED IN — it never
  // copies to the communicator, so the card's own CTA could not do what it said.
  // pick_for_home and _finishPickForHome already handle the pick-for-someone-else
  // case in full; only this flag was missing.
  pick_for_home_mode: computed('appState.tour_board_picker_active', 'recommend', function() {
    return !!(this.get('appState.tour_board_picker_active') || this.get('recommend'));
  }),

  // "Back to Picker" only makes sense when the board-picker tour opened this
  // preview. A recommended-board preview has no picker behind it to return to.
  dismiss_label: computed('appState.tour_board_picker_active', function() {
    return this.get('appState.tour_board_picker_active') ?
      i18n.t('board_picker_back', "Back to Picker") :
      i18n.t('cancel', "Cancel");
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
  },

  actions: {
    /* Fired by board-preview-canvas once every button-image promise
       has settled (or there were no images to load). Flips the
       second loading-phase flag and re-emits the combined state. */
    canvas_ready: function() {
      if(this.isDestroyed || this.isDestroying) { return; }
      this.set('_canvas_ready', true);
      if(this._emitCombinedLoading) { this._emitCombinedLoading(); }
    },
    select: function() {
      if (this.onSelect && typeof this.onSelect === 'function') {
        this.onSelect();
      }
    },
    /* Forward canvas image-load progress (loaded, total) to the parent
       (overlay / controller) so its loading spinner can show "N / total".
       Pure pass-through — the parent owns the displayed state. */
    canvas_progress: function(loaded, total) {
      if (this.onCanvasProgress && typeof this.onCanvasProgress === 'function') {
        this.onCanvasProgress(loaded, total);
      }
    },
    // Contextual remove (delete / unstar / unlink / untag): delegate to the
    // overlay, which closes the preview and fires the tile's own remove callback.
    // Same closure-action idiom as select/pick_for_home above — the template used
    // to invoke `(this.ctrlAction this.onRemove)`, which only resolved back when a
    // route controller was the component's `target` and `onRemove` was an action
    // NAME. Under the angle-bracket <BoardPreview> the overlay renders, `onRemove`
    // is a closure, so it has to be called as one.
    remove: function() {
      if (this.onRemove && typeof this.onRemove === 'function') {
        this.onRemove();
      }
    },
    // Tour mode "Pick this Board": delegate to the overlay, which sets this board
    // as the user's home board and opens it in speak mode.
    pick_for_home: function() {
      if (this.onPickForHome && typeof this.onPickForHome === 'function') {
        this.onPickForHome();
      }
    },
    close: function() {
      modal.close_board_preview();
    },
    visit: function() {
      this.appState.set('referenced_board', {id: this.get('model.id'), key: this.get('model.key'), locale: this.get('locale')});
      var key = this.get('model.key');
      var parts = key ? key.split('/') : [];
      // Both branches navigate to a board route that does an async
      // load — mask with the shared "Preparing your Board" overlay so
      // the modal close → route load gap doesn't flash stale chrome.
      // Theme detection mirrors go_to_modern: default dark, flip to
      // light only on explicit non-dark themeMode.
      var routerSvc = this.get('router');
      var appStateService = this.appState;
      var appController = appStateService.controller;
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
        accentLight: false,
        transition: function() {
          // router.transitionTo returns a Transition, so the overlay's
          // promise chain still works. (appController is the application
          // controller, which injects the router service.) Open in the user's
          // preferred view: board-detail (modern) by default, board-alt (classic)
          // only when board_view_style === 'classic'.
          var user = appStateService && appStateService.get && appStateService.get('currentUser');
          var route = board_view_route(user);
          if(parts.length === 2) {
            return appController.router.transitionTo(route, parts[0], parts[1]);
          } else {
            // Canonical /key route — routes/board.js already redirects by preference.
            return appController.router.transitionTo('board', key);
          }
        }
      });
    },
    copy: function() {
      var _this = this;
      var oldBoard = _this.get('model');
      modal.close_board_preview();
      modal.open('copy-board', {board: oldBoard, for_editing: false}).then(function(decision) {
        decision = decision || {};
        decision.user = decision.user || _this.appState.get('currentUser');
        decision.action = decision.action || "nothing";
        oldBoard.set('copy_name', decision.board_name);
        oldBoard.set('copy_prefix', decision.board_prefix);
        return modal.open('copying-board', {
          board: oldBoard, 
          action: decision.action, 
          user: decision.user, 
          shares: decision.shares, 
          symbol_library: decision.symbol_library,
          make_public: decision.make_public, 
          default_locale: decision.default_locale, 
          translate_locale: decision.translate_locale,
          disconnect: decision.disconnect,
          new_owner: decision.new_owner,
          skip_hierarchy_picker: decision.skip_hierarchy_picker,
          board_ids_to_copy: decision.board_ids_to_copy,
          expand_selected_board_ids_to_copy: decision.expand_selected_board_ids_to_copy
        });
      });

    }
  }
});
