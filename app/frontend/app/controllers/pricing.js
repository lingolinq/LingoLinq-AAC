import Controller from '@ember/controller';
import Subscription from '../utils/subscription';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import persistence from '../utils/persistence';
import progress_tracker from '../utils/progress_tracker';
import { inject as service } from '@ember/service';
import { alias } from '@ember/object/computed';

export default Controller.extend({
  appState: service('app-state'),
  // Alias for template compatibility (template uses this.app_state)
  app_state: alias('appState'),
  update_classes: Subscription.update_classes_observer,
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
    openCloudExtras() {
      modal.open('cloud-extras');
    },
    reset: function() {
      this.get('subscription').reset();
    },
    set_user_type: function(type) {
      this.set('subscription.user_type', type);
    },
    set_subscription_type: function(type) {
      this.set('subscription.subscription_type', type);
    },
    show_expiration_notes: function() {
      this.set('show_expiration_notes', !this.get('show_expiration_notes'));
    },
    show_bulk_purchase: function() {
      this.set('show_bulk_purchase', !this.get('show_bulk_purchase'));
    },
    show_alternative_pricing: function() {
      this.set('show_alternative_pricing', !this.get('show_alternative_pricing'));
    },
    set_subscription: function(amount) {
     this.set('subscription.subscription_amount', amount);
    }
  }
});
