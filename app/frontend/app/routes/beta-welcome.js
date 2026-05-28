import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default Route.extend({
  session: service('session'),
  persistence: service('persistence'),
  appState: service('app-state'),
  beforeModel() {
    if (!this.session.get('isAuthenticated')) {
      this.transitionTo('login');
    }
  },
  setupController(controller) {
    controller.set('agreementAccepted', false);
  },
  actions: {
    acceptAgreement() {
      var controller = this.get('controller');
      if (!controller.get('agreementAccepted')) { return; }
      this.persistence.ajax('/api/v1/users/self', {
        type: 'PUT',
        data: { user: { preferences: { beta_agreement_accepted: true } } }
      }).then(() => {
        this.appState.return_to_index();
      }, () => {
        this.appState.return_to_index();
      });
    }
  }
});
