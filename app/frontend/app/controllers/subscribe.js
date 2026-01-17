import { inject as service } from '@ember/service';
import modal from '../utils/modal';

import app_state from '../utils/app_state';
import i18n from '../utils/i18n';
import Subscription from '../utils/subscription';

export default modal.ModalController.extend({
  appState: service('app-state'),
  modal: service(),

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
    subscription_skip: function() {
      this.modal.close();
      if(window.ga) {
        window.ga('send', 'event', 'Setup', 'launch', 'Setup started');
      }
      this.appState.get('auto_setup', true);
      this.transitionToRoute('setup', {queryParams: {user_id: null, page: null}});
    },
    subscription_error: function(err) {
      this.set('error', err);
    },
    subscription_success: function(msg) {
      this.modal.close();
      this.appState.get('auto_setup', true);
      this.transitionToRoute('setup', {queryParams: {user_id: null, page: null}});
      modal.success(msg);
    }
  }
});
