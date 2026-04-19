import Route from '@ember/routing/route';
import RSVP from 'rsvp';
import { set as emberSet } from '@ember/object';
import editManager from '../utils/edit_manager';
import obf from '../utils/obf';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import LingoLinq from '../app';
import session from '../utils/session';
import { later as runLater } from '@ember/runloop';
import { inject as service } from '@ember/service';

export default Route.extend({
  router: service('router'),
  store: service('store'),
  stashes: service('stashes'),
  appState: service('app-state'),
  beforeModel: function(transition) {
    var to = transition.to;
    var key = (to && to.parent && to.parent.params && to.parent.params.key) ||
              (to && to.params && to.params.key) ||
              (transition.params && transition.params['board'] && transition.params['board'].key);
    if(key && key.indexOf('/') !== -1 && !key.match(/^integrations\//) && !key.match(/^obf\//)) {
      var parts = key.split('/');
      var user_id = parts[0];
      var boardname = parts.slice(1).join('/');
      this.router.replaceWith('user.board-alt', user_id, boardname);
    }
  },
  model: function(params) {
    var _this = this;
    // TODO: when on the home screen if you have a large board and hit to open
    // it, it takes a while to change views. This does not, however, happen
    // if you hit the same board in the 'popular boards' list since those
    // views already have a record for the board, albeit a limited one
    // that must be reloaded..
    if(params.key && params.key.match(/^integrations\//)) {
      var parts = params.key.split(/\//);
      var id = parts[1];
      parts = id.split(/:/);
      var integration_id = parts.shift();
      if(_this.appState.get('sessionUser.global_integrations.' + integration_id)) {
        integration_id = _this.appState.get('sessionUser.global_integrations.' + integration_id);
      } else if(_this.stashes.get('global_integrations.' + integration_id)) {
        integration_id = _this.stashes.get('global_integrations.' + integration_id);
      }
      var action = parts.join(':');
      var obj = LingoLinq.store.createRecord('board');
      obj.set('integration', true);
      obj.set('key', params.key);
      obj.set('id', 'i' + integration_id);
      return LingoLinq.store.findRecord('integration', integration_id).then(function(tool) {
        var reload = RSVP.resolve(tool);
        if(!tool.get('render_url')) {
          reload = tool.reload();
        }
        return reload.then(function(tool) {
          var user_token = tool.get('user_token');
          if(user_token && _this.appState.get('currentUser.id') != _this.appState.get('sessionUser.id')) {
            user_token = user_token + ":as_user_id=" + _this.appState.get('currentUser.id');
          }
          obj.set('embed_url', tool.get('render_url'));
          obj.set('integration_name', tool.get('name') || i18n.t('external_integration', "External Integration"));
          obj.set('user_token', user_token);
          obj.set('action', action);
          return RSVP.resolve(obj);
        }, function(err) {
          return RSVP.resolve(obj);
        });
      }, function(err) {
        return RSVP.resolve(obj);
      });
    } else if(params.key.match(/^obf\//)) {
      var wait_for_user = RSVP.resolve();
      if(session.get('access_token') && !_this.appState.get('currentUser')) {
        wait_for_user = new RSVP.Promise(function(res, rej) {
          var trying = function() {
            trying.tries = (trying.tries || 0) + 1;
            if(_this.appState.get('currentUser') || trying.tries > 3) {
              res();
            } else {
              runLater(trying, 500);
            }
          };
          runLater(trying, 500);
        });
      }
      return wait_for_user.then(function() {
        return obf.lookup(params.key.split(/\//)[1]);
      });
    } else {
      var find_board = function(allow_retry) {
        var key = params.key;
        if(_this.appState.get('referenced_user.preferences.home_board.key') == key) {
          key = _this.appState.get('referenced_user.preferences.home_board.id') || params.key;
        } else if(_this.appState.get('referenced_board.key') == key) {
          key = _this.appState.get('referenced_board.id') || params.key;
        }
        // When URL is user_id/board_id (e.g. /self/1_9), API expects board global id (e.g. 1_9)
        var lookupKey = key;
        if(key && key.indexOf('/') !== -1) {
          var lastSegment = key.split('/').pop();
          if(lastSegment && lastSegment.match(/^\d+_\d+/)) {
            lookupKey = lastSegment;
          }
        }
        // Use cached board from list (e.g. dashboard "Mine") when key matches, so board displays immediately
        var cached = _this.store.peekAll('board').find(function(b) {
          if(!b) { return false; }
          var bKey = String(b.get('key'));
          var bId = String(b.get('id'));
          return bKey === String(params.key) || bId === String(params.key) || bKey === String(lookupKey) || bId === String(lookupKey);
        });
        if(cached) {
          var data = cached;
          try {
            emberSet(data, 'lookup_key', params.key);
          } catch(e) {
            runLater(function() {
              if(data && !data.get('isDestroyed') && !data.get('isDestroying')) {
                try { emberSet(data, 'lookup_key', params.key); } catch(e2) { }
              }
            }, 100);
          }
          return RSVP.resolve(data);
        }
        var obj = _this.store.findRecord('board', lookupKey);
        return obj.then(function(data) {
          // Set lookup_key safely - wrap in try/catch to handle state issues
          if(data) {
            try {
              // Use emberSet to avoid triggering state changes that cause notFound errors
              emberSet(data, 'lookup_key', params.key);
            } catch(e) {
              // If setting fails due to state, try again later
              runLater(function() {
                if(data && !data.get('isDestroyed') && !data.get('isDestroying')) {
                  try {
                    emberSet(data, 'lookup_key', params.key);
                  } catch(e2) {
                    // Ignore errors if record is in wrong state
                  }
                }
              }, 100);
            }
          }
          return RSVP.resolve(data);
        }, function(err) {
          var error = err;
          if(err && err.errors) {
            error = err.errors[0];
          }
          if(error.status != '404' && allow_retry) {
            return find_board(false);
          } else {
            var res = LingoLinq.store.createRecord('board', {id: 'bad', key: params.key});
            res.set('lookup_key', params.key);
            res.set('error', error);
            _this.set('error_record', res);
            return RSVP.resolve(res);
          }
        });
      };
      return find_board(true);
    }
  },
  afterModel: function(model) {
    return this._super(...arguments);
  },
  serialize: function(model) {
    // Ensure link-to "board" @model={{board}} produces URL from board.key (e.g. /example/yesno)
    var key = model && (typeof model.get === 'function' ? model.get('key') : model.key);
    return key != null ? { key: key } : {};
  },
  actions: {
    re_transition: function() {
      if(this.get('error_record')) {
        this.set('error_record.retrying', true);
      }
      this.refresh();
    },
  }
});
