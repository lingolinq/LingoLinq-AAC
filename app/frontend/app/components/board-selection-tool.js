import Component from '@ember/component';
import $ from 'jquery';
import contentGrabbers from '../utils/content_grabbers';
import app_state from '../utils/app_state';
import word_suggestions from '../utils/word_suggestions';
import Utils from '../utils/misc';
import modal from '../utils/modal';
import persistence from '../utils/persistence';
import i18n from '../utils/i18n';
import LingoLinq from '../app';
import { later as runLater } from '@ember/runloop';
import { htmlSafe } from '@ember/string';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

var shuffle = function(array) {
  var array = [].concat(array);
  for (let i = array.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export default Component.extend({
  willInsertElement: function() {
    this.load_boards();
    this.set('current_index', null);
    this.set('prompt', true);
    this.set('level_select', null);
    this.set('min_level', null);
    this.set('max_level', null);
    this.set('levels', null);
    this.set('current_level', null);
    this.set('org_board', null);
    this.set('base_level', null);
    this.set('board_style', null);
    this.set('app_state', app_state);
    this.set('skip_note', false);
  },
  didInsertElement: function() {
    this.size_element();
  },
  size_element: function() {
    var window_height = window.innerHeight;
    var elem = this.element;
    var rect = elem.getBoundingClientRect();
    var top = rect.top;
    var footer = document.getElementById('setup_footer');
    if(footer) {
      var rect = footer.getBoundingClientRect();
      window_height = window_height - rect.height + 5;
    }
    this.set('height', (window_height - top));
    elem.style.height = this.get('height') + "px";
  },
  update_level_buttons: observer('current_board', 'base_level', 'current_level', function() {
    var _this = this;
    if(this.get('current_board.id')) {
      this.get('current_board').load_button_set().then(function(bs) {
        _this.set('level_buttons', bs.buttons_for_level(_this.get('current_board.id'), _this.get('current_level') || _this.get('base_level')));
      }, function() { });
    }
  }),
  update_current_board: observer('sorted_boards', 'current_index', 'board_style', 'org_board', function() {
    this.size_element();
    var _this = this;
    if(this.get('org_board')) {
      this.set('current_board', this.get('org_board'));
    } else {
      if(this.get('current_index') == undefined && this.get('sorted_boards.length')) {
        var _this = this;
        var index = 0;
        this.get('sorted_boards').forEach(function(b, idx) {
          if(b.get('grid.rows') * b.get('grid.columns') > 40 && index === 0) {
            index = idx;
          } else if(index == 0 && idx == _this.get('sorted_boards').length - 1) {
            index = idx;
          }
        });
        _this.set('current_index', index);
      }
      this.set('current_board', this.get('sorted_boards')[this.get('current_index')]);
    }
    if(this.get('current_board')) {
      this.get('current_board').load_button_set().then(function(bs) {
        _this.set('current_button_set', bs);
      });
    }
  }),
  update_sorted_boards: observer('boards', 'board_style', function() {
    var res = (this.get('boards') || []).sort(function(a, b) {
      var a_size = a.get('grid.rows') * a.get('grid.columns');
      var b_size = b.get('grid.rows') * b.get('grid.columns');
      if(a_size == b_size) {
        return a.get('grid.columns') - b.get('grid.columns');
      } else {
        return a_size - b_size;
      }
    });
    if(this.get('board_style')) {
      var style = this.get('board_style');
      res = res.filter(function(b) { 
        if(!b.get('style') || b.get('style.id') == style) { return true; }
        return false;
      });
      this.setProperties({
        current_index: null,
        sorted_boards: res
      });
    } else {
      this.set('sorted_boards', res);

    }
  }),
  load_boards: function() {
    var _this = this;
    _this.set('status', {loading: true});
    _this.set('boards', null);
    var canvas = _this.element.getElementsByTagName('canvas')[0];
    if(canvas) { canvas.style.display = 'none'; }
    LingoLinq.store.query('board', {public: true, starred: true, user_id: app_state.get('currentUser.id') || 'self', per_page: 20, category: 'layouts'}).then(function(data) {
      var res = data.map(function(b) { return b; });
      if(res && res.length > 0) {
        _this.set('boards', res);
        _this.set('status', null);
      } else {
        _this.set('status', {error: true});
        _this.sendAction('load_error');
      }
    }, function(err) {
      _this.set('status', {error: true});
      _this.sendAction('load_error');
    });
  },
  check_update_scroll: observer('base_level', function() {
    var scroll_disableable = this.get('base_level') != null;
    var _this = this;
    if(this.get('update_scroll')) {
      runLater(function() {
        _this.get('update_scroll')(scroll_disableable);
      });
    }
  }),
  no_next: computed(
    'current_index',
    'max_level',
    'current_level',
    'base_level',
    'sorted_boards',
    'level_select',
    function() {
      if(this.get('level_select')) {
        var max = this.get('max_level') || 10;
        return (this.get('current_level') || this.get('base_level')) >= max;
      } else {
        return !(this.get('current_index') < (this.get('sorted_boards.length') - 1) && this.get('sorted_boards.length') > 0);
      }
    }
  ),
  no_previous: computed(
    'current_index',
    'min_level',
    'current_level',
    'base_level',
    'sorted_boards',
    'level_select',
    function() {
      if(this.get('level_select')) {
        var min = this.get('min_level') || 1;
        return (this.get('current_level') || this.get('base_level')) <= min;
      } else {
        return !(this.get('current_index') > 0 && this.get('sorted_boards.length') > 0);
      }
    }
  ),
  board_style_available: computed('boards', 'board_styles', function() {
    return (this.get('board_styles') || []).length > 0;
  }),
  board_style_needed: computed('boards', 'board_style', 'board_style_available', 'board_styles', 'base_level', 'org_board', function() {
    return this.get('base_level') && (!this.get('boards') || this.get('board_style_available')) && !this.get('board_style') && !this.get('org_board');
  }),
  base_level_and_style: computed('board_style', 'boards', 'board_style_available', 'base_level', function() {
    return this.get('base_level') && this.get('boards') && (!this.get('board_style_available') || this.get('board_style'));
  }),
  board_styles: computed('boards', function() {
    var styles = [];
    var style_ids = {};
    (this.get('boards') || []).forEach(function(b) {
      if(b.get('style.name')) {
        if(!style_ids[b.get('style.id')]) {
          style_ids[b.get('style.id')] = true;
          styles.push(b.get('style'));
        }
      }
    });
    styles = shuffle(styles).slice(0, 2);    
    styles.forEach(function(style) {
      style.col_class = htmlSafe(styles.length == 2 ? 'col-sm-6' : 'col-sm-4');
    });
    return styles;
  }),
  actions: {
    next: function() {
      if(this.get('level_select')) {
        var levels = this.get('levels') || [];
        var current = this.get('current_level') || this.get('base_level') || 10;
        if(current < this.get('min_level')) {
          current = this.get('min_level');
        }
        var level = levels.find(function(l) { return l > current; });
        var board = this.get('current_board');
        var bs = this.get('current_button_set');
        if(bs && board) {
          var prior_count = bs.buttons_for_level(board.get('id'), current);
          var same = true;
          while(same) {
            current++;
            var count = bs.buttons_for_level(board.get('id'), current);
            same = current < level && count == prior_count;
          }
          level = current;
        }
        if(level >= this.get('max_level')) {
          level = 10;
        }
        this.set('current_level', level || 10);
      } else {
        this.set('current_index', Math.min((this.get('current_index') || 0) + 1, (this.get('sorted_boards.length') || 1) - 1));
      }
    },
    previous: function() {
      if(this.get('level_select')) {
        var levels = this.get('levels') || [];
        var current = this.get('current_level') || this.get('base_level') || 10;
        if(current > this.get('max_level')) {
          current = this.get('max_level');
        }
        var level = levels.filter(function(l) { return l < current; }).pop();
        var board = this.get('current_board');
        var bs = this.get('current_button_set');
        if(bs && board) {
          current--;
          var prior_count = bs.buttons_for_level(board.get('id'), current);
          var same = true;
          while(same) {
            current--;
            var count = bs.buttons_for_level(board.get('id'), current);
            same = current > level && count == prior_count;
          }
          if(current > 1) { current++; }
          level = current;
        }
        this.set('current_level', level || 10);
      } else {
        this.set('current_index', Math.max((this.get('current_index') || 0) - 1, 0));
      }
    },
    skip_with_note: function() {
      var user = app_state.get('setup_user') || app_state.get('currentUser');
      if(user) {
        user.set('preferences.home_board', {id: 'none'});
        user.set('preferences.sync_starred_boards', true);
        user.save();
      }

      this.set('skip_note', true);
    },
    advanced: function() {
      this.sendAction('advanced');
    },
    mine: function() {
      if(this.get('mine')) {
        this.sendAction('mine');
      }
    },
    select: function() {
      var _this = this;
      var user = app_state.get('setup_user') || app_state.get('currentUser');
      var board = _this.get('current_board');
      var max = null;
      var min = null;
      var levels = [];
      (board.get('buttons') || []).forEach(function(button) {
        if(button.level_modifications) {
          for(var key in button.level_modifications) {
            var num = parseInt(key, 10);
            if(num && num > 0 && num <= 10) {
              max = Math.max(max || num, num);
              min = Math.min(min || num, num);
              if(levels.indexOf(num) == -1) { levels.push(num); }
            }
          }
        }
      });
      // If there are any modifications, you need Level 1 as an option
      // because that's the one where all pre settings are established
      if(levels.indexOf(1) == -1) { levels.push(1); }
      this.set('min_level', 1);
      this.set('max_level', max);
      this.set('levels', levels.sort());
  
      if(_this.get('current_level') || !board.get('levels')) {
        if(_this.get('current_board.key')) {
          user.set('preferences.sync_starred_boards', false);
          user.copy_home_board(_this.get('current_board'), true, _this.get('current_level')).then(function() { }, function(err) {
            modal.error(i18n.t('set_as_home_failed', "Home board update failed unexpectedly"));
          });
        }
        _this.sendAction('select', _this.get('current_board'));
      } else {
        _this.set('current_level', _this.get('base_level'));
        _this.set('level_select', true);
        _this.set('prompt', true);
        if(!board.get('image_urls')) {
          board.reload();
        }
      }
    },
    deselect: function() {
      this.set('level_select', false);
      this.set('current_level', null);
    },
    set_org_board: function(brd_key) {
      var _this = this;
      LingoLinq.store.findRecord('board', brd_key).then(function(board) {
        _this.set('org_board', board)
        runLater(function() {
          _this.send('select');
        });
      }, function(err) {
        modal.error(i18n.t('error_loading_board', "Error loading board"));
        _this.set('org_board', null);
      });
    },
    set_base_level: function(level) {
      this.set('base_level', level);
      var _this = this;
      runLater(function() {
//        _this.draw_current_board();
      });
    },
    set_board_style: function(style) {
      if(!style || !style.id) {
        console.error("Board style id missing");
        return;
      }
      this.set('current_index', null);
      this.set('board_style', style.id);
    },
    dismiss: function() {
      this.set('prompt', null);
    }
  }
});
