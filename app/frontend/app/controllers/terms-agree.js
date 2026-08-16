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
            // New accounts land on the home page with the Shepherd tour, never
            // the setup wizard. This used to branch on the `home_tour` feature
            // flag and fall back to the wizard when it was off; that fallback is
            // gone (2026-08-15) — setup is being retired as a user-facing
            // destination, so there is nothing to fall back TO. With the flag off
            // the user simply lands on their home page and no tour opens, which
            // is the intended degraded state.
            //
            // Mark intro_watched so this branch doesn't re-trigger on future
            // logins (mirrors what setup.js:23-32 does for wizard users).
            var preferences = user.get('preferences') || {};
            var progress = preferences.progress || {};
            user.set('preferences', preferences);
            user.set('preferences.progress', progress);
            user.set('preferences.progress.intro_watched', true);
            // Signal the GuidedTour component to auto-fire on the next dashboard
            // render. It observes this flag and clears it on start
            // (components/guided-tour.js:329). Harmless when `home_tour` is off:
            // the component isn't mounted, so nothing consumes it.
            _this.appState.set('auto_open_home_tour', true);
            // Persist the intro_watched flip. Failure here is non-fatal — the
            // worst case is the user sees this terms-agree branch again on a
            // future login.
            user.save().then(null, function() { });
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
