import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { alias } from '@ember/object/computed';
import { computed } from '@ember/object';

export default Controller.extend({
  appState: service('app-state'),
  store: service('store'),
  app_state: alias('appState'),

  hasCurrentUser: computed('appState.currentUser', 'appState', function() {
    var appState = this.get('appState');
    if (!appState) { return false; }
    return !!appState.get('currentUser');
  }),

  update_selected: function() {
    var user = this.get('model');
    if (user && user.get('id') && this.appState.controller) {
      this.appState.controller.updateTitle();
    }
  },

  checkForBlankSlate: function() {
    if (this.get('model.id')) { return; }
    if (!this.get('homeBoards.length') && !this.get('homeBoards.loading') && !this.get('popularBoards.length') && !this.get('popularBoards.loading')) {
      // Boards loaded by component when needed
    }
  },

  subscription_check: function() {
    // Subscription checks happen in app_state
  },

  update_current_badges: function() {
    // Badge updates via user model
  }
});
