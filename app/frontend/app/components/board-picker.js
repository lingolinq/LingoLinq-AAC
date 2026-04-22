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
  router: service('router'),
  boardSearchQuery: '',
  used_category_fallback: false,
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
  /** User whose boards should appear first (supervisee during setup, else signed-in user). */
  _subjectBoardUserId: function() {
    var su = this.appState.get('setup_user');
    if (su && su.get('id')) {
      return su.get('id');
    }
    return this.appState.get('currentUser.id') || 'self';
  },
  _recordLength: function(rec) {
    if (!rec) { return 0; }
    return typeof rec.get === 'function' ? (rec.get('length') || 0) : (rec.length || 0);
  },
  /**
   * Load boards for a browse category (robust, cause_effect, …).
   * Order: subject’s starred public in category → supervisor’s starred public in category (if different user)
   * → popular public in category → popular public overall (when the catalog has no tagged boards).
   */
  _resolveCategoryBoards: function(categoryId) {
    var _this = this;
    var subjectId = _this._subjectBoardUserId();
    var supervisorId = _this.appState.get('currentUser.id');

    function starredQuery(uid) {
      return LingoLinq.store.query('board', {
        public: true,
        starred: true,
        user_id: uid,
        sort: 'custom_order',
        per_page: 6,
        category: categoryId
      });
    }
    function publicCategorized() {
      return LingoLinq.store.query('board', {
        public: true,
        sort: 'home_popularity',
        per_page: 9,
        category: categoryId
      });
    }
    function publicAny() {
      return LingoLinq.store.query('board', {
        public: true,
        sort: 'home_popularity',
        per_page: 6
      });
    }
    function tryPublicThenAny() {
      return publicCategorized().then(function(pub) {
        if (_this._recordLength(pub) > 0) {
          return { boards: pub, fallback: false };
        }
        return publicAny().then(function(pop) {
          var n = _this._recordLength(pop);
          return { boards: n ? pop : [], fallback: n > 0 };
        });
      });
    }

    return starredQuery(subjectId).then(function(data) {
      if (_this._recordLength(data) > 0) {
        return { boards: data, fallback: false };
      }
      if (supervisorId && subjectId !== supervisorId) {
        return starredQuery(supervisorId).then(function(data2) {
          if (_this._recordLength(data2) > 0) {
            return { boards: data2, fallback: false };
          }
          return tryPublicThenAny();
        });
      }
      return tryPublicThenAny();
    }).then(function(result) {
      _this.set('used_category_fallback', !!(result && result.fallback));
      _this.set('category_boards', result ? result.boards : []);
    }).catch(function() {
      _this.set('category_boards', { error: true });
    });
  },
  actions: {
    set_category: function(str) {
      var res = {};
      res[str] = true;
      this.set('current_category', str);
      this.set('category', res);
      this.set('show_category_explainer', false);
      this.set('used_category_fallback', false);
      this.set('boardSearchQuery', '');
      this.set('category_boards', {loading: true});
      this._scheduleExplainOverflowCheck();
      var _this = this;
      if(str == 'mine') {
        LingoLinq.store.query('board', {user_id: _this._subjectBoardUserId(), include_shared: 1, sort: 'home_popularity', per_page: 9}).then(function(data) {
          _this.set('category_boards', data);
        }, function(err) {
          _this.set('category_boards', {error: true});
        });  
      } else {
        _this._resolveCategoryBoards(str);
      }
    },
    go_search_boards: function(ev) {
      if (ev && ev.preventDefault) {
        ev.preventDefault();
      }
      var q = (this.get('boardSearchQuery') || '').trim();
      var loc = (i18n.langs || {}).preferred || (typeof navigator !== 'undefined' && navigator.language) || 'en';
      var locSeg = loc.split(/[-_]/)[0];
      this.get('router').transitionTo('search', locSeg, encodeURIComponent(q || '_'));
    },
    more_for_category: function() {
      var _this = this;
      _this.set('more_category_boards', {loading: true});
      LingoLinq.store.query('board', {public: true, sort: 'home_popularity', per_page: 9, category: this.get('current_category')}).then(function(data) {
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
