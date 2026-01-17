import Route from '@ember/routing/route';
import RSVP from 'rsvp';
import editManager from '../utils/edit_manager';
import obf from '../utils/obf';
import stashes from '../utils/_stashes';
import modal from '../utils/modal';
import app_state from '../utils/app_state';
import i18n from '../utils/i18n';
import CoughDrop from '../app';
import session from '../utils/session';
import { later as runLater } from '@ember/runloop';

export default Route.extend({
  model: function(params) {
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
      if(app_state.get('sessionUser.global_integrations.' + integration_id)) {
        integration_id = app_state.get('sessionUser.global_integrations.' + integration_id);
      } else if(stashes.get('global_integrations.' + integration_id)) {
        integration_id = stashes.get('global_integrations.' + integration_id);
      }
      var action = parts.join(':');
      var obj = CoughDrop.store.createRecord('board');
      obj.set('integration', true);
      obj.set('key', params.key);
      obj.set('id', 'i' + integration_id);
      return CoughDrop.store.findRecord('integration', integration_id).then(function(tool) {
        var reload = RSVP.resolve(tool);
        if(!tool.get('render_url')) {
          reload = tool.reload();
        }
        return reload.then(function(tool) {
          var user_token = tool.get('user_token');
          if(user_token && app_state.get('currentUser.id') != app_state.get('sessionUser.id')) {
            user_token = user_token + ":as_user_id=" + app_state.get('currentUser.id');
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
      if(session.get('access_token') && !app_state.get('currentUser')) {
        wait_for_user = new RSVP.Promise(function(res, rej) {
          var trying = function() {
            trying.tries = (trying.tries || 0) + 1;
            if(app_state.get('currentUser') || trying.tries > 3) {
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
      var _this = this;
      var find_board = function(allow_retry) {
        var key = params.key;
        if(app_state.get('referenced_user.preferences.home_board.key') == key) {
          key = app_state.get('referenced_user.preferences.home_board.id') || params.key;
        } else if(app_state.get('referenced_board.key') == key) {
          key = app_state.get('referenced_board.id') || params.key;
        }
        var obj = _this.store.findRecord('board', key);
        return obj.then(function(data) {
          data.set('lookup_key', params.key);
          return RSVP.resolve(data);
        }, function(err) {
          var error = err;
          if(err && err.errors) {
            error = err.errors[0];
          }
          if(error.status != '404' && allow_retry) {
            return find_board(false);
          } else {
            var res = CoughDrop.store.createRecord('board', {id: 'bad', key: params.key});
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
  actions: {
    re_transition: function() {
      if(this.get('error_record')) {
        this.set('error_record.retrying', true);
      }
      this.refresh();
    },
  }
});
