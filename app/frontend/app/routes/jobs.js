import Route from '@ember/routing/route';
import app_state from '../utils/app_state';

export default Route.extend({
  setupController: function(controller, model) {
    if(!app_state.get('domain_settings.full_domain')) {
      controller.transitionToRoute('index');
      return;
    }
  },
  activate: function() {
    this._super();
    window.scrollTo(0, 0);
  }
});
