import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import Subscription from '../utils/subscription';

export default Route.extend({
  appState: service('app-state'),
  model: function(params) {
    this.set('gift_id', params.id);
  },
  setupController: function(controller, model) {
    if(!this.appState.get('domain_settings.full_domain')) {
      controller.transitionToRoute('index');
      return;
    }
    controller.load_gift(this.get('gift_id'));
    Subscription.init();
  }
});
