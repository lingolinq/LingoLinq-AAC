import Controller from '@ember/controller';
import LingoLinq from '../app';
import persistence from '../utils/persistence';
import app_state from '../utils/app_state';
import i18n from '../utils/i18n';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';
import { alias } from '@ember/object/computed';
import progress_tracker from '../utils/progress_tracker';
import { filterRootBoards, dedupeByName, sortByNameNatural, sortBySearchQuery, boardsPagePreferUserNames } from '../utils/board-roots';
import { groupBoardsByBrand } from '../utils/board-brands';

export default Controller.extend({
  appState: service('app-state'),
  // Alias for template compatibility (template uses this.app_state)
  app_state: alias('appState'),
  router: service('router'),

  title: computed('searchString', function() {
    return "Search results for " + this.get('searchString');
  }),
  locales: computed(function() {
    var list = i18n.get('translatable_locales');
    var res = [{name: i18n.t('choose_locale', '[Choose a Language]'), id: ''}];
    for(var key in list) {
      res.push({name: list[key], id: key});
    }
    res.push({name: i18n.t('any_language', "Any Language"), id: 'any'});
    return res;
  }),

  // ── Client-side panel filter ────────────────────────────────────
  // Narrows the two-pane panel list only (name/key match). The online
  // search box (SearchBoardJump → load_results) still queries the server,
  // so the user keeps both: search the internet + filter what's shown.
  panel_filter: '',
  panel_filter_active: computed('panel_filter', function() {
    return !!(this.get('panel_filter') || '').trim();
  }),
  /* The user's default language for the filter — the resolved preferred locale,
     mirroring routes/search.js#model (the "unfiltered" language state). A locale
     that differs from this is a deliberate language filter. */
  default_locale: computed(function() {
    var preferred = (i18n.langs || {}).preferred || (typeof window !== 'undefined' && window.navigator && window.navigator.language) || 'en';
    var list = i18n.get('translatable_locales') || {};
    var normalized = String(preferred).replace(/-/g, '_');
    if(list[normalized]) { return normalized; }
    var base = normalized.split(/_/)[0];
    return list[base] ? base : 'en';
  }),
  /* An active filter = a non-empty search query OR a language other than the
     default (the user selected a specific/Any language). Drives the "Clear
     filter" affordance shown to the right of the filter row. */
  has_active_filter: computed('searchString', 'locale', 'default_locale', function() {
    var q = (this.get('searchString') || '').trim();
    var locale = this.get('locale');
    return !!q || (!!locale && locale !== this.get('default_locale'));
  }),
  /* Header combobox binds `searchString`; `panel_filter` is the optional
     in-panel narrow. Either one should hide non-matching tiles. */
  _filter_query: computed('searchString', 'panel_filter', function() {
    return (this.get('panel_filter') || this.get('searchString') || '').trim();
  }),
  _filter_boards: function(boards) {
    var q = (this.get('_filter_query') || '').toLowerCase();
    if(!q || !boards) { return boards || []; }
    return boards.filter(function(b) {
      if(!b) { return false; }
      var name = ((b.get ? b.get('name') : b.name) || '').toLowerCase();
      var key = ((b.get ? b.get('key') : b.key) || '').toLowerCase();
      return name.indexOf(q) !== -1 || key.indexOf(q) !== -1;
    });
  },
  filtered_online_groups: computed('online_groups', '_filter_query', function() {
    var _this = this;
    var q = this.get('_filter_query');
    return (this.get('online_groups') || []).map(function(g) {
      var boards = sortBySearchQuery(_this._filter_boards(g.boards || []), q);
      return { id: g.id, label_key: g.label_key, default_label: g.default_label, boards: boards };
    }).filter(function(g) { return g.boards.length > 0; });
  }),
  filtered_my_boards: computed('personal_results.results', '_filter_query', function() {
    // The user_id='self' query returns EVERY owned board, including sub-board
    // copies that rode along inside a copied set. filterRootBoards drops those
    // (keys on copy_id), keeping only the visible root tiles — same cleanup the
    // board-collection drawer and boards page apply to My Boards.
    var boards = filterRootBoards(this.get('personal_results.results') || [], app_state.get('currentUser.id'));
    return sortBySearchQuery(this._filter_boards(boards), this.get('_filter_query'));
  }),

  // ── Board preview (left pane) ────────────────────────────────────
  // The selected board is reloaded (select_preview_board) and rendered by
  // <board-preview-canvas> — the same self-contained renderer the board-preview
  // modal uses, so no board-detail controller coupling / ordered_buttons build.
  preview_board: null,
  preview_loading: false,
  preview_error: false,
  /* Single "Boards" section for the header jump dropdown
     (search-board-jump) — the online catalog, cleaned up the same way the
     boards page and the speak-mode "My Board Collection" panel clean theirs:
       - filterRootBoards drops copy/sub-board records that rode along
         inside a copied set (keeps the visible root tile),
       - dedupeByName collapses identically-named duplicates (e.g. several
         owners shipping the same "CommuniKate Top Page"),
       - the header query filters to name/key matches, and
       - sortBySearchQuery puts prefix matches first ("quick" → Quick Core
         24 before CommuniKate) then natural name order (84 before 112). */
  /* Online search results grouped by brand family (CommuniKate, Quick
     Core, Sequoia, Vocal Flair, then "Other Boards") so the grid separates
     boards by type. `online_results.results` is already deduped + natural-
     sorted, and grouping preserves that order within each brand. */
  online_groups: computed('online_results.results', function() {
    var online = this.get('online_results');
    if(!online || !online.results) { return []; }
    return groupBoardsByBrand(online.results);
  }),
  // Static i18n declarations — the grid group headers render via dynamic
  // `{{t group.default_label key=group.label_key}}`, which i18n_generator's
  // static parser can't extract. Brand keys are declared in
  // board-collection.js; the grid adds the "Other Boards" bucket.
  // eslint-disable-next-line no-unused-vars
  _search_group_i18n_extractor_no_op: function() {
    i18n.t('other_boards', "Other Boards");
  },
  jump_sections: computed('online_results', '_filter_query', function() {
    var userId = app_state.get('currentUser.id');
    var online = this.get('online_results');
    var preferOwners = boardsPagePreferUserNames(app_state);
    var q = this.get('_filter_query');
    var boards = this._filter_boards(dedupeByName(filterRootBoards((online && online.results) || [], userId), { preferUserNames: preferOwners }));
    return [{
      id: 'boards',
      label_key: 'boards',
      default_label: 'Boards',
      state: online ? (online.loading ? 'loading' : 'loaded') : 'loading',
      boards: sortBySearchQuery(boards, q)
    }];
  }),
  // Natural (numeric-aware) sort by display name, so "Quick Core 84" sorts
  // before "Quick Core 112" (plain lexicographic put 112 first because
  // '1' < '8'). Delegates to the shared util the jump dropdown uses so the
  // grid and dropdown order boards consistently.
  sort_boards_by_name: function(boards) {
    return sortByNameNatural(boards);
  },

  load_results: function(str) {
    var _this = this;
    this.set('online_results', {loading: true, results: []});

    function loadBoards() {
      if(persistence.get('online')) {
        _this.set('online_results', {loading: true, results: []});
        _this.set('personal_results', {loading: true, results: []});
        var locale = (_this.get('locale') || (i18n.langs || {}).preferred || window.navigator.language || 'en').split(/-/)[0];
        // TODO: ensure that search results show up localized
        // for translated boards with a different default locale
        _this._catalogLocale = locale;
        var query_filter = str + "::" + locale + "::popularity";
        // Featured catalog (empty q). Typed queries filter that list
        // client-side by name/key — production BoardLocale text search
        // (q=quick) currently returns 0, and even when it hits it matches
        // button labels, so "quick" ranked CommuniKate above Quick Core.
        var params = {q: '', locale: locale, sort: 'popularity'};
        var search_key = JSON.stringify(params);
        var lookup = null;
        if(_this.get('search_promise.key') == search_key) {
          lookup = _this.get('search_promise.promise');
        } else {
          lookup = LingoLinq.store.query('board', params);
          _this.set('search_promise', {promise: lookup, key: search_key});
        }
        lookup.then(function(res) {
          _this.set('search_promise', null);
          /* Public search returns the same board from multiple owners
             (e.g. "Vocal Flair 84" by several users). Collapse exact-name
             duplicates, keeping the first — server popularity order means
             that's the most-prominent one. */
          _this.set('online_results', {results: dedupeByName(_this.sort_boards_by_name(res.slice()), { preferUserNames: boardsPagePreferUserNames(app_state) })});
        }, function() {
          _this.set('search_promise', null);
          _this.set('online_results', {results: []});
        });
        if(app_state.get('currentUser')) {
          // Owned-boards query must use the user's REAL global id — the server
          // resolves `user_id` via find_by_path, and the literal string 'self'
          // has no user_name match, so it 404s and My Boards comes back empty.
          // The board-detail "My Board Collection" drawer this page mirrors uses
          // currentUser.id for exactly this reason (board-collection.js).
          LingoLinq.store.query('board', {q: str, user_id: app_state.get('currentUser.id'), locale: locale, allow_job: true}).then(function(res) {
            if(res.meta && res.meta.progress) {
              progress_tracker.track(res.meta.progress, function(event) {
                if(event.status == 'errored') {
                  _this.set('personal_results', {results: []});
                } else if(event.status == 'finished') {
                  var result = [];
                  event.result.board.forEach(function(board) {
                    result.push(LingoLinq.store.push({ data: {
                      id: board.id,
                      type: 'board',
                      attributes: board
                    }}));
                  });
                  _this.set('personal_results', {results: _this.sort_boards_by_name(result)});
                }
              });
            } else {
              _this.set('personal_results', {results: _this.sort_boards_by_name(res.slice())});
            }
          }, function() {
            _this.set('personal_results', {results: []});
          });
        } else{
          _this.set('personal_results', {results: []});
        }
      } else {
        _this.set('online_results', {results: []});
        _this.set('personal_results', {results: []});
      }
    }
    loadBoards();

    persistence.addObserver('online', function() {
      loadBoards();
    });

  },
  /** Live filter: re-run the search whenever the query or locale changes (debounced 300ms). */
  /* Hand-rolled rather than @ember/runloop debounce: ember/no-runloop bans
     runloop helpers in favour of ember-lifeline, which is not installed. */
  _autoSearch: observer('searchString', 'locale', function() {
    if (this._autoSearchTimer) { clearTimeout(this._autoSearchTimer); }
    var _this = this;
    this._autoSearchTimer = setTimeout(function() {
      _this._autoSearchTimer = null;
      _this._runAutoSearch();
    }, 300);
  }),
  willDestroy: function() {
    this._super.apply(this, arguments);
    if (this._autoSearchTimer) {
      clearTimeout(this._autoSearchTimer);
      this._autoSearchTimer = null;
    }
  },
  /* Changing the LANGUAGE filter invalidates the current preview — that board is
     in the previous language, and the panel is about to be re-scoped to the new
     one (load_results below re-queries with the new locale). Drop the preview
     back to its empty state so a stale board doesn't linger, and so the canvas
     stops re-rendering against the changing locale (that churn is what made the
     preview shrink/enlarge repeatedly). Only `locale` — typing in the search box
     narrows the panel but should keep the current preview. */
  _clearPreviewOnLocaleChange: observer('locale', function() {
    this.set('preview_board', null);
    this.set('preview_loading', false);
    this.set('preview_error', false);
  }),
  _runAutoSearch: function() {
    if(this.isDestroyed || this.isDestroying) { return; }
    var str = this.get('searchString') || '';
    var locale = (this.get('locale') || '').split(/-/)[0];
    /* Typing only filters the in-memory catalog (jump_sections /
       filtered_online_groups). Re-fetch when the language changes or
       the catalog has not loaded yet — a keystroke refetch would flash
       "Loading boards…" and, with q=str, used to wipe the list. */
    if(!this.get('online_results.results') || this._catalogLocale !== locale) {
      this.load_results(str);
    }
    /* clear_filter resets the language to '' ([Choose a Language]); skip the
       route transition so the route's empty-locale→preferred resolution doesn't
       snap the dropdown back to a concrete language. */
    if(this._suppressTransition) { this._suppressTransition = false; return; }
    this.router.transitionTo('search', this.get('locale'), encodeURIComponent(str || '_'));
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
    /* Live search text from the find-boards combobox (SearchBoardJump).
       Must be a real action, NOT `(mut this.searchString)`: SearchBoardJump is a
       classic @ember/component, and a mut cell reaches one UNWRAPPED TO ITS
       VALUE. The component reads `this.get('onQueryChange')` and guards with
       `typeof fn === 'function'`, so the cell arrived as the string "food" and
       every keystroke was silently discarded — no error, no console warning.
       That broke three things at once: typing never filtered, the x clear button
       did nothing, and Enter re-submitted the PREVIOUS query (searchBoards reads
       a searchString that had never changed). Verified in-browser by inspecting
       the live component: onQueryChange was type "string" while the sibling
       `@onSelect={{this.ctrlAction ...}}` was type "function" and worked. */
    updateSearchString: function(value) {
      this.set('searchString', value || '');
    },
    searchBoards: function() {
      this.load_results(this.get('searchString'));
      this.router.transitionTo('search', this.get('locale'), encodeURIComponent(this.get('searchString') || '_'));
    },
    /* Picked a board from the find-boards search box — open it in the user's
       PREFERRED board view, mirroring boards-page tile navigation
       (user/index.js#open_board_in_user_view):
         - default / 'modern' → user.board-detail.index (the speak page)
         - explicit 'classic'  → user.board-alt.index (the classic grid)
       Previously this used transitionTo('board', key), whose route ALWAYS
       replaceWith('user.board-alt', …) (routes/board.js#beforeModel) — so every
       pick landed on board-alt regardless of preference. Non user/board keys
       (integrations, obf) still go through the 'board' route, which handles them. */
    select_jump_board: function(board) {
      if(!board) { return; }
      var key = board.get ? board.get('key') : board.key;
      if(!key) { return; }
      var parts = key.split('/');
      if(parts.length !== 2) { this.router.transitionTo('board', key); return; }
      var pref = app_state.get('currentUser.preferences.board_view_style');
      var route = (pref === 'classic') ? 'user.board-alt.index' : 'user.board-detail.index';
      this.router.transitionTo(route, parts[0], parts[1]);
    },

    // Row click in the panel → PREVIEW the board on the left (no navigation).
    // Loads the full board (search records may be shallow), then builds the
    // ordered_buttons grid and renders it via board-detail-grid per prefs.
    select_preview_board: function(board) {
      var _this = this;
      if(!board) { return; }
      this.set('preview_error', false);
      this.set('preview_loading', true);
      this.set('preview_board', board);
      // If the user has scrolled down, bring them back to the top so the newly
      // selected board's preview is in view.
      try {
        var content = document.getElementById('content');
        if(content) { content.scrollTop = 0; }
        if(typeof window !== 'undefined' && window.scrollTo) { window.scrollTo({ top: 0, behavior: 'smooth' }); }
      } catch(e) { /* non-critical */ }
      // Mirror components/board-preview.js: reload the board so it ships with its
      // buttons + image_urls, then hand it to <board-preview-canvas> (the SAME
      // renderer the board-preview modal uses) to draw the exact grid.
      if(!board.reload) { this.set('preview_loading', false); return; }
      board.reload().then(function(full) {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        if(_this.get('preview_board') !== board) { return; } // superseded by a newer pick
        _this.set('preview_board', full || board);
        _this.set('preview_loading', false);
      }, function() {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        if(_this.get('preview_board') !== board) { return; }
        _this.set('preview_loading', false);
        _this.set('preview_error', true);
      });
    },
    update_panel_filter: function(event) {
      this.set('panel_filter', (event && event.target) ? event.target.value : '');
    },
    clear_panel_filter: function() {
      this.set('panel_filter', '');
    },
    /* Clear the active filters: empty the search query AND reset the language
       dropdown to "[Choose a Language]" (id ''). `_suppressTransition` keeps the
       ensuing _runAutoSearch from route-transitioning — the route resolves an
       empty locale back to the preferred language and would snap the dropdown
       off "[Choose a Language]". load_results still reloads the panel (it falls
       back to the preferred locale for the actual query). */
    clear_filter: function() {
      this._suppressTransition = true;
      this.set('searchString', '');
      this.set('locale', '');
    },
    newBoard: function() {
      this.router.transitionTo('create-board-new');
    }
  }
});

