import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

// Standalone home-board picker page (decoupled from the /setup wizard). Hosts
// the same board-picker content as the setup `board_category` step. Resolves
// `setup_user` from optional `user_id` query param (supervisor flow).
export default Route.extend({
  appState: service('app-state'),
  setupController: function(controller) {
    this._super.apply(this, arguments);
    controller.set('assigning_home_board', false);
  },
  activate: function() {
    this._super.apply(this, arguments);
    this.appState.set('tour_board_picker_active', true);
  },
  deactivate: function() {
    this._super.apply(this, arguments);
    this.appState.set('tour_board_picker_active', false);
    this.appState.set('setup_user', null);
    if (this.appState.controller) {
      this.appState.controller.set('setup_user_id', null);
    }
  }
});
