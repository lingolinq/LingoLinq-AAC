import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default Route.extend({
  session: service('session'),
  beforeModel() {
    if (!this.session.get('isAuthenticated')) {
      this.transitionTo('login');
    }
  },
  actions: {
    goToAgreement() {
      this.transitionTo('beta-welcome');
    }
  }
});
