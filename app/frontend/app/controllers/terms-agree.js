import modal from '../utils/modal';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  appState: service('app-state'),
  router: service('router'),

  actions: {
    confirm: function() {
      var _this = this;
      var user = this.appState.get('currentUser');
      if(user) {
        user.set('terms_agree', true);
        user.save().then(function() {
          _this.send('close');
          _this.appState.set('auto_setup', true);
          if(!user.get('preferences.progress.intro_watched')) {
            // Branch on the home_tour feature flag. When the flag is
            // ON, new accounts skip the setup wizard entirely and
            // land on the home page with the Shepherd tour
            // auto-opening (per Traci's direction 2026-05-27). When
            // the flag is OFF, fall back to the original setup-wizard
            // flow so no behavior regresses for accounts/orgs that
            // haven't opted into the tour.
            if(_this.appState.get('feature_flags.home_tour')) {
              // Mark intro_watched so this branch doesn't re-trigger
              // on future logins (mirrors what setup.js:23-32 does
              // for users who DO go through the wizard).
              var preferences = user.get('preferences') || {};
              var progress = preferences.progress || {};
              user.set('preferences', preferences);
              user.set('preferences.progress', progress);
              user.set('preferences.progress.intro_watched', true);
              // Signal the HomeTour component to auto-fire its tour
              // on the next dashboard render. The component observes
              // this flag and clears it on start (see home-tour.js).
              _this.appState.set('auto_open_home_tour', true);
              // Persist the intro_watched flip. Failure here is
              // non-fatal — the worst case is the user sees this
              // terms-agree branch again on a future login, which
              // is the same outcome as today's setup-wizard path
              // would have if its save failed.
              user.save().then(null, function() { });
            } else {
              _this.router.transitionTo('setup', {queryParams: {user_id: null, page: null}});
            }
          }
        }, function() {
          _this.set('agree_error', true);
        });
      } else {
        _this.send('close');
      }
    }
  }
});
