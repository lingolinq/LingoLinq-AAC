import Route from '@ember/routing/route';
import { later as runLater } from '@ember/runloop';
import speecher from '../utils/speecher';
import { inject as service } from '@ember/service';

export default Route.extend({
  appState: service('app-state'),
  setupController: function(controller) {
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
  }
});
