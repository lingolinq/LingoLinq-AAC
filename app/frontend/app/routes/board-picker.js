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
    // Resolve setup_user on entry. The controller's observer fires only when
    // `user_id` or `appState.currentUser` CHANGES, which never happens for the self
    // flow (no user_id, currentUser already set) — so without this call setup_user
    // stayed null and "Assign a Home Board For Me" failed. See
    // controllers/board-picker#_resolve_setup_user.
    controller._resolve_setup_user();
  },
  activate: function() {
    this._super.apply(this, arguments);
    this.appState.set('tour_board_picker_active', true);
  },
  deactivate: function() {
    this._super.apply(this, arguments);
    this.appState.set('tour_board_picker_active', false);
    // Belt-and-braces reset of the in-flight pick flag (set by
    // board-preview-overlay#pick_for_home when "Pick this Board" starts copying).
    //
    // This is HARDENING, not a fix for a reproduced bug. Every promise branch in
    // pick_for_home has both a success and a failure handler, and all six land in
    // _finishPickForHome or _handlePickError, which clear the flag — so in normal
    // use this line is a no-op, and an attempt to strand the flag by abandoning a
    // pick mid-copy could not reproduce a leak.
    //
    // It is here because the failure mode is silent and session-wide if it ever
    // does happen: app-state#finish_global_transition skips
    // modal.close_board_preview() while this is true, so a stuck flag stops board
    // previews closing on every later route change. A promise that never settles
    // (a hung request with no timeout) is the one path not covered by those
    // handlers, and route teardown is the natural place to guarantee the reset.
    this.appState.set('board_picker_pick_in_progress', false);
    this.appState.set('setup_user', null);
    if (this.appState.controller) {
      this.appState.controller.set('setup_user_id', null);
    }
  }
});
