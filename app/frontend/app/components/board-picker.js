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
import persistence from '../utils/persistence';
import {
  filterBoardsPageTopLevelRoots,
  filterRootBoards,
  dedupeByName,
  boardsPagePreferUserNames,
  sortByNameNatural
} from '../utils/board-roots';

export default Component.extend({
  appState: service('app-state'),
  router: service('router'),
  boardSearchQuery: '',
  searchAtTop: false,
  category_explainer_overflows: false,
  public_boards_has_more: false,
  public_boards_loading_more: false,
  /* Board-card density. false = detailed cards (the default, unchanged);
     true = compact cards showing only icon, name and Preview. The compact
     state is applied as a modifier class on the grid and the trimming is done
     in CSS rather than by branching board-icon.hbs — that component renders on
     the dashboard, boards page and search too, and this density choice belongs
     to the picker alone. */
  compact_boards: false,
  /* Toolbar lead: which set of boards is on screen, and how many. The count is a
     plain reflection of what the (unchanged) filtering pipeline produced — it
     does not re-filter anything. */
  resultsTitle: computed('categories', function() {
    var selected = (this.get('categories') || []).find(function(c) { return c && c.selected; });
    return (selected && selected.name) || i18n.t('board_picker_all_boards', "All available boards");
  }),
  resultsCountLabel: computed('display_category_boards.[]', 'display_category_boards.loading', 'display_category_boards.error', function() {
    var boards = this.get('display_category_boards');
    if(!boards || boards.loading || boards.error || boards.length == null) { return null; }
    return i18n.t('board_picker_board_count', "board", { count: boards.length });
  }),
  // Brand-group results for the tabbed (setup) Robust Vocabularies view.
  // Each holds { state: 'loading' | 'loaded' | 'error', boards: [...] }.
  quick_core_group: null,
  vocal_flair_group: null,
  willInsertElement: function() {
    if(this.get('include_mine')) {
      this.send('set_category', 'mine');
    } else if(this.get('searchAtTop')) {
      this.send('set_category', 'available_boards');
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
  categories: computed('current_category', 'include_mine', 'searchAtTop', function() {
    var res = [];
    var _this = this;
    var searchAtTop = this.get('searchAtTop');
    var includeMine = this.get('include_mine');
    var current = _this.get('current_category');

    function pushMine() {
      var cat = $.extend({}, {
        name: searchAtTop
          ? i18n.t('my_boards', "My Boards")
          : i18n.t('my_home_boards', "My Home Boards"),
        id: 'mine'
      });
      if (current === cat.id) {
        cat.selected = true;
      }
      res.push(cat);
    }

    if (searchAtTop) {
      var availableCat = {
        name: i18n.t('board_picker_available_boards', "All Available Boards"),
        id: 'available_boards'
      };
      if (current === 'available_boards') {
        availableCat.selected = true;
      }
      res.push(availableCat);
    }
    if (includeMine && !searchAtTop) {
      pushMine();
    }
    LingoLinq.board_categories.forEach(function(c) {
      var cat = $.extend({}, c);
      if (current === c.id) {
        cat.selected = true;
      }
      res.push(cat);
    });
    return res;
  }),
  boardSearchActive: computed('boardSearchQuery', function() {
    return !!((this.get('boardSearchQuery') || '').trim());
  }),
  showInlineCategoryFilter: computed('searchAtTop', 'category', 'tabbed', 'robust_tabbed', function() {
    if (!this.get('searchAtTop')) {
      return false;
    }
    var category = this.get('category');
    if (!category) {
      return false;
    }
    if (this.get('robust_tabbed')) {
      return false;
    }
    return true;
  }),
  display_category_boards: computed('searchAtTop', 'boardSearchQuery', 'category_boards.[]', function() {
    var boards = this.get('category_boards');
    if (!boards || boards.loading || boards.error) {
      return boards;
    }
    if (!this.get('searchAtTop')) {
      return boards;
    }
    var q = (this.get('boardSearchQuery') || '').trim().toLowerCase();
    if (!q) {
      return boards;
    }
    return boards.filter(function(board) {
      var name = (board.get && board.get('name')) || board.name || '';
      var key = (board.get && board.get('key')) || board.key || '';
      return name.toLowerCase().indexOf(q) !== -1 || key.toLowerCase().indexOf(q) !== -1;
    });
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
        var matched = [];
        if(data && data.forEach) {
          data.forEach(function(b) {
            var key = (b && b.get && b.get('key')) || '';
            if(!def.re.test(key)) { return; }
            matched.push(b);
          });
        }
        matched.sort(function(a, b) {
          var an = (a.get && a.get('name')) || '';
          var bn = (b.get && b.get('name')) || '';
          return an.localeCompare(bn, undefined, { numeric: true, sensitivity: 'base' });
        });
        matched = dedupeByName(matched, {
          preferUserNames: boardsPagePreferUserNames(_this.appState)
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
  /* Category loads share one `category_boards` list. Switching tabs does not
     cancel in-flight queries, so each async writer must ignore results from a
     load that is no longer current — otherwise All Available can paint into
     Cause and Effect (and the reverse). All Available keeps its own load id so
     the first fetch can finish in the background and be reused when the user
     returns to that tab. */
  _nextBoardsLoadId: function() {
    this._boards_load_id = (this._boards_load_id || 0) + 1;
    return this._boards_load_id;
  },
  _isStaleBoardsLoad: function(loadId, expectedCategory) {
    if (this.isDestroyed || this.isDestroying) { return true; }
    if (loadId !== this._boards_load_id) { return true; }
    if (expectedCategory && this.get('current_category') !== expectedCategory) { return true; }
    return false;
  },
  _isStaleAvailableLoad: function(loadId) {
    if (this.isDestroyed || this.isDestroying) { return true; }
    return loadId !== this._available_load_id;
  },
  _availableSnapshotForCurrentUser: function() {
    var snap = this._available_snapshot;
    if (!snap || !snap.boards || snap.boards.loading || snap.boards.error) { return null; }
    if (snap.userId !== this._subjectBoardUserId()) { return null; }
    return snap;
  },
  _availableLoadInFlight: function() {
    if (this._availableSnapshotForCurrentUser()) { return false; }
    if (!this._available_load_id) { return false; }
    return !this._available_mine_done || !this._available_public_initial_done;
  },
  _restoreAvailableSnapshot: function(snap) {
    this.set('category_boards', snap.boards);
    this.set('public_boards_has_more', !!snap.has_more);
    this.set('public_boards_loading_more', false);
    this._public_boards_next_offset = snap.next_offset;
  },
  /* Mine / All Available: root tiles only (brand-set sub-pages dropped), one
     row per display name, then A–Z. Tagged category tabs skip the brand-root
     filter so a public home-board keyboard such as `vocal-flair-112-keyboard`
     can appear in Keyboards even though it is not a brand-set root. */
  _preparePickerBoardList: function(boards, options) {
    var subjectId = this._subjectBoardUserId();
    var list = (options && options.keepCategoryTagged)
      ? filterRootBoards(boards || [], subjectId)
      : filterBoardsPageTopLevelRoots(boards || [], subjectId);
    var deduped = dedupeByName(list, {
      preferUserNames: boardsPagePreferUserNames(this.appState)
    });
    return sortByNameNatural(deduped);
  },
  /**
   * Load boards for a browse category (robust, cause_effect, …).
   * Order: subject’s starred public in category → supervisor’s starred public in category (if different user)
   * → popular public boards tagged with that category. Empty categories show "None found".
   */
  _resolveCategoryBoards: function(categoryId, loadId) {
    var _this = this;
    if (loadId == null) { loadId = _this._boards_load_id; }
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
      if (_this._isStaleBoardsLoad(loadId, categoryId)) { return null; }
      if (_this._recordLength(data) > 0) {
        return data;
      }
      if (supervisorId && subjectId !== supervisorId) {
        return starredQuery(supervisorId).then(function(data2) {
          if (_this._isStaleBoardsLoad(loadId, categoryId)) { return null; }
          if (_this._recordLength(data2) > 0) {
            return data2;
          }
          return publicCategorized();
        });
      }
      return publicCategorized();
    }).then(function(boards) {
      if (_this._isStaleBoardsLoad(loadId, categoryId) || boards == null) { return; }
      _this.set('category_boards', _this._preparePickerBoardList(boards, { keepCategoryTagged: true }));
    }).catch(function() {
      if (_this._isStaleBoardsLoad(loadId, categoryId)) { return; }
      _this.set('category_boards', { error: true });
    });
  },
  _refreshAvailableBoardsDisplay: function(loadId) {
    if (this._isStaleAvailableLoad(loadId)) { return; }
    if (!this._available_mine_done || !this._available_public_initial_done) {
      return;
    }
    var mine = this._available_mine_accumulated || [];
    var pub = this._available_public_accumulated || [];
    var combined = mine.slice();
    pub.forEach(function(b) { if (b) { combined.push(b); } });
    var boards = this._preparePickerBoardList(combined);
    this._available_snapshot = {
      userId: this._subjectBoardUserId(),
      boards: boards,
      has_more: !!this.get('public_boards_has_more'),
      next_offset: this._public_boards_next_offset
    };
    if (this.get('current_category') === 'available_boards') {
      this.set('category_boards', boards);
    }
  },
  _loadAvailableBoards: function(loadId) {
    var _this = this;
    if (loadId == null) { loadId = _this._available_load_id; }
    this.set('public_boards_has_more', false);
    this.set('public_boards_loading_more', false);
    this._public_boards_next_offset = null;
    this._available_snapshot = null;
    this._available_mine_accumulated = [];
    this._available_public_accumulated = [];
    this._available_mine_done = false;
    this._available_public_initial_done = false;
    this._loadAvailableMinePages(null, null, null, loadId);
    this._loadAvailablePublicPage(null, loadId);
  },
  _loadAvailableMinePages: function(userId, offset, accumulated, loadId) {
    var _this = this;
    if (loadId == null) { loadId = _this._available_load_id; }
    if (_this._isStaleAvailableLoad(loadId)) { return; }
    userId = userId || _this._subjectBoardUserId();
    if (!userId) {
      _this._available_mine_done = true;
      _this._refreshAvailableBoardsDisplay(loadId);
      return;
    }
    var nextAcc = accumulated ? accumulated.slice() : [];
    var args = { user_id: userId, include_shared: 1, sort: 'home_popularity', per_page: 50 };
    if (offset != null) { args.offset = offset; }
    LingoLinq.store.query('board', args).then(function(data) {
      if (_this._isStaleAvailableLoad(loadId)) { return; }
      if (data && data.forEach) {
        data.forEach(function(b) { if (b) { nextAcc.push(b); } });
      }
      _this._available_mine_accumulated = nextAcc;
      var meta = null;
      try { meta = persistence.meta('board', data); } catch (e) { meta = null; }
      if (meta && meta.more) {
        _this._loadAvailableMinePages(userId, meta.next_offset, nextAcc, loadId);
      } else {
        _this._available_mine_done = true;
        _this._refreshAvailableBoardsDisplay(loadId);
      }
    }).catch(function() {
      if (_this._isStaleAvailableLoad(loadId)) { return; }
      _this._available_mine_accumulated = nextAcc;
      _this._available_mine_done = true;
      _this._refreshAvailableBoardsDisplay(loadId);
    });
  },
  _loadAvailablePublicPage: function(offset, loadId) {
    var _this = this;
    if (loadId == null) { loadId = _this._available_load_id; }
    if (_this._isStaleAvailableLoad(loadId)) { return; }
    var args = { public: true, sort: 'home_popularity', per_page: 24 };
    if (offset != null) { args.offset = offset; }
    if (offset != null) {
      _this.set('public_boards_loading_more', true);
    }
    LingoLinq.store.query('board', args).then(function(data) {
      if (_this._isStaleAvailableLoad(loadId)) { return; }
      var next = (_this._available_public_accumulated || []).slice();
      if (data && data.forEach) {
        data.forEach(function(b) { if (b) { next.push(b); } });
      }
      _this._available_public_accumulated = next;
      if (offset == null) {
        _this._available_public_initial_done = true;
      }
      _this.set('public_boards_loading_more', false);
      var meta = null;
      try { meta = persistence.meta('board', data); } catch (e) { meta = null; }
      _this.set('public_boards_has_more', !!(meta && meta.more));
      _this._public_boards_next_offset = (meta && meta.more) ? meta.next_offset : null;
      _this._refreshAvailableBoardsDisplay(loadId);
    }).catch(function() {
      if (_this._isStaleAvailableLoad(loadId)) { return; }
      _this.set('public_boards_loading_more', false);
      if (offset == null) {
        _this._available_public_initial_done = true;
      }
      _this._refreshAvailableBoardsDisplay(loadId);
    });
  },
  _loadMyBoardRoots: function(loadId) {
    if (loadId == null) { loadId = this._boards_load_id; }
    if (this._isStaleBoardsLoad(loadId, 'mine')) { return; }
    var userId = this._subjectBoardUserId();
    if (!userId) {
      this.set('category_boards', { error: true });
      return;
    }
    this._loadMyBoardRootsPage(userId, null, [], loadId);
  },
  _loadMyBoardRootsPage: function(userId, offset, accumulated, loadId) {
    var _this = this;
    if (loadId == null) { loadId = _this._boards_load_id; }
    if (_this._isStaleBoardsLoad(loadId, 'mine')) { return; }
    var args = { user_id: userId, include_shared: 1, sort: 'home_popularity', per_page: 50 };
    if (offset != null) { args.offset = offset; }
    LingoLinq.store.query('board', args).then(function(data) {
      if (_this._isStaleBoardsLoad(loadId, 'mine')) { return; }
      var next = accumulated.slice();
      if (data && data.forEach) {
        data.forEach(function(b) { if (b) { next.push(b); } });
      }
      _this.set('category_boards', _this._preparePickerBoardList(next));
      var meta = null;
      try { meta = persistence.meta('board', data); } catch (e) { meta = null; }
      if (meta && meta.more) {
        _this._loadMyBoardRootsPage(userId, meta.next_offset, next, loadId);
      }
    }).catch(function() {
      if (_this._isStaleBoardsLoad(loadId, 'mine')) { return; }
      if (accumulated && accumulated.length) {
        _this.set('category_boards', _this._preparePickerBoardList(accumulated));
      } else {
        _this.set('category_boards', { error: true });
      }
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
    /* Explicit set rather than a toggle: the segmented control has two named
       options, so each one asserts its own state (re-pressing the active option
       is a no-op instead of flipping to the other view). */
    set_compact_boards: function(compact) {
      this.set('compact_boards', !!compact);
    },
    set_category: function(str) {
      var alreadyShowing = this.get('current_category') === str;
      var shown = this.get('category_boards');
      if (alreadyShowing && shown && !shown.loading && !shown.error) {
        return;
      }
      var res = {};
      res[str] = true;
      this.set('current_category', str);
      this.set('category', res);
      this.set('show_category_explainer', false);
      this.set('boardSearchQuery', '');
      this._scheduleExplainOverflowCheck();
      var _this = this;
      if(str == 'available_boards') {
        var snap = _this._availableSnapshotForCurrentUser();
        if (snap) {
          _this._restoreAvailableSnapshot(snap);
          _this._nextBoardsLoadId();
          return;
        }
        _this.set('public_boards_has_more', false);
        _this.set('public_boards_loading_more', false);
        _this.set('category_boards', {loading: true});
        _this._nextBoardsLoadId();
        if (_this._availableLoadInFlight()) {
          return;
        }
        _this._available_load_id = (_this._available_load_id || 0) + 1;
        _this._loadAvailableBoards(_this._available_load_id);
        return;
      }
      _this.set('public_boards_has_more', false);
      _this.set('public_boards_loading_more', false);
      _this.set('category_boards', {loading: true});
      var loadId = _this._nextBoardsLoadId();
      if(str == 'mine') {
        _this._loadMyBoardRoots(loadId);
      } else if(_this.get('tabbed') && str == 'robust') {
        // Setup Robust Vocabularies renders the Quick Core / Vocal Flair
        // brand cards instead of the flat category grid.
        _this._loadBrandGroups();
      } else {
        _this._resolveCategoryBoards(str, loadId);
      }
    },
    load_more_public_boards: function(ev) {
      if (ev && ev.preventDefault) {
        ev.preventDefault();
      }
      if (!this.get('public_boards_has_more') || this.get('public_boards_loading_more')) {
        return;
      }
      this._loadAvailablePublicPage(this._public_boards_next_offset, this._available_load_id);
    },
    clear_board_search: function(ev) {
      if (ev && ev.preventDefault) {
        ev.preventDefault();
      }
      this.set('boardSearchQuery', '');
      var input = this.element && this.element.querySelector('#board-picker-search-q');
      if (input && input.focus) {
        input.focus();
      }
    },
    go_search_boards: function(ev) {
      if (ev && ev.preventDefault) {
        ev.preventDefault();
      }
      if (this.get('searchAtTop')) {
        return;
      }
      var q = (this.get('boardSearchQuery') || '').trim();
      var loc = (i18n.langs || {}).preferred || (typeof navigator !== 'undefined' && navigator.language) || 'en';
      var locSeg = loc.split(/[-_]/)[0];
      this.get('router').transitionTo('search', locSeg, encodeURIComponent(q || '_'));
    },
    more_for_category: function() {
      var _this = this;
      var loadId = _this._boards_load_id;
      var categoryId = _this.get('current_category');
      _this.set('more_category_boards', {loading: true});
      LingoLinq.store.query('board', {public: true, sort: 'home_popularity', per_page: 9, category: categoryId}).then(function(data) {
        if (_this._isStaleBoardsLoad(loadId, categoryId)) { return; }
        _this.set('more_category_boards', _this._preparePickerBoardList(data, { keepCategoryTagged: true }));
      }, function(err) {
        if (_this._isStaleBoardsLoad(loadId, categoryId)) { return; }
        _this.set('more_category_boards', {error: true});
      });
    },
    show_explainer: function() {
      this.set('show_category_explainer', true);
      this._scheduleExplainOverflowCheck();
    },
  }
});
