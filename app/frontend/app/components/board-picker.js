import Component from '@ember/component';
import $ from 'jquery';
import contentGrabbers from '../utils/content_grabbers';
import word_suggestions from '../utils/word_suggestions';
import Utils from '../utils/misc';
import LingoLinq from '../app';
import { computed } from '@ember/object';
import i18n from '../utils/i18n';
import { inject as service } from '@ember/service';
import { schedule } from '@ember/runloop';

export default Component.extend({
  appState: service('app-state'),
  category_explainer_overflows: false,
  willInsertElement: function() {
    if(this.get('include_mine')) {
      this.send('set_category', 'mine');
    } else {
      this.send('set_category', 'robust');
    }
    this.set('show_category_explainer', false);
  },
  didInsertElement: function() {
    this._super(...arguments);
    this._scheduleExplainOverflowCheck();
  },
  didUpdateAttrs: function() {
    this._super(...arguments);
    this._scheduleExplainOverflowCheck();
  },
  _scheduleExplainOverflowCheck: function() {
    var _this = this;
    schedule('afterRender', _this, function() {
      _this._checkExplainOverflow();
    });
  },
  _checkExplainOverflow: function() {
    if (this.get('show_category_explainer')) {
      this.set('category_explainer_overflows', false);
      return;
    }
    var el = this.element && this.element.querySelector && this.element.querySelector('.category_explainer p');
    if (!el) {
      this.set('category_explainer_overflows', true);
      return;
    }
    var overflows = el.scrollHeight > el.clientHeight;
    this.set('category_explainer_overflows', overflows);
  },
  categories: computed('current_category', 'include_mine', function() {
    var res = [];
    var _this = this;
    if(this.get('include_mine')) {
      var cat = $.extend({}, {name: i18n.t('my_home_boards', "My Home Boards"), id: 'mine'});
      if(_this.get('current_category') == cat.id) {
        cat.selected = true;
      }
      res.push(cat);
    }
    LingoLinq.board_categories.forEach(function(c) {
      var cat = $.extend({}, c);
      if(_this.get('current_category') == c.id) {
        cat.selected = true;
      }
      res.push(cat);
    });
    return res;
  }),
  actions: {
    set_category: function(str) {
      var res = {};
      res[str] = true;
      this.set('current_category', str);
      this.set('category', res);
      this.set('show_category_explainer', false);
      this.set('category_boards', {loading: true});
      this._scheduleExplainOverflowCheck();
      var _this = this;
      if(str == 'mine') {
        LingoLinq.store.query('board', {user_id: this.appState.get('currentUser.id') || 'self', include_shared: 1, sort: 'home_popularity', per_page: 9}).then(function(data) {
          _this.set('category_boards', data);
        }, function(err) {
          _this.set('category_boards', {error: true});
        });  
      } else {
        LingoLinq.store.query('board', {public: true, starred: true, user_id: this.appState.get('currentUser.id') || 'self', sort: 'custom_order', per_page: 6, category: str}).then(function(data) {
          _this.set('category_boards', data);
        }, function(err) {
          _this.set('category_boards', {error: true});
        });  
      }
    },
    more_for_category: function() {
      var _this = this;
      _this.set('more_category_boards', {loading: true});
      _this.store.query('board', {public: true, sort: 'home_popularity', per_page: 9, category: this.get('current_category')}).then(function(data) {
        _this.set('more_category_boards', data);
      }, function(err) {
        _this.set('more_category_boards', {error: true});
      });
    },
    show_explainer: function() {
      this.set('show_category_explainer', true);
      this._scheduleExplainOverflowCheck();
    },
  }
});
