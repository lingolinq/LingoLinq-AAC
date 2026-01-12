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
  // Note: 'board.id' dependency only works for Ember Data models, not plain objects.
  // Plain objects don't support computed property observation, so changes to board.id
  // won't trigger this observer for plain objects. The 'board' dependency will catch
  // board replacements, which is sufficient for most cases.
  set_board_record: observer('board', 'board.key', 'board.children', 'board.children.length', function() {
    var board = this.get('board');
    if(!board) { return; }
    if(board.children) {
      this.set('children', board.children);
      board = board.board;
    }
    // Check if board is already an Ember Data model (has get method)
    var isEmberDataModel = board && typeof board.get === 'function';
    var boardKey = isEmberDataModel ? board.get('key') : board.key;
    var boardId = isEmberDataModel ? board.get('id') : board.id;
    var boardReload = isEmberDataModel ? board.get('reload') : board.reload;
    
    if(!boardReload && boardKey) {
      var _this = this;
      var b = LingoLinq.store.peekRecord('board', boardId);
      var found_board = function() {
          // If specified as a hash {key: '', locale: ''}
          // then use that locale to set the display name
          if(_this.get('locale') || (isEmberDataModel ? board.get('locale') : board.locale)) {
            b.set('localized_locale', _this.get('locale') || (isEmberDataModel ? board.get('locale') : board.locale));
            _this.set('localized', true);
          }
          _this.set('board_record', b);
      };
      if(!b) {
        LingoLinq.store.findRecord('board', boardId || boardKey).then(function(brd) {
          b = brd;
          found_board();
        }, function() { });  
      } else {
        found_board();
      }
    } else {
      // If a localized name wasn't sent from the server
      // then use the specified locale for displaying the name
      if(this.get('locale') && (!isEmberDataModel || !board.get('localized_name'))) {
        if(isEmberDataModel) {
          board.set('localized_locale', this.get('locale'));
        } else {
          board.localized_locale = this.get('locale');
        }
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
  isReady: computed('board_record', 'board_record.key', 'board_record.id', function() {
    var board_record = this.get('board_record');
    if(!board_record) { return false; }
    // Check if board_record has a key or id (indicating it's a valid board)
    var hasKey = board_record.get && board_record.get('key') || board_record.key;
    var hasId = board_record.get && board_record.get('id') || board_record.id;
    return !!(hasKey || hasId);
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
      // Use board_record if available, otherwise use the parameter
      var board_record = this.get('board_record') || board;
      
      // If board_record is not available, the action should not have been triggered
      // (template should guard against this), but return early as a safety check
      if(!board_record) {
        return;
      }
      
      if(_this.get('noop')) {
        return;
      } else if(_this.get('action_override')) {
        var key = board_record.get ? board_record.get('key') : board_record.key;
        _this.sendAction('action_override', key);
      } else if(this.get('children')) {
        _this.sendAction('action', this.get('board'));
      } else if(this.get('option') == 'select') {
        board_record.preview_option = 'select';
        if(_this.get('localized')) {
          board_record.preview_locale = board_record.get ? board_record.get('localized_locale') : board_record.localized_locale;
        }
        modal.board_preview(board_record, board_record.preview_locale, this.get('allow_style'), function() {
          _this.sendAction('action', board_record);
        });
      } else if(_this.get('allow_style') && _this.get('override_count')) {
        if(_this.get('localized')) {
          board_record.preview_locale = board_record.get ? board_record.get('localized_locale') : board_record.localized_locale;
        }
        modal.board_preview(board_record, board_record.preview_locale, this.get('allow_style'), function() {
          // _this.sendAction('action', board_record);
        });
      } else {
        var key = board_record.get ? board_record.get('key') : board_record.key;
        var id = board_record.get ? board_record.get('id') : board_record.id;
        var opts = {force_board_state: {key: key, id: id}};
        if(_this.get('localized')) {
          opts.force_board_state.locale = board_record.get ? board_record.get('localized_locale') : board_record.localized_locale;
        }
        app_state.home_in_speak_mode(opts);
      }
    }
  }
});
