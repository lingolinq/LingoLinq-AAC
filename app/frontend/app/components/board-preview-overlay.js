import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed, observer } from '@ember/object';
import EmberObject from '@ember/object';
import modal from '../utils/modal';
import app_state from '../utils/app_state';

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

  actions: {
    close() {
      this.set('model_style', null);
      this.get('modal').close(null, 'board-preview');
    },
    preview(key) {
      this.set('model_style', true);
      this.set('model_key', key);
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
    }
  }
});
