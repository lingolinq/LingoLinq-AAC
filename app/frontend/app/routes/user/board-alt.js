import Route from '@ember/routing/route';
import RSVP from 'rsvp';
import { set as emberSet } from '@ember/object';
import LingoLinq from '../../app';
import { later as runLater } from '@ember/runloop';
import { inject as service } from '@ember/service';
import boardDetailCache from '../../utils/board_detail_cache';

export default Route.extend({
  store: service('store'),
  stashes: service('stashes'),
  appState: service('app-state'),
  templateName: 'board',
  controllerName: 'board',
  model: function(params) {
    var _this = this;
    var parentParams = this.paramsFor('user');
    var user_id = parentParams && parentParams.user_id;
    var boardname = params && params.boardname;
    if (!user_id || !boardname) {
      var res = LingoLinq.store.createRecord('board', { id: 'bad', key: (user_id || '') + '/' + (boardname || '') });
      res.set('lookup_key', (user_id || '') + '/' + (boardname || ''));
      res.set('error', { never_existed: true });
      return RSVP.resolve(res);
    }
    var key = user_id + '/' + boardname;
    var find_board = function(allow_retry) {
      var params_key = key;
      if (_this.appState.get('referenced_user.preferences.home_board.key') == params_key) {
        params_key = _this.appState.get('referenced_user.preferences.home_board.id') || key;
      } else if (_this.appState.get('referenced_board.key') == params_key) {
        params_key = _this.appState.get('referenced_board.id') || key;
      }
      var lookupKey = params_key;
      if (params_key && params_key.indexOf('/') !== -1) {
        var lastSegment = params_key.split('/').pop();
        if (lastSegment && lastSegment.match(/^\d+_\d+/)) {
          lookupKey = lastSegment;
        }
      }
      // Cache-first: reuse JSON prefetched by board-detail / session
      // prefetch so classic view skips a network roundtrip when possible.
      var raw_cached = boardDetailCache.get(key) || boardDetailCache.get(lookupKey);
      if (raw_cached) {
        try {
          var from_cache = _this.store.normalize('board', JSON.parse(JSON.stringify(raw_cached)));
          var cache_record = _this.store.push(from_cache);
          if (cache_record && !cache_record.get('should_reload')) {
            try {
              emberSet(cache_record, 'lookup_key', key);
            } catch (e) {
              runLater(function() {
                if (cache_record && !cache_record.get('isDestroyed') && !cache_record.get('isDestroying')) {
                  try { emberSet(cache_record, 'lookup_key', key); } catch (e2) { }
                }
              }, 100);
            }
            var warmKey = boardDetailCache.is_root_only(key) ? key : lookupKey;
            boardDetailCache.warm_full_tree_if_root_only(warmKey);
            return RSVP.resolve(cache_record);
          }
        } catch (e) { /* fall through to identity-map peek / findRecord */ }
      }
      var cached = _this.store.peekAll('board').find(function(b) {
        if (!b) { return false; }
        var bKey = String(b.get('key'));
        var bId = String(b.get('id'));
        return bKey === String(key) || bId === String(key) || bKey === String(lookupKey) || bId === String(lookupKey);
      });
      if (cached) {
        var data = cached;
        try {
          emberSet(data, 'lookup_key', key);
        } catch (e) {
          runLater(function() {
            if (data && !data.get('isDestroyed') && !data.get('isDestroying')) {
              try { emberSet(data, 'lookup_key', key); } catch (e2) { }
            }
          }, 100);
        }
        return RSVP.resolve(data);
      }
      var obj = _this.store.findRecord('board', lookupKey);
      return obj.then(function(data) {
        if (data) {
          try {
            emberSet(data, 'lookup_key', key);
          } catch (e) {
            runLater(function() {
              if (data && !data.get('isDestroyed') && !data.get('isDestroying')) {
                try { emberSet(data, 'lookup_key', key); } catch (e2) { }
              }
            }, 100);
          }
        }
        return RSVP.resolve(data);
      }, function(err) {
        var error = err;
        if (err && err.errors) {
          error = err.errors[0];
        }
        if (error.status != '404' && allow_retry) {
          return find_board(false);
        } else {
          var res = LingoLinq.store.createRecord('board', { id: 'bad', key: key });
          res.set('lookup_key', key);
          res.set('error', error);
          _this.set('error_record', res);
          return RSVP.resolve(res);
        }
      });
    };
    return find_board(true);
  },
  serialize: function(model) {
    var boardname;
    if (model && typeof model.get === 'function') {
      var key = model.get('key');
      if (key == null || key.indexOf('/') === -1) { boardname = ''; } else { boardname = key.split('/').slice(1).join('/'); }
    } else if (typeof model === 'string') {
      boardname = model;
    } else {
      boardname = (model && model.key) ? model.key.split('/').slice(1).join('/') : '';
    }
    return { boardname: boardname };
  },
  actions: {
    re_transition: function() {
      if (this.get('error_record')) {
        this.set('error_record.retrying', true);
      }
      this.refresh();
    },
  }
});
