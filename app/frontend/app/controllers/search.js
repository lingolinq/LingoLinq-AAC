import Controller from '@ember/controller';
import LingoLinqAAC from '../app';
import persistence from '../utils/persistence';
import app_state from '../utils/app_state';
import session from '../utils/session';
import i18n from '../utils/i18n';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import progress_tracker from '../utils/progress_tracker';

export default Controller.extend({
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
  load_results: function(str) {
    var _this = this;
    // Defensive: ensure str is always a string, never undefined or null
    str = str || '';
    this.set('online_results', {loading: true, results: []});
    this.set('local_results', {loading: true, results: []});

    if(session.get('isAuthenticated')) {
      persistence.find_boards(str).then(function(res) {
        _this.set('local_results', {results: res});
      }, function() { _this.set('local_results', {results: []}); });
    } else {
      _this.set('local_results', {impossible: true});
    }

    function loadBoards() {
      if(persistence.get('online')) {
        // DEFENSIVE: Check if the Ember Data store is available before using it
        // The store may not be initialized if the application route hasn't fully loaded yet
        if(!LingoLinqAAC.store || !LingoLinqAAC.store.query) {
          console.warn('Store not available in search controller, skipping board query');
          _this.set('online_results', {results: []});
          _this.set('personal_results', {results: []});
          return;
        }

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
          lookup = LingoLinqAAC.store.query('board', params);
          _this.set('search_promise', {promise: lookup, key: search_key});
        }
        lookup.then(function(res) {
          _this.set('search_promise', null);
          _this.set('online_results', {results: res.map(function(i) { return i; })});
        }, function() {
          _this.set('search_promise', null);
          _this.set('online_results', {results: []});
        });
        if(app_state.get('currentUser')) {
          LingoLinqAAC.store.query('board', {q: str, user_id: 'self', locale: locale, allow_job: true}).then(function(res) {
            if(res.meta && res.meta.progress) {
              progress_tracker.track(res.meta.progress, function(event) {
                if(event.status == 'errored') {
                  _this.set('personal_results', {results: []});
                } else if(event.status == 'finished') {
                  var result = [];
                  event.result.board.forEach(function(board) {
                    result.push(LingoLinqAAC.store.push({ data: {
                      id: board.id,
                      type: 'board',
                      attributes: board
                    }}));
                  });
                  _this.set('personal_results', {results: result});
                }
              });
            } else {
              _this.set('personal_results', {results: res.map(function(i) { return i; })});
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
  actions: {
    searchBoards: function() {
      this.load_results(this.get('searchString'));
      this.transitionToRoute('search', this.get('locale'), encodeURIComponent(this.get('searchString') || '_'));
    }
  }
});

