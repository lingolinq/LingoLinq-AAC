import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default Route.extend({
  router: service('router'),
  beforeModel: function() {
    this.router.replaceWith('demo.speak', { queryParams: { board: null, source: null } });
  }
});
