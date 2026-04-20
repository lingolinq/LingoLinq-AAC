import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default Route.extend({
  router: service('router'),

  model: function(params) {
    this.set('token', params.token);
  },

  setupController: function(controller, model) {
    this._super(controller, model);
    controller.set('token', this.get('token'));
    // Extract action from query params if present
    var action = controller.get('action');
    if (action) {
      controller.set('consent_action', action);
    }
    controller.load_request();
  }
});
