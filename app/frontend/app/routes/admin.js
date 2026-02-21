import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default Route.extend({
  router: service('router'),
  store: service('store'),
  model: function(params) {
    return this.store.findRecord('organization', 'my_org');
  },
  setupController: function(controller, model) {
    this.router.transitionTo('organization', model.get('id'));
  }
});
