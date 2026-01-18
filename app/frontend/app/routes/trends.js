import Route from '@ember/routing/route';
import persistence from '../utils/persistence';

export default Route.extend({
  setupController: function(controller, model) {
    controller.load_trends();
  }
});
