import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { accept_tour_offer, dismiss_tour_offer } from '../utils/tours/tour_offer';

/* The one-time "Take a quick tour (1 min)?" prompt after a communicator's first spoken message
   (utils/tours/tour_offer.js). Shown while `appState.tour_offer_visible` is set and Speak Mode is on.
   Handlers are bound in init because `{{on}}` calls them with no receiver (see components/app-toast.js). */
export default Component.extend({
  appState: service('app-state'),
  tagName: '',

  init() {
    this._super(...arguments);
    var self = this;
    this.start = function() { accept_tour_offer(self.get('appState')); };
    this.notNow = function() { dismiss_tour_offer(self.get('appState')); };
  }
});
