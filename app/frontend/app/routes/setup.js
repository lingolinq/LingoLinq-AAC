import Route from '@ember/routing/route';
import app_state from '../utils/app_state';
import speecher from '../utils/speecher';

export default Route.extend({
  setupController: function(controller) {
    app_state.controller.set('setup_footer', true);
    app_state.controller.set('simple_board_header', true);
    app_state.controller.set('footer_status', null);
    app_state.controller.set('setup_order', controller.order);
    app_state.controller.set('setup_extra_order', controller.extra_order);
    var user = app_state.get('currentUser');
    app_state.set('show_intro', false);
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
