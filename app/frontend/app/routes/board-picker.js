import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

// Standalone home-board picker page (decoupled from the /setup wizard). Hosts
// the same board-picker content as the setup `board_category` step. The picker
// component scopes to `appState.currentUser` by default, so the only thing the
// controller needs is `setup_user` for the "Assign a Home Board For Me" action.
export default Route.extend({
  appState: service('app-state'),
  setupController: function(controller) {
    this._super.apply(this, arguments);
    controller.set('setup_user', this.appState.get('currentUser'));
    controller.set('assigning_home_board', false);
  }
});
