import Component from '@ember/component';
import LingoLinq from '../app';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default Component.extend({
  appState: service('app-state'),
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
    if(_this.get('key')) {
      LingoLinq.store.findRecord('board', _this.get('key')).then(function(board) {
        if(!board.get('permissions')) {
          board.reload(false).then(function(board) {
            _this.set('model', board);
            _this.set('_model_loaded', true);
            _this._emitCombinedLoading();
          });
        } else {
          _this.set('model', board);
          _this.set('_model_loaded', true);
          _this._emitCombinedLoading();
        }
      }, function(err) {
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
    close: function() {
      modal.close_board_preview();
    },
    visit: function() {
      this.appState.set('referenced_board', {id: this.get('model.id'), key: this.get('model.key'), locale: this.get('locale')});
      var key = this.get('model.key');
      var parts = key ? key.split('/') : [];
      if(parts.length === 2) {
        this.appState.controller.transitionToRoute('user.board-detail', parts[0], parts[1]);
      } else {
        this.appState.controller.transitionToRoute('board', key);
      }
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
          new_owner: decision.new_owner
        });
      });

    }
  }
});
