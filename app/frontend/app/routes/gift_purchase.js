import Route from '@ember/routing/route';
import Subscription from '../utils/subscription';
import app_state from '../utils/app_state';

export default Route.extend({
  setupController: function(controller, model) {
    if(!app_state.get('domain_settings.full_domain')) {
      controller.transitionToRoute('index');
      return;
    }
    Subscription.init();
  }
});
