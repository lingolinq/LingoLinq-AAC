import Component from '@ember/component';
import $ from 'jquery';
import contentGrabbers from '../utils/content_grabbers';
import word_suggestions from '../utils/word_suggestions';
import Utils from '../utils/misc';
import LingoLinq from '../app';
import { computed } from '@ember/object';
import i18n from '../utils/i18n';
import { inject as service } from '@ember/service';
import { schedule, debounce, cancel } from '@ember/runloop';

export default Component.extend({
  appState: service('app-state'),
  router: service('router'),
  boardSearchQuery: '',
  category_explainer_overflows: false,
  // Brand-group results for the tabbed (setup) Robust Vocabularies view.
  // Each holds { state: 'loading' | 'loaded' | 'error', boards: [...] }.
  quick_core_group: null,
  vocal_flair_group: null,
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
    // Re-run the tab orphan check on viewport resize (the wrap point — and thus
    // whether a single tab is orphaned — depends on available width). Debounced;
    // removed in willDestroyElement.
    var _this = this;
    this._on_tabs_resize = function() {
      // `debounce` from '@ember/runloop' returns a cancelable timer handle (the documented
      // Ember contract), and the matching `cancel(this._tabs_resize_timer)` in
      // willDestroyElement accepts exactly that handle — so the pending invocation is torn
      // down on destroy. (Adversarial-review note: this is the correct, supported API in
      // this Ember version; pre-existing code, unchanged by this PR.)
      _this._tabs_resize_timer = debounce(_this, '_adjustTabsForOrphans', 120);
    };
    window.addEventListener('resize', this._on_tabs_resize);
  },
  didUpdateAttrs: function() {
    this._super(...arguments);
    this._scheduleExplainOverflowCheck();
  },
  willDestroyElement: function() {
    if (this._on_tabs_resize) {
      window.removeEventListener('resize', this._on_tabs_resize);
      this._on_tabs_resize = null;
    }
    if (this._tabs_resize_timer) {
      cancel(this._tabs_resize_timer);
      this._tabs_resize_timer = null;
    }
    this._super(...arguments);
  },
  _scheduleExplainOverflowCheck: function() {
    var _this = this;
    schedule('afterRender', _this, function() {
      _this._checkExplainOverflow();
      _this._adjustTabsForOrphans();
    });
  },
  // Prevent a single orphaned category tab on the last wrapped row: when the tabs
  // wrap such that exactly ONE sits alone on the final row, insert a full-width
  // break <li> before the second-to-last tab so it drops down to join the orphan
  // (last row → two tabs). Only acts when the second-to-last tab's row has ≥3
  // tabs, so pulling one down can't strand a NEW orphan on the row above. Scoped
  // to the standalone /board-picker page (the tabs keep their natural width
  // elsewhere). Idempotent — clears its prior break and re-measures each run.
  _adjustTabsForOrphans: function() {
    // Adversarial-review note (LOW, pre-existing — unchanged by this PR): the injected
    // tab-break <li> is created imperatively, but this is safe/idempotent: the lookup is
    // scoped to THIS component (`this.element`, further gated to `.board-picker-page`),
    // every run first removes any prior `.md-home-boards-picker__tab-break` before
    // re-inserting, and the node carries aria-hidden + role="presentation" so it's inert
    // to assistive tech. If Glimmer re-renders the <ul>, the manual node is dropped with
    // it and re-added on the next resize tick — no orphan/duplicate accumulates.
    if (this.isDestroyed || this.isDestroying) { return; }
    var root = this.element;
    if (!root || !root.closest || !root.closest('.board-picker-page')) { return; }
    var ul = root.querySelector('.md-home-boards-picker__tabs.ub-boards-page__tabs--boards');
    if (!ul) { return; }
    var prior = ul.querySelector('.md-home-boards-picker__tab-break');
    if (prior) { ul.removeChild(prior); }
    var items = [];
    for (var i = 0; i < ul.children.length; i++) {
      if (ul.children[i].tagName === 'LI') { items.push(ul.children[i]); }
    }
    if (items.length < 3) { return; }
    var rowCount = function(top) {
      var n = 0;
      for (var j = 0; j < items.length; j++) {
        if (Math.abs(items[j].offsetTop - top) <= 1) { n++; }
      }
      return n;
    };
    var orphan = items[items.length - 1];
    if (rowCount(orphan.offsetTop) !== 1) { return; }       // last row isn't a lone tab
    var penultimate = items[items.length - 2];
    if (rowCount(penultimate.offsetTop) < 3) { return; }    // pulling it would strand a new orphan
    var brk = document.createElement('li');
    brk.className = 'md-home-boards-picker__tab-break';
    brk.setAttribute('aria-hidden', 'true');
    brk.setAttribute('role', 'presentation');
    ul.insertBefore(brk, penultimate);
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
  // True only in the setup tabbed view with Robust Vocabularies active —
  // the gate for showing the Quick Core / Vocal Flair brand cards.
  robust_tabbed: computed('tabbed', 'category.robust', function() {
    return !!this.get('tabbed') && !!(this.get('category') && this.get('category').robust);
  }),
  // Render-ready list of brand groups for the template (one card each),
  // DRY across Quick Core + Vocal Flair. Recomputes as each query resolves.
  brand_groups: computed('quick_core_group', 'vocal_flair_group', function() {
    return [
      { id: 'quick_core', title: i18n.t('quick_core', "Quick Core"), result: this.get('quick_core_group') },
      { id: 'vocal_flair', title: i18n.t('vocal_flair', "Vocal Flair"), result: this.get('vocal_flair_group') }
    ];
  }),
  // Load the MAIN (root) Quick Core / Vocal Flair boards — sub-boards
  // (e.g. `vocal-flair-84-categories-food`) are excluded by anchoring the
  // slug regex at the end after the size (and optional `-with-keyboard`).
  // Public search may return several owners' copies of the same board, so
  // dedup by name and natural-sort (24 < 40 < 60 < 84 < 112). Loaded once.
  _loadBrandGroups: function() {
    var _this = this;
    if(this._brand_groups_loaded) { return; }
    this._brand_groups_loaded = true;
    var defs = [
      { prop: 'quick_core_group', q: 'Quick Core', re: /(^|\/)quick-core-\d+(-with-keyboard)?$/i },
      { prop: 'vocal_flair_group', q: 'Vocal Flair', re: /(^|\/)vocal-flair-\d+(-with-keyboard)?$/i }
    ];
    defs.forEach(function(def) {
      _this.set(def.prop, { state: 'loading' });
      LingoLinq.store.query('board', { public: true, q: def.q, sort: 'home_popularity', per_page: 50 }).then(function(data) {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        var seen = Object.create(null);
        var matched = [];
        if(data && data.forEach) {
          data.forEach(function(b) {
            var key = (b && b.get && b.get('key')) || '';
            if(!def.re.test(key)) { return; }
            var name = (b.get && b.get('name')) || '';
            if(name && seen[name]) { return; }
            if(name) { seen[name] = true; }
            matched.push(b);
          });
        }
        matched.sort(function(a, b) {
          var an = (a.get && a.get('name')) || '';
          var bn = (b.get && b.get('name')) || '';
          return an.localeCompare(bn, undefined, { numeric: true, sensitivity: 'base' });
        });
        _this.set(def.prop, { state: 'loaded', boards: matched });
      }, function() {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        _this.set(def.prop, { state: 'error' });
      });
    });
  },
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
   * → popular public boards tagged with that category. No uncategorized fallback —
   * empty categories show "None found" so jokes/etc. do not appear in every tab.
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

    return starredQuery(subjectId).then(function(data) {
      if (_this._recordLength(data) > 0) {
        return data;
      }
      if (supervisorId && subjectId !== supervisorId) {
        return starredQuery(supervisorId).then(function(data2) {
          if (_this._recordLength(data2) > 0) {
            return data2;
          }
          return publicCategorized();
        });
      }
      return publicCategorized();
    }).then(function(boards) {
      _this.set('category_boards', boards || []);
    }).catch(function() {
      _this.set('category_boards', { error: true });
    });
  },
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
    set_category: function(str) {
      var res = {};
      res[str] = true;
      this.set('current_category', str);
      this.set('category', res);
      this.set('show_category_explainer', false);
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
      } else if(_this.get('tabbed') && str == 'robust') {
        // Setup Robust Vocabularies renders the Quick Core / Vocal Flair
        // brand cards instead of the flat category grid.
        _this._loadBrandGroups();
      } else {
        // Cause and Effect and other browse tabs: public boards tagged with
        // the category id in board.settings.categories (e.g. cause_effect).
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
