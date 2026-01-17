import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import speecher from '../utils/speecher';

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
    if(user && !user.get('preferences.progress.intro_watched')) {
      user.set('preferences.progress.intro_watched', true);
      user.save().then(null, function() { });
    }
    controller.update_on_page_change();
  },
  deactivate: function() {
    speecher.stop('all');
  }
});
