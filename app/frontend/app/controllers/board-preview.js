import Controller from '@ember/controller';
import modal from '../utils/modal';
import { computed, observer } from '@ember/object';
import EmberObject from '@ember/object';
import app_state from '../utils/app_state';

export default Controller.extend({
  /* Header loading indicator state — defaults true (showing spinner)
     while the inner board-preview component fetches the board and
     paints its canvas. The component fires `onLoadingChange(false)`
     once the board record resolves; the modal hides the indicator. */
  preview_loading: true,
  /* Canvas image-load progress, shown as "N / total" in the loading overlay.
     `preview_images_total` is 0 for text-only boards / before the canvas
     reports, in which case the spinner shows the generic message. */
  preview_images_loaded: 0,
  preview_images_total: 0,
  reset_preview_loading: observer('model_key', function() {
    /* Reset to loading whenever the modal opens with a new key, so
       reusing the same modal for a different board correctly
       re-shows the indicator. */
    if(this.get('model_key')) {
      this.set('preview_loading', true);
      /* Clear stale image counts so the reused modal doesn't flash the
         previous board's progress before the new canvas reports. */
      this.set('preview_images_loaded', 0);
      this.set('preview_images_total', 0);
    }
  }),
  update_style_needed: observer('model.board.key', 'model.allow_style', 'model.board.style.options', function() {
    if(this.get('model.board.key')) {
      if(this.get('model.board.key') != this.get('model_key')) {
        this.set('model_style', null);
      }
      this.set('model_key', this.get('model.board.key'));
      if(this.get('model.allow_style') && this.get('model.board.style.options')) {
        this.set('style_needed', true);
      } else {
        this.set('style_needed', false);
      }
    }
  }),
  style_boards: computed('model.board.style.options', function() {
    if(this.get('model.board.style.options')) {
      var _this = this;
      var list = [];
      var locale = _this.get('model.board.localized_locale') || this.get('model.board.locale') || 'en';
      var locs = [];
      if(_this.get('model.board.style.locales')) {
        var loc = _this.get('model.board.style.locales')[locale] || _this.get('model.board.style.locales')[locale.split(/-|_/)[0]];
        locs = loc && loc.options;
      }
      (_this.get('model.board.style.options') || []).forEach(function(ref, idx) {
        var obj = EmberObject.create({
          key: ref.key,
          id: ref.id,
          name: locs[idx] || ref.name,
          localized_locale: locale,
          icon_url_with_fallback: ref.url,
          grid: {
            rows: ref.rows,
            columns: ref.columns
          }
        });
        if(ref.id == _this.get('model.board.id')) {
          obj = _this.get('model.board');
        }
        list.push(obj);
      });
      return list;
    } else {
      return null;
    }
  }),
  back_func: computed('model_style', function() {
    if(this.get('model_style')) { 
      var _this = this;
      return function() {
        _this.set('model_style', null);
      }
    }
    return null;
  }),
  style_missing: computed('style_needed', 'model_style', function() {
    return this.get('style_needed') && !this.get('model_style');
  }),
  style_cols: computed('style_boards', function() {
    var len = (this.get('style_boards') || []).length;
    if(len < 5) {
      return 'col-xs-4 col-md-3';
    } else {
      return 'col-xs-3 col-md-2';
    }
  }),
  actions: {
    set_preview_loading: function(value) {
      this.set('preview_loading', !!value);
    },
    set_preview_progress: function(loaded, total) {
      this.set('preview_images_loaded', loaded || 0);
      this.set('preview_images_total', total || 0);
    },
    close: function() {
      this.set('model_style', null);
      modal.close_board_preview();
    },
    preview: function(key) {
      this.set('model_style', true);
      this.set('model_key', key);
    },
    select: function() {
      var opt = this.get('model_key');
      var chosen = this.get('style_needed') && !this.get('style_missing');
      this.send('close');
      if(chosen && this.get('style_boards.length')) {
        var brd = this.get('style_boards').find(function(b) { return b.key == opt; });
        var opts = {force_board_state: {key: brd.key, id: brd.id, locale: brd.localized_locale}};
        app_state.home_in_speak_mode(opts);
      } else if(this.get('model.callback')) {
        this.get('model.callback')();
      }
    },
    remove: function() {
      /* Touch-device parity for the tile's hover-only `.board_action`.
         The callback is a closure bound in available-boards-section.hbs
         that dispatches `remove_board(remove_type, board)` to the user
         controller — same path the hover button takes. Close the
         preview first so the subsequent confirm-delete-board /
         confirm-remove-board modal opens on a clean stack. */
      var ctx = this.get('model.remove');
      if(!ctx || !ctx.callback) { return; }
      this.send('close');
      ctx.callback();
    }
  }
});
