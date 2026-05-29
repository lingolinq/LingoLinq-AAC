import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import config from '../config/environment';

export default Route.extend({
  session: service('session'),
  persistence: service('persistence'),
  appState: service('app-state'),
  beforeModel() {
    if (!this.session.get('isAuthenticated') && config.environment !== 'development') {
      this.transitionTo('login');
    }
  },
  activate() {
    this._super(...arguments);
    this.appState.controller.set('hide_header_force', true);
  },
  deactivate() {
    this._super(...arguments);
    this.appState.controller.set('hide_header_force', false);
  },
  setupController(controller) {
    this._super(...arguments);
    controller.set('agreementAccepted', false);
  },
  actions: {
    acceptAgreement() {
      var controller = this.get('controller');
      if (!controller.get('agreementAccepted')) { return; }
      if (!this.session.get('isAuthenticated')) {
        this.transitionTo('login');
        return;
      }
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
