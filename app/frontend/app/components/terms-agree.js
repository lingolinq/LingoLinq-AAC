import Component from '@ember/component';
import { inject as service } from '@ember/service';
import modal from '../utils/modal';

/**
 * Terms agree modal (Phase 2).
 * Converted from terms-agree controller/template.
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  router: service('router'),
  session: service('session'),
  tagName: '',

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    confirm() {
      const _this = this;
      const user = this.get('appState').get('currentUser');
      if (user) {
        user.set('terms_agree', true);
        user.save().then(function() {
          _this.get('modal').close();
          _this.get('appState').set('auto_setup', true);
          if (!user.get('preferences.progress.intro_watched')) {
            // home_tour ON: skip the legacy setup wizard entirely — mark
            // intro_watched and let the home page's Shepherd tour auto-open
            // (mirrors routes/register.js). OFF: fall back to the setup wizard so
            // accounts/orgs not opted into the tour don't regress.
            if (_this.get('appState').get('feature_flags.home_tour')) {
              var preferences = user.get('preferences') || {};
              var progress = preferences.progress || {};
              user.set('preferences', preferences);
              user.set('preferences.progress', progress);
              user.set('preferences.progress.intro_watched', true);
              _this.get('appState').set('auto_open_home_tour', true);
              user.save().then(null, function() { });
            } else {
              _this.get('router').transitionTo('setup', { queryParams: { user_id: null, page: null } });
            }
          }
        }, function() {
          _this.set('agree_error', true);
        });
      } else {
        _this.get('modal').close();
      }
    }
  }
});
