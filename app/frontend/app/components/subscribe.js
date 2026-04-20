import Component from '@ember/component';
import { inject as service } from '@ember/service';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import Subscription from '../utils/subscription';

/**
 * Subscribe modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  router: service('router'),
  tagName: '',

  didInsertElement() {
    this._super(...arguments);
    if (this.appState.get('currentUser')) {
      this.set('model', {
        user: this.appState.get('currentUser'),
        subscription: Subscription.create({ user: this.appState.get('currentUser') })
      });
      Subscription.init();
    } else {
      this.set('error', i18n.t('subscribe_no_user', "No user was found"));
    }
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    dismiss_subscribe_modal() {
      const user = this.get('model.user');
      if (user && !user.get('really_expired')) {
        const role = this.get('model.subscription.user_type');
        user.set('preferences.role', role);
        const progress = user.get('preferences.progress') || {};
        progress.skipped_subscribe_modal = true;
        user.set('preferences.progress', progress);
        user.save().then(null, function() {});
      }
      modal.close();
    },
    opening() {},
    closing() {},
    really_subscription_skip() {
      const role = this.get('model.subscription.user_type');
      const user = this.get('model.user');
      user.set('preferences.role', role);
      const progress = user.get('preferences.progress') || {};
      progress.skipped_subscribe_modal = true;
      user.set('preferences.progress', progress);
      user.save().then(null, function() {});
      this.send('subscription_skip');
    },
    subscription_skip() {
      modal.close();
      if (window.ga) {
        window.ga('send', 'event', 'Setup', 'launch', 'Setup started');
      }
      this.appState.set('auto_setup', true);
      this.get('router').transitionTo('setup', { queryParams: { user_id: null, page: null } });
    },
    subscription_error(err) {
      this.set('error', err);
    },
    subscription_success(msg) {
      modal.close();
      this.appState.set('auto_setup', true);
      this.get('router').transitionTo('setup', { queryParams: { user_id: null, page: null } });
      modal.success(msg);
    }
  }
});
