import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed, observer } from '@ember/object';
import { accept_tour_offer, dismiss_tour_offer, end_speak_mode_tour_state } from '../utils/tours/tour_offer';

// How long Speak Mode must stay off before the offer ends: the board page changing goes through a moment
// with no current board, which reads as "not in Speak Mode".
var LEFT_SPEAK_MODE_MS = 1500;

/* The one-time "Take a quick tour (1 min)?" prompt after a communicator's first spoken message
   (utils/tours/tour_offer.js). Shown only in Speak Mode, and only to the person it was offered to
   (`tour_offer_user`), so a supervisor modeling on the same device never sees it. Leaving Speak Mode ends it.
   Handlers are bound in init because `{{on}}` calls them with no receiver (see components/app-toast.js). */
export default Component.extend({
  appState: service('app-state'),
  tagName: '',

  init() {
    this._super(...arguments);
    var self = this;
    this.start = function() { accept_tour_offer(self.get('appState')); };
    this.notNow = function() { dismiss_tour_offer(self.get('appState')); };
  },

  visible: computed('appState.{tour_offer_visible,speak_mode,tour_offer_user}', 'appState.currentUser.id', function() {
    var appState = this.get('appState');
    return !!(appState.get('tour_offer_visible') && appState.get('speak_mode') &&
      appState.get('currentUser.id') === appState.get('tour_offer_user'));
  }),

  _speakModeWatcher: observer('appState.speak_mode', function() {
    var self = this;
    if (this.get('appState.speak_mode')) { return; }
    window.setTimeout(function() {
      if (self.isDestroyed || self.isDestroying) { return; }
      if (!self.get('appState.speak_mode')) { end_speak_mode_tour_state(self.get('appState')); }
    }, LEFT_SPEAK_MODE_MS);
  })
});
