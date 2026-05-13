import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default Route.extend({
  app_state: service('app-state'),

  model: function() {
    return this.app_state.get('currentUser');
  },

  setupController: function(controller, model) {
    controller.set('model', model);
    controller.refresh_lists();
  }
});
