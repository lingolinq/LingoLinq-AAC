import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import app_state from '../utils/app_state';

export default Controller.extend({
  appState: service('app-state'),
  persistenceService: service('persistence'),
  stashesService: service('stashes'),
  sessionService: service('session'),
  modal: service(),

  update_selected: function() {
    var user = this.get('model');
    if(user && user.get('id') && app_state.controller) {
      app_state.controller.updateTitle();
    }
  },
  checkForBlankSlate: function() {
    if(this.get('model.id')) { return; }
    if(!this.get('homeBoards.length') && !this.get('homeBoards.loading') && !this.get('popularBoards.length') && !this.get('popularBoards.loading')) {
      // TODO: maybe hit a different endpoint?
    }
  },
  subscription_check: function() {
    // Check subscription status if needed
    var user = this.get('model');
    if(user && user.get('id')) {
      // subscription checks happen in the app_state or elsewhere
    }
  },
  update_current_badges: function() {
    // Update badges display
    var user = this.get('model');
    if(user && user.get('id')) {
      // badge updates happen through the user model
    }
  },
  actions: {
    hide_login: function() {
      this.appState.set('login_modal', false);
      var html = document.querySelector('html');
      var body = document.querySelector('body');
      if(html) { html.style.overflow = ''; }
      if(body) { body.style.overflow = ''; }
      var overlay = document.getElementById('login_overlay');
      if(overlay) { overlay.remove(); }
    },
    opening_index: function() {
      this.appState.set('index_view', true);
    },
    closing_index: function() {
      this.appState.set('index_view', false);
    }

  }
});
