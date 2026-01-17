import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import Subscription from '../utils/subscription';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import persistence from '../utils/persistence';
import progress_tracker from '../utils/progress_tracker';

export default Controller.extend({
  update_classes: Subscription.obs_func.observes.apply(Subscription.obs_func, Subscription.obs_properties),
  actions: {
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
