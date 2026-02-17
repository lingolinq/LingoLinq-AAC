import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default Route.extend({
  store: service('store'),
  model: function(params) {
    return this.store.findRecord('organization', 'my_org');
  },
  setupController: function(controller, model) {
    this.transitionTo('organization', model.get('id'));
  }
});
