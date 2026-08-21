import Route from '@ember/routing/route';
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
  // A BLANKET block: as of 2026-08-15 no REACHABLE caller transitions here — controllers/application.js:1794 still does, but that is the retired wizard's own footer paging and is dead with the route. The two
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
    /* Redirect and STOP. This used to `return RSVP.reject({setup_retired: true})` — a
       non-Error POJO — relying on router_js classifying it as an abort. When that race
       is lost (or return_to_index hits its no-router branch) the rejection reaches the
       application error handler, which returns true, and the user typing /setup gets a
       "Failed to load" error page instead of their home page. A plain object also can't
       be classified by TransitionAborted checks, so the best case is an unhandled
       rejection in the console. A redirect guard should redirect, not reject. */
    this.appState.return_to_index();
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
