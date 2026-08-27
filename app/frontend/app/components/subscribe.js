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
  init() {
    this._super(...arguments);
    var self = this;
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };
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
    // Post-subscribe (and skip) now lands on the user's HOME page with the guided
    // tour, not the setup wizard — setup is retired as a user-facing destination
    // (2026-08-15). `return_to_index` is the established "go to my home page"
    // helper (services/app-state.js:907) and handles the no-currentUser case.
    subscription_skip() {
      modal.close();
      if (window.ga) {
        window.ga('send', 'event', 'Onboarding', 'launch', 'Home tour started');
      }
      this.appState.set('auto_open_home_tour', true);
      this.appState.return_to_index();
    },
    subscription_error(err) {
      this.set('error', err);
    },
    subscription_success(msg) {
      modal.close();
      this.appState.set('auto_open_home_tour', true);
      this.appState.return_to_index();
      modal.success(msg);
    }
  }
});
