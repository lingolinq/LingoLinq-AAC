import Controller from '@ember/controller';
import LingoLinq from '../app';
import persistence from '../utils/persistence';
import app_state from '../utils/app_state';
import i18n from '../utils/i18n';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import { debounce } from '@ember/runloop';
import { inject as service } from '@ember/service';
import { alias } from '@ember/object/computed';
import progress_tracker from '../utils/progress_tracker';
import { filterRootBoards, dedupeByName, sortByNameNatural, boardsPagePreferUserNames } from '../utils/board-roots';
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
  /* Single "Boards" section for the header jump dropdown
     (search-board-jump) — the online search results. The dropdown's filter
     input is the page's live search box, so the boards are the current
     server results, cleaned up the same way the boards page and the
     speak-mode "My Board Collection" panel clean theirs:
       - filterRootBoards drops copy/sub-board records that rode along
         inside a copied set (keeps the visible root tile),
       - dedupeByName collapses identically-named duplicates (e.g. several
         owners shipping the same "CommuniKate Top Page"), and
       - sortByNameNatural orders numerically (Quick Core 84 before 112). */
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
  jump_sections: computed('online_results', function() {
    var userId = app_state.get('currentUser.id');
    var online = this.get('online_results');
    var preferOwners = boardsPagePreferUserNames(app_state);
    return [{
      id: 'boards',
      label_key: 'boards',
      default_label: 'Boards',
      state: online ? (online.loading ? 'loading' : 'loaded') : 'loading',
      boards: sortByNameNatural(dedupeByName(filterRootBoards((online && online.results) || [], userId), { preferUserNames: preferOwners }))
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
        
        var query_filter = str + "::" + locale + "::popularity";
        var params = {q: str, locale: locale, sort: 'popularity'};
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
          LingoLinq.store.query('board', {q: str, user_id: 'self', locale: locale, allow_job: true}).then(function(res) {
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
  _autoSearch: observer('searchString', 'locale', function() {
    debounce(this, this._runAutoSearch, 300);
  }),
  _runAutoSearch: function() {
    if(this.isDestroyed || this.isDestroying) { return; }
    var str = this.get('searchString') || '';
    this.load_results(str);
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
    }
  }
});

