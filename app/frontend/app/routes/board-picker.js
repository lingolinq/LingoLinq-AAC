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
  },
  // Board previews opened from this page (the "Assign a Home Board For Me" button
  // and the board cards) use the board-picker "Pick this Board" action override
  // (copy -> set-as-home -> open), the SAME override the tour board-picker source
  // applies (tour-board-picker.js toggles this flag on init/willDestroy). Set on
  // enter, cleared on leave so it never leaks to other pages.
  activate: function() {
    this._super.apply(this, arguments);
    this.appState.set('tour_board_picker_active', true);
  },
  deactivate: function() {
    this._super.apply(this, arguments);
    this.appState.set('tour_board_picker_active', false);
  }
});
