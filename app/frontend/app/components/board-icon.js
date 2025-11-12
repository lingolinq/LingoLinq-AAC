import { htmlSafe } from '@ember/string';
import Component from '@ember/component';
import LingoLinq from '../app';
import app_state from '../utils/app_state';
import modal from '../utils/modal';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

export default Component.extend({
  willInsertElement: function() {
    this.set_board_record();
  },
  set_board_record: observer('board', 'board.key', 'board.children', 'board.children.length', function() {
    var board = this.get('board');
    if(!board) { return; }
    if(board.children) {
      this.set('children', board.children);
      board = board.board;
    }
    if(!board.reload && board.key) {
      var _this = this;
      var b = LingoLinq.store.peekRecord('board', board.id);
      var found_board = function() {
          // If specified as a hash {key: '', locale: ''}
          // then use that locale to set the display name
          if(_this.get('locale') || board.locale) {
            b.set('localized_locale', _this.get('locale') || board.locale);
            _this.set('localized', true);
          }
          _this.set('board_record', b);
      };
      if(!b) {
        LingoLinq.store.findRecord('board', board.id || board.key).then(function(brd) {
          b = brd;
          found_board();
        }, function() { });  
      } else {
        found_board();
      }
    } else {
      // If a localized name wasn't sent from the server
      // then use the specified locale for displaying the name
      if(this.get('locale') && !board.get('localized_name')) {
        board.set('localized_locale', this.get('locale'));
        this.set('localized', true);
      }
      this.set('board_record', board);
    }
  }),
  best_name: computed('board_record.name', 'board_record.translations.board_name', 'board_record.localized_name', 'localized', 'allow_style', 'board_record.style', function() {
    if(this.get('allow_style') && this.get('board_record.style.options')) {
      return this.get('board_record.style.name');
    } else if(this.get('localized')) {
      if(this.get('board_record.translations')) {
        var names = this.get('board_record.translations.board_name') || {};
        if(names[this.get('board_record.localized_locale')]) {
          return names[this.get('board_record.localized_locale')];
        }
      } else if(this.get('board_record.localized_name')) {
        return this.get('board_record.localized_name');
      }
    }
    return this.get('board_record.name');
  }),
  display_class: computed('children', function() {
    var e = this.element;
    var bounds = e.getBoundingClientRect();
    var res ='btn simple_board_icon btn-default';
    if(bounds.width < 120) {
      res = res + ' tiny';
    } else if(bounds.width < 150) {
      res = res + ' short';
    } else if(bounds.width < 180) {
      res = res + ' medium';
    }
    if(this.get('children')) {
      res = res + ' folder';
    }
    if(this.get('noop')) {
      res = res + ' unlinked';
    }

    return htmlSafe(res);
  }),
  override_count: computed('allow_style', 'board_record.style.options', function() {
    return this.get('allow_style') && (this.get('board_record.style.options') || []).length;
  }),
  actions: {
    board_preview: function(board) {
      var _this = this;
      board.preview_option = null;
      if(_this.get('localized')) {
        board.preview_locale = this.get('board_record.localized_locale');
      }
      if(_this.get('action_override')) {
        _this.sendAction('action_override', this.get('board_record.key'));
      } else {
        modal.board_preview(board, board.preview_locale, this.get('allow_style'), function() {
          _this.send('pick_board', board);
        });
      }
    },
    pick_board: function(board) {
      var _this = this;
      if(_this.get('noop')) {

      } else if(_this.get('action_override')) {
        _this.sendAction('action_override', this.get('board_record.key'));
      } else if(this.get('children')) {
        _this.sendAction('action', this.get('board'));
      } else if(this.get('option') == 'select') {
        board.preview_option = 'select';
        if(_this.get('localized')) {
          board.preview_locale = this.get('board_record.localized_locale');
        }
        modal.board_preview(board, board.preview_locale, this.get('allow_style'), function() {
          _this.sendAction('action', board);
        });
      } else if(_this.get('allow_style') && _this.get('override_count')) {
        if(_this.get('localized')) {
          board.preview_locale = this.get('board_record.localized_locale');
        }
        modal.board_preview(board, board.preview_locale, this.get('allow_style'), function() {
          // _this.sendAction('action', board);
        });
      } else {
        var opts = {force_board_state: {key: board.get('key'), id: board.get('id')}};
        if(_this.get('localized')) {
          opts.force_board_state.locale = this.get('board_record.localized_locale');
        }
        app_state.home_in_speak_mode(opts);
      }
    }
  }
});
