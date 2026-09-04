import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

// Standalone home-board picker page (decoupled from the /setup wizard). Hosts
// the same board-picker content as the setup `board_category` step. Resolves
// `setup_user` from optional `user_id` query param (supervisor flow).
export default Route.extend({
  appState: service('app-state'),
  setupController: function(controller) {
    this._super.apply(this, arguments);
    // Gates `_resolve_setup_user` so it only drives `appState.setup_user` while
    // this route is on screen — see resetController for why that matters.
    controller.set('_route_active', true);
    controller.set('assigning_home_board', false);
    // Every entry re-offers the supervisor options overlay. Without this reset a
    // supporter who dismissed it once would never see it again this session —
    // the controller is a singleton, so `_options_dismissed` outlives the route.
    controller.set('_options_dismissed', false);
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
  /* `user_id` is a STICKY query param. Ember restores a controller's last value
     on any later transition that does not specify one, and this controller is a
     singleton, so without this reset a supporter who used the picker for a
     communicator (`?user_id=X`) got that same communicator again the next time
     they opened the picker from a link that passes no query at all —
     getting-started.hbs:52, modeling-ideas.hbs:89, guided-tour.js:556/633/800,
     create-board-new.js:1805, controllers/user/index.js:1537. The supervisor
     overlay then rendered and a pick meant for THEMSELVES was assigned to X.
     (dashboard-user-boards.hbs:44 and user/boards.hbs:97 pass `user_id=null`
     explicitly, which is what masked this on the common paths.) */
  resetController: function(controller, isExiting) {
    this._super.apply(this, arguments);
    if (!isExiting) { return; }
    /* FIRST: clearing `user_id` below notifies the `resolveSetupUser` observer,
       and Ember observers are async — it fires on the next flush, after this
       hook has returned. Without this flag that late pass would take the
       no-user_id branch and re-point `appState.setup_user` at the CURRENT user
       on a route we have already left. */
    controller.set('_route_active', false);
    controller.set('user_id', null);
    controller.set('setup_user', null);
    controller.set('other_user', null);
    this.appState.set('setup_user', null);
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
