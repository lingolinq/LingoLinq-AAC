import modal from '../utils/modal';
import { inject as service } from '@ember/service';
import i18n from '../utils/i18n';
import Subscription from '../utils/subscription';

export default modal.ModalController.extend({
  appState: service('app-state'),
  router: service('router'),

  opening: function() {
    if(this.appState.get('currentUser')) {
      this.set('model', {
        user: this.appState.get('currentUser'),
        subscription: Subscription.create({user: this.appState.get('currentUser')})
      });
      Subscription.init();
    } else {
      this.set('error', i18n.t('subscribe_no_user', "No user was found"));
    }
  },
  actions: {
    really_subscription_skip: function() {
      var role = this.get('model.subscription.user_type');
      var user = this.get('model.user');
      user.set('preferences.role', role);
      var progress = user.get('preferences.progress') || {};
      progress.skipped_subscribe_modal = true;
      user.set('preferences.progress', progress);
      user.save().then(null, function() { });
      this.send('subscription_skip');
    },
    // Post-subscribe (and skip) now lands on the user's HOME page with the guided
    // tour, not the setup wizard — setup is retired as a user-facing destination
    // (2026-08-15). `return_to_index` is the established helper for "go to my home
    // page" (services/app-state.js:907) and already handles the no-currentUser case.
    // `auto_open_home_tour` is what the terms-agree path sets; GuidedTour observes
    // it and clears it on start, and it is inert when the flag is off.
    subscription_skip: function() {
      modal.close();
      if(window.ga) {
        window.ga('send', 'event', 'Onboarding', 'launch', 'Home tour started');
      }
      this.appState.set('auto_open_home_tour', true);
      this.appState.return_to_index();
    },
    subscription_error: function(err) {
      this.set('error', err);
    },
    subscription_success: function(msg) {
      modal.close();
      this.appState.set('auto_open_home_tour', true);
      this.appState.return_to_index();
      modal.success(msg);
    }
  }
});
