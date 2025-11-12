import Controller from '@ember/controller';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import session from '../utils/session';
import persistence from '../utils/persistence';
import LingoLinq from '../app';
import { later as runLater } from '@ember/runloop';
import app_state from '../utils/app_state';
import capabilities from '../utils/capabilities';

export default Controller.extend({
  actions: {
    update_org: function() {
      var org = this.get('model');
      org.save().then(null, function(err) {
        console.log(err);
        modal.error(i18n.t('org_update_failed', 'Organization update failed unexpectedly'));
      });
    },
    jobs: function() {
      if(capabilities.installed_app) {
        modal.error(i18n.t('not_allowed_in_app', "Job tracking only available on the web"));
        return;
      }
      persistence.ajax('/api/v1/auth/admin', {type: 'POST', data: {}}).then(function(res) {
        if(res && res.success) {
          location.href = '/jobby';
        } else {
          modal.error(i18n.t('jobs_unauthorized', "Job tracking not authorized"));
        }
      }, function(err) {
        modal.error(i18n.t('unauthorized', "Not authorized"));
      })
    },
    masquerade: function() {
      if(this.get('model.admin') && this.get('model.permissions.manage')) {
        var user_name = this.get('masquerade_user_name');
        var _this = this;
        this.store.findRecord('user', user_name).then(function(u) {
          var data = session.restore();
          data.original_user_name = data.user_name;
          data.as_user_id = user_name;
          data.user_name = user_name;
          session.persist(data).then(function() {
            app_state.return_to_index();
            runLater(function() {
              location.reload();
            });
          });
        }, function() {
          modal.error(i18n.t('couldnt_find_user', "Couldn't retrieve user \"%{user_name}\" for masquerading", {user_name: user_name}));
        });
      }
    },
    find_board: function() {
      var key = this.get('search_board');
      var _this = this;
      if(key) {
        LingoLinq.store.findRecord('board', key).then(function(res) {
          _this.transitionToRoute('board', res.get('key'));
        }, function(err) {
          if(err.deleted && err.key) {
            _this.transitionToRoute('board', err.key);
          } else {
            modal.error(i18n.t('no_boards_found', "No boards found matching that lookup"));
          }
        });
      }
    },
    find_user: function() {
      var q = this.get('search_user');
      var _this = this;
      if(q) {
        var opts = {q: q};
        if(!this.get('model.admin')) {
          opts.org_id = this.get('model.id');
        }
        LingoLinq.store.query('user', opts).then(function(res) {
          if(res.content.length === 0) {
            modal.warning(i18n.t('no_user_result', "No results found for \"%{q}\"", {q: q}));
          } else if(res.content.length == 1) {
            _this.transitionToRoute('user.index', res.map(function(i) { return i; })[0].get('user_name'));
          } else {
            modal.open('user-results', {list: res, q: q});
          }
        }, function() {
          modal.error(i18n.t('error_searching', "There was an unexpected error while search for the user"));
        });
      }
    }
  }
});
