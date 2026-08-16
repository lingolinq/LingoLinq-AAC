import Route from '@ember/routing/route';
import RSVP from 'rsvp';
import { later as runLater } from '@ember/runloop';
import speecher from '../utils/speecher';
import { inject as service } from '@ember/service';

export default Route.extend({
  appState: service('app-state'),
  router: service('router'),

  // GUARD — the onboarding WIZARD is retired as a user-facing destination
  // (2026-08-15). Every UI entry point into it has been removed: the Extras card,
  // the dashboard Getting Started card, the user/index "Launch the wizard again"
  // link, the org People toast, and the post-terms / post-subscribe redirects
  // (which now land on the home page + guided tour instead). This closes the last
  // way in — typing /setup directly.
  //
  // The pages themselves are NOT deleted (decision confirmed 2026-08-15): the
  // wizard, controllers/setup.js, templates/setup.hbs and app/components/setup/**
  // all stay on disk. Only the ACCESS POINTS are closed off, so the flow can be
  // revived or reworked later without reconstructing it. Do not delete these files
  // without checking with Traci first.
  //
  // A BLANKET block: as of 2026-08-15 no code transitions here at all. The two
  // non-wizard modes this route also served are both closed off with it —
  //   • mode=layout   — the board symbol-layout editor. A distinct feature that
  //                     merely lives on this route; its only entry point
  //                     (components/board-actions.js `board_layout`) is commented
  //                     out. It is not being rehomed for now, so it is
  //                     intentionally not excepted here; `appState.board_layout_mode`
  //                     plus its reads in routes/user/board-detail.js and the
  //                     `close_board_layout` action (controllers/setup.js:828) stay
  //                     in place, dormant, alongside the pages.
  //   • mode=critical — the reduced post-tour subset (controllers/setup.js:41-49);
  //                     never had a caller in the frontend.
  // Nothing is stranded by refusing every mode, and a blanket guard means a stray
  // `/setup?mode=…` URL can't land a user in a half-retired wizard.
  //
  // Everything lands on the user's home page instead. Note that this route entry
  // must also stay in router.js even if the pages are ever deleted: `/:user_id` is
  // effectively a catch-all, so removing it would resolve /setup as a USER named
  // "setup" and show "Error loading user" rather than redirecting home.
  beforeModel: function() {
    this.appState.return_to_index();
    return RSVP.reject({ setup_retired: true });
  },
  setupController: function(controller) {
    if (controller.get('mode') === 'layout') {
      this.appState.controller.set('hide_header_force', true);
    }
    this.appState.controller.set('setup_footer', true);
    this.appState.controller.set('simple_board_header', true);
    this.appState.controller.set('footer_status', null);
    this.appState.controller.set('setup_order', controller.order);
    this.appState.controller.set('setup_extra_order', controller.extra_order);
    var user = this.appState.get('currentUser');
    this.appState.set('show_intro', false);
    // Only set intro_watched when editing self (no user_id or same as currentUser).
    // Defer save to next run loop so setup_user is set first and observers don't re-trigger saves.
    var user_id = controller.get('user_id');
    var editing_self = !user_id || (user && user.get('id') === user_id);
    if(user && editing_self && !user.get('preferences.progress.intro_watched')) {
      var preferences = user.get('preferences') || {};
      var progress = preferences.progress || {};
      user.set('preferences', preferences);
      user.set('preferences.progress', progress);
      user.set('preferences.progress.intro_watched', true);
      runLater(function() {
        user.save().then(null, function() { });
      }, 0);
    }
    controller.update_on_page_change();
  },
  deactivate: function() {
    speecher.stop('all');
    this.appState.set('board_layout_mode', null);
    this.appState.controller.set('hide_header_force', false);
  }
});
