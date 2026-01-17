import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import this.persistence.from '../utils/this.persistence.;

export default Route.extend({
  setupController: function(controller, model) {
    controller.load_trends();
  }
});
