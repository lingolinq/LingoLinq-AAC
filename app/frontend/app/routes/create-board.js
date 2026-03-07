import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default Route.extend({
  router: service(),

  activate() {
    this._super(...arguments);
    window.scrollTo(0, 0);
  },

  actions: {
    error(error, transition) {
      // On any error (e.g. component init throws), send user back to modern dashboard
      this.get('router').transitionTo('modern-dashboard');
      return false;
    }
  }
});
